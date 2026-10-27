import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { telemetryDir } from "./telemetry-store.js"

export const MAX_CAPTURE_BYTES = 2000000
// How many sessions are kept: newest first, everything older is dropped from
// both the store and the page. The viewer mirrors this number for its hint.
export const KEEP_CAPTURES = 50
const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const encoder = new TextEncoder()
const directory = () => join(telemetryDir(), "captures")
// The page cannot fetch anything: magpie serves a plugin page over
// /_magpie/plugin/<token>/ and the page CSP allows no network access. Each
// capture is therefore also published beside the page as a script that the
// viewer loads with a <script> tag. Before/after detail stays available
// without asking the host to run a command on some later request.
const pageDirectory = () => process.env.COMPRESS_CORE_PAGE_DIR || join(import.meta.dirname, "page", "captures")
let queue = Promise.resolve()

function enqueue(operation) {
  const result = queue.then(operation, operation)
  queue = result.catch(() => {})
  return result
}

function publishedScript(record) {
  // JSON.stringify output is a valid JS expression. Keying by id keeps one
  // published capture from overwriting another when two loads race.
  return `globalThis.__COMPRESS_CAPTURES__=globalThis.__COMPRESS_CAPTURES__||{};globalThis.__COMPRESS_CAPTURES__[${JSON.stringify(record.id)}]=${JSON.stringify(record)};\n`
}

