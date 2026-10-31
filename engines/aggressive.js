// engines/aggressive.js — Aggressive：把较早的轮次摘要化并逐步老化，只保留最近细节（约 50%）。
//
// 来源（OmniRoute@ff679ab86e0113a009d8aeeeee464139bd090874 open-sse/services/compression/）：
//   - aggressive.ts            (233 行)  三步主流程 + [COMPRESSED: 标记约定
//   - progressiveAging.ts      (5689B)   applyAging 分档老化
//   - summarizer.ts            (244 行)  RuleBasedSummarizer（纯规则摘要器）
//   - toolResultCompressor.ts  (9120B)   第 ① 步工具结果压缩（随本引擎一起搬）
//   - types.ts                           DEFAULT_AGGRESSIVE_CONFIG / Summarizer 契约
//
// ── 与上游的差异（仅环境适配，语义不变的部分逐字搬）────────────────────────
//   1. 遍历方式：上游直接遍历 body.messages，并分别处理 OpenAI / Anthropic 两种 content
//      形状；这里统一走 adapter.conversationView(body, protocol) 的 segments
//      （chat / responses / anthropic / gemini 四协议），上游的「消息序号」语义映射为
//      「片段序号」。system 段永不改写（等价上游 preserveSystemPrompt:true）。
//   2. **上游的 LLM 摘要路径已移除，只保留启发式摘要。** summarizer.ts 上游注释写着
//      "rule-based default, LLM-ready for future drop-in"，实现里本来就没有任何 LLM
//      调用；本移植同样不含任何 LLM 分支（moejs 没有 fetch，也无外部模型可调）。
//      摘要 = 首句意图 + 文件路径 + 报错片段 + 末条决定 + 代码围栏裁剪，全程本地规则。
//   3. caveman 档：上游 moderate 档调用 caveman.ts 的 cavemanCompress。caveman 在 catalog
//      里是独立引擎（id="caveman"，stackPriority 20），不在本模块移植范围，因此 moderate
//      档改用「启发式摘要 + 空白折叠」。档位强度语义不变：light < moderate < fullSummary。
//   4. light 档复用已移植的 ./lite.js（与上游 applyLiteCompression 调用点一致）。
//   5. 砍掉 aggressive.ts 末尾的 caveman-fallback / lite-fallback 二次尝试（上游用来在
//      多个降级方案里挑节省率更高的一个）；本移植的分档流程本身已覆盖这些档位，不重复压缩。
//   6. 分档阈值由 catalog 的 keepTurns 推导：verbatim=keepTurns、light=keepTurns+2、
//      moderate=keepTurns+4、其余 fullSummary。上游默认 thresholds
//      {fullSummary:5, moderate:3, light:2, verbatim:2} 会让 light 档永远不可达
//      （verbatim 先命中同值），这里按 keepTurns 展开成连续窗口。
//   7. 纯 JSON / 代码围栏片段：上游 tagAged 对这两类只加 [COMPRESSED:aging:*] 标记而
//      不减内容（净增字符）。这里直接跳过，避免零收益却打穿 prompt cache。
//   8. minSavingsThreshold(0.05)、CompressionStats、Date.now 不移植：中间件契约只返回
//      布尔，统计由 stats-writer.js 负责。
//   9. ANSI 正则：上游对带 /g 的正则直接 .test()（会留下 lastIndex 副作用，第二次判定
//      结果随机）；这里用无 g 副本判定，行为修正为确定性。
//  10. 零依赖：只用相对 import，无 Node API、无 fetch、无定时器；apply 全程 try/catch，
//      任何异常都返回 false（fail-open，不改动 body）。

import { conversationView } from "../adapter.js"
import { applyLiteCompression } from "./lite.js"

