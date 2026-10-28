// engines/ionizer.js — Ionizer：对超长同构 JSON 数组做确定性统计采样，保留骨架与关键行。
//
// 来源（OmniRoute@ff679ab86e0113a009d8aeeeee464139bd090874 open-sse/services/compression/engines\ionizer\）：
//   - index.ts  (124 行)  IONIZER_SCHEMA / validateIonizerConfig / ionizerEngine（apply 契约）
//   - sample.ts (205 行)  fnv1a / mulberry32 / schemaUnion / isErrorRow / seededSample / ionize
//                         / applyIonizerPass / runIonizerPass
//
// ── 与上游的差异（仅环境适配，采样算法逐字搬）──────────────────────────────
//   1. 遍历方式：上游只看 body.messages 里 `typeof content === "string"` 的消息；这里走
//      adapter.conversationView(body, protocol) 的 segments（chat / responses / anthropic /
//      gemini 四协议），"消息" 语义映射为 "片段"。system 段仍然一律跳过。
//   2. **CCR 后端已移除。** 上游 applyIonizerPass 必须 `tryStoreBlock(serialized, …)` 成功
//      （stored.stored === true）才会替换，否则原样返回——也就是说没有 CCR 时上游自己也是
//      no-op。本插件没有 CCR 服务，因此这里直接跳过存储步骤，并在 marker 里明确写出
//      "original rows dropped (no CCR backend)"：**被采掉的行不可恢复**。这是本移植最重要
//      的语义差异，`sampling: true` 也正因此保留。
//   3. 配置面：上游 IONIZER_SCHEMA 是 {enabled, threshold, targetRows}，面板（catalog.js）
//      只暴露 {sampleRate}。映射关系：threshold 固定 200、firstK/lastK 固定 3、
//      targetRows 由 sampleRate 按数组实际长度推导 = round(n * sampleRate)（夹在 1..n）。
//   4. performance.now() / createCompressionStats 不移植：中间件契约只返回布尔，计时与统计
//      由 stats-writer.js 负责；moejs 也没有 performance 依赖的需要。
//   5. 加了一个纯性能前置判断：片段 trim 后首字符不是 "[" 就直接跳过 JSON.parse（不可能
//      解析成数组，语义等价）。250ms 预算下避免对每个长片段白跑一次 parse。
//   6. 零依赖：只用相对 import，无 Node API、无 fetch、无定时器；apply 全程 try/catch
//      fail-open（含单个片段级 try/catch，一个数组坏了不影响其它）。

import { conversationView } from "../adapter.js"

// ─── 元数据（catalog.js 是面板真源；stackPriority 取源码明确值 13）──────────────
export const id = "ionizer"
export const label = "Ionizer"
export const why = "按采样策略丢掉低信息量的片段，保留骨架与关键事实（故意有损）。"
export const lossy = true
export const cacheImpact = "high"
export const defaultOn = false
export const stackPriority = 13
export const isSingleMode = false
export const levels = undefined
export const available = true
// 上游标记：故意有损的采样压缩。保真门看到 sampling 会跳过本引擎。
export const sampling = true

// configSchema 逐字取自 catalog.js:250-268（cfg 默认值来自这里）。
// 上游 index.ts:16-36 的 schema 是 {enabled, threshold, targetRows}，差异见文件头第 3 条。
export const configSchema = [
  {
    key: "sampleRate",
    type: "number",
    label: "采样率",
    description: "保留多少比例的片段",
    defaultValue: 0.4,
    min: 0.1,
    max: 0.9,
  },
]

// ─── 上游常量（sample.ts）─────────────────────────────────────────────────────
export const MAX_IONIZER_ROWS = 100000
export const DEFAULT_THRESHOLD = 200
export const DEFAULT_TARGET_ROWS = 50
export const FIRST_K = 3
export const LAST_K = 3
const MIN_SAMPLE_RATE = 0.1
const MAX_SAMPLE_RATE = 0.9
const DEFAULT_SAMPLE_RATE = 0.4

const ERROR_KEY_RE = /error|fail|exception|stderr|denied/i

// ---------------------------------------------------------------------------
// 采样算法：逐字移植 sample.ts（确定性、可复现）
// ---------------------------------------------------------------------------

/** FNV-1a 32 位散列：给每个数组算一个稳定种子，同一输入永远采到同一批行。 */
export function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** mulberry32：确定性 PRNG，返回 [0,1) 的浮点。 */
export function mulberry32(seed) {
  let a = seed >>> 0
  return function next() {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 键并集，保持首次出现顺序。 */
export function schemaUnion(rows) {
  const seen = new Set()
  const keys = []
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        keys.push(key)
      }
    }
  }
  return keys
}

/** 错误行：键名像 error/fail/exception/stderr/denied 且值真，或 status/statusCode/code ∈ 400..599。 */
export function isErrorRow(row) {
  for (const key of Object.keys(row)) {
    if (ERROR_KEY_RE.test(key)) {
      const value = row[key]
      if (value !== null && value !== undefined && value !== false && value !== 0 && value !== "") {
        return true
      }
    }
  }
  for (const key of ["status", "statusCode", "code"]) {
    const value = row[key]
    if (typeof value === "number" && value >= 400 && value <= 599) return true
  }
  return false
}

