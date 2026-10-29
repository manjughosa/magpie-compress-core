# session-dedup 引擎 → 纯 JavaScript 移植规格书

> 源文件：`open-sse/services/compression/engines/session-dedup/index.ts` + `fuzzy.ts`
> 目标：纯 JS（ES2018），无 node API、无 npm 依赖、无 fetch/timers。
> 本规格书为**唯一移植依据**，逐字记录所有常量、算法步骤与边界行为。

---

## 1. 全部正则 / 常量 / 阈值（逐字）

### index.ts 常量

| 常量 | 值 | 说明 |
|------|----|------|
| `ENGINE_ID` | `"session-dedup"` | 引擎标识 |
| `DEFAULT_MIN_BLOCK_CHARS` | `80` | 块最小字符数（可作为 dedup 候选） |
| `MIN_BLOCK_LINES` | `3` | 块最少行数 |
| `MAX_SUFFIX_STARTS` | `2000` | 单消息 suffix-block 扫描上限（OOM 防护） |
| `MAX_TOTAL_BLOCK_BYTES` | `8 * 1024 * 1024` = `8388608` | 单消息保留块总字节上限（OOM 防护） |
| hash 截断长度 | SHA-256 hex 取前 **24** 字符（96 bits） | 用于 `[dedup:ref sha=<24hex>]` |

### fuzzy.ts 常量

| 常量 | 值 | 说明 |
|------|----|------|
| `MAX_FUZZY_BLOCKS` | `200` | fuzzy O(n²) 比较的硬上限 |
| 默认 `minJaccard` | `0.85` | Jaccard 相似度阈值 |
| 默认 `shingleSize` | `3` | k-word shingle 的 k 值 |

### CCR marker 常量（fuzzy 替换用）

| 常量 | 值 | 说明 |
|------|----|------|
| marker 格式 | `` `[CCR retrieve hash=${hash} chars=${charCount}]` `` | hash 为 24-hex SHA-256 前缀 |

### 占位符格式（逐字）

**exact dedup marker：**
```
[dedup:ref sha=<24hex>]
```
其中 `<24hex>` = `sha256(block_text).hex().slice(0, 24)`。

**fuzzy CCR marker：**
```
[CCR retrieve hash=<24hex> chars=<N>]
```
其中 `<N>` = 原始消息的 `text.length`。

### 正则

fuzzy.ts 中唯一正则：
```js
text.split(/\s+/)
```
用于分词（shingle 构建）。无其他正则。

---

## 2. 两遍扫描的完整算法

### 2.1 块切分方式：suffix line blocks

**不按段落、不按消息。** 对每个文本 slot：

1. `text.split("\n")` 得到 `lines[]`。
2. 对每个起始行 `start`（0 到 `min(n-1, MAX_SUFFIX_STARTS-1)`），构造块：
   ```
   block = lines.slice(start).join("\n")
   ```
   即**从 start 行到消息末尾**的后缀块。
3. 仅保留满足以下全部条件的块：
   - `block 行数 >= MIN_BLOCK_LINES`（即 `n - start >= 3`）
   - `block.length >= minBlockChars`（默认 80）
   - 块未被 `seen` set 去重（同一消息内相同后缀块只记一次）
4. 累积 `totalBlockBytes`，若 `>= MAX_TOTAL_BLOCK_BYTES (8MB)` 则 `break`。

### 2.2 哈希函数

```
hashBlock(text) = sha256(text).hex().slice(0, 24)
```

逐字注释：*24 hex / 96 bits — collision-resistant*。Pass 2 额外验证 `owner.block === block`，所以哈希碰撞不会导致错误替换。

### 2.3 Pass 1：收集 first-seen 所有权

```
firstSeen: Map<sha → { ownerMsgIdx, block }>
```

对 `msgTexts` 中每个 `(msgIdx, text)`：
- `lines = text.split("\n")`
- `blocks = findSuffixBlocks(lines, minBlockChars)`
- 对每个 block：`sha = hashBlock(block)`；若 `firstSeen` 无此 sha，记录 `{ ownerMsgIdx: msgIdx, block }`。

