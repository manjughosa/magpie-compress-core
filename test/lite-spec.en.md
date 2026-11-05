[中文](./lite-spec.md) | English

# OmniRoute Lite compression engine — pure JavaScript port specification

> The sole porting reference. Extracted verbatim from the local source:
> - `open-sse/services/compression/lite.ts` (336 lines, main file)
> - `open-sse/services/compression/stats.ts` (`createCompressionStats`, 330 lines)
> - `open-sse/services/compression/types.ts` (`CompressionResult` / `CompressionMode` types)
> - `src/shared/constants/visionModels.ts` (`isVisionModelId`, 107 lines)
> - `src/shared/utils/tiktokenCounter.ts` (`countTextTokens` etc., 102 lines)
> - `open-sse/utils/jsonSize.ts` (`jsonLength` etc., 152 lines)
> - `open-sse/services/contextManager.ts` (`isInlineBase64ImageBlock`, lines 120–173)

---

## 0. Porting scope and trimming advice

`lite.ts` itself has only **2 runtime dependencies**:

| dependency | purpose | porting advice |
|---|---|---|
| `isVisionModelId(model)` (visionModels.ts) | image-stripping gate | **must port** (pure string matching, no node API); full code in §6.1 |
| `createCompressionStats(...)` (stats.ts) | produces compression stats | **optional**. Only affects the `stats` field returned by `applyLiteCompression`, not compression behaviour. Minimal version in §6.2 |
| `CompressionResult` / `CompressionMode` (types.ts) | types | TS types; drop them in a pure JS port or keep as JSDoc comments |

The full chain in `stats.ts` (tiktoken, omniglyph, PNG size decoding, jsonSize) serves token-count estimation only and is **unrelated to compression correctness**. If the sandbox requires zero dependencies, the `chars/4` estimate in §6.2 is enough.

---

## 1. All regular expressions (verbatim)

### 1.1 Inline regexes in lite.ts

```js
// (a) consecutive blank lines collapse: 3 or more \n → \n\n
/\n{3,}/g

// (b) trailing whitespace strip: runs of spaces/tabs at end of line → removed
/[ \t]+$/gm

// (c) word-character test (really a "non-whitespace" test): \S = any non-whitespace char
/\S/
```

### 1.2 Inline regexes in visionModels.ts (isVisionModelId exclusion rules)

```js
// (d) MiMo v2.5 Pro text-only exclusion
/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i

// (e) MiMo v2 Pro text-only exclusion
/(?:^|\/)mimo-v2-pro(?:$|[:/])/i
```

### 1.3 (only needed when porting the full stats version)

```js
// (f) tiktokenCounter.ts — base64 image data URI stripping
/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

// (g) contextManager.ts — inline base64 image URL prefix
/^data:image\/[a-zA-Z0-9.+-]+;base64,/
```

> Note on (a): it is **global, non-multiline** (`g`, no `m`): the cursor semantics of the `{3,}` quantifier on `\n` are "at every start of a newline run, greedily consume the whole run". A run of 3+ `\n` is replaced with exactly `\n\n` (2 newlines = 1 blank line).
> Note on (b): `$` carries the `m` flag and matches at each line end; `[ \t]+$` does not include the `\n` itself.
> Note on (c): it tests a single character; `/\S/.test(ch)` is equivalent to "the character is not whitespace".

---

## 2. All constants / thresholds (verbatim)

### 2.1 lite.ts

```js
const DEFAULT_MAX_TOOL_LENGTH = 2000;
const MIN_MAX_TOOL_LENGTH = 256;
const MAX_MAX_TOOL_LENGTH = 1_000_000;   // 1000000

const TOOL_TRUNCATION_LOOKBACK = 80;

// environment variable names (used by envInt)
"OMNIROUTE_LITE_MAX_TOOL_LENGTH"
```

### 2.2 Hardcoded values for truncation/dedup (appear as literals inside functions, not named constants)

```js
// dedupSystemPrompt: system-message dedup key
msg.content.trim()                     // key = the whole trim()ed text (changed after maintainer PR #423 review)

// truncateToolText: truncation suffix
"\n...[truncated]"                       // appended after the truncated text

// replaceImageUrls: image placeholder format
`[image: ${format}]`                     // format, see §5.15

// replaceImageUrls: data URI prefix test
url.startsWith("data:image/")
```

