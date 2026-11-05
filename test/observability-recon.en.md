[中文](./observability-recon.md) | English

# magpie-compress-core observability: runtime capability reconnaissance

Recon date: 2026-10-26. Subjects: the locally installed magpie executable, the installed plugin sources, and the magpie Chinese plugin documentation.

## 1. The moejs middleware

Evidence: `@magpie-community/middleware-model-map/model-map.middleware.js`, `magpie-retry/retry.middleware.js`.

- The entry points are ESM named exports `onRequest(body, ctx)` / `onEvent(event, ctx)` / `onResponse(reply, ctx)`.
- `ctx` provides at least `protocol`, `model`, `agent`, `session`, `options`, `state`.
- `ctx.state` is **within-request** shared state and can carry data between the three hooks.
- `onResponse` receives the response status and the response object; `onEvent` can read `event.data`. It is not a mirror of the provider's raw outbound HTTP body.
- Module-level variables survive across requests, but the host may reuse several runtimes, each keeping its own books; so it is not a reliable centralised telemetry store.
- `onRequest` / `onResponse` each get 250ms, `onEvent` 50ms; errors and timeouts pass the request through untouched.
- moejs has no Node API, no npm, no network/timers; it cannot write JSONL to disk or start an HTTP server.
- `magpie-retry` receives its settings through `ctx.options`; after a change it hot-reloads in about a second. Only editing the source requires reloading the plugin.

Conclusion: **the middleware fits request compression and within-request auditing, not a persisted data plane for a dashboard.**

## 2. Page sandbox and native slots

Evidence: `@magpie-community/page-usage`'s `package.json`, `usage.html`; the `magpie-retry` panel; the official page plugin docs; front-end strings embedded in the exe.

- `magpie.page` supports `file/title/titles/icon/replaces`; `replaces` replaces a built-in page and is **disabled for this task**. An early experiment was reverted, the old instance was `plugin off`ed, and the original "Usage / Masking" pages resumed control.
- The final requirement is only a standalone "Compress" entry, adjacent in the same group as the existing "Usage / Masking"; do not copy, rewrite or replace those two pages, and do not add a usage/masking slot of our own.
- The documented panel slots are `agents/usage/settings/provider`; `slot=usage` is only a card at the end of the usage overview, not a neighbouring slot. Public pages land in the Plugins group by default, and `replaces` replaces rather than inserts. The current public API cannot satisfy the exact position.
- The operator explicitly authorised adding a generic "mount a plugin page after a named slot" capability to the local magpie shell. The implementation may only add a standalone navigation mount point; it must not modify the usage/masking page implementations.
- The page bridge provides `magpie.ready/theme/options.get/options.set/read/onAction/context`.
- Public `magpie.read` allows only `usage:summary` and `providers:list`; there is no plugin-owned file read and no JSONL permission.
- The CSP is `sandbox="allow-scripts"` with `connect-src 'none'`; scripts must be files. Fetching local JSONL cannot be the page's data channel.

Conclusion: **page data travels only through the redacted snapshots in `magpie.options`. Raw requests and redacted samples never go into options.**

## 3. Usable telemetry channels

The documentation's "async gateway request hooks" confirm:

- `magpie.hooks` points at a Bun module; `onRequest(body, ctx)` runs before moejs, once per request.
- `onResponse(reply, ctx)` is notified on a best-effort basis after output completes.
- `ctx` carries `protocol/model/stream/path/agent/session/cwd/query/options/signal`; plus a restricted `ctx.report`.
- Bun hooks have host capabilities and may use local files and loopback networking; the default is 1 second, adjustable through `gatewayTimeoutMs`.
- On hook failure, timeout, or no return, the original request is preserved.

Adopted: **the Bun companion hook runs the same compression pipeline and writes local JSONL; a read-only detail service bound to 127.0.0.1 only is started alongside.** The page reads the local detail through an iframe under same-origin restriction, and the parent page passes only its own configuration. No request snapshots are written into magpie options. moejs drops the companion hook's internal marker; if the companion hook fails, the middleware still runs the original compression pipeline.

Security boundaries:

- By default only numbers, strategy reason codes, model/agent identifiers, latency and error types are kept.
- before/after samples are off by default; once the user explicitly turns them on, only length-capped redacted fragments are kept — they cannot serve as a complete session archive.
- The local detail service binds to 127.0.0.1 only; it accepts only null/loopback Origins, has no write endpoints, contains no original text by default, and sets no third-party CORS.
- Telemetry and samples are not written into page options and never enter provider requests. The iframe approach is isolated from the built-in pages and needs on-device verification.

## 4. Ground truth and reconciliation

- Create an OpenAI-compatible provider used only for testing, with its URL pointing at a 127.0.0.1 echo service.
- The echo service captures the **final body the gateway actually sends**, instead of inferring the compression effect speculatively at the agent entry.
- The telemetry before/after byte counts are reconciled against the echo's outbound body; the `input_tokens` from usage come from provider/gateway accounting and are independent second-order evidence.
- Lossless headroom is spot-checked with the decode(encode(x)) identity; session-dedup is verified by restoring refs through the request's sha→original map.
- The reconciliation and a fresh install after a final `magpie plugin rm` were both actually run; static reading was never substituted for execution.

## 5. What static reconnaissance has not proven

- The size/write-frequency limits of the page options snapshot; keep it a small summary and verify on a real device.
- The actual protocol conversion and HTTP statuses of the custom echo provider need live testing.
- Providers use different tokenizers, so this plugin's `chars/4` may only be labelled an **estimated token count**, never presented as provider usage.
