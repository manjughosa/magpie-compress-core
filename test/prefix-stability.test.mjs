// test/prefix-stability.test.mjs — 压缩必须是前缀稳定的。
//
// magpie 每个请求都拿完整原文重新压一次（客户端保存的永远是原文），所以同一条
// 消息在第 N 次请求里被压成什么，在第 N+1 次请求里（它已成历史）必须逐字节一样。
// 只要有一个字节变了，provider 的 prompt cache 就从改动处断开：后面每一段都从
// cache read 变成 cache write。这是 review 里 blocking 第 2 条的验收条件。

import { onRequest } from "../compress-core.middleware.js"
import { check } from "./helpers.mjs"

export const name = "prefix stability"

const FILL = (n, fill) => {
  let s = ""
  while (s.length < n) s += fill.repeat(9) + " "
  return s.slice(0, n)
}

// 客户端手里的原文：逐轮增长，每轮带能被压缩的白空格、重复段和工具结果。
function transcript() {
  const rows = Array.from({ length: 8 }, (_, i) => ({ id: i + 1, name: "row" + (i + 1), ok: i % 2 === 0 }))
  const t = []
  for (let i = 1; i <= 5; i++) {
    t.push({ role: "user", content: `第 ${i} 问\n\n\n\n${FILL(240, "q")}` })
    if (i % 2 === 1) {
      t.push({
        role: "assistant",
        content: [{ type: "tool_use", id: "t" + i, name: "sql", input: { q: "select " + i } }],
      })
      t.push({
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "t" + i, content: JSON.stringify(rows) }],
      })
    }
    t.push({ role: "assistant", content: `第 ${i} 答\n\n\n\t${FILL(240, "a")}` })
  }
  t.push({ role: "user", content: `最后一问\n\n\n\n${FILL(240, "z")}` })
  return t
}

const send = (messages, options) => {
  const body = { model: "claude-sonnet-4", messages: JSON.parse(JSON.stringify(messages)) }
  const ctx = { protocol: "anthropic", model: body.model, stream: false, path: "", options, state: {}, reject() {} }
  const out = onRequest(body, ctx)
  return JSON.parse(JSON.stringify((out ?? body).messages))
}

// 逐轮增长原文，每一步都把上一次发出的整个 messages 当作这一次的前缀来比对。
function driftOf(options) {
  const raw = transcript()
  let previous = null
  for (let n = 1; n <= raw.length; n++) {
    const sent = send(raw.slice(0, n), options)
    if (previous) {
      const upto = previous.length
      if (JSON.stringify(sent.slice(0, upto)) !== JSON.stringify(previous)) {
        return { turn: n, at: firstDifference(previous, sent) }
      }
    }
    previous = sent
  }
  return null
}

function firstDifference(previous, sent) {
  for (let i = 0; i < previous.length; i++) {
    if (JSON.stringify(previous[i]) !== JSON.stringify(sent[i])) return i
  }
  return previous.length
}

// 稳妥档（headline safe preset）就是这四个：lossy: false 且默认开的引擎。
// 有损引擎（caveman / aggressive / ultra / llm / ionizer / rtk / codex-responses）
// 不在验收范围内：它们按语义改写历史本身，aggressive 会随消息年龄加深压缩，
// 同一段历史在不同轮次本就可能不同。它们默认关着。
const ENGINE_KEYS = [
  "ccr",
  "lite",
  "headroom",
  "session-dedup",
  "rtk",
  "codex-responses",
  "caveman",
  "ionizer",
  "aggressive",
  "ultra",
  "llm",
]
const SAFE = { ccr: true, lite: true, headroom: true, "session-dedup": true }
// 每个键都显式写出来：缺省的键会回落到引擎自己的 defaultOn，那会让别的引擎偷偷进来。
const ONLY = (name) => ({ strategies: Object.fromEntries(ENGINE_KEYS.map((k) => [k, k === name])) })

export async function run() {
  // 插件默认（headline safe preset）—— review 要求的就是这一档开箱即稳。
  let d = driftOf({})
  check("默认预设：改写的轮次里前缀始终逐字节不变", !d, d ? `第 ${d.turn} 轮消息 #${d.at} 被改写` : "")

  // 稳妥档显式写一遍，免得插件默认值变了这组断言跟着失去意义。
  d = driftOf({ strategies: SAFE })
  check("稳妥档（ccr + lite + headroom + session-dedup）前缀始终逐字节不变", !d, d ? `第 ${d.turn} 轮消息 #${d.at} 被改写` : "")

  // 保守模式不是前缀稳定的，这正是它不再是默认的原因：一条消息从「当前轮」滑成
  // 「历史」的那一轮会被改写一次，从那里往后缓存全部作废。
  d = driftOf({ strategies: { ...SAFE, lite: { preserveCurrentTurn: true } } })
  check("保守模式会给缓存制造一次 miss（所以默认不用它）", !!d, d ? "" : "expected drift")

  // 逐个引擎：每一档单独开启时都必须稳定。
  for (const engine of Object.keys(SAFE)) {
    d = driftOf(ONLY(engine))
    check(`仅 ${engine}：前缀始终逐字节不变`, !d, d ? `第 ${d.turn} 轮消息 #${d.at} 被改写` : "")
  }
}