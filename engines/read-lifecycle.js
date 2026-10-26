// engines/read-lifecycle.js — OmniRoute readLifecycle 引擎的纯 JS 移植。
// 依据: open-sse/services/compression/engines/readLifecycle/index.ts（299 行）。
//
// 上游头注释（逐字保留语义）：agentic 会话会把同一个文件反复 Read。当某个路径在**严格更晚**
// 的位置被再次 Read 或被 Write 改动时，早期那次 Read 的工具结果就是过期噪音——把它折叠成一条
// 短 stub，只留最新一次。有损 + 需显式开启（默认关）。只匹配已知的 Read/Write 工具名，路径
// 精确比较，fail-open：任何意外形状都不动。
//
// 与上游的差异：
//   1. 协议遍历统一走 adapter.js 的 conversationView（契约要求），因此除上游的
//      Anthropic `tool_use`/`tool_result` 与 OpenAI `tool_calls`/`role:"tool"` 之外，
//      额外支持 responses 协议的 `function_call` / `function_call_output`（按 call_id 配对）。
//      gemini 的工具调用没有稳定 call id，无法按 id 折叠结果 → 直接返回 false（不做猜测）。
//   2. createCompressionStats → 本地 chars/4 估算（只影响遥测，与 session-dedup 移植同一处理）。
//   3. **幂等化**：内容已经是同一条 stub 时不再改写、也不再计入 collapsedCount。上游每轮都会
//      重写一遍并报 collapsedCount>0，导致"零收益但永远 compressed:true"；这里修掉了这个坑。
//   4. config schema 在只有 enabled 的上游基础上，补了 catalog 要求的 stub 相关键
//      （keepStub / stubChars / stubKeepSummary）与工具名列表（readToolNames / writeToolNames）。
//      工具名列表为空 = 用上游内置集合；非空 = 替换内置集合（要加自定义名字就整列列出来）。
//   5. stackPriority：上游 engine 元数据写的是 5（"跑在内容引擎之前"），但 catalog.js 已把
//      read-lifecycle 锁在 22（catalog 禁改），本模块导出的 stackPriority 跟随 catalog = 22，
//      实际执行顺序由 catalog 的 ORDER 决定。上游的 5 只作为设计意图记录在这里。
//   6. 砍掉的东西：EngineConfigField 的 validate()（pipeline 不做校验）、metadata 里的
//      targetLatencyMs/supportsPreview/stable（面板不用）、apply 里对 stepConfig 的解构糖。
//   7. **开关语义下移**：上游在 apply 里判 stepConfig.enabled !== true 才算开启；本插件里
//      "开不开"由 pipeline.strategyEnabled(catalog 的 defaultOn:false) 决定，引擎内若再要求
//      enabled===true，pipeline 把 default-off 引擎打开后仍会被二次门控挡掉（实测 0% 收益）。
//      因此内部只认显式 enabled:false。

import { conversationView } from "../adapter.js"

// ─── 元数据（与 catalog.js 的 read-lifecycle 条目逐字一致） ───────────────────

export const id = "read-lifecycle"
export const label = "Read Lifecycle"
export const why = "同一个文件被反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。"
export const description =
  "Collapses stale/superseded file-Read tool results: when the same path is re-read or modified later in the conversation, earlier Reads are replaced with a short stub, keeping the current Read intact. Lossy + opt-in (default off). Supports Anthropic and OpenAI tool shapes."
export const lossy = true
export const cacheImpact = "moderate"
export const defaultOn = false
export const stackPriority = 22 // 上游 5；catalog 锁定 22，见文件头第 5 条
export const isSingleMode = false
export const levels = undefined
export const available = true

const ENGINE_ID = "read-lifecycle"

// ─── 工具名集合（上游逐字，保守的精确小写匹配，避免误折叠） ───────────────────

