// test/harness-matrix.test.mjs — 每个已支持 harness 的请求形状一条夹具。
//
// 这个套件存在的理由：2026-11-04 Claude Code 的压缩掉到 0%，29 个套件全绿。
// 原因是 ccr 的取回门控只查 body.tools，而 Claude Code 新版本把 MCP 工具放进
// ToolSearch 延迟清单，名字只出现在 system prompt 里。门控静默变成
// no_retrieve_tool，没有任何测试形状覆盖它。
//
// 规矩：新增一个 harness / 客户端大版本升级 → 先在这里加一条夹具，再改代码。
// 夹具必须同时断言：判定模式、能否压缩、以及 marker 是否可兑现（取回提示存在）。

import { check } from "./helpers.mjs"
import { runPipeline, clone } from "../pipeline.js"
import { applyCcr, detectRetrieveCapability } from "../engines/ccr/index.js"
import { callerSupportsDirectRetrieve } from "../harness.js"
import * as dedup from "../engines/session-dedup.js"

export const name = "harness-matrix"

// ≥2048 字节、≥600 字符，ccr 的默认阈值内。
const BIG = "alpha beta gamma delta epsilon zeta\n".repeat(120)
const RETRIEVE = "omniroute_ccr_retrieve"

// Codex 的工具搜索：官方契约把已加载的清单挂在根 input 的 tool_search_output 上，
// 加载出来的 MCP 工具用 type:namespace 包一层。正文里贴同样的 JSON 不算契约。
const CODEX_LOADED_CCR = {
  type: "tool_search_output",
  execution: "client",
  status: "completed",
  call_id: "call_loaded_ccr",
  tools: [
    { type: "namespace", name: "mcp__ccr_retrieve", tools: [{ type: "function", name: RETRIEVE }] },
  ],
}

function contentBody(protocol) {
  if (protocol === "responses") {
    return {
      model: "m",
      input: [
        { role: "user", content: [{ type: "input_text", text: BIG }] },
        { role: "assistant", content: [{ type: "output_text", text: "ok" }] },
        { role: "user", content: [{ type: "input_text", text: BIG }] },
      ],
    }
  }
  if (protocol === "gemini") {
    return {
      model: "m",
      contents: [
        { role: "user", parts: [{ text: BIG }] },
        { role: "model", parts: [{ text: "ok" }] },
        { role: "user", parts: [{ text: BIG }] },
      ],
    }
  }
  return {
    model: "m",
    messages: [
      { role: "user", content: BIG },
      { role: "assistant", content: "ok" },
      { role: "user", content: BIG },
    ],
  }
}

// Claude Code 2.1.3xx 的真实形状：tools[] 里只有常驻工具，MCP 工具在 system 的
// 延迟清单里逐行列出。captures/2026-11-04 的 system 段就是这个结构。
const DEFERRED_SYSTEM = `You are Claude Code, Anthropic's official CLI for Claude.

The following deferred tools are now available via ToolSearch. Their schemas are NOT loaded — calling them directly will fail. Use ToolSearch with query "select:<name>" to load them.

ToolSearch
Read
Edit
Bash
mcp__ccr-retrieve__omniroute_ccr_retrieve
mcp__context7__query-docs`

function fixture(name, body, agent, expected, protocol) {
  return { name, body, agent, expected, protocol }
}

