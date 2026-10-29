// engines/ccr/index.js — OmniRoute ccr 引擎（Content-Addressed References）的纯 JS 移植。
// 依据: open-sse/services/compression/engines/ccr/index.ts（1023 行）、
//       ccr/ccrQuery.ts（110 行）、ccr/protocolInstruction.ts（119 行）。
//
// 与上游的差异（只做环境适配，算法逐字保留）：
//   1. node:crypto → ../../hash.js 的纯 JS sha256hex。marker 里的 hash 仍是 sha256(text)
//      的前 24 个 hex 字符，与上游同格式：`[CCR retrieve hash=<24hex> chars=N]`。
//   2. better-sqlite3 持久层（ccrBlocks 表 / principalId 分区 / setImmediate 延迟写入 /
//      跨实例 rehydrate）整体砍掉：moejs 中间件没有 fs、没有数据库、没有跨请求状态。
//      改成"本次请求内的内存 store"（ctx.state.ccr），见下面第 5 条。
//   3. createCompressionStats → 本地 chars/4 估算（只影响遥测，与 session-dedup 移植同一处理）。
//   4. safe-regex（npm）→ 内置 isSafePattern 启发式检查：拒绝嵌套量词、连续量词、反向引用、
//      超长 pattern，并保留 try/catch 编译兜底。两者意图等价（宁可拒绝，也不让一个正则把
//      250ms 预算烧穿），判定细节必然不同。
//   5. **关键限制**（与 session-dedup.js 头部第 4、5 条同一思路）：上游"原文可取回"依赖
//      后续轮次调用 omniroute_ccr_retrieve 去查持久 store。moejs 的 onRequest 是单次同步钩子，
//      拿不到跨请求状态，所以**后续轮次取不回**本次写下的 hash。本移植的做法：
//        a) marker 照上游格式写进 body（原文前 200 字符的 preamble 一并保留，上游 #7746 的
//           防呆——"永远不要只给调用方一个裸 marker"）；
//        b) 原文与 hash 的映射记在 ctx.state.ccr.map，同一次请求内可用 restoreCcr() 做
//           round-trip 校验（pipeline 里 dedupRoundTrip 是同一思路）；
//        c) 因为跨轮取不回，**默认只在调用方声明了 omniroute_ccr_retrieve 工具时才压缩**
//           （callerSupportsCcrRetrieve，与上游 #7746 follow-up 完全同一门控；session-dedup
//           的 fuzzy 也是这么处理的）。这样 catalog 的 lossy:false 才站得住。
//           cfg.requireRetrieveTool=false 可解除门控——此时 marker 不可兑现，引擎实际有损。
//   6. 环境变量路径砍掉（moejs 没有 process.env）：COMPRESSION_CCR_RETRIEVAL_RAMP_FACTOR
//      改由 cfg.retrievalRampFactor 配置；COMPRESSION_CCR_DURABLE_STORE 随持久层一起消失。
//   7. 协议覆盖扩大：上游只认 body["messages"]（chat/anthropic），本移植统一走 adapter.js 的
//      conversationView，chat/responses/anthropic/gemini 的文本段都能压。#8033 的 protocol
//      instruction 注入仍只支持 messages 数组（chat/anthropic），responses/gemini 跳过。
//
// catalog 里 ccr 的 fields 是 minBlockBytes / minRepeat（上游没有这两个键）。两个都实现，
// 默认值取上游语义：minRepeat 默认 1（= 不要求重复，上游任何 ≥minChars 的块都折叠）；
// minBlockBytes 默认 2048（catalog 显示值；上游只有 600 字符阈值，设 0 即回到纯字符阈值）。

import { sha256hex } from "../../hash.js"
import { conversationView } from "../../adapter.js"

// ─── 元数据（与 catalog.js 的 ccr 条目逐字一致） ─────────────────────────────

export const id = "ccr"
export const label = "CCR"
export const why = "把大的重复/连续块换成内容寻址引用，原文仍可取回（无损）。"
export const description =
  "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable."
