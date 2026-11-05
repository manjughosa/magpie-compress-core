# Changelog

## 0.5.0 — 2026-11-06

- **Documentation**: every Markdown document in the repository now has an English counterpart, with a language link at the top of each file. The English README was resynchronized with the Chinese one.
- **UI**: the page, settings panel and usage panel follow the browser language (`zh` / `en`); a header `EN` / `中文` switch changes language in place and remembers the choice. Strategy descriptions, parameter labels, the lab and the diff dialog are translated.
- **lite**: `compressToolResults` now also truncates array-shaped tool content part by part. The switch remains lossy and off by default; string and Anthropic `tool_result` behavior is unchanged.
- **CCR scope**: the panel documents that tool-output compression is intentionally excluded from CCR because replacing tool output with retrieval markers can break the agent tool loop.
- **Docs fixes**: corrected `capture`'s installed default, `read-lifecycle` priority, the Safe preset membership, and suite-count wording.
- **Tests**: added `page-i18n`; the full suite now passes with 36 suites under both Node and Bun.

## 0.4.0

- Baseline before the bilingual UI and documentation pass.