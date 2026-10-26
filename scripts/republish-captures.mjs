// scripts/republish-captures.mjs — rebuild what the page reads for every stored
// capture. The page has no network access, so each capture is published beside
// it as a script, plus one index script listing them all. Captures written
// before that path existed, or after the page folder was cleared, are invisible
// until this runs. Safe to re-run: a script whose bytes already match is kept.
import { mkdir, readdir, readFile, rename, stat, writeFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import { randomUUID } from "node:crypto"
import { telemetryDir } from "../telemetry-store.js"

const ID_PATTERN = /^[A-Za-z0-9-]{8,80}$/
const storeDirectory = () => join(telemetryDir(), "captures")
const pageDirectory = () => process.env.COMPRESS_CORE_PAGE_DIR || join(import.meta.dirname, "..", "page", "captures")

// Same shapes capture-store.js publishes while saving.
const publishedScript = record =>
  `globalThis.__COMPRESS_CAPTURES__=globalThis.__COMPRESS_CAPTURES__||{};globalThis.__COMPRESS_CAPTURES__[${JSON.stringify(record.id)}]=${JSON.stringify(record)};\n`
const publishedIndex = entries =>
  `globalThis.__COMPRESS_CAPTURES_INDEX__=${JSON.stringify(entries)};\n`
const indexEntry = record => ({
  id: record.id,
  at: record.at || "",
  protocol: record.protocol || "",
  model: record.model || "",
  before: record.beforeBytes || 0,
  after: record.afterBytes || 0,
  saved: record.savedBytes || 0,
  summary: record.summary === true,
})

async function writeAtomic(target, body) {
  const temp = join(dirname(target), `.${randomUUID()}.tmp`)
  await writeFile(temp, body, "utf8")
  await rename(temp, target)
}

const store = storeDirectory()
const page = pageDirectory()
await mkdir(page, { recursive: true })

const names = await readdir(store).catch(() => [])
let published = 0
let current = 0
let skipped = 0
const entries = []

for (const name of names) {
  if (!name.endsWith(".json") || name === "index.json") continue
  const id = name.slice(0, -".json".length)
  if (!ID_PATTERN.test(id)) {
    skipped++
    continue
  }
  let record
  try {
    record = JSON.parse(await readFile(join(store, name), "utf8"))
  } catch {
    skipped++
    continue
  }
  if (!record || record.id !== id) {
    skipped++
    continue
  }
  entries.push(indexEntry(record))
  const body = publishedScript(record)
  const target = join(page, `${id}.js`)
  const existing = await stat(target).catch(() => null)
  if (existing && existing.size === Buffer.byteLength(body)) {
    current++
    continue
  }
  await writeAtomic(target, body)
  published++
}

entries.sort((a, b) => String(b.at).localeCompare(String(a.at)))
const listing = entries.slice(0, 50)
await writeAtomic(join(page, "index.js"), publishedIndex(listing))
await writeAtomic(join(telemetryDir(), "captures-index.json"), JSON.stringify(listing))

console.log(`captures: republished ${published}, already current ${current}, skipped ${skipped}; index lists ${listing.length}`)
