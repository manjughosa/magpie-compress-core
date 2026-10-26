import assert from "node:assert/strict"
import { mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = await mkdtemp(join(tmpdir(), "compress-core-captures-"))
process.env.COMPRESS_CORE_DATA_DIR = root
const { clearCaptures, MAX_CAPTURE_BYTES, readCapture, saveCapture } = await import("../capture-store.js")

export const name = "capture-store"
const id = number => `capture-${String(number).padStart(4, "0")}`

export async function run() {
  await clearCaptures()
  const original = { id: id(0), before: { text: "完整原文" }, after: { text: "完整结果" } }
  assert.deepEqual(await saveCapture(original), { saved: true })
  assert.deepEqual(await readCapture(id(0)), original)
  assert.equal(await readCapture("not-found"), null)

  assert.deepEqual(await saveCapture({ id: "../escape" }), { saved: false, reason: "invalid_id" })
  assert.deepEqual(await saveCapture({ id: "short" }), { saved: false, reason: "invalid_id" })
  assert.equal(await readCapture("../../requests"), null)

  assert.deepEqual(await saveCapture({ id: "oversize-001", payload: "x".repeat(MAX_CAPTURE_BYTES) }), { saved: false, reason: "too_large" })
  assert.equal(await readCapture("oversize-001"), null)

  for (let n = 1; n <= 51; n++) {
    const result = await saveCapture({ id: id(n), sequence: n, snapshot: { before: "before", after: "after" } })
    assert.deepEqual(result, { saved: true })
  }
  const captures = join(root, "captures")
  const files = (await readdir(captures)).filter(name => name.endsWith(".json"))
  assert.equal(files.length, 50)
  assert.equal(await readCapture(id(1)), null)
  assert.deepEqual((await readCapture(id(51))).sequence, 51)

  await writeFile(join(captures, "keep.txt"), "not a capture", "utf8")
  await clearCaptures()
  assert.equal((await readdir(captures)).filter(name => name.endsWith(".json")).length, 0)
  assert.equal(await readFile(join(captures, "keep.txt"), "utf8"), "not a capture")
  assert.equal(await readCapture(id(51)), null)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run()
