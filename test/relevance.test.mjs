// test/relevance.test.mjs — relevance（抽取式句打分）移植的验证
// 覆盖：元数据契约 → 关键坑回归（SENTENCE_PRESERVE_RE 不许匹配普通句号）
//       → 单段算法（force-preserve / budget / 保底 / 原序）→ 引擎包装（四协议 / 畸形输入）

import assert from "node:assert"
import { check, ctxFor, chatBody } from "./helpers.mjs"
import {
  apply,
  applyRelevanceToText,
  SENTENCE_PRESERVE_RE,
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
} from "../engines/relevance/index.js"
import { resolveRelevanceConfig, validateRelevanceConfig, RELEVANCE_SCHEMA } from "../engines/relevance/config.js"
import { scoreSentences } from "../engines/relevance/scorer.js"
import { scoreToken } from "../engines/ultra.js"

export const name = "relevance"

// 一条待压缩的长 user 消息：混了空话句、强制保留句、与 query 相关的句。
const LONG_USER = [
  "Please note that the deployment is basically fine.",
  "The migration failed with a TypeError: cannot read property 'id' of undefined.",
  "We should really just check the logs carefully.",
  "Set DATABASE_URL=postgres://localhost/app before retrying.",
  "It is important to understand that things are essentially clear.",
  "The rollback takes 42 seconds on average.",
].join(" ")

const QUERY = "Why did the migration fail and what should I check in the logs?"

