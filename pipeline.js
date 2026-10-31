// Dependency-free compression runner shared by the moejs fallback and Bun host.
import { PIPELINE } from "./engines/index.js"
import { conversationView } from "./adapter.js"
import { restoreText } from "./engines/headroom.js"

export const TELEMETRY_VERSION = 1

export function clone(value) {
  return typeof structuredClone === "function" ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}
export function byteLength(value) {
  return new TextEncoder().encode(JSON.stringify(value) || "").length
}
// A body this large is left exactly as it came, every time.
//
// The hook has 250 ms and JSON.stringify alone costs about 70 ms on a 20 MB
// body, before any engine has looked at it, so a body that size cannot be
// compressed inside the budget on any machine. Skipping on size -- not on a
// clock -- is what keeps it stable: the same body is skipped on every request,
// so the prefix it contributes to the prompt cache never moves. A deadline
// would decide per request, and the same body would go out raw once and
// compressed the next.
export const DEFAULT_MAX_BODY_BYTES = 8_000_000

// O(n) over the text, with no JSON.stringify and no encoding. It only counts
// what the text already has: JSON escaping and UTF-8 can make the wire bytes
// larger, never smaller, so this number is a floor and never a ceiling.
export function roughByteLength(value) {
  let total = 0
  const walk = (node) => {
    if (node === null || node === undefined) { total += 4; return }
    const kind = typeof node
    if (kind === "string") { total += node.length + 2; return }
    if (kind === "number") { total += 8; return }
    if (kind === "boolean") { total += 5; return }
    if (Array.isArray(node)) { total += 2; for (const item of node) walk(item); return }
    if (kind === "object") {
      total += 2
      for (const key of Object.keys(node)) { total += key.length + 3; walk(node[key]) }
      return
    }
    total += 8
  }
  walk(value)
  return total
}

// Escaping a character costs at most five extra characters ("\u0001"), so a
// floor within a factor of six of the limit still has to be measured exactly.
const ESCAPE_RATIO = 6

// Is this body over the limit? A floor above the limit answers yes on its own;
// a floor far below answers no; anything in between pays for one exact count.
// 返回 false（没超）、true（下界就已超，没数精确值）或那个精确值本身（数过才算出来的）。
// 这样调用方拿到精确值时不用再数一遍：一个数了又数的字节计数，是代价付了两遍、
// 收益一份没有（round-3 review 的 "worst combination"）。
function overLimit(body, maxBytes) {
  const floor = roughByteLength(body)
  if (floor > maxBytes) return true
  if (floor * ESCAPE_RATIO < maxBytes) return false
  const exact = byteLength(body)
  return exact > maxBytes ? exact : false
}
// 默认档在这里说一次。package.json 的 magpie.options.strategies、README 的「预设」段
// 是同一张表。引擎自己声明 defaultOn 的那种写法会把默认行为拆成两处，然后两边分家：
// README 说 session-dedup 是关的，magpie 没被改过 options、传的就是 {}，于是它开着跑，
// 每个请求先花 250 ms 等它，再原样发出去。round-4 review 的 B1 就是这条。
export const DEFAULT_STRATEGIES = Object.freeze({
  "session-dedup": false,
  ccr: true,
  lite: true,
  rtk: false,
  "codex-responses": false,
  headroom: true,
  relevance: false,
  caveman: false,
  "read-lifecycle": false,
  aggressive: false,
  llmlingua: false,
  ultra: false,
  ionizer: false,
  llm: false,
  omniglyph: false,
})
export function strategyEnabled(engine, options = {}) {
  if (engine.available === false) return false
  const strategies = options.strategies
  const raw = strategies && Object.prototype.hasOwnProperty.call(strategies, engine.id) ? strategies[engine.id] : undefined
  if (raw === undefined) return DEFAULT_STRATEGIES[engine.id] === true
  // 对象形态一次说清「开着」和「怎么配」；写 true/false 只在开关这一层说话。
  if (raw && typeof raw === "object") return raw.enabled !== false
  return raw === true
}
// 引擎配置：strategies[id] 的对象形态优先，其次 options[id]（lab 台与旧配置的写法）。
export function engineConfig(engine, options = {}) {
  const raw = options && options.strategies ? options.strategies[engine.id] : undefined
  if (raw && typeof raw === "object") return raw
  const flat = options && options[engine.id]
  return flat && typeof flat === "object" ? flat : {}
}
function restore(target, snapshot) {
  for (const key of Object.keys(target)) delete target[key]
  Object.assign(target, snapshot)
}
// ---- preserve: 系统提示词与最近 N 轮不参与任何改写 ----
// 引擎各自重建 body.messages（lite 就是 {...msg} 换新对象），所以「跑完再把原文
// 写回去」对它们无效。这里改成先占位、跑完再还原：占位符不含空白与结构字符，
// 任何引擎都不会压缩它；还原时按占位符找回原文。若引擎把占位符改了或删了，
// 说明这段已被破坏，整包回退到进入管线前的快照，绝不把占位符发出去。

