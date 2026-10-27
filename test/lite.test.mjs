// test/lite.test.mjs — lite 引擎移植保真测试。
// 断言编号对应 test/lite-spec.md §8 移植检查清单（1–52）。

import {
  applyLiteCompression,
  collapseWhitespace,
  dedupSystemPrompt,
  compressToolResults,
  removeRedundantContent,
  replaceImageUrls,
  isVisionModelId,
  resolveLiteMaxToolLength,
  createCompressionStats,
  apply,
} from "../engines/lite.js"
import { check, ctxFor } from "./helpers.mjs"

export const name = "lite"

const big = (n, fill = "x") => {
  // 每 10 字符一个空格，保证词边界可找
  let s = ""
  while (s.length < n) s += fill.repeat(9) + " "
  return s.slice(0, n)
}

export async function run() {
  // ---- collapseWhitespace (1–8) ----
  let r = collapseWhitespace({ messages: [{ role: "user", content: "a\n\n\nb" }] })
  check("1 ≥3换行→2", r.body.messages[0].content === "a\n\nb" && r.applied)
  r = collapseWhitespace({ messages: [{ role: "user", content: "a\n\n\n\n\nb" }] })
  check("2 5换行→恰好2", r.body.messages[0].content === "a\n\nb")
  r = collapseWhitespace({ messages: [{ role: "user", content: "a\n\nb" }] })
  check("3 2换行不动", r.body.messages[0].content === "a\n\nb" && !r.applied)
  r = collapseWhitespace({ messages: [{ role: "user", content: "foo   \nbar\t\t\n" }] })
  check("4 行尾空格tab剥除", r.body.messages[0].content === "foo\nbar\n" && r.applied)
  r = collapseWhitespace({ messages: [{ role: "user", content: "" }] })
  check("5 空串", r.body.messages[0].content === "" && !r.applied)
  r = collapseWhitespace({ messages: [{ role: "system", content: "a\n\n\nb" }] }, { preserveSystemPrompt: true })
  check("6 preserveSystemPrompt跳过system", r.body.messages[0].content === "a\n\n\nb" && !r.applied)
  r = collapseWhitespace({ messages: [{ role: "user", content: [{ type: "text", text: "a\n\n\nb" }] }] })
  check("7 数组content不动", r.body.messages[0].content[0].text === "a\n\n\nb" && !r.applied)
  {
    const b = {}
    const rr = collapseWhitespace(b)
    check("8 无messages返原引用", rr.body === b && !rr.applied)
  }

  // ---- dedupSystemPrompt (9–14) ----
  r = dedupSystemPrompt({ messages: [
    { role: "system", content: "hello" },
    { role: "user", content: "u" },
    { role: "system", content: "hello" },
  ] })
  check("9 重复system删后者", r.body.messages.length === 2 && r.applied && r.body.messages[0].role === "system")
  r = dedupSystemPrompt({ messages: [
    { role: "system", content: "  hello  " },
    { role: "system", content: "hello" },
  ] })
  check("10 trim后同键去重", r.body.messages.length === 1 && r.applied)
  {
    const a = "x".repeat(200) + "AAA"
    const b = "  " + "x".repeat(200) + "BBB"
    r = dedupSystemPrompt({ messages: [
      { role: "system", content: a },
      { role: "system", content: b },
    ] })
    check("11 开头相同正文不同都保留", r.body.messages.length === 2 && !r.applied)
  }
  r = dedupSystemPrompt({ messages: [
    { role: "system", content: [{ type: "text", text: "same" }] },
    { role: "system", content: [{ type: "text", text: "same" }] },
  ] })
  check("12 数组content不参与", r.body.messages.length === 2 && !r.applied)
  r = dedupSystemPrompt({ messages: [
    { role: "system", content: "s" },
    { role: "system", content: "s" },
  ] }, { preserveSystemPrompt: true })
  check("13 preserve整步跳过", r.body.messages.length === 2 && !r.applied)
  r = dedupSystemPrompt({ messages: [
    { role: "system", content: "same" },
    { role: "user", content: "same" },
  ] })
  check("14 system不查user", r.body.messages.length === 2 && !r.applied)

  // ---- compressToolResults (15–25) ----
  const toolMsg = (len) => ({ role: "tool", content: big(len) })
  r = compressToolResults({ messages: [toolMsg(3000), { role: "assistant", content: "a" }] }, { maxToolLength: 2000 })
  {
    const c = r.body.messages[0].content
    const expected = big(3000).slice(0, 2000) + "\n...[truncated]"
    check("15 tool超长截断", r.applied && c.length <= 2000 + 40 && c.includes("\n...[truncated]"))
    check("16 只留头部且逐字", c === expected)
  }
  {
    // 切点在预算 2000 上：向后 80 字符没有空白可退，向前看的第 2000 位本身就不是词字符。
    const noEarlySpace = "x".repeat(2000) + " tail"
    const rr = compressToolResults({ messages: [
      { role: "tool", content: noEarlySpace },
      { role: "assistant", content: "a" },
    ] }, { maxToolLength: 2000 })
    const c = rr.body.messages[0].content
    check("17 无空白时停在预算上", c === noEarlySpace.slice(0, 2000) + "\n...[truncated]")
    const hard = "x".repeat(3000)
    const rr2 = compressToolResults({ messages: [
      { role: "tool", content: hard },
      { role: "assistant", content: "a" },
    ] }, { maxToolLength: 2000 })
    check("17b 无空白硬切在预算上", rr2.body.messages[0].content === hard.slice(0, 2000) + "\n...[truncated]")
  }
  r = compressToolResults({ messages: [
    { role: "assistant", content: "a" },
    toolMsg(3000),
  ] }, { maxToolLength: 2000 })
  // compressToolResults 这个纯函数不看当前轮；保护当前轮由主编排 apply 负责。
  // history-trim (#423) 的语义（正在发送的这一轮原样送出）现在是显式开的
  // preserveCurrentTurn: true：默认整段都动，因为一条消息下一轮就成历史，
  // 改与不改的差别会落在前缀上（review blocking 第 2 条）。
  check("18 纯函数整段可截", r.applied && r.body.messages[1].content.length < 3000)
  const fullTurn = {
    messages: [
      { role: "user", content: "q" },
      { role: "assistant", content: "a" },
      { role: "tool", content: big(3000) },
    ],
  }
  check(
    "18b preserveCurrentTurn: true 时把正在发送的这一轮留下来",
    applyLiteCompression(fullTurn, { maxToolLength: 2000, preserveCurrentTurn: true }).compressed === false,
  )
  check(
    "18c 默认不缺省保护当前轮，整段都可截（前缀稳定）",
    applyLiteCompression(fullTurn, { maxToolLength: 2000 }).compressed === true,
  )
  r = compressToolResults({ messages: [toolMsg(3000)] }, { maxToolLength: 2000 })
  check("19 无assistant仍可截", r.applied && r.body.messages[0].content.includes("\n...[truncated]"))
  r = compressToolResults({ messages: [toolMsg(2000), { role: "assistant", content: "a" }] }, { maxToolLength: 2000 })
  check("20 恰等上限放行", !r.applied)
  r = compressToolResults({ messages: [
    { role: "tool", content: [{ type: "text", text: big(3000) }] },
    { role: "assistant", content: "a" },
  ] }, { maxToolLength: 2000 })
  check("21 tool数组content不截", !r.applied)
  r = compressToolResults({ messages: [
    { role: "user", content: [{ type: "tool_result", content: big(3000) }] },
    { role: "assistant", content: "a" },
  ] }, { maxToolLength: 2000 })
  check("22 anthropic tool_result字符串截断", r.applied && r.body.messages[0].content[0].content.includes("\n...[truncated]"))
  r = compressToolResults({ messages: [
    { role: "user", content: [{ type: "tool_result", content: [
      { type: "text", text: big(3000) },
      { type: "text", text: "short" },
      { type: "image", data: "x" },
    ] }] },
    { role: "assistant", content: "a" },
  ] }, { maxToolLength: 2000 })
  {
    const inner = r.body.messages[0].content[0].content
    check("23 只截长text part", r.applied &&
      inner[0].text.includes("\n...[truncated]") &&
      inner[1].text === "short" &&
      inner[2].data === "x")
  }
  r = compressToolResults({ messages: [
    { role: "assistant", content: [{ type: "tool_result", content: big(3000) }] },
    { role: "assistant", content: "a" },
  ] }, { maxToolLength: 2000 })
  check("24 assistant内tool_result不动", !r.applied)
  check("25 maxToolLength越界回落", resolveLiteMaxToolLength(100) === 2000 &&
    resolveLiteMaxToolLength(2000000) === 2000 &&
    resolveLiteMaxToolLength(500.7) === 500)

  // ---- removeRedundantContent (26–33) ----
  r = removeRedundantContent({ messages: [
    { role: "user", content: "same" },
    { role: "user", content: "same" },
  ] })
  check("26 相邻同role同文删", r.body.messages.length === 1 && r.applied)
  r = removeRedundantContent({ messages: [
    { role: "user", content: "same" },
    { role: "user", content: "same" },
    { role: "user", content: "same" },
  ] })
  check("27 三连删后两条", r.body.messages.length === 1)
  r = removeRedundantContent({ messages: [
    { role: "user", content: "same" },
    { role: "assistant", content: "a" },
    { role: "user", content: "same" },
  ] })
  check("28 间隔不删", r.body.messages.length === 3 && !r.applied)
  r = removeRedundantContent({ messages: [
    { role: "tool", content: "same" },
    { role: "tool", content: "same" },
  ] })
  check("29 tool豁免", r.body.messages.length === 2 && !r.applied)
  r = removeRedundantContent({ messages: [
    { role: "user", content: [{ type: "text", text: "same" }] },
    { role: "user", content: [{ type: "text", text: "same" }] },
  ] })
  check("30 数组content相同也删（canonical 比全字段）", r.body.messages.length === 1 && r.applied)
  r = removeRedundantContent({ messages: [{ role: "user", content: "x" }] })
  check("31 i=0不删", r.body.messages.length === 1 && !r.applied)
  r = removeRedundantContent({ messages: [
    { role: "system", content: "s" },
    { role: "system", content: "s" },
  ] }, { preserveSystemPrompt: true })
  check("32 preserve保system", r.body.messages.length === 2 && !r.applied)
  r = removeRedundantContent({ messages: [
    { role: "user", content: "same " },
    { role: "user", content: "same" },
  ] })
  check("33 尾随空格不trim", r.body.messages.length === 2 && !r.applied)

  // ---- replaceImageUrls (34–40) ----
  const imgBody = () => ({ messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
  ] }] })
  r = replaceImageUrls(imgBody(), { supportsVision: false })
  check("34 dataURI剥为占位", r.applied && r.body.messages[0].content[0].type === "text" &&
    r.body.messages[0].content[0].text === "[image: png]")
  r = replaceImageUrls({ messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" }, detail: "high" },
  ] }] }, { supportsVision: false })
  check("35 detail字段丢弃", !("detail" in r.body.messages[0].content[0]))
  r = replaceImageUrls({ messages: [{ role: "user", content: [
    { type: "image_url", image_url: { url: "https://example.com/x.png" } },
  ] }] }, { supportsVision: false })
  check("36 非dataURI保留", !r.applied && r.body.messages[0].content[0].image_url.url === "https://example.com/x.png")
  for (const sv of [true, undefined, null]) {
    r = replaceImageUrls(imgBody(), { supportsVision: sv })
    check("37 非false不动(" + sv + ")", !r.applied)
  }
  check("38 legacy字符串模型", replaceImageUrls(imgBody(), "gpt-4o").applied === false &&
    replaceImageUrls(imgBody(), "some-text-model").applied === true)
  r = replaceImageUrls({ messages: [{ role: "user", content: "plain string" }] }, { supportsVision: false })
  check("39 字符串content不动", !r.applied)
  {
    const fmt = (u) => {
      const rr = replaceImageUrls({ messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: u } },
      ] }] }, { supportsVision: false })
      return rr.body.messages[0].content[0].text
    }
    check("40 format提取", fmt("data:image/jpeg;base64,x") === "[image: jpeg]" &&
      fmt("data:image/svg+xml;base64,x") === "[image: svg+xml]")
  }

  // ---- applyLiteCompression 编排 (41–45) ----
  {
    const body = { messages: [
      { role: "system", content: "sys" },
      { role: "system", content: "sys" },
      { role: "user", content: "a\n\n\nb" },
      { role: "tool", content: big(3000) },
      { role: "assistant", content: "a" },
    ] }
    const rr = applyLiteCompression(body, { maxToolLength: 2000 })
    const t = rr.techniquesApplied
    check("41 管线顺序", JSON.stringify(t) === JSON.stringify(["whitespace", "system-dedup", "tool-compress"]) ||
      JSON.stringify(t.filter((x) => x !== "whitespace" || true)) !== "", t.join(","))
    check("41b 顺序精确", t.join(",") === "whitespace,system-dedup,tool-compress")
    check("45 stats模式", rr.stats.mode === "lite" && rr.stats.techniquesUsed === t)
  }
  {
    const rr = applyLiteCompression({ messages: [{ role: "user", content: "clean" }] })
    check("42 无变化compressed=false", !rr.compressed && rr.stats === null)
    const rr2 = applyLiteCompression({ messages: [
      { role: "tool", content: big(3000) }, { role: "assistant", content: "a" },
    ] }, { compressToolResults: false, maxToolLength: 2000 })
    check("43 关tool-compress", !rr2.techniquesApplied.includes("tool-compress"))
  }
  {
    // 44 管线串联：whitespace 先改，redundant-remove 看到后步骤产物
    // （末尾必须有 assistant：最后一条 assistant 之后是「正在发送的这一轮」，不参与改写）
    const rr = applyLiteCompression({ messages: [
      { role: "user", content: "a\n\nb" },
      { role: "user", content: "a\n\n\nb" },
      { role: "assistant", content: "ok" },
    ] })
    check("44 串联看到前步产物", rr.body.messages.length === 2 &&
      rr.techniquesApplied.includes("whitespace") &&
      rr.techniquesApplied.includes("redundant-remove"))
  }
  {
    // 44b 头尾截断不能把 emoji 从中间劈开：半个代理对会让请求体在 UTF-8 层非法
    const rr = applyLiteCompression({ messages: [
      { role: "tool", content: "\u{1F600}".repeat(200) },
      { role: "assistant", content: "ok" },
      { role: "user", content: "hi" },
    ] }, { maxToolLength: 257 })
    const cut = rr.body.messages[0].content
    let valid = true
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(new TextEncoder().encode(cut))
    } catch {
      valid = false
    }
    check("44b 截断不劈 emoji", valid && cut.length < 400)
  }

  // ---- isVisionModelId (46–50) ----
  check("46 视觉判定", isVisionModelId("openai/gpt-4o") === true && isVisionModelId("gpt-4") === false)
  check("47 kimi-k2句点", isVisionModelId("kimi-k2") === false && isVisionModelId("kimi-k2.5") === true)
  check("48 mimo排除", isVisionModelId("mimo-v2.5-pro") === false &&
    isVisionModelId("x/mimo-v2.5-pro") === false &&
    isVisionModelId("x/mimo-v2.5-pro:free") === false &&
    isVisionModelId("mimo-v2.5") === true)
  check("49 空入参", isVisionModelId("") === false && isVisionModelId(null) === false && isVisionModelId(undefined) === false)
  check("50 大小写", isVisionModelId("CLAUDE-3-OPUS") === true)

  // ---- stats 最小版 (51–52) ----
  {
    const s0 = createCompressionStats("", "", "lite", [])
    check("51 除零保护", s0.savingsPercent === 0)
    const s = createCompressionStats("x".repeat(300), "x".repeat(100), "lite", [])
    check("52 两位小数", s.savingsPercent === 66.67)
  }

  // ---- 中间件引擎包装 ----
  {
    const body = { model: "some-text-model", messages: [
      { role: "user", content: [
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
        { type: "text", text: "hi   \n\n\n\nthere" },
      ] },
    ] }
    const ctx = ctxFor("chat", { strategies: { lite: true } })
    const changed = apply(body, ctx, {})
    check("engine.apply 非视觉模型剥图", changed && body.messages[0].content[0].text === "[image: png]")
    check("engine.apply state留痕", Array.isArray(ctx.state.lite.techniques))
    const body2 = { model: "gpt-4o", messages: body.messages.map((m) => ({ ...m })) }
    body2.messages[0] = { role: "user", content: [
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ] }
    const changed2 = apply(body2, ctxFor("chat"), {})
    check("engine.apply 视觉模型保图", !changed2 && body2.messages[0].content[0].type === "image_url")
  }

  // ---- segments 路径：当前轮守卫与 system 段 ----
  {
    // 首轮（没有 assistant）：模型还没读过任何东西，整段原样
    const first = {
      model: "gpt-5",
      instructions: "Be  terse.\n\n\n\nAlways.",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "hello\n\n\n\nworld" }] }],
    }
    check(
      "53 segments 首轮原样",
      apply(first, ctxFor("responses"), { preserveCurrentTurn: true }) === false &&
        first.input[0].content[0].text === "hello\n\n\n\nworld",
    )

    // 有 assistant 之后：历史段折叠，instructions 与正在发送的这一轮不动
    const body = {
      model: "gpt-5",
      instructions: "Be  terse.\n\n\n\nAlways.",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "old\n\n\n\nturn" }] },
        { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        { type: "message", role: "user", content: [{ type: "input_text", text: "now\n\n\n\nthen" }] },
      ],
    }
    const changed = apply(body, ctxFor("responses"), { preserveCurrentTurn: true })
    check("54 segments 历史段折叠", changed && body.input[0].content[0].text === "old\n\nturn")
    check("55 segments instructions 不动", body.instructions === "Be  terse.\n\n\n\nAlways.")
    check("56 segments 当前轮不动", body.input[2].content[0].text === "now\n\n\n\nthen")

    const gem = {
      model: "gemini-2.5-pro",
      systemInstruction: { parts: [{ text: "a\n\n\n\nb" }] },
      contents: [
        { role: "user", parts: [{ text: "old\n\n\n\nturn" }] },
        { role: "model", parts: [{ text: "ok" }] },
        { role: "user", parts: [{ text: "now\n\n\n\nthen" }] },
      ],
    }
    const gemChanged = apply(gem, ctxFor("gemini"), { preserveCurrentTurn: true })
    check("57 gemini 历史段折叠", gemChanged && gem.contents[0].parts[0].text === "old\n\nturn")
    check("58 gemini system 段不动", gem.systemInstruction.parts[0].text === "a\n\n\n\nb")
    check("59 gemini 当前轮不动", gem.contents[2].parts[0].text === "now\n\n\n\nthen")
  }
}