export function run() {
  // ─── M 组：元数据契约 ──────────────────────────────────────────────────
  {
    check("M-01 id", id === "relevance")
    check("M-02 label 用上游英文原名", label === "Relevance")
    check("M-03 why 是中文一句话", typeof why === "string" && why.length > 0 && /[\u4e00-\u9fa5]/.test(why))
    check("M-04 description 逐字照抄上游", description === "Extractive sentence scoring against the last user query.")
    check("M-05 lossy", lossy === true)
    check("M-06 cacheImpact", cacheImpact === "moderate")
    check("M-07 defaultOn", defaultOn === false)
    check("M-08 stackPriority", stackPriority === 18)
    check("M-09 isSingleMode", isSingleMode === false)
    check("M-10 levels 未定义", levels === undefined)
    check("M-11 available", available === true)
    check("M-12 configSchema 四项", RELEVANCE_SCHEMA.length === 4)
    check(
      "M-13 configSchema 键名与上游一致",
      RELEVANCE_SCHEMA.map((f) => f.key).join(",") === "enabled,overlapThreshold,budgetPercent,boilerplateWeight",
    )
  }

  // ─── P 组：关键坑回归 —— 不许复用 ultraHeuristic 的 FORCE_PRESERVE_RE ──
  {
    const plain = "This is a completely normal sentence with no numbers at all."
    // relevance 的模式必须放过普通句子（否则 force-preserve 吃光全部句子 → 永久 no-op）
    check("P-01 SENTENCE_PRESERVE_RE 不匹配普通句号", SENTENCE_PRESERVE_RE.test(plain) === false)
    // 对照：ultra 的模式会命中句号（这就是不能复用的原因）
    check("P-02 ultra 的 FORCE_PRESERVE_RE 确实会命中句号", scoreToken("sentence.") === 1.0)
    // relevance 模式该命中的结构化信号
    check("P-03 命中数字", SENTENCE_PRESERVE_RE.test("retry 3 times") === true)
    check("P-04 命中 URL", SENTENCE_PRESERVE_RE.test("see https://x.dev/a") === true)
    check("P-05 命中 Error 前缀", SENTENCE_PRESERVE_RE.test("TypeError: bad") === true)
    check("P-06 命中代码围栏", SENTENCE_PRESERVE_RE.test("```js") === true)
    check("P-07 命中 stack at 帧", SENTENCE_PRESERVE_RE.test("    at Object.run (x.js:1)") === true)
    check("P-08 命中多段路径", SENTENCE_PRESERVE_RE.test("look in /usr/local/bin/") === true)
    check("P-09 命中 key=value", SENTENCE_PRESERVE_RE.test("export TOKEN=abc") === true)
  }

  // ─── C 组：配置 ────────────────────────────────────────────────────────
  {
    const d = resolveRelevanceConfig({})
    check(
      "C-01 默认值 0.1 / 0.5 / 0.5",
      d.overlapThreshold === 0.1 && d.budgetPercent === 0.5 && d.boilerplateWeight === 0.5,
    )
    check("C-02 默认 enabled false", d.enabled === false)
    const o = resolveRelevanceConfig({ overlapThreshold: 0.4, budgetPercent: 0.8, boilerplateWeight: 0 })
    check(
      "C-03 用户值覆盖",
      o.overlapThreshold === 0.4 && o.budgetPercent === 0.8 && o.boilerplateWeight === 0,
    )
    check("C-04 脏值回落默认", resolveRelevanceConfig({ overlapThreshold: "0.4" }).overlapThreshold === 0.1)
    check("C-05 null cfg 不抛", resolveRelevanceConfig(null).budgetPercent === 0.5)
    check("C-06 校验通过", validateRelevanceConfig({ overlapThreshold: 0.2 }).valid === true)
    check("C-07 校验拒绝越界", validateRelevanceConfig({ budgetPercent: 1.5 }).valid === false)
    check("C-08 校验拒绝类型错误", validateRelevanceConfig({ enabled: "yes" }).valid === false)
  }

  // ─── A 组：单段算法 ────────────────────────────────────────────────────
  {
    check("A-01 空 query → 全 0 分", scoreSentences(["a b c"], "", resolveRelevanceConfig({}))[0] === 0)
    check("A-02 空 sentences → []", scoreSentences([], "q", resolveRelevanceConfig({})).length === 0)

    const cfg = resolveRelevanceConfig({})
    const single = applyRelevanceToText("Only one sentence here.", QUERY, cfg)
    check("A-03 单句不压", single.changed === false && single.result === "Only one sentence here.")

    const empty = applyRelevanceToText("", QUERY, cfg)
    check("A-04 空文本不抛", empty.changed === false && empty.result === "")

    const noQuery = applyRelevanceToText(LONG_USER, "", cfg)
    check("A-05 无 query 不压", noQuery.changed === false && noQuery.result === LONG_USER)

    const r = applyRelevanceToText(LONG_USER, QUERY, cfg)
    check("A-06 长文本被压缩", r.changed === true && r.result.length < LONG_USER.length)
    check("A-07 强制保留 TypeError 句", r.result.indexOf("TypeError:") >= 0)
    check("A-08 强制保留 key=value 句", r.result.indexOf("DATABASE_URL=") >= 0)
    check("A-09 强制保留数字句", r.result.indexOf("42 seconds") >= 0)
    check("A-10 与 query 相关的句留下", r.result.indexOf("check the logs") >= 0)
    check("A-11 低分空话句被删（1）", r.result.indexOf("basically fine") === -1)
    check("A-12 低分空话句被删（2）", r.result.indexOf("essentially clear") === -1)
    // 原序：TypeError 句在 DATABASE_URL 句之前，DATABASE_URL 句在 rollback 句之前
    check(
      "A-13 输出保持原始句序",
      r.result.indexOf("TypeError:") < r.result.indexOf("DATABASE_URL=") &&
        r.result.indexOf("DATABASE_URL=") < r.result.indexOf("42 seconds"),
    )
    // budgetPercent 拉到 1.0 且 threshold 归零 → 全部句子都在 budget 内，不应丢句
    const keepAll = applyRelevanceToText(
      LONG_USER,
      QUERY,
      resolveRelevanceConfig({ budgetPercent: 1, overlapThreshold: 0 }),
    )
    check("A-14 budget 1.0 + threshold 0 保留全部句子", keepAll.changed === false)
  }

  // ─── E 组：引擎包装（chat） ────────────────────────────────────────────
  {
    const body = chatBody([
      { role: "system", text: "You are a helpful assistant." },
      { role: "user", text: LONG_USER },
      { role: "assistant", text: "Sure, I will look into it." },
      { role: "user", text: QUERY },
    ])
    const changed = apply(body, ctxFor("chat"), {})
    check("E-01 apply 返回 true", changed === true)
    check("E-02 user 段被压缩", body.messages[1].content.length < LONG_USER.length)
    check("E-03 system 段不动", body.messages[0].content === "You are a helpful assistant.")
    check("E-04 assistant 段不动", body.messages[2].content === "Sure, I will look into it.")
    check("E-05 单句 query 段不动", body.messages[3].content === QUERY)
    check("E-06 强制保留句仍在", body.messages[1].content.indexOf("TypeError:") >= 0)

    // 无 user 段 → false
    const noUser = chatBody([
      { role: "system", text: "sys" },
      { role: "assistant", text: "hi" },
    ])
    check("E-07 无 user 段返回 false", apply(noUser, ctxFor("chat"), {}) === false)

    // 只有一条 user 且是单句 → false
    const oneUser = chatBody([{ role: "user", text: "One single sentence only." }])
    check("E-08 单句 user 返回 false", apply(oneUser, ctxFor("chat"), {}) === false)

    // query 段是纯空白 → 视为无 query
    const blankQuery = chatBody([
      { role: "user", text: LONG_USER },
      { role: "user", text: "   " },
    ])
    check("E-09 空白 query 返回 false", apply(blankQuery, ctxFor("chat"), {}) === false)

    // 配置可从 cfg 传入
    const tight = chatBody([
      { role: "user", text: LONG_USER },
      { role: "user", text: QUERY },
    ])
    check("E-10 cfg 生效", apply(tight, ctxFor("chat"), { overlapThreshold: 0.99 }) === true)
    check("E-11 高阈值下只留强制保留句", tight.messages[0].content.indexOf("check the logs") === -1)
  }

  // ─── X 组：畸形输入与四协议 ────────────────────────────────────────────
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
      { messages: [{ role: "user", content: [] }] },
    ]
    let threw = null
    let allFalse = true
    for (const b of bad) {
      try {
        const out = apply(b, ctxFor("chat"), {})
        if (out !== false) allFalse = false
      } catch (e) {
        threw = e
      }
    }
    check("X-01 畸形 body 不抛", threw === null, threw ? String(threw) : "")
    check("X-02 畸形 body 全部返回 false", allFalse === true)
    check("X-03 未知协议返回 false", apply(chatBody([{ role: "user", text: LONG_USER }]), ctxFor("nope"), {}) === false)
    check("X-04 无 ctx 返回 false", apply(chatBody([{ role: "user", text: LONG_USER }]), undefined, {}) === false)
    check(
      "X-05 脏 cfg 不抛",
      (() => {
        try {
          apply(chatBody([{ role: "user", text: LONG_USER }]), ctxFor("chat"), "bad cfg")
          return true
        } catch {
          return false
        }
      })(),
    )

    // anthropic
    const anth = {
      system: "sys prompt",
      messages: [
        { role: "user", content: [{ type: "text", text: LONG_USER }] },
        { role: "user", content: [{ type: "text", text: QUERY }] },
      ],
    }
    check("X-06 anthropic 压缩", apply(anth, ctxFor("anthropic"), {}) === true)
    check("X-07 anthropic 写回 content block", anth.messages[0].content[0].text.length < LONG_USER.length)

    // gemini
    const gem = {
      contents: [
        { role: "user", parts: [{ text: LONG_USER }] },
        { role: "user", parts: [{ text: QUERY }] },
      ],
    }
    check("X-08 gemini 压缩", apply(gem, ctxFor("gemini"), {}) === true)
    check("X-09 gemini 写回 parts", gem.contents[0].parts[0].text.length < LONG_USER.length)

    // responses
    const resp = {
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: LONG_USER }] },
        { type: "message", role: "user", content: [{ type: "input_text", text: QUERY }] },
      ],
    }
    check("X-10 responses 压缩", apply(resp, ctxFor("responses"), {}) === true)
    check("X-11 responses 写回 input_text", resp.input[0].content[0].text.length < LONG_USER.length)
  }

  // ─── R 组：实测压缩率 ──────────────────────────────────────────────────
  {
    const body = chatBody([
      { role: "user", text: LONG_USER },
      { role: "user", text: QUERY },
    ])
    const before = LONG_USER.length
    apply(body, ctxFor("chat"), {})
    const after = body.messages[0].content.length
    const pct = ((before - after) / before) * 100
    console.log(`  info  relevance 实测：${before} → ${after} 字符，压缩 ${pct.toFixed(1)}%`)
    check("R-01 压缩率在合理区间", pct > 10 && pct < 90, `实际 ${pct.toFixed(1)}%`)
  }
}