const PRESERVE_PREFIX = "\u0000pcc:"
const PRESERVE_SUFFIX = "\u0000"

function preserveSettings(options) {
  const preserve = options && typeof options.preserve === "object" && options.preserve ? options.preserve : {}
  const turns = Number(preserve.lastTurns)
  return {
    // 默认不额外保护 system：lite 对 system 的变换（整段去重）本身就是幂等的，
    // 保护它等于关掉那一步。要绝对不动 system 的人显式开 preserve.system。
    system: preserve.system === true,
    // 默认 0：被滑窗保护的那一轮，在它滑出窗口时会被改写一次，缓存从此每轮
    // miss（review 第 2 条）。要保护就显式配置，代价记在 README。
    lastTurns: Number.isFinite(turns) ? Math.max(0, Math.min(50, Math.floor(turns))) : 0,
  }
}

function guardPreservedSegments(body, ctx, options) {
  const settings = preserveSettings(options)
  const plan = { system: settings.system, lastTurns: settings.lastTurns, turns: 0, segments: 0, bytes: 0 }
  const idle = { plan, restore: () => ({ ...plan, restored: 0, markers: 0, rolledBack: false }) }
  const view = conversationView(body, ctx && ctx.protocol)
  if (!view || view.segments.length === 0) return idle
  const order = []
  const groups = new Map()
  for (const seg of view.segments) {
    if (!groups.has(seg.index)) { groups.set(seg.index, []); order.push(seg.index) }
    groups.get(seg.index).push(seg)
  }
  const userStarts = order.filter(index => (groups.get(index) || []).some(seg => seg.role === "user"))
  let guardFrom = null
  if (settings.lastTurns > 0 && userStarts.length > 0) {
    guardFrom = userStarts.length > settings.lastTurns
      ? userStarts[userStarts.length - settings.lastTurns]
      : userStarts[0]
    plan.turns = Math.min(settings.lastTurns, userStarts.length)
  }
  const markers = new Map()
  const snapshot = clone(body)
  for (const seg of view.segments) {
    const keepSystem = settings.system && seg.role === "system"
    const keepTurn = guardFrom !== null && seg.index >= 0 && seg.index >= guardFrom
    if (!keepSystem && !keepTurn) continue
    plan.segments += 1
    plan.bytes += seg.text.length
    const marker = PRESERVE_PREFIX + markers.size + PRESERVE_SUFFIX
    markers.set(marker, seg.text)
    seg.set(marker)
  }
  if (markers.size === 0) return idle
  return {
    plan,
    restore() {
      const after = conversationView(body, ctx && ctx.protocol)
      if (after) {
        for (const seg of after.segments) {
          const original = markers.get(seg.text)
          if (original !== undefined) seg.set(original)
        }
      }
      const scan = conversationView(body, ctx && ctx.protocol)
      const leftover = scan ? scan.segments.some(seg => typeof seg.text === "string" && seg.text.includes(PRESERVE_PREFIX)) : false
      if (leftover) {
        restore(body, snapshot)
        return { ...plan, restored: 0, markers: markers.size, rolledBack: true }
      }
      return { ...plan, restored: markers.size, markers: markers.size, rolledBack: false }
    },
  }
}

