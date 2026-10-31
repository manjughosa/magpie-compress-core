// caveman.js — caveman 散文压缩引擎（移植自 OmniRouteDesktop 的 caveman.ts）
//
// 来源（OmniRoute@ff679ab86e0113a009d8aeeeee464139bd090874 open-sse/services/compression/）：
//   caveman.ts    (17062B / 471 行) —— 主编排：preservation → 规则应用 → 校验 → 收尾
//   preservation.ts (8856B / 253 行) —— 保护区提取/还原（代码围栏、行内代码、数学、路径、URL…）
//   validation.ts  (12534B)         —— 压缩后结构校验，不通过就回退原文
//   languageDetector.ts            —— 已并入 caveman-rules.js（规则包选择要用）
//   ruleLoader.ts                  —— 已并入 caveman-rules.js（构建期内联规则包）
//
// 规则表与语言包不在这里：见 ./caveman-rules.js（由 scripts/port-caveman.mjs 从 .ts 生成）。
//
// ── 适配点（与原 .ts 的差异）────────────────────────────────────────────────
//   1. 原版处理 body.messages（chat / anthropic 两种协议自己遍历）。这里改成 magpie 契约：
//      用 ../adapter.js 的 conversationView(body, ctx.protocol) 拿文本段，四协议通吃。
//   2. 原版按 msg.role 选规则 context（user/assistant/system/all）。这里把 segment.role
//      归一化后送进同一个 getRulesForContext，语义一致。
//   3. performance.now() → nowMs()（无 performance 时退回 Date.now）。
//   4. globalThis.crypto.getRandomValues → try 里取，取不到就用 Math.random（sentinel 只求唯一）。
//   5. estimateCompressionTokens：原版走 tiktoken。这里用字符数/4 估算 —— moejs 里没有分词器，
//      统计数字只用于面板展示，不影响改写结果。
//   6. configSchema 是 magpie 的配置面板契约，原版没有：把 intensity / language / groups /
//      compressRoles 等摊成可配置项。
//   7. 原版 DEFAULT_CAVEMAN_CONFIG.intensity 是 "lite"。这里默认 "full"：magpie 里 caveman
//      默认关（pipeline.js 的 DEFAULT_STRATEGIES 里是 false），用户显式打开时期望的是「明显变小」，lite 只删客套话，
//      压缩率约 10%，与 why 里写的 30% 对不上。
//
// ── 砍掉的东西 ───────────────────────────────────────────────────────────────
//   - cavemanCompress 的 body 级包装（emptyResult / totals 汇总 / body 回写）：magpie 的
//     apply 直接按 segment 就地改写，不需要包一层 body。
//   - compressionPipeline 的多引擎编排（lite → caveman → aggressive → ultra 的 fallback 链）
//     与 cavemanAdapter.ts 的强度路由：magpie 里每个引擎是独立策略，由 pipeline.js 排序。
//   - preserveSystemPromptMode.ts 的 system 提示词模式判定：magpie 的 package.json
//     options.preserve.system 统一处理，引擎只管自己的 compressRoles。
//   - tokenizer 精确计数、createCavemanStats 的 CompressionStats 结构（这里给精简 stats）。
//   - skipRules 的 preview 展示、warnings 收集进 stats 的面板链路。
//
// ── 保真点（不许动）────────────────────────────────────────────────────────
//   - preservation 的提取顺序：frontmatter → 用户/信封 region → 代码围栏 → builtIns。
//     顺序错了 sentinel 会被嵌套覆盖。
//   - builtIns 里的正则逐字照搬（含 #4795 那条避免 ReDoS 的行内数学式）。
//   - validateCompression 的 12 类「必须原样存在」检查：任何一类缺失就整段回退原文。
//   - cleanupArtifacts 的六条收尾替换。
//   - isCodeDominantText 的 30% 阈值（保守：宁可少压，不可破坏代码）。

