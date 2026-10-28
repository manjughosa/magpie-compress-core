// engines/codex-responses.js — OmniRoute codexResponses 引擎移植（纯 JS / moejs）
//
// 来源：open-sse/services/compression/engines/codexResponses/index.ts
// 用途：压缩 OpenAI Responses API 请求 body.input 里的工具输出
//   （function_call_output / local_shell_call_output / apply_patch_call_output）。
//
// 与上游差异：
//  1. token 计数：上游用 tiktokenCounter.countTextTokens(provider="codex")；
//     moejs 无 tiktoken → 用 chars/4 估算（与 lite 引擎一致）。
//  2. eligibility 元数据：上游由 bodyAdapter 在 responses→chat 转换时打
//     CODEX_RESPONSE_ITEM_META(Symbol)；这里直接扫 body.input，重新推导
//     eligibility（function_call_output 需 call_id 反查 function_call 名、
//     不在保护列表；local_shell/apply_patch 恒 eligible）。
//  3. custom_tool_call_output：上游通过 customToolOutputToChatContent 降级
//     到 text 处理；本移植同样把它列为支持类型，text 即为 output 字段。
//  4. 只处理 responses 协议；chat/anthropic/gemini 直接返回 false（上游
//     也只在 bodyAdapter 把 responses 转 chat 时才跑这个引擎）。

const SUPPORTED_TYPES = new Set([
  "function_call_output",
  "custom_tool_call_output",
  "local_shell_call_output",
  "apply_patch_call_output",
])

const DEFAULT_PROTECTED_TOOL_NAMES = new Set([
  "read",
  "glob",
  "grep",
  "write",
  "edit",
  "websearch",
  "webfetch",
  "web_search",
  "web_fetch",
])

const DEFAULTS = {
  enabled: true,
  minBytes: 512,
  maxOutputBytes: 2 * 1024 * 1024,
  maxCandidateBytes: 512 * 1024,
  maxLines: 160,
  minSearchMatches: 8,
  minLogLines: 24,
  preserveToolNames: [],
}

// ─── 正则（与上游逐字一致） ──────────────────────────────────────────────

const DIFF_HUNK_RE =
  /^@@{1,2}\s+-\d+(?:,\d+)?(?:\s+-\d+(?:,\d+)?)*\s+\+\d+(?:,\d+)?(?:,\d+)?\s+@@{1,2}/m
const SEARCH_LINE_RE = /^\s*(?:[\w./-]+:\d+(?::\d+)?:|\d+(?::\d+)?[-:])\s*\S/m
const IMPORTANT_LOG_RE =
  /(?:^|\b)(?:error|warning|warn|failed|failure|fatal|panic|exception|traceback|assertion|exit\s+code)\b/i
const BUILD_RE =
  /\b(?:build|compile|test|lint|npm|yarn|pnpm|mix|make|cargo|gradle|maven|pytest|rspec|exunit)\b/i
const STACK_LINE_RE = /^(?:\s*(?:at\s|File\s|\S+[:(]\d+))/

// ─── 配置 ────────────────────────────────────────────────────────────────

function bounded(value, fallback, min, max) {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.min(max, Math.max(min, Math.floor(value)))
    : fallback
}

function mergeConfig(cfg) {
  const c = cfg && typeof cfg === "object" ? cfg : {}
  const merged = { ...DEFAULTS, ...c }
  return {
    enabled: merged.enabled !== false,
    minBytes: bounded(merged.minBytes, DEFAULTS.minBytes, 0, 2_000_000),
    maxOutputBytes: bounded(merged.maxOutputBytes, DEFAULTS.maxOutputBytes, 1, 10_000_000),
    maxCandidateBytes: bounded(merged.maxCandidateBytes, DEFAULTS.maxCandidateBytes, 1, 2_000_000),
    maxLines: bounded(merged.maxLines, DEFAULTS.maxLines, 1, 10_000),
    minSearchMatches: bounded(merged.minSearchMatches, DEFAULTS.minSearchMatches, 2, 10_000),
    minLogLines: bounded(merged.minLogLines, DEFAULTS.minLogLines, 2, 10_000),
    preserveToolNames: Array.isArray(merged.preserveToolNames)
      ? merged.preserveToolNames.filter((n) => typeof n === "string")
      : [],
  }
}

// ─── 字节长度（UTF-8，无 Buffer） ────────────────────────────────────────

function byteLength(s) {
  // 上游用 Buffer.byteLength(text, "utf8")。moejs 无 Buffer，用 TextEncoder。
  // 在 moejs 环境 TextEncoder 应可用（Web 标准 API）；否则降级到手算。
  if (typeof TextEncoder !== "undefined") return new TextEncoder().encode(s).length
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair
      n += 4
      i++
    } else n += 3
  }
  return n
}