### 2.3 visionModels.ts (used by isVisionModelId)

```js
const VISION_MODEL_ID_FRAGMENTS = [
  "pixtral", "llava", "bakllava",
  "qwen-vl", "qwen2-vl", "qwen2.5-vl", "qwen3-vl",
  "qvq", "internvl", "minicpm-v", "moondream", "mimo-vl",
  "mimo-v2.5",
  "mimo-v2.6-pro", "mimo-v2.6-flash",
  "step-3.7-flash",
  "kimi-vl",
  "glm-4v", "glm-4.5v", "glm-4.6v", "glm-5.3",
  "gpt-4o", "gpt-4.1", "gpt-4-turbo", "gpt-4-vision", "gpt-5",
  "gemini-1.5", "gemini-2", "gemini-3", "gemini-4", "gemini-exp",
  "claude-3", "claude-fable", "claude-opus-4", "claude-sonnet-4", "claude-haiku-4",
  "claude-fable",                       // note: this really does appear twice in the list; kept as is
  "mistral-medium-3", "minimax-m3",
  "kimi-k2.",                           // note the trailing dot: matches "kimi-k2.5" etc., not "kimi-k2"
  "hcx-005",
  "-vision", "multimodal",
];
```

### 2.4 (full stats version only)

```js
// stats.ts
const CHARS_PER_TOKEN = 4;
const DEFAULT_IMAGE_TOKEN_ESTIMATE = 1200;

// tiktokenCounter.ts
const MAX_EXACT_TOKEN_COUNT_CHARS = 50_000;   // 50000

// contextManager.ts
const INLINE_BASE64_IMAGE_RE = /^data:image\/[a-zA-Z0-9.+-]+;base64,/;
```

---

## 3. String replacement rule table

The lite engine has **no** "pattern → replacement" rule table like caveman's. All replacement logic is hardcoded inside functions:

| # | rule | triggered in | effect |
|---|---|---|---|
| R1 | `/\n{3,}/g` → `"\n\n"` | `normalizeMessageWhitespace` | runs of ≥3 newlines → exactly 2 newlines |
| R2 | `/[ \t]+$/gm` → `""` | `normalizeMessageWhitespace` | trailing spaces/tabs per line → removed |
| R3 | over-long tool text → `text.slice(0, cut) + "\n...[truncated]"` | `truncateToolText` | truncation + fixed suffix |
| R4 | consecutive same-role messages (content exactly equal) → drop the latter | `removeRedundantContent` | whole message removed |
| R5 | duplicate system messages (identical whole-trim text) → drop the latter | `dedupSystemPrompt` | whole message removed |
| R6 | `{type:"image_url", image_url:{url:"data:image/<fmt>;base64,..."}}` → `{type:"text", text:"[image: <fmt>]"}` | `replaceImageUrls` | block replaced |

---

## 4. Message-structure assumptions

The lite engine assumes an **OpenAI chat.completions style body**:

```ts
interface Message {
  role: string;                                       // "system" | "user" | "assistant" | "tool" | ...
  content: string | Array<Record<string, unknown>>;   // a string or an array of content blocks
  [key: string]: unknown;                             // all other fields pass through untouched
}
interface ChatBody {
  messages?: Message[];
  [key: string]: unknown;
}
```

**Both content shapes are handled**:
- `content` as a **string**: `collapseWhitespace`, `dedupSystemPrompt` and OpenAI-style `role:"tool"` truncation mutate the string directly.
- `content` as an **array** (Anthropic-style content blocks / OpenAI vision parts): `truncateToolResultBlocks` looks for `{type:"tool_result"}` blocks; `replaceImageUrls` looks for `{type:"image_url"}` blocks.

**Write-back style**: always immutable updates — `{ ...msg, content: newContent }`, `{ ...body, messages }`. Original objects are never mutated.

**Fields left alone**: `name`, `tool_call_id`, `tool_calls`, `cache_control` and the rest all pass through via `...msg`, nothing added or removed.

---

## 5. Per-function specification

### 5.0 `envInt(name, fallback)` — internal

