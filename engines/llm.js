// engines/llm.js — LLM Compressor：用外部模型压缩散文段（占位实现，默认不可用）。
//
// 来源（E:\LLM_Config\OmniRouteDesktop\resources\app\open-sse\services\compression\）：
//   - engines\llm\index.ts  (346 行)  LlmCompressorBackend 契约 / setLlmCompressorBackend /
//                                     processMessages / minTokens 门槛 / LLM_COMPRESSOR_SCHEMA
//   - preservation.ts       (253 行)  extractPreservedBlocks 等墓碑化工具（见下）
//
// ── 这是一个**有意的占位实现，不是漏搬** ─────────────────────────────────────
// 上游 llm/index.ts 头部注释写得很清楚：DEFAULT backend 是 no-op（`const noopBackend =
// async (text) => text`），开箱即用**绝不改动 payload**，永远返回 `compressed:false`；
// 真正的模型要由运维通过 `setLlmCompressorBackend()` 注入。本插件（moejs 运行时）没有
// fetch、没有外部网络、也没有 chat-completion 后端，因此这里把「无 backend = no-op」这条
// 上游语义原样保留，并把 `available` 标成 false：面板上会显示「需要外部模型后端」并置灰。
// 契约面（backend 类型、注入缝、配置校验、墓碑化、fail-open）全部照搬，将来有人接后端
// 只需要调一次 setLlmCompressorBackend，不必重写本文件。
//
// ── 与上游的差异（仅环境适配）───────────────────────────────────────────────
//   1. 遍历方式：上游直接遍历 body.messages 并处理 string / content-block 两种形状；这里走
//      adapter.conversationView(body, protocol) 的 segments（四协议）。system 段一律不动
//      （上游 line 147 同）。
//   2. 同步 apply 是 pass-through（上游 line 269-271：`return { body, compressed:false }`）。
//      中间件契约只认布尔，且 Promise 结果同步拿不到，因此 apply 恒返回 false；真正的工作
//      在导出的 `applyAsync()` 里（与上游 applyAsync 一一对应）。
//   3. preservation.ts 的随机 sentinel 改成模块内单调计数器：moejs 没有 crypto，而
//      Math.random 会让同一输入产生不同占位符。占位符不会外泄（返回前全部还原），所以输出
//      与上游一致，且对 prompt cache 更稳。墓碑化的模式表逐字搬（system-reminder /
//      instructions 信封、frontmatter、围栏代码、行内代码、URL、文件路径、错误行、环境变量、
//      CONST_CASE、版本号、函数调用、点号标识符、markdown 标题/表格/链接、数学块、typst）。
//   4. performance.now() / createCompressionStats 不移植（中间件契约只返回布尔，统计由
//      stats-writer.js 负责）；estimateCompressionTokens 内联为 ceil(len/4)（上游 stats.ts）。
//   5. 配置面：上游 schema 是 {enabled, model, minTokens, compressionRate}，面板
//      （catalog.js）只暴露 {maxChars}。映射：minTokens 固定 2000（上游默认，门槛照旧生效）、
//      compressionRate 固定 0.5、model 固定 ""；maxChars 作为「单个散文窗口外发上限」——
//      超过 maxChars 的散文按换行边界切成多个窗口分别外发再拼回（上游把整段一次外发，
//      这里加窗口是为了守住面板语义；不改动任何 preserved 段）。
//   6. 「是否启用」：上游要求 stepConfig.enabled === true；面板没有 enabled 开关，本移植把
//      「注入了 backend」当作启用信号，两者都必须满足才会真正压缩。
//   7. 零依赖：只用相对 import，无 Node API、无 fetch、无定时器；apply 与 applyAsync 全程
//      try/catch fail-open。

import { conversationView } from "../adapter.js"

