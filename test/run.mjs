// test/run.mjs — run every strategy's behavior tests.
// Each test module exports { name, run } ; run() uses helpers.check().
// Usage: node test/run.mjs [onlyThisTestName]

import { failedCount } from "./helpers.mjs"

const suites = ["lite.test.mjs", "session-dedup.test.mjs", "headroom.test.mjs", "codex-responses.test.mjs", "rtk.test.mjs", "observability.test.mjs", "relevance.test.mjs", "ultra.test.mjs", "caveman.test.mjs", "aggressive.test.mjs", "ionizer.test.mjs", "llm.test.mjs", "ccr.test.mjs", "read-lifecycle.test.mjs", "audit.test.mjs"] // all strategies + observability

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
