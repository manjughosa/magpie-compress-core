[中文](./README.md) | English

# compress-core

Context compression for the magpie gateway. It rewrites `messages` before a request leaves this machine — dropping what repeats, what is noise, what is only formatting — and hands the rest upstream unchanged.

This is a full port of OmniRoute's compression strategies: same ids, names, priorities and lossy flags. Whatever could be carried over was; whatever could not is marked with the reason in the table below.

## Install

```bash
magpie plugin add @magpie-community/middleware-compress-core   # from the registry
magpie plugin add <this directory>                            # from a local directory
magpie plugin add github:magpie-community/plugins             # from the repo (packages/compress-core)
```

Afterwards `magpie plugin list` should show this plugin declaring `middleware`, `hooks`, `page` and two `panels`.

## Strategies

Run in ascending `stackPriority`. Each one switches and tunes on its own.

| id | name | priority | lossy | state | what it does |
| --- | --- | --- | --- | --- | --- |
| `read-lifecycle` | Read Lifecycle | 2 | yes | ported | Folds file reads that a later Read/Write has superseded into a short stub. |
| `session-dedup` | Session Dedup | 3 | no | ported | Text already sent earlier in this session becomes `[dedup:ref sha=…]`; the original is recoverable from the map. |
| `ccr` | CCR | 4 | no | ported | Large repeated or contiguous blocks become content-addressed refs; the original stays searchable. |
| `lite` | Lite Cleanup | 5 | no | ported | Whitespace, repeated lines and formatting only — never wording. Fastest, always safe. |
| `rtk` | RTK Tool Output | 10 | yes | ported | Strips ANSI noise, progress bars and repeated rows; keeps errors, warnings and summaries. |
| `codex-responses` | Codex Tool Output | 12 | yes | ported | Conservative trimming of shell / patch / search / build output on the Responses API. |
| `headroom` | Headroom (GCF) | 15 | no | upgraded | Tabular JSON becomes columnar; repeated constant columns are declared once, restorable from the GCF payload. |
| `leanctx-structured` | LeanCTX Structured | 17 | yes | opt-in | CSV/TSV/YAML tool output compaction; constant values appear once, optional high-entropy column dropping, default off. |
| `relevance` | Relevance | 18 | yes | ported | Scores sentences against the last user message and drops the low ones; numbers, URLs, errors, code and stack lines are never dropped. |
| `caveman` | Caveman | 20 | yes | ported | Rule-based prose compression, rule packs for 11 languages. |
| `aggressive` | Aggressive | 30 | yes | ported | Summarise and age older turns. |
| `llmlingua` | LLMLingua-2 | 35 | yes | unavailable | Needs an ONNX model and worker threads; cannot run inside the plugin host. |
| `ultra` | Ultra | 40 | yes | ported | Heuristic token-level pruning, the most aggressive purely local option. |
| `ionizer` | Ionizer | 50 | yes | ported | Sampling-based compression, deliberately lossy. |
| `llm` | LLM Compressor | 60 | yes | optional backend | The trusted Bun host can use the existing gateway; no model configured means no-op, default off. |
| `omniglyph` | OmniGlyph | 90 | yes | unavailable | Needs the omniglyph package plus a provider that accepts inline images. |

LLMLingua-2 and OmniGlyph remain unavailable with their missing requirements shown on the panel. LLM Compressor is an optional backend: without a model it does nothing and sends no request.

The default set is lossless strategies plus RTK / Codex Tool Output / Read Lifecycle — that is `ccr`, `lite`, `headroom`, `rtk`, `codex-responses`, `read-lifecycle` on, everything else off (`session-dedup` included). Read Lifecycle folds only old reads superseded by a later Read or Write of the same path, leaving a one-line marker; it changes history prefixes, so disable it separately if caching matters more. Do not combine RTK with Magpie's official RTK. Relevance, Caveman, Aggressive, Ultra and Ionizer remain individually selectable rather than stacked globally.

For the optional LLM backend set options such as `"llm": {"enabled": true, "model": "group/deepseek-v4.1-flash", "timeoutMs": 12000}`. Only the trusted Bun host calls it, using local `http://127.0.0.1:3425/v1` by default; the synchronous moejs fallback never waits for it.

## ccr and retrieve: where the compressed text goes

ccr is the "replace a large block with a tag" strategy. What makes it different from the other strategies: **not one byte of the original is deleted — it is moved.**

The workflow:

1. **At compression time**: when the request carries a long enough block of text (600 characters or more by default), ccr swaps the whole block for one line:
   `[CCR retrieve hash=955dac5846d17f19c5811f24 chars=1641]`. The original text is stored, keyed by that hash, in `ccr-store.json` inside the plugin's data directory. The request shrinks on the spot.