// ─── 元数据（catalog.js 是面板真源，这里保持同值；stackPriority 与上游一致）──────
export const id = "aggressive"
export const label = "Aggressive"
export const why = "摘要较早轮次并逐步老化；实测约 25–35%（上游标称 50%），会改写历史、影响缓存。"
export const lossy = true
export const cacheImpact = "high"

export const defaultOn = false
export const stackPriority = 30
export const isSingleMode = false
export const levels = undefined
export const available = true

// configSchema 逐字取自 catalog.js:192-211（cfg 的默认值就来自这里）。
// 注意：上游 aggressive.ts 的 schema 是 thresholds/toolStrategies/summarizerEnabled/
// maxTokensPerMessage/minSavingsThreshold，面板只暴露 keepTurns 与 summaryChars 两个旋钮，
// 因此阈值由 keepTurns 推导、摘要长度由 summaryChars 承载，其余上游字段固定为默认值。
export const configSchema = [
  {
    key: "keepTurns",
    type: "number",
    label: "保留最近轮次",
    description: "最近这么多轮对话原样保留",
    defaultValue: 4,
    min: 1,
    max: 30,
  },
  {
    key: "summaryChars",
    type: "number",
    label: "摘要长度",
    description: "每段被摘要化内容的字符上限",
    defaultValue: 400,
    min: 80,
    max: 4000,
  },
]

// ─── 上游常量（types.ts / summarizer.ts / toolResultCompressor.ts）────────────
const COMPRESSED_MARKER_RE = /^\[COMPRESSED:/
const INTENT_TRIGGERS =
  /^(?:request|fix|implement|add|remove|update|refactor|create|delete|change|build)\s*:/i
const FILE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "md",
  "json",
  "sql",
  "css",
  "html",
  "yaml",
  "yml",
  "sh",
  "rb",
  "go",
  "rs",
  "java",
  "c",
  "cpp",
  "h",
  "hpp",
])

