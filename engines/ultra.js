// engines/ultra.js — ultra 引擎（启发式 token 级剪枝）的纯 JS 移植。
// 来源: OmniRoute open-sse/services/compression/ultra.ts（321 行，根目录，不在 engines/ 下）
//       + ./ultraHeuristic.ts（178 行）
//       + ./preservation.ts（253 行，仅取 extractPreservedBlocks 一条主路径）
//       + ./types.ts 的 DEFAULT_ULTRA_CONFIG
//       + ./engines/cavemanAdapter.ts 的 ULTRA_SCHEMA（第 65-108 行）
//
// 适配点：
//   1. 上游走 body.messages + extractTextContent/mapTextContent；本模块走
//      conversationView(body, ctx.protocol) 的文本段视图，四协议统一覆盖。
//   2. preservation.ts 的 math_inline 正则依赖 lookbehind `(?<!\$)` / `(?<!\s)`。
//      moejs 运行时无法保证支持 lookbehind（现有 lite.js / headroom.js 零 lookbehind 用法），
//      改写为手写扫描器 replaceMathInline，判定规则逐条对应原正则：
//      起始 $ 前非 $、起始 $ 后非空白/$/数字、中间 1..160 个元素（`\.` 或 [^$\n\\]）、
//      结束 $ 前非空白、结束 $ 后非 $。取「最短满足全部条件的匹配」，与非贪婪语义一致。
//   3. `Map` / `Set` / `RegExp` / `String.prototype.replace` 回调均为标准 ES，moejs 可用。
//   4. maxTokensPerMessage 上游按整条 message 的 text 长度判断；段视图下按单段长度判断，
//      属可接受的近似（段即 message 的单个 text block）。
//   5. 上游返回新 messages 数组；magpie 契约是原地改写，这里用 seg.set() 就地写回。
//
// 砍掉的东西：
//   - SLM 档（ultraTier = "slm"，走 engines/llmlingua/ultraEntry.ts 的 ONNX 推理、
//     worker 后端、prewarm 预热）整档砍掉：依赖 onnxruntime 与 npm 包，moejs 里不存在。
//     只保留 tier = "heuristic" 的同步纯函数路径。
//   - 因此 ULTRA_SCHEMA 里的 `modelPath` 与 `slmFallbackToAggressive` 只作为配置字段保留，
//     本模块不读取、不生效（面板仍会显示，需在 catalog 里标注）。
//   - preservation.ts 的旁路 API（preserveSpans / restorePreservedBlocks / findFencedCodeBlocks）
//     未被 ultra 主路径调用，不移植。
//   - stats 结构（savingsPercent / techniquesUsed / ultraTier）不导出：pipeline 只认布尔返回，
//     统计由 stats-writer.js 统一处理。
//   - rules/{lang}/ultra.json 规则包未移植：ultra.ts 本身不 import 它们（已核实 import 列表），
//     它们属于另一条 caveman/规则引擎路径。
//
// 核心保护（上游注释强调，必须保留）：
//   pruneByScore 若直接跑在全文上，会把代码块里的 `b)`、`{`、`+` 当低分 token 剪掉，
//   留下完好的围栏标记但内部已损坏 —— 「看起来像合法代码但其实不是」（B-ULTRA-CODE）。
//   所以必须先 extractPreservedBlocks 占位化，只对散文剪枝，占位内容逐字还原。

import { conversationView } from "../adapter.js"

const COMPRESSED_PREFIX = "[COMPRESSED:"

// ---------------------------------------------------------------------------
// 词表（ultraHeuristic.ts 逐字）
// ---------------------------------------------------------------------------

const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had",
  // #13454: do/does/did 已移除 —— 祈使句（"do not push"）与否定（"don't"）里承载极性，
  // 剪掉会翻转指令含义。
  "will", "would", "could",
  // #13454: should 已移除 —— 指令中的情态词。
  "may", "might", "shall",
  // #13454: can/need 已移除 —— 指令中的情态助动词。
  "dare", "ought", "used",
  "i", "we", "you", "he", "she", "it", "they",
  "me", "us", "him", "her", "them",
  "my", "our", "your", "his", "its", "their",
  "this", "that", "these", "those",
  "and", "but", "or",
  // #13454: nor 已移除 —— 否定词。
  "for", "yet", "so", "as", "at", "by", "in", "of", "on", "to", "up",
  "via", "with", "from", "into", "onto", "upon", "about",
  "just", "very", "really", "quite", "rather", "also", "too", "even", "still", "already",
  // #13454: always/never 已移除 —— 极性词是指令里信息量最高的 token。
  // "never" 被打 0.1 分正是 #13454 的根因。
  "often", "usually", "sometimes", "here", "there",
])