export const lossy = false
export const cacheImpact = "low"

export const defaultOn = true
export const stackPriority = 4
export const isSingleMode = false
export const levels = undefined
export const available = true

// ─── 常量（上游逐字） ────────────────────────────────────────────────────────

const ENGINE_ID = "ccr"
/** 块成为 CCR 候选的最小字符数。 */
const DEFAULT_MIN_CHARS = 600
/** catalog 的 minBlockBytes 默认值；上游无此阈值。0 = 关闭字节阈值。 */
const DEFAULT_MIN_BLOCK_BYTES = 2048
/** 同一块至少出现几次才折叠。上游无此阈值（默认 1）。 */
const DEFAULT_MIN_REPEAT = 1
/** 该 (principal, hash) 被取回多少次后彻底不再压缩。 */
const RETRIEVAL_THRESHOLD = 3
/** H8：每取回一次，minChars 线性抬高的系数；1 = 只保留阈值悬崖。 */
const RETRIEVAL_RAMP_FACTOR_DEFAULT = 2
/** marker 前保留的原文前缀字符数（上游 #7746）。 */
const MARKER_PREAMBLE_CHARS = 200

const MAX_CCR_ENTRIES = 5000
const MAX_CCR_BLOCK_BYTES = 2 * 1024 * 1024
const MAX_CCR_PRINCIPAL_BYTES = 16 * 1024 * 1024
const MAX_CCR_GLOBAL_BYTES = 64 * 1024 * 1024
const DEFAULT_CCR_TTL_SECONDS = 24 * 60 * 60
const MAX_CCR_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_CCR_MCP_FULL_BYTES = 256 * 1024

/** 重复计数时的扫描上限，避免病态输入把预算烧穿。 */
const MAX_REPEAT_SCAN_OCCURRENCES = 64
/** 无 principalId 时的哨兵（上游同值）。 */
const ANON = "__anon__"

// ─── 配置 schema（上游 CCR_SCHEMA 逐字 + 两个 catalog 键 + 门控开关） ────────

export const configSchema = [
  {
    key: "enabled",
    type: "boolean",
    label: "Enabled",
    defaultValue: true,
  },
  {
    key: "minChars",
    type: "number",
    label: "Minimum block characters",
    description: "Minimum character count for a block to be a CCR candidate.",
    defaultValue: DEFAULT_MIN_CHARS,
    min: 100,
    max: 1000000,
  },
  {
    key: "retrievalRampFactor",
    type: "number",
    label: "Retrieval ramp factor (H8)",
    description:
      "How steeply frequently-retrieved blocks resist compression. Each prior retrieval raises " +
      "the effective minimum block size linearly; 1 disables the ramp (binary skip at the " +
      "threshold only).",
    defaultValue: RETRIEVAL_RAMP_FACTOR_DEFAULT,
    min: 1,
    max: 100,
  },
  {
    key: "minBlockBytes",
    type: "number",
    label: "最小块字节",
    description: "小于这个 UTF-8 字节数的块不换成引用；0 表示只用 minChars 的字符阈值。",
    defaultValue: DEFAULT_MIN_BLOCK_BYTES,
    min: 0,
    max: 65536,
  },
  {
    key: "minRepeat",
    type: "number",
    label: "最少重复次数",
    description: "同一块在本次 body 里至少出现几次才折叠；1 = 上游语义（不要求重复）。",
    defaultValue: DEFAULT_MIN_REPEAT,
    min: 1,
    max: 10,
  },
  {
    key: "requireRetrieveTool",
    type: "boolean",
    label: "要求调用方能取回",
    description:
      "上游门控：只有 tools[] 里声明了 omniroute_ccr_retrieve 的调用方才压缩。" +
      "关掉它 = marker 无法兑现，引擎实际有损。",
    defaultValue: true,
  },
]
export const CCR_SCHEMA = configSchema

