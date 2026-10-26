import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import vm from "node:vm"

const root = await mkdtemp(join(tmpdir(), "compress-core-captures-"))
process.env.COMPRESS_CORE_DATA_DIR = root
// Keeps published page scripts out of the real plugin folder during tests.
process.env.COMPRESS_CORE_PAGE_DIR = join(root, "page", "captures")
const { clearCaptures, MAX_CAPTURE_BYTES, readCapture, saveCapture } = await import("../capture-store.js")

export const name = "capture-store"
const id = number => `capture-${String(number).padStart(4, "0")}`
const captures = join(root, "captures")
const page = process.env.COMPRESS_CORE_PAGE_DIR
const pageScripts = async () => (await readdir(page).catch(() => [])).filter(name => name.endsWith(".js") && name !== "index.js")
// The page renders whatever this index lists, so the assertions read it back the
// way the viewer does.
const pageIndex = async () => {
  const source = await readFile(join(page, "index.js"), "utf8").catch(() => "")
  if (!source) return null
  const context = {}
  vm.runInNewContext(source, context)
  return context.__COMPRESS_CAPTURES_INDEX__
}

export async function run() {
  await clearCaptures()
  const original = { id: id(0), before: { text: "完整原文" }, after: { text: "完整结果" } }
  assert.deepEqual(await saveCapture(original), { saved: true, published: true })
  assert.deepEqual(await readCapture(id(0)), original)
  assert.equal(await readCapture("not-found"), null)

  // The published script must load the very record the viewer renders, with no
  // host round trip and no parser of our own on the page side.
  const context = {}
  vm.runInNewContext(await readFile(join(page, `${id(0)}.js`), "utf8"), context)
  assert.equal(JSON.stringify(context.__COMPRESS_CAPTURES__[id(0)]), JSON.stringify(original))
  const listed = await pageIndex()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, id(0))
  assert.equal(listed[0].summary, false)

  assert.deepEqual(await saveCapture({ id: "../escape" }), { saved: false, reason: "invalid_id" })
  assert.deepEqual(await saveCapture({ id: "short" }), { saved: false, reason: "invalid_id" })
  assert.equal(await readCapture("../../requests"), null)

  assert.deepEqual(await saveCapture({ id: "oversize-001", payload: "x".repeat(MAX_CAPTURE_BYTES) }), { saved: false, reason: "too_large" })
  assert.equal(await readCapture("oversize-001"), null)

  for (let n = 1; n <= 51; n++) {
    const result = await saveCapture({ id: id(n), sequence: n, snapshot: { before: "before", after: "after" } })
    assert.deepEqual(result, { saved: true, published: true })
  }
  const files = (await readdir(captures)).filter(name => name.endsWith(".json"))
  assert.equal(files.length, 50)
  assert.equal(await readCapture(id(1)), null)
  assert.deepEqual((await readCapture(id(51))).sequence, 51)
  // Retention prunes the published script in step with the JSON copy.
  assert.equal((await pageScripts()).length, 50)
  assert.equal((await pageScripts()).includes(`${id(1)}.js`), false)
  assert.equal((await pageScripts()).includes(`${id(51)}.js`), true)
  // Retention must also drop the entry from the published list.
  const pruned = await pageIndex()
  assert.equal(pruned.length, 50)
  assert.equal(pruned[0].id, id(51))
  assert.equal(pruned.some(entry => entry.id === id(1)), false)

  await writeFile(join(captures, "keep.txt"), "not a capture", "utf8")
  await clearCaptures()
  assert.equal((await readdir(captures)).filter(name => name.endsWith(".json")).length, 0)
  assert.equal(await readFile(join(captures, "keep.txt"), "utf8"), "not a capture")
  assert.equal(await readCapture(id(51)), null)
  assert.equal((await pageScripts()).length, 0)
  assert.equal((await pageIndex()).length, 0)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run()
