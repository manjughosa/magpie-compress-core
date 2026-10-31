// test/suites.mjs — the one list of suites, shared by both entry points.
//
// `node test/run.mjs` and `bun test` (via ci.test.mjs) each used to keep their own
// copy of this list, and the copies drifted: five suites ran under node and never
// under bun, so CI silently skipped them — which is exactly how the capture-command
// double-run failure stayed hidden. Adding a suite here registers it for both.
//
// Order matters for `node test/run.mjs` output; ci.test.mjs uses the same order so
// a failure reads the same way under either runner.
export const suites = [
  "capture-store.test.mjs",
  "capture-command.test.mjs",
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
  "ccr-persist.test.mjs",
  "active-shapes.test.mjs",
  "read-lifecycle.test.mjs",
  "body-limit.test.mjs",
  "audit.test.mjs",
  "page-catalog.test.mjs",
  "page-save-flow.test.mjs",
  "config-contract.test.mjs",
  "performance.test.mjs",
]

/**
 * Every *.test.mjs in test/ that is neither the bun entry point (ci.test.mjs) nor
 * listed above. A new suite someone forgot to register shows up here.
 */
export function unlistedSuites(files) {
  const known = new Set([...suites, "ci.test.mjs"])
  return files.filter((f) => f.endsWith(".test.mjs") && !known.has(f)).sort()
}