- **Input**: `name: string`, `fallback: number`; **output**: `number`
- **Line by line**:
  1. `raw = process.env[name]`. `undefined` / `null` / `""` → return `fallback`.
  2. `parsed = Number(raw)`. Non-finite → `fallback`.
  3. `n = Math.floor(parsed)`.
  4. `n < 256 || n > 1000000` → `fallback`.
  5. Otherwise return `n`.
- **node dependency**: `process.env`. Replace with injected config or a constant when porting.

### 5.1 `isUsableLiteMaxToolLength(value)` — exported

- **Input**: `value: unknown`; **output**: `boolean`
- **Behaviour**: `typeof value !== "number"` or non-finite → `false`; otherwise `Math.floor(value)` inside `[256, 1000000]` → `true`.

### 5.2 `resolveLiteMaxToolLength(maxToolLength?)` — exported

- **Behaviour**:
  1. If `isUsableLiteMaxToolLength(maxToolLength)` → return `Math.floor(maxToolLength)`.
  2. Otherwise → `envInt("OMNIROUTE_LITE_MAX_TOOL_LENGTH", 2000)`.
- **Note**: a valid caller-supplied value takes **priority over** the environment variable.

### 5.3 `normalizeMessageWhitespace(content)` — internal

- **Input**: `content: string`; **output**: `string`
- **Line by line**:
  1. `!content` (falsy, e.g. `""`) → return `""`.
  2. `content.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "")`.
- **Edge**: empty string in → empty string out. The call site `collapseWhitespace` only invokes it when `typeof msg.content === "string"`.

### 5.4 `modelSupportsVision(model)` — internal

- **Behaviour**: `return isVisionModelId(model)`. Pure delegation, see §6.1.

### 5.5 `collapseWhitespace(body, options = {})` — exported

- **Output**: `{ body: ChatBody, applied: boolean }`
- **Line by line**:
  1. `!body.messages` (`undefined`/`null`; note an **empty array `[]` is truthy and continues**, ending with `applied:false`) → return `{ body, applied: false }` (returns the **original body reference**).
  2. `applied = false`.
  3. For each message `msg`:
     - `options.preserveSystemPrompt === true && msg.role === "system"` → keep as is.
     - `typeof msg.content !== "string"` → keep as is (content block arrays untouched).
     - Otherwise `normalized = normalizeMessageWhitespace(msg.content)`; if `normalized !== msg.content` → `applied = true`; return `{ ...msg, content: normalized }`.
  4. Return `{ body: { ...body, messages }, applied }`.
- **Edge**: even when no message changed, a **new body object** is returned (`{...body, messages}`; messages is a new array whose elements may be the original references). `applied` reflects only "did any string content change".

### 5.6 `dedupSystemPrompt(body, options = {})` — exported

- **Line by line**:
  1. `!body.messages` → `{ body, applied: false }`.
  2. `options.preserveSystemPrompt === true` → `{ body, applied: false }` (**whole step skipped**).
  3. `seen = new Set()`; `applied = false`.
  4. `filter` each `msg`:
     - `msg.role !== "system"` or `typeof msg.content !== "string"` → keep.
     - `key = msg.content.trim()` (whole trimmed text).
     - `seen.has(key)` → `applied = true`, **drop**.
     - Otherwise `seen.add(key)`, keep.
  5. Return `{ body: { ...body, messages }, applied }`.
- **Edge**: the **first** system message always survives; dedup is global (`filter` does not require adjacency). The key is the whole trimmed text, so two system blocks that share an opening but differ in body both survive.

### 5.7 `isWordChar(char)` — internal

- **Behaviour**: `char !== undefined && /\S/.test(char)`. That is, "the character exists and is not whitespace".

### 5.8 `findWhitespaceBackward(content, cutIndex)` — internal

- **Behaviour**: `windowStart = max(0, cutIndex - 80)`; with `i` decreasing from `cutIndex` to `windowStart + 1`, the first `i` where `content[i-1]` is whitespace → return `i - 1`. None found → `-1`.
- **Meaning**: search left within the `[cutIndex-80, cutIndex]` window for the nearest whitespace index (so the cut lands on whitespace and the result is ≤ maxLength).

### 5.9 `findWhitespaceForward(content, cutIndex)` — internal