**注意**：`msgIdx` 是复合键 `messageIndex * 100000 + slotIndex + 1`（非消息索引本身），slotIndex 从 0 开始。

### 2.4 Pass 2：替换重复块

对 `msgTexts` 中每个 `(msgIdx, messageIndex, text)`：

1. **当前轮跳过**：`if (messageIndex >= currentTurnStart) continue;`
2. 重新提取 `blocks = findSuffixBlocks(lines, minBlockChars)`。
3. 收集 `dupBlocks`：对每个 block 计算 sha，查 `firstSeen`：
   - `owner && owner.ownerMsgIdx < msgIdx && owner.block === block` → 加入 `dupBlocks`。
   - **`ownerMsgIdx < msgIdx` 是严格小于**（只替换在**严格更早**消息中首次出现的块）。
   - `owner.block === block` 是碰撞防护。
4. 若 `dupBlocks.length === 0` → 跳过此消息。
5. **排序**：`dupBlocks.sort((a, b) => b.block.length - a.block.length)` — 最长优先。
6. 替换循环（**只替换一次**）：
   ```
   replaced = new Set<string>()
   for each { block, sha } in dupBlocks:
     if any r in replaced satisfies r.includes(block): continue  // 重叠跳过
     idx = result.indexOf(block)
     if idx !== -1:
       marker = `[dedup:ref sha=${sha}]`
       result = result.slice(0, idx) + marker + result.slice(idx + block.length)
       changed = true
       replaced.add(block)
       break  // ← 每条消息每轮只替换一个块！
   ```

**关键行为**：`break` 语句意味着每条消息每次 Pass 2 只替换**最长的那一个**重复块。

### 2.5 单消息内去重（intra-message）

当 `msgTexts.length === 1` 时走 `dedupeWithinMessage`：

1. 提取所有 suffix blocks。
2. 若 `blocks.length < 2` → 无变化。
3. 计算每个 block 在文本中的**字面出现次数**（`indexOf` 扫描，非正则——避免 V8 "Regular expression too large"）。
4. 按频率降序、再按长度降序排列。
5. 对每个出现 ≥2 次的 block：用 `replaceLiteralOccurrencesAfterFirst(result, block, marker)` 替换**除第一次外**的所有出现。

### 2.6 "重复"的定义

块被视为重复，当且仅当：
- 其 SHA-256 前 24 hex 已存在于 `firstSeen` 中，**且**
- `ownerMsgIdx < 当前 msgIdx`（严格更早的消息/slot），**且**
- `owner.block === block`（字面相等，防哈希碰撞）。

---

## 3. 保护区规则（逐字条件）

### 3.1 system 消息

```js
if (msg.role === "system") continue;  // processMessages 收集阶段
if (msg.role === "system") return { ...msg };  // 重建阶段
```
**任何 `role === "system"` 的消息完全不参与 dedup**——既不作为来源（Pass 1 不收集其块），也不被修改。

### 3.2 当前轮（current turn）

```js
let currentTurnStart = 0;
for (let i = messages.length - 1; i >= 0; i--) {
  if (messages[i].role === "assistant") {
    currentTurnStart = i + 1;
    break;
  }
}
```

- **从消息数组末尾向前扫描**，找最后一个 `role === "assistant"` 的消息。
- `currentTurnStart` = 该 assistant 消息的索引 + 1。
- **若无 assistant 消息**，`currentTurnStart = 0`（所有消息都可被 dedup）。
- Pass 2 中：`if (messageIndex >= currentTurnStart) continue;` — 当前轮消息**不被替换**。
- **但当前轮消息的块仍参与 Pass 1 的 `firstSeen` 收集**——它们可作为后续轮的 "首次出现" 来源。

### 3.3 非文本 content 部分

