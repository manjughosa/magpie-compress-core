# compress-core

Context compression for the magpie gateway. It rewrites `messages` before a request leaves this machine — dropping what repeats, what is noise, what is only formatting — and hands the rest upstream unchanged.

This is a full port of OmniRoute's compression strategies: same ids, names, priorities and lossy flags. Whatever could be carried over was; whatever could not is marked with the reason in the table below.

## Install

```bash
magpie plugin add <this directory>                       # from a local directory
magpie plugin add github:manjughosa/magpie-compress-core   # from GitHub
```

Afterwards `magpie plugin list` should show this plugin declaring `middleware`, `hooks`, `page` and two `panels`.

## Strategies

Run in ascending `stackPriority`. Each one switches and tunes on its own.

| id | name | priority | lossy | state | what it does |
| --- | --- | --- | --- | --- | --- |
| `session-dedup` | Session Dedup | 3 | no | ported | Text already sent earlier in this session becomes `[dedup:ref sha=…]`; the original is recoverable from the map. |
| `ccr` | CCR | 4 | no | ported | Large repeated or contiguous blocks become content-addressed refs; the original stays searchable. |
| `lite` | Lite Cleanup | 5 | no | ported | Whitespace, repeated lines and formatting only — never wording. Fastest, always safe. |
| `rtk` | RTK Tool Output | 10 | yes | ported | Strips ANSI noise, progress bars and repeated rows; keeps errors, warnings and summaries. |
| `codex-responses` | Codex Tool Output | 12 | yes | ported | Conservative trimming of shell / patch / search / build output on the Responses API. |
| `headroom` | Headroom (GCF) | 15 | no | ported | Tabular JSON becomes columnar, long rows fold to `[N rows]`, restorable from the GCF payload in a fenced block. |
| `relevance` | Relevance | 18 | yes | ported | Scores sentences against the last user message and drops the low ones; numbers, URLs, errors, code and stack lines are never dropped. |
| `caveman` | Caveman | 20 | yes | ported | Rule-based prose compression, rule packs for 11 languages. |
| `read-lifecycle` | Read Lifecycle | 22 | yes | ported | Folds file reads that a later Read/Write has superseded into a short stub. |
| `aggressive` | Aggressive | 30 | yes | ported | Summarise and age older turns. |
| `llmlingua` | LLMLingua-2 | 35 | yes | unavailable | Needs an ONNX model and worker threads; cannot run inside the plugin host. |
| `ultra` | Ultra | 40 | yes | ported | Heuristic token-level pruning, the most aggressive purely local option. |
| `ionizer` | Ionizer | 50 | yes | ported | Sampling-based compression, deliberately lossy. |
| `llm` | LLM Compressor | 60 | yes | unavailable | Needs an external chat-completion backend this plugin cannot provide. |
| `omniglyph` | OmniGlyph | 90 | yes | unavailable | Needs the omniglyph package plus a provider that accepts inline images. |

The three unavailable ones still appear in the panel, marked `unavailable` with the missing piece spelled out; their switches do not move.

## Presets

| preset | meaning |
| --- | --- |
| Off | everything off. |
| Safe | OmniRoute's "safe default": every strategy that is **lossless and available** is on, the rest are off — that is `session-dedup`, `ccr`, `lite`, `headroom`. |
| Custom | whatever you clicked your way to. Touching any switch lands you here. |
| All | every available strategy on (the unavailable ones still cannot be turned on). |

"Custom" is a state, not a button — clicking it does nothing, which is why it is greyed out.

## Caching and prefixes

Providers match prompt cache by **request prefix**: one byte changing inside the prefix makes everything after it bill as uncached input.

lite's rule is "move history, send the current turn as it arrived": everything after the last assistant message (or the whole body when there is none) is left alone. A message produces the same result every time it sits in history, so history never changes once written; the one cost is that the request where it stops being the current turn rewrites it once, misses there, and is stable again after that.

Set `preserveCurrentTurn` to `false` to never miss at all: every message goes through the same deterministic transform from its first turn, at the price of folding and cutting what the user just typed.

`preserve.lastTurns` defaults to `0` (no extra protection). Setting it to N keeps the newest N turns out of every rewrite; the turn rewrites itself once when it slides out of that window — that comes from the window, not from lite.

## The page

Sidebar → Plugins → Compress. One compression meter, the preset, one row per strategy, and the last eight requests.

Each row shows order, name, lossless/lossy, a one-line description, bytes saved and the switch; clicking it expands the full description, hits/saved/share, execution order, cache impact, what it reads, and that strategy's own parameters (number boxes, selects, checkbox groups).

## The settings panel

Settings → Plugins. The same preset and strategy rows as the page, in a compact form.

## The usage panel

Usage → the end of Overview. The compression meter plus the last four requests.

All three surfaces share the computation in `page/view.js` and the styles in `page/style.css`; every colour comes from magpie's own `--magpie-*` variables, so both themes follow along.

One known behaviour: this plugin ships both `middleware` and `hooks`, so saving options from the UI makes magpie restart the hooks host (under a second). Requests pass through untouched during that window, and compression resumes after it. A page-only plugin does not pay this cost.

Another trap: `magpie.options.set` **replaces the whole options object**, it does not deep-merge. Every save from the UI must submit the complete options; submitting only the changed fields wipes `strategies` and `preserve`. `save()` in `app.js` / `panel.js` already writes the whole object.