const READ_NAMES = ["read", "read_file", "readfile", "view", "view_file", "cat"]
const WRITE_NAMES = [
  "write",
  "write_file",
  "writefile",
  "edit",
  "edit_file",
  "multiedit",
  "str_replace",
  "str_replace_editor",
  "str_replace_based_edit_tool",
  "apply_patch",
  "create_file",
  "update_file",
]
/** 上游 stubFor 的路径字段兜底值。 */
const FALLBACK_PATH = "file"
const DEFAULT_STUB_CHARS = 120

export const configSchema = [
  { key: "enabled", type: "boolean", label: "Enabled", defaultValue: true },
  {
    key: "keepStub",
    type: "boolean",
    label: "保留 stub 行",
    description: "关掉后旧 Read 结果被整段清空（最省，但模型看不到任何痕迹）。",
    defaultValue: true,
  },
  {
    key: "stubChars",
    type: "number",
    label: "stub 摘要字符数",
    description: "stubKeepSummary 开启时，摘要里保留原文多少字符；0 = 只给字符/行数。",
    defaultValue: DEFAULT_STUB_CHARS,
    min: 0,
    max: 2000,
  },
  {
    key: "stubKeepSummary",
    type: "boolean",
    label: "stub 保留原文摘要",
    description: "在 stub 行后追加「原 N 字符 / M 行 + 开头片段」，让模型知道被折叠的是什么。",
    defaultValue: false,
  },
  {
    key: "readToolNames",
    type: "multiselect",
    label: "Read 工具名",
    description: "空 = 用内置集合；非空 = 替换内置集合。",
    defaultValue: [],
    options: READ_NAMES.map((name) => ({ value: name, label: name })),
  },
  {
    key: "writeToolNames",
    type: "multiselect",
    label: "Write 工具名",
    description: "空 = 用内置集合；非空 = 替换内置集合。",
    defaultValue: [],
    options: WRITE_NAMES.map((name) => ({ value: name, label: name })),
  },
]

// ─── 基础判定 ───────────────────────────────────────────────────────────────

function isRecord(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v)
}

function toNameSet(list, fallback) {
  if (!Array.isArray(list) || list.length === 0) return new Set(fallback)
  const set = new Set()
  for (const name of list) {
    if (typeof name === "string" && name.trim()) set.add(name.trim().toLowerCase())
  }
  return set.size > 0 ? set : new Set(fallback)
}

function makeNames(cfg) {
  return {
    read: toNameSet(cfg && cfg.readToolNames, READ_NAMES),
    write: toNameSet(cfg && cfg.writeToolNames, WRITE_NAMES),
  }
}

/** 保守的工具名分类（精确、小写）；不在两张表里一律 null。 */
export function classifyTool(name, names) {
  if (typeof name !== "string") return null
  const lc = name.trim().toLowerCase()
  const set = names || { read: new Set(READ_NAMES), write: new Set(WRITE_NAMES) }
  if (set.read.has(lc)) return "read"
  if (set.write.has(lc)) return "write"
  return null
}

/** 从工具入参里取文件路径（上游字段顺序逐字）。 */
export function extractPath(input) {
  if (!isRecord(input)) return null
  for (const key of ["file_path", "path", "filePath", "filename", "file", "target_file"]) {
    const v = input[key]
    if (typeof v === "string" && v.trim()) return v.trim()
  }
  return null
}

/** 入参可能是对象，也可能是 JSON 字符串（OpenAI / responses 的 arguments）。 */
export function parseMaybeJson(value) {
  if (isRecord(value)) return value
  if (typeof value === "string") {
    try {
      return JSON.parse(value)
    } catch {
      return null
    }
  }
  return null
}

// ─── 调用序列收集 ───────────────────────────────────────────────────────────

/**
 * 按会话顺序收集 Read/Write 调用（Anthropic tool_use + OpenAI tool_calls），
 * 同时返回 read callId → path 的映射，供 stub 渲染用。
 */