import { conversationView } from "../adapter.js"
import {
  applyRulesToText,
  detectCompressionLanguage,
  getRulesForContext,
  listSupportedCompressionLanguages,
  resetRuleCompileWarnings,
  ruleCompileWarningCount,
} from "./caveman-rules.js"

// ---------------------------------------------------------------------------
// 元数据（magpie 引擎契约）
// ---------------------------------------------------------------------------

export const id = "caveman"
export const label = "Caveman"
export const why =
  "按语言规则表删掉啰嗦措辞、客套话、冗余从句，保留代码与事实（约 30% 压缩）。"
export const lossy = true
export const cacheImpact = "moderate"
export const defaultOn = false
export const stackPriority = 20
export const isSingleMode = false
export const levels = undefined
export const available = true

// ---------------------------------------------------------------------------
// 默认配置
// ---------------------------------------------------------------------------

/** 原版 DEFAULT_CAVEMAN_CONFIG.preservePatterns：代码围栏、行内代码、URL、路径、错误行、栈帧。 */
const DEFAULT_PRESERVE_PATTERNS = [
  "```[\\s\\S]*?```",
  "`[^`\\n]+`",
  "\\b(https?://\\S+)",
  "(?:^|\\s)(\\.{0,2}/[\\w./\\-]+)",
  "^\\s*(Error|TypeError|RangeError|SyntaxError|ReferenceError):",
  "^\\s+at\\s",
]

export const ALL_RULE_GROUPS = ["context", "dedup", "filler", "structural", "ultra"]

export const DEFAULT_CAVEMAN_CONFIG = {
  compressRoles: ["user"],
  skipRules: [],
  minMessageLength: 50,
  preservePatterns: DEFAULT_PRESERVE_PATTERNS,
  intensity: "full",
  language: "auto",
  autoDetectLanguage: true,
  groups: ALL_RULE_GROUPS,
}

const LANGUAGE_OPTIONS = [
  { value: "auto", label: "自动检测" },
  { value: "en", label: "English" },
  { value: "zh", label: "简体中文" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "fr", label: "Français" },
  { value: "hu", label: "Magyar" },
  { value: "id", label: "Bahasa Indonesia" },
  { value: "it", label: "Italiano" },
  { value: "ja", label: "日本語" },
  { value: "pt-BR", label: "Português (BR)" },
  { value: "ru", label: "Русский" },
]

export const configSchema = [
  {
    // 键名跟 catalog.js 一致用 lang；resolveConfig 同时认 language 别名。
    key: "lang",
    type: "select",
    label: "语言",
    description: "auto 按内容自动判断（汉字无假名判中文，其余按关键词打分）；失败回落到英文规则包。",
    defaultValue: "auto",
    options: LANGUAGE_OPTIONS,
  },
  {
    key: "groups",
    type: "multiselect",
    label: "规则组",
    description: "只跑选中的规则组。zh 包只有 dedup / filler / ultra 三组。",
    defaultValue: ALL_RULE_GROUPS.slice(),
    options: [
      { value: "context", label: "上下文（context）" },
      { value: "dedup", label: "去重（dedup）" },
      { value: "filler", label: "填充词（filler）" },
      { value: "structural", label: "结构（structural）" },
      { value: "ultra", label: "激进（ultra）" },
    ],
  },
  {
    key: "intensity",
    type: "select",
    label: "强度",
    description: "lite 只删客套话，full 加结构性改写，ultra 最激进。",
    defaultValue: "full",
    options: [
      { value: "lite", label: "轻（lite）" },
      { value: "full", label: "标准（full）" },
      { value: "ultra", label: "激进（ultra）" },
    ],
  },
  {
    key: "compressRoles",
    type: "multiselect",
    label: "作用角色",
    description: "默认只压 user 消息，system 提示词与 assistant 历史保持原样。",
    defaultValue: ["user"],
    options: [
      { value: "user", label: "user" },
      { value: "assistant", label: "assistant" },
      { value: "system", label: "system" },
    ],
  },
  {
    key: "preserveCode",
    type: "boolean",
    label: "保护代码与路径",
    description: "代码围栏、行内代码、URL、文件路径、错误行永不被改写。关掉有破坏代码的风险。",
    defaultValue: true,
  },
  {
    key: "minMessageLength",
    type: "number",
    label: "最小压缩长度",
    description: "短于这个字符数的文本段直接跳过（规则作用在短句上容易误伤）。",
    defaultValue: 50,
    min: 0,
    max: 4000,
  },
]

