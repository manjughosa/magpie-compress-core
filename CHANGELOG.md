# Changelog

## 0.5.3 — 2026-11-12

- **CCR gate**: `deferred` now also reads the content block array of a system/developer message (explicit `text` / `input_text` blocks only; other messages and block types are still not scanned) — verified against a native Claude CLI loopback request (`none` before, `deferred` after). codex is off the indirect allowlist: a shell or `exec_command` alone is not a retrieval channel, so codex must declare the retrieve tool or match a deferred manifest; `indirect` stays a declaration heuristic, not proof of reachability.
- **CCR safety**: the Bun host skips blocks the store cannot persist (**strictly above** the 512KiB cap; a block of exactly 512KiB is still written), `await`s the store being ready before compressing instead of skipping while it is not ready, and keeps the original body when the flush fails. A marker is published only after its original is flushed, but that is not a promise retrieval can never fail — TTL expiry and eviction still apply. The pipeline validates only the segments this request actually replaced and rolls back to the pre-ccr snapshot (not the whole pre-pipeline body) when the mapping does not match.
- **Docs**: indirect reach is not proof of retrieval, historical hit rates are snapshots rather than universal client health, and a host whose `/mcp/run/ccr-retrieve` returns 404 is best served by setting ccr-retrieve to direct (stdio) in the Library; whether each client is repaired has to be verified independently, not inferred from the code-side fix.

## 0.5.2 — 2026-11-11

- **lite**: trim trailing spaces before CR, CRLF and Unicode line separators as well as LF. Keep the original fold-then-trim order, whitespace-only messages and long-space linear-time behavior. Added regression cases and rebuilt the lab bundle.

## 0.5.1 — 2026-11-11

- **Diff viewer**: deleting or adding repeated lines, or changing line order, no longer reports identical text. Both page entry points locate the first change even beyond the initial 40-line window, with Chinese and English explanations.
- **Accessibility**: Space and Enter on a strategy switch keep the button's native activation instead of expanding the parent row. Keyboard expansion of the row itself still works.
- **Packaging**: include the CCR persistence module, file-lock helper and retrieve MCP server; exclude the machine-generated CCR installation status script.
- **Tests**: add page interaction regressions and package checks for runtime imports and generated-file exclusions, including a seeded package fixture.
- **Documentation**: correct strategy/panel metadata and describe the current language default and published statistics.

## 0.5.0 — 2026-11-06

- **Documentation**: every Markdown document in the repository now has an English counterpart, with a language link at the top of each file. The English README was resynchronized with the Chinese one.
- **UI**: the page, settings panel and usage panel follow the browser language (`zh` / `en`); a header `EN` / `中文` switch changes language in place and remembers the choice. Strategy descriptions, parameter labels, the lab and the diff dialog are translated.
- **lite**: `compressToolResults` now also truncates array-shaped tool content part by part. The switch remains lossy and off by default; string and Anthropic `tool_result` behavior is unchanged.
- **CCR scope**: the panel documents that tool-output compression is intentionally excluded from CCR because replacing tool output with retrieval markers can break the agent tool loop.
- **Docs fixes**: corrected `capture`'s installed default, `read-lifecycle` priority, the Safe preset membership, and suite-count wording.
- **Tests**: added `page-i18n`; the full suite now passes under both Node and Bun.

## 0.4.0

- Baseline before the bilingual UI and documentation pass.