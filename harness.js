// harness.js — 唯一的“调用方能否取回 CCR 原文”判定。
//
// 为什么要有这个文件：这个判定原先在 engines/ccr/index.js 和
// engines/session-dedup.js 里各抄了一份。2026-11-02 修 MCP 单下划线、11-03 修连字符，
// 两次都得同时改两处；只改一处就会“这个 harness 好了、那个又坏了”。判定还只认
// body.tools 的精确形状，客户端一升级（把 MCP 工具改成 ToolSearch 延迟加载）就静默
// 变成 no_retrieve_tool，测试全绿、线上 0 命中。现在只有这一份实现，两个引擎都从
// 这里 import，test/harness-matrix.test.mjs 逐 harness 钉死形状。
//
// 判定顺序：直接声明 → 代码工具间接可达 → 延迟工具（ToolSearch 列表）→ 不可达。
// 三条都只读工具契约（tools[] / tool_search_output.tools / system / instructions），
// 不扫描用户对话或普通工具返回正文：提到工具名不代表能调用。

export const CCR_RETRIEVE_TOOL_NAME = "omniroute_ccr_retrieve"

/** MCP 网关会加命名空间前缀，历史上出现过的分隔符都在这里。 */
export const CCR_RETRIEVE_TOOL_NAME_SEPARATORS = ["__", "_", ".", "/", ":", "-"]

/** 精确名或分隔符边界上的尾段匹配。 */
export function matchesRetrieveToolName(name) {
  if (typeof name !== "string") return false
  if (name === CCR_RETRIEVE_TOOL_NAME) return true
  return CCR_RETRIEVE_TOOL_NAME_SEPARATORS.some((sep) =>
    name.endsWith(`${sep}${CCR_RETRIEVE_TOOL_NAME}`)
  )
}

// 兼容旧名字：引擎和测试都曾导出 matchesCcrRetrieveToolName。
export const matchesCcrRetrieveToolName = matchesRetrieveToolName

/** 从任意协议的 tool 条目里取出名字（anthropic / chat / responses）。 */
function toolNames(tool) {
  const out = []
  if (!tool || typeof tool !== "object") return out
  if (tool.type === "namespace") {
    if (Array.isArray(tool.tools)) {
      for (const nested of tool.tools) out.push(...toolNames(nested))
    }
    return out
  }
  if (typeof tool.name === "string") out.push(tool.name)
  if (tool.function && typeof tool.function.name === "string") out.push(tool.function.name)
  // Responses API：{ type: "mcp", server_label: "ccr-retrieve" } 不写全名。
  if (tool.type === "mcp" && ["ccr-retrieve", "ccr_retrieve"].includes(tool.server_label)) {
    out.push(`mcp__${tool.server_label}__${CCR_RETRIEVE_TOOL_NAME}`)
  }
  return out
}

/** 当前 tools[] 或 Responses 已加载的工具定义里是否声明了 retrieve。 */
export function callerSupportsDirectRetrieve(body) {
  const tools = body && body["tools"]
  if (Array.isArray(tools) && tools.some((tool) => toolNames(tool).some(matchesRetrieveToolName))) return true
  const input = body && body["input"]
  return Array.isArray(input) && input.some((item) =>
    item?.type === "tool_search_output" && Array.isArray(item.tools) &&
    item.tools.some((tool) => toolNames(tool).some(matchesRetrieveToolName))
  )
}

// 兼容旧名字。
export const callerSupportsCcrRetrieve = callerSupportsDirectRetrieve

/** 各 agent 的 code tool 调用提示词。 */
export const INDIRECT_CALL_HINTS = {
  omp: 'from your code tool (e.g. `eval`), call `tool.mcp__ccr_retrieve_omniroute_ccr_retrieve({ hash })`',
  opencode: 'from your code tool (e.g. `execute`), call `mcp__ccr_retrieve_omniroute_ccr_retrieve({ hash })`',
  pi: 'from your code tool (e.g. `eval`), call `tool.mcp__ccr_retrieve_omniroute_ccr_retrieve({ hash })`',
}

/** 有 code tool 的 agent 白名单。 */
const INDIRECT_CAPABLE_AGENTS = new Set(Object.keys(INDIRECT_CALL_HINTS))

/** 代码执行工具名（出现即认为调用方能间接调 retrieve）。 */
const CODE_TOOL_NAMES = new Set([
  "eval",
  "execute",
  "exec",
  "exec_command",
  "run_code",
  "run_command",
  "bash",
])

