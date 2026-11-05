[中文](./goal-closing-report.md) | English

# compress-core revival closing report (goal mvt0a83q-fvzhss)

Date: 2026-10-29 ｜ Goal: all four strategies live + panel preset switching actually working

## 1. Problem diagnosis (starting point)

- The panel's "captures" list displayed 0.3~0.6% savings as a green `-1%`: `fmtRate`
  used the sign to express "shrunk after compression / bloated", and when
  `Math.round(0.5)=0` the sign was applied first, so visually it looked like negative
  growth. There were 0 genuinely negative compressions.
- Real compression rate over the last 48h had fallen to 0.03~0.13%: lite saved 0KB on
  average, session-dedup had 0 hits (reason all `no_repeat_eligible_block`), and
  ccr/headroom were each 0/500.
- session-dedup flipped between enabled/disabled 14 times; 532 requests were wrongly
  turned off.

## 2. Change list (all have .bak copies, written and read back for verification)

| Task | Files | Backup |
|:--|:--|:--|
| Display fix | page/panel.js, page/app.js (fmtRate 0% branch) | .bak.20261029-0338 |
| task-2 substring-level dedup | engines/session-dedup.js | .bak.20261029-task2 |
| task-3 ccr chain | engines/ccr/index.js, pipeline.js, observability.hooks.js, options-commands.js, test/run.mjs | .bak.20261029-1351 |
| task-3 new files | ccr-store-file.js, mcp/ccr-retrieve-server.mjs, test/ccr-persist.test.mjs, docs/ccr-retrieval-chain.md | new files, no prior state |
| task-4 new tests | test/active-shapes.test.mjs | new file |
| task-5 UI | page/panel.js, page/app.js, page/index.html, page/settings.html, page/style.css, page/view.js, test/run.mjs | .bak.20261029-task5 |
| task-5 new test | test/page-save-flow.test.mjs | new file |
| New tool | scripts/replay-captures.mjs (replay baseline tool) | new file |

## 3. Verification evidence (checked against success criteria one by one)

### (1) session-dedup real hits and lossless ✅
- Replayed 50 historical captures: hits 0 → **49/50**, saving 40705B, avg cost
  170.4ms → **2.2ms**, round-trip 0 mismatches.
