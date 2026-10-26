// Dependency-free compression runner shared by the moejs fallback and Bun host.
import { PIPELINE } from "./engines/index.js"
import { conversationView } from "./adapter.js"
import { restoreText } from "./engines/headroom.js"

export const INTERNAL_MARKER = "__magpieCompressCore"
export const TELEMETRY_VERSION = 1

export function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}
export function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value) || "").length
}
export function strategyEnabled(engine, options = {}) {
  if (engine.available === false) return false
  const strategies = options.strategies
  return strategies && Object.prototype.hasOwnProperty.call(strategies, engine.id)
    ? strategies[engine.id] === true
    : engine.defaultOn === true
}
function restore(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, snapshot)
}
function reasonFor(engine, ctx) {
  if (engine.available === false) return "unavailable"
  if (engine.id === "codex-responses" && ctx.protocol !== "responses") return "protocol_not_responses"
  if (engine.id === "codex-responses") return "no_eligible_response_item"
  if (engine.id === "headroom") return "no_eligible_json_array_or_not_smaller"
  if (engine.id === "session-dedup") return "no_repeat_eligible_block"
  if (engine.id === "rtk") return "no_matching_tool_output_filter"
  return "no_whitespace_or_tool_result_change"
}
function texts(body, protocol) {
  return conversationView(body, protocol)?.segments.map(s => s.text) || []
}
function canonicalJson(text) {
  const canonical = value => {
    try { const parsed = JSON.parse(value); return Array.isArray(parsed) ? JSON.stringify(parsed) : value } catch { return value }
  }
  const trimmed = text.trim()
  if (trimmed.startsWith("[")) return canonical(trimmed)
  return text.replace(/```json\n([\s\S]*?)\n```/g, (_, json) => canonical(json.trim()))
}
function dedupRoundTrip(beforeBody, body, ctx) {
  const map = ctx.state?.sessionDedup?.map || {}
  const before = texts(beforeBody, ctx.protocol), after = texts(body, ctx.protocol)
  let checked = 0, passed = 0
  for (let i = 0; i < after.length; i++) {
    if (!after[i].includes("[dedup:ref sha=")) continue
    checked++
    const restored = after[i].replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (ref, sha) => map[sha] ?? ref)
    if (restored === before[i]) passed++
  }
  return { checked, passed }
}
function headroomRoundTrip(beforeBody, body, ctx) {
  const before = texts(beforeBody, ctx.protocol), after = texts(body, ctx.protocol)
  let checked = 0, passed = 0
  for (let i = 0; i < after.length; i++) {
    const count = (after[i].match(/```gcf-generic/g) || []).length
    if (!count) continue
    checked += count
    if (canonicalJson(before[i]) === restoreText(after[i])) passed += count
  }
  return { checked, passed }
}
export function runPipeline(body, ctx, options = {}, beforeBody = null) {
  const started = Date.now()
  const beforeBytes = byteLength(body)
  const records = []
  ctx.state = ctx.state || {}
  let failOpen = 0, roundTripsChecked = 0, roundTripsPassed = 0
  for (const engine of PIPELINE) {
    const record = { id: engine.id, label: engine.label || engine.id, available: engine.available !== false, enabled: strategyEnabled(engine, options), status: "skipped", reason: engine.available === false ? "unavailable" : "disabled", beforeBytes: byteLength(body), afterBytes: 0, ms: 0 }
    if (!record.enabled) { record.afterBytes = record.beforeBytes; records.push(record); continue }
    const t = Date.now()
    const snapshot = clone(body)
    const stateSnapshot = clone(ctx.state)
    try {
      const cfg = options[engine.id] && typeof options[engine.id] === "object" ? options[engine.id] : {}
      const changed = engine.apply(body, ctx, cfg) === true
      record.afterBytes = byteLength(body)
      record.ms = Date.now() - t
      record.status = changed ? "hit" : "skipped"
      record.reason = changed ? "changed" : reasonFor(engine, ctx)
      record.savedBytes = Math.max(0, record.beforeBytes - record.afterBytes)
      if (changed && engine.id === "session-dedup") record.roundTrip = dedupRoundTrip(snapshot, body, ctx)
      if (changed && engine.id === "headroom") record.roundTrip = headroomRoundTrip(snapshot, body, ctx)
      if (record.roundTrip) {
        roundTripsChecked += record.roundTrip.checked
        roundTripsPassed += record.roundTrip.passed
        if (record.roundTrip.passed !== record.roundTrip.checked) throw new Error("round_trip_mismatch")
      }
    } catch (error) {
      restore(body, snapshot)
      ctx.state = stateSnapshot
      record.afterBytes = byteLength(body)
      record.ms = Date.now() - t
      record.status = "fail_open"
      record.reason = String(error?.message) === "round_trip_mismatch" ? "round_trip_mismatch" : "engine_error"
      record.error = String(error?.message || error).slice(0, 160)
      failOpen++
    }
    records.push(record)
  }
  const afterBytes = byteLength(body)
  return {
    version: TELEMETRY_VERSION, ts: new Date().toISOString(),
    model: String(ctx.model || body.model || "").slice(0, 160), agent: String(ctx.agent || "unknown").slice(0, 80),
    protocol: String(ctx.protocol || "unknown"), session: String(ctx.session || "").slice(0, 100),
    beforeBytes, afterBytes, savedBytes: Math.max(0, beforeBytes - afterBytes),
    savedPct: beforeBytes ? Math.round((beforeBytes - afterBytes) / beforeBytes * 10000) / 100 : 0,
    estimatedBeforeTokens: Math.ceil(beforeBytes / 4), estimatedAfterTokens: Math.ceil(afterBytes / 4),
    totalMs: Date.now() - started, budgetMs: 250, failOpen, roundTripsChecked, roundTripsPassed,
    strategies: records,
  }
}
export function removeInternalMarker(body) {
  if (body && typeof body === "object") delete body[INTERNAL_MARKER]
}