/**
 * 调用方没有直接声明 retrieve 工具，但有代码执行工具且 agent 在白名单里 → 间接可达。
 * 返回 null（不可达）或 { callHint }（可达，附调用提示）。
 */
export function callerReachesRetrieveIndirectly(body, agent) {
  const agentName = (agent || "").toLowerCase().trim()
  if (!INDIRECT_CAPABLE_AGENTS.has(agentName)) return null
  const tools = body && body["tools"]
  if (!Array.isArray(tools)) return null
  const hasCodeTool = tools.some((tool) =>
    toolNames(tool).some((name) => CODE_TOOL_NAMES.has(name.toLowerCase()))
  )
  if (!hasCodeTool) return null
  return { callHint: INDIRECT_CALL_HINTS[agentName] }
}

// ─── 延迟工具（deferred / ToolSearch） ──────────────────────────────────────
//
// Claude Code 2.1.3xx 起会把 MCP 工具从 tools[] 里拿掉，只在 system prompt 里留一份
// 名字清单，模型先调 ToolSearch 把 schema 加载进来再调用。对这类调用方：
//   - body.tools 里没有 retrieve 名 → 直接判定失败（11-04 Claude Code 0% 的原因）
//   - system prompt 里有一行恰好是工具全名 → 模型确实能取回
// 判定要求“延迟工具清单”和“名字单独成行”同时成立，避免把正文里的提及误判成能力。

const DEFERRED_MARKER_RE = /\bdeferred\s+tools?\b|\btool[\s_-]?search\b/i

/** 工具契约文本：只取 system / instructions 与 system/developer 消息；不扫其它消息正文。 */
function contractTexts(body) {
  const out = []
  if (!body || typeof body !== "object") return out
  const take = (value) => {
    if (typeof value === "string") out.push(value)
  }
  take(body.system)
  take(body.instructions)
  if (Array.isArray(body.system)) {
    for (const part of body.system) {
      if (part && typeof part.text === "string") out.push(part.text)
    }
  }
  // chat 的 messages 与 Responses 的 input 都可携带可信工具清单。
  for (const messages of [body.messages, body.input]) {
    if (!Array.isArray(messages)) continue
    for (const msg of messages) {
      if (!msg || (msg.role !== "system" && msg.role !== "developer")) continue
      if (messages === body.input && msg.type !== undefined && msg.type !== "message") continue
      take(msg.content)
      // Text blocks carry the same trusted contract as string system messages.
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (!part || typeof part !== "object") continue
          if (part.type !== "text" && part.type !== "input_text") continue
          take(part.text)
        }
      }
    }
  }
  return out
}

/** 在工具清单里找“单独成行”的 retrieve 标识符。 */
function listedRetrieveIdentifier(text) {
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim().replace(/^[-*+]\s+/, "")
    if (!line) continue
    // 允许名字后跟空白 + 说明，但不允许嵌入句子中间。
    const firstToken = line.split(/\s+/)[0]
    if (matchesRetrieveToolName(firstToken)) return firstToken
  }
  return null
}

/**
 * 延迟加载的 retrieve 工具是否可达。返回 null 或 { callHint, toolName }。
 */
export function callerAdvertisesDeferredRetrieve(body) {
  const texts = contractTexts(body)
  if (texts.length === 0) return null
  const hasDeferredMarker = texts.some((text) => DEFERRED_MARKER_RE.test(text))
  if (!hasDeferredMarker) return null
  for (const text of texts) {
    const name = listedRetrieveIdentifier(text)
    if (name) {
      return {
        toolName: name,
        callHint: `use ToolSearch to load the \`${name}\` tool, then call it with the hash`,
      }
    }
  }
  return null
}

/**
 * 统一的取回能力判定。
 * 返回 { mode: "direct" | "indirect" | "deferred" | "none", callHint?, toolName? }。
 *
 * @param {object} body  请求体
 * @param {string} agent 宿主上报的 agent 名（间接可达白名单用）
 */
export function detectRetrieveCapability(body, agent) {
  if (callerSupportsDirectRetrieve(body)) return { mode: "direct" }
  const indirect = callerReachesRetrieveIndirectly(body, agent)
  if (indirect) return { mode: "indirect", callHint: indirect.callHint }
  const deferred = callerAdvertisesDeferredRetrieve(body)
  if (deferred) return { mode: "deferred", callHint: deferred.callHint, toolName: deferred.toolName }
  return { mode: "none" }
}

/** 便捷布尔：调用方在任何一条路径上都能取回。 */
export function callerCanRetrieve(body, agent) {
  return detectRetrieveCapability(body, agent).mode !== "none"
}