// ---------------------------------------------------------------------------
// 小工具
// ---------------------------------------------------------------------------

function nowMs() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") return performance.now()
  return Date.now()
}

/** 原版 estimateCompressionTokens 走 tiktoken；这里按字符估算（4 字符 ≈ 1 token）。 */
export function estimateCompressionTokens(text) {
  if (typeof text !== "string" || text.length === 0) return 0
  return Math.ceil(text.length / 4)
}

// ---------------------------------------------------------------------------
// preservation 层（preservation.ts 逐字移植）
// ---------------------------------------------------------------------------

const SENTINEL_PREFIX = "\u0000OMNI_CAVEMAN"

function randomSentinelSeed() {
  try {
    const cryptoLike = typeof globalThis !== "undefined" ? globalThis.crypto : undefined
    if (cryptoLike && typeof cryptoLike.getRandomValues === "function") {
      const bytes = new Uint8Array(8)
      cryptoLike.getRandomValues(bytes)
      let hex = ""
      for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0")
      return "r" + hex
    }
  } catch {
    // 某些运行时禁用 crypto：落到 Math.random。
  }
  return "r" + Math.random().toString(36).slice(2)
}

function ensureGlobal(pattern) {
  if (!(pattern instanceof RegExp)) return pattern
  const flags = pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g"
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
      // 用户写的非法正则忽略掉；原版把告警留给 preview 面板。
    }
  }
  return compiled
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
  if (!text.startsWith("---\n")) return text
  const close = text.indexOf("\n---", 4)
  if (close === -1) return text
  const closeEnd = text.indexOf("\n", close + 4)
  const end = closeEnd === -1 ? text.length : closeEnd + 1
  return addBlock(text.slice(0, end), "frontmatter") + text.slice(end)
}

/**
 * 把成对的 ``` / ~~~ 围栏整块抽成 sentinel。
 * 未闭合的围栏按普通文本放回（不吞掉后面的正文）。
 */
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

    output += addBlock(block)
    i = j + 1
  }

  return output
}

/** 只列出围栏代码块原文（校验与测试用）。 */
export function findFencedCodeBlocks(text) {
  const blocks = []
  extractFencedCodeBlocks(text, (content) => {
    blocks.push(content)
    return content
  })
  return blocks
}

/**
 * 把「不许动」的内容抽成 sentinel 占位符。
 * 顺序不能变：frontmatter → 用户/信封 region → 代码围栏 → builtIns。
 * region 先跑是因为它内部会留下 sentinel，而 replacePattern 会跳过已含 sentinel 的匹配。
 */
