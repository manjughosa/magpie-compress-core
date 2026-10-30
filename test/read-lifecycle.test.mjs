// test/read-lifecycle.test.mjs — read-lifecycle 引擎移植测试。
// 覆盖：同一路径 Read 两次只折叠旧的 / Write 也触发折叠 / 不同路径不动 /
//       严格更晚才折叠 / opt-in / 幂等 / stub 选项 / 三种协议形状 / 畸形输入不抛。

import {
  apply,
  applyReadLifecycle,
  classifyTool,
  extractPath,
  parseMaybeJson,
  extractInvocations,
  extractResponseInvocations,
  findSupersededReadCallIds,
  collapseSupersededReads,
  collapseResponseOutputs,
  stubFor,
  replaceResultText,
  configSchema,
  id,
  lossy,
  defaultOn,
  stackPriority,
} from "../engines/read-lifecycle.js"
import { check, ctxFor, bodyChars } from "./helpers.mjs"
import { runPipeline } from "../pipeline.js"
import { ENGINES } from "../catalog.js"

export const name = "read-lifecycle"

const readCall = (callId, path) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id: callId, type: "function", function: { name: "read", arguments: JSON.stringify({ file_path: path }) } }],
})

const toolResult = (callId, content) => ({ role: "tool", tool_call_id: callId, content })

const writeCall = (callId, path) => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id: callId, type: "function", function: { name: "edit", arguments: JSON.stringify({ file_path: path, old_string: "a", new_string: "b" }) } }],
})

const readTwice = (path = "/src/app.js") => ({
  model: "m",
  messages: [
    { role: "user", content: "看看这个文件" },
    readCall("c1", path),
    toolResult("c1", "ORIGINAL CONTENT OF THE FILE ".repeat(40)),
    readCall("c2", path),
    toolResult("c2", "CURRENT CONTENT OF THE FILE ".repeat(40)),
  ],
})

