[中文](./leanctx-pipeline-2026-11-03.md) | English

# 16th Strategy and the Composite Pipeline · 2026-11-03

## What was done

- **LeanCTX Structured (the 16th strategy)**: `stackPriority: 17`, positioned between
  Headroom (15) and Relevance (18); off by default, explicitly lossy, and it only
  processes CSV/TSV and constrained YAML manifests in tool output — never ordinary
  conversation.
- CSV/TSV supports RFC-4180 quoting, escaped quotes, embedded separators, and embedded
  newlines; constant-column extraction with optional high-entropy column dropping. YAML
  support covers only the clearly parseable common manifest subset; complex structures
  are skipped as-is, and no new runtime dependency is introduced.
- Data values are recoverable; the original formatting and actively dropped columns are
  outside the recoverable scope. When a main-pipeline round-trip check fails, the
  strategy is rolled back.
- **Headroom/GCF upgrade**: added the new constant-column encoding and its matching
  decoder, preserving the existing nested/attachment round-trip contract. All existing
  Headroom tests pass.
- **RTK assessment conclusion**: no whole-repo replacement. The current JS
  implementation differs architecturally from the upstream Rust engine, and the
  upstream engine/proxy is BUSL-1.1; this pass only keeps the existing compatible
  rules and does not bring in the BUSL engine.
- **Composite chain fix**: Read Lifecycle now folds only old reads that genuinely
  differ; identical repeated reads keep a recoverable body. Fixes old references being
  broken by later transformations when combined with Dedup/LeanCTX, and adds a
  cross-request regression for append-only per-turn originals.
- **Pipeline entry point**: a new ⓘ next to the gear on the home and settings pages
  expands the full registry order, whether each entry is enabled, and its scope of
  effect; steps are generated from the actual registry, not hardcoded copy.

## Verification

- `node test/run.mjs`: full suite passes (including the new strategy, GCF, composite,
  and page tests).
- `node scripts/gen-page-catalog.mjs` / `npm run build:page`: the 16-strategy catalog
  and test-bench bundle were rebuilt.
- `node --check page/app.js page/panel.js`: page script syntax passes.
- Composite regression coverage: when the original grows turn by turn, old Reads are no
  longer folded into stubs that break references; genuinely changed old reads still
  fold.

## Boundaries

- LeanCTX is a custom/all-on strategy, not part of the lossless default tier; without
  CCR's original-recovery channel, actively dropped columns are irreversible.
- The YAML support scope is a defined subset; no claim of full YAML 1.2. Aliases, tags,
  flow, block scalars, and complex nesting are skipped.
- This pass did not upgrade RTK to the BUSL engine, and did not add LeanCTX's
  permissions, memory, file-reading, MCP, or proxy systems.
