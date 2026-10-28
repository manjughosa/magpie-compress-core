// test/body-limit.test.mjs — 超大 body 一致地原样通过。
//
// 为什么存在：钩子只有 250 ms，而对 20 MB 的 body 来说，光是 JSON.stringify
// 就要 70 ms 上下，任何引擎都还没看它一眼。所以超过 maxBytes 的 body 一个引擎
// 都不跑。选尺寸、不选时钟，是因为尺寸是确定的：同一份 body 每次都得到同一个
// 判断，它贡献给上游提示词缓存的前缀就不动；换成截止时间，同一份 body 会这次
// 原样发出去、下次压缩了发出去，那才是缓存杀手。

import { onRequest } from "../compress-core.middleware.js"
import { runPipeline, byteLength, roughByteLength, DEFAULT_MAX_BODY_BYTES } from "../pipeline.js"
import { check } from "./helpers.mjs"

export const name = "body limit (a body too large goes out untouched, every time)"

const STRATEGIES = { "session-dedup": false, lite: true, headroom: true }

// 一条巨长的消息，里面全是 lite 爱折叠的空白：构造快，而且只要引擎跑过，
// 结果就不可能还等于原文。
function hugeBody(bytes) {
  return { messages: [{ role: "user", content: "a\n\n\n\n".repeat(Math.ceil(bytes / 5)) }] }
}

export async function run() {
  check("默认门限是 8 MB", DEFAULT_MAX_BODY_BYTES === 8_000_000)

  const big = hugeBody(DEFAULT_MAX_BODY_BYTES + 1_000_000)
  const shown = JSON.stringify(big)

  // roughByteLength 是判断用的尺子：不做 stringify，也不算 UTF-8 字节。
  const rough = roughByteLength(big)
  const exact = byteLength(big)
  check("尺子永远不会超过真字节", rough <= exact, `${rough} vs ${exact}`)
  check("这份 body 真的过了门限", exact > DEFAULT_MAX_BODY_BYTES)

  const first = JSON.parse(shown)
  const firstCtx = { protocol: "anthropic", options: { strategies: STRATEGIES } }
  const firstTelemetry = runPipeline(first, { ...firstCtx }, firstCtx.options)
  check("超限的 body 一个字节都没动", JSON.stringify(first) === shown)
  check("遥测说它太大了", firstTelemetry.tooLarge === true && firstTelemetry.maxBytes === DEFAULT_MAX_BODY_BYTES)
  check("每个引擎都报 body_too_large", firstTelemetry.strategies.every((s) => s.reason === "body_too_large" && s.status === "skipped"))
  check("省下 0 字节", firstTelemetry.savedBytes === 0 && firstTelemetry.savedPct === 0)

  // 同一份 body 再来一次：结果必须逐字节相同 —— 这是尺寸门限替代时钟的理由。
  const second = JSON.parse(shown)
  const secondCtx = { protocol: "anthropic", options: { strategies: STRATEGIES } }
  runPipeline(second, { ...secondCtx }, secondCtx.options)
  check("两次跑出同一个 body", JSON.stringify(second) === JSON.stringify(first))

  // 走钩子也是原样：端到端一条路。
  const throughHook = JSON.parse(shown)
  const hookOut = onRequest(throughHook, { protocol: "anthropic", options: { strategies: STRATEGIES } })
  check("经过 onRequest 也是原样", JSON.stringify(hookOut) === shown)

  // 门限以下照常干活。
  const small = hugeBody(200_000)
  const smallShown = JSON.stringify(small)
  const smallCtx = { protocol: "anthropic", options: { strategies: STRATEGIES } }
  const smallTelemetry = runPipeline(small, { ...smallCtx }, smallCtx.options)
  check("门限以下没有被拦", smallTelemetry.tooLarge === undefined)
  check("门限以下真的压了", JSON.stringify(small).length < smallShown.length)

  // 门限可以自己定，写小了立刻生效。
  const tiny = JSON.parse(smallShown)
  const tinyCtx = { protocol: "anthropic", options: { strategies: STRATEGIES, maxBytes: 1000 } }
  const tinyTelemetry = runPipeline(tiny, { ...tinyCtx }, tinyCtx.options)
  check("maxBytes 写小了就拦", tinyTelemetry.tooLarge === true && tinyTelemetry.maxBytes === 1000)
  check("拦下来也是原样", JSON.stringify(tiny) === smallShown)
}