// ─── 元数据（catalog.js 是面板真源；stackPriority 取源码明确值 38）──────────────
export const id = "llm"
export const label = "LLM Compressor"
export const why = "用一个 LLM 压缩散文（需要外部模型后端，本插件内无法提供，因此默认不可用）。"
export const lossy = true
export const cacheImpact = "high"
export const defaultOn = false
export const stackPriority = 38
export const isSingleMode = false
export const levels = undefined
// 关键：没有 backend 就是 no-op，所以标成不可用。
export const available = false

// configSchema 逐字取自 catalog.js:269-287。上游 LLM_COMPRESSOR_SCHEMA 的
// {enabled, model, minTokens, compressionRate} 差异见文件头第 5 条。
export const configSchema = [
  {
    key: "maxChars",
    type: "number",
    label: "单段上限",
    description: "交给后端压缩的文本长度上限",
    defaultValue: 4000,
    min: 500,
    max: 20000,
  },
]

// ─── backend 抽象（上游 index.ts:37-66 逐字语义）──────────────────────────────
// LlmCompressorBackend = (text, opts?: { model?, compressionRate? }) => Promise<string>
const noopBackend = async (text) => text

/** 模块级可注入 backend（null = 用 no-op 默认值）。 */
let _backend = null

/** 覆盖 backend —— 供测试与将来接真模型使用。传 null 恢复 no-op。 */
export function setLlmCompressorBackend(b) {
  _backend = typeof b === "function" ? b : null
}

export function getLlmCompressorBackend() {
  return _backend
}

export function hasLlmCompressorBackend() {
  return _backend !== null
}

function resolveBackend() {
  return _backend === null ? noopBackend : _backend
}

const DEFAULT_MIN_TOKENS = 2000
const DEFAULT_COMPRESSION_RATE = 0.5
const DEFAULT_MAX_CHARS = 4000
const MAX_CHARS_FLOOR = 500
const MAX_CHARS_CEIL = 20000

function estimateTokens(text) {
  return Math.ceil(text.length / 4)
}

function clampInt(value, fallback, min, max) {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback
  if (n < min) return min
  if (n > max) return max
  return n
}

// ---------------------------------------------------------------------------
// 墓碑化（preservation.ts 移植）：代码 / 指令信封 / 路径 / 错误行等绝不外发。
// ---------------------------------------------------------------------------

const SENTINEL_PREFIX = "\u0000MAGPIE_LLM"

// 差异 3：上游用 crypto.getRandomValues 生成随机种子；这里用模块内单调计数器，
// 保证同一进程内可复现、且不依赖 crypto / Math.random。
let sentinelCounter = 0

function nextSentinelSeed() {
  sentinelCounter = (sentinelCounter + 1) >>> 0
  return "d" + sentinelCounter
}

function ensureGlobal(pattern) {
  const flags = pattern.flags.indexOf("g") === -1 ? pattern.flags + "g" : pattern.flags
  return new RegExp(pattern.source, flags)
}

function replacePattern(text, pattern, kind, addBlock) {
  pattern.lastIndex = 0
  return text.replace(pattern, (match) => {
    if (!match) return match
    if (match.indexOf(SENTINEL_PREFIX) !== -1) return match
    return addBlock(match, kind)
  })
}

function extractFrontmatter(text, addBlock) {
  if (text.indexOf("---\n") !== 0) return text
  const close = text.indexOf("\n---", 4)
  if (close === -1) return text
  const closeEnd = text.indexOf("\n", close + 4)
  const end = closeEnd === -1 ? text.length : closeEnd + 1
  return addBlock(text.slice(0, end), "frontmatter") + text.slice(end)
}

function extractFencedCodeBlocks(text, addBlock) {
  const lines = text.match(/[^\n]*(?:\n|$)/g) || [text]
  let output = ""
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    if (line === "" && i === lines.length - 1) break
    const opening = line.match(/^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/)
    if (!opening) {
      output += line
      i++
      continue
    }

    const fence = opening[2]
    const fenceChar = fence[0]
    const minLen = fence.length
    let block = line
    let j = i + 1
    let closed = false

    while (j < lines.length) {
      const candidate = lines[j]
      block += candidate
      const closeMatch = candidate.match(/^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/)
      if (closeMatch && closeMatch[2][0] === fenceChar && closeMatch[2].length >= minLen) {
        closed = true
        break
      }
      j++
    }

    if (!closed) {
      output += line
      i++
      continue
    }

    output += addBlock(block, "fenced_code")
    i = j + 1
  }

  return output
}

