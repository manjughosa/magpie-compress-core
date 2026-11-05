[中文](./session-dedup-spec.md) | English

# session-dedup engine → pure JavaScript port specification

> Source files: `open-sse/services/compression/engines/session-dedup/index.ts` + `fuzzy.ts`
> Target: pure JS (ES2018), no node API, no npm dependencies, no fetch/timers.
> This document is the **sole porting reference**, recording every constant, algorithm step and edge behaviour verbatim.

---

## 1. All regexes / constants / thresholds (verbatim)

### index.ts constants

| constant | value | meaning |
|------|----|------|
| `ENGINE_ID` | `"session-dedup"` | engine identifier |
| `DEFAULT_MIN_BLOCK_CHARS` | `80` | minimum characters for a block to become a dedup candidate |
| `MIN_BLOCK_LINES` | `3` | minimum lines per block |
| `MAX_SUFFIX_STARTS` | `2000` | per-message cap on suffix-block scan starts (OOM guard) |
| `MAX_TOTAL_BLOCK_BYTES` | `8 * 1024 * 1024` = `8388608` | per-message cap on total retained block bytes (OOM guard) |
| hash truncation length | first **24** hex characters of SHA-256 (96 bits) | used by `[dedup:ref sha=<24hex>]` |

### fuzzy.ts constants

| constant | value | meaning |
|------|----|------|
| `MAX_FUZZY_BLOCKS` | `200` | hard cap for the O(n²) fuzzy comparisons |
| default `minJaccard` | `0.85` | Jaccard similarity threshold |
| default `shingleSize` | `3` | k in k-word shingles |

### CCR marker constants (used by fuzzy replacement)

| constant | value | meaning |
|------|----|------|
| marker format | `` `[CCR retrieve hash=${hash} chars=${charCount}]` `` | hash is the 24-hex SHA-256 prefix |

### Placeholder formats (verbatim)

**exact dedup marker:**
```
[dedup:ref sha=<24hex>]
```
where `<24hex>` = `sha256(block_text).hex().slice(0, 24)`.

**fuzzy CCR marker:**
```
[CCR retrieve hash=<24hex> chars=<N>]
```
where `<N>` = the original message's `text.length`.

### Regexes

The only regex in fuzzy.ts:
```js
text.split(/\s+/)
```
used for tokenization (shingle building). No other regexes.

---

## 2. The complete two-pass algorithm

### 2.1 Block extraction: suffix line blocks

**Not by paragraph, not by message.** For each text slot:

1. `text.split("\n")` gives `lines[]`.
2. For every start line `start` (0 to `min(n-1, MAX_SUFFIX_STARTS-1)`), build the block:
   ```
   block = lines.slice(start).join("\n")
   ```
   i.e. the **suffix block from line start to the end of the message**.
3. Keep only blocks meeting all of:
   - at least `MIN_BLOCK_LINES` lines (`n - start >= 3`)
   - `block.length >= minBlockChars` (default 80)
   - the block has not been seen before in this message's `seen` set (identical suffix blocks are recorded once)
4. Accumulate `totalBlockBytes`; `break` once `>= MAX_TOTAL_BLOCK_BYTES (8MB)`.

### 2.2 Hash function

```
hashBlock(text) = sha256(text).hex().slice(0, 24)
```

Verbatim comment: *24 hex / 96 bits — collision-resistant*. Pass 2 additionally verifies `owner.block === block`, so a hash collision cannot cause a wrong replacement.

### 2.3 Pass 1: collect first-seen ownership

```
firstSeen: Map<sha → { ownerMsgIdx, block }>
```

For each `(msgIdx, text)` in `msgTexts`:
- `lines = text.split("\n")`
- `blocks = findSuffixBlocks(lines, minBlockChars)`
- For each block: `sha = hashBlock(block)`; if `firstSeen` has no such sha, record `{ ownerMsgIdx: msgIdx, block }`.