// 工具结果压缩器用到的正则（上游 ANSI_RE 带 /g，仅用于 replace；判定用无 g 副本）
const ANSI_RE_G = /\x1b\[[0-9;]*[a-zA-Z]/g
const ANSI_TEST_RE = /\x1b\[[0-9;]*[a-zA-Z]/
const SHELL_PROMPT_RE = /\$\s/
const JSON_PREFIX_RE = /^\s*[{[]/

const DEFAULT_KEEP_TURNS = 4
const DEFAULT_SUMMARY_CHARS = 400
const SUMMARY_MAX_LEN_FLOOR = 80
const SUMMARY_MAX_LEN_CEIL = 4000
// 上游 maxTokensPerMessage(2048) * 4 = 8192 字符；这里按 summaryChars*4 同比缩放
const OVERSIZED_FACTOR = 4

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
// 摘要器：逐字移植 summarizer.ts 的规则，只保留启发式路径。
// ---------------------------------------------------------------------------

function stripTokenPunctuation(token) {
  let start = 0
  let end = token.length
  const leading = new Set(["'", '"', "`", "(", "[", "{"])
  const trailing = new Set(["'", '"', "`", ")", "]", "}", ",", ";", ":"])
  while (start < end && leading.has(token[start])) start++
  while (end > start && trailing.has(token[end - 1])) end--
  return token.slice(start, end)
}

function getKnownFilePathToken(token) {
  const clean = stripTokenPunctuation(token)
  const lastDot = clean.lastIndexOf(".")
  if (lastDot <= 0 || lastDot === clean.length - 1) return null
  const extension = clean.slice(lastDot + 1).toLowerCase()
  if (!FILE_EXTENSIONS.has(extension)) return null
  if (!clean.includes("/") && !clean.includes(".")) return null
  return clean
}

function extractFilePathTokens(text) {
  const paths = []
  for (const token of text.split(/\s+/)) {
    const filePath = getKnownFilePathToken(token)
    if (filePath) paths.push(filePath)
  }
  return paths
}

function extractErrorSnippets(text) {
  const snippets = []
  for (const segment of text.split(/[.\n]/)) {
    const trimmed = segment.trim()
    if (!trimmed) continue
    const lower = trimmed.toLowerCase()
    if (
      trimmed.includes("TypeError:") ||
      trimmed.includes("ReferenceError:") ||
      trimmed.includes("SyntaxError:") ||
      trimmed.includes("RangeError:") ||
      trimmed.includes("URIError:") ||
      trimmed.includes("EvalError:") ||
      trimmed.includes("Error:") ||
      trimmed.includes("Exception:") ||
      lower.includes("error ts")
    ) {
      snippets.push(trimmed)
    }
  }
  return snippets
}

function extractIntents(entries) {
  const intents = []
  for (const entry of entries) {
    if (entry.role !== "user") continue
    const text = entry.text
    if (!text) continue
    const firstLine = text.split("\n")[0] ? text.split("\n")[0].trim() : ""
    if (firstLine && INTENT_TRIGGERS.test(firstLine)) {
      intents.push(firstLine.slice(0, 120))
    } else if (intents.length === 0 && firstLine) {
      intents.push(firstLine.slice(0, 120))
    }
  }
  return intents
}

function extractFilePaths(entries) {
  const paths = new Set()
  for (const entry of entries) {
    if (!entry.text) continue
    for (const match of extractFilePathTokens(entry.text)) paths.add(match)
  }
  return [...paths].slice(0, 20)
}

function extractErrors(entries) {
  const errors = []
  for (const entry of entries) {
    if (!entry.text) continue
    for (const match of extractErrorSnippets(entry.text)) errors.push(match.slice(0, 150))
  }
  return errors.slice(0, 10)
}

function extractLastDecision(entries) {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].role === "assistant" && entries[i].text) return entries[i].text
  }
  return ""
}

function trimCodeFences(text) {
  let output = ""
  let cursor = 0
  while (cursor < text.length) {
    const start = text.indexOf("```", cursor)
    if (start === -1) {
      output += text.slice(cursor)
      break
    }
    const openingLineEnd = text.indexOf("\n", start + 3)
    if (openingLineEnd === -1) {
      output += text.slice(cursor)
      break
    }
    const closeStart = text.indexOf("\n```", openingLineEnd + 1)
    if (closeStart === -1) {
      output += text.slice(cursor)
      break
    }
    const closeEnd = closeStart + 4
    const opening = text.slice(start, openingLineEnd)
    const code = text.slice(openingLineEnd + 1, closeStart)
    const lines = code.split("\n")
    output += text.slice(cursor, start)
    if (lines.length <= 4) {
      output += text.slice(start, closeEnd)
    } else {
      const head = lines.slice(0, 3).join("\n")
      const tail = lines[lines.length - 1]
      output += opening + "\n" + head + "\n…\n" + tail + "\n```"
    }
    cursor = closeEnd
  }
  return output
}

/**
 * RuleBasedSummarizer.summarize 的等价实现：entries = [{ role, text }]。
 * 输出以 [COMPRESSED:summary] 开头（与上游一致，外层还会再加 aging 标记）。
 */
export function summarizeText(entries, opts) {
  const maxLen = opts && Number.isFinite(opts.maxLen) ? opts.maxLen : 2000
  const preserveCode = !opts || opts.preserveCode !== false

  const filtered = entries.filter(
    (e) =>
      e && typeof e.text === "string" && e.text.trim().length > 0 && !COMPRESSED_MARKER_RE.test(e.text)
  )
  if (filtered.length === 0) return ""

  const intents = extractIntents(filtered)
  const files = extractFilePaths(filtered)
  const errors = extractErrors(filtered)
  const decision = extractLastDecision(filtered)

  const parts = ["[COMPRESSED:summary]"]
  if (intents.length > 0) parts.push("Intents: " + intents.join("; ") + ".")
  if (files.length > 0) parts.push("Files touched: " + files.join(", ") + ".")
  if (errors.length > 0) parts.push("Errors: " + errors.join("; ") + ".")
  if (decision) {
    const processed = preserveCode ? trimCodeFences(decision) : decision
    parts.push("Last decision: " + processed.slice(0, maxLen))
  }
  return parts.join("\n")
}

// ---------------------------------------------------------------------------
// 工具结果压缩器：逐字移植 toolResultCompressor.ts（第 ① 步）。
// ---------------------------------------------------------------------------

export function isCodeLikeLine(rawLine) {
  const line = rawLine.trimStart()
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

function parseGrepLinePath(line) {
  const firstColon = line.indexOf(":")
  if (firstColon <= 0) return null
  const secondColon = line.indexOf(":", firstColon + 1)
  if (secondColon === -1) return null
  const lineNumber = line.slice(firstColon + 1, secondColon)
  if (!lineNumber) return null
  for (const char of lineNumber) {
    if (char < "0" || char > "9") return null
  }
  const filePath = line.slice(0, firstColon)
  if (!filePath || /\s/.test(filePath)) return null
  return filePath
}

function hasErrorLikeOutput(content) {
  const lower = content.toLowerCase()
  return (
    lower.includes("error:") ||
    lower.includes("error ") ||
    lower.includes("[error]") ||
    lower.includes("exception ") ||
    lower.includes("[exception]") ||
    lower.includes("traceback")
  )
}

function compressFileContent(content) {
  const lines = content.split("\n")
  if (lines.length < 3) return null
  if (!lines.some(isCodeLikeLine)) return null
  const keep = 20
  const tail = 5
  if (lines.length <= keep + tail) return content
  const head = lines.slice(0, keep).join("\n")
  const tailLines = lines.slice(-tail).join("\n")
  const elided = lines.length - keep - tail
  return head + "\n… [" + elided + " lines elided] …\n" + tailLines
}

function compressGrepSearch(content) {
  const lines = content.split("\n")
  const grepLines = lines.filter((line) => parseGrepLinePath(line) !== null)
  if (grepLines.length === 0) return null
  const paths = new Set()
  for (const line of grepLines) {
    const filePath = parseGrepLinePath(line)
    if (filePath) paths.add(filePath)
  }
  const top30 = grepLines.slice(0, 30)
  const remaining = grepLines.length - top30.length
  let result = top30.join("\n")
  if (remaining > 0) result += "\n… [" + remaining + " more matches]"
  result += "\nFiles: " + [...paths].join(", ")
  return result
}

function compressShellOutput(content) {
  const hasAnsi = ANSI_TEST_RE.test(content)
  const hasPrompt = SHELL_PROMPT_RE.test(content)
  if (!hasAnsi && !hasPrompt) return null
  const cleaned = content.replace(ANSI_RE_G, "")
  const lines = cleaned.split("\n")
  const last50 = lines.slice(-50)
  const deduped = []
  for (const line of last50) {
    if (deduped.length === 0 || line !== deduped[deduped.length - 1]) deduped.push(line)
  }
  return deduped.join("\n")
}

function compressJson(content) {
  if (content.length <= 2000) return null
  if (!JSON_PREFIX_RE.test(content)) return null
  let parsed
  try {
    parsed = JSON.parse(content)
  } catch {
    return null
  }
  if (Array.isArray(parsed)) {
    if (parsed.length <= 7) return content
    return JSON.stringify(
      { type: "array", total: parsed.length, first5: parsed.slice(0, 5), last2: parsed.slice(-2) },
      null,
      2
    )
  }
  if (typeof parsed === "object" && parsed !== null) {
    const keys = Object.keys(parsed)
    const summary = {}
    for (const key of keys.slice(0, 20)) {
      const val = parsed[key]
      if (typeof val === "object" && val !== null) {
        summary[key] = "{…" + Object.keys(val).length + " keys}"
      } else {
        summary[key] = val
      }
    }
    if (keys.length > 20) summary["_remaining_" + (keys.length - 20) + "_keys"] = true
    return JSON.stringify(summary, null, 2)
  }
  return null
}

function compressErrorMessage(content) {
  if (!hasErrorLikeOutput(content)) return null
  const lines = content.split("\n")
  const errorLine = lines[0] || ""
  const stackLines = lines.slice(1)
  const head = stackLines.slice(0, 10)
  const tail = stackLines.length > 10 ? stackLines.slice(-3) : []
  const middle = stackLines.length > 13 ? ["… [" + (stackLines.length - 13) + " frames elided] …"] : []
  return [errorLine, ...head, ...middle, ...tail].join("\n")
}

/** 上游 toolStrategies 默认全开；catalog 没有对应旋钮，这里固定为默认值。 */
const TOOL_STRATEGIES = {
  fileContent: true,
  grepSearch: true,
  shellOutput: true,
  json: true,
  errorMessage: true,
}

export function compressToolResult(content) {
  const strategies = [
    ["fileContent", compressFileContent],
    ["grepSearch", compressGrepSearch],
    ["shellOutput", compressShellOutput],
    ["json", compressJson],
    ["errorMessage", compressErrorMessage],
  ]
  for (const [name, fn] of strategies) {
    if (!TOOL_STRATEGIES[name]) continue
    const result = fn(content)
    if (result === null) continue
    return {
      compressed: result,
      strategy: name,
      saved: estimateTokens(content) - estimateTokens(result),
    }
  }
  return { compressed: content, strategy: "none", saved: 0 }
}

// ---------------------------------------------------------------------------
// 结构化内容守卫（差异 7）：纯 JSON / 代码围栏不加标记也不减内容。
// ---------------------------------------------------------------------------

function isPureJson(text) {
  const t = text.trim()
  if (!t) return false
  const first = t[0]
  if (first !== "{" && first !== "[") return false
  try {
    JSON.parse(t)
    return true
  } catch {
    return false
  }
}

function isFencedBlock(text) {
  const t = text.trim()
  return t.length >= 6 && t.startsWith("```") && t.endsWith("```")
}

function firstLineOf(text) {
  const line = text.split("\n")[0]
  return line ? line.trim() : ""
}

// ---------------------------------------------------------------------------
// 老化分档（progressiveAging.ts 的 applyAging，阈值由 keepTurns 推导）
// ---------------------------------------------------------------------------

function agingTier(distance, keepTurns) {
  if (distance <= keepTurns) return "verbatim"
  if (distance <= keepTurns + 2) return "light"
  if (distance <= keepTurns + 4) return "moderate"
  return "fullSummary"
}

function tagAged(tier, compressed) {
  return "[COMPRESSED:aging:" + tier + "] " + compressed
}

/** light 档：复用 ./lite.js 的 applyLiteCompression（与上游调用点一致）。 */
function liteCondense(role, text) {
  const r = applyLiteCompression({ messages: [{ role, content: text }] }, { compressToolResults: true })
  if (!r || !r.compressed) return null
  const next = r.body && r.body.messages && r.body.messages[0] && r.body.messages[0].content
  if (typeof next !== "string" || next.length === 0) return null
  return next
}

/** 对一个片段做一次「按档位」压缩，返回新文本或 null（不改）。 */
function ageText(role, text, tier, summaryChars) {
  if (tier === "light") {
    const condensed = liteCondense(role, text)
    if (condensed === null || condensed.length >= text.length) return null
    return tagAged("light", condensed)
  }

  if (tier === "moderate") {
    // 差异 3：上游此处调 cavemanCompress；本插件未移植 caveman，用启发式摘要 + 折叠替代。
    const summary = summarizeText([{ role, text }], { maxLen: summaryChars, preserveCode: true })
    if (!summary) return null
    const next = tagAged("moderate", summary)
    return next.length < text.length ? next : null
  }

  // fullSummary：assistant / tool 走摘要器；user 只留首行（上游同）。
  if (role === "user") {
    const firstLine = firstLineOf(text)
    if (!firstLine || firstLine.length >= text.length) return null
    return tagAged("fullSummary", firstLine.slice(0, 120))
  }
  const summary = summarizeText([{ role, text }], { maxLen: summaryChars, preserveCode: true })
  if (!summary) return null
  const next = tagAged("fullSummary", summary)
  return next.length < text.length ? next : null
}

// ---------------------------------------------------------------------------
// 中间件入口
// ---------------------------------------------------------------------------

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false

    const keepTurns = clampInt(
      cfg ? cfg.keepTurns : undefined,
      DEFAULT_KEEP_TURNS,
      1,
      30
    )
    const summaryChars = clampInt(
      cfg ? cfg.summaryChars : undefined,
      DEFAULT_SUMMARY_CHARS,
      SUMMARY_MAX_LEN_FLOOR,
      SUMMARY_MAX_LEN_CEIL
    )

    const view = conversationView(body, ctx && ctx.protocol)
    if (!view) return false
    const segments = view.segments
    if (!Array.isArray(segments) || segments.length === 0) return false

    let lastUserIdx = -1
    for (let i = segments.length - 1; i >= 0; i--) {
      if (segments[i].role === "user") {
        lastUserIdx = i
        break
      }
    }

    const total = segments.length
    const touched = new Set()
    let changed = false

    // 第 ① 步：工具结果压缩（不分年龄，上游同样全量处理）。
    for (let i = 0; i < total; i++) {
      const seg = segments[i]
      if (seg.role === "system") continue
      if (!seg.toolOutput) continue
      try {
        const text = seg.text
        if (!text || COMPRESSED_MARKER_RE.test(text)) continue
        if (isPureJson(text) || isFencedBlock(text)) continue
        const result = compressToolResult(text)
        if (result.strategy === "none" || result.saved <= 0) continue
        if (result.compressed.length >= text.length) continue
        seg.set(result.compressed)
        touched.add(i)
        changed = true
      } catch {
        // 单片段失败不影响其它片段
      }
    }

    // 第 ② 步：按年龄分档老化。
    for (let i = 0; i < total; i++) {
      if (touched.has(i)) continue
      const seg = segments[i]
      try {
        if (seg.role === "system") continue
        if (i === lastUserIdx) continue
        const text = seg.text
        if (!text || COMPRESSED_MARKER_RE.test(text)) continue
        if (isPureJson(text) || isFencedBlock(text)) continue

        const distance = total - 1 - i
        const tier = agingTier(distance, keepTurns)
        if (tier === "verbatim") continue

        const next = ageText(seg.role, text, tier, summaryChars)
        if (!next || next.length >= text.length) continue
        seg.set(next)
        touched.add(i)
        changed = true
      } catch {
        // 单片段失败不影响其它片段
      }
    }

    // 第 ③ 步：超大但还"新"的片段也摘要一次（上游 maxTokensPerMessage*4 门槛）。
    const oversizedFloor = summaryChars * OVERSIZED_FACTOR
    for (let i = 0; i < total; i++) {
      if (touched.has(i)) continue
      const seg = segments[i]
      try {
        if (seg.role === "system") continue
        if (i === lastUserIdx) continue
        const text = seg.text
        if (!text || text.length <= oversizedFloor) continue
        if (COMPRESSED_MARKER_RE.test(text)) continue
        if (isPureJson(text) || isFencedBlock(text)) continue

        const summary = summarizeText([{ role: seg.role, text }], {
          maxLen: summaryChars,
          preserveCode: true,
        })
        if (!summary || summary.length >= text.length) continue
        seg.set(summary)
        changed = true
      } catch {
        // 单片段失败不影响其它片段
      }
    }

    return changed
  } catch {
    return false
  }
}