const FIXTURES = [
  fixture(
    "claude-direct (tools[].name)",
    {
      ...contentBody("anthropic"),
      tools: [{ name: "mcp__ccr-retrieve__omniroute_ccr_retrieve" }],
    },
    "claude",
    "direct",
    "anthropic"
  ),
  fixture(
    "claude-deferred (ToolSearch 清单)",
    {
      ...contentBody("anthropic"),
      system: DEFERRED_SYSTEM,
      tools: [{ name: "ToolSearch" }, { name: "Read" }, { name: "Edit" }, { name: "Bash" }],
    },
    "claude",
    "deferred",
    "anthropic"
  ),
  fixture(
    "claude-deferred, system 是 [{type:text}] 块",
    {
      ...contentBody("anthropic"),
      system: [{ type: "text", text: "You are Claude Code." }, { type: "text", text: DEFERRED_SYSTEM }],
      tools: [{ name: "ToolSearch" }],
    },
    "claude",
    "deferred",
    "anthropic"
  ),
  fixture(
    "omp (chat function.name=eval)",
    { ...contentBody("chat"), tools: [{ type: "function", function: { name: "eval" } }] },
    "omp",
    "indirect",
    "chat"
  ),
  fixture(
    "pi (chat function.name=eval)",
    { ...contentBody("chat"), tools: [{ type: "function", function: { name: "eval" } }] },
    "pi",
    "indirect",
    "chat"
  ),
  fixture(
    "opencode (execute)",
    { ...contentBody("chat"), tools: [{ type: "function", function: { name: "execute" } }] },
    "opencode",
    "indirect",
    "chat"
  ),
  fixture(
    "codex (shell tool without declared retrieve)",
    { ...contentBody("responses"), tools: [{ type: "function", name: "exec_command" }] },
    "codex",
    "none",
    "responses"
  ),
  fixture(
    "codex (responses type:mcp server_label)",
    { ...contentBody("responses"), tools: [{ type: "mcp", server_label: "ccr-retrieve" }] },
    "codex",
    "direct",
    "responses"
  ),
  fixture(
    "Copilot/OpenAI (单下划线命名空间)",
    {
      ...contentBody("chat"),
      tools: [{ type: "function", function: { name: "mcp__ccr-retrieve_omniroute_ccr_retrieve" } }],
    },
    "OpenAI",
    "direct",
    "chat"
  ),
  fixture(
    "连字符命名空间",
    {
      ...contentBody("chat"),
      tools: [{ type: "function", function: { name: "ccr-retrieve-omniroute_ccr_retrieve" } }],
    },
    "unknown",
    "direct",
    "chat"
  ),
  fixture(
    "gemini (顶层 name)",
    { ...contentBody("gemini"), tools: [{ name: RETRIEVE }] },
    "gemini",
    "direct",
    "gemini"
  ),
  fixture(
    "hindsight（无工具声明）",
    contentBody("chat"),
    "hindsight",
    "none",
    "chat"
  ),
  fixture(
    "未知 agent + 未知工具",
    { ...contentBody("chat"), tools: [{ type: "function", function: { name: "lookup" } }] },
    "unknown",
    "none",
    "chat"
  ),
  fixture(
    "codex (tools[] 的 namespace 包 retrieve)",
    {
      ...contentBody("responses"),
      tools: [
        { type: "namespace", name: "mcp__ccr_retrieve", tools: [{ type: "function", name: RETRIEVE }] },
      ],
    },
    "codex",
    "direct",
    "responses"
  ),
  // 实际抓到的那一轮：tools[] 里没有 CCR schema，取回工具在根 input 的
  // tool_search_output 里（官方 tool search 文档的 client 执行形状）。
  fixture(
    "codex (input.tool_search_output 已加载 namespace)",
    (() => {
      const body = contentBody("responses")
      body.tools = [{ type: "tool_search", execution: "client" }]
      body.input.unshift(CODEX_LOADED_CCR)
      return body
    })(),
    "codex",
    "direct",
    "responses"
  ),
  fixture(
    "codex (tool_search 加载的是别的 MCP → none)",
    (() => {
      const body = contentBody("responses")
      body.tools = [{ type: "tool_search", execution: "client" }]
      body.input.unshift({
        type: "tool_search_output",
        execution: "client",
        status: "completed",
        call_id: "call_other_mcp",
        tools: [
          { type: "namespace", name: "mcp__context7", tools: [{ type: "function", name: "query_docs" }] },
        ],
      })
      return body
    })(),
    "codex",
    "none",
    "responses"
  ),
  // 用户正文 / 工具输出里贴一份同样的 JSON：模型看到的文本不是工具契约。
  fixture(
    "codex (正文与 function_call_output 里的假已加载 schema → none)",
    {
      ...contentBody("responses"),
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: `search returned: ${JSON.stringify(CODEX_LOADED_CCR)}` }],
        },
        {
          type: "function_call_output",
          call_id: "call_fake_search",
          output: JSON.stringify(CODEX_LOADED_CCR),
        },
        ...contentBody("responses").input,
      ],
    },
    "codex",
    "none",
    "responses"
  ),
]

