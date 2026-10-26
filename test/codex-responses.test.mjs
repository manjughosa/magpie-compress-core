// test/codex-responses.test.mjs — codexResponses 引擎移植的验证
// 范围：四种压缩器（minifyJson/compactDiff/compactSearch/collapseLines）、
// eligibility（保护工具名、local_shell 有损候选跳过、call_id 反查）、
// 配置合并、协议门（responses-only）、token 单调性。

import assert from "node:assert"
import { check, ctxFor } from "./helpers.mjs"
import * as middleware from "../compress-core.middleware.js"
import * as codex from "../engines/codex-responses.js"

export const name = "codex-responses"

// ─── 测试语料 ───────────────────────────────────────────────────────────

// minifyJson：pretty-print 的 JSON 对象
const JSON_OBJ = JSON.stringify(
  { status: "ok", items: Array.from({ length: 20 }, (_, i) => ({ id: i, name: `item-${i}`, value: i * 10 })) },
  null,
  2
)

// compactDiff：长 diff，含 context 行
function makeDiff() {
  const lines = ["diff --git a/foo.ts b/foo.ts", "--- a/foo.ts", "+++ b/foo.ts"]
  for (let h = 0; h < 5; h++) {
    lines.push(`@@ -${h * 20},10 +${h * 20},12 @@`)
    for (let i = 0; i < 8; i++) lines.push(` context line ${i} of hunk ${h}`)
    lines.push(`-removed line ${h}`)
    lines.push(`+added line ${h}`)
  }
  return lines.join("\n")
}
const DIFF = makeDiff()

// compactSearch：grep 输出
function makeSearch() {
  const lines = []
  for (let f = 0; f < 5; f++) {
    for (let m = 0; m < 10; m++) {
      lines.push(`src/file${f}.ts:${m * 10}:5: const match${f}_${m} = findTarget(pattern)`)
    }
  }
  return lines.join("\n")
}
const SEARCH = makeSearch()

// collapseLines：长 build 日志
function makeLog() {
  const lines = []
  lines.push("npm run build started")
  for (let i = 0; i < 30; i++) lines.push(`[info] compiling module ${i}`)
  lines.push("ERROR: type check failed in src/foo.ts:42")
  for (let i = 30; i < 60; i++) lines.push(`[info] more output ${i}`)
  lines.push("error TS2322: Type 'string' is not assignable to type 'number'")
  for (let i = 60; i < 90; i++) lines.push(`[info] trailing ${i}`)
  lines.push("Build completed with 2 errors")
  return lines.join("\n")
}
const LOG = makeLog()

// ─── 构造 responses body ────────────────────────────────────────────────

function responsesBody(items) {
  return { model: "gpt-5-codex", input: items }
}

function fnCall(callId, name) {
  return { type: "function_call", call_id: callId, name, arguments: "{}", id: `fc-${callId}` }
}

function fnOutput(callId, output) {
  return { type: "function_call_output", call_id: callId, output }
}

// ─── 测试 ───────────────────────────────────────────────────────────────