2. **When the model reads the tag**: it sees a placeholder, not the text. When it needs the original, it calls the `omniroute_ccr_retrieve` tool and hands over the hash.
3. **The retrieve tool**: a small local MCP server (`mcp/ccr-retrieve-server.mjs`, zero dependencies) looks the hash up in the store and returns the original byte for byte. Six read modes are supported — `full` (the whole text, capped at 256KiB), `head` / `tail` (first/last N lines), `lines` (a line range), `grep` (regex filter), `stats` (metadata) — so the model can fetch only the part it wants.

**Why retrieve is a separate install**: before ccr touches anything it checks the calling agent's tool list for `omniroute_ccr_retrieve`. If it is not there, ccr does not compress and the body passes through untouched (telemetry shows `no_retrieve_tool`) — compressing without a way to retrieve would be losing the content for real. The gate would rather do nothing than lose something, so **with the retrieve tool not installed, ccr hits nothing, ever; that is designed behaviour, not a fault.**

Install it once, either way:

- the "install retrieve" button in the panel's preset area;
- or the command line: `magpie library mcp add ccr-retrieve node <plugin directory>/mcp/ccr-retrieve-server.mjs`

From the first request after installation, ccr starts hitting for real. Installing also assigns the tool to agents: by default the agents in the library that already receive library MCP servers; to name them yourself, add `"ccrAgents": "pi,opencode"` (comma-separated agent ids) to the plugin options and press the button. You can adjust the assignment at any time with `magpie library mcp agents ccr-retrieve <a,b…>`. Re-installing is idempotent — an existing server with the same name counts as success, the button does not error out because "it is already installed".

The store is a local file: entries expire after 24 hours by default, capacity is capped (2MB per block / 64MB globally), and once the caps are hit the least recently used entries are evicted; the more often a given block gets retrieved, the less inclined ccr is to compress it again (an anti-ping-pong ramp). The tag line the model reads keeps the first 200 characters of the original in front of it, so it can judge whether to fetch the rest.

Technical details (store format, ramp, gate rules, differences from upstream OmniRoute) are in [`docs/ccr-retrieval-chain.en.md`](docs/ccr-retrieval-chain.en.md).

## The four presets

| preset | meaning |
| --- | --- |
| Off | everything off. |
| Safe | OmniRoute's "safe default": every strategy that is **available and does not delete original text** is on, the rest are off — that is `session-dedup`, `ccr`, `lite`, `headroom`. Here "lossless" means the original is still there or recoverable, not "not a byte moves". |
| Custom | whatever you clicked your way to. Touching any switch lands you here. |
| All | every available strategy on (the unavailable ones still cannot be turned on). |

"Custom" is a state, not a button — clicking it does nothing, which is why it is greyed out.

## Caching and prefixes

Providers match prompt cache by **request prefix**: one byte changing inside the prefix makes everything after it bill as uncached input.

lite rewrites everything by default, which makes the prefix strictly stable: every message goes through the same deterministic transform from its first turn (whitespace folding is idempotent), so a message that has been sent renders byte-identically forever and the cache never misses. The price is that the turn being sent right now is folded and deduped too — what the user just typed included.

Set `preserveCurrentTurn` to `true` for the conservative mode: everything after the last assistant message (or the whole body when there is none) is sent as it arrived, and gets rewritten exactly once — in the request where it stops being the current turn — missing the cache that once and stable after that.

`session-dedup` reads the same switch: by default it treats the turn being sent like any other, and only an explicit `preserveCurrentTurn: true` protects it. Same reason — protecting just that turn means the message is rewritten once in the next request, and the prefix moves with it.

`test/prefix-stability.test.mjs` is the acceptance test for this: the transcript grows turn by turn and the prefix sent in each round must be byte-identical to the previous round — checked for the default preset, the safe preset, and every lossless engine on its own.

`preserve.lastTurns` defaults to `0` (no extra protection). Setting it to N keeps the newest N turns out of every rewrite; the turn rewrites itself once when it slides out of that window — that comes from the window, not from lite.

`preserve.system` defaults to `false`. Turning it on protects the whole system segment behind a placeholder for the length of the run, and the price is that the step which depends on the system text (say, "the same system prompt written twice keeps one copy") goes dead — the previous version defaulted it to `true`, which made that step a piece of dead configuration. Write `true` explicitly if the system segment must not move at all.

`compressToolResults` defaults to `false`, so tool results in the history are not cut. Cutting a tool result asks the model to read a thing it was never told had been cut, and it rewrites a message the model has already read by length, so the prefix moves with it. Write `compressToolResults: true` for the old behaviour (`maxToolLength` is still parsed, and anything under 2000 falls back to 2000).

## Oversized bodies