- Production real traffic (this session's pi traffic, 416KB body): `status:"hit"`
  saved 1015B, `roundTrip 5/5 passed`, total 27ms of a 600ms budget.
- Algorithm: paragraph blocks (split on `\n{2,}`, ≥minBlockChars) ∪ suffix line blocks
  (≥3 lines and ≥80 chars, preserving upstream semantics); line-level rolling hash
  (fnv1a32 + Horner, dual modulus) O(n) extraction; after hash clustering, each
  candidate is slice-compared before replacement (hash collisions are not swapped);
  first global occurrence kept, all others replaced.
- Tests: A-01~A-32 all green + N-1~N-4 (mid-paragraph hit / idempotence / first global
  occurrence kept) + prefix-stability.

### (2) ccr usable per upstream semantics ✅ (gate honest, chain in place)
- Persistent store (ccr-store-file.js: tmp+rename, 2s debounce, retrievalCounts
  max-merged across processes, >512KB blocks not flushed to disk — same as upstream).
- Retrieve tool chain: mcp/ccr-retrieve-server.mjs, a zero-dependency stdio MCP server
  (full≤256KiB/head/tail/lines/grep/stats); real child-process stdio smoke test passed
  (6000 chars byte-for-byte identical).
- When the gate does not pass, it honestly reports `no_retrieve_tool` (consistent with
  upstream fail-open).
- One-click install from the page: options-commands.js's
  `ccrCommand:{action:"install-mcp"}` → `magpie library mcp add ccr-retrieve …`.
- **Remaining decision point**: installing the MCP server modifies the magpie library
  config (touches agents' tool lists), so per the boundary it was not executed
  automatically. The "Install retrieve" button was added to the UI (2026-10-29 second
  round): clicking writes `ccrCommand` → the host executes `magpie library mcp add` on
  its next local request → the result is published as `compress-ccr-status.js` and the
  button state re-renders (done locks in / error can retry). Alternatively run the CLI
  manually:
- **End-to-end demo (required by the verification contract)**: a body declaring the
  `omniroute_ccr_retrieve` tool → gate passes → long message replaced by marker
  `[CCR retrieve hash=955dac… chars=1641]` (body 3467→1471 chars) → after flush,
  retrieved via the MCP server's `handleRpc` in full mode, 1641 chars **byte-for-byte
  identical**; head mode normal; store flushed at 5325B. Temp directory cleaned up.

### (3) headroom/lite hit on matching shapes, locked by tests ✅
- test/active-shapes.test.mjs: H1, a 12-row homogeneous JSON array, hits with headroom
  + roundTrip all pass + restoreText canonical equality (note: restoreText emits
  compact JSON, not the original pretty-print); H2, a 3-row small array, is not
  compressed; L1, lite whitespace folding, is verbatim correct; L2, default cfg does
  not truncate tool results (only truncates with explicit `compressToolResults:true`);
  L3, images are not stripped by default.
- Zero hits for both on real traffic is **caused by input shape** (no ≥8-row
  homogeneous arrays, no large whitespace); reasons are reported honestly — the
  engines are not dead.

### (4) UI save takes effect + zero enabled flapping ✅
- Root cause: the page overwrote options with a **stale full copy** (dual panels /
  polling / CLI concurrently stomping each other's keys) + edits lost in the debounce
  window.
- Fix: pendingPatch incremental bookkeeping → flush merges into the latest options
  before set; save button (on failure, re-attaches and keeps the dirty state);
  pagehide/visibilitychange flush immediately; polling does not clobber edits while
  dirty and adopts external writes while clean.
- Tests S1-S6 all green (merge semantics / dirty-state polling / consecutive merges /
  failure retry / external adoption / pagehide).
- CLI round-trip: read-back after set matches plugins.json (15 keys, `off` cleared).
- The enabled states of the last 6 real requests are fully consistent, **zero
  flapping**.
- Side note: the plugin had been switched off entirely by `"off": true`; it was turned
  back on with `magpie plugin on compress-core`.

### (5) Panel numbers consistent with telemetry ✅ (with a known-semantics annotation)
- The panel reads stats.json (published by the same writer as the telemetry).
- The gap between the full jsonl (6534req/468MB) and stats.json (1770/33MB) has two
  sources: requests.jsonl.1 is an old rotated file; the 24req gap is **by-design
  semantics** of stats-writer (30s throttled flush + in-process increments lost on host
  restart, stated explicitly in the file-header comment). This is attribution, not a
  bug.

## 4. Budget and compatibility

- budgetMs 600: replay per-engine avgMs ≤2.2ms; production totalMs 27ms. No
  degradation.
- Telemetry format is backward compatible (reasonFor only gained the ccr gateReason
  branch).
- No new npm dependencies (the mcp server is zero-dependency, relative imports).
- Lossy strategies stay off by default: compressToolResults / image stripping still
  require explicit opt-in; ccr has a gate.

## 5. Unverified items (marked honestly)

1. **Real webview clicks**: the save button / preset switching were not click-verified
   in a real magpie webview (unreachable from the CLI environment). The logic layer is
   locked by S1-S6 driving the real panel.js with a stub DOM.
2. **ccr real hits**: first click "Install retrieve tool" in the UI (or run
   `magpie library mcp add` manually); only after installation will real traffic hit.
   The chain itself has passed an end-to-end smoke test.
3. Within stats.json's 30s throttle window, panel numbers lag by ≤30s (designed
   semantics, not a defect).

## 6. Remaining decision points (need the user to decide)

- Whether to install the ccr retrieve MCP server (the one-click button is in place;
  installing = modifying the magpie library config, adding a tool to agents).
- options-override.json is a dead file (no code reads it); recommend deleting it or
  wiring it into the read chain — deletion requires authorization.
- Replay caveat: captures store the text view (content-block structure is lost), so
  replay is a text-level approximation; production figures should be taken from
  requests.jsonl.