**Note**: `msgIdx` is a composite key `messageIndex * 100000 + slotIndex + 1` (not the message index itself); slotIndex starts at 0.

### 2.4 Pass 2: replace repeated blocks

For each `(msgIdx, messageIndex, text)` in `msgTexts`:

1. **Current turn is skipped**: `if (messageIndex >= currentTurnStart) continue;`
2. Re-extract `blocks = findSuffixBlocks(lines, minBlockChars)`.
3. Collect `dupBlocks`: for each block compute its sha and look it up in `firstSeen`:
   - `owner && owner.ownerMsgIdx < msgIdx && owner.block === block` → add to `dupBlocks`.
   - **`ownerMsgIdx < msgIdx` is strictly less-than** (only blocks first seen in a **strictly earlier** message are replaced).
   - `owner.block === block` is the collision guard.
4. If `dupBlocks.length === 0` → skip this message.
5. **Sort**: `dupBlocks.sort((a, b) => b.block.length - a.block.length)` — longest first.
6. Replacement loop (**one replacement only**):
   ```
   replaced = new Set<string>()
   for each { block, sha } in dupBlocks:
     if any r in replaced satisfies r.includes(block): continue  // overlap skipped
     idx = result.indexOf(block)
     if idx !== -1:
       marker = `[dedup:ref sha=${sha}]`
       result = result.slice(0, idx) + marker + result.slice(idx + block.length)
       changed = true
       replaced.add(block)
       break  // ← one block per message per Pass 2!
   ```

**Key behaviour**: the `break` means each message has exactly its **longest** duplicate block replaced in each Pass 2.

### 2.5 Intra-message dedup

When `msgTexts.length === 1`, `dedupeWithinMessage` runs:

1. Extract all suffix blocks.
2. If `blocks.length < 2` → no change.
3. Count each block's **literal occurrences** in the text (`indexOf` scanning, not regex — avoids V8 "Regular expression too large").
4. Sort by frequency descending, then by length descending.
5. For each block occurring ≥2 times, `replaceLiteralOccurrencesAfterFirst(result, block, marker)` replaces **all but the first** occurrence.

### 2.6 Definition of "duplicate"

A block is a duplicate if and only if:
- its first 24 hex of SHA-256 already exist in `firstSeen`, **and**
- `ownerMsgIdx < current msgIdx` (strictly earlier message/slot), **and**
- `owner.block === block` (literal equality, guarding against hash collisions).

---

## 3. Protected-zone rules (verbatim conditions)

### 3.1 system messages

```js
if (msg.role === "system") continue;  // during processMessages collection
if (msg.role === "system") return { ...msg };  // during rebuild
```
**Any message with `role === "system"` takes no part in dedup at all** — neither as a source (Pass 1 does not collect its blocks) nor as a target (it is never modified).

### 3.2 The current turn

```js
let currentTurnStart = 0;
for (let i = messages.length - 1; i >= 0; i--) {
  if (messages[i].role === "assistant") {
    currentTurnStart = i + 1;
    break;
  }
}
```

- **Scans backward from the end** of the message array for the last message with `role === "assistant"`.
- `currentTurnStart` = that assistant message's index + 1.
- **With no assistant message**, `currentTurnStart = 0`.
- In Pass 2: `if (messageIndex >= currentTurnStart) continue;` — current-turn messages are **not replaced**.
- **But current-turn messages still contribute their blocks to Pass 1's `firstSeen`** — they can serve as the "first occurrence" source for later turns.

### 3.3 Non-text content parts

```js
if (part["type"] === "text" && typeof part["text"] === "string") → collect
if (part["type"] !== "tool_result") → skip (continue)
```
- Only `type: "text"` parts and `type: "tool_result"` parts are processed.
- A `tool_result` whose `content` is a string → collected directly; an array → the inner blocks with `type: "text"` are collected.
- Anything else (e.g. `image`) is skipped entirely.

---

## 4. The structure of `__sessionDedupMap__` and where it is written

### Finding from the actual code (important)