export function extractInvocations(messages, names) {
  const invocations = []
  const readPathByCallId = new Map()
  let order = 0
  if (!Array.isArray(messages)) return { invocations, readPathByCallId }

  for (const msg of messages) {
    if (!isRecord(msg)) continue
    // Anthropic: content 数组里的 tool_use 块。
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (!isRecord(block) || block.type !== "tool_use") continue
        const kind = classifyTool(block.name, names)
        const callId = typeof block.id === "string" ? block.id : null
        const path = extractPath(block.input)
        if (kind && callId && path) {
          invocations.push({ callId, kind, path, order: order++ })
          if (kind === "read") readPathByCallId.set(callId, path)
        }
      }
    }
    // OpenAI: assistant.tool_calls 数组。
    if (Array.isArray(msg.tool_calls)) {
      for (const call of msg.tool_calls) {
        if (!isRecord(call)) continue
        const fn = isRecord(call.function) ? call.function : null
        const kind = classifyTool(fn && fn.name, names)
        const callId = typeof call.id === "string" ? call.id : null
        const path = extractPath(parseMaybeJson(fn && fn.arguments))
        if (kind && callId && path) {
          invocations.push({ callId, kind, path, order: order++ })
          if (kind === "read") readPathByCallId.set(callId, path)
        }
      }
    }
  }
  return { invocations, readPathByCallId }
}

/** responses 协议：input[] 里的 function_call 项（新增，上游没有）。 */
export function extractResponseInvocations(items, names) {
  const invocations = []
  const readPathByCallId = new Map()
  let order = 0
  if (!Array.isArray(items)) return { invocations, readPathByCallId }

  for (const item of items) {
    if (!isRecord(item) || item.type !== "function_call") continue
    const kind = classifyTool(item.name, names)
    const callId =
      typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : null
    const path = extractPath(parseMaybeJson(item.arguments))
    if (kind && callId && path) {
      invocations.push({ callId, kind, path, order: order++ })
      if (kind === "read") readPathByCallId.set(callId, path)
    }
  }
  return { invocations, readPathByCallId }
}

/**
 * 只有**严格更晚**的调用（Read 或 Write）触及同一路径，才认为这次 Read 被取代。
 * 路径精确比较（不做大小写/分隔符归一，避免误折叠）。
 */
export function findSupersededReadCallIds(invocations) {
  const superseded = new Set()
  if (!Array.isArray(invocations)) return superseded
  for (const inv of invocations) {
    if (inv.kind !== "read") continue
    const hasLater = invocations.some((o) => o.path === inv.path && o.order > inv.order)
    if (hasLater) superseded.add(inv.callId)
  }
  return superseded
}

// ─── stub 渲染 ──────────────────────────────────────────────────────────────

/** 上游 stub 文本逐字。 */
export function stubFor(path) {
  return `[read superseded — "${path}" was re-read or modified later in the conversation; the current content appears below]`
}

function contentToText(content) {
  if (typeof content === "string") return content
  if (Array.isArray(content)) {
    return content
      .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n")
  }
  return ""
}

/** stubKeepSummary 的摘要尾巴（上游没有；见文件头第 4 条）。 */
function summarize(original, maxChars) {
  const text = contentToText(original)
  if (!text) return ""
  const lines = text.split("\n").length
  const head = ` (was ${text.length} chars / ${lines} lines`
  if (!(maxChars > 0)) return `${head})`
  const snippet = text.slice(0, maxChars).replace(/\s+/g, " ").trim()
  return `${head}; starts: "${snippet}${text.length > maxChars ? "…" : ""}")`
}

function buildStub(path, original, opts) {
  const o = opts || {}
  if (o.keepStub === false) return ""
  const base = stubFor(path || FALLBACK_PATH)
  return o.stubKeepSummary === true ? base + summarize(original, o.stubChars) : base
}

