// test/aggressive.test.mjs — aggressive 引擎移植测试。
// 覆盖：能压 / 无内容返回 false / 畸形输入不抛 / 分档老化 / 结构化内容守卫 /
//       system 与最近轮次保护 / 摘要器单元行为 / 幂等（第二次不再动）。

import {
  apply,
  summarizeText,
  compressToolResult,
  isCodeLikeLine,
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
} from "../engines/aggressive.js"
import { check, ctxFor, bodyChars, chatBody, segmentsOf } from "./helpers.mjs"

export const name = "aggressive"

// 长 assistant 文本：含路径与报错，摘要器有东西可抽
function longAssistant(turn) {
  const lines = []
  lines.push(`Fix: turn ${turn} failed while reading src/module${turn}/handler.ts`)
  for (let i = 0; i < 12; i++) {
    lines.push(`Step ${i} of turn ${turn}: read the config, then patch the handler and re-run.`)
  }
  lines.push(`TypeError: cannot read property 'x' of undefined at src/module${turn}/handler.ts:42`)
  return lines.join("\n")
}

function buildBody(turns = 12) {
  const entries = [{ role: "system", text: "You are a helpful coding agent. ".repeat(20) }]
  for (let t = 0; t < turns; t++) {
    entries.push({ role: "user", text: `Fix: please handle case ${t} in src/module${t}/handler.ts` })
    entries.push({ role: "assistant", text: longAssistant(t) })
  }
  return chatBody(entries)
}