```js
if (part["type"] === "text" && typeof part["text"] === "string") → 收集
if (part["type"] !== "tool_result") → 跳过（continue）
```
- 仅处理 `type: "text"` 部分和 `type: "tool_result"` 部分。
- `tool_result` 的 `content` 为 string → 直接收集；为 array → 收集其中 `type: "text"` 的 inner blocks。
- 其他类型（如 `image`）完全跳过。

---

## 4. `__sessionDedupMap__` 的结构与写入位置

### 实际代码发现（重要）

**`__sessionDedupMap__` 在当前源码中并未实际写入。** 文件头注释提到：

> *Reconstruction: Replace every `[dedup:ref sha=XXXXXXXX]` marker with the original block text from the reverse map attached as `__sessionDedupMap__` on the body object.*

但 `dedupMessageTexts()` 的返回值仅为 `{ deduped: Map<number, string>, dedupCount: number }`，`processMessages()` 也未将任何 map 挂到 body。`apply()` 中 `newBody = { ...body, messages: finalMessages }` 无 `__sessionDedupMap__` 字段。

### 还原语义（注释中的设计意图）

按注释，还原方式为：
> *Replace every `[dedup:ref sha=XXXXXXXX]` marker with the original block text from the reverse map.*

由于 agent 每轮重放全部历史，首次出现始终保留原文，因此**模型可通过回看消息历史自行找到 `sha` 对应的原始块**——不依赖网关跨请求状态。`__sessionDedupMap__` 是设计意图中的辅助索引，当前未实现。

### 移植建议

纯 JS 移植版**应实现** `__sessionDedupMap__`，结构建议：

```js
body.__sessionDedupMap__ = {
  "<sha24hex>": "<original block text>",
  // ...
}
```

在 Pass 2 每次替换时写入：
```js
if (!map[sha]) map[sha] = block;
```

还原函数：
```js
function restoreDedup(text, map) {
  return text.replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (m, sha) => map[sha] || m);
}
```

---

## 5. fuzzy.ts 完整逻辑

### 5.1 触发条件

`runFuzzyPass` 在 exact dedup 之后运行，条件**全部满足**才执行：

1. `stepConfig["fuzzy"]` 为 truthy：
   - 可以是 boolean `true` → `{ enabled: true }`
   - 可以是对象 `{ enabled: true, minJaccard?: number, shingleSize?: number }`
2. `callerCanRetrieve === true`（调用者 `tools[]` 中包含 `omniroute_ccr_retrieve` 工具）

**若任一不满足 → 返回原消息，`fuzzyCount = 0`。**

### 5.2 候选块收集

仅收集满足以下条件的消息作为 fuzzy block：
- `role !== "system"`
- `typeof content === "string"`（**仅 string content**，不处理 multipart）
- `content.length >= minBlockChars`

若 `blocks.length < 2` → 无操作。

### 5.3 Shingle 构建

```js
function shingles(text, k = 3) {
  words = text.split(/\s+/).filter(Boolean)
  if (words.length < k) return empty Set
  for i = 0; i + k <= words.length; i++:
    out.add(fnv1a(words.slice(i, i+k).join(" ")))
  return out
}
```

FNV-1a 32-bit hash：
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

### 5.4 Jaccard 相似度

```js
function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0;
  [small, large] = a.size <= b.size ? [a, b] : [b, a];
  inter = count of x in small where large.has(x)
  union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}
```

### 5.5 近重复查找

```js
function findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize = 3) {
  if (blocks.length > maxBlocks) return [];  // O(n²) 防护
  // 对每个 block i，找 j < i 中 Jaccard >= minJaccard 且最大的
  // 返回 NearDuplicate[] = { block, matchedIndex, similarity }
}
```

### 5.6 替换

对每个 near-duplicate：
1. `tryStoreBlock(text, principalId, { source: "session-dedup" })` → 存入 CCR store
2. 若存储成功：`marker = buildCcrMarker(hash, text.length)` = `` `[CCR retrieve hash=${hash} chars=${text.length}]` ``
3. **仅当 marker 更短时替换**：`if (marker.length < text.length)`

