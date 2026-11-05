[中文](./CONTRACT.md) | English

# Engine Porting Contract (all engine modules must comply)

Goal: port OmniRoute's compression engines one by one into pure JS modules running in
magpie's moejs gateway middleware.

## Runtime iron rules (moejs)

- Standard JS, **no** Node APIs: no node:fs / node:crypto / node:path or any other host
  capability.
- **No fetch, no setTimeout/setInterval, no workers, no WASM, no npm dependencies.**
- **Relative-path imports only** (./x.js, ../hash.js). Cannot import "zod" or the like.
- Total budget per onRequest is **250ms**. A single engine should finish in single-digit
  milliseconds; on very large inputs, give up early rather than grind through.
- Must **fail-open**: any exception must make apply return false and never propagate
  upward. The upstream body must pass through untouched.

## Module export contract

One file per engine (or one directory + index.js), exporting these **named
constants/functions**:

```js
export const id = "relevance"          // OmniRoute original id, verbatim (hyphenated, not camelCase)
export const label = "Relevance"       // the name in OmniRoute's engineCatalog
export const why = "..."               // one-line explanation, for panel cards
export const lossy = true              // engineCatalog's lossy
export const cacheImpact = "moderate"  // "none" | "low" | "moderate" | "high"
export const defaultOn = false         // whether the safe tier defaults on = !lossy
export const stackPriority = 18        // engineCatalog's stackPriority
export const isSingleMode = false      // engineCatalog's isSingleMode
export const levels = undefined        // array when strength levels exist, e.g. ["minimal","standard","aggressive"]
export const available = true          // false when dependencies are missing (ONNX/npm packages)
export const configSchema = []         // EngineConfigField[], see below

export function apply(body, ctx, cfg) {
  // body: the request body object (modified in place)
  // ctx:  { protocol, model, agent, session, state, options }
  // cfg:  this engine's config object (defaults already merged)
  // Return true if body was actually changed; false if untouched.
}
```

Each `configSchema` item:

```js
{ key: "minRows", type: "number", label: "最小行数", description: "...",
  defaultValue: 8, min: 2, max: 200 }
// type: "boolean" | "number" | "string" | "select" | "multiselect"
// select/multiselect require options: [{ value, label }]
```

## Protocol handling

Do not write your own four-protocol traversal. Use conversationView(body, ctx.protocol)
from ../adapter.js:

```js
import { conversationView } from "../adapter.js"
const view = conversationView(body, ctx.protocol)
// view.segments: [{ text, role, kind, set(text) }]  -- set writes new text back into body at the original position
```

See engines/lite.js and engines/headroom.js for usage.

## Do not modify

pipeline.js, catalog.js, page/*, package.json, README.md, adapter.js, hash.js,
stats-writer.js, telemetry-store.js, observability.hooks.js, compress-core.middleware.js
— these are maintained by the lead. You only write the engine file you are responsible
for.

## Delivery requirements

1. `node --check <file>` passes.
2. Write your own test/<id>.test.mjs (using node:assert; follow the format of existing
   tests) covering at least: it changes the body when there is something to change,
   returns false when there is nothing to change, and does not throw on malformed input.
3. The file-header comment states: which OmniRoute .ts it came from, what adaptations
   were made, what was cut.
4. Chinese comments, ASCII code identifiers.

## Source location

open-sse/services/compression/ (github.com/diegosouzapw/OmniRoute)
