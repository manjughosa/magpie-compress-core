// test/ccr.test.mjs — ccr 引擎移植测试（内存 store 版）。
// 覆盖：能压 / 无收益返回 false / 畸形输入不抛 / 门控 / 阈值 / 幂等 / 多协议 / 取回查询。

import {
  apply,
  applyCcr,
  callerSupportsCcrRetrieve,
  matchesCcrRetrieveToolName,
  buildCcrMarker,
  buildCcrReplacementText,
  restoreCcr,
  makeStore,
  tryStoreBlock,
  retrieveBlock,
  recordRetrieval,
  shouldSkipCompression,
  effectiveMinChars,
  isSafePattern,
  queryBlock,
  utf8ByteLength,
  hashContent,
  injectCcrProtocolInstruction,
  configSchema,
  id,
  lossy,
  defaultOn,
  stackPriority,
} from "../engines/ccr/index.js"
import { check, ctxFor, bodyChars } from "./helpers.mjs"
import * as middleware from "../compress-core.middleware.js"

export const name = "ccr"

/** 造一段确定性的长文本（带换行，方便 stats 行数）。 */
const big = (n) => {
  let s = ""
  let i = 0
  while (s.length < n) s += `line ${i++} of the report ${"x".repeat(40)}\n`
  return s.slice(0, n)
}

const retrieveTool = { type: "function", function: { name: "omniroute_ccr_retrieve" } }

const chatWithTool = (text) => ({
  model: "m",
  tools: [retrieveTool],
  messages: [{ role: "user", content: text }],
})

