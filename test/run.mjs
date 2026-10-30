// test/run.mjs — run every strategy's behavior tests.
// Each test module exports { name, run } ; run() uses helpers.check().
// Usage: node test/run.mjs [onlyThisTestName]

import { failedCount } from "./helpers.mjs"
import { mkdtempSync, readdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { join as joinPath, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { suites, unlistedSuites } from "./suites.mjs"

// Every suite runs against throwaway folders: a capture keeps the whole
// conversation, and one that fell into the live plugin folder would put operator
// text inside the installed package.
const sandbox = mkdtempSync(joinPath(tmpdir(), "compress-core-suites-"))
process.env.COMPRESS_CORE_DATA_DIR = joinPath(sandbox, "data")
// A suite that isolates only the data folder would still write its counters
// into the operator's own plugins.json; the config folder is sandboxed too.
process.env.MAGPIE_CONFIG_DIR = joinPath(sandbox, "config")
// The capture index is published into the plugin's own page folder, which is
// this repo: a suite that published would leave a file in it. Never from here.
process.env.COMPRESS_CORE_NO_PUBLISH = "1"

// The list lives in test/suites.mjs, shared with ci.test.mjs: two copies drifted
// once already and CI silently skipped four suites.
const here = dirname(fileURLToPath(import.meta.url))
const strays = unlistedSuites(readdirSync(here))
if (strays.length > 0) {
  console.error(`suites not listed in test/suites.mjs: ${strays.join(", ")}`)
  process.exit(2)
}

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