- **Behaviour**: `windowEnd = min(content.length, cutIndex + 80)`; with `i` increasing from `cutIndex` to `windowEnd - 1`, the first whitespace index → return it. None found → `-1`.
- **Meaning**: search forward for a word end (the result may exceed maxLength, but the word stays whole).

### 5.10 `backOffToWordBoundary(content, cutIndex)` — internal

- **Line by line**:
  1. `onWordBoundary = !isWordChar(content[cutIndex-1]) || !isWordChar(content[cutIndex])`.
     - `content[-1]` is `undefined` → `isWordChar` returns `false` → negated is true, so `cutIndex===0` counts as a boundary.
     - When `cutIndex >= content.length`, `content[cutIndex]` is `undefined` → also a boundary.
     - Whitespace on either side also counts as a boundary.
  2. On a boundary → return `cutIndex`.
  3. `backward = findWhitespaceBackward(...)`; if `!== -1` → return it.
  4. `forward = findWhitespaceForward(...)`; if `!== -1` → return it.
  5. Neither found → return the original `cutIndex` (hard cut).

### 5.11 `truncateToolText(text, maxLength)` — internal

- **Behaviour (the only semantic difference between this port and upstream OmniRoute)**: split the budget between head and tail —
  `headBudget = floor(maxLength/2)`, `tailBudget = maxLength - headBudget`;
  `headCut = backOffToWordBoundary(text, headBudget)`, `tailStart = text.length - tailBudget`,
  `tailCut = backOffToWordBoundary(text, tailStart)`; return
  `text.slice(0, headCut) + "\n...[truncated]" + text.slice(tailCut)`.
  If `tailCut <= headCut` (the text only just exceeds the cap) → fall back to head-only truncation:
  `text.slice(0, headCut) + "\n...[truncated]"`.
  Upstream keeps only the head; the reason for the change: the end of a tool output (the error lines, the conclusion, the last command segment) is what the model actually needs — head-only makes the model re-read the same file.
- **Note**: the caller guarantees `text.length > maxLength` (the function short-circuits the same way). `maxLength ≥ 256` guarantees the suffix (15 characters) can never outgrow the budget.

### 5.12 `truncateToolResultBlocks(msg, maxLength)` — internal

- **Output**: `{ message: Message, applied: boolean }`
- **Line by line**:
  1. `msg.role !== "user" || !Array.isArray(msg.content)` → `{ message: msg, applied: false }` (**only user blocks are processed**).
  2. For each `block` in `msg.content`:
     - `block.type !== "tool_result"` → untouched.
     - `inner = block.content`.
     - **inner is a string**: `inner.length <= maxLength` → untouched; otherwise `applied=true`, `{ ...block, content: truncateToolText(inner, maxLength) }`.
     - **inner is an array**: for each `part`: `part.type !== "text"` or `typeof part.text !== "string"` or `part.text.length <= maxLength` → untouched; otherwise `innerApplied=true`, `{ ...part, text: truncateToolText(part.text, maxLength) }`. If `innerApplied` → `applied=true`, `{ ...block, content: newInner }`; otherwise the block is untouched.
     - **inner of any other type** → block untouched.
  3. `applied` true → `{ message: { ...msg, content }, applied: true }`; otherwise `{ message: msg, applied: false }` (original reference).

### 5.13 `compressToolResults(body, options = {})` — exported

- **Line by line**:
  1. `!body.messages` → `{ body, applied: false }`.
  2. `MAX_TOOL_LENGTH = resolveLiteMaxToolLength(options.maxToolLength)`.
  3. `lastAssistant = body.messages.findLastIndex(m => m.role === "assistant")`.
     - **`findLastIndex` is an ES2023 API**; polyfill if the sandbox lacks it (scan tail-to-head).
  4. This layer no longer computes the current turn itself: `applyLiteCompression` has already sliced off the history and passed it in, so the whole slice is truncatable.
     - **Meaning**: the last assistant message and everything after it are **never truncated** (the tool result the model just asked for in this turn must not be cut, or it will re-read forever).
     - A first request (no assistant) is covered by `applyLiteCompression`'s `turnStart` returning 0 — the whole body counts as the current turn.
  5. Iterate `(msg, index)`:
     - The current-turn guard lives in `applyLiteCompression`: the segment `index >= turnStart(messages)` never reaches this layer.
     - `msg.role === "tool" && typeof msg.content === "string"`: `msg.content.length <= MAX_TOOL_LENGTH` → untouched; otherwise `applied=true`, `{ ...msg, content: truncateToolText(msg.content, MAX_TOOL_LENGTH) }`.
     - Anything else → `truncateToolResultBlocks(msg, MAX_TOOL_LENGTH)`, merging `applied`.
  6. Return `{ body: { ...body, messages }, applied }`.
