// test/ci.test.mjs — the 21 suites, seen by `bun test`.
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

// The same throwaway folders test/run.mjs uses: a capture keeps a whole
// conversation, and one that landed in the installed plugin folder would put
// operator text inside the package.
const sandbox = mkdtempSync(join(tmpdir(), "compress-core-bun-"))
process.env.COMPRESS_CORE_DATA_DIR = join(sandbox, "data")
process.env.MAGPIE_CONFIG_DIR = join(sandbox, "config")

// Kept in the same order as test/run.mjs.
const suites = [
  "capture-store.test.mjs",
  "redact.test.mjs",
  "lab.test.mjs",
  "approved-lite.test.mjs",
  "gateway-cases.test.mjs",
  "engine-cases.test.mjs",
  "prefix-stability.test.mjs",
  "lite.test.mjs",
  "session-dedup.test.mjs",
  "headroom.test.mjs",
  "codex-responses.test.mjs",
  "rtk.test.mjs",
  "observability.test.mjs",
  "relevance.test.mjs",
  "ultra.test.mjs",
  "caveman.test.mjs",
  "aggressive.test.mjs",
  "ionizer.test.mjs",
  "llm.test.mjs",
  "ccr.test.mjs",
  "read-lifecycle.test.mjs",
  "body-limit.test.mjs", "audit.test.mjs", "page-catalog.test.mjs",
]

for (const file of suites) {
  const mod = await import(`./${file}`)
  test(mod.name || file, async () => {
    const before = failedCount()
    await mod.run()
    expect(failedCount() - before).toBe(0)
  }, 30000)
}