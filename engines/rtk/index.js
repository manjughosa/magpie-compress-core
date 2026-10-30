// engines/rtk/index.js — RTK 引擎主编排移植（index.ts 757行 → 纯 JS / moejs）
// 来源：open-sse/services/compression/engines/rtk/index.ts
// 差异：
//  1. adaptBodyForCompression → 引擎内直接处理 messages，不依赖 bodyAdapter
//  2. createCompressionStats → chars/4 估算
//  3. performance.now() → Date.now()（moejs 无 performance）
//  4. 移除 typescript npm 依赖的 AST 注释剥离；保 empty-lines/whitespace 剥离
//  5. filterLoader 内嵌 builtin filters 替代 fs 加载
//  6. rawOutput 持久化不移植（无状态中间件无法写文件）
//  7. renderers 不移植（opt-in 默认关）
//  8. codeStripper 的 typescript AST 路径 → 移除（保留 empty-lines/whitespace/trim）

import { detectCommandType } from "./commandDetector.js"
import { matchRtkFilter } from "./builtinFilters.js"
import { applyLineFilter } from "./lineFilter.js"
import { deduplicateRepeatedLines } from "./deduplicator.js"
import { groupSimilarLines } from "./grouper.js"
import { smartTruncate } from "./smartTruncate.js"
import { severityPattern } from "./severity.js"

const SHELL_TOOL_NAME_RE = /\b(bash|shell|terminal|run_command|execute_command|exec|command)\b/

function hasCacheControlMarker(part) {
  return (
    !!part &&
    typeof part === "object" &&
    part.cache_control !== undefined &&
    part.cache_control !== null
  )
}

function isAnthropicToolResultBlock(part) {
  return (
    !!part &&
    typeof part === "object" &&
    part.type === "tool_result" &&
    typeof part.tool_use_id === "string"
  )
}

function isTextBlock(part) {
  return (
    !!part &&
    typeof part === "object" &&
    (part.type === "text" || part.type === undefined) &&
    typeof part.text === "string"
  )
}

// ─── codeStripper 简化版（无 typescript AST） ─────────────────────────────

const LANGUAGE_ALIASES = {
  js: "javascript", jsx: "javascript", javascript: "javascript",
  ts: "typescript", tsx: "typescript", typescript: "typescript",
  py: "python", python: "python",
  rs: "rust", rust: "rust",
  go: "go", rb: "ruby", ruby: "ruby", java: "java",
}

function normalizeCodeLanguage(language) {
  if (!language) return "unknown"
  return LANGUAGE_ALIASES[language.trim().toLowerCase()] ?? "unknown"
}