function estTokens(text) {
  return Math.ceil(text.length / 4)
}

// ─── 压缩器（与上游逐字一致） ─────────────────────────────────────────────

function minifyJson(text) {
  try {
    const parsed = JSON.parse(text)
    if (!Array.isArray(parsed) && (!parsed || typeof parsed !== "object")) return null
    return JSON.stringify(parsed)
  } catch {
    return null
  }
}

function collapseLines(text, config) {
  const lines = text.split(/\r?\n/)
  if (lines.length < config.minLogLines) return null
  const important = lines
    .map((line, index) => ({ line, index }))
    .filter(
      ({ line }) => IMPORTANT_LOG_RE.test(line) || STACK_LINE_RE.test(line)
    )
    .map(({ index }) => index)
  if (important.length === 0 && !BUILD_RE.test(text)) return null
  const keep = new Set()
  for (let index = 0; index < Math.min(8, lines.length); index++) keep.add(index)
  for (let index = Math.max(0, lines.length - 8); index < lines.length; index++) keep.add(index)
  for (const index of important) {
    for (let offset = -2; offset <= 2; offset++) {
      if (index + offset >= 0 && index + offset < lines.length) keep.add(index + offset)
    }
  }
  const indexes = [...keep].sort((a, b) => a - b).slice(0, config.maxLines)
  const output = []
  let previous = -1
  for (const index of indexes) {
    if (index - previous > 1)
      output.push(`[compressed log output: omitted ${index - previous - 1} lines]`)
    output.push(lines[index])
    previous = index
  }
  if (previous < lines.length - 1)
    output.push(`[compressed log output: omitted ${lines.length - previous - 1} lines]`)
  return output.join("\n")
}

function compactDiff(text, config) {
  if (!DIFF_HUNK_RE.test(text)) return null
  const lines = text.split(/\r?\n/)
  const output = []
  let changedSinceContext = 0
  for (const line of lines) {
    const changed = line.startsWith("+") || line.startsWith("-") || line.startsWith("@@")
    if (changed) {
      output.push(line)
      changedSinceContext = 0
    } else if (changedSinceContext < 2) {
      output.push(line)
      changedSinceContext++
    }
  }
  return output.length < lines.length && output.length <= config.maxLines * 4
    ? output.join("\n")
    : null
}

function compactSearch(text, config) {
  const lines = text.split(/\r?\n/)
  const matches = lines.filter((line) => SEARCH_LINE_RE.test(line))
  if (matches.length < config.minSearchMatches) return null
  const grouped = new Map()
  for (const line of matches) {
    const path = line.trim().split(/:\d/)[0].split(/-\d/)[0]
    const group = grouped.get(path) ?? []
    if (group.length < 3) group.push(line.trim())
    grouped.set(path, group)
  }
  const output = [...grouped.entries()]
    .map(([path, entries]) => [path, ...entries].join("\n"))
    .join("\n")
  return output.length < text.length ? output : null
}

function candidateRewrite(text, config) {
  if (byteLength(text) < config.minBytes) return null
  if (byteLength(text) > config.maxCandidateBytes) return null
  const json = minifyJson(text)
  const diff = compactDiff(text, config)
  const search = compactSearch(text, config)
  const log = collapseLines(text, config)
  return (
    [json, diff, search, log]
      .filter((value) => typeof value === "string")
      .sort((a, b) => byteLength(a) - byteLength(b))[0] ?? null
  )
}