// ─── 小工具 ─────────────────────────────────────────────────────────────────

/** UTF-8 字节数（moejs 没有 Buffer）。代理对按 4 字节计。 */
export function utf8ByteLength(text) {
  let bytes = 0
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff) {
      bytes += 4
      i++ // 跳过低位代理
    } else bytes += 3
  }
  return bytes
}

/** marker 里嵌入的 24 hex 内容哈希（上游 sha256 前 24 位）。 */
export function hashContent(text) {
  return sha256hex(text).slice(0, 24)
}

function buildStoreKey(hash, principalId) {
  return `${principalId || ANON} ${hash}`
}

function normalizeTtlSeconds(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_CCR_TTL_SECONDS
  return Math.max(60, Math.min(MAX_CCR_TTL_SECONDS, Math.floor(value)))
}

/** 本次请求内的 CCR store（替代上游 better-sqlite3 + 模块级 Map 两层）。 */
export function makeStore() {
  return {
    entries: new Map(), // storeKey -> entry
    retrievalCounts: new Map(), // storeKey -> count
    principalBytes: new Map(), // principalId -> bytes
    totalBytes: 0,
    lifecycle: { expiredEvictions: 0, capacityEvictions: 0, rejectedStores: 0 },
  }
}

function removeEntry(store, key, reason) {
  const entry = store.entries.get(key)
  if (!entry) return false
  store.entries.delete(key)
  store.totalBytes = Math.max(0, store.totalBytes - entry.bytes)
  const left = Math.max(0, (store.principalBytes.get(entry.principalId) || 0) - entry.bytes)
  if (left === 0) store.principalBytes.delete(entry.principalId)
  else store.principalBytes.set(entry.principalId, left)
  if (reason === "expired") store.lifecycle.expiredEvictions++
  if (reason === "capacity") store.lifecycle.capacityEvictions++
  return true
}

function purgeExpired(store, now) {
  for (const [key, entry] of store.entries) {
    if (entry.expiresAt <= now) removeEntry(store, key, "expired")
  }
}

function evictOldestMatching(store, predicate) {
  for (const [key, entry] of store.entries) {
    if (predicate(entry)) return removeEntry(store, key, "capacity")
  }
  return false
}

function principalBytesOf(store, principalId) {
  return store.principalBytes.get(principalId) || 0
}

function enforcePrincipalBudget(store, owner, bytes) {
  while (
    principalBytesOf(store, owner) + bytes > MAX_CCR_PRINCIPAL_BYTES &&
    evictOldestMatching(store, (entry) => entry.principalId === owner)
  ) {
    // 淘汰该 principal 自己的 LRU 条目直到装得下
  }
  return principalBytesOf(store, owner) + bytes <= MAX_CCR_PRINCIPAL_BYTES
}

/** 全局条目/字节上限；先淘汰发起方自己的，再退回到任意 principal（上游逐字语义）。 */
function enforceGlobalBudget(store, owner, bytes) {
  const overBudget = () =>
    store.entries.size >= MAX_CCR_ENTRIES || store.totalBytes + bytes > MAX_CCR_GLOBAL_BYTES
  while (overBudget()) {
    if (evictOldestMatching(store, (entry) => entry.principalId === owner)) continue
    if (evictOldestMatching(store, () => true)) continue
    break
  }
  return store.totalBytes + bytes <= MAX_CCR_GLOBAL_BYTES
}

function rejectStore(store, hash, reason) {
  store.lifecycle.rejectedStores++
  return { stored: false, hash, reason }
}

/**
 * 存一个块。返回 { stored, hash, metadata } / { stored:false, reason }。
 * 上游的持久层写入（persistEntry）在这里不存在——store 本身就活不过这次请求。
 */