`maxBytes` defaults to `8000000`: **a body bigger than that runs no engine at all and goes out as it arrived**, recorded in telemetry as `tooLarge` with `body_too_large`. The hook has 250 ms, and a 20 MB body costs around 70 ms in `JSON.stringify` alone before any engine has looked at it — that size cannot fit the budget on any machine. Skipping by size rather than by clock is what keeps the decision deterministic: the same body always gets the same answer, so the prefix it contributes to the provider's prompt cache never moves. The decision does not count bytes exactly: it counts text length first (O(n), no allocation, and always a lower bound on the real byte count); a lower bound already over the line ends the decision, one far below it passes, and only the narrow band between the two pays for an exact count.

`budgetMs` defaults to `0`, meaning no strategy is skipped on time. Give it a positive value and the pipeline stops the remaining strategies once it expires — but the same request can then compress two different ways under load, and a body that changed is a body the prompt cache can never reuse, so there is no time budget by default. Engines carry no deadline of their own either (`session-dedup`'s `timeBudgetMs` defaults to `0` as well).

## The page

Sidebar → Plugins group → Compress. One compression meter, the preset, one row per strategy, and the last eight requests.

The UI follows the browser language automatically (`zh` or `en`); the `EN` / `中文` button beside the title switches at any time and remembers the choice. Strategy descriptions, parameter labels, the lab and the diff dialog follow it. Documentation is paired too, with a language link at the top of each file.

Each row shows order, name, lossless/lossy, a one-line description, bytes saved and the switch; clicking it expands the full description, hits/saved/share, execution order, cache impact, what it reads, and that strategy's own parameters (number boxes, selects, checkbox groups).

## The settings panel

Settings → Plugins. The same preset and strategy rows as the page, in a compact form.

## The usage panel

Usage → the end of Overview. The compression meter plus the last four requests.

All three surfaces share the computation in `page/view.js` and the styles in `page/style.css`; every colour comes from magpie's own `--magpie-*` variables, so both themes follow along.

One known behaviour: this plugin ships both `middleware` and `hooks`, so saving options from the UI makes magpie restart the hooks host (under a second). Requests pass through untouched during that window, and compression resumes after it. A page-only plugin does not pay this cost.

Another trap: `magpie.options.set` **replaces the whole options object**, it does not deep-merge. Every save from the UI must submit the complete options (including the `stats` the hooks write); submitting only the changed fields wipes `strategies` and `preserve` along with them. `save()` in `app.js` / `panel.js` already writes the whole object.

## Where the numbers come from

The hooks write cumulative stats to `stats.json` in the plugin's config folder, next to `requests.jsonl` and `captures/`. They never write magpie's own `plugins.json`: magpie watches that file's mtime and restarts the hooks host on every change — one restart per compressed request, far more cost than the numbers are worth.

The sandbox magpie gives the page and panels is `connect-src 'none'` with no filesystem, and `magpie.options` is the only thing they can read. So the page cannot read `stats.json`: the meter says which file the numbers live in, and no live figures are shown in the UI.

Writes are deliberately timid:

- write `.tmp`, then rename; failures stay silent;
- at most once every 30 seconds (the first request writes at once);
- refuse to parse anything read back above 4MB, so a corrupt file cannot stall a request;
- with `COMPRESS_CORE_NO_STATS=1` nothing touches the disk at all (used by the tests).

Compression does not depend on any of it: if the file cannot be written, compression still runs.

## Session records

The hooks can keep a snapshot of **every** request that goes through the gateway. The factory default in `package.json` ships `capture: true`, so the installed plugin records by default; the code records only when `options.capture === true`, so options constructed by hand without that key record nothing — an explicit `false` turns it off. Snapshots land in `captures/` inside the plugin's config folder, indexed in `captures-index.json`, newest 50 kept, each capped at 2MB.

The page's CSP is `connect-src 'none'` and it may load only the plugin's own `page/` folder, so the numbers and the list are published by the hooks as two scripts inside that shipped `page/` directory (written by `page-publish.js`, not the plugin data directory), loaded with `<script src>`: `captures-index.js` (the session list: id, time, `agent`, model, byte counts) and `compress-stats.js` (the top-level stats and each strategy's savings). The conversation text stays in `captures/` and never enters the installed package. The `agent` on each row (`dsh`, `pi`, …) says which harness sent the request.

The page re-fetches the two published scripts and `magpie.options` every 5 seconds and repaints on change — no manual refresh.

## Privacy

Files are written only inside the plugin's own folder (`MAGPIE_CONFIG_DIR` first, then `XDG_CONFIG_HOME/magpie`, defaulting to `compress-core/` under `~/.config/magpie`; `COMPRESS_CORE_DATA_DIR` moves the whole thing):

- `requests.jsonl`: one stats line per request (raw/compressed bytes, strategy that hit, model, client), **no bodies**. With `telemetry.samples` on, up to 8 question/answer pairs of 1600 characters each are stored too, after the redaction below.
- `captures/`: only when `capture` is on; full request bodies, 2MB per entry (an oversized one is not written at all and is marked `too_large` in the index), newest 50 kept.
- `captures-index.json`: the index, no bodies.

Redaction lives in `SECRET_RULES` in `telemetry-store.js` and is shared by snapshots and samples: whole private-key blocks, `ghp_`/`github_pat_`/`AKIA`/`AIza`/`sk-`/`xox?-` tokens, `eyJ…` JWTs, `Bearer …`, and the values of `authorization`, `api_key`, `password`, `client_secret` and similar fields all become `[redacted:…]`. E-mail addresses and paths like `C:\Users\<name>` are replaced in samples only — a snapshot has to keep the code text readable. Field names stay, values go, so you can still see what a request carried.

Neither switch touches the code being compressed — they exist to answer "what did compression do to this text". If a conversation holds something that must not reach the disk, leave `capture` and `telemetry.samples` off.

To clear: "clear snapshots" in the UI makes the hooks delete both folders and reset the index; `requests.jsonl` is simply deleted and rebuilt on the next request. `ccr-store.json` is deleted the same way — the price is that markers whose original text was replaced cannot be retrieved for a while (the model will find the tag unfetchable; the bodies would have expired after 24 hours anyway).

## The lab

The lab answers "what did this strategy do to this text", so it **does not apply `preserve`**: its input is a single user message, and with `preserve` on that message always falls inside the "newest N turns" window, where every strategy only sees placeholders and every strategy reports "no difference".

Two input shapes: **plain text** is treated as one user message; **request body JSON** pastes a real body, which is the only way to exercise `rtk` (tool output), `session-dedup` (repeated blocks) and `headroom` (JSON arrays) — the strategies that need structure.

When nothing hits, the panel says why (in Chinese), instead of leaving "identical before and after" to be guessed at.

## Licence and provenance

MIT (`LICENSE`, which keeps OmniRoute's copyright line). Every engine is a port of OmniRoute's `open-sse/services/compression`; the repository each one came from, the corresponding file, and a sha256 of the ported copy are in `PROVENANCE.json`.

The Apache-2.0 upstreams reached through OmniRoute: `caveman` (github.com/JuliusBrussee/caveman), `headroom` (github.com/headroomlabs-ai/headroom, including the GCF columnar codec under `engines/gcf/`) and `rtk` (github.com/rtk-ai/rtk). Their licence text is in `LICENSES/Apache-2.0.txt` and the attribution is in `NOTICE`.

## Development

```bash
node test/run.mjs                 # all suites (the list is test/suites.mjs)
node test/run.mjs lite            # one suite: the argument is the suite name (the name in each suite file; e.g. `lite`, `gateway cases (cases.json)`)
bun test                          # the same entry point the way CI runs it
node scripts/gen-page-catalog.mjs # regenerate page/engines.js after editing catalog.js
npm run build:page                # re-bundle page/lab-engine.bundle.js after editing lab.js / engines
node test/live-probe.mjs          # one shot against a real magpie
```

`catalog.js` is the single source of truth for strategy metadata; `page/engines.js` mirrors it (the page is a plain `<script>` inside a sandbox and cannot import ES modules), so editing the catalog means regenerating it.

`page/lab-engine.bundle.js` is a build artifact too: entry point `page/lab-engine.js`, importing `lab.js` and `catalog.js`, bundled to an IIFE by esbuild. esbuild is not a dependency of this package — run `npm run build:page` by hand only after changing those sources and commit the artifact, so nobody installing the plugin needs a build environment. Do not hand-edit either artifact; the next generation discards it.

If a panel button does nothing, or you are about to change how the page renders, read [`DEBUGGING.en.md`](DEBUGGING.en.md) first: it records the rendering contract, how session snapshots are fetched, and why "looks like a sandbox problem" usually is not one.

`test/lite-spec.en.md` and `test/session-dedup-spec.en.md` are the behaviour contracts for those two strategies; read them before touching the engines.

`cases.json` is the outward contract: of its 23 cases, 21 are copied verbatim from the history-trim implementation merged into magpie-community/plugins (#423) and 2 record this package's own default-preset behaviour (the turn being sent is rewritten too; a tabular tool result becomes a `gcf-generic` block). It answers one concrete question — after a body goes through this middleware, is it exactly the body that implementation leaves? A difference is a semantic fork: either fix it here or argue for it there. Those 21 cases ask for the conservative mode explicitly (`preserveCurrentTurn: true`), because "send the turn being sent as it arrived" is what history-trim did, and this middleware rewrites everything by default. In the magpie repo it runs as `bun scripts/check.mjs`; the equivalent entry point here is `node test/run.mjs "gateway cases (cases.json)"`.

## Uninstall

```bash
magpie plugin rm compress-core
```

Telemetry under `~/.config/magpie/compress-core/` (`requests.jsonl`) is not deleted automatically.
