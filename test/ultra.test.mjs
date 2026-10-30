// test/ultra.test.mjs — ultra（启发式 token 剪枝）移植的验证
// 覆盖：元数据契约 → 词表打分（#13454 极性词）→ pruneByScore → 结构化保护（B-ULTRA-CODE）
//       → 行内数学手写扫描器 → 引擎包装（四协议 / 幂等 / 短段 / 畸形输入）

import assert from "node:assert"
import { check, ctxFor, chatBody } from "./helpers.mjs"
import {
  apply,
  pruneByScore,
  pruneProseOnly,
  scoreToken,
  extractPreservedBlocks,
  resolveUltraConfig,
  validateUltraConfig,
  ULTRA_SCHEMA,
  DEFAULT_ULTRA_CONFIG,
  id,
  label,
  why,
  description,
  lossy,
  cacheImpact,
  defaultOn,
  stackPriority,
  isSingleMode,
  levels,
  available,
} from "../engines/ultra.js"

export const name = "ultra"

// 纯散文：无数字、无 URL、无代码，只有自然语言（否则会被结构化保护整体留下）。
const PROSE = [
  "The deployment pipeline is basically a sequence of steps that we really just run in order.",
  "It is important to understand that the configuration file must never be edited by hand.",
  "We should carefully check the logs before retrying the failed migration.",
  "The system will usually recover by itself after a short delay.",
  "Please note that the rollback procedure is not something you should skip.",
  "There are several things that you really ought to verify before you continue.",
].join(" ")

// 围栏代码：整块必须逐字活下来（B-ULTRA-CODE 回归）
const WITH_CODE = [
  "Here is the fix you should apply carefully before you retry.",
  "",
  "```js",
  "function normalize(a, b) {",
  "  if (!a) { return b + 1 }",
  "  return a",
  "}",
  "```",
  "",
  "That is basically all of it, and you really just need to run it once.",
].join("\n")

// 结构化片段：版本号 / URL / CONST_CASE
const STRUCTURED =
  "Deploy version 2.14.3 to https://example.com/app and set API_KEY before you really just continue. " +
  "The CONST_MAX_RETRY value matters here and you should always check it."

