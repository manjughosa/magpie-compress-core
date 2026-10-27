// test/run.mjs — run every strategy's behavior tests.
// Each test module exports { name, run } ; run() uses helpers.check().
// Usage: node test/run.mjs [onlyThisTestName]

import { failedCount } from "./helpers.mjs"
import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join as joinPath } from "node:path"

// Every suite runs against throwaway folders: a capture keeps the whole
// conversation, and one that fell into the live plugin folder would put operator
// text inside the installed package.
const sandbox = mkdtempSync(joinPath(tmpdir(), "compress-core-suites-"))
process.env.COMPRESS_CORE_DATA_DIR = joinPath(sandbox, "data")
// A suite that isolates only the data folder would still write its counters
// into the operator's own plugins.json; the config folder is sandboxed too.
process.env.MAGPIE_CONFIG_DIR = joinPath(sandbox, "config")

const suites = ["capture-store.test.mjs", "redact.test.mjs", "lab.test.mjs", "approved-lite.test.mjs", "gateway-cases.test.mjs", "engine-cases.test.mjs", "prefix-stability.test.mjs", "lite.test.mjs", "session-dedup.test.mjs", "headroom.test.mjs", "codex-responses.test.mjs", "rtk.test.mjs", "observability.test.mjs", "relevance.test.mjs", "ultra.test.mjs", "caveman.test.mjs", "aggressive.test.mjs", "ionizer.test.mjs", "llm.test.mjs", "ccr.test.mjs", "read-lifecycle.test.mjs", "audit.test.mjs"] // storage + redaction + lab bench + all strategies + observability

const only = process.argv[2]
let any = false
for (const s of suites) {
  const mod = await import(`./${s}`)
  if (only && mod.name !== only) continue
  any = true
  console.log(`\n[${mod.name}]`)
  await mod.run()
}
if (!any) {
  console.error(only ? `no test suite named ${only}` : "no test suites")
  process.exit(2)
}
const n = failedCount()
console.log(n === 0 ? "\nall tests passed" : `\n${n} FAILURE(S)`)
process.exit(n === 0 ? 0 : 1)