/** 从 pool 里按种子均匀抽 k 个下标（Fisher-Yates 前缀），返回升序下标。 */
export function seededSample(pool, k, seed) {
  if (k >= pool.length) return pool.slice()
  const idx = []
  for (let i = 0; i < pool.length; i++) idx.push(i)
  const rand = mulberry32(seed)
  for (let i = 0; i < k; i++) {
    const j = i + Math.floor(rand() * (idx.length - i))
    const tmp = idx[i]
    idx[i] = idx[j]
    idx[j] = tmp
  }
  return idx
    .slice(0, k)
    .sort((a, b) => a - b)
    .map((i) => pool[i])
}

/**
 * 采样主函数（sample.ts:ionize 逐字）：
 * ① 每个首次引入新键的行（schema 覆盖）② 所有错误行 ③ 前 firstK 行 ④ 后 lastK 行
 * ⑤ 剩余中间段用 seededSample 补到 targetRows。返回原序结果。
 */
export function ionize(rows, opts) {
  const n = rows.length
  const targetRows = opts.targetRows
  if (n <= targetRows) {
    return { kept: rows.slice(), keptCount: n, totalCount: n }
  }

  const keep = new Set()
  const seenKeys = new Set()
  for (let i = 0; i < n; i++) {
    let novel = false
    for (const key of Object.keys(rows[i])) {
      if (!seenKeys.has(key)) {
        seenKeys.add(key)
        novel = true
      }
    }
    if (novel) keep.add(i)
  }
  for (let i = 0; i < n; i++) if (isErrorRow(rows[i])) keep.add(i)
  for (let i = 0; i < Math.min(opts.firstK, n); i++) keep.add(i)
  for (let i = Math.max(0, n - opts.lastK); i < n; i++) keep.add(i)

  if (keep.size < targetRows) {
    const middle = []
    for (let i = 0; i < n; i++) if (!keep.has(i)) middle.push(i)
    const need = targetRows - keep.size
    for (const idx of seededSample(middle, need, opts.seed)) keep.add(idx)
  }

  const keptIdx = [...keep].sort((a, b) => a - b)
  return { kept: keptIdx.map((i) => rows[i]), keptCount: keptIdx.length, totalCount: n }
}

// ---------------------------------------------------------------------------
// 片段级采样
// ---------------------------------------------------------------------------

function isPlainObjectArray(value) {
  if (!Array.isArray(value)) return false
  for (const el of value) {
    if (el === null || typeof el !== "object" || Array.isArray(el)) return false
  }
  return true
}

function clampSampleRate(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SAMPLE_RATE
  if (value < MIN_SAMPLE_RATE) return MIN_SAMPLE_RATE
  if (value > MAX_SAMPLE_RATE) return MAX_SAMPLE_RATE
  return value
}

/**
 * 对一段文本做一次 ionizer 采样：文本必须整体是一个「纯对象数组」且长度超过 threshold。
 * 返回新文本，或 null 表示不改。
 */
export function ionizeSegmentText(text, sampleRate) {
  const trimmed = text.trimStart()
  if (trimmed.length === 0 || trimmed.charCodeAt(0) !== 91 /* "[" */) return null

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    return null
  }
  if (!Array.isArray(parsed)) return null
  if (parsed.length <= DEFAULT_THRESHOLD) return null
  if (parsed.length > MAX_IONIZER_ROWS) return null
  if (!isPlainObjectArray(parsed)) return null

  const total = parsed.length
  const targetRows = Math.min(
    total,
    Math.max(1, Math.round(total * clampSampleRate(sampleRate)))
  )
  const res = ionize(parsed, {
    targetRows,
    firstK: FIRST_K,
    lastK: LAST_K,
    seed: fnv1a(text),
  })
  if (res.keptCount >= res.totalCount) return null

  // 差异 2：上游此处要求 CCR 存块成功才替换；本插件无 CCR，采样即不可恢复。
  const marker =
    "[ionizer: kept " +
    res.keptCount +
    "/" +
    res.totalCount +
    " rows; lossy sample — original rows dropped (no CCR backend) chars=" +
    text.length +
    "]"
  const newContent = JSON.stringify(res.kept) + "\n" + marker
  if (newContent.length >= text.length) return null
  return newContent
}

// ---------------------------------------------------------------------------
// 中间件入口
// ---------------------------------------------------------------------------

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false

    const sampleRate = clampSampleRate(cfg ? cfg.sampleRate : undefined)

    const view = conversationView(body, ctx && ctx.protocol)
    if (!view) return false
    const segments = view.segments
    if (!Array.isArray(segments) || segments.length === 0) return false

    let changed = false
    for (const seg of segments) {
      try {
        if (seg.role === "system") continue
        const text = seg.text
        if (typeof text !== "string" || text.length === 0) continue
        const next = ionizeSegmentText(text, sampleRate)
        if (next === null) continue
        seg.set(next)
        changed = true
      } catch {
        // 单个片段失败不影响其它片段
      }
    }
    return changed
  } catch {
    return false
  }
}
