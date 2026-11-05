[中文](./DEBUGGING.md) | English

# When the panel stops responding, start here

This record covers the UI interaction breakage just before 0.4.0: **every button in the
magpie settings panel stopped responding** — presets wouldn't click, the gear and flask
couldn't switch views, and strategy toggles wouldn't budge.

Conclusion first: it had nothing to do with the iframe sandbox. A rendering function
threw an exception, `init()` broke off halfway, and the button listeners were never
attached at all.

## Where the investigation went down blind alleys

The symptoms easily point suspicion at the sandbox. None of the following **were** the
cause:

- CSP with `sandbox="allow-scripts"` plus `connect-src 'none'`: the page genuinely has no
  network access, but clicks, `hidden`, and `style.display` are all unaffected.
- The view-switching style (only `hidden`, only `display`, or both written): all three
  were tried, none worked — because execution never got that far.
- Script load order, `node --check` syntax checks, whether the HTML was cached by the
  browser: all checked, all clean.
- Also, don't rely on `console.log` inside the iframe for clues: the devtools of the
  magpie main window do not show output from plugin iframes; the logs vanish silently.

## The actual cause

`paint()` was written against an assumed interface, and magpie threw the moment it
mounted:

- It iterated `V.engines()` as a map/object when it is actually an array;
- It called `U.row` / `U.box`, which do not exist in `page/ui.js`;
- It read fields that do not exist in the TEXT of `page/view.js` (e.g. `T.status`).

The first line threw a `TypeError`. Since `init()` runs "render first, bind events
after", the exception broke `init()` at the render step, and bindings like
`bindViewButtons()` never executed even once — so the entire panel died. The symptom is
indistinguishable from "the sandbox blocking clicks", which is exactly why the
investigation got pulled off course.

Fix: wrap every rendering function in `safePaint()` so a single blown block no longer
takes down the whole pass; then rewrite all rendering strictly against the real
contracts of `page/view.js` / `page/ui.js`.

## Contracts (stop guessing)

- `page/view.js:293` `cards(strategies, stats, lang)` → returns an array of cards, each
  item `{id, label, why, description, badge, tone, available, requires, on, rule}`.
- `page/ui.js:6` `el(tag, cls, text)`, `page/ui.js:13` `clear(host)`, `page/ui.js:21`
  `switchButton(on, disabled, onChange, label)`, `page/ui.js:37` `meter(host, m, T)`,
  `rows(host, cards, ctx)`, where `ctx = {T, open, config, onToggle, onSwitch, onField}`.
- The session index is **not** in `options.stats.captures[]`: `stats-writer.js` no longer
  writes `plugins.json`, so that field is a frozen stale value. The index is published by
  the hooks as `page/captures-index.js` in the page's own directory; the page loads it
  with `<script src="captures-index.js?t=…">` and reads
  `globalThis.__COMPRESS_CAPTURES_INDEX__`, with fields
  `{id, at, agent, protocol, model, before, after, saved, summary}`. **The old
  `cap.ts` / `cap.strategy` / `rate` / `beforeText` do not exist**; writing against them
  just renders `Invalid Date … NaN MB → NaN MB NaN%`.
- `capture` is **on** by default in the installed plugin: the factory value lives in
  `package.json` under `magpie.options.capture` (`true`). The code only accepts
  `options.capture === true`, so when constructing options yourself, omitting this key
  means nothing gets recorded. When on, every request passing through the gateway leaves
  one entry, capped at the latest 50. If it were ever defaulted off, the session list
  would only have content for the period when the switch was manually turned on — which
  looks like "permanently stuck on old, local-harness-only sessions".
- `page/captures-index.js` only carries index metadata; not a single conversation
  original goes into it (that's why review rejected the previous version). Originals
  live only in `<config>/magpie/compress-core/captures/<id>.json`, unreadable by the
  page; the dialog shows only the summary and the file location.
- That script is a generated artifact and is not shipped with the package (it is in
  `.gitignore`); after a plugin update the host re-publishes it on the next request
  (`refreshCapturesIndex()`, once per process).
- `report.strategies[]` items are `{id, label, available, enabled, status, reason,
  beforeBytes, afterBytes, ms, savedBytes}`.
- The page's only data channel inside the sandbox is `magpie.options`, and `set` is a
  **whole-bundle replacement**: saving must submit the complete options (including the
  `stats` written by the hooks); submitting only changed fields will wipe `strategies`
  and `preserve` along with everything else.

## How to re-verify

```bash
node test/run.mjs          # full engine and hooks suites
node test/live-probe.mjs   # one live shot against a real magpie
```

The UI itself is not in `test/run.mjs` (that suite only runs engines and hooks). To do
interaction regression for the panel, use a minimal DOM plus `vm` to load
`page/engines.js` + `view.js` + `ui.js` + `panel.js` (or `app.js`) and a `magpie` stub;
assert the button count, the write-back after clicks, and view switching; note that
saving goes through an 1100ms throttle window, so assertions must span past it.

To watch a real instance, once magpie's remote debugging port is open, attach over CDP
to the `settings.html` iframe target: `Runtime.consoleAPICalled` /
`Runtime.exceptionThrown` receive exceptions thrown inside, `Runtime.evaluate` can read
the `hidden` state and geometry of `#viewMain` / `#viewCustom`, and after changes a
`location.reload()` suffices. Note that iframe targets do not support `Page.reload`.
