// engines/lite.js — OmniRoute lite 引擎的逐字移植（纯 JS，moejs 兼容）。
// 依据: open-sse/services/compression/lite.ts（336 行），规格书见 test/lite-spec.md。
//
// 与 OmniRoute 原版的差异（仅环境适配，行为一致）：
//   1. process.env.OMNIROUTE_LITE_MAX_TOOL_LENGTH → 配置注入（resolveLiteMaxToolLength 的 fallback 固定 2000）。
//   2. Array.prototype.findLastIndex（ES2023）→ 手写从尾扫描循环。
//   3. createCompressionStats 用 chars/4 最小版（原版 tiktoken/omniglyph 只影响遥测，不影响压缩行为）。
//   4. truncateToolText 改为头尾各留一半（原版只留头部）。工具输出的结尾（报错行、结论、
//      命令最后一段、tail 日志）往往正是模型要的；只留头部会让模型重读同一文件。
//      词边界规则不变，超长文本的总长度仍是 maxLength + 标记长度。
//
// 协议覆盖：OmniRoute 原版只认 body.messages（chat 与 anthropic 都有 messages；
// anthropic 的 content blocks / tool_result 原版原生支持）。responses / gemini 没有
// messages 数组，中间件层会用 adapter 只对文本段做 whitespace 折叠（无损子集）。

const DEFAULT_MAX_TOOL_LENGTH = 2000
const MIN_MAX_TOOL_LENGTH = 256
const MAX_MAX_TOOL_LENGTH = 1000000
const TOOL_TRUNCATION_LOOKBACK = 80
// 中间省略标记：拼接在「保留下来的头部」之后、「保留下来的尾部」之前。
const TRUNCATION_SUFFIX = "\n...[truncated]"

// ---------------------------------------------------------------------------
// isVisionModelId — visionModels.ts 逐字移植（§2.3 / §6.1）
// ---------------------------------------------------------------------------

const VISION_MODEL_ID_FRAGMENTS = [
  "pixtral", "llava", "bakllava",
  "qwen-vl", "qwen2-vl", "qwen2.5-vl", "qwen3-vl",
  "qvq", "internvl", "minicpm-v", "moondream", "mimo-vl",
  "mimo-v2.5",
  "mimo-v2.6-pro", "mimo-v2.6-flash",
  "step-3.7-flash",
  "kimi-vl",
  "glm-4v", "glm-4.5v", "glm-4.6v", "glm-5.3",
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-4-vision", "gpt-5",
  "gemini-1.5", "gemini-2", "gemini-3", "gemini-4", "gemini-exp",
  "claude-3", "claude-fable", "claude-opus-4", "claude-sonnet-4", "claude-haiku-4",
  "claude-fable", // 原列表确实重复，原样保留
  "mistral-medium-3", "minimax-m3",
  "kimi-k2.",
  "hcx-005",
  "-vision", "multimodal",
]

export function isVisionModelId(modelId) {
  if (!modelId) return false
  const normalized = String(modelId).toLowerCase()
  if (/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i.test(normalized)) return false
  if (/(?:^|\/)mimo-v2-pro(?:$|[:/])/i.test(normalized)) return false
  return VISION_MODEL_ID_FRAGMENTS.some((f) => normalized.includes(f))
}

// ---------------------------------------------------------------------------
// maxToolLength 解析（§5.0–5.2；envInt 的 process.env 替换为固定 fallback）
// ---------------------------------------------------------------------------

export function isUsableLiteMaxToolLength(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return false
  const n = Math.floor(value)
  return n >= MIN_MAX_TOOL_LENGTH && n <= MAX_MAX_TOOL_LENGTH
}

export function resolveLiteMaxToolLength(maxToolLength) {
  if (isUsableLiteMaxToolLength(maxToolLength)) return Math.floor(maxToolLength)
  return DEFAULT_MAX_TOOL_LENGTH
}

// ---------------------------------------------------------------------------
// 步骤1 collapseWhitespace（§5.3 / §5.5）
// ---------------------------------------------------------------------------

// 正在发送的这一轮 = 最后一条 assistant 之后的消息；没有 assistant 时整段都算当前轮。
// 这条语义与社区 history-trim 0.1.0 的 turnStart() 一致：那一轮已经发出去了，不该被改写。
function turnStart(messages) {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i] && messages[i].role === "assistant") return i + 1
  }
  return 0
}

function isHighSurrogate(code) {
  return code >= 0xd800 && code <= 0xdbff
}

function isLowSurrogate(code) {
  return code >= 0xdc00 && code <= 0xdfff
}