export function tryStoreBlock(store, text, principalId, options = {}) {
  const hash = hashContent(text)
  const owner = principalId || ANON
  const key = buildStoreKey(hash, principalId)
  const now = typeof options.now === "number" ? options.now : Date.now()
  purgeExpired(store, now)

  const existing = store.entries.get(key)
  if (existing) {
    existing.lastAccessedAt = now
    existing.expiresAt = now + normalizeTtlSeconds(options.ttlSeconds) * 1000
    store.entries.delete(key) // LRU：重新插入到队尾
    store.entries.set(key, existing)
    return { stored: true, hash, metadata: publicMetadata(store, existing) }
  }

  const bytes = utf8ByteLength(text)
  if (bytes > MAX_CCR_BLOCK_BYTES) return rejectStore(store, hash, "block_too_large")
  if (!enforcePrincipalBudget(store, owner, bytes)) {
    return rejectStore(store, hash, "principal_budget_exceeded")
  }
  if (!enforceGlobalBudget(store, owner, bytes)) {
    return rejectStore(store, hash, "global_budget_exceeded")
  }

  const ttlSeconds = normalizeTtlSeconds(options.ttlSeconds)
  const entry = {
    hash,
    principalId: owner,
    content: text,
    bytes,
    chars: text.length,
    lines: text.length === 0 ? 0 : text.split("\n").length,
    contentType:
      typeof options.contentType === "string" && options.contentType.trim()
        ? options.contentType.trim().slice(0, 128)
        : "text/plain",
    source: options.source || "compression",
    createdAt: now,
    lastAccessedAt: now,
    expiresAt: now + ttlSeconds * 1000,
  }
  store.entries.set(key, entry)
  store.totalBytes += bytes
  store.principalBytes.set(owner, principalBytesOf(store, owner) + bytes)
  return { stored: true, hash, metadata: publicMetadata(store, entry) }
}

function publicMetadata(store, entry) {
  return {
    hash: entry.hash,
    bytes: entry.bytes,
    chars: entry.chars,
    lines: entry.lines,
    contentType: entry.contentType,
    source: entry.source,
    createdAt: entry.createdAt,
    lastAccessedAt: entry.lastAccessedAt,
    expiresAt: entry.expiresAt,
    retrievalCount: store.retrievalCounts.get(buildStoreKey(entry.hash, entry.principalId)) || 0,
  }
}

/** 取回原文；未命中返回 null（上游还会去持久层 rehydrate，这里没有第二层）。 */
export function retrieveBlock(store, hash, principalId, now = Date.now()) {
  const key = buildStoreKey(hash, principalId)
  const entry = store.entries.get(key)
  if (!entry) return null
  if (entry.expiresAt <= now) {
    removeEntry(store, key, "expired")
    return null
  }
  entry.lastAccessedAt = now
  store.entries.delete(key)
  store.entries.set(key, entry)
  return entry.content
}

function setRetrievalCount(store, key, count) {
  if (!store.retrievalCounts.has(key) && store.retrievalCounts.size >= MAX_CCR_ENTRIES) {
    const oldest = store.retrievalCounts.keys().next().value
    if (oldest !== undefined) store.retrievalCounts.delete(oldest)
  }
  store.retrievalCounts.delete(key)
  store.retrievalCounts.set(key, count)
}

export function recordRetrieval(store, hash, principalId) {
  const key = buildStoreKey(hash, principalId)
  setRetrievalCount(store, key, (store.retrievalCounts.get(key) || 0) + 1)
}

export function shouldSkipCompression(store, hash, principalId) {
  return (store.retrievalCounts.get(buildStoreKey(hash, principalId)) || 0) >= RETRIEVAL_THRESHOLD
}

/** H8：被频繁取回的块要求更大的体积才压（阈值处直接 Infinity，即永不压）。 */
export function effectiveMinChars(store, baseMinChars, hash, principalId, rampFactor) {
  const count = store.retrievalCounts.get(buildStoreKey(hash, principalId)) || 0
  if (count >= RETRIEVAL_THRESHOLD) return Number.POSITIVE_INFINITY
  if (count <= 0 || rampFactor <= 1) return baseMinChars
  return Math.round(baseMinChars * (1 + (rampFactor - 1) * count))
}