### 5.7 错误处理

整个 `applyFuzzyPass` 包裹在 `try { ... } catch { return { messages, fuzzyCount: 0 } }` 中——**任何错误都静默返回原消息**。

---

## 6. 与消息结构的交互

### 6.1 文本 slot 收集（collectTextSlots）

处理的 content 形式（按优先级）：

| content 类型 | 行为 |
|-------------|------|
| `string` | 收集 `[content]`（1 个 slot） |
| `Array` | 遍历 parts |
| — `part.type === "text"` 且 `typeof part.text === "string"` | 收集 `part.text` |
| — `part.type === "tool_result"` 且 `typeof part.content === "string"` | 收集 `part.content` |
| — `part.type === "tool_result"` 且 `Array.isArray(part.content)` | 收集 inner blocks 中 `type === "text"` 且 `typeof text === "string"` 的 `block.text` |
| — 其他 type | 跳过 |
| 其他（非 string 非 Array） | 返回 `[]` |

### 6.2 复合键编码

```js
msgIdx = messageIndex * 100000 + slotIndex + 1
```

- `messageIndex`：消息在 `messages[]` 中的 0-based 索引
- `slotIndex`：该消息内文本 slot 的 0-based 索引
- `+1` 确保 slot 0 不与 messageIndex * 100000 冲突
- 重建时：`baseKey = messageIndex * 100000`，slot key = `baseKey + slot`（slot 从 1 开始递增）

### 6.3 role 过滤

- `role === "system"` → 完全跳过（不收集、不修改）
- `role === "tool"`（OpenAI tool 消息）→ **不像 CCR 引擎那样跳过**。session-dedup **会处理** role 为 `"tool"` 的消息（只要 role !== "system"）。
- 所有其他 role（`"user"`, `"assistant"`, `"tool"`, 或无 role）→ 正常处理。

### 6.4 重建（applyTextSlots）

按 collectTextSlots 相同的 slot 顺序反向应用替换。copy-on-write：
- string content → 替换整个 content
- Array content → map parts，仅替换有对应 replacement 的 slot
- 未改变的 part 保持原引用

---

## 7. Node/npm 依赖清单及替换建议

### index.ts 依赖

| 导入 | 来源 | 用途 | 纯 JS 替换 |
|------|------|------|-----------|
| `crypto.createHash("sha256")` | `node:crypto` | SHA-256 哈希 | **纯 JS sha256**（如 hash.js 的 `sha256hex`），输出 hex 后 `.slice(0, 24)` |
| `createCompressionStats` | `../../stats.ts` | 生成统计信息 | **可选**：移植版可简化为返回 `{ compressed: boolean }`，或内联简单 token 估算（`Math.ceil(text.length / 4)`） |
| `runFuzzyPass` | `./fuzzy.ts` | fuzzy 近重复 | 内联移植（见 §5） |
| `callerSupportsCcrRetrieve` | `../ccr/protocolInstruction.ts` | 检测调用者能力 | 内联移植（扫描 `body.tools[]` 中是否有 name 以 `omniroute_ccr_retrieve` 结尾） |
| `CompressionEngine` 等类型 | `../types.ts` | TypeScript 类型 | 纯 JS 中删除 |
| `CompressionResult` 类型 | `../../types.ts` | TypeScript 类型 | 纯 JS 中删除 |
| `performance.now()` | Web API | 计时 | **可选**：纯 JS 中可省略或用 `Date.now()` |

### fuzzy.ts 依赖

| 导入 | 来源 | 用途 | 纯 JS 替换 |
|------|------|------|-----------|
| `buildCcrMarker` | `../ccr/index.ts` | 构建 CCR marker | 内联：`` `[CCR retrieve hash=${hash} chars=${charCount}]` `` |
| `tryStoreBlock` | `../ccr/index.ts` | CCR 存储 | 纯 JS 中**简化为内存 Map**：`store.set(hash, text)`，始终返回 `{ stored: true, hash }` |

