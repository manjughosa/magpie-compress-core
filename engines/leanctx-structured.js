// LeanCTX structured compaction: CSV/TSV and a deliberately small YAML subset.
// Adapted from Apache-2.0 lean-ctx-compress at 7c9025c46eae0781abec4f83bb302212413c009d.
// Only tool output is eligible. Values are preserved; original formatting and
// any dropped columns are not, so this is an opt-in lossy engine, not Headroom.
import { conversationView } from "../adapter.js"

export const id = "leanctx-structured"
export const label = "LeanCTX Structured"
export const why = "把 CSV/TSV 与常见 YAML 清单整理成结构化数据；常量只留一次，可选丢弃高熵列。"
export const description = "Opt-in structured compaction for CSV/TSV and common YAML manifests. Values are retained; original formatting is not."
export const lossy = true
export const cacheImpact = "moderate"
export const defaultOn = false
export const stackPriority = 17
export const isSingleMode = false
export const levels = undefined
export const available = true

const MARKER = "[lc1]"
const MIN_ROWS = 4
const MIN_SAVE_RATIO = 0.25

export const configSchema = [
  {
    key: "dropEntropy",
    type: "number",
    label: "高熵列丢弃阈值",
    description: "1 = 不丢列；小于 1 时丢弃唯一值比例达到阈值的列。只处理工具输出。",
    defaultValue: 1,
    min: 0.5,
    max: 1,
  },
  {
    key: "formats",
    type: "multiselect",
    label: "处理格式",
    description: "仅处理明确识别的 CSV/TSV/YAML，不处理普通对话或 JSON。",
    defaultValue: ["csv", "yaml"],
    options: [{ value: "csv", label: "CSV / TSV" }, { value: "yaml", label: "YAML 清单" }],
  },
]

export function parseDelimited(text, delimiter) {
  if (typeof text !== "string" || !text.trim()) return null
  const rows = []
  let row = [], field = "", quoted = false, quotedField = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ }
        else quoted = false
      } else field += ch
      continue
    }
    if (ch === '"') {
      if (field !== "") return null
      quoted = true
      quotedField = true
      continue
    }
    if (ch === delimiter) { row.push(field); field = ""; continue }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++
      row.push(field); field = ""
      if (row.some(cell => cell.trim() !== "")) rows.push(row)
      row = []
      continue
    }
    field += ch
  }
  if (quoted) return null
  if (quotedField && !rows.some(row => row.some(cell => cell.includes("\n")))) return null
  if (field !== "" || row.length) {
    row.push(field)
    if (row.some(cell => cell.trim() !== "")) rows.push(row)
  }
  if (rows.length < MIN_ROWS) return null
  const header = rows[0]
  if (header.length < 2 || new Set(header).size !== header.length || header.some(h => !h.trim())) return null
  if (rows.slice(1).some(r => r.length !== header.length)) return null
  if (quotedField && !rows.some(row => row.some(cell => cell.includes("\n")))) return null
  return rows
}

function distinctCounts(rows) {
  return rows[0].map((_, i) => new Set(rows.slice(1).map(row => row[i])).size)
}

export function compactDelimited(text, delimiter, dropEntropy = 1) {
  const rows = parseDelimited(text, delimiter)
  if (!rows) return null
  const header = rows[0], data = rows.slice(1), distinct = distinctCounts(rows)
  const constants = {}, dropped = [], kept = []
  for (let i = 0; i < header.length; i++) {
    if (dropEntropy < 1 && distinct[i] / data.length >= dropEntropy) { dropped.push(header[i]); continue }
    if (distinct[i] === 1) { constants[header[i]] = data[0][i]; continue }
    kept.push(i)
  }
  if (!Object.keys(constants).length && !dropped.length) return null
  if (dropped.length === header.length) return null
  const payload = { f: delimiter === "\t" ? "tsv" : "csv", h: header }
  if (dropped.length) payload.d = dropped
  if (Object.keys(constants).length) payload.c = constants
  payload.r = data.map(row => kept.map(i => row[i]))
  const out = MARKER + "\n" + JSON.stringify(payload)
  return out.length < text.length * (1 - MIN_SAVE_RATIO) ? out : null
}