/** 整段区域模式（指令信封）先跑：它们内部可能再被围栏/行内模式命中，sentinel 会被跳过。 */
const REGION_PATTERNS = [
  { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
  { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
  {
    pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g,
    kind: "system_instruction",
  },
]

/** 行内/块级内置模式表（逐字搬 preservation.ts:111-145）。 */
const BUILTIN_PATTERNS = [
  { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
  { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
  {
    pattern: /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g,
    kind: "math_inline",
  },
  { pattern: /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, kind: "latex_block" },
  { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
  { pattern: /^\s*\|.*\|\s*$/gm, kind: "markdown_table" },
  { pattern: /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, kind: "markdown_table" },
  { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
  { pattern: /`[^`\n]+`/g, kind: "inline_code" },
  { pattern: /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, kind: "markdown_link" },
  { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/gi, kind: "url" },
  { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
  { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b/g, kind: "env_var" },
  { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
  { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
  { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
  { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
  {
    pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g,
    kind: "file_path",
  },
  {
    pattern:
      /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g,
    kind: "error_message",
  },
]

/** 把代码/指令等不可压缩构造替换成占位符，返回 { text, blocks }。 */
export function extractPreservedBlocks(text) {
  const blocks = []
  const seed = nextSentinelSeed()
  let counter = 0

  const addBlock = (content, kind) => {
    const placeholder = SENTINEL_PREFIX + "_" + seed + "_" + counter + "\u0000"
    blocks.push({ placeholder, content, kind })
    counter++
    return placeholder
  }

  let result = text
  result = extractFrontmatter(result, addBlock)
  for (const entry of REGION_PATTERNS) {
    result = replacePattern(result, ensureGlobal(entry.pattern), entry.kind, addBlock)
  }
  result = extractFencedCodeBlocks(result, addBlock)
  for (const entry of BUILTIN_PATTERNS) {
    result = replacePattern(result, ensureGlobal(entry.pattern), entry.kind, addBlock)
  }
  return { text: result, blocks }
}

/** 把占位符还原成原文（与上游 restorePreservedBlocks 等价）。 */
export function restorePreservedBlocks(text, blocks) {
  let result = text
  for (const block of blocks) {
    result = result.split(block.placeholder).join(block.content)
  }
  return result
}

export function findFencedCodeBlocks(text) {
  const found = []
  extractFencedCodeBlocks(text, (content) => {
    found.push(content)
    return content
  })
  return found
}

// ---------------------------------------------------------------------------
// 散文 / preserved 拆分 + 外发压缩
// ---------------------------------------------------------------------------

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

function splitProseAndPreserved(text) {
  const { text: withPlaceholders, blocks } = extractPreservedBlocks(text)
  if (blocks.length === 0) return [{ kind: "prose", text }]

  const placeholderToOriginal = new Map()
  for (const block of blocks) placeholderToOriginal.set(block.placeholder, block.content)
  const escaped = blocks.map((b) => escapeRegExp(b.placeholder))
  const splitRe = new RegExp("(" + escaped.join("|") + ")", "g")

  const segments = []
  for (const part of withPlaceholders.split(splitRe)) {
    if (!part) continue
    const original = placeholderToOriginal.get(part)
    if (original !== undefined) {
      segments.push({ kind: "preserved", text: original })
    } else {
      segments.push({ kind: "prose", text: part })
    }
  }
  return segments
}

/** 差异 5：按 maxChars 在换行边界切窗口，避免一次外发过长散文。 */
function splitByMaxChars(text, maxChars) {
  if (maxChars <= 0 || text.length <= maxChars) return [text]
  const chunks = []
  let rest = text
  while (rest.length > maxChars) {
    let cut = rest.lastIndexOf("\n", maxChars)
    if (cut <= 0) cut = maxChars
    chunks.push(rest.slice(0, cut))
    rest = rest.slice(cut)
  }
  if (rest.length > 0) chunks.push(rest)
  return chunks
}

async function compressProseText(text, backend, opts) {
  if (!text.trim()) return { text, didCompress: false }
  try {
    const compressed = await backend(text, opts)
    // 上游 line 110：只有返回字符串且确实更短才算压缩成功。
    if (typeof compressed === "string" && compressed.length < text.length) {
      return { text: compressed, didCompress: true }
    }
    return { text, didCompress: false }
  } catch {
    return { text, didCompress: false }
  }
}

async function compressMessageText(text, backend, opts, maxChars) {
  const segments = splitProseAndPreserved(text)
  let anyCompressed = false
  const parts = []
  for (const seg of segments) {
    if (seg.kind === "preserved") {
      // 代码 / 指令信封 / 路径：原样拼回，物理上不外发。
      parts.push(seg.text)
      continue
    }
    let proseOut = ""
    for (const chunk of splitByMaxChars(seg.text, maxChars)) {
      const r = await compressProseText(chunk, backend, opts)
      proseOut += r.text
      if (r.didCompress) anyCompressed = true
    }
    parts.push(proseOut)
  }
  return { text: parts.join(""), didCompress: anyCompressed }
}

// ---------------------------------------------------------------------------
// 中间件入口
// ---------------------------------------------------------------------------

/**
 * 同步路径：上游 apply 就是纯 pass-through（index.ts:269-271），这里同样不改 payload。
 * 没有注入 backend 时直接返回 false —— 与「DEFAULT backend 是 no-op」完全一致。
 */
export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false
    // 无 backend → no-op；有 backend 时同步也拿不到 Promise 结果，真正工作在 applyAsync。
    if (_backend === null) return false
    return false
  } catch {
    return false
  }
}

/**
 * 异步路径（上游 applyAsync 的对应物）：注入 backend 后才会真正压缩散文。
 * 返回 { body, compressed, stats }；任何异常都原样返回 body 且 compressed:false。
 */
export async function applyAsync(body, ctx, cfg) {
  const untouched = { body, compressed: false, stats: null }
  try {
    if (!body || typeof body !== "object") return untouched

    // 差异 6：面板没有 enabled 开关，"注入了 backend" 即视为启用。
    if (_backend === null) return untouched

    const view = conversationView(body, ctx && ctx.protocol)
    if (!view) return untouched
    const segments = view.segments
    if (!Array.isArray(segments) || segments.length === 0) return untouched

    const maxChars = clampInt(
      cfg ? cfg.maxChars : undefined,
      DEFAULT_MAX_CHARS,
      MAX_CHARS_FLOOR,
      MAX_CHARS_CEIL
    )

    // 上游 minTokens 门槛：非 system 文本总 token 不到门槛就整体跳过。
    let nonSystemText = ""
    for (const seg of segments) {
      if (seg.role === "system") continue
      if (typeof seg.text === "string") nonSystemText += seg.text + "\n"
    }
    if (DEFAULT_MIN_TOKENS > 0 && estimateTokens(nonSystemText) < DEFAULT_MIN_TOKENS) {
      return untouched
    }

    const backend = resolveBackend()
    const backendOpts = { model: undefined, compressionRate: DEFAULT_COMPRESSION_RATE }

    let compressedCount = 0
    for (const seg of segments) {
      try {
        if (seg.role === "system") continue
        const text = seg.text
        if (typeof text !== "string" || text.length === 0) continue
        const r = await compressMessageText(text, backend, backendOpts, maxChars)
        if (!r.didCompress) continue
        if (r.text.length >= text.length) continue
        seg.set(r.text)
        compressedCount++
      } catch {
        // 单片段失败不影响其它片段
      }
    }

    if (compressedCount === 0) return untouched
    return { body, compressed: true, stats: null }
  } catch {
    return untouched
  }
}
