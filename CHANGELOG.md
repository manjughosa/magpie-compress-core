# Changelog

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