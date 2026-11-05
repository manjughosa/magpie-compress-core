[中文](./goal-task1-baseline-upstream.md) | English

# Task-1 forensics: baseline data tables + upstream OmniRoute semantics summary

Date: 2026-10-29 · goal mvt0a83q-fvzhss (all four strategies live)

## 1. Baseline data tables (real-traffic replay)

Data sources: requests.jsonl (6445 entries, 2026-10-26T00 → 10-28T19) under
`%USERPROFILE%\.config\magpie\compress-core\` + the latest 50 entries of
captures-index.json + replay via `scripts/replay-captures.mjs`.

### 1. Replay of the latest 50 (matches production record: production 5291B vs replay 5391B)

| Strategy | enabled | Hits | Bytes saved | Avg cost | Notes |
|:--|:--|:--|:--|:--|:--|
| lite | 50/50 | 50 | 5391B | 2.2ms | folds only `\n{3,}` and trailing whitespace |
| session-dedup | 33 | 0 | 0 | **170.4ms** | burned 28% of the 600ms budget for nothing, reason=no_repeat_eligible_block |
| ccr | 50 | 0 | 0 | — | 100% killed by the gate |
| headroom | 50 | 0 | 0 | — | no_eligible_json_array_or_not_smaller |

Overall compression rate **0.07%**.

### 2. Timeline (hourly aggregation)

| Period | Savings rate | lite avg savings | Scenario |
|:--|:--|:--|:--|:--|
| 10-26 00-06 | 6~19% | 31~70KB | debugging period, heavy message repetition |
| 10-26 10-11 | 68~69% | 636~1319KB | large repeated payloads |
| 10-27, several times | 20~37% | 88~618KB | same as above |
| 10-28 from 12 | 0.06~0.63% | ~0 | the upstream bili proxy already folds first |
| 10-28 19 (latest) | 0.13% | 0KB | dedup 0 hits |

### 3. Latest capture message structure (107 segments)

tool 67.7K chars / system 27.9K / user 6.4K / assistant 5.1K.
Measured lossless redundancy: 164 chars of repeated lines, 0 repeated 500-char
windows, no base64, 1 JSON array below the threshold. The bulk of the 829KB body is
the tools schema (untouchable).

## 2. Upstream OmniRoute semantics summary (verified against release/v3.8.51 source)

The repo has been redirected to `github.com/cheaper-inference/OmniRoute`. Local
forensic copies: /tmp/omni-sd.ts (session-dedup, 511 lines), /tmp/omni-ccr.ts
(ccr/index, 1023 lines), /tmp/omni-ccrQuery.ts (110 lines), /tmp/omni-proto.ts
(protocolInstruction, 119 lines), /tmp/omni-ccrTools.ts (MCP tool schemas, 202 lines),
/tmp/omni-ccrBlocks.ts (persistence layer, 138 lines).

### session-dedup (upstream)

- The dedup unit = `findSuffixBlocks`: a whole block from some line **to the end of the
  message** (≥3 lines, ≥80 chars); only exact duplicates across messages are replaced
  with the `[dedup:ref]` back-reference.
- The fuzzy pass is optional (off by default); whole messages ~85% similar are replaced
  with a marker retrievable via CCR — **requires the caller to declare the
  omniroute_ccr_retrieve tool**.
- Measured against the latest capture (102 segments): suffix-block duplicates 0/5151
  pairs → structurally 0 hits on real pi traffic.

### ccr (upstream)

1. **Gate**: `callerSupportsCcrRetrieve(body)` scans tools[]; the name must equal
   `omniroute_ccr_retrieve` exactly or match when ending with a separator (`__` `.`
   `/` `:`), e.g. `mcp__docker__omniroute__omniroute_ccr_retrieve`. If it does not
   pass → the entire engine is skipped, fail-open. The protocol directive (the
   `[CCR protocol]` system message) is also injected only when the gate passes.
2. **Replacement**: the text of every whole non-system/non-tool message (≥`minChars`,
   default 600) → `preamble(first 200 chars)… [CCR retrieve hash=<24hex> chars=N]`. If
   the replacement is not shorter than the original, no change is made.
3. **Store**: keyed by `(principalId ?? "__anon__") + hash`. Two layers: module-level
   in-memory Map + a better-sqlite3 persistent table (blocks >512KB stay in memory
   only). Capacity: 5000 entries / 2MB per block / 16MB per principal / 64MB global.
   TTL default 24h (max 7d). Writes go through a setImmediate deferred queue; the same
   queue preserves the order of persist/delete.
4. **Ramp**: `effectiveMinChars = minChars + retrievalCount × rampFactor(default 2) ×
   minChars` — the more often something has been retrieved, the higher the threshold to
   compress it again, preventing a "compress → retrieve → compress" loop.
5. **Retrieve tool chain**: upstream exposes 6 tools through its built-in MCP server:
   `omniroute_ccr_store / retrieve / inspect / list / delete / stats`. retrieve input
   `{hash, mode?, n?, start?, end?, pattern?, unique?}`, mode ∈
   full/head/tail/lines/grep/stats; the full response is capped at 256KiB, beyond that
   it returns `tooLargeForFull` + `suggestedModes`. grep uses safe-regex to guard
   against backtracking blowups (≤512-char pattern, ≤1000 matches, ≤10000-line range).
   The store tool lets the model actively store original text in exchange for a
   `ccr://` reference.

## 3. Gaps in the ported version (ccr/index.js, 705 lines)

- Gate, preamble, marker format, ramp: aligned with upstream.
- **The store is request-scoped memory** (ctx.state.ccr.map); restoreCcr() can restore
  within the same request; **across requests the marker is a dead reference** — this is
  the other half of the reason for 0 hits (the gate wouldn't pass anyway, because pi
  traffic does not declare the retrieve tool).
- Missing persistence and retrieve tool chain = the core work of task-3.

## 4. Feasible channels on the magpie side (verified by testing)

- No onToolCall hook (confirmed via binary strings) → the plugin cannot execute tools
  on the model's behalf at the gateway side.
- `magpie library mcp add <name> <command args…> [agents=a,b…]` can write a stdio MCP
  server into an agent — task-3 landing point: the plugin ships its own
  `mcp/ccr-retrieve.mjs` (a Node stdio MCP server that reads the persistent store file
  written by the host), and one-click install from the page goes through the
  options-commands channel.
- `magpie plugin options <name> [<json>]` is a whole-bundle replacement; page saves
  must submit the complete options.