export function restoreStructured(text) {
  if (typeof text !== "string" || !text.startsWith(MARKER + "\n")) return null
  const doc = JSON.parse(text.slice(MARKER.length + 1))
  if (doc.f === "csv" || doc.f === "tsv") {
    if (!Array.isArray(doc.h) || !Array.isArray(doc.r)) return null
    const dropped = doc.d || []
    const kept = doc.h.filter(h => !dropped.includes(h) && !(doc.c && Object.hasOwn(doc.c, h)))
    const outHeader = doc.h.filter(h => !dropped.includes(h))
    return [outHeader, ...doc.r.map(row => {
      if (!Array.isArray(row) || row.length !== kept.length) throw new Error("invalid_structured_rows")
      const values = Object.fromEntries(kept.map((h, i) => [h, row[i]]))
      return outHeader.map(h => doc.c && Object.hasOwn(doc.c, h) ? doc.c[h] : values[h] ?? "")
    })]
  }
  if (doc.f === "yaml") {
    if (!doc.c || !doc.v) return null
    const restore = value => {
      if (Array.isArray(value)) return value.map(item => item && typeof item === "object" && !Array.isArray(item) ? { ...doc.c, ...item } : item)
      if (value && typeof value === "object") {
        const out = { ...value }
        for (const key of ["items", "list"]) if (Array.isArray(out[key])) out[key] = restore(out[key])
        return out
      }
      return value
    }
    return restore(doc.v)
  }
  return null
}

// YAML subset: flat key/value maps and sequences of flat maps, plus one nested
// map/sequence level. No aliases, tags, block scalars, flow syntax or comments.
// Anything else is rejected rather than being guessed into a different document.
function yamlScalar(raw) {
  const s = raw.trim()
  if (!s) return ""
  if (s === "null" || s === "~") return null
  if (s === "true") return true
  if (s === "false") return false
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(s)) return Number(s)
  if (s.startsWith('"')) {
    try { return JSON.parse(s) } catch { return undefined }
  }
  if (s.startsWith("'") && s.endsWith("'") && s.length >= 2) return s.slice(1, -1).replace(/''/g, "'")
  if (/^[^\s:][^:]*$/.test(s)) return s
  return undefined
}

function yamlLine(line, indent) {
  if (line.length < indent || line.slice(0, indent).trim()) return null
  const text = line.slice(indent)
  if (!text || text.startsWith("#")) return { empty: true }
  const sequence = text === "-" || text.startsWith("- ")
  const content = sequence ? text.slice(1).trimStart() : text
  const match = content.match(/^([A-Za-z_][A-Za-z0-9_.-]*):(?:\s+(.*))?$/)
  if (sequence && !match) return { sequence: true, scalar: yamlScalar(content) }
  if (!match) return null
  return { sequence, key: match[1], raw: match[2] ?? "" }
}