export function run() {
  // ─── M 组：元数据契约 ──────────────────────────────────────────────────
  {
    check("M-01 id", id === "ultra")
    check("M-02 label 用上游英文原名", label === "Ultra")
    check("M-03 why 是中文", typeof why === "string" && /[\u4e00-\u9fa5]/.test(why))
    check("M-04 description 逐字照抄上游", description === "Heuristic token pruning (+ optional SLM).")
    check("M-05 lossy", lossy === true)
    check("M-06 cacheImpact", cacheImpact === "high")
    check("M-07 defaultOn", defaultOn === false)
    check("M-08 stackPriority", stackPriority === 40)
    check("M-09 isSingleMode", isSingleMode === false)
    check("M-10 levels 未定义", levels === undefined)
    check("M-11 available", available === true)
    // 本移植没有 SLM 档，slmFallbackToAggressive 与 modelPath 两个键永远不生效，
    // 留在 configSchema 里只会让面板出现两个改了没反应的旋钮，所以移除。
    check("M-12 ULTRA_SCHEMA 四项（已移除两个无 SLM 的死键）", ULTRA_SCHEMA.length === 4)
    check(
      "M-13 ULTRA_SCHEMA 键名与上游一致（去掉两个 SLM 死键）",
      ULTRA_SCHEMA.map((f) => f.key).join(",") ===
        "enabled,compressionRate,minScoreThreshold,maxTokensPerMessage",
    )
    check("M-14 DEFAULT_ULTRA_CONFIG 默认值", DEFAULT_ULTRA_CONFIG.compressionRate === 0.5 && DEFAULT_ULTRA_CONFIG.minScoreThreshold === 0.3)
    // compressionRate 是「保留比例」，不是「剪掉比例」（上游 types.ts 原文：
    // "Fraction of tokens to keep after heuristic pruning"，代码直接把它当 keepRate 传给
    // pruneByScore）。标签曾经写成「剪枝比例」，语义正好相反：想压掉 75% 的人填 0.75，
    // 实际保留 75%、只省下约 6%。这两条守住标签与说明不再反向。
    check("M-15 compressionRate 标签是保留比例（不是剪枝比例）", ULTRA_SCHEMA.find((f) => f.key === "compressionRate").label === "保留比例")
    check(
      "M-16 compressionRate 说明写明 keep 语义",
      /保留/.test(ULTRA_SCHEMA.find((f) => f.key === "compressionRate").description) &&
        !/剪掉多少/.test(ULTRA_SCHEMA.find((f) => f.key === "compressionRate").description),
    )
  }

  // ─── S 组：token 打分（#13454 回归）────────────────────────────────────
  {
    check("S-01 极性词 never = 1.0", scoreToken("never") === 1.0)
    check("S-02 极性词 must = 1.0", scoreToken("must") === 1.0)
    check("S-03 极性词 not = 1.0", scoreToken("not") === 1.0)
    check("S-04 极性词 shouldn't = 1.0", scoreToken("shouldn't") === 1.0)
    check("S-05 stopword the = 0.1", scoreToken("the") === 0.1)
    check("S-06 含数字 = 1.0", scoreToken("v2") === 1.0)
    check("S-07 含点号 = 1.0（ultra 模式如此，relevance 刻意不用）", scoreToken("sentence.") === 1.0)
    check("S-08 两字符词 = 0.2", scoreToken("ab") === 0.2)
    check("S-09 首字母大写 = 0.8", scoreToken("Deploy") === 0.8)
    check("S-10 六字符以上 = 0.7", scoreToken("migration") === 0.7)
    check("S-11 其余 = 0.5", scoreToken("cat") === 0.5)
  }

  // ─── B 组：pruneByScore ───────────────────────────────────────────────
  {
    assert.strictEqual(pruneByScore("", 0.5, 0.3), "")
    assert.strictEqual(pruneByScore("keep me", 1, 0.3), "keep me")
    check("B-01 空文本原样", pruneByScore("", 0.5, 0.3) === "")
    check("B-02 keepRate >= 1 原样", pruneByScore("keep me", 1, 0.3) === "keep me")

    const pruned = pruneByScore(PROSE, 0.5, 0.3)
    check("B-03 散文被剪短", pruned.length < PROSE.length)
    check("B-04 极性词 never 留下", pruned.indexOf("never") >= 0)
    check("B-05 极性词 must 留下", pruned.indexOf("must") >= 0)
    check("B-06 长实词 migration 留下", pruned.indexOf("migration") >= 0)
    check("B-07 stopword 被大量剪掉", pruned.split(/\s+/).length < PROSE.split(/\s+/).length * 0.8)

    // 换行绝不被折叠（折叠会毁掉列表/标题/代码围栏）
    const lines = "First line of the note here.\nSecond line of the note here.\nThird line of the note here."
    const prunedLines = pruneByScore(lines, 0.5, 0.3)
    check("B-08 换行数不变", prunedLines.split("\n").length === 3, `实际 ${prunedLines.split("\n").length}`)

    // 保留率 1.0 → 一字不动；更低的 keepRate 只会更短（minScore 是主门禁，keepRate 是剪枝上限）
    check("B-09 keepRate 0.9 仍显著压缩", pruneByScore(PROSE, 0.9, 0.3).length < PROSE.length)
    const hard = pruneByScore(PROSE, 0.1, 0.3)
    check(
      "B-10 keepRate 0.1 不比 0.5 更长",
      hard.length <= pruned.length,
      `0.1 → ${hard.length}, 0.5 → ${pruned.length}`,
    )
  }

  // ─── C 组：结构化保护（B-ULTRA-CODE）──────────────────────────────────
  {
    const out = pruneProseOnly(WITH_CODE, 0.5, 0.3)
    check("C-01 围栏标记留下", out.indexOf("```js") >= 0)
    check("C-02 函数签名逐字留下", out.indexOf("function normalize(a, b) {") >= 0)
    check("C-03 代码内的 b) / { / + 未被剪", out.indexOf("if (!a) { return b + 1 }") >= 0)
    check("C-04 代码后的散文被剪", out.indexOf("really just need to run it once") === -1 || out.length < WITH_CODE.length)
    check("C-05 整体变短", out.length < WITH_CODE.length)

    const structured = pruneProseOnly(STRUCTURED, 0.5, 0.3)
    check("C-06 版本号留下", structured.indexOf("2.14.3") >= 0)
    check("C-07 URL 留下", structured.indexOf("https://example.com/app") >= 0)
    check("C-08 CONST_CASE 留下", structured.indexOf("CONST_MAX_RETRY") >= 0)

    // extractPreservedBlocks 的 kind 归类
    const codeBlocks = extractPreservedBlocks(WITH_CODE)
    check("C-09 围栏被识别为 fenced_code", codeBlocks.blocks.some((b) => b.kind === "fenced_code"))
    check("C-10 占位符含哨兵前缀", codeBlocks.text.indexOf("\u0000OMNI_CAVEMAN") >= 0)

    const fm = extractPreservedBlocks("---\ntitle: x\n---\nbody text")
    check("C-11 frontmatter 被识别", fm.blocks.some((b) => b.kind === "frontmatter"))

    const sr = extractPreservedBlocks("before <system-reminder>keep me</system-reminder> after")
    check("C-12 system-reminder 被识别", sr.blocks.some((b) => b.kind === "system_instruction"))
  }

  // ─── D 组：行内数学手写扫描器（替代 lookbehind 正则）─────────────────
  {
    const inline = extractPreservedBlocks("inline $x + y$ here")
    const inl = inline.blocks.filter((b) => b.kind === "math_inline")
    check("D-01 行内数学被识别", inl.length === 1)
    check("D-02 行内数学内容逐字", inl.length === 1 && inl[0].content === "$x + y$")

    const money = extractPreservedBlocks("cost is $5 and $10 total")
    check("D-03 数字开头的 $ 不算行内数学", money.blocks.filter((b) => b.kind === "math_inline").length === 0)

    const block = extractPreservedBlocks("$$E = mc^2$$")
    check("D-04 块级数学被识别", block.blocks.some((b) => b.kind === "math_block"))

    const doubled = extractPreservedBlocks("a $x$ b $y$ c")
    check("D-05 两个独立行内数学", doubled.blocks.filter((b) => b.kind === "math_inline").length === 2)

    const unterminated = extractPreservedBlocks("dangling $x + y here")
    check("D-06 未闭合不吞文本", unterminated.blocks.filter((b) => b.kind === "math_inline").length === 0)
  }

  // ─── E 组：引擎包装（chat）────────────────────────────────────────────
  {
    const body = chatBody([
      { role: "system", text: PROSE },
      { role: "user", text: PROSE },
      { role: "assistant", text: PROSE },
    ])
    const changed = apply(body, ctxFor("chat"), {})
    check("E-01 apply 返回 true", changed === true)
    check("E-02 system 段默认不动", body.messages[0].content === PROSE)
    check("E-03 user 段被压缩", body.messages[1].content.length < PROSE.length)
    check("E-04 assistant 段也被压缩", body.messages[2].content.length < PROSE.length)
    check("E-05 压缩后极性词仍在", body.messages[1].content.indexOf("never") >= 0)

    // preserveSystemPrompt: false → system 也压
    const body2 = chatBody([
      { role: "system", text: PROSE },
      { role: "user", text: PROSE },
    ])
    apply(body2, ctxFor("chat"), { preserveSystemPrompt: false })
    check("E-06 preserveSystemPrompt false 时 system 也压", body2.messages[0].content.length < PROSE.length)

    // 幂等：已带压缩标记的段跳过
    const marked = chatBody([{ role: "user", text: "[COMPRESSED: 50%] " + PROSE }])
    check("E-07 已压缩段跳过", apply(marked, ctxFor("chat"), {}) === false)

    // 短段跳过
    const short = chatBody([{ role: "user", text: "Short note here." }])
    check("E-08 maxTokensPerMessage 短段跳过", apply(short, ctxFor("chat"), { maxTokensPerMessage: 100 }) === false)

    // 无内容可压（单 token 文本剪不动）
    const tiny = chatBody([{ role: "user", text: "migration" }])
    check("E-09 单 token 文本返回 false", apply(tiny, ctxFor("chat"), {}) === false)

    // compressionRate 1.0 → 一字不动
    const full = chatBody([{ role: "user", text: PROSE }])
    check("E-10 compressionRate 1.0 不压", apply(full, ctxFor("chat"), { compressionRate: 1 }) === false)

    // 配置默认值
    const conf = resolveUltraConfig({})
    check(
      "E-11 resolveUltraConfig 默认值",
      conf.compressionRate === 0.5 && conf.minScoreThreshold === 0.3 && conf.maxTokensPerMessage === 0,
    )
    check("E-12 脏值回落", resolveUltraConfig({ compressionRate: "0.1" }).compressionRate === 0.5)
    check("E-13 校验通过", validateUltraConfig({ compressionRate: 0.5 }).valid === true)
    check("E-14 校验拒绝越界", validateUltraConfig({ compressionRate: 2 }).valid === false)
    check("E-15 校验拒绝类型错误", validateUltraConfig({ enabled: 1 }).valid === false)
  }

  // ─── X 组：畸形输入与四协议 ───────────────────────────────────────────
  {
    const bad = [
      null,
      undefined,
      0,
      "",
      "not a body",
      [],
      {},
      { messages: "not an array" },
      { messages: [null, 1, "x"] },
      { messages: [{ role: "user" }] },
      { messages: [{ role: "user", content: 123 }] },
    ]
    let threw = null
    let allFalse = true
    for (const b of bad) {
      try {
        if (apply(b, ctxFor("chat"), {}) !== false) allFalse = false
      } catch (e) {
        threw = e
      }
    }
    check("X-01 畸形 body 不抛", threw === null, threw ? String(threw) : "")
    check("X-02 畸形 body 全部返回 false", allFalse === true)
    check("X-03 未知协议返回 false", apply(chatBody([{ role: "user", text: PROSE }]), ctxFor("nope"), {}) === false)
    check("X-04 无 ctx 返回 false", apply(chatBody([{ role: "user", text: PROSE }]), undefined, {}) === false)
    check(
      "X-05 脏 cfg 不抛",
      (() => {
        try {
          apply(chatBody([{ role: "user", text: PROSE }]), ctxFor("chat"), "bad cfg")
          return true
        } catch {
          return false
        }
      })(),
    )

    // anthropic
    const anth = { messages: [{ role: "user", content: [{ type: "text", text: PROSE }] }] }
    check("X-06 anthropic 压缩", apply(anth, ctxFor("anthropic"), {}) === true)
    check("X-07 anthropic 写回", anth.messages[0].content[0].text.length < PROSE.length)

    // gemini
    const gem = { contents: [{ role: "user", parts: [{ text: PROSE }] }] }
    check("X-08 gemini 压缩", apply(gem, ctxFor("gemini"), {}) === true)
    check("X-09 gemini 写回", gem.contents[0].parts[0].text.length < PROSE.length)

    // responses
    const resp = { input: [{ type: "message", role: "user", content: [{ type: "input_text", text: PROSE }] }] }
    check("X-10 responses 压缩", apply(resp, ctxFor("responses"), {}) === true)
    check("X-11 responses 写回", resp.input[0].content[0].text.length < PROSE.length)
  }

  // ─── R 组：实测压缩率（长文本）────────────────────────────────────────
  {
    const long = PROSE + " " + PROSE + " " + PROSE
    const body = chatBody([{ role: "user", text: long }])
    const before = long.length
    apply(body, ctxFor("chat"), {})
    const after = body.messages[0].content.length
    const pct = ((before - after) / before) * 100
    console.log(`  info  ultra 实测：${before} → ${after} 字符，压缩 ${pct.toFixed(1)}%`)
    check("R-01 压缩率在合理区间", pct > 20 && pct < 90, `实际 ${pct.toFixed(1)}%`)
  }

  // ─── R 组补：compressionRate 的方向（保留比例，数值越低剪得越狠）──────────
  // 标签文字可以被改错，但行为不会说谎：0.9 保留 90% 几乎不剪，0.3 保留 30% 剪得多。
  // 上游 types.ts 把这个键定义为 "fraction of tokens to keep"，引擎直接当 keepRate 用。
  //
  // 注意 0.5 → 0.3 会**饱和**：pruneByScore 只剪 score < minScoreThreshold（0.3）的
  // token，可剪池一旦被掏空，keepRate 再低也没有东西可剪。所以这里断言的是「单调不减」
  // 而不是「严格递减」——keepRate 是剪枝量的上限，minScore 才是资格门槛，谁紧听谁的。
  {
    const long = PROSE + " " + PROSE + " " + PROSE
    const savedAt = (rate) => {
      const body = chatBody([{ role: "user", text: long }])
      apply(body, ctxFor("chat"), { compressionRate: rate })
      return long.length - body.messages[0].content.length
    }
    const keep90 = savedAt(0.9)
    const keep50 = savedAt(0.5)
    const keep30 = savedAt(0.3)
    console.log(`  info  省下字符 keep0.9=${keep90} keep0.5=${keep50} keep0.3=${keep30}`)
    check("R-02 保留比例越低剪得越多或持平（keep 语义，非严格递减：受 minScore 资格门槛饱和）", keep30 >= keep50 && keep50 >= keep90)
    check("R-03 保留 90% 时几乎不剪（远少于保留 30%）", keep90 * 2 < keep30, `0.9→${keep90}, 0.3→${keep30}`)
    check("R-04 保留比例 ≥1 时完全不动", savedAt(1) === 0)
  }
}
