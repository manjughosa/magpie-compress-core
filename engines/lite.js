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
// 步骤2 dedupSystemPrompt（§5.6）— 键 = trim 后前 200 字符，全局去重
// ---------------------------------------------------------------------------

export function dedupSystemPrompt(body, options) {
  options = options || {}
  if (!body.messages) return { body, applied: false }
  if (options.preserveSystemPrompt === true) return { body, applied: false }
  const seen = new Set()
  let applied = false
  const messages = body.messages.filter((msg) => {
    if (msg.role !== "system" || typeof msg.content !== "string") return true
    const key = msg.content.trim().slice(0, 200)
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
  // 头尾各分一半预算：开头留结构与定位信息，结尾留报错行/结论（模型真正要看的东西）。
  const headBudget = Math.max(1, Math.floor(maxLength / 2))
  const tailBudget = Math.max(1, maxLength - headBudget)
  const headCut = backOffToWordBoundary(text, headBudget)
  const tailStart = text.length - tailBudget
  const tailCut = backOffToWordBoundary(text, tailStart)
  // 文本只超出上限一点点时两段会重叠，此时退回头部截断，避免重复内容。
  if (tailCut <= headCut) return text.slice(0, headCut) + TRUNCATION_SUFFIX
  return text.slice(0, headCut) + TRUNCATION_SUFFIX + text.slice(tailCut)
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
  // findLastIndex 的手写替代（ES2023 → 兼容旧沙箱）
  let lastAssistant = -1
  for (let i = body.messages.length - 1; i >= 0; i--) {
    if (body.messages[i] && body.messages[i].role === "assistant") {
      lastAssistant = i
      break
    }
  }
  const currentTurnStart = lastAssistant === -1 ? body.messages.length : lastAssistant + 1
  let applied = false
  const messages = body.messages.map((msg, index) => {
    if (index >= currentTurnStart) return msg
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
    const contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
    const prev = i > 0 ? body.messages[i - 1] : undefined
    if (
      i > 0 &&
      msg.role !== "tool" &&
      prev && prev.role === msg.role &&
      typeof prev.content === "string" &&
      prev.content === contentStr
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
  let current = body
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

  r = replaceImageUrls(current, options)
  if (r.applied) techniquesApplied.push("image-placeholder")
  current = r.body

  const compressed = techniquesApplied.length > 0
  return {
    body: current,
    compressed,
    techniquesApplied,
    stats: compressed ? createCompressionStats(originalBody, current, "lite", techniquesApplied) : null,
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
  let changed = false
  for (const seg of view.segments) {
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