**`__sessionDedupMap__` is not actually written anywhere in the current source.** The file header comment says:

> *Reconstruction: Replace every `[dedup:ref sha=XXXXXXXX]` marker with the original block text from the reverse map attached as `__sessionDedupMap__` on the body object.*

But `dedupMessageTexts()` returns only `{ deduped: Map<number, string>, dedupCount: number }`, `processMessages()` attaches no map to the body, and `apply()` builds `newBody = { ...body, messages: finalMessages }` with no `__sessionDedupMap__` field.

### Reconstruction semantics (the design intent in the comments)

Per the comments, reconstruction would be:
> *Replace every `[dedup:ref sha=XXXXXXXX]` marker with the original block text from the reverse map.*

Because the agent replays the whole history every turn, the first occurrence always retains the original text, so **the model can find the original block for any `sha` by looking back through the message history** — it does not depend on cross-request gateway state. `__sessionDedupMap__` is an auxiliary index in the design intent, currently unimplemented.

### Porting advice

A pure JS port **should implement** `__sessionDedupMap__`, with the suggested structure:

```js
body.__sessionDedupMap__ = {
  "<sha24hex>": "<original block text>",
  // ...
}
```

written on every Pass 2 replacement:
```js
if (!map[sha]) map[sha] = block;
```

and a restore function:
```js
function restoreDedup(text, map) {
  return text.replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (m, sha) => map[sha] || m);
}
```

---

## 5. fuzzy.ts complete logic

### 5.1 Trigger conditions

`runFuzzyPass` runs after exact dedup, and only when **all** of these hold:

1. `stepConfig["fuzzy"]` is truthy:
   - may be boolean `true` → `{ enabled: true }`
   - may be an object `{ enabled: true, minJaccard?: number, shingleSize?: number }`