export async function run() {
  // ---- 元数据 ----
  check("meta id", id === "read-lifecycle")
  check("meta lossy/opt-in", lossy === true && defaultOn === false && stackPriority === 2)
  check("schema 有工具名与 stub 摘要", ["readToolNames", "writeToolNames", "stubKeepSummary", "keepStub"].every((k) => configSchema.some((f) => f.key === k)))

  // ---- 基础判定 ----
  check("classifyTool read", classifyTool("Read") === "read" && classifyTool(" read_file ") === "read")
  check("classifyTool write", classifyTool("str_replace_editor") === "write" && classifyTool("apply_patch") === "write")
  check("classifyTool 未知", classifyTool("grep") === null && classifyTool(undefined) === null)
  check("extractPath 字段顺序", extractPath({ file_path: " /a ", path: "/b" }) === "/a")
  check("extractPath 空串跳过", extractPath({ file_path: "  ", path: "/b" }) === "/b")
  check("extractPath 非对象", extractPath(null) === null)
  check("parseMaybeJson 字符串", parseMaybeJson('{"a":1}').a === 1)
  check("parseMaybeJson 坏串", parseMaybeJson("{oops") === null)
  check("stub 文本逐字", stubFor("/a.js").includes('"/a.js"') && stubFor("/a.js").startsWith("[read superseded"))

  // ---- 同一路径 Read 两次：只折叠旧的 ----
  {
    const body = readTwice()
    const before = bodyChars(body)
    const ctx = ctxFor("chat")
    const changed = apply(body, ctx, { enabled: true })
    const after = bodyChars(body)
    check("能压 → true", changed === true)
    check("旧 Read 被折叠成 stub", body.messages[2].content === stubFor("/src/app.js"))
    check("新 Read 原文保留", body.messages[4].content.startsWith("CURRENT CONTENT"))
    check("体积下降", after < before, `${before} → ${after}`)
    check("state 记了折叠数", ctx.state.readLifecycle.collapsedCount === 1)
    // 幂等：再跑一次不该再有收益
    check("重复 apply → false", apply(body, ctxFor("chat"), { enabled: true }) === false)
  }

  // ---- Write 也触发折叠 ----
  {
    const body = {
      model: "m",
      messages: [
        readCall("c1", "/a.js"),
        toolResult("c1", "OLD ".repeat(100)),
        writeCall("c2", "/a.js"),
        toolResult("c2", "patched"),
      ],
    }
    check("后置 Write 折叠旧 Read", apply(body, ctxFor("chat"), { enabled: true }) === true && body.messages[1].content === stubFor("/a.js"))
    check("Write 结果不动", body.messages[3].content === "patched")
  }

  // ---- 不同路径 / 只有一次 Read / 更早的 Write ----
  {
    const diff = {
      model: "m",
      messages: [readCall("c1", "/a.js"), toolResult("c1", "A"), readCall("c2", "/b.js"), toolResult("c2", "B")],
    }
    check("不同路径 → false", apply(diff, ctxFor("chat"), { enabled: true }) === false)

    const once = { model: "m", messages: [readCall("c1", "/a.js"), toolResult("c1", "A")] }
    check("只读一次 → false", apply(once, ctxFor("chat"), { enabled: true }) === false)

    const earlierWrite = {
      model: "m",
      messages: [writeCall("c0", "/a.js"), toolResult("c0", "ok"), readCall("c1", "/a.js"), toolResult("c1", "A")],
    }
    check("Write 在 Read 之前 → 不折叠", apply(earlierWrite, ctxFor("chat"), { enabled: true }) === false)

    // 路径必须精确相等（大小写/分隔符不归一）
    const caseDiff = {
      model: "m",
      messages: [readCall("c1", "/A.js"), toolResult("c1", "A"), readCall("c2", "/a.js"), toolResult("c2", "B")],
    }
    check("路径大小写不同 → 不折叠", apply(caseDiff, ctxFor("chat"), { enabled: true }) === false)
  }

  // ---- 开关语义：pipeline.strategyEnabled 决定开不开，引擎内只认显式 false ----
  {
    const body = readTwice()
    check("cfg 空（pipeline 已放行）→ 正常折叠", apply(body, ctxFor("chat"), {}) === true)
    check("空 cfg 确实折叠了旧 read", body.messages[2].content === stubFor("/src/app.js"))

    const off = readTwice()
    check("enabled:false → false", apply(off, ctxFor("chat"), { enabled: false }) === false)
    check("enabled:false 时 body 未被改动", off.messages[2].content.startsWith("ORIGINAL"))
  }

  // ---- stub 选项 ----
  {
    const b1 = readTwice()
    apply(b1, ctxFor("chat"), { enabled: true, keepStub: false })
    check("keepStub:false → 清空", b1.messages[2].content === "")

    const b2 = readTwice()
    apply(b2, ctxFor("chat"), { enabled: true, stubKeepSummary: true, stubChars: 20 })
    const stub = b2.messages[2].content
    check("stubKeepSummary 带字符数", stub.includes("chars /") && stub.includes("starts:"), stub)
    check("stub 摘要受 stubChars 限制", stub.length < stubFor("/src/app.js").length + 80, String(stub.length))

    const b3 = readTwice()
    apply(b3, ctxFor("chat"), { enabled: true, readToolNames: ["peek"] })
    check("自定义 readToolNames 覆盖内置 → 不折叠", b3.messages[2].content.startsWith("ORIGINAL"))
    const b4 = readTwice()
    const custom = {
      model: "m",
      messages: [
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "peek", arguments: '{"path":"/x"}' } }] },
        toolResult("c1", "OLD"),
        { role: "assistant", content: null, tool_calls: [{ id: "c2", type: "function", function: { name: "peek", arguments: '{"path":"/x"}' } }] },
        toolResult("c2", "NEW"),
      ],
    }
    check("自定义 readToolNames 生效", apply(custom, ctxFor("chat"), { enabled: true, readToolNames: ["peek"] }) === true && custom.messages[1].content === stubFor("/x"))
  }

  // ---- anthropic 形状 ----
  {
    const body = {
      model: "m",
      messages: [
        { role: "user", content: "读文件" },
        { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "read", input: { file_path: "/a.py" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "OLD PY ".repeat(50) }] },
        { role: "assistant", content: [{ type: "tool_use", id: "t2", name: "read", input: { file_path: "/a.py" } }] },
        { role: "user", content: [{ type: "tool_result", tool_use_id: "t2", content: "NEW PY" }] },
      ],
    }
    const changed = apply(body, ctxFor("anthropic"), { enabled: true })
    check("anthropic tool_result 折叠", changed === true)
    check("旧 tool_result 变 stub", body.messages[2].content[0].content === stubFor("/a.py"))
    check("新 tool_result 保留", body.messages[4].content[0].content === "NEW PY")
  }

  // ---- responses 形状 ----
  {
    const body = {
      model: "m",
      input: [
        { type: "message", role: "user", content: [{ type: "input_text", text: "读文件" }] },
        { type: "function_call", call_id: "f1", name: "read", arguments: '{"file_path":"/r.ts"}' },
        { type: "function_call_output", call_id: "f1", output: "OLD TS ".repeat(50) },
        { type: "function_call", call_id: "f2", name: "read", arguments: '{"file_path":"/r.ts"}' },
        { type: "function_call_output", call_id: "f2", output: "NEW TS" },
      ],
    }
    const changed = apply(body, ctxFor("responses"), { enabled: true })
    check("responses function_call_output 折叠", changed === true)
    check("旧 output 变 stub", body.input[2].output === stubFor("/r.ts"))
    check("新 output 保留", body.input[4].output === "NEW TS")
  }

  // ---- gemini / 未知协议 fail-open ----
  {
    const body = { contents: [{ role: "user", parts: [{ text: "hi" }] }] }
    check("gemini → false", apply(body, ctxFor("gemini"), { enabled: true }) === false)
    check("未知协议 → false", apply(readTwice(), ctxFor("weird"), { enabled: true }) === false)
  }

  // ---- 畸形输入不抛 ----
  {
    for (const bad of [null, undefined, 0, "str", [], true]) {
      let threw = false
      let r = null
      try {
        r = apply(bad, ctxFor("chat"), { enabled: true })
      } catch {
        threw = true
      }
      check(`畸形输入不抛 (${JSON.stringify(bad) ?? "undefined"})`, threw === false && r === false)
    }
    const weird = {
      model: "m",
      messages: [
        { role: "assistant", tool_calls: [{ id: 1, function: { name: "read", arguments: "{bad json" } }] },
        { role: "tool", tool_call_id: "c1", content: 42 },
        { role: "tool", tool_call_id: null },
        "not-a-message",
        { role: "assistant", content: [{ type: "tool_use", id: "x" }] },
      ],
    }
    let threw = false
    try {
      apply(weird, ctxFor("chat"), { enabled: true })
    } catch {
      threw = true
    }
    check("怪形状不抛", threw === false)
    check("messages 为空 → false", apply({ model: "m", messages: [] }, ctxFor("chat"), { enabled: true }) === false)
    check("content 非字符串 content 不抛", replaceResultText(42, "s") === "s")
  }

  // ---- 纯函数层 ----
  {
    const messages = readTwice().messages
    const { invocations, readPathByCallId } = extractInvocations(messages)
    check("extractInvocations 收集 2 次 read", invocations.length === 2 && invocations[0].kind === "read")
    const superseded = findSupersededReadCallIds(invocations)
    check("只有旧的被取代", superseded.has("c1") && !superseded.has("c2"))
    const r = collapseSupersededReads(messages, superseded, readPathByCallId, { keepStub: true })
    check("collapse 计数 1", r.collapsedCount === 1)
    check("collapse 不原地改原数组", messages[2].content.startsWith("ORIGINAL"))
    // responses 层
    const items = [
      { type: "function_call", call_id: "f1", name: "read", arguments: '{"path":"/z"}' },
      { type: "function_call", call_id: "f2", name: "read", arguments: '{"path":"/z"}' },
    ]
    const ri = extractResponseInvocations(items)
    check("extractResponseInvocations", ri.invocations.length === 2 && ri.readPathByCallId.get("f1") === "/z")
    const rs = findSupersededReadCallIds(ri.invocations)
    const rr = collapseResponseOutputs(items, rs, ri.readPathByCallId, {})
    check("无 output 项时不计数", rr.collapsedCount === 0)
  }

  // ---- 实测压缩率 ----
  {
    const body = readTwice()
    const before = bodyChars(body)
    const r = applyReadLifecycle(body, { enabled: true }, { protocol: "chat" })
    const after = bodyChars(body)
    const pct = ((before - after) / before) * 100
    console.log(`  info  两次 Read 同一文件：${before} → ${after} 字节（${pct.toFixed(2)}%），折叠 ${r.collapsedCount} 处`)
    check("有实际节省", pct > 20, `${pct.toFixed(2)}%`)
  }
  // ---- 与 session-dedup 同时开启：不能把内容压成两个互相指向的标记 ----
  // 旧顺序里 session-dedup(3) 先跑：它把第二次 Read 换成引用，指向第一次的内容；
  // 随后 read-lifecycle(22) 又把第一次 Read 折叠成 stub，于是引用指向 stub，
  // 文件内容从请求里彻底消失。现在 read-lifecycle 排在前面(2)，先折叠再让 dedup 看最终文本。
  {
    const long = "FILE CONTENT LINE ".repeat(80)
    const body = {
      model: "m",
      messages: [
        { role: "user", content: "读两次同一个文件" },
        readCall("c1", "/src/app.js"),
        toolResult("c1", long),
        readCall("c2", "/src/app.js"),
        toolResult("c2", long),
      ],
    }
    const strategies = Object.fromEntries(ENGINES.map((e) => [e.id, false]))
    strategies["read-lifecycle"] = true
    strategies["session-dedup"] = true
    runPipeline(body, ctxFor("chat"), { preserve: { system: false, lastTurns: 0 }, strategies })
    const text = JSON.stringify(body)
    const hasContent = text.includes("FILE CONTENT LINE")
    const stubs = (text.match(/read superseded/g) || []).length
    check("RL+dedup 文件内容至少完整保留一份", hasContent, `stubs=${stubs}`)
    check("RL+dedup 不会两个都变成标记", !(stubs > 0 && !hasContent))
  }
}