function detectCodeLanguage(text) {
  if (/\b(?:interface|type)\s+\w+\s*=|:\s*(?:string|number|boolean)\b/.test(text)) return "typescript"
  if (/\b(?:const|let|function|import|export)\b|=>/.test(text)) return "javascript"
  if (/\bdef\s+\w+\(|\bimport\s+\w+|print\(/.test(text)) return "python"
  if (/\bfn\s+\w+\(|\blet\s+mut\b|println!\(/.test(text)) return "rust"
  if (/\bfunc\s+\w+\(|package\s+\w+/.test(text)) return "go"
  if (/\bclass\s+\w+|System\.out\.println/.test(text)) return "java"
  if (/\bdef\s+\w+|puts\s+|end\s*$/.test(text)) return "ruby"
  return "unknown"
}

function stripCode(text, language, options = {}) {
  const resolvedLanguage = language === "unknown" ? detectCodeLanguage(text) : language
  const opts = {
    removeComments: options.removeComments === true,
    removeEmptyLines: options.removeEmptyLines !== false,
    collapseWhitespace: options.collapseWhitespace !== false,
    preserveDocstrings: options.preserveDocstrings === true,
  }
  const originalLines = text.split(/\r?\n/).length
  let result = text

  if (opts.removeEmptyLines) result = result.replace(/^\s*$(?:\r?\n)?/gm, "")
  if (opts.collapseWhitespace) {
    result = result.split(/\r?\n/).map((line) => line.replace(/[ \t]+$/g, "")).join("\n")
  }

  result = result.replace(/^\s*\n/, "").replace(/\n\s*$/, "")
  const strippedLines = Math.max(0, originalLines - (result ? result.split(/\r?\n/).length : 0))
  return { text: result, strippedLines, language: resolvedLanguage }
}

// ─── 配置 ────────────────────────────────────────────────────────────────

const DEFAULTS = {
  enabled: true,
  intensity: "standard",
  applyToToolResults: true,
  applyToAssistantMessages: false,
  applyToCodeBlocks: false,
  enabledFilters: [],
  disabledFilters: [],
  maxLinesPerResult: 120,
  maxCharsPerResult: 0,
  deduplicateThreshold: 3,
  customFiltersEnabled: false,
  trustProjectFilters: false,
  enableRenderers: false,
  groupingThreshold: 3,
  enableGrouping: false,
  stripCodeComments: false,
  preserveDocstrings: true,
}

// configSchema —— 面板契约。catalog.js 的静态 fields 写的是 `level`，但本引擎的
// mergeRtkConfig 只认 `intensity`（逐字移植上游 engines/rtk/index.ts）：面板回落
// 到 catalog 声明就会写出一个引擎从不读的键，强度选择形同虚设。按 gen-page-catalog
// 的约定「已移植的引擎以实现为准」，这里导出真实键位，页面目录以它为准。
// 只列 mergeRtkConfig 真正会读的键：customFiltersEnabled / trustProjectFilters /
// enableRenderers / stripCodeComments 在移植里被写死成 false（无 AST、无外部源），
// 暴露它们等于制造新的死旋钮，故不列。
export const configSchema = [
  {
    key: "intensity",
    type: "select",
    label: "强度",
    description: "minimal 放宽行数上限只去噪音，standard 默认，aggressive 收紧头尾保留、压得更狠。",
    defaultValue: DEFAULTS.intensity,
    options: [
      { value: "minimal", label: "轻（minimal）" },
      { value: "standard", label: "标准（standard）" },
      { value: "aggressive", label: "激进（aggressive）" },
    ],
  },
  {
    key: "maxLinesPerResult",
    type: "number",
    label: "每个结果最多行数",
    description: "工具输出超过这个行数就截断，保头+尾+报错行（severity 词表恒保留）。0 表示不按行截。",
    defaultValue: DEFAULTS.maxLinesPerResult,
    min: 0,
    max: 10000,
  },
  {
    key: "maxCharsPerResult",
    type: "number",
    label: "每个结果最多字符",
    description: "在行数截断之后再按字符兜底。0 表示不按字符截。",
    defaultValue: DEFAULTS.maxCharsPerResult,
    min: 0,
    max: 1000000,
  },
  {
    key: "deduplicateThreshold",
    type: "number",
    label: "重复行折叠阈值",
    description: "同一行连续出现达到这个次数就折叠成一条带计数的摘要。",
    defaultValue: DEFAULTS.deduplicateThreshold,
    min: 2,
    max: 100,
  },
  {
    key: "enableGrouping",
    type: "boolean",
    label: "相似行分组",
    description: "把结构相似的行归并成组（默认关，opt-in）。",
    defaultValue: DEFAULTS.enableGrouping,
  },
  {
    key: "groupingThreshold",
    type: "number",
    label: "分组阈值",
    description: "相似行达到这个条数才分组，仅在「相似行分组」开启时生效。",
    defaultValue: DEFAULTS.groupingThreshold,
    min: 2,
    max: 100,
  },
  {
    key: "disabledFilters",
    type: "multiselect",
    label: "停用的内置过滤器",
    description: "勾选的内置过滤器不生效。留空 = 全部启用。",
    defaultValue: [],
    options: [
      { value: "git-status", label: "git-status" },
      { value: "git-log", label: "git-log" },
      { value: "git-diff", label: "git-diff" },
      { value: "docker-logs", label: "docker-logs" },
      { value: "npm-install", label: "npm-install" },
      { value: "build-typescript", label: "build-typescript" },
      { value: "error-stacktrace", label: "error-stacktrace" },
      { value: "generic-output", label: "generic-output" },
    ],
  },
  {
    key: "applyToToolResults",
    type: "boolean",
    label: "作用于工具结果",
    description: "对 tool / tool_result 内容做处理（默认开）。关掉基本等于停用本引擎。",
    defaultValue: DEFAULTS.applyToToolResults,
  },
  {
    key: "preserveDocstrings",
    type: "boolean",
    label: "保留文档字符串",
    description: "代码块里的 docstring / 文档注释原样保留（默认开）。",
    defaultValue: DEFAULTS.preserveDocstrings,
  },
]

function mergeRtkConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {}
  const merged = { ...DEFAULTS, ...c }
  return {
    enabled: merged.enabled !== false,
    intensity: ["minimal", "standard", "aggressive"].includes(merged.intensity)
      ? merged.intensity : DEFAULTS.intensity,
    applyToToolResults: merged.applyToToolResults !== false,
    applyToAssistantMessages: merged.applyToAssistantMessages === true,
    applyToCodeBlocks: merged.applyToCodeBlocks === true,
    enabledFilters: Array.isArray(merged.enabledFilters) ? merged.enabledFilters.filter((x) => typeof x === "string") : [],
    disabledFilters: Array.isArray(merged.disabledFilters) ? merged.disabledFilters.filter((x) => typeof x === "string") : [],
    maxLinesPerResult: typeof merged.maxLinesPerResult === "number" ? Math.max(0, Math.floor(merged.maxLinesPerResult)) : DEFAULTS.maxLinesPerResult,
    maxCharsPerResult: typeof merged.maxCharsPerResult === "number" ? Math.max(0, Math.floor(merged.maxCharsPerResult)) : DEFAULTS.maxCharsPerResult,
    deduplicateThreshold: typeof merged.deduplicateThreshold === "number" ? Math.max(2, Math.floor(merged.deduplicateThreshold)) : DEFAULTS.deduplicateThreshold,
    customFiltersEnabled: false, // 内嵌 filters 不支持自定义
    trustProjectFilters: false,
    enableRenderers: false, // renderers 不移植
    groupingThreshold: typeof merged.groupingThreshold === "number" ? Math.max(2, Math.floor(merged.groupingThreshold)) : DEFAULTS.groupingThreshold,
    enableGrouping: merged.enableGrouping === true,
    stripCodeComments: false, // 无 AST 支持
    preserveDocstrings: merged.preserveDocstrings !== false,
  }
}

function estTokens(text) {
  return Math.ceil(text.length / 4)
}

// ─── 消息处理 ────────────────────────────────────────────────────────────

function shouldCompressMessage(message, config) {
  if (config.applyToToolResults && Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock))
    return true
  if (message.role === "tool")
    return config.applyToToolResults || (config.applyToCodeBlocks && hasCodeFence(message.content))
  if (message.role === "assistant")
    return config.applyToAssistantMessages || (config.applyToCodeBlocks && hasCodeFence(message.content))
  return false
}

function hasCodeFence(content) {
  if (!content) return false
  if (typeof content === "string") return /```/.test(content)
  if (!Array.isArray(content)) return false
  return content.some((part) => isTextBlock(part) && typeof part.text === "string" && /```/.test(part.text))
}

function resolveToolMeta(toolId, lookup) {
  const meta = toolId ? lookup.get(toolId) : null
  if (!meta) return { command: null, skipFilters: false }
  if (SHELL_TOOL_NAME_RE.test(meta.toolName.toLowerCase())) {
    return { command: meta.command, skipFilters: false }
  }
  return { command: null, skipFilters: true }
}

function codeOnlyConfig(config) {
  return config.applyToCodeBlocks && !config.applyToToolResults && !config.applyToAssistantMessages
}

function effectiveMaxLines(base, intensity) {
  const factor = intensity === "aggressive" ? 0.5 : intensity === "minimal" ? 1.5 : 1
  return Math.max(1, Math.round(base * factor))
}

// ─── processRtkText：核心文本压缩 ────────────────────────────────────────

function processRtkText(text, options = {}) {
  const config = mergeRtkConfig(options.config)
  const originalTokens = estTokens(text)
  const techniquesUsed = []
  const rulesApplied = []
  let result = text

  const detection = detectCommandType(text, options.command)
  const hasGenericErrorMarkers = /Error:|Exception:|Traceback \(most recent call last\):/.test(text)
  const isDocumentLikeRead = detection.type === "unknown" && !detection.command && !hasGenericErrorMarkers
  let matchedFilterPatterns = []

  if (!options.skipFilters && !isDocumentLikeRead) {
    const filter = matchRtkFilter(text, detection.command)
    if (filter && !config.disabledFilters.includes(filter.id)) {
      if (config.enabledFilters.length === 0 || config.enabledFilters.includes(filter.id)) {
        const filtered = applyLineFilter(result, {
          ...filter,
          maxLines: effectiveMaxLines(filter.maxLines || config.maxLinesPerResult, config.intensity),
        })
        result = filtered.text
        if (filtered.appliedRules.length > 0) {
          techniquesUsed.push("rtk-filter")
          rulesApplied.push(...filtered.appliedRules)
        }
        matchedFilterPatterns = filter.priorityPatterns
      }
    }
  }

  // code blocks stripping
  if (config.applyToCodeBlocks) {
    let strippedCodeBlocks = 0
    result = result.replace(
      /```([A-Za-z0-9_+.-]*)\r?\n([\s\S]*?)```/g,
      (match, languageHint, code) => {
        const stripped = stripCode(code, normalizeCodeLanguage(languageHint), {
          removeComments: false, // 无 AST
          preserveDocstrings: config.preserveDocstrings,
        })
        if (stripped.strippedLines <= 0 && stripped.text === code.trim()) return match
        strippedCodeBlocks++
        const fenceLanguage = languageHint?.trim() || stripped.language
        return `\`\`\`${fenceLanguage}\n${stripped.text}\n\`\`\``
      }
    )
    if (strippedCodeBlocks > 0) {
      techniquesUsed.push("rtk-code-strip")
      rulesApplied.push("rtk:code-strip")
    }
  }

  // dedup
  const shouldSkipDedup = Boolean(options.skipFilters)
  const deduped = shouldSkipDedup
    ? { text: result, collapsed: 0 }
    : deduplicateRepeatedLines(result, { threshold: config.deduplicateThreshold })
  if (deduped.collapsed > 0) {
    result = deduped.text
    techniquesUsed.push("rtk-dedup")
    rulesApplied.push("rtk:dedup")
  }

  // grouping (opt-in)
  if (config.enableGrouping) {
    const grouped = groupSimilarLines(result, { threshold: config.groupingThreshold })
    if (grouped.grouped > 0) {
      result = grouped.text
      techniquesUsed.push("rtk-grouping")
      rulesApplied.push("rtk:grouping")
    }
  }

  // smart truncate
  const defaultPriorityPatterns = [severityPattern()]
  const filterPriorityPatterns = matchedFilterPatterns.flatMap((pattern) => {
    try { return [new RegExp(pattern, "i")] } catch { return [] }
  })
  const truncated = isDocumentLikeRead
    ? { text: result, truncated: false, droppedLines: 0 }
    : smartTruncate(result, {
        maxLines: effectiveMaxLines(config.maxLinesPerResult, config.intensity),
        maxChars: config.maxCharsPerResult,
        preserveHead: config.intensity === "aggressive" ? 16 : 24,
        preserveTail: config.intensity === "aggressive" ? 16 : 24,
        priorityPatterns: [...defaultPriorityPatterns, ...filterPriorityPatterns],
      })
  if (truncated.truncated) {
    result = truncated.text
    techniquesUsed.push("rtk-truncate")
    rulesApplied.push("rtk:truncate")
  }

  const compressedTokens = estTokens(result)
  return {
    text: result,
    compressed: compressedTokens < originalTokens,
    originalTokens,
    compressedTokens,
    techniquesUsed: [...new Set(techniquesUsed)],
    rulesApplied: [...new Set(rulesApplied)],
  }
}

// ─── processToolResultBlocks：Anthropic tool_result blocks ───────────────

function processToolResultBlocks(content, config, toolCallLookup) {
  const techniquesUsed = []
  const rulesApplied = []
  if (!Array.isArray(content)) return { content, compressed: false, techniquesUsed, rulesApplied }

  let compressed = false
  const nextContent = content.map((part) => {
    if (!isAnthropicToolResultBlock(part)) return part
    if (hasCacheControlMarker(part)) return part
    const toolUseId = typeof part.tool_use_id === "string" ? part.tool_use_id : null
    const { command, skipFilters } = resolveToolMeta(toolUseId, toolCallLookup)
    const inner = part.content

    if (typeof inner === "string") {
      if (!inner) return part
      const processed = processRtkText(inner, { config, command, skipFilters })
      techniquesUsed.push(...processed.techniquesUsed)
      rulesApplied.push(...processed.rulesApplied)
      if (!processed.compressed) return part
      compressed = true
      return { ...part, content: processed.text }
    }

    if (Array.isArray(inner)) {
      let blockChanged = false
      const nextInner = inner.map((sub) => {
        if (!isTextBlock(sub) || !sub.text) return sub
        if (hasCacheControlMarker(sub)) return sub
        const processed = processRtkText(sub.text, { config, command, skipFilters })
        techniquesUsed.push(...processed.techniquesUsed)
        rulesApplied.push(...processed.rulesApplied)
        if (!processed.compressed) return sub
        blockChanged = true
        compressed = true
        return { ...sub, text: processed.text }
      })
      return blockChanged ? { ...part, content: nextInner } : part
    }

    return part
  })

  return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied }
}

// ─── processRtkContent ───────────────────────────────────────────────────

function processRtkContent(content, config, options = {}) {
  if (codeOnlyConfig(config)) {
    return processRtkCodeBlocksOnly(content, config)
  }
  const techniquesUsed = []
  const rulesApplied = []

  if (typeof content === "string") {
    if (!content) return { content, compressed: false, techniquesUsed, rulesApplied }
    const processed = processRtkText(content, { config, command: options.command, skipFilters: options.skipFilters })
    techniquesUsed.push(...processed.techniquesUsed)
    rulesApplied.push(...processed.rulesApplied)
    return {
      content: processed.compressed ? processed.text : content,
      compressed: processed.compressed,
      techniquesUsed, rulesApplied,
    }
  }

  if (!Array.isArray(content)) return { content, compressed: false, techniquesUsed, rulesApplied }

  let compressed = false
  const nextContent = content.map((part) => {
    if (!isTextBlock(part) || !part.text) return part
    const processed = processRtkText(part.text, { config, command: options.command, skipFilters: options.skipFilters })
    techniquesUsed.push(...processed.techniquesUsed)
    rulesApplied.push(...processed.rulesApplied)
    if (!processed.compressed) return part
    compressed = true
    return { ...part, text: processed.text }
  })

  return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied }
}