2. `callerCanRetrieve === true` (the caller's `tools[]` contains the `omniroute_ccr_retrieve` tool)

**If either fails → the original messages are returned, `fuzzyCount = 0`.**

### 5.2 Candidate block collection

Only messages meeting all of these are collected as fuzzy blocks:
- `role !== "system"`
- `typeof content === "string"` (**string content only**, no multipart)
- `content.length >= minBlockChars`

If `blocks.length < 2` → no-op.

### 5.3 Shingle building

```js
function shingles(text, k = 3) {
  words = text.split(/\s+/).filter(Boolean)
  if (words.length < k) return empty Set
  for i = 0; i + k <= words.length; i++:
    out.add(fnv1a(words.slice(i, i+k).join(" ")))
  return out
}
```

FNV-1a 32-bit hash:
```js
function fnv1a(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
```

### 5.4 Jaccard similarity

```js
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  [small, large] = a.size <= b.size ? [a, b] : [b, a];
  inter = count of x in small where large.has(x)
  union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}
```

### 5.5 Near-duplicate finding

```js
function findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize = 3) {
  if (blocks.length > maxBlocks) return [];  // O(n²) guard
  // for each block i, find the best j < i with Jaccard >= minJaccard
  // returns NearDuplicate[] = { block, matchedIndex, similarity }
}
```

### 5.6 Replacement

For each near-duplicate:
1. `tryStoreBlock(text, principalId, { source: "session-dedup" })` → stored into the CCR store
2. If stored: `marker = buildCcrMarker(hash, text.length)` = `` `[CCR retrieve hash=${hash} chars=${text.length}]` ``
3. **Replace only when the marker is shorter**: `if (marker.length < text.length)`

### 5.7 Error handling

The whole `applyFuzzyPass` is wrapped in `try { ... } catch { return { messages, fuzzyCount: 0 } }` — **any error silently returns the original messages**.

---

## 6. Interaction with the message structure

### 6.1 Text slot collection (collectTextSlots)

Content shapes handled (in priority order):

| content shape | behaviour |
|-------------|------|
| `string` | collects `[content]` (1 slot) |
| `Array` | iterates parts |
| — `part.type === "text"` and `typeof part.text === "string"` | collects `part.text` |
| — `part.type === "tool_result"` and `typeof part.content === "string"` | collects `part.content` |
| — `part.type === "tool_result"` and `Array.isArray(part.content)` | collects `block.text` from inner blocks with `type === "text"` and `typeof text === "string"` |
| — any other type | skipped |
| anything else (neither string nor Array) | returns `[]` |

### 6.2 Composite key encoding

```js
msgIdx = messageIndex * 100000 + slotIndex + 1
```

- `messageIndex`: the 0-based index of the message in `messages[]`
- `slotIndex`: the 0-based index of the text slot within that message
- `+1` ensures slot 0 never collides with `messageIndex * 100000`
- At rebuild time: `baseKey = messageIndex * 100000`, slot key = `baseKey + slot` (slots count up from 1)

### 6.3 Role filtering

- `role === "system"` → skipped entirely (never collected, never modified)
- `role === "tool"` (OpenAI tool messages) → **not skipped**, unlike the CCR engine. session-dedup **does process** messages with `role === "tool"` (as long as the role is not `"system"`).
- All other roles (`"user"`, `"assistant"`, `"tool"`, or no role) → processed normally.

### 6.4 Rebuild (applyTextSlots)

Applies the replacements back in the same slot order collectTextSlots used. Copy-on-write:
- string content → the whole content is replaced
- Array content → parts are mapped; only slots with a replacement change
- untouched parts keep their original references

---

## 7. Node/npm dependency list and replacement advice

### index.ts dependencies

| import | from | purpose | pure JS replacement |
|------|------|------|-----------|
| `crypto.createHash("sha256")` | `node:crypto` | SHA-256 hashing | **pure JS sha256** (e.g. hash.js's `sha256hex`), hex output then `.slice(0, 24)` |
| `createCompressionStats` | `../../stats.ts` | stats generation | **optional**: the port may simplify to returning `{ compressed: boolean }`, or inline a simple token estimate (`Math.ceil(text.length / 4)`) |
| `runFuzzyPass` | `./fuzzy.ts` | fuzzy near-duplicates | inline port (see §5) |
| `callerSupportsCcrRetrieve` | `../ccr/protocolInstruction.ts` | caller capability detection | inline port (scan `body.tools[]` for a name ending in `omniroute_ccr_retrieve`) |
| `CompressionEngine` and other types | `../types.ts` | TypeScript types | dropped in pure JS |
| `CompressionResult` type | `../../types.ts` | TypeScript types | dropped in pure JS |
| `performance.now()` | Web API | timing | **optional**: omit in pure JS or use `Date.now()` |

### fuzzy.ts dependencies

| import | from | purpose | pure JS replacement |
|------|------|------|-----------|
| `buildCcrMarker` | `../ccr/index.ts` | builds CCR markers | inline: `` `[CCR retrieve hash=${hash} chars=${charCount}]` `` |
| `tryStoreBlock` | `../ccr/index.ts` | CCR storage | in pure JS **simplify to an in-memory Map**: `store.set(hash, text)`, always returning `{ stored: true, hash }` |

### Nothing to replace

- `Math.imul`, `Math.min`, `Math.round`, `Math.ceil`, `Math.floor`, `Math.max` — ES2018 native
- `Set`, `Map` — ES2018 native
- `Array.prototype.map/filter/slice/indexOf/includes/some/every` — ES2018 native
- `String.prototype.split/slice/indexOf/startsWith/endsWith/includes/charCodeAt` — ES2018 native
- spread `...`, template literals, destructuring — ES2018 native

---

## 8. Testable behaviour assertion list

> Each entry: **A-nn:** input → expected output. `B` denotes a text block of ≥80 characters and ≥3 lines (referred to as `BLOCK`), and `sha(B)` its first 24 hex of SHA-256.

### Basic exact dedup

**A-01:** two messages, msg[0].content = BLOCK (first occurrence), msg[1].content = BLOCK → msg[0] unchanged; in msg[1].content, BLOCK becomes `[dedup:ref sha=<sha(BLOCK)>]`.

**A-02:** three messages all containing BLOCK → msg[0] unchanged; msg[1] and msg[2] each replaced once.

**A-03:** BLOCK occurs three times in one message → first occurrence kept, the other two each become a marker (intra-message dedup, single-message path).

**A-04:** block length 79 characters (< 80) → not replaced, no compression.

**A-05:** block length 80 characters (= minBlockChars) and ≥ 3 lines → replaced.

**A-06:** block of only 2 lines (< MIN_BLOCK_LINES=3) → not replaced.

### Verbatim placeholder format

**A-07:** marker format is exactly `[dedup:ref sha=` + 24 hex characters + `]`, no spaces, no quotes.

**A-08:** sha value = `sha256hex(blockText).slice(0, 24)`, lowercase hex.

### First occurrence survives

**A-09:** only one message contains BLOCK → not replaced (no earlier owner).

**A-10:** two messages contain **different** blocks → neither replaces the other.

### Current-turn protection

**A-11:** messages = [user(BLOCK), assistant, user(BLOCK)] → the last user is in the current turn (`currentTurnStart = 2`), not replaced.

**A-12:** messages = [user(BLOCK), assistant, user(BLOCK), assistant, user(BLOCK)] → the final user is not replaced; the middle user (index=2, < currentTurnStart=4) is replaced.

**A-13:** no assistant messages → `currentTurnStart = 0`, and `messageIndex >= 0` is true for every message → **no replacement happens at all**. An important edge: with no assistant message, dedup never fires.

> **A-13 correction**: with `currentTurnStart = 0`, `messageIndex >= 0` holds for every message → **nothing is replaced**. This is a significant edge: without an assistant message, dedup does nothing.

### system message protection

**A-14:** a system message contains BLOCK, a later user message contains the same BLOCK → the user message is **not replaced** (system does not join firstSeen, so BLOCK has no earlier owner).

**A-15:** a system message containing duplicate blocks → the system message is not modified.

### Multi-part content handling

**A-16:** msg[0].content = [{type:"text", text: BLOCK}], msg[1].content = [{type:"text", text: BLOCK}] → msg[1]'s part.text is replaced.

**A-17:** msg[0].content = [{type:"tool_result", content: BLOCK}], msg[1].content = [{type:"tool_result", content: BLOCK}] → msg[1]'s tool_result.content is replaced.

**A-18:** msg.content = [{type:"tool_result", content: [{type:"text", text: BLOCK}]}] → the inner text block is replaced.

**A-19:** msg.content = [{type:"image", ...}] → skipped, untouched.

### Suffix block semantics

**A-20:** msg[0] = "prefix\n" + BLOCK, msg[1] = BLOCK → msg[1] is replaced (BLOCK is found in msg[0] as a suffix block).

**A-21:** msg[0] = BLOCK + "\nsuffix", msg[1] = BLOCK → msg[1] is **not replaced** (BLOCK is not a suffix block of msg[0] — it does not reach the message end).

### Overlapping blocks

**A-22:** two overlapping suffix blocks both duplicates → only the longer one is replaced (the `break`); the shorter one is not.

### Map reconstruction

**A-23:** every `[dedup:ref sha=X]` marker in the replaced messages, substituted back with map[X] → yields the original text (lossless round-trip).

### fuzzy pass

**A-24:** `fuzzy: false` (default) → the fuzzy pass does not run.

**A-25:** `fuzzy: true` but `callerSupportsCcrRetrieve(body) === false` → the fuzzy pass does not run.

**A-26:** `fuzzy: true`, two messages with string content of length ≥ 80 and Jaccard ≥ 0.85 → the latter becomes `[CCR retrieve hash=<24hex> chars=<N>]`.

**A-27:** after fuzzy replacement, marker length ≥ original text length → not replaced (shrink-only).

**A-28:** blocks.length > 200 (MAX_FUZZY_BLOCKS) → `findNearDuplicates` returns an empty array.

### Edges and error handling

**A-29:** `messages` not an array or an empty array → `{ body, compressed: false, stats: null }`.

**A-30:** `enabled: false` → `{ body, compressed: false, stats: null }`.

**A-31:** the fuzzy pass throws → silently returns the original messages, `fuzzyCount = 0` (fail-open).

**A-32:** messages identical in content but all `role: "system"` → `compressed: false`.

---

## Appendix: structural advice for the pure JS port

```
session-dedup.js
├── sha256(text) → hex string          // injected externally or inlined
├── hashBlock(text) → sha256(text).slice(0, 24)
├── findSuffixBlocks(lines, minBlockChars) → [{block, startLine}]
├── countLiteralOccurrences(text, needle) → number
├── replaceLiteralOccurrencesAfterFirst(text, needle, replacement) → string
├── dedupeWithinMessage(text, minBlockChars) → {deduped, changed}
├── dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart) → {deduped: Map, dedupCount}
├── collectTextSlots(msg) → string[]
├── applyTextSlots(msg, baseKey, deduped) → msg
├── processMessages(messages, minBlockChars) → {messages, dedupCount}
├── fnv1a(s) → number
├── shingles(text, k) → Set<number>
├── jaccard(a, b) → number
├── findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize) → NearDuplicate[]
├── applyFuzzyPass(messages, opts) → {messages, fuzzyCount}
├── runFuzzyPass(messages, stepConfig, minBlockChars, principalId, callerCanRetrieve) → {messages, fuzzyCount}
├── callerSupportsCcrRetrieve(body) → boolean
└── apply(body, stepConfig) → {body, compressed, stats}
```

---

## Change log (2026-10-29 · goal mvt0a83q-fvzhss task-2)

**Block granularity widened (an intentional behaviour change)**: upstream only recognized "suffix blocks from some line to the message end", which hit structurally 0 times on real traffic (0 hits across the last 50 replayed captures, averaging 170ms). Extraction is now = **paragraph blocks** (split on `\n{2,}`, ≥ minBlockChars, any line count) ∪ **suffix line blocks** (≥3 lines, ≥ minBlockChars, reaching the message end — upstream semantics retained).

- Suffix-block extraction became a line-level rolling hash (fnv1a-32 line hashes + Horner merging over two moduli, 16777213/33554393, product < 2^48 so safe), O(text) throughout; sha256 is computed only for blocks actually replaced.
- Candidates are clustered by hash, then each is compared against the original text with a literal slice before replacement; a hash collision never substitutes the wrong text.
- The replacement strategy is unified as "the global first occurrence survives, all other occurrences (within the same message or across messages) are replaced"; multiple blocks within one message are non-overlapping, longest first, then position, with sha as the tiebreaker — deterministic output.
- The single-message path is no longer special (dedupeWithinMessage / countLiteralOccurrences / replaceLiteralOccurrencesAfterFirst / findSuffixBlocks removed), everything goes through the unified dedupMessageTexts.
- Tests re-pinned: A-03b (3 occurrences → keep the first, replace the latter two, superseding the upstream overlap quirk output), A-06 (a 2-line ≥80-character paragraph block is now replaced, superseding "fewer than 3 lines never replaced").
- New N-1 (a mid-message paragraph block hits across messages + round-trip), N-2 (intra-message paragraph repeats in a multi-message body), N-3 (idempotence), N-4 (global first occurrence survives).
- Replay baseline (50 real captures): hits 0→29/50, savings 0→40513B, mean time 170.4ms→3.0ms.

Module function table (old): `findSuffixBlocks / countLiteralOccurrences / replaceLiteralOccurrencesAfterFirst / dedupeWithinMessage` removed, replaced by `extractBlocks(text, minBlockChars) → [{start,end,key}]` + the unified `dedupMessageTexts`.