/** 内容是否已经是同一条 stub（幂等守卫，见文件头第 3 条）。 */
function alreadyStubbed(content, stub) {
  if (stub === "") return content === "" || content === undefined || content === null
  if (typeof content === "string") return content === stub
  if (Array.isArray(content)) {
    const texts = content
      .filter((part) => isRecord(part) && part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
    return texts.length > 0 && texts.every((t) => t === stub)
  }
  return false
}

/** 替换 tool_result 的内容：字符串直替；内容数组只改 text 块；其它形状给 stub 字符串。 */
export function replaceResultText(content, stub) {
  if (typeof content === "string") return stub
  if (Array.isArray(content)) {
    return content.map((part) =>
      isRecord(part) && part.type === "text" && typeof part.text === "string"
        ? { ...part, text: stub }
        : part
    )
  }
  return stub
}

// ─── 折叠 ───────────────────────────────────────────────────────────────────

/**
 * 把被取代的 Read 结果折叠成 stub（Anthropic tool_result 块 + OpenAI role:"tool" 消息）。
 * 返回新 messages 数组与折叠计数。
 */
export function collapseSupersededReads(messages, superseded, readPathByCallId, opts) {
  if (!(superseded instanceof Set) || superseded.size === 0) {
    return { messages, collapsedCount: 0 }
  }
  if (!Array.isArray(messages)) return { messages, collapsedCount: 0 }
  let collapsedCount = 0

  const out = messages.map((msg) => {
    if (!isRecord(msg)) return msg
    // OpenAI 的 tool 结果消息。
    if (msg.role === "tool" && typeof msg.tool_call_id === "string" && superseded.has(msg.tool_call_id)) {
      const path = (readPathByCallId && readPathByCallId.get(msg.tool_call_id)) || FALLBACK_PATH
      const stub = buildStub(path, msg.content, opts)
      if (alreadyStubbed(msg.content, stub)) return msg
      collapsedCount++
      return { ...msg, content: stub }
    }
    // Anthropic content 数组里的 tool_result 块。
    if (Array.isArray(msg.content)) {
      let changed = false
      const newContent = msg.content.map((block) => {
        if (
          !isRecord(block) ||
          block.type !== "tool_result" ||
          typeof block.tool_use_id !== "string" ||
          !superseded.has(block.tool_use_id)
        ) {
          return block
        }
        const path = (readPathByCallId && readPathByCallId.get(block.tool_use_id)) || FALLBACK_PATH
        const stub = buildStub(path, block.content, opts)
        if (alreadyStubbed(block.content, stub)) return block
        changed = true
        collapsedCount++
        return { ...block, content: replaceResultText(block.content, stub) }
      })
      if (changed) return { ...msg, content: newContent }
    }
    return msg
  })

  return { messages: out, collapsedCount }
}

/** responses 协议：折叠 input[] 里被取代的 function_call_output（新增）。 */
export function collapseResponseOutputs(items, superseded, readPathByCallId, opts) {
  if (!(superseded instanceof Set) || superseded.size === 0) {
    return { items, collapsedCount: 0 }
  }
  if (!Array.isArray(items)) return { items, collapsedCount: 0 }
  let collapsedCount = 0

  const out = items.map((item) => {
    if (!isRecord(item) || item.type !== "function_call_output") return item
    const callId = typeof item.call_id === "string" ? item.call_id : null
    if (!callId || !superseded.has(callId)) return item
    const path = (readPathByCallId && readPathByCallId.get(callId)) || FALLBACK_PATH
    const stub = buildStub(path, item.output, opts)
    if (alreadyStubbed(item.output, stub)) return item
    collapsedCount++
    return { ...item, output: replaceResultText(item.output, stub) }
  })

  return { items: out, collapsedCount }
}

// ─── 主体 ───────────────────────────────────────────────────────────────────

/** 统计用：chars/4 估算（替代上游 createCompressionStats）。 */
function makeStats(originalChars, newChars, durationMs, collapsedCount) {
  const originalTokens = Math.ceil(originalChars / 4)
  const compressedTokens = Math.ceil(newChars / 4)
  return {
    originalTokens,
    compressedTokens,
    savingsPercent:
      originalTokens > 0
        ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 10000) / 100
        : 0,
    techniquesUsed: [ENGINE_ID],
    mode: "stacked",
    timestamp: Date.now(),
    durationMs,
    collapsedCount,
  }
}