export function extractPreservedBlocks(text, options) {
  const opts = options || {}
  const blocks = []
  const seed = randomSentinelSeed()
  let counter = 0

  const addBlock = (content, kind) => {
    const placeholder = SENTINEL_PREFIX + "_" + seed + "_" + counter + "\u0000"
    blocks.push({ placeholder, content, kind })
    counter++
    return placeholder
  }

  let result = text

  result = extractFrontmatter(result, addBlock)

  const regionPatterns = compileUserPatterns(opts.preservePatterns).concat([
    { pattern: /<system-reminder>[\s\S]*?<\/system-reminder>/g, kind: "system_instruction" },
    { pattern: /<instructions?>[\s\S]*?<\/instructions?>/g, kind: "system_instruction" },
    {
      pattern: /<project[- ]instructions?>[\s\S]*?<\/project[- ]instructions?>/g,
      kind: "system_instruction",
    },
  ])
  for (const entry of regionPatterns) {
    result = replacePattern(result, ensureGlobal(entry.pattern), entry.kind, addBlock)
  }

  result = extractFencedCodeBlocks(result, (content) => addBlock(content, "fenced_code"))

  const builtIns = [
    { pattern: /\$\$[\s\S]*?\$\$/g, kind: "math_block" },
    { pattern: /\\\[[\s\S]*?\\\]/g, kind: "math_block" },
    // #4795: 排除 `\` 的兜底分支，让反斜杠只由转义分支 `\\.` 吃掉。原来的 `[^$\n]`
    // 与 `\\.` 重叠，连续反斜杠（未配对 `$` + Windows 路径）会造成指数级回溯（ReDoS）。
    {
      pattern: /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g,
      kind: "math_inline",
    },
    { pattern: /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, kind: "latex_block" },
    { pattern: /^#{1,6}\s+.+$/gm, kind: "markdown_heading" },
    { pattern: /^\s*\|.*\|\s*$/gm, kind: "markdown_table" },
    { pattern: /^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/gm, kind: "markdown_table" },
    { pattern: /^[ \t]*#(?:set|show|let|import|include)\b[^\n]*$/gm, kind: "typst_directive" },
    { pattern: /`[^`\n]+`/g, kind: "inline_code" },
    { pattern: /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, kind: "markdown_link" },
    { pattern: /\bhttps?:\/\/[^\s)\]"'>]+/gi, kind: "url" },
    { pattern: /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, kind: "const_case" },
    { pattern: /\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\$[A-Z_][A-Z0-9_]*\b/g, kind: "env_var" },
    { pattern: /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, kind: "version" },
    { pattern: /\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*){1,8}(?:\(\))?/g, kind: "dotted_identifier" },
    { pattern: /\b[A-Za-z_$][\w$]*\s*\([^()\n]*\)/g, kind: "function_call" },
    {
      pattern: /(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)/g,
      kind: "file_path",
    },
    {
      pattern: /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]+/g,
      kind: "error_message",
    },
  ]

  for (const entry of builtIns) {
    result = replacePattern(result, ensureGlobal(entry.pattern), entry.kind, addBlock)
  }

  return { text: result, blocks }
}

export function restorePreservedBlocks(text, blocks) {
  let result = text
  for (const block of blocks) {
    result = result.split(block.placeholder).join(block.content)
  }
  return result
}

export function shouldPreserve(text, preservePatterns) {
  return preservePatterns.some((pattern) => {
    pattern.lastIndex = 0
    return pattern.test(text)
  })
}

// ---------------------------------------------------------------------------
// 校验层（validation.ts 移植）
// 压缩后逐类比对「必须原样存在」的片段，任何一类丢了就整段回退原文。
// ---------------------------------------------------------------------------

function previewOf(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 80)
}

function requireExactPresence(labelText, originalItems, compressed, errors) {
  for (const item of originalItems) {
    if (compressed.indexOf(item) === -1) {
      errors.push(labelText + " changed or missing: " + previewOf(item))
    }
  }
}

function collectMatches(text, pattern, limit) {
  const out = []
  pattern.lastIndex = 0
  let match
  while ((match = pattern.exec(text)) !== null) {
    if (match[0]) out.push(match[0])
    if (match[0] === "") pattern.lastIndex++
    if (out.length >= limit) break
  }
  pattern.lastIndex = 0
  return out
}

function collectInlineCode(text) {
  return collectMatches(text, /`[^`\n]+`/g, 200)
}

function collectUrls(text) {
  return collectMatches(text, /\bhttps?:\/\/[^\s)\]"'>]+/gi, 200)
}

function collectMarkdownLinks(text) {
  return collectMatches(text, /\[[^\]\n]+\]\([^) \n]+(?:\s+"[^"]*")?\)/g, 200)
}

function collectFrontmatter(text) {
  if (!text.startsWith("---\n")) return []
  const close = text.indexOf("\n---", 4)
  if (close === -1) return []
  const closeEnd = text.indexOf("\n", close + 4)
  const end = closeEnd === -1 ? text.length : closeEnd + 1
  return [text.slice(0, end)]
}

function collectHeadings(text) {
  return collectMatches(text, /^#{1,6}\s+.+$/gm, 200)
}

function collectTableRows(text) {
  return collectMatches(text, /^\s*\|.*\|\s*$/gm, 200)
}

function collectMathBlocks(text) {
  return collectMatches(text, /\$\$[\s\S]*?\$\$/g, 50).concat(collectMatches(text, /\\\[[\s\S]*?\\\]/g, 50))
}

function collectInlineMath(text) {
  return collectMatches(text, /(?<!\$)\$(?![\s$\d])(?:\\.|[^$\n\\]){1,160}?(?<!\s)\$(?!\$)/g, 50)
}

function collectLatexBlocks(text) {
  return collectMatches(text, /\\begin\{[A-Za-z*]+\}[\s\S]*?\\end\{[A-Za-z*]+\}/g, 50)
}

function collectVersions(text) {
  return collectMatches(text, /\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b/g, 100)
}

function collectConstCase(text) {
  return collectMatches(text, /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g, 200)
}

/**
 * 压缩前后的结构校验。返回 { valid, errors, warnings }。
 * 与原版一致：任何 error 都意味着「这段压缩不可信，回退原文」。
 */
export function validateCompression(original, compressed) {
  const errors = []
  const warnings = []

  if (typeof original !== "string" || typeof compressed !== "string") {
    return { valid: false, errors: ["validation received non-string input"], warnings }
  }

  if (original.length > 0 && compressed.trim().length === 0) {
    errors.push("compressed text is empty")
  }

  requireExactPresence("fenced code block", findFencedCodeBlocks(original), compressed, errors)
  requireExactPresence("inline code", collectInlineCode(original), compressed, errors)
  requireExactPresence("URL", collectUrls(original), compressed, errors)
  requireExactPresence("markdown link", collectMarkdownLinks(original), compressed, errors)
  requireExactPresence("frontmatter", collectFrontmatter(original), compressed, errors)
  requireExactPresence("heading", collectHeadings(original), compressed, errors)
  requireExactPresence("table row", collectTableRows(original), compressed, errors)
  requireExactPresence("math block", collectMathBlocks(original), compressed, errors)
  requireExactPresence("inline math", collectInlineMath(original), compressed, errors)
  requireExactPresence("LaTeX block", collectLatexBlocks(original), compressed, errors)
  requireExactPresence("version", collectVersions(original), compressed, errors)
  requireExactPresence("CONST_CASE", collectConstCase(original), compressed, errors)

  const originalFenceCount = findFencedCodeBlocks(original).length
  const compressedFenceCount = findFencedCodeBlocks(compressed).length
  if (compressedFenceCount < originalFenceCount) {
    errors.push("fenced code block count dropped: " + originalFenceCount + " -> " + compressedFenceCount)
  }

  if (compressed.length > original.length) {
    warnings.push("compressed text is longer than original")
  }

  return { valid: errors.length === 0, errors, warnings }
}

// ---------------------------------------------------------------------------
// 代码识别与收尾（caveman.ts 逐字移植）
// ---------------------------------------------------------------------------

/** 与 toolResultCompressor.ts 的 isCodeLikeLine 一致：行首像代码就认为这行是代码。 */
function isCodeLikeLine(rawLine) {
  const line = rawLine.replace(/^\s+/, "")
  return (
    line.startsWith("import ") ||
    line.startsWith("export ") ||
    line.startsWith("function ") ||
    line.startsWith("class ") ||
    line.startsWith("const ") ||
    line.startsWith("let ") ||
    line.startsWith("var ") ||
    line.startsWith("return ") ||
    line.startsWith("if(") ||
    line.startsWith("if (") ||
    line.startsWith("for(") ||
    line.startsWith("for (") ||
    line.startsWith("while(") ||
    line.startsWith("while (")
  )
}

/**
 * #9144: 没被围栏包住的多行代码（例如 Copilot 的 `#file` 引用）会被当成散文折叠空白、
 * 重排大小写，把 `function` 改成 `Function`、把缩进吃掉。这里要求「像代码的行」占到 30%
 * 才整段跳过散文规范化 —— 故意保守：宁可少压，不可破坏。
 */
export function isCodeDominantText(text) {
  const lines = text.split("\n").filter((line) => line.trim().length > 0)
  if (lines.length < 3) return false
  let codeLikeCount = 0
  for (const line of lines) if (isCodeLikeLine(line)) codeLikeCount++
  return codeLikeCount / lines.length >= 0.3
}

function recapitalizeSentences(text) {
  return text.replace(/(^|[.!?][ \t]|\n[ \t]*)([a-z])/g, (match, prefix, char) => {
    return prefix + char.toUpperCase()
  })
}

/** 规则删词后留下的空白/重复标点收尾。前六条与原版一致，末两条是中日韩与拉丁适配。 */
export function cleanupArtifacts(text) {
  if (!text) return ""
  return text
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([,.;:!?])/g, "$1")
    // 拉丁标点收尾（下面那条 CJK 规则的同源缺口）：删掉填充词会留下「now. , what」，
    // 上一条把空格收成「now.,」。句末标点后面直接跟逗号/分号/冒号在英文里不成立，
    // 丢掉后者。缩写是例外——「e.g., 」「i.e., 」「etc., 」的逗号必须留着，所以用
    // 负向后顾挡住它们。原版两条都没有（只有英文语境，作者补了 CJK 这条）。
    .replace(/([.!?])(?<!\b(?:e\.g|i\.e|etc|cf|vs|al|viz|approx|et\.al)\.)([,;:]+)/g, "$1")
    .replace(/([.!?]){2,}/g, (match) => match[match.length - 1])
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/^\n+/, "")
    .replace(/\n+$/, "")
    // 中文规则包的 replacement 自带句号（如「如前所述」→「见上。」），原文后面的逗号
    // 会留下来变成「见上。，」。原版只有英文语境没这条；这里补一次 CJK 标点收尾。
    .replace(/([。！？；])[，,、]/g, "$1")
}

const PROTECTED_STRUCTURE_RE =
  /```|~~~|`|https?:\/\/|\[[^\]\n]{1,1000}\]\([^)[ \t\n]{1,2000}(?:[ \t]+"[^"]{0,1000}")?\)|^#{1,6}\s+|^[ \t]*\|(?:[^|\n]{0,1000}\|){1,100}[ \t]*$|\$\$|\\\[|\\begin\{|^\s*#(?:set|show|let|import|include)\b|\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b|\bprocess\.env\.[A-Za-z_][A-Za-z0-9_]*\b|\$[A-Z_][A-Z0-9_]*\b|\b\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?\b|\b[a-zA-Z_$][\w$]*(?:\.[a-zA-Z_$][\w$]*){1,8}(?:\(\))?|\b[A-Za-z_$][\w$]*[ \t]*\([^()\n]{0,1000}\)|(?:^|\s)(?:\.{0,2}\/[A-Za-z0-9_@./-]+|[A-Za-z]:\\[A-Za-z0-9_.\\/-]+)|\b(?:TypeError|ReferenceError|SyntaxError|RangeError|URIError|EvalError|Error|Exception):[^\n]{0,1000}/im
const PROTECTED_STRUCTURE_PREFILTER_RE = /[`~\[\]\|$#\\/:_()0-9]/

/** 文本里是否含值得保护的骨架（代码、URL、路径、标题、表格、数学、版本号…）。 */
export function hasProtectedStructure(text) {
  if (!PROTECTED_STRUCTURE_PREFILTER_RE.test(text)) return false
  PROTECTED_STRUCTURE_RE.lastIndex = 0
  return PROTECTED_STRUCTURE_RE.test(text)
}

function compileUserPreservePatterns(patterns) {
  const compiled = []
  const warnings = []
  if (!patterns || patterns.length === 0) return { patterns: compiled, warnings }
  for (const pattern of patterns) {
    try {
      compiled.push(new RegExp(pattern, "g"))
    } catch (error) {
      const message = error && error.message ? error.message : String(error)
      warnings.push("Invalid preservePatterns regex ignored: " + pattern + " (" + message + ")")
    }
  }
  return { patterns: compiled, warnings }
}

// ---------------------------------------------------------------------------
// 核心：单段文本压缩
// ---------------------------------------------------------------------------

function normalizeRole(role) {
  if (role === "system" || role === "developer") return "system"
  if (role === "user") return "user"
  if (role === "assistant" || role === "model") return "assistant"
  return "other"
}

/** 配置归一化：把面板传来的松散 cfg 收敛成引擎内部配置。 */
export function resolveConfig(cfg) {
  const raw = cfg || {}
  const config = {
    compressRoles: DEFAULT_CAVEMAN_CONFIG.compressRoles.slice(),
    skipRules: [],
    minMessageLength: DEFAULT_CAVEMAN_CONFIG.minMessageLength,
    preservePatterns: DEFAULT_CAVEMAN_CONFIG.preservePatterns.slice(),
    intensity: DEFAULT_CAVEMAN_CONFIG.intensity,
    language: DEFAULT_CAVEMAN_CONFIG.language,
    autoDetectLanguage: DEFAULT_CAVEMAN_CONFIG.autoDetectLanguage,
    groups: DEFAULT_CAVEMAN_CONFIG.groups.slice(),
  }

  if (Array.isArray(raw.compressRoles)) {
    const roles = []
    for (const role of raw.compressRoles) {
      const normalized = normalizeRole(role)
      if (normalized !== "other" && roles.indexOf(normalized) === -1) roles.push(normalized)
    }
    if (roles.length > 0) config.compressRoles = roles
  }

  if (Array.isArray(raw.skipRules)) config.skipRules = raw.skipRules.slice()

  if (typeof raw.minMessageLength === "number" && raw.minMessageLength >= 0) {
    config.minMessageLength = raw.minMessageLength
  }

  if (raw.preserveCode === false) {
    config.preservePatterns = []
  } else if (Array.isArray(raw.preservePatterns) && raw.preservePatterns.length > 0) {
    config.preservePatterns = raw.preservePatterns.slice()
  }

  if (raw.intensity === "lite" || raw.intensity === "full" || raw.intensity === "ultra") {
    config.intensity = raw.intensity
  }

  // 语言：catalog.js 用 lang，configSchema 也以 lang 为主键，language 作兼容别名。
  const requestedLanguage = typeof raw.lang === "string" ? raw.lang : raw.language
  if (typeof requestedLanguage === "string" && requestedLanguage.length > 0 && requestedLanguage !== "auto") {
    config.language = requestedLanguage
    config.autoDetectLanguage = false
  }

  if (Array.isArray(raw.groups)) config.groups = raw.groups.slice()

  return config
}

/**
 * 选语言包：自动检测时直接用检测结果（检测器只会返回有规则包的语言，
 * 回落到英文包会把非英文文本弄坏 —— 英文的 articles 规则会删掉 pt-BR 的 a/o）。
 * 手动指定时，如果检测到的语言不在允许列表里就退到 en。
 */
function pickLanguage(text, config) {
  const detected = config.autoDetectLanguage ? detectCompressionLanguage(text) : config.language || "en"
  if (config.autoDetectLanguage) return detected
  const allowed = config.language ? [config.language] : []
  if (allowed.indexOf(detected) !== -1) return detected
  return "en"
}

/**
 * 压一段文本。返回 { text, appliedRules, warnings, fallback, preservedBlocks }。
 * fallback=true 表示校验没过、已回退成原文。
 */
export function compressText(textPart, role, config) {
  const result = {
    text: textPart,
    appliedRules: [],
    warnings: [],
    fallback: false,
    preservedBlocks: 0,
    language: config.language || "en",
  }
  if (typeof textPart !== "string" || textPart.length === 0) return result
  if (textPart.length < config.minMessageLength) return result
  // Whitespace-dominated text (a long run of spaces) drives the rule regexes into
  // quadratic backtracking: 40k spaces took ~1s. Condensing whitespace is not what
  // this engine is for, so leave such a message alone.
  if (textPart.length > 2000) {
    let nonWs = 0
    for (let i = 0; i < textPart.length; i++) {
      const c = textPart.charCodeAt(i)
      if (c !== 32 && c !== 9 && c !== 10 && c !== 13) nonWs++
    }
    if (nonWs * 10 < textPart.length) return result
  }

  const customPreservation = compileUserPreservePatterns(config.preservePatterns)
  if (customPreservation.warnings.length > 0) result.warnings = result.warnings.concat(customPreservation.warnings)

  const shouldExtract = customPreservation.patterns.length > 0 || hasProtectedStructure(textPart)
  const extracted = shouldExtract
    ? extractPreservedBlocks(textPart, { preservePatterns: customPreservation.patterns })
    : { text: textPart, blocks: [] }
  result.preservedBlocks = extracted.blocks.length

  const language = pickLanguage(textPart, config)
  result.language = language

  const rules = getRulesForContext(role === "other" ? "all" : role, config.intensity, language, {
    groups: config.groups,
  }).filter((rule) => config.skipRules.indexOf(rule.name) === -1)

  if (rules.length === 0) return result

  const applied = applyRulesToText(extracted.text, rules)
  let next = applied.text

  // 代码占多数的段落不跑散文规范化（空白折叠 + 句首大写会毁掉缩进与标识符大小写）。
  if (!isCodeDominantText(extracted.text)) {
    next = cleanupArtifacts(next)
    if (next.length > 0 && !isCodeDominantText(next)) next = recapitalizeSentences(next)
  }

  const restored = restorePreservedBlocks(next, extracted.blocks)

  if (shouldExtract) {
    const validation = validateCompression(textPart, restored)
    if (!validation.valid) {
      // 校验没过：整段回退原文。宁可少压，不可把代码/URL/数字弄丢。
      result.text = textPart
      result.appliedRules = []
      result.fallback = true
      result.warnings = result.warnings.concat(validation.errors)
      return result
    }
    if (validation.warnings.length > 0) result.warnings = result.warnings.concat(validation.warnings)
  }

  result.text = restored
  result.appliedRules = applied.appliedRules
  return result
}

// ---------------------------------------------------------------------------
// 中间件入口
// ---------------------------------------------------------------------------

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false

    const protocol = ctx && ctx.protocol ? ctx.protocol : "chat"
    const config = resolveConfig(cfg)
    if (config.compressRoles.length === 0) return false

    const view = conversationView(body, protocol)
    if (!view || !view.segments || view.segments.length === 0) return false

    resetRuleCompileWarnings()

    let changed = false
    for (const segment of view.segments) {
      if (!segment || typeof segment.text !== "string" || segment.text.length === 0) continue
      // 工具输出里全是代码、日志、路径：caveman 的散文规则对它只有破坏性。
      if (segment.toolOutput) continue
      const role = normalizeRole(segment.role)
      if (config.compressRoles.indexOf(role) === -1) continue

      const out = compressText(segment.text, role, config)
      if (typeof out.text === "string" && out.text !== segment.text) {
        segment.set(out.text)
        changed = true
      }
    }

    // 规则正则不被运行时支持时只是少压，不算失败；计数留给面板观测。
    ruleCompileWarningCount()
    return changed
  } catch {
    // fail-open：任何异常都不许冒到 middleware 上。
    return false
  }
}