### 不需要替换的

- `Math.imul`、`Math.min`、`Math.round`、`Math.ceil`、`Math.floor`、`Math.max` — ES2018 原生
- `Set`、`Map` — ES2018 原生
- `Array.prototype.map/filter/slice/indexOf/includes/some/every` — ES2018 原生
- `String.prototype.split/slice/indexOf/startsWith/endsWith/includes/charCodeAt` — ES2018 原生
- 展开运算符 `...`、模板字面量、解构 — ES2018 原生

---

## 8. 可测试的行为断言清单

> 每条格式：**A-nn:** 输入 → 预期输出。`B` 代表一个 ≥80 字符、≥3 行的文本块（用 `BLOCK` 指代），`sha(B)` 代表其 SHA-256 前 24 hex。

### 基本 exact dedup

**A-01:** 两条消息，msg[0].content = BLOCK（首次出现），msg[1].content = BLOCK → msg[0] 不变，msg[1].content 中 BLOCK 被替换为 `[dedup:ref sha=<sha(BLOCK)>]`。

**A-02:** 三条消息都含 BLOCK → msg[0] 不变，msg[1] 和 msg[2] 各替换一次。

**A-03:** 一条消息中 BLOCK 出现三次 → 第一次保留，后两次各替换为 marker（intra-message dedup，单消息路径）。

**A-04:** 块长度 = 79 字符（< 80）→ 不替换，无压缩。

**A-05:** 块长度 = 80 字符（= minBlockChars）且 ≥ 3 行 → 替换。

**A-06:** 块仅 2 行（< MIN_BLOCK_LINES=3）→ 不替换。

### 占位符逐字格式

**A-07:** marker 格式精确为 `[dedup:ref sha=` + 24 个 hex 字符 + `]`，无空格、无引号。

**A-08:** sha 值 = `sha256hex(blockText).slice(0, 24)`，小写 hex。

### 首次出现保留

**A-09:** 仅一条消息含 BLOCK → 不替换（无更早的 owner）。

**A-10:** 两条消息含**不同**块 → 互不替换。

### 当前轮保护

**A-11:** 消息列表 = [user(BLOCK), assistant, user(BLOCK)] → 最后一条 user 在当前轮（`currentTurnStart = 2`），不替换。

**A-12:** 消息列表 = [user(BLOCK), assistant, user(BLOCK), assistant, user(BLOCK)] → 最后的 user 不替换；中间的 user（index=2, < currentTurnStart=4）被替换。

**A-13:** 无 assistant 消息 → `currentTurnStart = 0`，**所有消息都可被替换**（只跳过 messageIndex >= 0 的……等等，`>= 0` 意味着**所有消息都被跳过**——没有任何替换发生）。

> **A-13 修正**：`currentTurnStart = 0` 时，`messageIndex >= 0` 对所有消息为 true → **无替换**。这是一个重要边界：无 assistant 消息时 dedup 完全不生效。

### system 消息保护

**A-14:** system 消息含 BLOCK，后续 user 消息含同一 BLOCK → user 消息**不被替换**（system 不参与 firstSeen，所以 BLOCK 无更早 owner）。

**A-15:** system 消息本身含重复块 → system 消息不被修改。

### 多 content part 处理

**A-16:** msg[0].content = [{type:"text", text: BLOCK}]，msg[1].content = [{type:"text", text: BLOCK}] → msg[1] 的 part.text 被替换。

**A-17:** msg[0].content = [{type:"tool_result", content: BLOCK}]，msg[1].content = [{type:"tool_result", content: BLOCK}] → msg[1] 的 tool_result.content 被替换。

**A-18:** msg.content = [{type:"tool_result", content: [{type:"text", text: BLOCK}]}] → inner text block 被替换。

**A-19:** msg.content = [{type:"image", ...}] → 跳过，不处理。

### suffix block 语义