/** 命中即 1.0 分、永不剪枝。注意：relevance 引擎刻意不用这个模式（见其文件头）。 */
const FORCE_PRESERVE_RE = /\d|https?:\/\/|[._\/\\]|Error:|Exception:|```/i

// #13454: 极性 / 情态 / 否定词，永不剪枝 —— 剪掉会翻转句子含义。
const POLARITY_WORDS = new Set([
  "never", "always", "no", "not", "nor",
  "must", "shall", "shall not",
  "do", "does", "did",
  "don't", "doesn't", "didn't",
  "can", "cannot", "can't",
  "should", "shouldn't",
  "need", "needs", "mustn't",
  "won't", "wouldn't",
  "could", "couldn't",
])

/**
 * 单个 token 的信息量打分：0.0（可剪）到 1.0（必留）。
 */
export function scoreToken(token) {
  if (FORCE_PRESERVE_RE.test(token)) return 1.0
  const lower = token.toLowerCase()
  if (POLARITY_WORDS.has(lower)) return 1.0
  if (STOPWORDS.has(lower)) return 0.1
  if (token.length <= 2) return 0.2
  if (/^[A-Z]/.test(token)) return 0.8 // 专有名词 / 标识符
  if (token.length >= 6) return 0.7
  return 0.5
}

/**
 * 按分数剪枝，保留 keepRate 比例的 word token。
 * @param {string} text
 * @param {number} keepRate 保留比例（0-1），默认 0.5
 * @param {number} minScore 低于此分者成为剪枝候选，默认 0.3
 */
export function pruneByScore(text, keepRate, minScore) {
  const rate = typeof keepRate === "number" ? keepRate : 0.5
  const floor = typeof minScore === "number" ? minScore : 0.3
  if (!text || rate >= 1) return text

  const tokens = text.split(/(\s+)/) // 保留空白 token
  const wordTokens = tokens.filter((t) => !/^\s+$/.test(t))
  const targetKeep = Math.ceil(wordTokens.length * rate)

  const scored = wordTokens.map((t, i) => ({ t, i, score: scoreToken(t) }))

  // 分数升序 —— 最低分先剪
  const sorted = scored.slice().sort((a, b) => a.score - b.score)
  const toPrune = new Set()
  let pruned = 0
  for (const item of sorted) {
    if (pruned >= wordTokens.length - targetKeep) break
    if (item.score < floor) {
      toPrune.add(item.i)
      pruned++
    }
  }

  // 重建时保留空白结构
  let wordIdx = 0
  return tokens
    .map((t) => {
      if (/^\s+$/.test(t)) return t
      const keep = !toPrune.has(wordIdx)
      wordIdx++
      return keep ? t : ""
    })
    .join("")
    // #13454: 只折叠空格与 tab，绝不折叠换行 ——
    // 折叠换行会毁掉项目符号列表、标题和代码围栏。
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

// ---------------------------------------------------------------------------
// 结构化内容保护（preservation.ts 主路径）
// ---------------------------------------------------------------------------

const SENTINEL_PREFIX = "\u0000OMNI_CAVEMAN"

function randomSentinelSeed() {
  const cryptoLike = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
  if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
    const bytes = new Uint8Array(8)
    cryptoLike.getRandomValues(bytes)
    let hex = "r"
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0")
    }
    return hex
  }
  return `r${Math.random().toString(36).slice(2)}`
}

function ensureGlobal(pattern) {
  const flags = pattern.flags.indexOf("g") >= 0 ? pattern.flags : `${pattern.flags}g`
  return new RegExp(pattern.source, flags)
}

function compileUserPatterns(patterns) {
  if (!patterns || patterns.length === 0) return []
  const compiled = []
  for (const pattern of patterns) {
    try {
      compiled.push({
        pattern: typeof pattern === "string" ? new RegExp(pattern, "g") : ensureGlobal(pattern),
        kind: "custom",
      })
    } catch {
      // 非法用户正则直接忽略（上游：热路径静默跳过，校验/预览层负责报错）
    }
  }
  return compiled
}

function replacePattern(text, pattern, kind, addBlock) {
  pattern.lastIndex = 0
  return text.replace(pattern, (match) => {
    if (!match) return match
    if (match.indexOf(SENTINEL_PREFIX) >= 0) return match
    return addBlock(match, kind)
  })
}

/** frontmatter 只在文本以 "---\n" 开头时提取，切到闭合行行尾。 */
function extractFrontmatter(text, addBlock) {
  if (text.slice(0, 4) !== "---\n") return text
  const close = text.indexOf("\n---", 4)
  if (close === -1) return text
  let end = close + 4
  while (end < text.length && text[end] !== "\n") end++
  if (end < text.length) end++
  return addBlock(text.slice(0, end), "frontmatter") + text.slice(end)
}

function isSpaceChar(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v"
}

function isDigitChar(ch) {
  return ch >= "0" && ch <= "9"
}

/**
 * 围栏代码块提取。未闭合的围栏按普通行处理（上游行为）。
 */
function extractFencedCodeBlocks(text, addBlock) {
  const matched = text.match(/[^\n]*(?:\n|$)/g)
  const lines = matched || [text]
  let out = ""
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line === "" && i === lines.length - 1) break
    const open = /^([ \t]{0,3})(`{3,}|~{3,})[^\n]*(?:\n|$)/.exec(line)
    if (!open) {
      out += line
      i++
      continue
    }
    const marker = open[2]
    const fenceChar = marker[0]
    const fenceLen = marker.length
    let j = i + 1
    let closed = false
    while (j < lines.length) {
      const close = /^([ \t]{0,3})(`{3,}|~{3,})\s*(?:\n|$)/.exec(lines[j])
      if (close && close[2][0] === fenceChar && close[2].length >= fenceLen) {
        closed = true
        break
      }
      j++
    }
    if (!closed) {
      out += line
      i++
      continue
    }
    out += addBlock(lines.slice(i, j + 1).join(""), "fenced_code")
    i = j + 1
  }
  return out
}

/**
 * 行内数学 `$…$` 提取 —— 手写替代上游的 lookbehind 正则
 *   /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/
 * 逐条对应：起始 $ 前非 $、后非空白/$/数字；中间 1..160 个元素（`\` + 任意非换行字符，
 * 或非 $ 非换行非反斜杠的字符）；结束 $ 前非空白、后非 $。取最短合法匹配。
 */
function replaceMathInline(text, addBlock) {
  const parts = []
  let i = 0
  while (i < text.length) {
    const ch = text[i]
    if (ch !== "$") {
      parts.push(ch)
      i++
      continue
    }
    // (?<!\$)
    if (i > 0 && text[i - 1] === "$") {
      parts.push(ch)
      i++
      continue
    }
    // (?![\s$\d])
    const n1 = i + 1 < text.length ? text[i + 1] : ""
    if (!n1 || isSpaceChar(n1) || n1 === "$" || isDigitChar(n1)) {
      parts.push(ch)
      i++
      continue
    }

    let j = i + 1
    let elems = 0
    let end = -1
    while (j < text.length) {
      const c = text[j]
      if (c === "$") {
        // 结束判定：(?<!\s) 且 (?!\$)
        const prev = text[j - 1]
        const next = j + 1 < text.length ? text[j + 1] : ""
        if (!isSpaceChar(prev) && next !== "$") {
          end = j
        }
        // `$` 不在中间字符类里，不合格即整个起始点失败
        break
      }
      if (c === "\\") {
        const nx = j + 1 < text.length ? text[j + 1] : ""
        if (!nx || nx === "\n" || nx === "\r") break
        j += 2
        elems++
      } else if (c === "\n" || c === "\r") {
        break
      } else {
        j++
        elems++
      }
      if (elems > 160) break
    }

    if (end === -1) {
      parts.push(ch)
      i++
      continue
    }
    parts.push(addBlock(text.slice(i, end + 1), "math_inline"))
    i = end + 1
  }
  return parts.join("")
}

/** builtIns 表：顺序即应用顺序（先粗后细，与上游一致）。 */
const BUILTIN_PATTERNS = [
  { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
  { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
  { pattern: /\\begin\{[^}]+\}[\s\S]*?\\end\{[^}]+\}/g, kind: "latex_block" },
  { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
  { pattern: /^\|.*\|$/gm, kind: "markdown_table" },
  { pattern: /^\|?[\s:]*-{3,}[\s:]*(\|[\s:]*-{3,}[\s:]*)*\|?$/gm, kind: "markdown_table" },
  { pattern: /^\s*#(?:set|show|let|import|include)\b.+$/gm, kind: "typst_directive" },
  { pattern: /`[^`\n]+`/g, kind: "inline_code" },
  { pattern: /\[[^\]\n]*\]\([^)\s]+\)/g, kind: "markdown_link" },
  { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/g, kind: "url" },
  { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
  { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*/g, kind: "env_var" },
  { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
  { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
  { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*)+\(\)?/g, kind: "dotted_identifier" },
  { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
  { pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g, kind: "file_path" },
  { pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g, kind: "error_message" },
]

/**
 * 把所有结构化片段换成哨兵占位符，返回 { text, blocks }。
 * 顺序：frontmatter → 区域块（自定义 / system-reminder / instructions / project-instructions）
 *       → 围栏代码 → 行内数学 → builtIns。
 */
export function extractPreservedBlocks(text, options) {
  const opts = options || {}
  const blocks = []
  const seed = randomSentinelSeed()
  let counter = 0

  const addBlock = (content, kind) => {
    const placeholder = `${SENTINEL_PREFIX}_${seed}_${counter++}\u0000`
    blocks.push({ placeholder, content, kind })
    return placeholder
  }

  let current = extractFrontmatter(text, addBlock)

  const regionPatterns = [
    ...compileUserPatterns(opts.preservePatterns),
    { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
    { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
    { pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g, kind: "system_instruction" },
  ]
  for (const rp of regionPatterns) {
    current = replacePattern(current, rp.pattern, rp.kind, addBlock)
  }

  current = extractFencedCodeBlocks(current, addBlock)
  current = replaceMathInline(current, addBlock)

  for (const bp of BUILTIN_PATTERNS) {
    current = replacePattern(current, bp.pattern, bp.kind, addBlock)
  }

  return { text: current, blocks }
}

/**
 * 只剪散文：结构化片段占位化后逐段剪，占位内容逐字还原。
 * 这是 B-ULTRA-CODE 的防线。
 */
export function pruneProseOnly(text, rate, minScore) {
  const extracted = extractPreservedBlocks(text)
  const withPlaceholders = extracted.text
  const blocks = extracted.blocks
  if (blocks.length === 0) return pruneByScore(text, rate, minScore)

  const placeholderToContent = new Map()
  for (const b of blocks) placeholderToContent.set(b.placeholder, b.content)

  const escaped = blocks.map((b) => b.placeholder.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
  const splitRe = new RegExp(`(${escaped.join("|")})`, "g")

  return withPlaceholders
    .split(splitRe)
    .map((part) => {
      if (!part) return ""
      const preserved = placeholderToContent.get(part)
      if (preserved !== undefined) return preserved // 逐字还原，绝不剪枝
      return pruneByScore(part, rate, minScore) // 只剪散文
    })
    .join("")
}

// ---------------------------------------------------------------------------
// 配置（types.ts 的 DEFAULT_ULTRA_CONFIG + cavemanAdapter.ts 的 ULTRA_SCHEMA）
// ---------------------------------------------------------------------------

export const DEFAULT_ULTRA_CONFIG = {
  enabled: false,
  compressionRate: 0.5,
  minScoreThreshold: 0.3,
  slmFallbackToAggressive: true,
  maxTokensPerMessage: 0,
}

/** 逐字来自上游 ULTRA_SCHEMA（cavemanAdapter.ts 第 65-108 行）。 */
export const ULTRA_SCHEMA = [
  {
    key: "enabled",
    type: "boolean",
    label: "Enabled",
    defaultValue: DEFAULT_ULTRA_CONFIG.enabled,
  },
  {
    key: "compressionRate",
    type: "number",
    label: "剪枝比例",
    description: "Fraction of word tokens to keep (0–1). Lower = more aggressive.",
    defaultValue: DEFAULT_ULTRA_CONFIG.compressionRate,
    min: 0,
    max: 1,
  },
  {
    key: "minScoreThreshold",
    type: "number",
    label: "分数门槛",
    description: "低于此分的 token 才可剪；分数越高剪得越少。",
    defaultValue: DEFAULT_ULTRA_CONFIG.minScoreThreshold,
    min: 0,
    max: 1,
  },
  {
    key: "maxTokensPerMessage",
    type: "number",
    label: "单条上限",
    description: "单条消息最多处理的 token 数，0 表示不限。",
    defaultValue: DEFAULT_ULTRA_CONFIG.maxTokensPerMessage,
    min: 0,
    max: 32768,
  },
]

export const configSchema = ULTRA_SCHEMA

/** 校验 ultra 配置，返回 { valid, errors }。 */
export function validateUltraConfig(config) {
  const errors = []
  const cfg = config && typeof config === "object" ? config : {}
  for (const key of ["enabled", "slmFallbackToAggressive"]) {
    if (cfg[key] !== undefined && typeof cfg[key] !== "boolean") {
      errors.push(`${key} must be a boolean`)
    }
  }
  for (const key of ["compressionRate", "minScoreThreshold"]) {
    if (cfg[key] !== undefined) {
      const v = cfg[key]
      if (typeof v !== "number" || v < 0 || v > 1) {
        errors.push(`${key} must be a number between 0 and 1`)
      }
    }
  }
  if (cfg.maxTokensPerMessage !== undefined) {
    const v = cfg.maxTokensPerMessage
    if (typeof v !== "number" || v < 0 || v > 32768) {
      errors.push("maxTokensPerMessage must be a number between 0 and 32768")
    }
  }
  return { valid: errors.length === 0, errors }
}

/**
 * 合并默认值。等价于上游 `{ ...DEFAULT_ULTRA_CONFIG, ...config }`，
 * 但对数值字段加 typeof 兜底（脏配置不许把 NaN 带进剪枝循环）。
 */
export function resolveUltraConfig(config) {
  const cfg = config && typeof config === "object" ? config : {}
  return {
    enabled: typeof cfg.enabled === "boolean" ? cfg.enabled : DEFAULT_ULTRA_CONFIG.enabled,
    compressionRate:
      typeof cfg.compressionRate === "number" ? cfg.compressionRate : DEFAULT_ULTRA_CONFIG.compressionRate,
    minScoreThreshold:
      typeof cfg.minScoreThreshold === "number"
        ? cfg.minScoreThreshold
        : DEFAULT_ULTRA_CONFIG.minScoreThreshold,
    slmFallbackToAggressive:
      typeof cfg.slmFallbackToAggressive === "boolean"
        ? cfg.slmFallbackToAggressive
        : DEFAULT_ULTRA_CONFIG.slmFallbackToAggressive,
    maxTokensPerMessage:
      typeof cfg.maxTokensPerMessage === "number"
        ? cfg.maxTokensPerMessage
        : DEFAULT_ULTRA_CONFIG.maxTokensPerMessage,
    preserveSystemPrompt: cfg.preserveSystemPrompt !== false,
  }
}

// ---------------------------------------------------------------------------
// 引擎元数据（label 用上游英文原名，中文解释放 why）
// ---------------------------------------------------------------------------

export const id = "ultra"
export const label = "Ultra"
export const why = "启发式 token 级剪枝，最激进的纯本地压缩（约 75%）。"
export const description = "Heuristic token pruning (+ optional SLM)."
export const lossy = true
export const cacheImpact = "high"
export const defaultOn = false
export const stackPriority = 40
export const isSingleMode = false
export const levels = undefined
export const available = true

// ---------------------------------------------------------------------------
// magpie 中间件引擎入口
// ---------------------------------------------------------------------------

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false

    const conf = resolveUltraConfig(cfg)
    const view = conversationView(body, ctx && ctx.protocol)
    if (!view || !Array.isArray(view.segments) || view.segments.length === 0) return false

    let changed = false
    for (const seg of view.segments) {
      if (typeof seg.text !== "string" || seg.text.length === 0) continue

      // system 段默认不动（上游 preserveSystemPrompt !== false）
      if (conf.preserveSystemPrompt && seg.role === "system") continue

      // 幂等：已带压缩标记的段跳过
      if (seg.text.indexOf(COMPRESSED_PREFIX) === 0) continue

      // 短段跳过（chars/4 近似 token 数）
      if (conf.maxTokensPerMessage > 0) {
        const tokens = Math.ceil(seg.text.length / 4)
        if (tokens <= conf.maxTokensPerMessage) continue
      }

      const next = pruneProseOnly(seg.text, conf.compressionRate, conf.minScoreThreshold)
      if (typeof next !== "string" || next === seg.text) continue
      seg.set(next)
      changed = true
    }
    return changed
  } catch {
    // fail-open：任何异常都不许冒泡到中间件链
    return false
  }
}