export async function run() {
  // ---- 元数据 ----
  check("1 id", id === "aggressive")
  check("2 label", label === "Aggressive")
  check("3 lossy/cacheImpact/defaultOn", lossy === true && cacheImpact === "high" && defaultOn === false)
  check("4 stackPriority=30", stackPriority === 30)
  check("5 isSingleMode/levels", isSingleMode === false && levels === undefined)
  check("6 available", available === true)
  check(
    "7 configSchema 两字段",
    Array.isArray(configSchema) &&
      configSchema.length === 2 &&
      configSchema[0].key === "keepTurns" &&
      configSchema[0].defaultValue === 4 &&
      configSchema[1].key === "summaryChars" &&
      configSchema[1].defaultValue === 400
  )

  // ---- 能压 ----
  const body = buildBody(12)
  const before = bodyChars(body)
  const changed = apply(body, ctxFor("chat"), {})
  const after = bodyChars(body)
  check("8 能压：apply 返回 true", changed === true)
  check("9 能压：体积变小", after < before, `${before} → ${after}`)
  console.log(
    `        [实测] aggressive 压缩率 ${(((before - after) / before) * 100).toFixed(1)}% (${before} → ${after} chars)`
  )

  const segs = segmentsOf(body, "chat")
  const marked = segs.filter((s) => s.text.startsWith("[COMPRESSED:aging:"))
  check("10 有老化标记", marked.length > 0, `marked=${marked.length}`)
  check(
    "11 档位标记只出现 light/moderate/fullSummary",
    marked.every((s) => /^\[COMPRESSED:aging:(light|moderate|fullSummary)\]/.test(s.text))
  )

  // system 段与最近轮次原样
  check("12 system 段不动", segs[0].text.startsWith("You are a helpful coding agent."))
  const lastAssistant = segs[segs.length - 1]
  check("13 最后一条 assistant 原样", lastAssistant.text === longAssistant(11))
  const lastUser = segs[segs.length - 2]
  check("14 最后一条 user 原样", lastUser.text === "Fix: please handle case 11 in src/module11/handler.ts")

  // 幂等：已标记的片段不再处理
  const changedAgain = apply(body, ctxFor("chat"), {})
  check("15 幂等：第二次返回 false", changedAgain === false)

  // keepTurns 越小，进入"老化"的片段越多（第 ③ 步的超大片段摘要与年龄无关，所以比标记数）
  const bodyA = buildBody(8)
  apply(bodyA, ctxFor("chat"), { keepTurns: 1, summaryChars: 120 })
  const bodyB = buildBody(8)
  apply(bodyB, ctxFor("chat"), { keepTurns: 8, summaryChars: 120 })
  const agedA = segmentsOf(bodyA, "chat").filter((s) => s.text.startsWith("[COMPRESSED:aging:")).length
  const agedB = segmentsOf(bodyB, "chat").filter((s) => s.text.startsWith("[COMPRESSED:aging:")).length
  check("16 keepTurns 越小老化片段越多", agedA > agedB, `keepTurns1=${agedA} keepTurns8=${agedB}`)

  // ---- 无内容 → false ----
  check("17 空 messages 返回 false", apply({ messages: [] }, ctxFor("chat"), {}) === false)
  check("18 无 messages 字段返回 false", apply({}, ctxFor("chat"), {}) === false)
  check("19 未知协议返回 false", apply(buildBody(4), ctxFor("nope"), {}) === false)
  check("20 无参数返回 false", apply() === false)

  // ---- 畸形输入不抛 ----
  const malformed = [
    null,
    undefined,
    0,
    "string",
    [],
    { messages: null },
    { messages: "nope" },
    { messages: [null, 1, "x", { role: "user" }] },
    { messages: [{ role: "user", content: { not: "string" } }] },
    { messages: [{ role: "assistant", content: [1, 2, 3] }] },
  ]
  let threw = false
  let allBool = true
  for (const bad of malformed) {
    try {
      const r = apply(bad, ctxFor("chat"), {})
      if (typeof r !== "boolean") allBool = false
    } catch {
      threw = true
    }
  }
  check("21 畸形输入不抛", threw === false)
  check("22 畸形输入返回布尔", allBool)

  // ---- 结构化内容守卫 ----
  const jsonSeg = '{"a":1,"b":[2,3],"nested":{"c":"d"}}'
  const fencedSeg = "```js\n" + "const a = 1\n".repeat(40) + "```"
  const guardBody = chatBody([
    { role: "user", text: "go" },
    { role: "assistant", text: jsonSeg },
    { role: "user", text: "again" },
    { role: "assistant", text: fencedSeg },
    { role: "user", text: "latest" },
  ])
  apply(guardBody, ctxFor("chat"), { keepTurns: 1 })
  const guardSegs = segmentsOf(guardBody, "chat")
  check("23 纯 JSON 片段不加标记", guardSegs[1].text === jsonSeg)
  check("24 代码围栏片段不加标记", guardSegs[3].text === fencedSeg)

  // ---- 工具结果压缩 ----
  const codeLines = []
  for (let i = 0; i < 60; i++) codeLines.push(`const value${i} = compute(${i})`)
  const toolBody = chatBody([
    { role: "user", text: "read the file" },
    { role: "tool", text: codeLines.join("\n") },
    { role: "user", text: "thanks" },
  ])
  const toolChanged = apply(toolBody, ctxFor("chat"), {})
  const toolText = segmentsOf(toolBody, "chat")[1].text
  check("25 工具结果被压缩", toolChanged === true && toolText.includes("lines elided"), toolText.slice(0, 60))
  check("26 工具结果保留首尾代码行", toolText.startsWith("const value0") && toolText.includes("const value59"))

  // ---- 四协议 ----
  const anthropic = {
    model: "m",
    system: "sys prompt",
    messages: [
      { role: "user", content: "fix src/a.ts" },
      { role: "assistant", content: [{ type: "text", text: longAssistant(0) }] },
      { role: "user", content: "now src/b.ts" },
      { role: "assistant", content: [{ type: "text", text: longAssistant(1) }] },
      { role: "user", content: "now src/c.ts" },
      { role: "assistant", content: [{ type: "text", text: longAssistant(2) }] },
      { role: "user", content: "now src/d.ts" },
      { role: "assistant", content: [{ type: "text", text: longAssistant(3) }] },
      { role: "user", content: "now src/e.ts" },
      { role: "assistant", content: [{ type: "text", text: longAssistant(4) }] },
      { role: "user", content: "latest question" },
    ],
  }
  const anthropicChanged = apply(anthropic, ctxFor("anthropic"), { keepTurns: 1 })
  check("27 anthropic 协议能压", anthropicChanged === true)
  check("28 anthropic system 不动", anthropic.system === "sys prompt")

  const responses = {
    model: "m",
    input: [
      { role: "user", content: [{ type: "input_text", text: "fix src/a.ts" }] },
      { role: "assistant", content: [{ type: "output_text", text: longAssistant(0) }] },
      { role: "user", content: [{ type: "input_text", text: "latest" }] },
    ],
  }
  let responsesChanged = false
  try {
    responsesChanged = apply(responses, ctxFor("responses"), { keepTurns: 1 })
  } catch {
    responsesChanged = "threw"
  }
  check("29 responses 协议不抛", responsesChanged === true || responsesChanged === false)

  const gemini = {
    contents: [
      { role: "user", parts: [{ text: "fix src/a.ts" }] },
      { role: "model", parts: [{ text: longAssistant(0) }] },
      { role: "user", parts: [{ text: "latest" }] },
    ],
  }
  let geminiChanged = false
  try {
    geminiChanged = apply(gemini, ctxFor("gemini"), { keepTurns: 1 })
  } catch {
    geminiChanged = "threw"
  }
  check("30 gemini 协议不抛", geminiChanged === true || geminiChanged === false)

  // ---- 摘要器单元 ----
  const s = summarizeText(
    [
      { role: "user", text: "Fix: patch src/app/main.ts and rerun the suite" },
      { role: "assistant", text: "Edited src/app/main.ts\nTypeError: boom at src/app/main.ts:9" },
    ],
    { maxLen: 200, preserveCode: true }
  )
  check("31 摘要以 [COMPRESSED:summary] 开头", s.startsWith("[COMPRESSED:summary]"))
  check("32 摘要含 Intents", s.includes("Intents: Fix: patch src/app/main.ts"))
  check("33 摘要含 Files touched", s.includes("Files touched:") && s.includes("src/app/main.ts"))
  check("34 摘要含 Errors", s.includes("Errors:") && s.includes("TypeError: boom"))
  check("35 摘要含 Last decision", s.includes("Last decision:"))
  check("36 空输入摘要为空串", summarizeText([]) === "")
  check("37 已标记文本被过滤", summarizeText([{ role: "assistant", text: "[COMPRESSED:x] y" }]) === "")
  const fenceTrim = summarizeText(
    [{ role: "assistant", text: "done\n```js\n" + "line\n".repeat(30) + "```" }],
    { maxLen: 400, preserveCode: true }
  )
  check("38 围栏代码被裁剪", fenceTrim.includes("…") && !fenceTrim.includes("line\nline\nline\nline"))

  // ---- 工具压缩器单元 ----
  check("39 isCodeLikeLine 正例", isCodeLikeLine("  const a = 1") && isCodeLikeLine("function f() {"))
  check("40 isCodeLikeLine 反例", !isCodeLikeLine("hello world"))
  const jsonBig = JSON.stringify({ items: Array.from({ length: 40 }, (_, i) => i), note: "x".repeat(3000) })
  const jsonRes = compressToolResult(jsonBig)
  check("41 JSON 工具结果被摘要", jsonRes.strategy === "json" && jsonRes.compressed.length < jsonBig.length)
  const errRes = compressToolResult(
    "Error: something failed\n" + Array.from({ length: 40 }, (_, i) => `    at frame${i} (a.js:${i})`).join("\n")
  )
  check("42 错误栈被裁剪", errRes.strategy === "errorMessage" && errRes.compressed.includes("frames elided"))
  const plain = compressToolResult("just some plain words without structure")
  check("43 无策略命中返回 none", plain.strategy === "none" && plain.saved === 0)
}
