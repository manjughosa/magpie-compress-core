// test/session-dedup.test.mjs — session-dedup 引擎移植保真测试。
// 断言编号对应 test/session-dedup-spec.md §8（A-01…A-32）。

import {
  applySessionDedup,
  restoreDedup,
  callerSupportsCcrRetrieve,
  shingles,
  jaccard,
  findNearDuplicates,
  apply,
} from "../engines/session-dedup.js"
import { sha256hex } from "../hash.js"
import { check, ctxFor } from "./helpers.mjs"

export const name = "session-dedup"

// ≥80 字符、≥3 行的文本块
const BLOCK =
  "line one of the block\n" +
  "line two of the block with more text\n" +
  "line three of the block ends here ok" // 80+ chars, 3 lines
const sha = (t) => sha256hex(t).slice(0, 24)
const MARK = `[dedup:ref sha=${sha(BLOCK)}]`

const user = (text) => ({ role: "user", content: text })
const asst = (text = "ok") => ({ role: "assistant", content: text })

export async function run() {
  // A-01 两条消息，后者替换
  {
    const guarded = { preserveCurrentTurn: true }
    const r = applySessionDedup({ messages: [user(BLOCK), asst(), user(BLOCK)] }, guarded)
    // 显式保护当前轮(2) → 无替换
    check("A-01a preserveCurrentTurn: true 时当前轮豁免", !r.compressed)
    const r2 = applySessionDedup({ messages: [user(BLOCK), user(BLOCK), asst()] })
    check("A-01b 后者替换为marker", r2.compressed &&
      r2.body.messages[0].content === BLOCK &&
      r2.body.messages[1].content === MARK)
  }

  // A-02 三条都含 → 首条保留，后两条各换一次
  {
    const r = applySessionDedup({ messages: [user(BLOCK), user(BLOCK), user(BLOCK), asst()] })
    check("A-02 三次出现换后两次", r.body.messages[0].content === BLOCK &&
      r.body.messages[1].content === MARK && r.body.messages[2].content === MARK)
  }

  // A-03 单消息内重复（intra-message）
  {
    // 2 次出现（不重叠）：干净替换
    const text2 = BLOCK + "\n\n" + BLOCK
    const r0 = applySessionDedup({ messages: [user(text2)] })
    check("A-03a 单消息2次出现保首次", r0.compressed &&
      r0.body.messages[0].content === BLOCK + "\n\n" + MARK)
    // 3 次出现（重叠）：上游逐字行为锁定——
    // "B\n\nB" 的第二次与第一次重叠 → replace 不变；
    // "\n"+B（98字符）长于 B（97）先处理 → 最终 B\n\nMARK_B\nMARK_(\nB)
    const text3 = BLOCK + "\n\n" + BLOCK + "\n\n" + BLOCK
    const r = applySessionDedup({ messages: [user(text3)] })
    const expected = BLOCK + "\n\n" + MARK + "\n" + `[dedup:ref sha=${sha("\n" + BLOCK)}]`
    check("A-03b 重叠三次的上游quirk", r.compressed && r.body.messages[0].content === expected)
    check("A-03c quirk也round-trip", restoreDedup(r.body.messages[0].content,
      Object.fromEntries(r.blockMap)) === text3)
  }

  // A-04/A-05/A-06 块阈值
  {
    const small79 = ("a".repeat(24) + "\n").repeat(3).trim() // 75 chars, 3 lines
    const r = applySessionDedup({ messages: [user(small79), user(small79), asst()] })
    check("A-04 <80字符不换", !r.compressed)

    const exact80 = BLOCK // 已验证 ≥80
    const r2 = applySessionDedup({ messages: [user(exact80), user(exact80), asst()] })
    check("A-05 ≥80且≥3行换", r2.compressed)

    const twoLines = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa\n" + "b".repeat(60) // 2 lines, >80 chars
    const r3 = applySessionDedup({ messages: [user(twoLines), user(twoLines), asst()] })
    check("A-06 <3行不换", !r3.compressed)
  }

  // A-07/A-08 marker 格式
  {
    const r = applySessionDedup({ messages: [user(BLOCK), user(BLOCK), asst()] })
    const m = r.body.messages[1].content
    check("A-07 marker逐字格式", /^\[dedup:ref sha=[0-9a-f]{24}\]$/.test(m))
    check("A-08 sha=sha256前24hex", m === `[dedup:ref sha=${sha256hex(BLOCK).slice(0, 24)}]`)
  }

  // A-09/A-10 首次保留/不同块
  {
    const r = applySessionDedup({ messages: [user(BLOCK), asst()] })
    check("A-09 单次出现不换", !r.compressed)
    const OTHER = BLOCK + "x"
    const r2 = applySessionDedup({ messages: [user(BLOCK), user(OTHER), asst()] })
    check("A-10 不同块互不替换", !r2.compressed)
  }

  // A-11/A-12 当前轮保护（显式 preserveCurrentTurn: true 才有）
  {
    const r = applySessionDedup({ messages: [user(BLOCK), asst(), user(BLOCK)] }, { preserveCurrentTurn: true })
    check("A-11 显式保护时当前轮不换", !r.compressed)
    const r2 = applySessionDedup(
      { messages: [user(BLOCK), asst(), user(BLOCK), asst(), user(BLOCK)] },
      { preserveCurrentTurn: true },
    )
    check("A-12 显式保护时中间轮换末轮不换", r2.compressed &&
      r2.body.messages[2].content === MARK &&
      r2.body.messages[4].content === BLOCK)
  }

  // A-13 无 assistant 且显式保护当前轮 → currentTurnStart=0 → 全部豁免
  {
    const r = applySessionDedup({ messages: [user(BLOCK), user(BLOCK)] }, { preserveCurrentTurn: true })
    // 两个 slot → 走多消息路径,currentTurnStart=0 → 都跳过
    check("A-13 显式保护时无assistant全豁免", !r.compressed)
    // 默认（前缀稳定）则照常替换后者
    const r2 = applySessionDedup({ messages: [user(BLOCK), user(BLOCK)] })
    check("A-13b 默认时后者替换为marker", r2.body.messages[1].content === MARK)
  }

  // A-14/A-15 system 保护
  {
    const r = applySessionDedup({ messages: [
      { role: "system", content: BLOCK }, user(BLOCK), asst(),
    ] })
    check("A-14 system不参与firstSeen", !r.compressed)
    const r2 = applySessionDedup({ messages: [
      { role: "system", content: BLOCK }, { role: "system", content: BLOCK }, asst(),
    ] })
    check("A-15 system本身不改", !r2.compressed &&
      r2.body.messages[0].content === BLOCK && r2.body.messages[1].content === BLOCK)
  }

  // A-16..A-19 多 part
  {
    const p = (t) => [{ type: "text", text: t }]
    const r = applySessionDedup({ messages: [
      { role: "user", content: p(BLOCK) }, { role: "user", content: p(BLOCK) }, asst(),
    ] })
    check("A-16 text part替换", r.body.messages[1].content[0].text === MARK)

    const tr = (t) => [{ type: "tool_result", content: t }]
    const r2 = applySessionDedup({ messages: [
      { role: "user", content: tr(BLOCK) }, { role: "user", content: tr(BLOCK) }, asst(),
    ] })
    check("A-17 tool_result字符串替换", r2.body.messages[1].content[0].content === MARK)

    const tri = (t) => [{ type: "tool_result", content: [{ type: "text", text: t }] }]
    const r3 = applySessionDedup({ messages: [
      { role: "user", content: tri(BLOCK) }, { role: "user", content: tri(BLOCK) }, asst(),
    ] })
    check("A-18 tool_result内text替换", r3.body.messages[1].content[0].content[0].text === MARK)

    const img = () => [{ type: "image", data: "x" }]
    const r4 = applySessionDedup({ messages: [
      { role: "user", content: img() }, { role: "user", content: img() }, asst(),
    ] })
    check("A-19 image part跳过", !r4.compressed)
  }

  // A-20/A-21 suffix 语义
  {
    const r = applySessionDedup({ messages: [user("prefix\n" + BLOCK), user(BLOCK), asst()] })
    check("A-20 前缀后缀块可发现", r.compressed && r.body.messages[1].content === MARK)
    const r2 = applySessionDedup({ messages: [user(BLOCK + "\nsuffix"), user(BLOCK), asst()] })
    check("A-21 非suffix不发现", !r2.compressed)
  }

  // A-22 重叠块只换最长
  {
    const LONGER = BLOCK + "\nextra line four here"
    const r = applySessionDedup({ messages: [user(LONGER), user(LONGER), asst()] })
    // 第二条消息里 LONGER 与 BLOCK 都是 dup；只换最长的 LONGER
    check("A-22 重叠只换最长", r.body.messages[1].content === `[dedup:ref sha=${sha(LONGER)}]`)
  }

  // A-23 map round-trip
  {
    const ctx = ctxFor("chat")
    const body = { messages: [user(BLOCK), user(BLOCK), asst()] }
    apply(body, ctx, {})
    const restored = restoreDedup(body.messages[1].content, ctx.state.sessionDedup.map)
    check("A-23 round-trip无损", restored === BLOCK &&
      body.messages[0].content === BLOCK &&
      !("__sessionDedupMap__" in body))
  }

  // A-24..A-28 fuzzy
  {
    // 单行长文本（无 suffix block，精确 dedup 不动；fuzzy 的相似度用配置覆盖到 0.7）
    const W = "alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike november oscar papa quebec romeo sierra tango"
    const B2 = W.replace("kilo", "kiloX") // 3 个 shingle 不同 → Jaccard≈0.714
    const tools = [{ type: "function", function: { name: "mcp__omniroute_ccr_retrieve" } }]
    const r = applySessionDedup({ messages: [user(W), user(B2), asst()], tools },
      { fuzzy: { enabled: true, minJaccard: 0.7 } })
    check("A-26 fuzzy近重复换CCR marker",
      typeof r.body.messages[1].content === "string" &&
      r.body.messages[1].content.startsWith("[CCR retrieve hash="))

    const r2 = applySessionDedup({ messages: [user(W), user(B2), asst()], tools })
    check("A-24 fuzzy默认关", !r2.compressed || !String(r2.body.messages[1].content).startsWith("[CCR"))

    const r3 = applySessionDedup({ messages: [user(W), user(B2), asst()] }, { fuzzy: true })
    check("A-25 无retrieve工具不跑fuzzy", !r3.compressed)

    check("A-28 >200块fuzzy返回空", findNearDuplicates(
      Array.from({ length: 201 }, (_, i) => ({ text: "t" + i, index: i })), 0.85, 200, 3
    ).length === 0)
  }

  // A-29..A-32 边界
  {
    check("A-29 无messages不动", !applySessionDedup({}).compressed &&
      !applySessionDedup({ messages: [] }).compressed)
    check("A-30 enabled:false不动", !applySessionDedup({ messages: [user(BLOCK), user(BLOCK), asst()] }, { enabled: false }).compressed)
    check("A-32 全system不动", !applySessionDedup({ messages: [
      { role: "system", content: BLOCK }, { role: "system", content: BLOCK },
    ] }).compressed)
    // 时间盒（moejs 250ms 预算适配，上游无此机制）
    check("TB-1 超时即停不崩不错", !applySessionDedup({ messages: [user(BLOCK), user(BLOCK), asst()] }, { deadlineAt: 1 }).compressed)
    check("TB-2 充裕deadline正常压缩", applySessionDedup({ messages: [user(BLOCK), user(BLOCK), asst()] }, { deadlineAt: Date.now() + 60000 }).compressed)
  }

  // 组件函数
  {
    const s1 = shingles("a b c d e", 3)
    check("shingles k=3 数量", s1.size === 3)
    check("shingles 词数<k为空", shingles("a b", 3).size === 0)
    check("jaccard 基础", jaccard(new Set([1, 2, 3]), new Set([1, 2, 3])) === 1 &&
      jaccard(new Set([1]), new Set([2])) === 0 &&
      jaccard(new Set(), new Set()) === 0)
    check("callerSupports 名匹配", callerSupportsCcrRetrieve({ tools: [{ name: "omniroute_ccr_retrieve" }] }) &&
      callerSupportsCcrRetrieve({ tools: [{ name: "x__omniroute_ccr_retrieve" }] }) &&
      callerSupportsCcrRetrieve({ tools: [{ function: { name: "mcp.omniroute_ccr_retrieve" } }] }) &&
      !callerSupportsCcrRetrieve({ tools: [{ name: "omniroute_ccr_retrieve_v2" }] }) &&
      !callerSupportsCcrRetrieve({}))
  }

  // engine.apply 包装
  {
    const ctx = ctxFor("chat")
    const body = { messages: [user(BLOCK), user(BLOCK), asst()] }
    const changed = apply(body, ctx, {})
    check("engine.apply 原地改messages", changed && body.messages[1].content === MARK)
    check("engine.apply state留痕", ctx.state.sessionDedup.dedupCount === 1)
    const ctx2 = ctxFor("responses")
    const body2 = { input: [{ role: "user", content: BLOCK }] }
    check("engine.apply 非messages协议不动", !apply(body2, ctx2, {}))
  }
}
