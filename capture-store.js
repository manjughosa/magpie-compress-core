import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { telemetryDir } from "./telemetry-store.js"

export const MAX_CAPTURE_BYTES = 2000000
const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const encoder = new TextEncoder()
const directory = () => join(telemetryDir(), "captures")
let queue = Promise.resolve()

function enqueue(operation) {
  const result = queue.then(operation, operation)
  queue = result.catch(() => {})
  return result
}

async function prune() {
  let entries
  try { entries = await readdir(directory()) } catch { return }
  const captures = []
  for (const name of entries) {
    if (!name.endsWith(".json")) continue
    const path = join(directory(), name)
    try {
      const info = await stat(path)
      if (info.isFile()) captures.push({ path, mtime: info.mtimeMs, name })
    } catch { /* A concurrently removed capture needs no further work. */ }
  }
  captures.sort((a, b) => b.mtime - a.mtime || b.name.localeCompare(a.name))
  await Promise.all(captures.slice(50).map(async capture => {
    try { await rm(capture.path, { force: true }) } catch { /* Retention is best effort. */ }
  }))
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
      await prune()
      return { saved: true }
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
        cleared++
      } catch { /* Other captures can still be cleared. */ }
    }
    return { cleared }
  })
}
