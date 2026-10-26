// test/llm.test.mjs — llm 引擎移植测试（占位实现：无 backend 即 no-op）。
// 覆盖：无 backend 时原样返回 / 注入 backend 后压缩散文且代码块不动 / 后端异常 fail-open /
//       minTokens 门槛 / 墓碑化还原 / 畸形输入不抛 / 元数据（available=false）。

import {
  apply,
  applyAsync,
  setLlmCompressorBackend,
  getLlmCompressorBackend,
  hasLlmCompressorBackend,
  extractPreservedBlocks,
  restorePreservedBlocks,
  findFencedCodeBlocks,
  id,
  label,
  lossy,
  cacheImpact,
  defaultOn,
  stackPriority,
  isSingleMode,
  levels,
  available,
  configSchema,
} from "../engines/llm.js"
import { check, ctxFor, bodyChars, chatBody } from "./helpers.mjs"

export const name = "llm"

// 纯散文（不含数字/括号/点号标识符，避免被墓碑化吃掉，便于验证"真的外发了"）
const PROSE =
  "the quick brown fox jumps over the lazy dog and keeps running through the forest while nothing else happens at all ".repeat(
    80
  )

const FENCED = "```js\nconst secret = 42\nconsole.log(secret)\n```"

export async function run() {
  // ---- 元数据 ----
  check("1 id", id === "llm")
  check("2 label", label === "LLM Compressor")
  check("3 lossy/cacheImpact/defaultOn", lossy === true && cacheImpact === "high" && defaultOn === false)
  check("4 stackPriority 取源码值 38", stackPriority === 38)
  check("5 isSingleMode/levels", isSingleMode === false && levels === undefined)
  check("6 available=false（无 backend 即 no-op）", available === false)
  check(
    "7 configSchema 只有 maxChars",
    configSchema.length === 1 &&
      configSchema[0].key === "maxChars" &&
      configSchema[0].defaultValue === 4000 &&
      configSchema[0].min === 500 &&
      configSchema[0].max === 20000
  )
  check("8 初始没有 backend", getLlmCompressorBackend() === null && hasLlmCompressorBackend() === false)

  // ---- 无 backend：原样返回 ----
  const body = chatBody([
    { role: "system", text: "system prompt" },
    { role: "user", text: PROSE },
    { role: "assistant", text: "acknowledged" },
  ])
  const snapshot = JSON.stringify(body)
  const before = bodyChars(body)
  check("9 无 backend：apply 返回 false", apply(body, ctxFor("chat"), {}) === false)
  const r1 = await applyAsync(body, ctxFor("chat"), {})
  check("10 无 backend：applyAsync compressed=false", r1.compressed === false)
  check("11 无 backend：body 一字未动", JSON.stringify(body) === snapshot && bodyChars(body) === before)

  // ---- 注入 backend：压缩散文 ----
  setLlmCompressorBackend(async (text) => text.slice(0, 60))
  check("12 注入后 hasLlmCompressorBackend", hasLlmCompressorBackend() === true)

  const body2 = chatBody([
    { role: "system", text: "system prompt" },
    { role: "user", text: PROSE },
    { role: "assistant", text: "acknowledged" },
  ])
  const before2 = bodyChars(body2)
  const r2 = await applyAsync(body2, ctxFor("chat"), {})
  check("13 有 backend：compressed=true", r2.compressed === true)
  check("14 有 backend：体积变小", bodyChars(body2) < before2, `${before2} → ${bodyChars(body2)}`)
  console.log(
    `        [实测] llm(注入 slice-60 backend) 压缩率 ${(((before2 - bodyChars(body2)) / before2) * 100).toFixed(1)}% (${before2} → ${bodyChars(body2)} chars)`
  )
  check("15 system 段不动", body2.messages[0].content === "system prompt")
  check("16 同步 apply 仍是 pass-through", apply(body2, ctxFor("chat"), {}) === false)

  // ---- 代码块墓碑化：物理上不外发 ----
  let sawFence = false
  setLlmCompressorBackend(async (text) => {
    if (text.includes("const secret")) sawFence = true
    return text.slice(0, 80)
  })
  const body3 = chatBody([
    { role: "user", text: PROSE + "\n" + FENCED + "\n" + PROSE },
    { role: "assistant", text: "done" },
  ])
  const r3 = await applyAsync(body3, ctxFor("chat"), {})
  const outText = body3.messages[0].content
  check("17 含代码块的消息仍能压", r3.compressed === true)
  check("18 代码块未外发给后端", sawFence === false)
  check("19 代码块原样回填", outText.includes("const secret = 42") && outText.includes("```js"))
  check("20 围栏外的散文被压缩", outText.length < PROSE.length + FENCED.length + 2)

  // ---- 后端异常 fail-open ----
  setLlmCompressorBackend(async () => {
    throw new Error("backend down")
  })
  const body4 = chatBody([{ role: "user", text: PROSE }])
  const snap4 = JSON.stringify(body4)
  let threw = false
  let r4 = null
  try {
    r4 = await applyAsync(body4, ctxFor("chat"), {})
  } catch {
    threw = true
  }
  check("21 后端抛错不冒泡", threw === false && r4.compressed === false)
  check("22 后端抛错时 body 不变", JSON.stringify(body4) === snap4)

  // ---- 后端返回更长 → 不算压缩 ----
  setLlmCompressorBackend(async (text) => text + text)
  const body5 = chatBody([{ role: "user", text: PROSE }])
  const r5 = await applyAsync(body5, ctxFor("chat"), {})
  check("23 返回更长不采纳", r5.compressed === false)

  // ---- 后端返回非字符串 ----
  setLlmCompressorBackend(async () => 12345)
  const body6 = chatBody([{ role: "user", text: PROSE }])
  const r6 = await applyAsync(body6, ctxFor("chat"), {})
  check("24 返回非字符串不采纳", r6.compressed === false)

  // ---- minTokens 门槛（2000 tokens ≈ 8000 字符）----
  setLlmCompressorBackend(async (text) => text.slice(0, 10))
  const shortBody = chatBody([{ role: "user", text: "short prose only" }])
  const rShort = await applyAsync(shortBody, ctxFor("chat"), {})
  check("25 低于 minTokens 跳过", rShort.compressed === false && shortBody.messages[0].content === "short prose only")

  // ---- maxChars 窗口 ----
  const seen = []
  setLlmCompressorBackend(async (text) => {
    seen.push(text.length)
    return text.slice(0, 100)
  })
  const body7 = chatBody([{ role: "user", text: PROSE }])
  await applyAsync(body7, ctxFor("chat"), { maxChars: 500 })
  check("26 maxChars 生效（分窗口外发）", seen.length > 1 && seen.every((n) => n <= 500), JSON.stringify(seen))
  const seenClamped = []
  setLlmCompressorBackend(async (text) => {
    seenClamped.push(text.length)
    return text.slice(0, 100)
  })
  const body8 = chatBody([{ role: "user", text: PROSE }])
  await applyAsync(body8, ctxFor("chat"), { maxChars: 1 })
  check(
    "27 maxChars 下界夹到 500",
    seenClamped.length > 1 && seenClamped.every((n) => n <= 500),
    JSON.stringify(seenClamped)
  )

  // ---- 墓碑化还原 ----
  const tricky =
    FENCED +
    "\nand `inline()` plus https://example.com/x and process.env.HOME and MyConstName with src/app/main.ts"
  const { text: tombstoned, blocks } = extractPreservedBlocks(tricky)
  check("28 墓碑化产生占位符", blocks.length > 0 && tombstoned !== tricky)
  check("29 占位符不外泄代码", !tombstoned.includes("const secret"))
  check("30 还原后与原文一致", restorePreservedBlocks(tombstoned, blocks) === tricky)
  check("31 findFencedCodeBlocks", findFencedCodeBlocks(tricky).length === 1)

  // ---- 畸形输入不抛 ----
  setLlmCompressorBackend(null)
  let badThrew = false
  let allBool = true
  for (const bad of [null, undefined, 0, "string", [], { messages: null }, { messages: [null, 1] }]) {
    try {
      const out = apply(bad, ctxFor("chat"), {})
      if (typeof out !== "boolean") allBool = false
      await applyAsync(bad, ctxFor("chat"), {})
    } catch {
      badThrew = true
    }
  }
  check("32 畸形输入不抛", badThrew === false)
  check("33 畸形输入返回布尔", allBool)
  check("34 未知协议返回 false", apply({ messages: [{ role: "user", content: "x" }] }, ctxFor("nope"), {}) === false)
  check("35 无参数返回 false", apply() === false)
  check("36 setLlmCompressorBackend(null) 复位", getLlmCompressorBackend() === null)
}