## Where the numbers come from

The hooks write cumulative stats to `stats.json` in the plugin's config folder, next to `requests.jsonl` and `captures/`. They never write magpie's own `plugins.json`: magpie watches that file's stamp and restarts the hooks host on every change, which would mean one restart per compressed request — far more cost than the numbers are worth.

The sandbox magpie gives the page and panels is `connect-src 'none'` with no filesystem, and `magpie.options` is the only thing they can read. So the page cannot read `stats.json`: the meter says which file the numbers live in, and no live figures are shown in the UI.

Writes are deliberately timid:

- write `.tmp`, then rename; failures stay silent;
- at most once every 30 seconds (the first compressed request writes at once);
- refuse to parse anything above 4MB, so a corrupt file cannot stall a request;
- with `COMPRESS_CORE_NO_STATS=1` nothing touches the disk at all (used by the tests).

Compression does not depend on any of it: if the file cannot be written, compression still runs.

## Session records

The hooks can keep a snapshot of **every** request that goes through the gateway, but `capture` is **off** by default and only writes once you turn it on. When on, snapshots land in `captures/` inside the plugin's config folder (indexed by `captures-index.json`), keeping the newest 50, each capped at 2MB.

Those files are unreadable from the page sandbox, so the "processed sessions" list in the UI no longer fills itself; open the files in `captures/` instead. The `agent` on each row (`dsh`, `pi`, …) says which harness sent the request.

The page re-reads `magpie.options` every 5 seconds and repaints on change — no manual refresh.

## Privacy

Files are written only inside the plugin's own folder (`MAGPIE_CONFIG_DIR` first, then `XDG_CONFIG_HOME/magpie`, defaulting to `compress-core/` under `~/.config/magpie`; `COMPRESS_CORE_DATA_DIR` moves the whole thing):

- `requests.jsonl`: one stats line per request (raw/compressed bytes, strategy that hit, model, client), **no bodies**. With `telemetry.samples` on, up to 8 question/answer pairs of 1600 characters each are stored too, after the redaction below.
- `captures/`: only when `capture` is on; full request bodies, 2MB per entry (an oversized one is skipped and marked `too_large` in the index), newest 50 kept.
- `captures-index.json`, `options-override.json`: index and local overrides, no bodies.

Redaction lives in `SECRET_RULES` in `telemetry-store.js` and is shared by snapshots and samples: whole private-key blocks, `ghp_`/`github_pat_`/`AKIA`/`AIza`/`sk-`/`xox?-` tokens, `eyJ…` JWTs, `Bearer …`, and the values of `authorization`, `api_key`, `password`, `client_secret` and similar become `[redacted:…]`. E-mail addresses and `C:\Users\…` paths are replaced in samples only — a snapshot has to keep the code readable. Field names stay, values go, so you can still see what a request carried.

Neither switch touches the code being compressed — they exist to answer "what did compression do to this text". If a conversation holds something that must not reach the disk, leave `capture` and `telemetry.samples` off.

To clear: "clear snapshots" in the UI deletes both folders and resets the index; `requests.jsonl` can simply be deleted and is recreated on the next request.

## The lab

The lab answers "what did this strategy do to this text", so it **ignores `preserve`**: its input is a single user message, and with `preserve` on that message always falls inside the "newest N turns" window, where every strategy only sees placeholders and every strategy reports "no difference".

Two input shapes: **plain text** is treated as one user message; **request body JSON** pastes a real body, which is the only way to exercise `rtk` (tool output), `session-dedup` (repeated blocks) and `headroom` (JSON arrays).

When nothing hits, the panel says why, rather than leaving "identical before and after" to be guessed at.

## Development

```bash
node test/run.mjs                 # every test
node test/run.mjs lite            # one suite
node scripts/gen-page-catalog.mjs # regenerate page/engines.js after editing catalog.js
npm run build:page                # re-bundle page/lab-engine.bundle.js after editing lab.js / engines
node test/live-probe.mjs          # one shot against a real magpie
```

`catalog.js` is the single source of truth for strategy metadata; `page/engines.js` mirrors it (`<script>` in a sandbox cannot import ES modules), so editing the catalog means regenerating it.

`page/lab-engine.bundle.js` is a build artifact too: entry point `page/lab-engine.js`, importing `lab.js` and `catalog.js`, bundled to an IIFE by esbuild. esbuild is not a dependency of this package — run `npm run build:page` by hand only after changing those sources and commit the artifact, so nobody installing the plugin needs a build environment. Do not hand-edit either artifact; the next generation overwrites it.

If a panel button does nothing, or you are about to change how the page renders, read `DEBUGGING.md` first: it records the rendering contract, how session snapshots are fetched, and why "looks like a sandbox problem" usually is not one.

`test/lite-spec.md` and `test/session-dedup-spec.md` are the behaviour contracts for those two strategies; read them before touching the engines.

`cases.json` is the outward contract: its 21 cases are copied verbatim from the history-trim package merged into magpie-community/plugins (#423). It answers one concrete question — after a body goes through this middleware, is it exactly the body that implementation leaves? A difference is a semantic fork: either fix it here or argue for it there. In the magpie repo it runs as `bun scripts/check.mjs`; the local equivalent is `node test/run.mjs gateway`.

## Uninstall

```bash
magpie plugin rm compress-core
```

Telemetry under `~/.config/magpie/compress-core/` (`requests.jsonl`) is not deleted automatically.
