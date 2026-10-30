// test/ci.test.mjs — every suite, seen by `bun test`.
//
// Every suite exports { name, run } and asserts through helpers.check(), which
// counts failures instead of throwing — so `bun test` loaded them and found no
// tests at all. This file turns each suite into one bun:test test that fails
// when that suite's own counter moved. `node test/run.mjs` still runs them
// directly; neither entry point needs the other.
import { test, expect } from "bun:test"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { failedCount } from "./helpers.mjs"
import { suites } from "./suites.mjs"

// The same throwaway folders test/run.mjs uses: a capture keeps a whole
// conversation, and one that landed in the installed plugin folder would put
// operator text inside the package.
const sandbox = mkdtempSync(join(tmpdir(), "compress-core-bun-"))
process.env.COMPRESS_CORE_DATA_DIR = join(sandbox, "data")
process.env.MAGPIE_CONFIG_DIR = join(sandbox, "config")
// No page/ in this package: the capture suite would otherwise publish its
// fixture beside a page that is not here (CI runs from a read-only checkout).
process.env.COMPRESS_CORE_NO_PUBLISH = "1"

// The suite list lives in test/suites.mjs and is shared with run.mjs. This file
// used to keep its own copy, and the copies drifted: capture-command,
// ccr-persist, active-shapes and config-contract ran under `node test/run.mjs`
// but never under `bun test`, so CI skipped four suites without saying so.

for (const file of suites) {
  const mod = await import(`./${file}`)
  test(mod.name || file, async () => {
    const before = failedCount()
    await mod.run()
    expect(failedCount() - before).toBe(0)
  }, 30000)
}