// 切点落在 emoji 等代理对中间时回退一位，避免切出半个字符。
function avoidSplitSurrogate(text, cutIndex) {
  if (cutIndex <= 0 || cutIndex >= text.length) return cutIndex
  if (isHighSurrogate(text.charCodeAt(cutIndex - 1)) && isLowSurrogate(text.charCodeAt(cutIndex))) {
    return cutIndex - 1
  }
  return cutIndex
}

// 键排序后的深拷贝，用于「整条消息每个字段都相等」的判断。
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical)
  if (value && typeof value === "object") {
    const out = {}
    for (const key of Object.keys(value).sort()) out[key] = canonical(value[key])
    return out
  }
  return value
}

function normalizeMessageWhitespace(content) {
  if (!content) return ""
  return content.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "")
}

export function collapseWhitespace(body, options) {
  options = options || {}
  if (!body.messages) return { body, applied: false }
  let applied = false
  const messages = body.messages.map((msg) => {
    if (options.preserveSystemPrompt === true && msg.role === "system") return msg
    if (typeof msg.content !== "string") return msg
    const normalized = normalizeMessageWhitespace(msg.content)
    if (normalized !== msg.content) applied = true
    return { ...msg, content: normalized }
  })
  return { body: { ...body, messages }, applied }
}

// ---------------------------------------------------------------------------
// 步骤2 dedupSystemPrompt（§5.6）— 键 = 整段 trim 文本，历史内去重
// ---------------------------------------------------------------------------

export function dedupSystemPrompt(body, options) {
  options = options || {}
  if (!body.messages) return { body, applied: false }
  if (options.preserveSystemPrompt === true) return { body, applied: false }
  const seen = new Set()
  let applied = false
  const messages = body.messages.filter((msg) => {
    if (msg.role !== "system" || typeof msg.content !== "string") return true
    // 整段文本相同才算重复：只比前 200 字符会丢掉「开头相同、正文不同」的另一块 system。
    const key = msg.content.trim()
    if (seen.has(key)) {
      applied = true
      return false
    }
    seen.add(key)
    return true
  })
  return { body: { ...body, messages }, applied }
}

// ---------------------------------------------------------------------------
// 步骤3 compressToolResults（§5.7–5.13）
// ---------------------------------------------------------------------------

function isWordChar(char) {
  return char !== undefined && /\S/.test(char)
}

function findWhitespaceBackward(content, cutIndex) {
  const windowStart = Math.max(0, cutIndex - TOOL_TRUNCATION_LOOKBACK)
  for (let i = cutIndex; i > windowStart; i--) {
    if (!isWordChar(content[i - 1])) return i - 1
  }
  return -1
}

function findWhitespaceForward(content, cutIndex) {
  const windowEnd = Math.min(content.length, cutIndex + TOOL_TRUNCATION_LOOKBACK)
  for (let i = cutIndex; i < windowEnd; i++) {
    if (!isWordChar(content[i])) return i
  }
  return -1
}

function backOffToWordBoundary(content, cutIndex) {
  const onWordBoundary = !isWordChar(content[cutIndex - 1]) || !isWordChar(content[cutIndex])
  if (onWordBoundary) return cutIndex
  const backward = findWhitespaceBackward(content, cutIndex)
  if (backward !== -1) return backward
  const forward = findWhitespaceForward(content, cutIndex)
  if (forward !== -1) return forward
  return cutIndex
}

function truncateToolText(text, maxLength) {
  if (typeof text !== "string" || text.length <= maxLength) return text
  // 与 #423 定下的行为逐字一致：只留头部，末尾用 suffix 标明省略。
  // 切点先退到词边界，再避让代理对——半个代理对会让请求体在 UTF-8 层非法。
  const cutIndex = avoidSplitSurrogate(text, backOffToWordBoundary(text, maxLength))
  return text.slice(0, cutIndex) + TRUNCATION_SUFFIX
}

function truncateToolResultBlocks(msg, maxLength) {
  if (msg.role !== "user" || !Array.isArray(msg.content)) {
    return { message: msg, applied: false }
  }
  let applied = false
  const content = msg.content.map((block) => {
    if (!block || typeof block !== "object" || block.type !== "tool_result") return block
    const inner = block.content
    if (typeof inner === "string") {
      if (inner.length <= maxLength) return block
      applied = true
      return { ...block, content: truncateToolText(inner, maxLength) }
    }
    if (Array.isArray(inner)) {
      let innerApplied = false
      const newInner = inner.map((part) => {
        if (!part || typeof part !== "object" || part.type !== "text") return part
        if (typeof part.text !== "string" || part.text.length <= maxLength) return part
        innerApplied = true
        return { ...part, text: truncateToolText(part.text, maxLength) }
      })
      if (innerApplied) {
        applied = true
        return { ...block, content: newInner }
      }
      return block
    }
    return block
  })
  if (applied) return { message: { ...msg, content }, applied: true }
  return { message: msg, applied: false }
}