function reasonFor(engine, ctx) {
  if (engine.available === false) return "unavailable"
  if (engine.id === "codex-responses" && ctx.protocol !== "responses") return "protocol_not_responses"
  if (engine.id === "codex-responses") return "no_eligible_response_item"
  if (engine.id === "headroom") return "no_eligible_json_array_or_not_smaller"
  if (engine.id === "session-dedup") return "no_repeat_eligible_block"
  if (engine.id === "ccr") return ctx.state?.ccrGateReason || "nothing_to_remove"
  if (engine.id === "rtk") return "no_matching_tool_output_filter"
  // 其余引擎只会返回 false，管线无从知道具体原因，就别冒用别人的原因文案。
  return "nothing_to_remove"
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
    const restored = after[i].replace(/\[dedup:ref sha=([0-9a-f]{24})[^\]]*\]/g, (ref, sha) => map[sha] ?? ref)
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
  const limit = Number(options.maxBytes)
  const maxBytes = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : DEFAULT_MAX_BODY_BYTES
  const budget = Number(options.budgetMs)
  const budgetMs = Number.isFinite(budget) && budget > 0 ? Math.floor(budget) : 0
  const over = overLimit(body, maxBytes)
  if (over !== false) {
    const bytes = typeof over === "number" ? over : byteLength(body)
    return {
      version: TELEMETRY_VERSION, ts: new Date().toISOString(),
      model: String(ctx.model || body.model || "").slice(0, 160), agent: String(ctx.agent || "unknown").slice(0, 80),
      protocol: String(ctx.protocol || "unknown"), session: String(ctx.session || "").slice(0, 100),
      beforeBytes: bytes, afterBytes: bytes, savedBytes: 0, savedPct: 0,
      estimatedBeforeTokens: Math.ceil(bytes / 4), estimatedAfterTokens: Math.ceil(bytes / 4),
      totalMs: Date.now() - started, budgetMs: budgetMs || 250, budgetExceeded: 0,
      failOpen: 0, roundTripsChecked: 0, roundTripsPassed: 0, preserved: 0,
      tooLarge: true, maxBytes,
      strategies: PIPELINE.map((engine) => ({
        id: engine.id, label: engine.label || engine.id, available: engine.available !== false,
        enabled: strategyEnabled(engine, options), status: "skipped", reason: "body_too_large",
        beforeBytes: bytes, afterBytes: bytes, ms: 0,
      })),
    }
  }
  const beforeBytes = byteLength(body)
  const records = []
  ctx.state = ctx.state || {}
  const guard = guardPreservedSegments(body, ctx, options)
  let failOpen = 0, roundTripsChecked = 0, roundTripsPassed = 0, budgetHit = 0
  // Measured once per shape the body takes, not once per engine: byteLength is
  // a JSON.stringify plus an encode, and on a large body that is the whole
  // cost of the hook.
  let currentBytes = beforeBytes
  // 占位符替换已经把保护段换成几个字节的 marker；从这里起按占位后的身体记账，
  // 引擎的 savedBytes 才是它自己省的体积，而不是把保护段抠掉的差值记在它头上。
  // 无保护段时不重测，省掉一次大 body 的 stringify。
  if (guard.plan.segments > 0) currentBytes = byteLength(body)
  for (const engine of PIPELINE) {
    const record = { id: engine.id, label: engine.label || engine.id, available: engine.available !== false, enabled: strategyEnabled(engine, options), status: "skipped", reason: engine.available === false ? "unavailable" : "disabled", beforeBytes: currentBytes, afterBytes: 0, ms: 0 }
    if (!record.enabled) { record.afterBytes = currentBytes; records.push(record); continue }
    if (budgetMs > 0 && Date.now() - started > budgetMs) {
      record.reason = "budget_exceeded"
      record.afterBytes = currentBytes
      budgetHit += 1
      records.push(record)
      continue
    }
    const t = Date.now()
    const snapshot = clone(body)
    const stateSnapshot = clone(ctx.state)
    try {
      const cfg = engineConfig(engine, options)
      const changed = engine.apply(body, ctx, cfg) === true
      if (changed) { record.afterBytes = byteLength(body); currentBytes = record.afterBytes } else { record.afterBytes = currentBytes }
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
  const preserved = guard.restore()
  const afterBytes = byteLength(body)
  return {
    version: TELEMETRY_VERSION, ts: new Date().toISOString(),
    model: String(ctx.model || body.model || "").slice(0, 160), agent: String(ctx.agent || "unknown").slice(0, 80),
    protocol: String(ctx.protocol || "unknown"), session: String(ctx.session || "").slice(0, 100),
    beforeBytes, afterBytes, savedBytes: Math.max(0, beforeBytes - afterBytes),
    savedPct: beforeBytes ? Math.round((beforeBytes - afterBytes) / beforeBytes * 10000) / 100 : 0,
    estimatedBeforeTokens: Math.ceil(beforeBytes / 4), estimatedAfterTokens: Math.ceil(afterBytes / 4),
    totalMs: Date.now() - started, budgetMs: budgetMs || 250, budgetExceeded: budgetHit,
    failOpen, roundTripsChecked, roundTripsPassed, preserved,
    strategies: records,
  }
}