function charCountOf(content) {
  if (typeof content === "string") return content.length
  if (Array.isArray(content)) return contentToText(content).length
  return 0
}

/**
 * 纯函数主体。opts: { protocol }
 * 返回 { body, compressed, stats, collapsedCount }
 */
export function applyReadLifecycle(body, cfg, opts) {
  cfg = cfg || {}
  opts = opts || {}
  const empty = { body, compressed: false, stats: null, collapsedCount: 0 }

  // 上游的 opt-in 门控由 pipeline 的 strategyEnabled(catalog defaultOn:false) 承担，
  // 引擎内部只认显式 false，否则 pipeline 把 default-off 引擎打开后仍会被二次门控挡住。
  if (cfg.enabled === false) return empty
  if (!body || typeof body !== "object") return empty

  const view = conversationView(body, opts.protocol)
  if (!view) return empty
  const protocol = view.protocol
  const root = isRecord(view.body) ? view.body : body
  const start = Date.now()
  const names = makeNames(cfg)
  const stubOpts = {
    keepStub: cfg.keepStub !== false,
    stubChars: typeof cfg.stubChars === "number" ? cfg.stubChars : DEFAULT_STUB_CHARS,
    stubKeepSummary: cfg.stubKeepSummary === true,
  }

  let originalChars = 0
  let newChars = 0
  let collapsedCount = 0

  if (protocol === "responses") {
    const items = root.input
    if (!Array.isArray(items) || items.length === 0) return empty
    const { invocations, readPathByCallId } = extractResponseInvocations(items, names)
    const superseded = findSupersededReadCallIds(invocations)
    const r = collapseResponseOutputs(items, superseded, readPathByCallId, stubOpts)
    if (r.collapsedCount === 0) return empty
    collapsedCount = r.collapsedCount
    for (const item of items) if (isRecord(item)) originalChars += charCountOf(item.output)
    for (const item of r.items) if (isRecord(item)) newChars += charCountOf(item.output)
    root.input = r.items
    if (root !== body) body.input = r.items
  } else if (protocol === "chat" || protocol === "anthropic") {
    const messages = root.messages
    if (!Array.isArray(messages) || messages.length === 0) return empty
    const { invocations, readPathByCallId } = extractInvocations(messages, names)
    const superseded = findSupersededReadCallIds(invocations)
    const r = collapseSupersededReads(messages, superseded, readPathByCallId, stubOpts)
    if (r.collapsedCount === 0) return empty
    collapsedCount = r.collapsedCount
    for (const msg of messages) if (isRecord(msg)) originalChars += charCountOf(msg.content)
    for (const msg of r.messages) if (isRecord(msg)) newChars += charCountOf(msg.content)
    root.messages = r.messages
    if (root !== body) body.messages = r.messages
  } else {
    // gemini：工具结果没有稳定 call id，无法按 id 折叠 → fail-open 不动。
    return empty
  }

  const stats = makeStats(originalChars, newChars, Math.round(Date.now() - start), collapsedCount)
  return { body, compressed: true, stats, collapsedCount }
}

// ─── 中间件引擎包装 ─────────────────────────────────────────────────────────

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false
    const ctxObj = ctx || {}
    const r = applyReadLifecycle(body, cfg, { protocol: ctxObj.protocol })
    if (!r.compressed) return false
    if (ctxObj.state) {
      ctxObj.state.readLifecycle = { collapsedCount: r.collapsedCount, stats: r.stats }
    }
    return true
  } catch {
    return false
  }
}

export { ENGINE_ID }