export async function run() {
  // ---- 元数据 ----
  check("meta id", id === "ccr")
  check("meta lossless", lossy === false && defaultOn === true && stackPriority === 4)
  check("schema 有 minBlockBytes/minRepeat", configSchema.some((f) => f.key === "minBlockBytes") && configSchema.some((f) => f.key === "minRepeat"))

  // ---- 工具函数 ----
  check("utf8 字节数 ASCII", utf8ByteLength("abc") === 3)
  check("utf8 字节数中文", utf8ByteLength("中文") === 6)
  check("utf8 字节数 emoji(代理对)", utf8ByteLength("😀") === 4)
  check("hash 是 24 hex", /^[0-9a-f]{24}$/.test(hashContent("hello")))

  // ---- 能压 ----
  {
    const text = big(4000)
    const body = chatWithTool(text)
    const before = bodyChars(body)
    const ctx = ctxFor("chat")
    const changed = apply(body, ctx, {})
    const after = bodyChars(body)
    const compressed = body.messages.find((m) => m.role === "user").content
    check("能压 → 返回 true", changed === true)
    check("写入 CCR marker", compressed.includes("[CCR retrieve hash=") && compressed.includes("chars=4000"))
    check("保留 200 字符 preamble", compressed.startsWith(text.slice(0, 200).trimEnd().slice(0, 60)))
    check("state.ccr 记了 map", ctx.state.ccr && Object.keys(ctx.state.ccr.map).length === 1)
    const hash = Object.keys(ctx.state.ccr.map)[0]
    check("map 里是逐字原文", ctx.state.ccr.map[hash] === text)
    check("restoreCcr 可回原文", restoreCcr(buildCcrMarker(hash, text.length), ctx.state.ccr.map) === text)
    check("体积确实下降", after < before, `${before} → ${after}`)
    check("stats 有节省率", ctx.state.ccr.stats.savingsPercent > 50, String(ctx.state.ccr.stats.savingsPercent))
    check("注入一条 system instruction", body.messages[0].role === "system" && body.messages[0].content.includes("[CCR protocol]"))
    // 幂等：再压一次没有任何可压的段（已变成 ~250 字符的 marker 行）
    check("重复 apply → false", apply(body, ctxFor("chat"), {}) === false)
  }

  // ---- 门控：调用方没有 retrieve 工具就不压 ----
  {
    const body = { model: "m", messages: [{ role: "user", content: big(4000) }] }
    check("无 retrieve 工具 → false", apply(body, ctxFor("chat"), {}) === false)
    check("body 未被改动", body.messages[0].content.length === 4000)
    const forced = { model: "m", messages: [{ role: "user", content: big(4000) }] }
    check(
      "requireRetrieveTool:false 解除门控",
      apply(forced, ctxFor("chat"), { requireRetrieveTool: false }) === true
    )
    check("解除门控时不插 instruction", forced.messages.every((m) => m.role !== "system"))
  }

  // ---- 没东西压 ----
  {
    const body = chatWithTool("短文本")
    check("小文本 → false", apply(body, ctxFor("chat"), {}) === false)
    check("小文本原样", body.messages[0].content === "短文本")
    // 字节阈值
    const text = big(3000) // 3000 字符 ≈ 3000 字节
    const b1 = chatWithTool(text)
    check("minBlockBytes 4096 → 不压", apply(b1, ctxFor("chat"), { minBlockBytes: 4096 }) === false)
    const b2 = chatWithTool(text)
    check("minBlockBytes 0 → 压", apply(b2, ctxFor("chat"), { minBlockBytes: 0 }) === true)
    // 字符阈值
    const b3 = chatWithTool(text)
    check("minChars 5000 → 不压", apply(b3, ctxFor("chat"), { minChars: 5000 }) === false)
  }

  // ---- minRepeat ----
  {
    const text = big(3000)
    const once = { model: "m", tools: [retrieveTool], messages: [{ role: "user", content: text }, { role: "assistant", content: "ok" }] }
    check("minRepeat 2 且只出现一次 → 不压", apply(once, ctxFor("chat"), { minRepeat: 2 }) === false)
    const twice = {
      model: "m",
      tools: [retrieveTool],
      messages: [{ role: "user", content: text }, { role: "assistant", content: "ok" }, { role: "user", content: text }],
    }
    const changed = apply(twice, ctxFor("chat"), { minRepeat: 2 })
    // 注入的 system instruction 里也含 "[CCR retrieve hash=" 字样，按 role 排除
    const markers = twice.messages.filter((m) => m.role !== "system" && m.content.includes("[CCR retrieve hash=")).length
    check("minRepeat 2 且出现两次 → 两段都压", changed === true && markers === 2)
  }

  // ---- system / tool 输出不碰 ----
  {
    const text = big(4000)
    const body = {
      model: "m",
      tools: [retrieveTool],
      messages: [
        { role: "system", content: text },
        { role: "assistant", content: "call" },
        { role: "tool", content: text, tool_call_id: "c1" },
        { role: "user", content: text },
      ],
    }
    const changed = apply(body, ctxFor("chat"), {})
    // 注入的 instruction 会 unshift 到最前面，所以按 role+内容找，不按固定下标
    const keptIntact = body.messages.filter((m) => (m.role === "system" || m.role === "tool") && m.content === text).length
    const userMsg = body.messages.find((m) => m.role === "user")
    check("只压 user，system/tool 不动", changed === true && keptIntact === 2)
    check("user 被压", userMsg.content.includes("[CCR retrieve hash="))
  }

  // ---- 多协议 ----
  {
    const text = big(4000)
    const responses = {
      model: "m",
      tools: [retrieveTool],
      input: [{ role: "user", content: [{ type: "input_text", text }] }],
    }
    check("responses 协议能压", apply(responses, ctxFor("responses"), {}) === true)
    const anthropic = { model: "m", tools: [retrieveTool], messages: [{ role: "user", content: [{ type: "text", text }] }] }
    check("anthropic 协议能压", apply(anthropic, ctxFor("anthropic"), {}) === true)
    const gemini = { contents: [{ role: "user", parts: [{ text }] }] }
    check("gemini 协议能压", apply(gemini, ctxFor("gemini"), { requireRetrieveTool: false }) === true)
    check("未知协议 → false", apply(chatWithTool(text), ctxFor("weird"), { requireRetrieveTool: false }) === false)
  }

  // ---- 畸形输入不抛 ----
  {
    for (const bad of [null, undefined, 0, "str", [], true]) {
      let threw = false
      let r = null
      try {
        r = apply(bad, ctxFor("chat"), {})
      } catch {
        threw = true
      }
      check(`畸形输入不抛 (${JSON.stringify(bad) ?? "undefined"})`, threw === false && r === false)
    }
    const noCtx = () => apply({ messages: [] }, undefined, undefined)
    let threw = false
    try {
      noCtx()
    } catch {
      threw = true
    }
    check("ctx/cfg 缺失不抛", threw === false)
    // 段形状异常（content 是数字/嵌套怪对象）
    const weird = { model: "m", tools: [retrieveTool], messages: [{ role: "user", content: 42 }, { role: "user", content: { a: 1 } }] }
    let threw2 = false
    try {
      apply(weird, ctxFor("chat"), {})
    } catch {
      threw2 = true
    }
    check("非字符串 content 不抛", threw2 === false)
  }

  // ---- 门控工具名识别 ----
  {
    check("精确名", matchesCcrRetrieveToolName("omniroute_ccr_retrieve") === true)
    check("MCP 前缀名", matchesCcrRetrieveToolName("mcp__srv__omniroute_ccr_retrieve") === true)
    check("非边界前缀不认", matchesCcrRetrieveToolName("xomniroute_ccr_retrieve") === false)
    check("扁平 tool.name", callerSupportsCcrRetrieve({ tools: [{ name: "omniroute_ccr_retrieve" }] }) === true)
    check("嵌套 function.name", callerSupportsCcrRetrieve({ tools: [retrieveTool] }) === true)
    check("没有 tools", callerSupportsCcrRetrieve({}) === false)
  }

  // ---- 内存 store：预算 / 取回 / H8 抬阈值 ----
  {
    const store = makeStore()
    const text = big(1000)
    const r1 = tryStoreBlock(store, text, "p1", { now: 1000 })
    check("store 命中", r1.stored === true && r1.metadata.chars === 1000)
    check("retrieve 命中", retrieveBlock(store, r1.hash, "p1", 1000) === text)
    check("别的 principal 取不到", retrieveBlock(store, r1.hash, "p2", 1000) === null)
    check("未知 hash 取不到", retrieveBlock(store, "0".repeat(24), "p1", 1000) === null)
    // TTL 过期
    check("过期后取不到", retrieveBlock(store, r1.hash, "p1", 1000 + 25 * 3600 * 1000) === null)
    // 重复存同一块 → 不重复计费
    const s2 = makeStore()
    tryStoreBlock(s2, text, "p1", { now: 1 })
    tryStoreBlock(s2, text, "p1", { now: 2 })
    check("同块重复存只占一份字节", s2.totalBytes === utf8ByteLength(text), String(s2.totalBytes))
    // 超大块被拒
    const s3 = makeStore()
    const huge = "y".repeat(2 * 1024 * 1024 + 10)
    check("超大块被拒", tryStoreBlock(s3, huge, "p1").stored === false)
    // H8
    const s4 = makeStore()
    const h = hashContent(text)
    check("ramp 起点", effectiveMinChars(s4, 600, h, "p1", 2) === 600)
    recordRetrieval(s4, h, "p1")
    check("取回 1 次后阈值抬高", effectiveMinChars(s4, 600, h, "p1", 2) === 1200)
    check("未到阈值不跳过", shouldSkipCompression(s4, h, "p1") === false)
    recordRetrieval(s4, h, "p1")
    recordRetrieval(s4, h, "p1")
    check("取回 3 次后跳过", shouldSkipCompression(s4, h, "p1") === true)
    check("取回 3 次后阈值 Infinity", effectiveMinChars(s4, 600, h, "p1", 2) === Number.POSITIVE_INFINITY)
  }

  // ---- 正则安全检查（safe-regex 替代） ----
  {
    check("普通 pattern 通过", isSafePattern("foo.*bar") === true)
    check("分组+量词通过", isSafePattern("(?:ab|cd)+") === true)
    check("嵌套量词拒绝", isSafePattern("(a+)+") === false)
    check("连续量词拒绝", isSafePattern("a**") === false)
    check("反向引用拒绝", isSafePattern("(a)\\1") === false)
    check("超长 pattern 拒绝", isSafePattern("a".repeat(600)) === false)
    check("空 pattern 拒绝", isSafePattern("") === false)
    check("非字符串拒绝", isSafePattern(null) === false)
  }

  // ---- queryBlock（ccrQuery 移植） ----
  {
    const text = "alpha\nbeta\ngamma\ndelta"
    check("full", queryBlock(text, { mode: "full" }).content === text)
    check("head 2", queryBlock(text, { mode: "head", n: 2 }).content === "alpha\nbeta")
    check("tail 2", queryBlock(text, { mode: "tail", n: 2 }).content === "gamma\ndelta")
    check("lines 2-3", queryBlock(text, { mode: "lines", start: 2, end: 3 }).content === "beta\ngamma")
    check("grep", queryBlock(text, { mode: "grep", pattern: "^[ab]" }).content === "alpha\nbeta")
    check("grep 无 pattern 报错", typeof queryBlock(text, { mode: "grep" }).error === "string")
    check("grep 危险 pattern 报错", typeof queryBlock(text, { mode: "grep", pattern: "(a+)+" }).error === "string")
    check("未知模式报错", typeof queryBlock(text, { mode: "nope" }).error === "string")
    const stats = JSON.parse(queryBlock(text, { mode: "stats" }).content)
    check("stats 行数", stats.lines === 4 && stats.chars === text.length)
    check("head 缺 n 报错", typeof queryBlock(text, { mode: "head" }).error === "string")
    check("lines start>end 报错", typeof queryBlock(text, { mode: "lines", start: 3, end: 1 }).error === "string")
  }

  // ---- 纯函数主体（applyCcr）直接调用 ----
  {
    const text = big(3000)
    const body = chatWithTool(text)
    const r = applyCcr(body, { requireRetrieveTool: false }, { protocol: "chat" })
    check("applyCcr 返回 compressed", r.compressed === true && r.replacedCount === 1)
    check("applyCcr 不改 state", typeof r.map === "object")
    const replaced = body.messages[0].content
    check("替换文本 = preamble + marker", replaced === buildCcrReplacementText(text, buildCcrMarker(hashContent(text), text.length)))
  }

  // ---- 实测压缩率 ----
  {
    const text = big(20000)
    const body = chatWithTool(text)
    const before = bodyChars(body)
    const r = applyCcr(body, {}, { protocol: "chat" })
    const after = bodyChars(body)
    const pct = ((before - after) / before) * 100
    console.log(`  info  20000 字符单块：${before} → ${after} 字节（${pct.toFixed(2)}%），${r.replacedCount} 段`)
    check("大块压缩率 > 90%", pct > 90, `${pct.toFixed(2)}%`)
  }

  // ---- item 1: store through apply with a non-empty ctx.session, retrieve the way
  // the MCP server does (no principal). Before the fix the entry was keyed by
  // "<session> <hash>" and the server, which has no session, queried "__anon__".
  {
    const text = big(3000)
    const body = {
      model: "m",
      tools: [{ type: "function", function: { name: "omniroute_ccr_retrieve" } }],
      messages: [{ role: "user", content: text }],
    }
    const ctx = { protocol: "chat", state: {}, session: "sess-123" }
    const changed = apply(body, ctx, { enabled: true })
    const m = JSON.stringify(body).match(/\[CCR retrieve hash=([0-9a-f]{24})/)
    check("item1 带 session 时仍写出 marker", changed === true && !!m)
    const store = ctx.state.ccr && ctx.state.ccr.store
    const back = m && store ? retrieveBlock(store, m[1]) : null
    check("item1 不带 principal 也能取回原文（与 MCP server 一致）", back === text)
  }

  // ---- item 2: the CCR instruction must not become a system message in Anthropic
  {
    const body = { model: "m", system: "base system", messages: [{ role: "user", content: "hi" }], tools: [{ type: "function", function: { name: "omniroute_ccr_retrieve" } }] }
    const changed = injectCcrProtocolInstruction(body, "anthropic")
    check("item2 Anthropic 指令写入顶层 system", changed === true && typeof body.system === "string" && body.system.includes("[CCR protocol]"))
    check("item2 Anthropic messages 里没有 system 消息", body.messages.length === 1 && !body.messages.some((x) => x.role === "system"))
  }

  // ---- item 2 end-to-end: through apply with protocol "anthropic". The direct
  // call above would still pass if apply forgot to pass the protocol, which is the
  // exact regression the review found (a role:"system" message back in messages[]).
  {
    const text = big(3000)
    const body = {
      model: "m",
      system: "base system",
      tools: [{ name: "omniroute_ccr_retrieve", input_schema: { type: "object" } }],
      messages: [
        { role: "user", content: text },
        { role: "assistant", content: "ok" },
        { role: "user", content: text },
      ],
    }
    const changed = apply(body, { protocol: "anthropic", state: {} }, { enabled: true })
    check("item2e anthropic apply 产出 marker", changed === true && JSON.stringify(body).includes("[CCR retrieve hash="))
    check("item2e 指令进顶层 system", typeof body.system === "string" && body.system.includes("[CCR protocol]"))
    check("item2e messages 里没有 system role", !body.messages.some((m) => m.role === "system"))
  }

  // ---- item 4: the middleware-only path must never run ccr, even with options: {}
  {
    const text = big(3000)
    const body = { model: "m", tools: [{ type: "function", function: { name: "omniroute_ccr_retrieve" } }], messages: [
      { role: "user", content: text }, { role: "assistant", content: "ok" }, { role: "user", content: text },
    ] }
    middleware.onRequest(body, { protocol: "chat", origin: "magpie-key", options: {}, state: {} })
    check("item4 middleware + options:{} 不产生 CCR marker", !JSON.stringify(body).includes("[CCR retrieve hash="))
  }
}
