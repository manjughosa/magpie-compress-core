// A rolling summary of what compression saved, written back into this plugin's
// own entry in magpie's `plugins.json`.
//
// Why it goes through that file: a page or a panel runs under magpie's sandbox
// with `connect-src 'none'`, so it cannot fetch anything — `magpie.options` is
// the only channel a page can read. The hook side is trusted Bun and may touch
// the disk, so it writes the numbers where the page will look for them.
//
// This borrows a file magpie owns, so every write is conservative: only when
// there is exactly one matching entry, never while magpie may be writing it
// (fresh mtime is skipped), always through a temp file and a rename, and any
// failure is swallowed so compression itself is never affected.
import { readFile, stat, writeFile, rename, unlink } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

const FLUSH_MS = 30_000        // at most one write every half minute
const QUIET_MS = 1_500         // skip if magpie wrote the file this recently
const KEEP_RECENT = 12
const MAX_BYTES = 4_000_000    // refuse to rewrite an implausibly large file

let selfDir = ""

export function setSelfDir(dir) {
  selfDir = typeof dir === "string" ? dir : ""
}

export function configDir() {
  const xdg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "magpie") : null
  return process.env.MAGPIE_CONFIG_DIR || xdg || join(homedir(), ".config", "magpie")
}

const pluginsJson = () => join(configDir(), "plugins.json")

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

// A test run must never touch the real plugins.json.
const off = () => process.env.COMPRESS_CORE_NO_STATS === "1"

const norm = (p) => String(p || "").replace(/\\/g, "/").toLowerCase().replace(/\/+$/, "")
const base = (p) => norm(p).split("/").filter(Boolean).pop() || ""

// A spec is a folder we were added from, or a package name. Compare the tail
// so a relative spec still matches the folder this file lives in.
function isOurs(spec) {
  const s = norm(spec)
  if (!s) return false
  if (selfDir) {
    const dir = norm(selfDir)
    if (s === dir) return true
    const name = base(dir)
    if (name && (s === name || s.endsWith("/" + name))) return true
  }
  return s.includes("compress-core")
}

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
  const path = pluginsJson()
  const tmp = path + ".compress-core.tmp"
  try {
    const info = await stat(path)
    if (info.size > MAX_BYTES) return
    if (!force && now - info.mtimeMs < QUIET_MS) return

    const doc = JSON.parse(await readFile(path, "utf8"))
    const list = Array.isArray(doc?.plugins) ? doc.plugins : null
    if (!list) return

    const hits = list.filter((p) => p && isOurs(p.spec))
    if (hits.length !== 1) return

    const entry = hits[0]
    if (!entry.options || typeof entry.options !== "object") entry.options = {}
    // Re-read after every UI/command write; stats and capture metadata share
    // this object with user settings, so an in-memory snapshot is not enough.
    const next = merge(entry.options.stats, summary)
    if (JSON.stringify(entry.options.stats) === JSON.stringify(next)) {
      lastFlushAt = now
      return
    }

    entry.options.stats = next
    await writeFile(tmp, JSON.stringify(doc, null, 2) + "\n", "utf8")
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
