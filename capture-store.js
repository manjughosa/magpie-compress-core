import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { telemetryDir } from "./telemetry-store.js"
import { publishPageScript } from "./page-publish.js"

export const MAX_CAPTURE_BYTES = 2000000
// How many sessions are kept: newest first, everything older is dropped from
// both the store and the page. The viewer mirrors this number for its hint.
export const KEEP_CAPTURES = 50
const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const encoder = new TextEncoder()
const directory = () => join(telemetryDir(), "captures")
// A capture keeps the whole conversation text, so it lives in exactly two places
// on purpose: this plugin's own folder under magpie's config directory (the
// durable copy), and a loadable script beside the page (the only channel the
// sandboxed viewer can read — CSP is `connect-src 'none'`, scripts in the
// page's own folder are allowed). The operator asked for the click-through
// diff back, so the per-capture publish returns; the script carries exactly
// what the JSON copy carries, keyed by capture id.
let queue = Promise.resolve()

function enqueue(operation) {
  const result = queue.then(operation, operation)
  queue = result.catch(() => {})
  return result
}

// The viewer cannot fetch, and the index kept in plugins.json is rewritten
// through a file magpie owns, so it drifts away from what is actually stored.
// The list therefore comes from the store itself: this index is derived from
// the captures on disk and published beside the page with them.
const indexEntries = () => join(telemetryDir(), "captures-index.json")

// The page cannot fetch (`connect-src 'none'`) and magpie grants it no read of
// our own files, so the one channel left is a script in the page's folder, which
// magpie serves beside `app.js`. The index script carries metadata only; each
// capture additionally gets its own script with the full before/after text so
// the click-through diff works — the operator asked for that view back.
const publishIndex = () => publishPageScript("captures-index.js", "__COMPRESS_CAPTURES_INDEX__", index || [])

const capturesPageDir = () => process.env.COMPRESS_CORE_PAGE_DIR
  ? join(process.env.COMPRESS_CORE_PAGE_DIR, "captures")
  : join(import.meta.dirname, "page", "captures")

// Same shape the viewer expects: one store object on globalThis, keyed by id.
function captureScript(record) {
  return `globalThis.__COMPRESS_CAPTURES__=globalThis.__COMPRESS_CAPTURES__||{};globalThis.__COMPRESS_CAPTURES__[${JSON.stringify(record.id)}]=${JSON.stringify(record)};\n`
}

async function publishCapture(record) {
  if (process.env.COMPRESS_CORE_NO_PUBLISH === "1") return false
  const dir = capturesPageDir()
  const target = join(dir, `${record.id}.js`)
  const temp = join(dir, `.${record.id}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await mkdir(dir, { recursive: true })
    await writeFile(temp, captureScript(record), "utf8")
    await rename(temp, target)
    return true
  } catch {
    try { await rm(temp, { force: true }) } catch { /* The JSON copy is still on disk. */ }
    return false
  }
}

async function unpublishCapture(id) {
  try { await rm(join(capturesPageDir(), `${id}.js`), { force: true }) } catch { /* Best effort. */ }
}

async function republishAll() {
  const list = await loadIndex()
  // 直读文件而不是 readCapture：这里已经在 enqueue 的队列里，再入队等于
  // 等自己 —— 那是死锁，refreshCapturesIndex 从 b4af800 回归后一直卡在这。
  const { readFile } = await import("node:fs/promises")
  for (const entry of list) {
    if (!ID_PATTERN.test(entry.id)) continue
    try {
      const record = JSON.parse(await readFile(join(directory(), `${entry.id}.json`), "utf8"))
      if (record && record.id === entry.id) await publishCapture(record)
    } catch { /* A capture without a readable body is skipped. */ }
  }
  return list.length
}

let index = null
// Which folder the cached list was built from. The store folder is read from the
// environment, that value can move under a long-lived process (tests, the lab,
// a host that reloads with a different config dir), and an empty array is a
// perfectly valid cache — so keying on the folder is the only way to tell a
// stale list from a current one.
let indexDir = ""

function indexEntry(record) {
  return {
    id: record.id,
    at: record.at || "",
    protocol: record.protocol || "",
    agent: record.agent || "",
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
  const dir = directory()
  if (index !== null && indexDir === dir) return index
  indexDir = dir
  index = null
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
  if (index === null) return
  if (index.length > KEEP_CAPTURES) index = index.slice(0, KEEP_CAPTURES)
  // One copy, in our own folder: `captures-index.json`. The viewer used to load a
  // script written beside the page; the page no longer reads either of them.
  try {
    const base = telemetryDir()
    await mkdir(base, { recursive: true })
    const temp = join(base, `.index.${process.pid}.${randomUUID()}.tmp`)
    await writeFile(temp, JSON.stringify(index), "utf8")
    await rename(temp, indexEntries())
  } catch { /* Rebuilt from the captures on the next load. */ }
  await publishIndex()
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
  }))
  return expired.map(capture => capture.id)
}

// Rebuilds the published index from what is on disk. Exported so an operator
// can repair a page whose list drifted without waiting for the next capture.
export function refreshCapturesIndex() {
  return enqueue(async () => {
    index = null
    const list = await loadIndex()
    await writeIndex()
    // Republish every capture script too: a fresh install or an update that
    // replaced the plugin folder starts with an empty page/captures, and the
    // viewer's per-capture loader would otherwise 404 on old ids.
    await republishAll()
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
      const published = await publishCapture(record)
      // Keep the page's list in step with the store: the viewer renders this.
      const listed = await loadIndex()
      index = [indexEntry(record), ...listed.filter(entry => entry.id !== record.id && !expired.includes(entry.id))].slice(0, KEEP_CAPTURES)
      await writeIndex()
      await Promise.all(expired.map(id => unpublishCapture(id)))
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
        await unpublishCapture(entry.name.slice(0, -".json".length))
        cleared++
      } catch { /* Other captures can still be cleared. */ }
    }
    index = []
    await writeIndex()
    return { cleared }
  })
}
