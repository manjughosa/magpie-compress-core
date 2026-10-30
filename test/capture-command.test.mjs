// A clear runs once. magpie starts the hooks host again on any options change,
// and `options.captureCommand` keeps handing the host the last command it was
// given — a host without a memory of it would empty the list on every restart.
// The journal in commands.json is the only record that outlives the host, so this
// suite runs two hosts: the second is the same code freshly loaded.
import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"

export const name = "capture-command"
const root = await mkdtemp(join(tmpdir(), "compress-core-command-"))

export async function run() {
  // Read when used, not when the module loads: earlier suites set their own.
  process.env.COMPRESS_CORE_DATA_DIR = root
  // This package ships without a page/ to publish beside, so a capture must
  // never write one: the run() switch keeps the assertion env-independent.
  process.env.COMPRESS_CORE_NO_PUBLISH = "1"
  const { clearCaptures, readCapture, saveCapture } = await import("../capture-store.js")
  await clearCaptures()

  const command = { id: "capture-fixed-0001", action: "clear" }
  const host1 = await import("../options-commands.js?host=1")
  assert.equal(await host1.processCaptureCommand({ captureCommand: command }), true)
  const journal = JSON.parse(await readFile(join(root, "commands.json"), "utf8"))
  assert.equal(journal.captureCommand.id, command.id)
  assert.equal(journal.captureCommand.status, "done")
  check("CMD-00 执行过的 clear 落盘留痕", true)

  // The capture below is what the operator would have collected after that clear.
  assert.deepEqual(await saveCapture({ id: "capture-after-clear", sequence: 1 }), { saved: true, published: false })
  const host2 = await import("../options-commands.js?host=2")
  assert.equal(await host2.processCaptureCommand({ captureCommand: command }), true)
  assert.ok(await readCapture("capture-after-clear"))
  check("CMD-01 同一条 clear 不因宿主重载再跑一次", true)

  // Dedupe must not turn into "clear never works": a new id still clears.
  const next = { id: "capture-fixed-0002", action: "clear" }
  assert.equal(await host2.processCaptureCommand({ captureCommand: next }), true)
  assert.equal(await readCapture("capture-after-clear"), null)
  check("CMD-02 新的 clear 仍然生效", true)

  // Without the journal there is nothing to tell a replayed command from a new
  // one, and the clear runs again: this is the failure the journal prevents, run
  // on purpose so the guard cannot be dropped silently.
  await saveCapture({ id: "capture-after-journal", sequence: 2 })
  await rm(join(root, "commands.json"), { force: true })
  const host3 = await import("../options-commands.js?host=3")
  assert.equal(await host3.processCaptureCommand({ captureCommand: next }), true)
  assert.equal(await readCapture("capture-after-journal"), null)
  check("CMD-03 丢了 journal 才会重放（守卫是必要的）", true)
}

// Direct-run convenience: `node test/capture-command.test.mjs`. Guarded against bun:
// under `bun test`, process.argv[1] IS this file, so an unguarded self-run would
// execute the suite once at load and again from ci.test.mjs — and the second pass
// fails, because options-commands.js?host=1 is a cached module whose `completed`
// Set already holds the command id. `typeof Bun` is the reliable runtime split.
if (typeof Bun === "undefined" && process.argv[1] === fileURLToPath(import.meta.url)) await run()