export function compressToolResults(body, options) {
  options = options || {}
  if (!body.messages) return { body, applied: false }
  const MAX_TOOL_LENGTH = resolveLiteMaxToolLength(options.maxToolLength)
  // 传进来的 body 已经是「历史」——正在发送的那一轮由 applyLiteCompression 切走，
  // 所以这里整段都可截。核算一次 turnStart 会把历史末尾那截（最后一个 assistant
  // 之后）误判成当前轮而放过，试压台的 treatAllAsHistory 就因此少截一段。
  let applied = false
  const messages = body.messages.map((msg) => {
    if (!msg || typeof msg !== "object") return msg
    if (msg.role === "tool" && typeof msg.content === "string") {
      if (msg.content.length <= MAX_TOOL_LENGTH) return msg
      applied = true
      return { ...msg, content: truncateToolText(msg.content, MAX_TOOL_LENGTH) }
    }
    const r = truncateToolResultBlocks(msg, MAX_TOOL_LENGTH)
    if (r.applied) applied = true
    return r.message
  })
  return { body: { ...body, messages }, applied }
}

// ---------------------------------------------------------------------------
// 步骤4 removeRedundantContent（§5.14）— 与「原始数组」前一条全等才删
// ---------------------------------------------------------------------------

export function removeRedundantContent(body, options) {
  options = options || {}
  if (!body.messages) return { body, applied: false }
  let applied = false
  const messages = []
  for (let i = 0; i < body.messages.length; i++) {
    const msg = body.messages[i]
    if (options.preserveSystemPrompt === true && msg.role === "system") {
      messages.push(msg)
      continue
    }
    const prev = i > 0 ? body.messages[i - 1] : undefined
    // 整条消息每个字段都相等才算重复：只比 content 会误删「只有 tool_calls 不同」的两条。
    // 与维护者合并版一致：不比 content 的类型，canonical 比的是全部字段，
    // 两条数组 content 完全相同就是真的重复。
    if (
      i > 0 &&
      msg.role !== "tool" &&
      prev && prev.role === msg.role &&
      JSON.stringify(canonical(prev)) === JSON.stringify(canonical(msg))
    ) {
      applied = true
      continue
    }
    messages.push(msg)
  }
  return { body: { ...body, messages }, applied }
}

// ---------------------------------------------------------------------------
// 步骤5 replaceImageUrls（§5.15）— 仅显式 supportsVision===false 触发
// ---------------------------------------------------------------------------

export function replaceImageUrls(body, options) {
  if (!body.messages) return { body, applied: false }
  let supportsVision
  if (typeof options === "string") {
    supportsVision = isVisionModelId(options)
  } else if (options && typeof options === "object") {
    supportsVision = options.supportsVision
  }
  if (supportsVision !== false) return { body, applied: false }
  let applied = false
  const messages = body.messages.map((msg) => {
    if (!Array.isArray(msg.content)) return msg
    const newContent = msg.content.map((part) => {
      if (
        part && typeof part === "object" &&
        part.type === "image_url" &&
        part.image_url && typeof part.image_url === "object" &&
        part.image_url.url
      ) {
        const url = String(part.image_url.url)
        if (url.startsWith("data:image/")) {
          applied = true
          const format = url.slice(url.indexOf("/") + 1, url.indexOf(";")) || "unknown"
          return { type: "text", text: "[image: " + format + "]" }
        }
      }
      return part
    })
    return { ...msg, content: newContent }
  })
  return { body: { ...body, messages }, applied }
}

// ---------------------------------------------------------------------------
// stats（§6.2 最小版：chars/4）
// ---------------------------------------------------------------------------

function estimateTokensMin(value) {
  if (!value) return 0
  const s = typeof value === "string" ? value : JSON.stringify(value)
  return Math.ceil(s.length / 4)
}

export function createCompressionStats(originalBody, compressedBody, mode, techniquesUsed) {
  const originalTokens = estimateTokensMin(originalBody)
  const compressedTokens = estimateTokensMin(compressedBody)
  const savingsPercent =
    originalTokens > 0
      ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 10000) / 100
      : 0
  return { originalTokens, compressedTokens, savingsPercent, techniquesUsed, mode, timestamp: Date.now() }
}

// ---------------------------------------------------------------------------
// 主编排（§5.16）— 管线顺序固定：whitespace → system-dedup → tool-compress
//                  → redundant-remove → image-placeholder
// ---------------------------------------------------------------------------