// ─── marker 与替换文本（上游逐字） ──────────────────────────────────────────

export function buildCcrMarker(hash, charCount) {
  return `[CCR retrieve hash=${hash} chars=${charCount}]`
}

export function buildCcrReference(hash, charCount) {
  return { hash, uri: `ccr://${hash}`, marker: buildCcrMarker(hash, charCount) }
}

/** 原文前 200 字符 + marker；上游 #7746：永远不要只留裸 marker。 */
export function buildCcrReplacementText(text, marker) {
  const preamble = text.slice(0, MARKER_PREAMBLE_CHARS).trimEnd()
  return `${preamble}… ${marker}`
}

/** 把 marker 换回原文（map 来自 ctx.state.ccr）。 */
export function restoreCcr(text, map) {
  if (!map) return text
  return text.replace(/\[CCR retrieve hash=([0-9a-f]{24}) chars=\d+\]/g, (whole, hash) =>
    typeof map[hash] === "string" ? map[hash] : whole
  )
}

// ─── ccrQuery 移植：ranged / grep / stats 取回（safe-regex → isSafePattern） ──

export const MAX_RANGE_LINES = 10000
export const MAX_GREP_MATCHES = 1000
export const MAX_PATTERN_LEN = 512

/**
 * 启发式正则安全检查（替代 npm safe-regex）。
 * 拒绝：嵌套量词、连续量词、反向引用、超长 pattern、量词过多。
 * 结论保守——宁可拒绝一个其实安全的正则，也不冒指数回溯的风险。
 */
