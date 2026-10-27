// A rolling summary of what compression saved, kept in this plugin's own
// folder under magpie's config directory.
//
// It used to be written back into this plugin's entry in magpie's
// `plugins.json`, because a page runs with `connect-src 'none'` and
// `magpie.options` was the only channel it could read. That file is magpie's:
// writing it fights magpie's lock, puts up to 2 MB of lab text into a file
// meant for settings, and every write bumps its stamp, which restarts the hooks
// host — a fresh host then flushes on its next request, and the host can end up
// restarting once per request. The gateway maintainer asked for this file to be
// ours, so it is: `<config>/magpie/compress-core/stats.json`, beside the
// request log and the captures.
//
// The page can no longer read the numbers through `magpie.options`; it shows
// the file it can be read from instead. That is the trade the review asked
// for, and it is the right way round: settings stay magpie's, data stays ours.
import { mkdir, readFile, writeFile, rename, unlink } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"
import { telemetryDir } from "./telemetry-store.js"

const FLUSH_MS = 30_000        // at most one write every half minute
const KEEP_RECENT = 50
const MAX_BYTES = 4_000_000    // refuse to parse an implausibly large file

export function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "magpie") : null
  return process.env.MAGPIE_CONFIG_DIR || xdg || join(homedir(), ".config", "magpie")
}

// 与本插件的请求日志、快照同目录：<config>/magpie/compress-core。
const statsFile = () => join(telemetryDir(), "stats.json")
export const statsPath = statsFile

function blank() {
  return {
    at: null,
    requests: 0,
    beforeBytes: 0,
    afterBytes: 0,
    savedBytes: 0,
    savedTokens: 0,
    failOpen: 0,
    strategies: {},
    recent: [],
    captures: [],
    lab: null,
    labBusy: null,
    capture: { count: 0, dropped: 0 },
  }
}

let summary = blank()
let lastFlushAt = 0   // the first compressed request writes the summary at once
let inFlight = false
// Set by the page's "clear captures" command: the next flush drops the whole
// stored list instead of merging into it.
let capturesCleared = false

const num = (v) => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function uniqBy(list, keyOf) {
  const seen = new Set()
  const out = []
  for (const item of Array.isArray(list) ? list : []) {
    if (!item || typeof item !== "object") continue
    const k = keyOf(item)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

const recentKey = (r) => `${r.ts}|${r.model || ""}|${num(r.beforeBytes)}`
const captureKey = (c) => String(c.id || "")

function mergeStrategies(base, delta) {
  const out = {}
  for (const src of [base, delta]) {
    for (const id of Object.keys(src || {})) {
      const slot = src[id]
      if (!slot || typeof slot !== "object") continue
      const into = out[id] || (out[id] = { runs: 0, savedBytes: 0 })
      into.runs += num(slot.runs)
      into.savedBytes += num(slot.savedBytes)
    }
  }
  return out
}

// The Bun companion is not guaranteed to keep this module alive between
// requests: a fresh instance starts from a blank summary and would overwrite
// every number already on disk. Flush therefore treats the stored stats as the
// base and this process's summary as the increment, then clears the increment.
function merge(base, delta) {
  const b = base && typeof base === "object" ? base : blank()
  const d = delta && typeof delta === "object" ? delta : blank()
  const captures = capturesCleared
    ? []
    : uniqBy([...(d.captures || []), ...(b.captures || [])], captureKey).slice(0, 50)
  return {
    at: new Date().toISOString(),
    requests: num(b.requests) + num(d.requests),
    beforeBytes: num(b.beforeBytes) + num(d.beforeBytes),
    afterBytes: num(b.afterBytes) + num(d.afterBytes),
    savedBytes: num(b.savedBytes) + num(d.savedBytes),
    savedTokens: num(b.savedTokens) + num(d.savedTokens),
    failOpen: num(b.failOpen) + num(d.failOpen),
    strategies: mergeStrategies(b.strategies, d.strategies),
    recent: uniqBy([...(d.recent || []), ...(b.recent || [])], recentKey).slice(0, KEEP_RECENT),
    captures,
    lab: d.lab != null ? d.lab : b.lab != null ? b.lab : null,
    labBusy: d.labBusy != null ? d.labBusy : b.labBusy != null ? b.labBusy : null,
    capture: b.capture || d.capture || { count: 0, dropped: 0 },
  }
}

// The stored list outlives this process, so "clear" cannot be a write into
// summary.captures alone: it must also win over what is on disk.
export function clearCaptureIndex() {
  summary.captures = []
  capturesCleared = true
}

// A test run must never touch the real files.
const off = () => process.env.COMPRESS_CORE_NO_STATS === "1"

export function record(event) {
  if (off() || !event || typeof event !== "object") return
  const before = Number(event.beforeBytes) || 0
  const after = Number(event.afterBytes) || 0
  const saved = Number.isFinite(event.savedBytes) ? Number(event.savedBytes) : Math.max(0, before - after)

  summary.requests += 1
  summary.beforeBytes += before
  summary.afterBytes += after
  summary.savedBytes += saved
  summary.savedTokens += Math.max(
    0,
    (Number(event.estimatedBeforeTokens) || 0) - (Number(event.estimatedAfterTokens) || 0),
  )
  if (event.failOpen) summary.failOpen += 1

  for (const s of event.strategies || []) {
    if (!s || typeof s.id !== "string") continue
    const slot = summary.strategies[s.id] || (summary.strategies[s.id] = { runs: 0, savedBytes: 0 })
    const removed = Math.max(0, Number(s.savedBytes) || 0)
    if (s.enabled === true && removed > 0) slot.runs += 1
    slot.savedBytes += removed
  }

  summary.recent.unshift({
    ts: typeof event.ts === "string" ? event.ts : new Date().toISOString(),
    model: event.model || "",
    agent: event.agent || "",
    protocol: event.protocol || "",
    beforeBytes: before,
    afterBytes: after,
    savedBytes: saved,
    totalMs: Number(event.totalMs) || 0,
    failOpen: event.failOpen ? 1 : 0,
  })
  if (summary.recent.length > KEEP_RECENT) summary.recent.length = KEEP_RECENT

  if (Date.now() - lastFlushAt >= FLUSH_MS) void flush()
}

export async function flush(force = false) {
  if (off() || inFlight) return
  const now = Date.now()
  if (!force && now - lastFlushAt < FLUSH_MS) return
  inFlight = true
  const path = statsFile()
  const tmp = path + ".tmp"
  try {
    let stored = null
    try {
      const text = await readFile(path, "utf8")
      if (text.length <= MAX_BYTES) stored = JSON.parse(text)
    } catch {
      // No file yet, or an unreadable one: start from this process's summary.
    }
    // The stored file is the base and this process's summary is the increment,
    // because the Bun companion may not keep this module alive between requests.
    const next = merge(stored, summary)
    await mkdir(telemetryDir(), { recursive: true })
    await writeFile(tmp, JSON.stringify(next, null, 2) + "\n", "utf8")
    await rename(tmp, path)
    // Everything this process knows is now on disk; the next request must not
    // count it twice.
    summary = blank()
    capturesCleared = false
    lastFlushAt = now
  } catch {
    // A page that shows no numbers is better than a request that fails.
    try { await unlink(tmp) } catch {}
  } finally {
    inFlight = false
  }
}

export function snapshot() {
  return summary
}