export function applyLiteCompression(body, options) {
  options = options || {}
  const originalBody = body
  // 正在发送的这一轮原样不动（turnStart 语义）。没有 assistant 时整段都算当前轮，
  // 所以「首轮请求」不会被改写。试压台的输入天生只有一条 user 消息，它属于当前轮，
  // 因此 lab 用 treatAllAsHistory 明确声明「把这段输入当作历史」。
  const messages = Array.isArray(body.messages) ? body.messages : null
  let historyLength = 0
  if (messages) historyLength = options.treatAllAsHistory === true ? messages.length : turnStart(messages)
  const sending = messages ? messages.slice(historyLength) : null
  let current = messages ? { ...body, messages: messages.slice(0, historyLength) } : body
  const techniquesApplied = []

  let r = collapseWhitespace(current, options)
  if (r.applied) techniquesApplied.push("whitespace")
  current = r.body

  r = dedupSystemPrompt(current, options)
  if (r.applied) techniquesApplied.push("system-dedup")
  current = r.body

  if (options.compressToolResults !== false) {
    r = compressToolResults(current, options)
    if (r.applied) techniquesApplied.push("tool-compress")
    current = r.body
  }

  r = removeRedundantContent(current, options)
  if (r.applied) techniquesApplied.push("redundant-remove")
  current = r.body

  const merged = messages ? { ...current, messages: [...current.messages, ...sending] } : current
  // 剥图不是压缩，而是「这个模型读不了图」的兼容处理：正在发送的这一轮也必须剥，
  // 否则请求会带着目标模型读不了的图片发出去。
  r = replaceImageUrls(merged, options)
  if (r.applied) techniquesApplied.push("image-placeholder")
  const final = r.body

  const compressed = techniquesApplied.length > 0
  return {
    body: final,
    compressed,
    techniquesApplied,
    stats: compressed ? createCompressionStats(originalBody, final, "lite", techniquesApplied) : null,
  }
}

// ---------------------------------------------------------------------------
// 中间件引擎包装：适配 magpie 原地改写契约。
// cfg 来自 package.json 的 magpie.options.strategies.lite 同层配置。
//
// 适配差异（已记录）：OmniRoute 原版只处理 body.messages（chat/anthropic）。
// responses / gemini 没有 messages 数组时，这里退化为只对适配层文本段做
// 无损 whitespace 折叠（preserveSystemPrompt 语义保持），其余步骤不做。
// ---------------------------------------------------------------------------

import { conversationView } from "../adapter.js"

export const id = "lite"
export const defaultOn = true

export function apply(body, ctx, cfg) {
  if (!body || typeof body !== "object") return false
  const opts = {
    preserveSystemPrompt: cfg && cfg.preserveSystemPrompt === true,
    compressToolResults: !(cfg && cfg.compressToolResults === false),
    maxToolLength: cfg ? cfg.maxToolLength : undefined,
    // 试压台专用：把输入整段当作历史（生产路径不设，正在发送的那一轮不动）。
    treatAllAsHistory: !!(cfg && cfg.treatAllAsHistory === true),
    // supportsVision 默认按目标模型自动判定；配置可显式覆盖（true/false）
    supportsVision:
      cfg && typeof cfg.supportsVision === "boolean"
        ? cfg.supportsVision
        : isVisionModelId(body.model),
  }
  if (Array.isArray(body.messages)) {
    const r = applyLiteCompression(body, opts)
    if (!r.compressed) return false
    body.messages = r.body.messages
    if (ctx && ctx.state) ctx.state.lite = { techniques: r.techniquesApplied, stats: r.stats }
    return true
  }
  const view = conversationView(body, ctx && ctx.protocol)
  if (!view) return false
  // 没有 messages 数组的协议（responses / gemini）算不出 turnStart，所以退一步：
  // 最后一条 user 消息就是正在发送的那一轮，它和它之后的段一律原样——这是
  // 维护者对 lite 的原话（PR #423 review 第 3 条：lite 在 Responses body 上会
  // 改写 instructions 和最后一条用户输入）。历史里的段仍然只做空白折叠。
  const segments = view.segments
  let turnFrom = segments.length
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].role === "user") {
      turnFrom = i
      break
    }
  }
  let changed = false
  for (let i = 0; i < segments.length && i < turnFrom; i++) {
    const seg = segments[i]
    if (opts.preserveSystemPrompt === true && seg.role === "system") continue
    const next = normalizeMessageWhitespace(seg.text)
    if (next !== seg.text) {
      seg.set(next)
      changed = true
    }
  }
  if (changed && ctx && ctx.state) ctx.state.lite = { techniques: ["whitespace"], fallback: "segments" }
  return changed
}