function rewriteText(value, config) {
  if (typeof value !== "string") return null
  if (byteLength(value) > config.maxOutputBytes) return null
  const rewritten = candidateRewrite(value, config)
  if (!rewritten || byteLength(rewritten) >= byteLength(value)) return null
  if (estTokens(rewritten) >= estTokens(value)) return null
  return rewritten
}

function hasLossyRewriteCandidate(text, config) {
  if (typeof text !== "string") return false
  return (
    compactDiff(text, config) !== null ||
    compactSearch(text, config) !== null ||
    collapseLines(text, config) !== null
  )
}

// ─── eligibility：重新推导上游 bodyAdapter 的 CODEX_RESPONSE_ITEM_META ────

function collectFunctionCalls(items) {
  // 扫 body.input，构建 call_id → name 与保护 call_id 集合
  const functionCalls = new Map()
  const skippedCallIds = new Set()
  const protectedNames = new Set(DEFAULT_PROTECTED_TOOL_NAMES)
  return { functionCalls, skippedCallIds, protectedNames }
}

function markEligibility(items, config) {
  const { functionCalls, skippedCallIds, protectedNames } = collectFunctionCalls(items)
  for (const name of config.preserveToolNames) protectedNames.add(name.trim().toLowerCase())

  for (const raw of items) {
    if (!raw || typeof raw !== "object") continue
    if (raw.type !== "function_call") continue
    if (typeof raw.call_id !== "string" || raw.call_id.length === 0) continue
    const name = typeof raw.name === "string" ? raw.name : ""
    functionCalls.set(raw.call_id, name)
    if (
      protectedNames.has(name.trim().toLowerCase()) ||
      name === "headless_retrieval" ||
      name.endsWith("__headless_retrieval")
    ) {
      skippedCallIds.add(raw.call_id)
    }
  }

  const meta = new Map() // item → { type, eligible }
  for (let i = 0; i < items.length; i++) {
    const raw = items[i]
    if (!raw || typeof raw !== "object") continue
    const type = raw.type
    if (!SUPPORTED_TYPES.has(type)) continue
    if (type === "local_shell_call_output" || type === "apply_patch_call_output") {
      meta.set(raw, { type, eligible: true })
      continue
    }
    if (type === "custom_tool_call_output") {
      // 上游 bodyAdapter 把它当工具结果但 SUPPORTED_TYPES 不含 → eligible:false
      meta.set(raw, { type, eligible: false })
      continue
    }
    // function_call_output
    const callId = typeof raw.call_id === "string" ? raw.call_id : ""
    const eligible = callId.length > 0 && functionCalls.has(callId) && !skippedCallIds.has(callId)
    meta.set(raw, { type, eligible })
  }
  return meta
}

// ─── 引擎 ────────────────────────────────────────────────────────────────

export const id = "codex-responses"

export function apply(body, ctx, cfg) {
  if (!body || typeof body !== "object") return false
  if (ctx && ctx.protocol && ctx.protocol !== "responses") return false
  const items = body.input
  if (!Array.isArray(items) || items.length === 0) return false

  const config = mergeConfig(cfg)
  if (!config.enabled) return false

  const metaMap = markEligibility(items, config)
  let changed = false
  let compressedCount = 0

  for (const raw of items) {
    const meta = metaMap.get(raw)
    if (!meta || !meta.eligible) continue
    // local_shell_call_output 若有有损候选(diff/search/log) 则整体跳过——上游语义
    if (meta.type === "local_shell_call_output" && hasLossyRewriteCandidate(raw.output, config)) {
      continue
    }
    const content = raw.output
    if (typeof content !== "string") continue
    const next = rewriteText(content, config)
    if (next === null) continue
    raw.output = next
    changed = true
    compressedCount++
  }

  if (!changed) return false
  if (ctx && ctx.state) {
    ctx.state.codexResponses = { compressedCount }
  }
  return true
}