export function isSafePattern(pattern) {
  if (typeof pattern !== "string" || pattern.length === 0) return false
  if (pattern.length > MAX_PATTERN_LEN) return false
  if (/\([^()]*[*+][^()]*\)\s*[*+{]/.test(pattern)) return false // (a+)+ / (a+){2,}
  if (/\[[^\]]*\][*+?]\s*[*+{]/.test(pattern)) return false // [a-z]*+
  if (/([*+?]|\{\d+,?\d*\})\s*[*+]/.test(pattern)) return false // a** / a+*
  if (/\\[1-9]/.test(pattern)) return false // 反向引用 \1
  const quantifiers = (pattern.match(/[*+?{]/g) || []).length
  if (quantifiers > 64) return false
  return true
}

const qErr = (m) => ({ error: m })
const qOk = (c) => ({ content: c })

function clampCount(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return null
  return Math.min(Math.floor(n), MAX_RANGE_LINES)
}

function grepLines(lines, pattern, unique) {
  if (!pattern) return qErr("grep requires a 'pattern'")
  if (pattern.length > MAX_PATTERN_LEN) return qErr(`pattern exceeds ${MAX_PATTERN_LEN} chars`)
  if (!isSafePattern(pattern)) {
    return qErr("pattern rejected: potentially catastrophic backtracking")
  }
  let re
  try {
    re = new RegExp(pattern)
  } catch {
    return qErr("invalid regex pattern")
  }
  const matched = []
  let truncated = false
  for (const line of lines) {
    if (re.test(line)) {
      matched.push(line)
      if (matched.length >= MAX_GREP_MATCHES) {
        truncated = true
        break
      }
    }
  }
  const out = unique ? [...new Set(matched)] : matched
  const body = out.join("\n")
  return qOk(truncated ? `${body}\n…[truncated at ${MAX_GREP_MATCHES} matches]` : body)
}

/** 对一段原文做 head/tail/lines/grep/stats 取回；参数不合法一律返回 { error }。 */
export function queryBlock(text, q) {
  if (typeof text !== "string") return qErr("block is not a string")
  q = q || {}
  const mode = q.mode || "full"
  if (mode === "full") return qOk(text)
  const lines = text.split("\n")
  switch (mode) {
    case "head": {
      const c = clampCount(q.n)
      if (c === null) return qErr("head requires a positive 'n'")
      return qOk(lines.slice(0, c).join("\n"))
    }
    case "tail": {
      const c = clampCount(q.n)
      if (c === null) return qErr("tail requires a positive 'n'")
      return qOk(lines.slice(Math.max(0, lines.length - c)).join("\n"))
    }
    case "lines": {
      if (typeof q.start !== "number" || typeof q.end !== "number" || q.start < 1 || q.end < 1) {
        return qErr("lines requires positive 'start' and 'end' (1-indexed)")
      }
      if (q.start > q.end) return qErr("lines: 'start' must be <= 'end'")
      return qOk(lines.slice(q.start - 1, Math.min(q.end, lines.length)).join("\n"))
    }
    case "grep":
      return grepLines(lines, q.pattern, q.unique)
    case "stats":
      return qOk(JSON.stringify({ lines: lines.length, chars: text.length, bytes: utf8ByteLength(text) }))
    default:
      return qErr(`unknown mode: ${String(mode)}`)
  }
}

/** 上游 handleCcrRetrieve 的纯函数版（store 由调用方给，不碰全局状态）。 */
export function handleCcrRetrieve(store, args, callerId) {
  args = args || {}
  if (!args.hash || typeof args.hash !== "string") {
    return { error: "hash parameter is required and must be a string" }
  }
  const block = retrieveBlock(store, args.hash, callerId)
  if (block === null) {
    return {
      error: `CCR block not found for hash=${args.hash}. The block may have expired or the hash is invalid.`,
    }
  }
  recordRetrieval(store, args.hash, callerId)
  if (!args.mode || args.mode === "full") return { content: block }
  return queryBlock(block, args)
}

// ─── protocolInstruction 移植（#8033 / #7746 follow-up 门控） ────────────────

const CCR_RETRIEVE_TOOL_NAME = "omniroute_ccr_retrieve"
const CCR_RETRIEVE_TOOL_NAME_SEPARATORS = ["__", ".", "/", ":"]

/** 精确名或分隔符边界上的尾段匹配（MCP 网关会加命名空间前缀）。 */
export function matchesCcrRetrieveToolName(name) {
  if (typeof name !== "string") return false
  if (name === CCR_RETRIEVE_TOOL_NAME) return true
  return CCR_RETRIEVE_TOOL_NAME_SEPARATORS.some((sep) => name.endsWith(`${sep}${CCR_RETRIEVE_TOOL_NAME}`))
}

export const CCR_PROTOCOL_MARKER_SENTINEL = "[CCR protocol]"
export const CCR_PROTOCOL_INSTRUCTION = `${CCR_PROTOCOL_MARKER_SENTINEL} This conversation uses content-compression-retrieve (CCR). When you see a marker like \`[CCR retrieve hash=<24hex> chars=N]\` in a message, it means the full original text (N characters) was stored and replaced with this marker to save space — call the \`${CCR_RETRIEVE_TOOL_NAME}\` tool with that hash to get the original text back verbatim. Copy the hash EXACTLY as written — all 24 hexadecimal characters, never truncated, abbreviated, or reformatted — a single wrong character will make the retrieval fail. If you instead see a marker like \`[dedup:ref sha=...]\`, it means that content already appeared earlier in this conversation — look back in the message history for it; do NOT call ${CCR_RETRIEVE_TOOL_NAME} for a dedup reference.`

/** 调用方 tools[] 里是否声明了 CCR retrieve（三种 tool 形状都认）。 */
export function callerSupportsCcrRetrieve(body) {
  const tools = body && body["tools"]
  if (!Array.isArray(tools)) return false
  return tools.some((tool) => {
    const flatName = tool && typeof tool.name === "string" ? tool.name : undefined
    const nestedName =
      tool && tool.function && typeof tool.function.name === "string" ? tool.function.name : undefined
    return matchesCcrRetrieveToolName(flatName) || matchesCcrRetrieveToolName(nestedName)
  })
}

function messageContainsSentinel(message) {
  const content = message && message.content
  if (typeof content === "string") return content.includes(CCR_PROTOCOL_MARKER_SENTINEL)
  if (Array.isArray(content)) {
    return content.some(
      (part) =>
        part &&
        typeof part === "object" &&
        typeof part.text === "string" &&
        part.text.includes(CCR_PROTOCOL_MARKER_SENTINEL)
    )
  }
  return false
}

/**
 * 在最前面插一条 system instruction（幂等：历史里已有 sentinel 就不插）。
 * 只对 messages 数组生效（chat / anthropic）；responses 的 instructions、gemini 的
 * systemInstruction 不碰——留白好过写错位置。
 */
export function injectCcrProtocolInstruction(body) {
  if (!body || !Array.isArray(body.messages)) return false
  if (!callerSupportsCcrRetrieve(body)) return false
  if (body.messages.some(messageContainsSentinel)) return false
  body.messages.unshift({ role: "system", content: CCR_PROTOCOL_INSTRUCTION })
  return true
}

// ─── 压缩主体 ───────────────────────────────────────────────────────────────

function countOccurrences(haystack, needle, cap) {
  if (!needle) return 0
  let count = 0
  let offset = 0
  while (count < cap) {
    const idx = haystack.indexOf(needle, offset)
    if (idx === -1) break
    count++
    offset = idx + needle.length
  }
  return count
}

/** 单段文本：够大就换成 preamble + marker，并在 store 里留原文。 */
function maybeCcrReplace(text, opts, store) {
  if (typeof text !== "string") return null
  if (text.length < opts.minChars) return null
  if (opts.minBlockBytes > 0 && utf8ByteLength(text) < opts.minBlockBytes) return null
  if (opts.minRepeat > 1 && countOccurrences(opts.corpus, text, opts.minRepeat) < opts.minRepeat) {
    return null
  }

  const hash = hashContent(text)
  if (text.length < effectiveMinChars(store, opts.minChars, hash, opts.principalId, opts.rampFactor)) {
    return null
  }

  const marker = buildCcrMarker(hash, text.length)
  const replacement = buildCcrReplacementText(text, marker)
  if (replacement.length >= text.length) return null

  const stored = tryStoreBlock(store, text, opts.principalId, { source: "compression" })
  if (!stored.stored) return null
  return { text: replacement, hash }
}

/** 统计用：chars/4 估算（替代上游 createCompressionStats，只影响遥测）。 */
function makeStats(originalChars, newChars, durationMs, replacedCount) {
  const originalTokens = Math.ceil(originalChars / 4)
  const compressedTokens = Math.ceil(newChars / 4)
  return {
    originalTokens,
    compressedTokens,
    savingsPercent:
      originalTokens > 0
        ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 10000) / 100
        : 0,
    techniquesUsed: ["ccr"],
    mode: "stacked",
    timestamp: Date.now(),
    durationMs,
    replacedCount,
  }
}

/**
 * 纯函数主体：body 就地改（segment.set 写回原位置）。
 * opts: { protocol, principalId }
 * 返回 { body, compressed, stats, replacedCount, map, store }
 */
export function applyCcr(body, cfg, opts) {
  cfg = cfg || {}
  opts = opts || {}
  const empty = { body, compressed: false, stats: null, replacedCount: 0, map: null, store: null }

  if (cfg["enabled"] === false) return empty
  if (!body || typeof body !== "object") return empty

  // 上游 #7746 follow-up 门控：调用方无法取回就不压（默认开，见文件头第 5 条）。
  if (cfg["requireRetrieveTool"] !== false) {
    let callerCanRetrieve = false
    try {
      callerCanRetrieve = callerSupportsCcrRetrieve(body)
    } catch {
      callerCanRetrieve = false
    }
    if (!callerCanRetrieve) return { ...empty, gateReason: "no_retrieve_tool" }
  }

  const view = conversationView(body, opts.protocol)
  if (!view || view.segments.length === 0) return empty

  const minChars = typeof cfg["minChars"] === "number" ? cfg["minChars"] : DEFAULT_MIN_CHARS
  const rampFactor =
    typeof cfg["retrievalRampFactor"] === "number"
      ? cfg["retrievalRampFactor"]
      : RETRIEVAL_RAMP_FACTOR_DEFAULT
  const minBlockBytes =
    typeof cfg["minBlockBytes"] === "number" ? Math.max(0, cfg["minBlockBytes"]) : DEFAULT_MIN_BLOCK_BYTES
  const minRepeat = typeof cfg["minRepeat"] === "number" ? Math.max(1, cfg["minRepeat"]) : DEFAULT_MIN_REPEAT
  const principalId = opts.principalId || undefined

  const start = Date.now()
  // 宿主注入了跨请求共享 store 就用它（持久层，见 ccr-store-file.js）；
  // 否则退回本次请求内的内存 store（moejs 同步路径没有 fs，只能如此）。
  const shared = !!(opts.store && opts.store.entries instanceof Map)
  const store = shared ? opts.store : makeStore()
  const segments = view.segments
  const originals = segments.map((s) => s.text)
  const corpus = minRepeat > 1 ? originals.join("\n") : ""
  const replaceOpts = { minChars, minBlockBytes, minRepeat, corpus, principalId, rampFactor }

  const map = {}
  let replacedCount = 0
  let originalChars = 0
  let newChars = 0

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    originalChars += originals[i].length
    // 上游保守守卫：system 永不碰；tool 输出永不碰（否则 agent 循环会断）。
    if (seg.role === "system" || seg.toolOutput) {
      newChars += originals[i].length
      continue
    }
    const hit = maybeCcrReplace(originals[i], replaceOpts, store)
    if (hit) {
      seg.set(hit.text)
      map[hit.hash] = originals[i]
      replacedCount++
      newChars += hit.text.length
    } else {
      newChars += originals[i].length
    }
  }

  if (replacedCount === 0) return empty

  // 共享 store 有新条目：通知宿主调度落盘。失败不传染本次替换。
  if (shared && typeof opts.persistStore === "function") {
    try { opts.persistStore(store) } catch { /* persist is best-effort */ }
  }

  // #8033：教能取回的调用方 marker → 工具契约（幂等，一次会话只插一条）。
  if (cfg["requireRetrieveTool"] !== false) {
    try {
      injectCcrProtocolInstruction(body)
    } catch {
      // 注入失败不影响已完成的替换
    }
  }

  const stats = makeStats(originalChars, newChars, Math.round(Date.now() - start), replacedCount)
  return { body, compressed: true, stats, replacedCount, map, store }
}

// ─── 中间件引擎包装 ─────────────────────────────────────────────────────────

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false
    const ctxObj = ctx || {}
    const r = applyCcr(body, cfg, {
      protocol: ctxObj.protocol,
      principalId: (cfg && cfg.principalId) || ctxObj.session || undefined,
      store: ctxObj.ccrStore,
      persistStore: ctxObj.persistCcrStore,
    })
    if (!r.compressed) {
      // 门控原因留给管线当 skip reason（「没声明 retrieve 工具」≠「没有可压内容」）。
      if (r.gateReason && ctxObj.state) ctxObj.state.ccrGateReason = r.gateReason
      return false
    }
    if (ctxObj.state) {
      // 原文留在本次请求的 state 里：同请求内可 round-trip 校验。
      // 共享 store 不塞进 state——pipeline 每个引擎前都 structuredClone(ctx.state)，
      // 全量 store 进去会被深拷贝一整轮。
      ctxObj.state.ccr = {
        replacedCount: r.replacedCount,
        stats: r.stats,
        map: r.map,
        store: ctxObj.ccrStore ? null : r.store,
      }
    }
    return true
  } catch {
    return false
  }
}

export { ENGINE_ID }