export function parseYamlSubset(text) {
  if (typeof text !== "string" || !text.includes("\n") || /^(?:\{|\[)|^(?:---|\.\.\.)\s*$|^\s*%/.test(text.trimStart())) return null
  const root = {}, rootList = []
  let rootIsList = false, current = null, nested = null
  for (const line of text.replace(/\r/g, "").split("\n")) {
    if (/^\s*(?:#.*)?$/.test(line)) continue
    const info = yamlLine(line, 0)
    if (info) {
      nested = null
      if (info.sequence) {
        current = null
        rootIsList = true
        if (info.key) {
          current = {}
          if (info.raw) current[info.key] = yamlScalar(info.raw)
          if (info.raw && current[info.key] === undefined) return null
          rootList.push(current)
        } else {
          const value = info.scalar
          if (value === undefined) return null
          rootList.push(value)
          current = null
        }
      } else {
        if (rootIsList) return null
        if (Object.hasOwn(root, info.key)) return null
        if (!info.raw) { root[info.key] = {}; nested = { parent: root, key: info.key, list: null } }
        else {
          const value = yamlScalar(info.raw)
          if (value === undefined) return null
          root[info.key] = value
        }
        current = null      }
      continue
    }
    if (!nested) return null
    const child = yamlLine(line, current && !/^\s*-\s/.test(line) ? 4 : 2)
    if (!child || child.empty || child.scalar !== undefined) return null
    if (child.sequence) {
      if (!nested.list) { nested.parent[nested.key] = []; nested.list = nested.parent[nested.key] }
      current = null
      if (child.key) {
        const obj = {}
        if (child.raw) obj[child.key] = yamlScalar(child.raw)
        if (child.raw && obj[child.key] === undefined) return null
        nested.list.push(obj)
        current = obj
      } else {
        const value = child.scalar
        if (value === undefined) return null
        nested.list.push(value)
        current = null
      }
    } else {
      const target = current || (rootIsList ? null : nested.parent[nested.key])
      if (!target || Array.isArray(target) || Object.hasOwn(target, child.key)) return null
      const value = yamlScalar(child.raw)
      if (value === undefined) return null
      target[child.key] = value
    }
  }
  const value = rootIsList ? rootList : root
  return (Array.isArray(value) ? value.length : Object.keys(value).length) ? value : null
}

function yamlConstants(value) {
  if (!value || typeof value !== "object") return { constants: {}, data: value }
  const list = Array.isArray(value) ? value : value.items || value.list
  if (!Array.isArray(list) || list.length < MIN_ROWS || list.some(x => !x || typeof x !== "object" || Array.isArray(x))) return { constants: {}, data: value }
  const keys = [...new Set(list.flatMap(Object.keys))]
  const constants = {}
  for (const key of keys) {
    const first = list[0][key]
    if (first !== undefined && (typeof first !== "object" || first === null) && list.every(item => Object.hasOwn(item, key) && item[key] === first)) constants[key] = first
  }
  if (!Object.keys(constants).length) return { constants: {}, data: value }
  const data = list.map(item => Object.fromEntries(Object.entries(item).filter(([key]) => !Object.hasOwn(constants, key))))
  return { constants, data: Array.isArray(value) ? data : { ...value, [value.items ? "items" : "list"]: data } }
}

export function compactYaml(text, dropEntropy = 1) {
  if (dropEntropy < 1) return null // never silently drop YAML keys without a recovery map
  const value = parseYamlSubset(text)
  if (!value) return null
  const { constants, data } = yamlConstants(value)
  const out = MARKER + "\n" + JSON.stringify({ f: "yaml", c: constants, v: data })
  return out.length < text.length * (1 - MIN_SAVE_RATIO) ? out : null
}

export function apply(body, ctx, cfg) {
  if (!body || typeof body !== "object") return false
  const view = conversationView(body, ctx?.protocol)
  if (!view) return false
  const formats = Array.isArray(cfg?.formats) ? cfg.formats : ["csv", "yaml"]
  const dropEntropy = typeof cfg?.dropEntropy === "number" ? Math.max(0.5, Math.min(1, cfg.dropEntropy)) : 1
  let changed = false
  for (const seg of view.segments) {
    if (!seg.toolOutput || seg.text.startsWith(MARKER)) continue
    let next = null
    if (formats.includes("csv")) {
      const first = seg.text.trimStart()[0]
      if (first !== "{" && first !== "[") next = compactDelimited(seg.text, ",", dropEntropy) || compactDelimited(seg.text, "\t", dropEntropy)
    }
    if (!next && formats.includes("yaml")) next = compactYaml(seg.text, dropEntropy)
    if (next) { seg.set(next); changed = true }
  }
  return changed
}
