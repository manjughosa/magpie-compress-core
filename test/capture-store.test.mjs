import assert from "node:assert/strict"
import { mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = await mkdtemp(join(tmpdir(), "compress-core-captures-"))
const { clearCaptures, MAX_CAPTURE_BYTES, readCapture, saveCapture } = await import("../capture-store.js")

export const name = "capture-store"
const id = number => `capture-${String(number).padStart(4, "0")}`
const captures = join(root, "captures")
// A capture is the whole conversation. It lives in this plugin's own folder and
// nowhere else: no copy beside the page, no script the page could load.
const index = async () => JSON.parse(await readFile(join(root, "captures-index.json"), "utf8").catch(() => "null"))
const strays = async () => (await readdir(root).catch(() => [])).filter(name => name.endsWith(".js"))

export async function run() {
  // The store folder is read from the environment when it is used, not when this
  // module loads, so the switch belongs here. Bun loads every test file before
  // running any of them: a top-level assignment here would be overwritten by
  // whichever file loads last, and this suite would write into one folder while
  // reading from another.
  process.env.COMPRESS_CORE_DATA_DIR = root
  // Publish is asserted separately below with its own page dir; the base run
  // keeps NO_PUBLISH on so the suite passes standalone and in parallel.
  process.env.COMPRESS_CORE_NO_PUBLISH = "1"
  await clearCaptures()
  const original = { id: id(0), before: { text: "完整原文" }, after: { text: "完整结果" } }
  assert.deepEqual(await saveCapture(original), { saved: true, published: false })
  assert.deepEqual(await readCapture(id(0)), original)
  assert.equal(await readCapture("not-found"), null)

  const listed = await index()
  assert.equal(listed.length, 1)
  assert.equal(listed[0].id, id(0))
  assert.equal(listed[0].summary, false)
  assert.deepEqual(await strays(), [])

  assert.deepEqual(await saveCapture({ id: "../escape" }), { saved: false, reason: "invalid_id" })
  assert.deepEqual(await saveCapture({ id: "short" }), { saved: false, reason: "invalid_id" })
  assert.equal(await readCapture("../../requests"), null)

  assert.deepEqual(await saveCapture({ id: "oversize-001", payload: "x".repeat(MAX_CAPTURE_BYTES) }), { saved: false, reason: "too_large" })
  assert.equal(await readCapture("oversize-001"), null)

  for (let n = 1; n <= 51; n++) {
    const result = await saveCapture({ id: id(n), sequence: n, snapshot: { before: "before", after: "after" } })
    assert.deepEqual(result, { saved: true, published: false })
  }
  const files = (await readdir(captures)).filter(name => name.endsWith(".json"))
  assert.equal(files.length, 50)
  assert.equal(await readCapture(id(1)), null)
  assert.deepEqual((await readCapture(id(51))).sequence, 51)
  // Retention drops the JSON copy and the index entry together.
  const pruned = await index()
  assert.equal(pruned.length, 50)
  assert.equal(pruned[0].id, id(51))
  assert.equal(pruned.some(entry => entry.id === id(1)), false)
  assert.deepEqual(await strays(), [])

  await writeFile(join(captures, "keep.txt"), "not a capture", "utf8")
  await clearCaptures()
  assert.equal((await readdir(captures)).filter(name => name.endsWith(".json")).length, 0)
  assert.equal(await readFile(join(captures, "keep.txt"), "utf8"), "not a capture")
  assert.equal(await readCapture(id(51)), null)
  assert.equal((await index()).length, 0)

  // The page's list reaches it as a script in the plugin's page folder: magpie
  // serves that folder and nothing else, and `connect-src 'none'` rules out a
  // fetch. The index carries metadata; each capture additionally publishes its
  // own script so the click-through diff works — that view is the point.
  {
    const pageDir = join(root, "page")
    await mkdir(pageDir, { recursive: true })
    process.env.COMPRESS_CORE_PAGE_DIR = pageDir
    delete process.env.COMPRESS_CORE_NO_PUBLISH
    try {
      const saved = await saveCapture({ id: id(90), before: { text: "必须不出现在页面脚本里" }, after: { text: "同样不许" } })
      assert.deepEqual(saved, { saved: true, published: true })
      const text = await readFile(join(pageDir, "captures-index.js"), "utf8")
      const prefix = "globalThis.__COMPRESS_CAPTURES_INDEX__ = "
      assert.ok(text.startsWith(prefix))
      const published = JSON.parse(text.slice(prefix.length))
      assert.equal(published.length, 1)
      assert.equal(published[0].id, id(90))
      // The per-capture script carries the full record so the viewer can
      // render the before/after diff — the conversation text is the content.
      const capScript = await readFile(join(pageDir, "captures", `${id(90)}.js`), "utf8")
      assert.ok(capScript.includes(`globalThis.__COMPRESS_CAPTURES__`))
      assert.ok(capScript.includes(`[${JSON.stringify(id(90))}]=`))
      assert.ok(capScript.includes("必须不出现在页面脚本里"))
      assert.ok(capScript.includes("同样不许"))
      assert.deepEqual((await readdir(pageDir)).filter(name => name.endsWith(".tmp")), [])
      assert.deepEqual((await readdir(join(pageDir, "captures"))).filter(name => name.endsWith(".tmp")), [])

      await clearCaptures()
      assert.equal(JSON.parse((await readFile(join(pageDir, "captures-index.js"), "utf8")).slice(prefix.length)).length, 0)
      // Clearing the store drops the published scripts with it: a row left
      // pointing at a script that no longer exists is the bug this guards.
      const capLeft = (await readdir(join(pageDir, "captures"))).filter(name => name.endsWith(".js"))
      assert.deepEqual(capLeft, [])

      // The numbers the panel draws with take the same road, because
      // stats-writer stopped writing them into magpie's settings file.
      const { flush: flushStats } = await import("../stats-writer.js")
      await flushStats(true)
      const statsPrefix = "globalThis.__COMPRESS_CORE_STATS__ = "
      const statsText = await readFile(join(pageDir, "compress-stats.js"), "utf8")
      assert.ok(statsText.startsWith(statsPrefix))
      const summary = JSON.parse(statsText.slice(statsPrefix.length))
      assert.equal(typeof summary.requests, "number")
      assert.equal(typeof summary.strategies, "object")
      // What a row does not need must not ride along: the capture index and the
      // lab result have a place of their own.
      assert.equal(summary.captures, undefined)
      assert.equal(summary.lab, undefined)
      assert.ok(Array.isArray(summary.recent) && summary.recent.length <= 1)
      assert.deepEqual((await readdir(pageDir)).filter(name => name.endsWith(".tmp")), [])
    } finally {
      // Later suites must not publish either.
      process.env.COMPRESS_CORE_NO_PUBLISH = "1"
      delete process.env.COMPRESS_CORE_PAGE_DIR
    }
  }
}

// Guarded against bun: under `bun test` argv[1] is this file, so an unguarded
// self-run would execute the suite once at load and again from ci.test.mjs.
if (typeof Bun === "undefined" && process.argv[1] === fileURLToPath(import.meta.url)) await run()