export function run() {
  // —— A 组：压缩器单元 ——

  {
    // A-01 minifyJson 更短
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    const before = JSON_OBJ.length
    codex.apply(body, ctxFor("responses"), { enabled: true })
    const after = body.input[1].output
    check("A-01 minifyJson 压缩", after.length < before && JSON.parse(after).items.length === 20)
  }

  {
    // A-02 compactDiff 去 context
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", DIFF)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    const out = body.input[1].output
    check("A-02 compactDiff 更短", out.length < DIFF.length)
    check("A-02 compactDiff 保 +/-/@@", out.includes("+added line") && out.includes("@@"))
  }

  {
    // A-03 compactSearch 按路径分组
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", SEARCH)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    const out = body.input[1].output
    check("A-03 compactSearch 更短", out.length < SEARCH.length)
    check("A-03 compactSearch 每路径≤3", (out.match(/file0\.ts/g) || []).length <= 3 + 1) // +1 for path header
  }

  {
    // A-04 collapseLines 保 error + 前后8行
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", LOG)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    const out = body.input[1].output
    check("A-04 collapseLines 更短", out.length < LOG.length)
    check("A-04 collapseLines 保 error", out.includes("ERROR: type check failed"))
    check("A-04 collapseLines 保 头部", out.includes("npm run build started"))
    check("A-04 collapseLines 保 尾部", out.includes("Build completed"))
  }

  // —— B 组：eligibility 门 ——

  {
    // B-01 保护工具不动（read 在保护列表）
    const body = responsesBody([fnCall("c1", "read"), fnOutput("c1", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-01 read 保护", body.input[1].output === JSON_OBJ)
  }

  {
    // B-02 非保护工具可动（bash 不在保护列表）
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-02 bash 可动", body.input[1].output !== JSON_OBJ)
  }

  {
    // B-03 call_id 不在 functionCalls → 不动
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c-unknown", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-03 孤儿call_id不动", body.input[1].output === JSON_OBJ)
  }

  {
    // B-04 local_shell_call_output 恒 eligible
    const body = responsesBody([
      { type: "local_shell_call_output", call_id: "s1", output: LOG },
    ])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    // LOG 有 collapseLines 候选 → 但有损候选会让 local_shell 跳过
    check("B-04 local_shell 有损候选跳过", body.input[0].output === LOG)
  }

  {
    // B-05 local_shell 纯 JSON（无有损候选）→ 可 minifyJson
    const body = responsesBody([
      { type: "local_shell_call_output", call_id: "s1", output: JSON_OBJ },
    ])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-05 local_shell 无损minify", body.input[0].output !== JSON_OBJ && JSON.parse(body.input[0].output).items.length === 20)
  }

  {
    // B-06 apply_patch_call_output 恒 eligible
    const body = responsesBody([
      { type: "apply_patch_call_output", call_id: "p1", output: JSON_OBJ },
    ])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-06 apply_patch 可动", body.input[0].output !== JSON_OBJ)
  }

  {
    // B-07 preserveToolNames 自定义保护
    const body = responsesBody([fnCall("c1", "mytool"), fnOutput("c1", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: true, preserveToolNames: ["mytool"] })
    check("B-07 preserveToolNames", body.input[1].output === JSON_OBJ)
  }

  {
    // B-08 headless_retrieval 后缀保护
    const body = responsesBody([fnCall("c1", "mcp__headless_retrieval"), fnOutput("c1", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: true })
    check("B-08 __headless_retrieval保护", body.input[1].output === JSON_OBJ)
  }

  // —— C 组：字节/token 门禁 ——

  {
    // C-01 短于 minBytes 不动
    const short = JSON.stringify({ a: 1 })
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", short)])
    codex.apply(body, ctxFor("responses"), { enabled: true, minBytes: 512 })
    check("C-01 <minBytes不动", body.input[1].output === short)
  }

  {
    // C-02 minBytes=0 短 JSON 也可动
    const short = JSON.stringify({ a: 1, b: 2, c: 3 }, null, 2)
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", short)])
    codex.apply(body, ctxFor("responses"), { enabled: true, minBytes: 0 })
    check("C-02 minBytes=0可动", body.input[1].output !== short)
  }

  {
    // C-03 长于 maxCandidateBytes 不动
    const big = JSON.stringify({ items: Array.from({ length: 20000 }, (_, i) => ({ id: i, name: `x`.repeat(50) })) })
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", big)])
    codex.apply(body, ctxFor("responses"), { enabled: true, maxCandidateBytes: 1024 })
    check("C-03 >maxCandidateBytes不动", body.input[1].output === big)
  }

  {
    // C-04 长于 maxOutputBytes 不动
    const big = JSON.stringify({ items: Array.from({ length: 20000 }, (_, i) => ({ id: i, name: `x`.repeat(50) })) })
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", big)])
    codex.apply(body, ctxFor("responses"), { enabled: true, maxOutputBytes: 1024 })
    check("C-04 >maxOutputBytes不动", body.input[1].output === big)
  }

  // —— D 组：协议门 / 开关 ——

  {
    // D-01 非 responses 协议不动
    const body = { messages: [{ role: "tool", content: JSON_OBJ }] }
    codex.apply(body, ctxFor("chat"), { enabled: true })
    check("D-01 chat协议不动", body.messages[0].content === JSON_OBJ)
  }

  {
    // D-02 enabled:false 不动
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    codex.apply(body, ctxFor("responses"), { enabled: false })
    check("D-02 enabled:false不动", body.input[1].output === JSON_OBJ)
  }

  {
    // D-03 空 input 不动
    const body = { model: "gpt-5-codex", input: [] }
    const r = codex.apply(body, ctxFor("responses"), { enabled: true })
    check("D-03 空input返false", r === false)
  }

  {
    // D-04 无 input 不动
    const body = { model: "gpt-5-codex" }
    const r = codex.apply(body, ctxFor("responses"), { enabled: true })
    check("D-04 无input返false", r === false)
  }

  // —— E 组：state 留痕 ——

  {
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    const ctx = ctxFor("responses")
    codex.apply(body, ctx, { enabled: true })
    check("E-01 ctx.state.codexResponses", ctx.state.codexResponses && ctx.state.codexResponses.compressedCount === 1)
  }

  // —— F 组：经 middleware 端到端 ——

  {
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    middleware.onRequest(body, ctxFor("responses", {
      strategies: { lite: false, "session-dedup": false, headroom: false, "codex-responses": true },
    }))
    check("F-01 经middleware压", body.input[1].output !== JSON_OBJ)
  }

  {
    // F-02 middleware 默认 codexResponses off（defaultOn=false）
    const body = responsesBody([fnCall("c1", "bash"), fnOutput("c1", JSON_OBJ)])
    middleware.onRequest(body, ctxFor("responses", {}))
    check("F-02 默认关闭", body.input[1].output === JSON_OBJ)
  }
}