function processRtkCodeBlocksOnly(content, config) {
  const techniquesUsed = []
  const rulesApplied = []
  const processText = (text) => {
    let compressed = false
    const nextText = text.replace(/```([\s\S]*?)```/g, (match) => {
      const processed = processRtkText(match, { config })
      techniquesUsed.push(...processed.techniquesUsed)
      rulesApplied.push(...processed.rulesApplied)
      if (!processed.compressed) return match
      compressed = true
      return processed.text
    })
    return { text: compressed ? nextText : text, compressed }
  }

  if (typeof content === "string") {
    const processed = processText(content)
    return { content: processed.text, compressed: processed.compressed, techniquesUsed, rulesApplied }
  }
  if (!Array.isArray(content)) return { content, compressed: false, techniquesUsed, rulesApplied }
  let compressed = false
  const nextContent = content.map((part) => {
    if (!isTextBlock(part) || !part.text) return part
    const processed = processText(part.text)
    if (!processed.compressed) return part
    compressed = true
    return { ...part, text: processed.text }
  })
  return { content: compressed ? nextContent : content, compressed, techniquesUsed, rulesApplied }
}

// ─── 引擎契约 ────────────────────────────────────────────────────────────

export const id = "rtk"

export function apply(body, ctx, cfg) {
  if (!body || typeof body !== "object") return false
  const messages = body.messages
  if (!Array.isArray(messages) || messages.length === 0) return false

  const config = mergeRtkConfig(cfg)
  if (!config.enabled) return false

  const allTechniques = []
  const allRules = []

  // Build tool_call_id → tool metadata lookup
  const toolCallLookup = new Map()
  for (const msg of messages) {
    if (msg.role !== "assistant") continue
    const toolCalls = msg.tool_calls
    if (Array.isArray(toolCalls)) {
      for (const tc of toolCalls) {
        if (!tc || typeof tc !== "object") continue
        const id = typeof tc.id === "string" ? tc.id : null
        if (!id) continue
        const fn = tc.function
        if (!fn || typeof fn !== "object") continue
        const toolName = typeof fn.name === "string" ? fn.name : ""
        let command = null
        if (typeof fn.arguments === "string") {
          try {
            const args = JSON.parse(fn.arguments)
            command = typeof args.command === "string" ? args.command
              : typeof args.cmd === "string" ? args.cmd : null
          } catch { /* non-JSON */ }
        }
        toolCallLookup.set(id, { toolName, command })
      }
    }
    // Anthropic shape
    if (Array.isArray(msg.content)) {
      for (const part of msg.content) {
        if (!part || typeof part !== "object" || part.type !== "tool_use") continue
        const id = typeof part.id === "string" ? part.id : null
        if (!id) continue
        const toolName = typeof part.name === "string" ? part.name : ""
        const input = part.input
        let command = null
        if (input && typeof input === "object") {
          command = typeof input.command === "string" ? input.command
            : typeof input.cmd === "string" ? input.cmd : null
        }
        toolCallLookup.set(id, { toolName, command })
      }
    }
  }

  let anyMessageChanged = false
  const compressedMessages = messages.map((message) => {
    if (!shouldCompressMessage(message, config)) return message

    // Anthropic tool_result blocks
    if (Array.isArray(message.content) && message.content.some(isAnthropicToolResultBlock)) {
      const processed = processToolResultBlocks(message.content, config, toolCallLookup)
      allTechniques.push(...processed.techniquesUsed)
      allRules.push(...processed.rulesApplied)
      if (!processed.compressed) return message
      anyMessageChanged = true
      return { ...message, content: processed.content }
    }

    // OpenAI tool message
    let command = null
    let skipFilters = false
    if (message.role === "tool") {
      const callId = typeof message.tool_call_id === "string" ? message.tool_call_id : null
      ;({ command, skipFilters } = resolveToolMeta(callId, toolCallLookup))
    }

    const processed = processRtkContent(message.content, config, { command, skipFilters })
    allTechniques.push(...processed.techniquesUsed)
    allRules.push(...processed.rulesApplied)
    if (!processed.compressed) return message
    anyMessageChanged = true
    return { ...message, content: processed.content }
  })

  if (!anyMessageChanged) return false
  body.messages = compressedMessages // magpie 契约：原地改写回 body（上游返回新body）
  if (ctx && ctx.state) {
    ctx.state.rtk = {
      techniquesUsed: [...new Set(allTechniques)],
      rulesApplied: [...new Set(allRules)],
    }
  }
  return true
}