**A-20:** msg[0] = "prefix\n" + BLOCK，msg[1] = BLOCK → msg[1] 被替换（因为 BLOCK 作为 suffix block 在 msg[0] 中被发现）。

**A-21:** msg[0] = BLOCK + "\nsuffix"，msg[1] = BLOCK → msg[1] **不被替换**（BLOCK 在 msg[0] 中不是 suffix block——它不到消息末尾）。

### 重叠块

**A-22:** 两个重叠的 suffix blocks 都是重复 → 只替换最长的那个（`break` 语句），较短的不替换。

### Map 还原

**A-23:** 替换后的消息中每个 `[dedup:ref sha=X]` marker，用 map[X] 替换回来 → 得到原始文本（round-trip 无损）。

### fuzzy pass

**A-24:** `fuzzy: false`（默认）→ 不运行 fuzzy pass。

**A-25:** `fuzzy: true` 但 `callerSupportsCcrRetrieve(body) === false` → 不运行 fuzzy pass。

**A-26:** `fuzzy: true`，两条消息 string content 长度 ≥ 80 且 Jaccard ≥ 0.85 → 后者被替换为 `[CCR retrieve hash=<24hex> chars=<N>]`。

**A-27:** fuzzy 替换后 marker 长度 ≥ 原始文本长度 → 不替换（shrink-only）。

**A-28:** blocks.length > 200（MAX_FUZZY_BLOCKS）→ `findNearDuplicates` 返回空数组。

### 边界与错误处理

**A-29:** `messages` 不是数组或为空数组 → `{ body, compressed: false, stats: null }`。

**A-30:** `enabled: false` → `{ body, compressed: false, stats: null }`。

**A-31:** fuzzy pass 抛异常 → 静默返回原消息，`fuzzyCount = 0`（fail-open）。

**A-32:** 消息内容完全相同但 role 都是 "system" → `compressed: false`。

---

## 附：纯 JS 移植的结构建议

```
session-dedup.js
├── sha256(text) → hex string          // 外部注入或内联
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

## 变更记录（2026-10-29 · goal mvt0a83q-fvzhss task-2）

**块粒度放宽（有意的行为变更）**：上游只认「从某行到消息末尾」的后缀块，真实流量结构性 0 命中（最近 50 条回放 0 中、均耗 170ms）。现提取 = **段落块**（`\n{2,}` 切分、≥ minBlockChars、不限行数）∪ **后缀行块**（≥3 行、≥ minBlockChars、到消息末尾，上游语义保留）。

- 后缀块提取改为行级 rolling hash（fnv1a-32 行哈希 + Horner 双模合并，模数 16777213/33554393，乘积 < 2^48 安全），全程 O(文本)；sha256 只对真正替换的块计算。
- 候选按哈希聚类后**逐条 slice 比对原文**再替换，撞哈希不错换。
- 替换策略统一为「全局首次出现保留，其余出现（同消息内/跨消息）全部替换」；同消息多区块非重叠、长优先、位置次之、sha 决胜，确定性输出。
- 单消息路径不再特殊（dedupeWithinMessage / countLiteralOccurrences / replaceLiteralOccurrencesAfterFirst / findSuffixBlocks 移除），统一走 dedupMessageTexts。
- 重锁测试：A-03b（3 次出现 → 保首次换后两，取代上游重叠 quirk 输出）、A-06（2 行 ≥80 字符的段落块现在会换，取代 <3 行不换）。
- 新增 N-1（中段段落块跨消息命中+round-trip）、N-2（多消息 body 的消息内段落重复）、N-3（幂等）、N-4（全局首次保留）。
- 回放基线（50 条真实 capture）：命中 0→29/50，省 0→40513B，均耗 170.4ms→3.0ms。

模块函数表（旧）：`findSuffixBlocks / countLiteralOccurrences / replaceLiteralOccurrencesAfterFirst / dedupeWithinMessage` 已移除，替换为 `extractBlocks(text, minBlockChars) → [{start,end,key}]` + 统一 `dedupMessageTexts`。