- **Edge**: `role:"tool"` with array content goes through `truncateToolResultBlocks`, which returns it untouched because `role !== "user"` — OpenAI-style array-content tool messages are **not truncated**.

### 5.14 `removeRedundantContent(body, options = {})` — exported

- **Line by line**:
  1. `!body.messages` → `{ body, applied: false }`.
  2. Loop `i = 0..len-1`:
     - `options.preserveSystemPrompt === true && msg.role === "system"` → push, `continue` (**system is never deleted**, and never participates in comparisons).
     - `contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)`.
     - Deletion requires **all** of:
       - `i > 0`
       - `msg.role !== "tool"` (tool messages are exempt)
       - `body.messages[i-1].role === msg.role` (same role as the **original array**'s previous message — not the result array's last one)
       - `typeof body.messages[i-1].content === "string"`
       - `body.messages[i-1].content === contentStr` (**strict equality**, no trim)
     - All met → `applied = true`, `continue`.
     - Otherwise push.
  3. Return `{ body: { ...body, messages }, applied }`.
- **Edge**:
  - Two messages with array content are deleted too as long as every field is equal (`canonical` compares all fields, not just string content).
  - `i=0` is never deleted.
  - A triple repeat `A A A`: `i=1` is deleted (compared with original `i=0`), `i=2` is compared with **original** `i=1` (also A) → also deleted. One message remains.

### 5.15 `replaceImageUrls(body, options?)` — exported