async function publish(record) {
  const dir = pageDirectory()
  const target = join(dir, `${record.id}.js`)
  const temp = join(dir, `.${record.id}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(temp, publishedScript(record), "utf8")
    await rename(temp, target)
    return true
  } catch {
    try { await rm(temp, { force: true }) } catch { /* The JSON copy is still on disk. */ }
    return false
  }
}

async function unpublish(id) {
  try { await rm(join(pageDirectory(), `${id}.js`), { force: true }) } catch { /* Best effort. */ }
}

// The viewer cannot fetch, and the index kept in plugins.json is rewritten
// through a file magpie owns, so it drifts away from what is actually stored.
// The list therefore comes from the store itself: this index is derived from
// the captures on disk and published beside the page with them.
const indexEntries = () => join(telemetryDir(), "captures-index.json")
let index = null

function indexEntry(record) {
  return {
    id: record.id,
    at: record.at || "",
    protocol: record.protocol || "",
    model: record.model || "",
    before: record.beforeBytes || 0,
    after: record.afterBytes || 0,
    saved: record.savedBytes || 0,
    // A capture is "summary only" when the hook said so: it stores the numbers
    // but withheld the text because the request was too large to keep.
    summary: record.summary === true,
  }
}

async function loadIndex() {
  if (index) return index
  try {
    const stored = JSON.parse(await readFile(indexEntries(), "utf8"))
    if (Array.isArray(stored)) { index = stored; return index }
  } catch { /* No usable index yet: rebuild from the captures below. */ }
  let names = []
  try { names = await readdir(directory()) } catch { names = [] }
  const rebuilt = []
  for (const name of names) {
    if (!name.endsWith(".json")) continue
    const id = name.slice(0, -".json".length)
    if (!ID_PATTERN.test(id)) continue
    try {
      const record = JSON.parse(await readFile(join(directory(), name), "utf8"))
      if (record && record.id === id) rebuilt.push(indexEntry(record))
    } catch { /* A capture without a readable body cannot be listed. */ }
  }
  rebuilt.sort((a, b) => String(b.at).localeCompare(String(a.at)))
  index = rebuilt
  return index
}

async function writeIndex() {
  if (!index) return
  if (index.length > KEEP_CAPTURES) index = index.slice(0, KEEP_CAPTURES)
  const body = `globalThis.__COMPRESS_CAPTURES_INDEX__=${JSON.stringify(index)};\n`
  const page = pageDirectory()
  try {
    await mkdir(page, { recursive: true })
    const temp = join(page, `.index.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temp, body, "utf8")
    await rename(temp, join(page, "index.js"))
  } catch { /* The viewer falls back to the options index. */ }
  try {
    const base = telemetryDir()
    await mkdir(base, { recursive: true })
    const temp = join(base, `.index.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temp, JSON.stringify(index), "utf8")
    await rename(temp, indexEntries())
  } catch { /* Rebuilt from the captures on the next load. */ }
}

async function prune() {
  let entries
  try { entries = await readdir(directory()) } catch { return [] }
  const captures = []
  for (const name of entries) {
    if (!name.endsWith(".json")) continue
    const path = join(directory(), name)
    try {
      const info = await stat(path)
      if (info.isFile()) captures.push({ path, id: name.slice(0, -".json".length), mtime: info.mtimeMs, name })
    } catch { /* A concurrently removed capture needs no further work. */ }
  }
  captures.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
  const kept = captures.slice(0, KEEP_CAPTURES)
  const expired = captures.slice(KEEP_CAPTURES)
  await Promise.all(expired.map(async capture => {
    try { await rm(capture.path, { force: true }) } catch { /* Retention is best effort. */ }
    await unpublish(capture.id)
  }))
  // A published script whose capture is gone can only be a leftover from an
  // interrupted run; it would still load into the page and show a dead entry.
  try {
    const alive = new Set(kept.map(capture => capture.id))
    for (const name of await readdir(pageDirectory())) {
      if (!name.endsWith(".js") || name === "index.js") continue
      if (alive.has(name.slice(0, -".js".length))) continue
      try { await rm(join(pageDirectory(), name), { force: true }) } catch { /* Best effort. */ }
    }
  } catch { /* The page directory may not exist yet. */ }
  return expired.map(capture => capture.id)
}

// Rebuilds the published index from what is on disk. Exported so an operator
// can repair a page whose list drifted without waiting for the next capture.
export function refreshCapturesIndex() {
  return enqueue(async () => {
    index = null
    const list = await loadIndex()
    await writeIndex()
    return { listed: list.length }
  })
}

export function saveCapture(record) {
  return enqueue(async () => {
    if (!record || typeof record !== "object" || !ID_PATTERN.test(record.id)) return { saved: false, reason: "invalid_id" }
    let data
    try { data = JSON.stringify(record) } catch { return { saved: false, reason: "serialize_failed" } }
    if (data === undefined || encoder.encode(data).length > MAX_CAPTURE_BYTES) return { saved: false, reason: "too_large" }
    const path = join(directory(), `${record.id}.json`)
    const temp = join(directory(), `.${record.id}.${process.pid}.${randomUUID()}.tmp`)
    try {
      await mkdir(directory(), { recursive: true })
      await writeFile(temp, data, "utf8")
      await rename(temp, path)
      const expired = await prune()
      const published = await publish(record)
      // Keep the page's list in step with the store: the viewer renders this.
      const listed = await loadIndex()
      index = [indexEntry(record), ...listed.filter(entry => entry.id !== record.id && !expired.includes(entry.id))].slice(0, KEEP_CAPTURES)
      await writeIndex()
      return { saved: true, published }
    } catch {
      try { await rm(temp, { force: true }) } catch { /* Preserve the original failure reason. */ }
      return { saved: false, reason: "write_failed" }
    }
  })
}

export function readCapture(id) {
  return enqueue(async () => {
    if (!ID_PATTERN.test(id)) return null
    try { return JSON.parse(await readFile(join(directory(), `${id}.json`), "utf8")) } catch { return null }
  })
}

export function clearCaptures() {
  return enqueue(async () => {
    let entries
    try { entries = await readdir(directory(), { withFileTypes: true }) } catch { return { cleared: 0 } }
    let cleared = 0
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue
      try {
        await rm(join(directory(), entry.name), { force: true })
        await unpublish(entry.name.slice(0, -".json".length))
        cleared++
      } catch { /* Other captures can still be cleared. */ }
    }
    index = []
    await writeIndex()
    return { cleared }
  })
}