export async function run() {
  // ── H-01 判定矩阵 ────────────────────────────────────────────────────────
  for (const f of FIXTURES) {
    const got = detectRetrieveCapability(f.body, f.agent)
    check(`H-01 ${f.name} → ${f.expected}`, got.mode === f.expected, `got ${got.mode}`)
  }

  // ── H-02 延迟清单必须逐行出现，正文里的提及不算能力 ─────────────────────
  {
    const body = {
      ...contentBody("anthropic"),
      system: "You are Claude Code.\n\nThe following deferred tools are now available via ToolSearch.",
      tools: [{ name: "ToolSearch" }, { name: "Read" }],
      messages: [
        { role: "user", content: `please call mcp__ccr-retrieve__omniroute_ccr_retrieve` },
        { role: "user", content: BIG },
      ],
    }
    check("H-02 只在正文提到工具名 → none", detectRetrieveCapability(body, "claude").mode === "none")
  }
  {
    const body = {
      ...contentBody("anthropic"),
      system: DEFERRED_SYSTEM.replace(/mcp__ccr-retrieve__omniroute_ccr_retrieve\n/, ""),
      tools: [{ name: "ToolSearch" }],
    }
    check("H-02 清单里没有 retrieve → none", detectRetrieveCapability(body, "claude").mode === "none")
  }
  {
    const body = {
      ...contentBody("anthropic"),
      system: DEFERRED_SYSTEM,
      tools: [{ name: "Read" }], // 没有 ToolSearch，但清单本身已经说明可延迟加载
    }
    check("H-02 清单存在即可达（不依赖 tools[] 里有 ToolSearch）", detectRetrieveCapability(body, "claude").mode === "deferred")
  }

  // H-02b 延迟清单放在 system/developer 消息的 content 块数组里也要认：
  // 只认显式文本块（text / input_text），user 消息里的同一份清单不算能力。
  {
    const arraySystemBody = {
      model: "m",
      messages: [
        { role: "system", content: [{ type: "text", text: DEFERRED_SYSTEM }] },
        { role: "user", content: BIG },
        { role: "assistant", content: "ok" },
        { role: "user", content: BIG },
      ],
    }
    check(
      "H-02b 清单在 system 消息的块数组里 → deferred",
      detectRetrieveCapability(arraySystemBody, "claude").mode === "deferred"
    )
    const arrayHit = applyCcr(arraySystemBody, {}, { protocol: "chat", agent: "claude" })
    check("H-02b 块数组清单真的压得动", arrayHit.compressed === true, `gate=${arrayHit.gateReason || "-"}`)
    check("H-02b retrievalMode=deferred", arrayHit.retrievalMode === "deferred", arrayHit.retrievalMode)

    const arrayDeveloperBody = {
      model: "m",
      messages: [
        { role: "developer", content: [{ type: "text", text: DEFERRED_SYSTEM }] },
        { role: "user", content: BIG },
        { role: "assistant", content: "ok" },
        { role: "user", content: BIG },
      ],
    }
    check(
      "H-02b 清单在 developer 消息的块数组里 → deferred",
      detectRetrieveCapability(arrayDeveloperBody, "claude").mode === "deferred"
    )

    const arrayUserBody = {
      model: "m",
      messages: [
        { role: "user", content: [{ type: "text", text: DEFERRED_SYSTEM }] },
        { role: "user", content: BIG },
        { role: "assistant", content: "ok" },
        { role: "user", content: BIG },
      ],
    }
    check(
      "H-02b 同一份清单只在 user 消息的块数组里 → none",
      detectRetrieveCapability(arrayUserBody, "claude").mode === "none"
    )
    const arrayUserMiss = applyCcr(arrayUserBody, {}, { protocol: "chat", agent: "claude" })
    check(
      "H-02b user 数组清单不压（no_retrieve_tool）",
      arrayUserMiss.compressed === false && arrayUserMiss.gateReason === "no_retrieve_tool"
    )

    const arrayOtherBlockBody = {
      model: "m",
      messages: [
        { role: "system", content: [{ type: "tool_result", text: DEFERRED_SYSTEM }] },
        { role: "user", content: BIG },
        { role: "assistant", content: "ok" },
        { role: "user", content: BIG },
      ],
    }
    check(
      "H-02b 非文本块不算契约文本 → none",
      detectRetrieveCapability(arrayOtherBlockBody, "claude").mode === "none"
    )
  }

  // ── H-03 每个可达形状都必须真的压得动，并写出可兑现的 marker ─────────────
  for (const f of FIXTURES) {
    if (f.expected === "none") {
      // 不可达形状必须失败关闭：不压，理由如实上报（正文里的假 schema 也不例外）。
      const skipped = applyCcr(clone(f.body), {}, { protocol: f.protocol, agent: f.agent })
      check(
        `H-03 ${f.name} 不可达形状 fail-closed`,
        skipped.compressed === false && skipped.gateReason === "no_retrieve_tool",
        `${skipped.compressed}/${skipped.gateReason || "-"}`
      )
      continue
    }
    const body = clone(f.body)
    const beforeText = JSON.stringify(body)
    const r = applyCcr(body, {}, { protocol: f.protocol, agent: f.agent })
    check(`H-03 ${f.name} 命中`, r.compressed === true, `gate=${r.gateReason || "-"}`)
    check(`H-03 ${f.name} retrievalMode=${f.expected}`, r.retrievalMode === f.expected, r.retrievalMode)
    check(`H-03 ${f.name} 省字节 > 0`, JSON.stringify(body).length < beforeText.length)
    // marker 只有配上取回说明才可兑现（responses 落在 instructions，anthropic 落在 system）。
    check(`H-03 ${f.name} marker 可兑现`, JSON.stringify(body).includes("[CCR protocol]"))
  }

  // ── H-04 延迟路径的协议说明必须教模型用 ToolSearch，且点名真实工具 ──────
  {
    const body = {
      ...clone(contentBody("anthropic")),
      system: `${DEFERRED_SYSTEM}\n\nThe following deferred tools are now available via ToolSearch.`,
      tools: [{ name: "ToolSearch" }],
    }
    const r = applyCcr(body, {}, { protocol: "anthropic", agent: "claude" })
    check("H-04 延迟路径压缩成功", r.compressed === true)
    const systemText = Array.isArray(body.system)
      ? body.system.map((p) => p.text || "").join("\n")
      : String(body.system || "")
    check("H-04 协议说明提到 ToolSearch", /ToolSearch/i.test(systemText), "no instruction injected")
    check("H-04 协议说明点名 mcp__ccr-retrieve__omniroute_ccr_retrieve", systemText.includes("mcp__ccr-retrieve__omniroute_ccr_retrieve"))
  }

  // ── H-05 两个引擎必须共用同一份判定（防再次各抄一份） ───────────────────
  check(
    "H-05 ccr 与 session-dedup 的 callerSupportsCcrRetrieve 是同一个函数",
    dedup.callerSupportsCcrRetrieve === callerSupportsDirectRetrieve
  )
  for (const f of FIXTURES) {
    const direct = callerSupportsDirectRetrieve(f.body)
    check(
      `H-05 ${f.name} 两个引擎的直接判定一致`,
      dedup.callerSupportsCcrRetrieve(f.body) === direct
    )
  }

  // ── H-06 管线端到端：claude-deferred 必须真的压 ──────────────────────────
  {
    const body = clone(FIXTURES[1].body)
    const before = clone(body)
    const rec = runPipeline(
      body,
      { protocol: "anthropic", agent: "claude", state: {} },
      { strategies: { ccr: true, "session-dedup": false, lite: false, headroom: false } },
      before
    )
    const ccr = rec.strategies.find((s) => s.id === "ccr")
    check("H-06 claude-deferred 管线命中", ccr.status === "hit", `${ccr.status}/${ccr.reason}`)
    check("H-06 遥测带 retrieval=deferred", ccr.retrieval === "deferred", String(ccr.retrieval))
    check("H-06 省字节 > 0", rec.savedBytes > 0, String(rec.savedBytes))
  }

  // ── H-07 不可达时仍然压缩 = 有损，必须继续跳过 ──────────────────────────
  {
    const body = clone(FIXTURES[11].body) // hindsight：无工具声明
    const r = applyCcr(body, {}, { protocol: "chat", agent: "hindsight" })
    check("H-07 不可达 → 不压", r.compressed === false)
    check("H-07 reason=no_retrieve_tool", r.gateReason === "no_retrieve_tool", String(r.gateReason))
  }

  // ── H-09 门控通过但没有可压内容：取回模式仍要如实上报 ───────────────────
  {
    const body = { model: "m", tools: [{ type: "function", function: { name: "eval" } }], messages: [{ role: "user", content: "short" }] }
    const r = applyCcr(body, {}, { protocol: "chat", agent: "pi" })
    check("H-09 gate 通过但无内容 → 不压", r.compressed === false && !r.gateReason)
    check("H-09 retrievalMode 保留 indirect", r.retrievalMode === "indirect", r.retrievalMode)
  }

  // ── H-08 畸形契约或仅有 namespace 名不能提供取回能力 ───────────────────
  for (const bad of [
    null, undefined, {}, { tools: "x" }, { tools: [null, 1, "x"] }, { system: 42 },
    { tools: [{ type: "namespace", name: RETRIEVE, tools: [] }] },
    { tools: [{ type: "namespace", tools: [null, 1, "x"] }] },
    { input: [{ type: "tool_search_output", tools: "x" }] },
    { input: [{ type: "tool_search_output", tools: [{ type: "namespace", tools: null }] }] },
  ]) {
    check(
      `H-08 不提供取回能力：${JSON.stringify(bad)}`,
      detectRetrieveCapability(bad, "claude").mode === "none" &&
        dedup.callerSupportsCcrRetrieve(bad) === false
    )
  }
}