- **Signature quirk**: `options?: LiteCompressionOptions | string` (string is the legacy model id).
- **Line by line**:
  1. `!body.messages` → `{ body, applied: false }`.
  2. Resolve `supportsVision`:
     - `typeof options === "object" && options !== null` → `options.supportsVision`.
     - `typeof options === "string"` → `modelSupportsVision(options)`.
     - Anything else (`undefined` etc.) → `undefined`.
  3. `supportsVision !== false` → `{ body, applied: false }` (**only an explicit `false` strips**; `undefined`/`null`/`true` all leave things alone).
  4. For each `msg`:
     - `!Array.isArray(msg.content)` → untouched.
     - For each `part`, all conditions must hold: `part` is a non-null object; `part.type === "image_url"`; `part.image_url` is an object; `part.image_url.url` is truthy.
       - `url = String(part.image_url.url)`.
       - Only `url.startsWith("data:image/")` is processed:
         - `applied = true`;
         - `format = url.slice(url.indexOf("/") + 1, url.indexOf(";")) || "unknown"`;
           - `"data:image/png;base64,..."`: `indexOf("/")`=10, `indexOf(";")`=15 → `format="png"`.
         - Return `{ type: "text", text: "[image: " + format + "]" }` (a **brand-new object**; the original part's `detail` and other fields are all dropped).
       - A non-data URI (http/https) → **kept as is**.
     - Return `{ ...msg, content: newContent }`.
  5. Return `{ body: { ...body, messages }, applied }`.
- **Note**: this function **does not check** `preserveSystemPrompt`.

### 5.16 `applyLiteCompression(body, options?)` — exported (main orchestration)

- **Output**: `{ body, compressed: boolean, stats: CompressionStats | null }`
- **Fixed pipeline order**:
  1. `originalBody = body`; `current = body`; `techniquesApplied = []`.
  2. **Step 1**: `collapseWhitespace` → if applied, push `"whitespace"`.
  3. **Step 2**: `dedupSystemPrompt` → push `"system-dedup"`.
  4. **Step 3 (conditional)**: only when `options?.compressToolResults !== false` does `compressToolResults` run → push `"tool-compress"`. Runs by default; skipped only on explicit `false`.
  5. **Step 4**: `removeRedundantContent` → push `"redundant-remove"`.
  6. **Step 5**: `replaceImageUrls` → push `"image-placeholder"`.
  7. `compressed = techniquesApplied.length > 0`.
  8. `stats = compressed ? createCompressionStats(originalBody, current, "lite", techniquesApplied) : null`.
  9. Return `{ body: current, compressed, stats }`.
- **Complete techniques labels** (order-preserving subset): `["whitespace", "system-dedup", "tool-compress", "redundant-remove", "image-placeholder"]`.

### 5.17 `LiteCompressionOptions` fields and defaults

| field | type | default | where it takes effect |
|---|---|---|---|
| `model` | `string?` | — | unused inside lite.ts (kept field) |
| `supportsVision` | `boolean \| null ?` | `undefined` | only `replaceImageUrls`; skipped unless `=== false` |
| `preserveSystemPrompt` | `boolean?` | `undefined`(=false) | `collapseWhitespace` (skips system), `dedupSystemPrompt` (whole step skipped), `removeRedundantContent` (skips system) |
| `compressToolResults` | `boolean?` | `undefined`(≠false → runs) | `applyLiteCompression` step 3 switch |
| `maxToolLength` | `number?` | env `OMNIROUTE_LITE_MAX_TOOL_LENGTH` → 2000 | `compressToolResults` |

---

## 6. Exact behaviour of external helpers

### 6.1 `isVisionModelId(modelId)` — must port (verbatim logic)

```js
const VISION_MODEL_ID_FRAGMENTS = [ /* §2.3 full list, as is */ ];

function isVisionModelId(modelId) {
  if (!modelId) return false;                          // null/undefined/"" → false
  const normalized = String(modelId).toLowerCase();
  if (/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i.test(normalized)) return false;
  if (/(?:^|\/)mimo-v2-pro(?:$|[:/])/i.test(normalized)) return false;
  return VISION_MODEL_ID_FRAGMENTS.some((f) => normalized.includes(f));
}
```

- **Semantics**: lowercase → two MiMo Pro exclusion regexes → any fragment contained as a substring → true.
- **Note**: fragments are all lowercase, so `normalized.includes(fragment)` is case-safe. `"claude-fable"` appears twice in the list (verbatim from the source, harmless).
- **Dependencies**: no node API, pure strings. **Copy it directly**.

### 6.2 `createCompressionStats(...)` — minimal port

The original (stats.ts) computes a token estimate for both the original and compressed body and derives the savings rate. The full implementation involves tiktoken/omniglyph/PNG decoding (see §7) and is **unrelated to compression correctness**. A minimal, behaviourally equivalent version:

```js
function estimateTokensMin(value) {
  if (!value) return 0;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return Math.ceil(s.length / 4);                     // CHARS_PER_TOKEN = 4
}

function createCompressionStats(originalBody, compressedBody, mode, techniquesUsed, rulesApplied, durationMs) {
  const originalTokens = estimateTokensMin(originalBody);
  const compressedTokens = estimateTokensMin(compressedBody);
  const savingsPercent =
    originalTokens > 0
      ? Math.round(((originalTokens - compressedTokens) / originalTokens) * 10000) / 100
      : 0;
  const stats = {
    originalTokens, compressedTokens, savingsPercent,
    techniquesUsed, mode, timestamp: Date.now(),
  };
  if (rulesApplied && rulesApplied.length > 0) stats.rulesApplied = rulesApplied;
  if (durationMs !== undefined) stats.durationMs = durationMs;
  return stats;
}
```

> Differences from the original: the original uses js-tiktoken for exact counts in a Codex context at ≤50000 characters and estimates base64 images specially (Anthropic PNG via `anthropicImageTokens(w,h,"standard")` + per-block overhead; OpenAI PNG via `openAIVisionTokens(model,w,h)`; undecodable images at 1200 each). **In lite mode stats are telemetry only**, so the minimal `chars/4` version is acceptable inside the lite pipeline (images have already been replaced by the short `[image: fmt]` placeholders). Port the full §7 chain only if the numbers must match OmniRoute's reported figures exactly.

---

## 7. node API / npm dependency list (porting replacement points)

| location | dependency | replacement plan |
|---|---|---|
| `lite.ts` `envInt()` | `process.env["OMNIROUTE_LITE_MAX_TOOL_LENGTH"]` | inject a config object, or hardcode 2000 |
| `lite.ts` `compressToolResults()` | `Array.prototype.findLastIndex` (ES2023) | if the sandbox lacks it: hand-written for loop scanning from the tail |
| `stats.ts` | `Buffer.from(prefix, "base64")`, `bytes.readUInt32BE` | full stats version only; not needed by the minimal one |
| `stats.ts` | npm `omniglyph` (`anthropicImageTokens`, `ANTHROPIC_IMAGE_BLOCK_OVERHEAD_TOKENS`, `openAIVisionTokens`) | full stats version only |
| `stats.ts` | npm `js-tiktoken` (via `createRequire(import.meta.url)`) | full stats version only |
| `tiktokenCounter.ts` | `createRequire` (node `module` API) | same as above |
| `visionModels.ts` | none | directly usable |
| `jsonSize.ts` | no node API (pure JS), serves the full stats version only | not needed by the minimal one |
| `contextManager.ts` `isInlineBase64ImageBlock` | no node API, serves the full stats version only | not needed by the minimal one |
| `types.ts` | TS types + `ENGINE_IDS` constant | lite only needs the `"lite"` string literal |

**The only hard replacement points inside lite.ts itself**: one `process.env` + one `findLastIndex`. Everything else is pure JS.

---

## 8. Porting checklist (testable behaviour assertions)

**collapseWhitespace**
1. `content = "a\n\n\nb"` → `"a\n\nb"`, `applied: true`.
2. `content = "a\n\n\n\n\nb"` (5 \n) → `"a\n\nb"` (**exactly 2**, not proportional).
3. `content = "a\n\nb"` (2 \n) → untouched, `applied: false`.
4. `content = "foo   \nbar\t\t\n"` → `"foo\nbar\n"` (trailing spaces and tabs both stripped, `applied:true`).
5. `content = ""` → `""`, `applied: false`.
6. `options.preserveSystemPrompt=true` with `role:"system"`, `content:"a\n\n\nb"` → untouched.
7. `content` is an array (e.g. `[{type:"text",text:"a\n\n\nb"}]`) → **untouched** (no recursion into blocks).
8. `body.messages` missing (`{}`) → returns the **same reference**, `{body, applied:false}`.

**dedupSystemPrompt**
9. Two system messages `content:"hello"` (adjacent or not) → the 2nd is dropped, `applied:true`; the 1st survives.
10. Two system messages `"  hello  "` and `"hello"` → identical keys after trim → the 2nd is dropped.
11. Two system messages sharing the first 200 characters but differing in body → **both survive** (the key is the whole trimmed text).
12. A system message with array content → does not participate in dedup, always survives.
13. `preserveSystemPrompt=true` → even two identical system messages both survive, `applied:false`.
14. A system message and a user message with identical content → not compared with each other (only system vs system).

**compressToolResults / truncateToolText**
15. `role:"tool"`, content length 3000, `maxToolLength:2000`, with a later assistant present → 1000 characters kept at each end + `"\n...[truncated]"` in the middle, `applied:true`.
16. The omission marker is verbatim `"\n...[truncated]"` (`\n` + 3 dots + `[truncated]`, 15 characters total).
17. Word boundaries: both cut points go through `backOffToWordBoundary(budget)`; no whitespace within the ±80 window to back off to or forward to → hard cut at the budget (head 1000 / tail 1000).
18. A `role:"tool"` message positioned **after the last assistant** (index ≥ lastAssistant+1) → never truncated.
19. No assistant in the message list → `turnStart` returns 0, the whole body is the current turn, **no truncation at all**.
20. `role:"tool"`, `content.length === 2000` (exactly the cap) → not truncated (`<=` passes).
21. `role:"tool"` with array content → not truncated.
22. Anthropic style: `role:"user"`, `content:[{type:"tool_result", content:"<3000 chars>"}]` → the inner string is truncated, the block structure survives.
23. A `tool_result` whose `content` is `[{type:"text", text:"<3000 chars>"}]` → only `part.text` is truncated; short text parts and non-text parts are untouched.
24. A `tool_result` block inside a `role:"assistant"` content array → untouched (only `role:"user"` is recognized).
25. `maxToolLength` of 100 (<256) → falls back to 2000; 2000000 (>1000000) → falls back; 500.7 → `Math.floor` → 500.

**removeRedundantContent**
26. Two consecutive `role:"user"`, `content:"same"` → the 2nd is dropped, `applied:true`.
27. Triple `user"same"` → the 2nd and 3rd are dropped, 1 remains (compared against the original previous message, not the result array).
28. Two `role:"user"` with an assistant in between → not dropped (**adjacency** is required).
29. `role:"tool"` matching the previous `role:"tool"` content → **not dropped** (tool exemption).
30. The current message's content is an array matching the previous one → not dropped (the previous one must be a string).
31. `i=0` is never dropped.
32. `preserveSystemPrompt=true` with two identical system messages → both survive.
33. `"same "` vs `"same"` (trailing-space difference) → not dropped (strict equality, no trim).

**replaceImageUrls**
34. `supportsVision:false`, content containing `{type:"image_url", image_url:{url:"data:image/png;base64,AAAA"}}` → replaced by `{type:"text", text:"[image: png]"}`, `applied:true`.
35. Same as above with a `detail:"high"` field → `detail` is lost after replacement (the new object has only type+text).
36. `url:"https://example.com/x.png"` (not a data URI) → kept as is.
37. `supportsVision:true` / `undefined` / `null` → nothing moves (only an explicit `false` triggers).
38. `options` as the string `"gpt-4o"` → `isVisionModelId("gpt-4o")=true` → untouched; `"some-text-model"` → false → stripping triggers.
39. `content` is a string → untouched.
40. Format extraction: `"data:image/jpeg;base64,..."` → `"jpeg"`; `"data:image/svg+xml;base64,..."` → `"svg+xml"`.

**applyLiteCompression orchestration**
41. The five-step order is fixed: whitespace → system-dedup → tool-compress (switchable) → redundant-remove → image-placeholder. `techniquesApplied` keeps this relative order.
42. No change at all → `{compressed:false, stats:null}`.
43. `options.compressToolResults:false` → step 3 skipped, techniques does not contain `"tool-compress"`.
44. Pipeline chaining: user `"a\n\n\nb"` is first rewritten by whitespace into `"a\n\nb"`, and if it then exactly equals an adjacent same-role message → removed by redundant-remove (later steps see earlier steps' output).
45. `stats.mode === "lite"`; `stats.techniquesUsed` is the same array as `techniquesApplied`.

**isVisionModelId**
46. `"openai/gpt-4o"` → true; `"gpt-4"` → false.
47. `"kimi-k2"` → false; `"kimi-k2.5"` → true (the fragment is `"kimi-k2."`, with the dot).
48. `"mimo-v2.5-pro"`, `"x/mimo-v2.5-pro"`, `"x/mimo-v2.5-pro:free"` → false; `"mimo-v2.5"` → true.
49. `""` / `null` / `undefined` → false.
50. Case: `"CLAUDE-3-OPUS"` → true.

**stats (minimal version)**
51. `originalTokens=0` → `savingsPercent=0` (no division by zero).
52. `savingsPercent` keeps two decimals: `Math.round(x*10000)/100` (33.333… → 33.33).

---

## 9. Porting quick notes

1. All updates are immutable (`{...obj}`), no in-place mutation; `collapseWhitespace`/`dedupSystemPrompt`/`compressToolResults`/`removeRedundantContent` always rebuild the body and messages array (even with `applied:false`); `replaceImageUrls` returns the original reference when `supportsVision!==false` or messages are missing.
2. `preserveSystemPrompt` only affects `collapseWhitespace` (skips system), `dedupSystemPrompt` (whole step skipped), `removeRedundantContent` (skips system); it does **not** affect `compressToolResults` or `replaceImageUrls`.
3. Image stripping is an **explicit opt-in**: `supportsVision` must be strictly `=== false`.
4. Tool truncation protects the current turn: everything from the last assistant on (inclusive) is immune; with no assistant, everything is immune.
5. Dedup key design: system dedup uses `trim().slice(0,200)`; adjacent-message dedup uses **original strict equality** (no trim).
6. ES2023 `findLastIndex` and `process.env` are the only two environment dependencies in lite.ts itself.
