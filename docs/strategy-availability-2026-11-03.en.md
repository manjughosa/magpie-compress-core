[中文](./strategy-availability-2026-11-03.md) | English

# Strategy Availability Hardening · 2026-11-03

## Completed

- Fixed Lite protecting the current turn by default under Responses, which was
  inconsistent with the default behavior on other protocols; explicit
  `preserveCurrentTurn: true` still preserves the protective behavior.
- CCR directives now support Responses `instructions` and Gemini `systemInstruction`;
  sentinel checks cover Responses; the original block cap, TTL, scope isolation, and the
  retrieve gate are all retained.
- CCR / session-dedup recognize the Codex MCP `server_label: ccr-retrieve` as well as
  real tool names with a single-underscore namespace, and do not treat just any similar
  tool name as retrieve.
- Read Lifecycle supports `multi_edit`; RTK explicitly skips Responses/Gemini, and
  tool-output-to-image is left to the Codex-specific engines for Responses and Gemini.
- RTK, Codex Tool Output, and Read Lifecycle are enabled consistently across the code's
  default config, the install manifest, the actual Magpie config, and page override
  config; backups of old configs are kept in Magpie's own backup directory.
- LLM Compressor gained an optional chat-completion backend for a trusted Bun host:
  off by default, no request made when no model is configured; the default synchronous
  moejs path stays synchronous. The real gateway backend was tested live — qualified
  prose went from 9,349 to 4,370 chars.
- The CCR `minRepeat` default was unified to 1, eliminating the mismatch between the
  panel default and the implementation.

## Verification

- `node test/run.mjs`: full suite passes.
- `node scripts/gen-page-catalog.mjs` and `npm run build:page`: page metadata and the
  test bench were rebuilt.
- `magpie healthcheck`: exit code 0.
- Real gateway request: HTTP 200, telemetry confirmed rtk / codex-responses /
  read-lifecycle `enabled: true`, fail-open 0.
- Optional LLM backend: a real existing gateway call succeeded, hit end-to-end; the
  default config does not enable it.

## Not claimed as done

- `llmlingua` has no implementation yet; it needs a local ONNX model and acceptance
  testing with a real model. Registry lookups are currently blocked by the local
  `127.0.0.1:7890` proxy refusing connections, so no reliable model documentation was
  obtained and the API was not wired up on guesswork.
- `omniglyph` is a context-to-image proxy exclusive to Fable 5, not a general-purpose
  multi-platform text compression strategy. It needs standalone Fable routing,
  verbatim protection of critical identifiers, and accuracy acceptance testing; it
  cannot be turned on globally.
- Relevance / Caveman / Aggressive / Ultra / Ionizer remain explicit opt-in; they are
  lossy strategies, and "all on" is not the standard for completeness.
