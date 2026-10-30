// engines/headroom.js — SmartCrusher：同质/异质 JSON 对象数组 → GCF 列式块（无损）
// 移植自 OmniRoute: open-sse/services/compression/engines/headroom/
//
// GCF (the ```gcf-generic columnar block this engine emits) is headroom's format:
//   https://github.com/headroomlabs-ai/headroom — credited in PROVENANCE.json.
//   index.ts + smartcrusher.ts + tabular.ts（GCF 编解码在 ./gcf/）
//
// 算法（上游原样）：
//   - 扫描非 system 文本段：整段若以 "[" 开头按 JSON 数组试解析；
//     另扫 ```json ... ``` 围栏块内嵌数组。
//   - 数组元素全为对象且 ≥ minRows(默认8) → GCF 编码为 ```gcf-generic 围栏块。
//   - 保守：仅当 GCF 形式严格更短才替换；JSON.parse 失败/非数组/行数不足 → 不动。
//   - 无损：decode(encode(arr)) 与原数组 deep-equal（round-trip 测试锁定）。
//
// 与上游的差异（适配记录）：
//   1. TOON 编码器移除：@toon-format/toon 是 npm 依赖，moejs 只允许相对导入。
//      上游 best-of-N 选更短者、平局归 GCF；本移植恒为 GCF。文档注明。
//   2. 经 adapter 作用四协议文本段；上游只认 chat messages[]。
//      system/developer 段由 adapter.normRole 归一为 "system" → 跳过，语义一致。
//   3. 只解码 gcf-generic 围栏（legacy omni-tabular/toon 解码器不移植——
//      magpie 侧无历史遗留块，round-trip 只需解码自产格式）。
//   4. stats 精简；performance.now→Date.now。

import { encodeGeneric } from "./gcf/encode.js"
import { decodeGeneric } from "./gcf/decode.js"
import { conversationView } from "../adapter.js"

const DEFAULT_MIN_ROWS = 8

const GCF_FENCE_OPEN = "```gcf-generic"
const GCF_FENCE_CLOSE = "```"

/** The fenced block marker we look for to compact json arrays inline. */
const JSON_FENCE_RE = /```json\n([\s\S]*?)\n```/g

export function wrapGcf(blockContent) {
  return `${GCF_FENCE_OPEN}\n${blockContent}\n${GCF_FENCE_CLOSE}`
}

/** Check if all elements in an array are objects (not null, not arrays). */
function allObjects(arr) {
  for (const item of arr) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return false
  }
  return true
}

/**
 * Try to crush a JSON string (array of objects) into GCF form.
 * Returns the compact string if it shrinks the input; null otherwise.
 */
export function tryCompactJson(jsonStr, minRows = DEFAULT_MIN_ROWS) {
  let parsed
  try {
    parsed = JSON.parse(jsonStr)
  } catch {
    return null
  }

  if (!Array.isArray(parsed) || parsed.length < minRows) return null
  if (!allObjects(parsed)) return null

  const compact = wrapGcf(encodeGeneric(parsed))

  // Only use compact form if it is strictly smaller
  if (compact.length >= jsonStr.length) return null

  return compact
}

/**
 * Process a single text string: try to compact it as a whole JSON array,
 * or find and compact any ```json fenced blocks inside it.
 */
export function crushText(text, minRows = DEFAULT_MIN_ROWS) {
  // 1. Try the whole string as a JSON array first
  const trimmed = text.trimStart()
  if (trimmed.startsWith("[")) {
    const compacted = tryCompactJson(text.trim(), minRows)
    if (compacted !== null) return compacted
  }

  // 2. Try to compact ```json fenced blocks inside the text
  let result = text
  let offset = 0
  const regex = new RegExp(JSON_FENCE_RE.source, "g")
  let match

  while ((match = regex.exec(text)) !== null) {
    const fullMatch = match[0]
    const innerJson = match[1]
    const compacted = tryCompactJson(innerJson.trim(), minRows)
    if (compacted !== null) {
      const start = match.index + offset
      const end = start + fullMatch.length
      result = result.slice(0, start) + compacted + result.slice(end)
      offset += compacted.length - fullMatch.length
    }
  }

  return result
}

// ─── round-trip 预言机（测试用） ─────────────────────────────────────────

/**
 * 把文本里所有 ```gcf-generic 块解码回原 JSON 字符串（JSON.stringify）。
 * 只用于测试证明无损；生产不调用。
 */
export function restoreText(text) {
  if (!text.includes(GCF_FENCE_OPEN)) return text
  let result = text
  let searchFrom = 0
  while (true) {
    const fenceStart = result.indexOf(GCF_FENCE_OPEN, searchFrom)
    if (fenceStart === -1) break
    const contentStart = fenceStart + GCF_FENCE_OPEN.length + 1 // skip "\n"
    const fenceEnd = result.indexOf("\n" + GCF_FENCE_CLOSE, contentStart)
    if (fenceEnd === -1) break
    const blockContent = result.slice(contentStart, fenceEnd)
    const decoded = decodeGeneric(blockContent)
    const jsonStr = JSON.stringify(decoded)
    const fullFence = result.slice(fenceStart, fenceEnd + GCF_FENCE_CLOSE.length + 1)
    result = result.slice(0, fenceStart) + jsonStr + result.slice(fenceStart + fullFence.length)
    searchFrom = fenceStart + jsonStr.length
  }
  return result
}

// ─── 引擎入口 ────────────────────────────────────────────────────────────

// crushMessages 是逐段独立的（无跨段状态），adapter 段视图在四协议下与
// 上游 chat-only 行为等价：system/developer 跳过、空段自然无操作。

export const id = "headroom"

// configSchema —— 面板契约。与 catalog.js 的静态声明一致（只有 minRows 一个可调键），
// 这里再导出一份是为了让「每个已移植引擎都以实现为准」这条不变量成立：面板不再回落到
// catalog 的静态 fields，将来 apply() 多读一个键时也就不会出现「声明了但引擎不读」或
// 「引擎读了但面板设不到」的死旋钮。见 test/config-contract.test.mjs。
export const configSchema = [
  {
    key: "minRows",
    type: "number",
    label: "最小行数",
    description: "表格化 JSON 的行数少于这个值就不压（压了也省不下什么）。",
    defaultValue: DEFAULT_MIN_ROWS,
    min: 2,
    max: 200,
  },
]

export function apply(body, ctx, cfg = {}) {
  if (!body || typeof body !== "object") return false
  if (cfg.enabled === false) return false
  const minRows = typeof cfg.minRows === "number" ? cfg.minRows : DEFAULT_MIN_ROWS

  const view = conversationView(body, ctx && ctx.protocol)
  if (!view) return false

  const start = Date.now()
  let changed = false
  let crushedSegments = 0

  for (const seg of view.segments) {
    if (seg.role === "system") continue // 含 developer（adapter 归一），与上游一致
    const crushed = crushText(seg.text, minRows)
    if (crushed !== seg.text) {
      seg.set(crushed)
      changed = true
      crushedSegments++
    }
  }

  if (changed && ctx && ctx.state) {
    ctx.state.headroom = { crushedSegments, durationMs: Date.now() - start }
  }
  return changed
}
