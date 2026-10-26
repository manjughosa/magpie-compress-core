# OmniRoute Lite 压缩引擎 — 纯 JavaScript 移植规格书

> 唯一移植依据。基于本机源码逐字提取：
> - `open-sse/services/compression/lite.ts`（336 行，主文件）
> - `open-sse/services/compression/stats.ts`（`createCompressionStats`，330 行）
> - `open-sse/services/compression/types.ts`（`CompressionResult` / `CompressionMode` 类型）
> - `src/shared/constants/visionModels.ts`（`isVisionModelId`，107 行）
> - `src/shared/utils/tiktokenCounter.ts`（`countTextTokens` 等，102 行）
> - `open-sse/utils/jsonSize.ts`（`jsonLength` 等，152 行）
> - `open-sse/services/contextManager.ts`（`isInlineBase64ImageBlock`，第 120–173 行）

---

## 0. 移植范围与裁剪建议

`lite.ts` 本身只有 **2 个运行时依赖**：

| 依赖 | 用途 | 移植建议 |
|---|---|---|
| `isVisionModelId(model)`（visionModels.ts） | 图片剥离门控 | **必须移植**（纯字符串匹配，无 node API），完整代码见 §6.1 |
| `createCompressionStats(...)`（stats.ts） | 生成压缩统计 | **可选**。只影响 `applyLiteCompression` 返回的 `stats` 字段，不影响压缩行为。最小移植版见 §6.2 |
| `CompressionResult` / `CompressionMode`（types.ts） | 类型 | TS 类型，纯 JS 移植时可丢弃或用 JSDoc 注释 |

`stats.ts` 的完整链路（tiktoken、omniglyph、PNG 尺寸解码、jsonSize）只服务于 token 统计估算，**与压缩正确性无关**。若沙箱要求零依赖，用 §6.2 的 `chars/4` 估算即可。

---

## 1. 全部正则表达式（逐字）

### 1.1 lite.ts 内联正则

```js
// (a) 连续空行折叠：3 个及以上 \n → \n\n
/\n{3,}/g

// (b) 行尾空白剥离：每行末尾的连续空格/制表符 → 删除
/[ \t]+$/gm

// (c) 单词字符判定（实为"非空白"判定）：\S = 任何非空白字符
/\S/
```

### 1.2 visionModels.ts 内联正则（isVisionModelId 排除规则）

```js
// (d) MiMo v2.5 Pro 文本型排除
/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i

// (e) MiMo v2 Pro 文本型排除
/(?:^|\/)mimo-v2-pro(?:$|[:/])/i
```

### 1.3 （仅当移植完整版 stats 时需要）

```js
// (f) tiktokenCounter.ts — base64 图片 data URI 剥离
/data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi

// (g) contextManager.ts — 内联 base64 图片 URL 前缀
/^data:image\/[a-zA-Z0-9.+-]+;base64,/
```

> 注意 (a) 是 **全局非多行**（`g`，无 `m`）：`{3,}` 量词匹配 `\n` 的游标语义是"每遇到一个换行序列起点，贪婪吃掉全部连续换行"。连续 3 个 `\n` 替换为 `\n\n`（即 2 个换行 = 1 个空行）。
> 注意 (b) 的 `$` 带 `m` 标志，匹配每行行尾；`[ \t]+$` 不含 `\n` 本身。
> 注意 (c) 只测单个字符，`/\S/.test(ch)` 等价于"该字符不是空白"。

---

## 2. 全部常量 / 阈值（逐字）

### 2.1 lite.ts

```js
const DEFAULT_MAX_TOOL_LENGTH = 2000;
const MIN_MAX_TOOL_LENGTH = 256;
const MAX_MAX_TOOL_LENGTH = 1_000_000;   // 1000000

const TOOL_TRUNCATION_LOOKBACK = 80;

// 环境变量名（envInt 使用）
"OMNIROUTE_LITE_MAX_TOOL_LENGTH"
```

### 2.2 截断/去重的硬编码值（出现在函数字面量中，非命名常量）

```js
// dedupSystemPrompt：system 消息去重键
msg.content.trim().slice(0, 200)        // 键 = trim 后前 200 字符

// truncateToolText：截断后缀
"\n...[truncated]"                       // 固定拼接在截断文本之后

// replaceImageUrls：图片占位符格式
`[image: ${format}]`                     // format 见 §5.15

// replaceImageUrls：data URI 前缀判定
url.startsWith("data:image/")
```

### 2.3 visionModels.ts（isVisionModelId 用）

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
  "claude-fable",                       // 注意：列表中确实重复出现两次，原样保留
  "mistral-medium-3", "minimax-m3",
  "kimi-k2.",                           // 注意末尾有句点：匹配 "kimi-k2.5" 等，不匹配 "kimi-k2"
  "hcx-005",
  "-vision", "multimodal",
];
```

### 2.4 （仅完整版 stats 用）

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

## 3. 字符串替换规则表

lite 引擎**没有** caveman 那样的"模式→替换串"规则表。全部替换逻辑硬编码在函数里：

| # | 规则 | 触发位置 | 替换效果 |
|---|---|---|---|
| R1 | `/\n{3,}/g` → `"\n\n"` | `normalizeMessageWhitespace` | 连续 ≥3 换行 → 恰好 2 换行 |
| R2 | `/[ \t]+$/gm` → `""` | `normalizeMessageWhitespace` | 每行行尾空格/tab → 删除 |
| R3 | 超长 tool 文本 → `text.slice(0, cut) + "\n...[truncated]"` | `truncateToolText` | 截断+固定后缀 |
| R4 | 连续重复同 role 消息（content 全等）→ 删除后者 | `removeRedundantContent` | 整条消息移除 |
| R5 | 重复 system 消息（trim 后前 200 字符相同）→ 删除后者 | `dedupSystemPrompt` | 整条消息移除 |
| R6 | `{type:"image_url", image_url:{url:"data:image/<fmt>;base64,..."}}` → `{type:"text", text:"[image: <fmt>]"}` | `replaceImageUrls` | 块替换 |

---

## 4. 消息结构假设

lite 引擎假设 **OpenAI chat.completions 风格 body**：

```ts
interface Message {
  role: string;                                       // "system" | "user" | "assistant" | "tool" | ...
  content: string | Array<Record<string, unknown>>;   // 字符串 或 内容块数组
  [key: string]: unknown;                             // 其余字段原样透传
}
interface ChatBody {
  messages?: Message[];
  [key: string]: unknown;
}
```

**content 两种形态都处理**：
- `content` 是 **string**：`collapseWhitespace`、`dedupSystemPrompt`、OpenAI 风格 `role:"tool"` 截断都直接改字符串。
- `content` 是 **数组**（Anthropic 风格 content blocks / OpenAI vision parts）：`truncateToolResultBlocks` 找 `{type:"tool_result"}` 块；`replaceImageUrls` 找 `{type:"image_url"}` 块。

**回写方式**：一律不可变更新 —— `{ ...msg, content: newContent }`、`{ ...body, messages }`。原对象不被修改。

**未动字段**：`name`、`tool_call_id`、`tool_calls`、`cache_control` 等全部通过 `...msg` 透传，不增不删。

---

## 5. 逐函数规格

### 5.0 `envInt(name, fallback)` — 内部

- **输入**：`name: string`, `fallback: number`；**输出**：`number`
- **逐行**：
  1. `raw = process.env[name]`。`undefined` / `null` / `""` → 返回 `fallback`。
  2. `parsed = Number(raw)`。非有限数 → `fallback`。
  3. `n = Math.floor(parsed)`。
  4. `n < 256 || n > 1000000` → `fallback`。
  5. 否则返回 `n`。
- **node 依赖**：`process.env`。移植时替换为配置注入或常数。

### 5.1 `isUsableLiteMaxToolLength(value)` — 导出

- **输入**：`value: unknown`；**输出**：`boolean`
- **行为**：`typeof value !== "number"` 或非有限 → `false`；否则 `Math.floor(value)` 在 `[256, 1000000]` 区间内 → `true`。

### 5.2 `resolveLiteMaxToolLength(maxToolLength?)` — 导出

- **行为**：
  1. 若 `isUsableLiteMaxToolLength(maxToolLength)` 为真 → 返回 `Math.floor(maxToolLength)`。
  2. 否则 → `envInt("OMNIROUTE_LITE_MAX_TOOL_LENGTH", 2000)`。
- **注意**：调用方传入合法值时**优先级高于**环境变量。

### 5.3 `normalizeMessageWhitespace(content)` — 内部

- **输入**：`content: string`；**输出**：`string`
- **逐行**：
  1. `!content`（`""` 等 falsy）→ 返回 `""`。
  2. `content.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+$/gm, "")`。
- **边界**：空串入 → 空串出。调用处 `collapseWhitespace` 只在 `typeof msg.content === "string"` 时才调用。

### 5.4 `modelSupportsVision(model)` — 内部

- **行为**：`return isVisionModelId(model)`。纯委托，见 §6.1。

### 5.5 `collapseWhitespace(body, options = {})` — 导出

- **输出**：`{ body: ChatBody, applied: boolean }`
- **逐行**：
  1. `!body.messages`（`undefined`/`null`；注意**空数组 `[]` 是 truthy，会继续走**，结果 `applied:false`）→ 返回 `{ body, applied: false }`（返回**原 body 引用**）。
  2. `applied = false`。
  3. 对每条消息 `msg`：
     - `options.preserveSystemPrompt === true && msg.role === "system"` → 原样保留。
     - `typeof msg.content !== "string"` → 原样保留（content blocks 数组不动）。
     - 否则 `normalized = normalizeMessageWhitespace(msg.content)`；若 `normalized !== msg.content` → `applied = true`；返回 `{ ...msg, content: normalized }`。
  4. 返回 `{ body: { ...body, messages }, applied }`。
- **边界**：即使没有消息被改动，也返回**新 body 对象**（`{...body, messages}`，messages 是新数组但元素可能是原引用）。`applied` 仅反映"是否有字符串内容被改"。

### 5.6 `dedupSystemPrompt(body, options = {})` — 导出

- **逐行**：
  1. `!body.messages` → `{ body, applied: false }`。
  2. `options.preserveSystemPrompt === true` → `{ body, applied: false }`（**整体跳过**）。
  3. `seen = new Set()`；`applied = false`。
  4. `filter` 每条 `msg`：
     - `msg.role !== "system"` 或 `typeof msg.content !== "string"` → 保留。
     - `key = msg.content.trim().slice(0, 200)`。
     - `seen.has(key)` → `applied = true`，**丢弃**。
     - 否则 `seen.add(key)`，保留。
  5. 返回 `{ body: { ...body, messages }, applied }`。
- **边界**：**第一条**出现的 system 总是保留；去重是全局的（`filter` 不限相邻）。键是 trim 后前 200 字符，所以"仅 200 字符之后不同的超长 system"会被误判为重复 —— 源码行为，原样保留。

### 5.7 `isWordChar(char)` — 内部

- **行为**：`char !== undefined && /\S/.test(char)`。即"字符存在且非空白"。

### 5.8 `findWhitespaceBackward(content, cutIndex)` — 内部

- **行为**：`windowStart = max(0, cutIndex - 80)`；从 `i = cutIndex` 递减到 `windowStart + 1`，第一个使 `content[i-1]` 是空白的 `i` → 返回 `i - 1`。找不到 → `-1`。
- **含义**：在 `[cutIndex-80, cutIndex]` 窗口内向左找最近空白字符的下标（切在空白处，结果 ≤ maxLength）。

### 5.9 `findWhitespaceForward(content, cutIndex)` — 内部

- **行为**：`windowEnd = min(content.length, cutIndex + 80)`；从 `i = cutIndex` 递增到 `windowEnd - 1`，第一个空白字符下标 → 返回。找不到 → `-1`。
- **含义**：向后找词尾（结果可能 > maxLength，但词完整）。

### 5.10 `backOffToWordBoundary(content, cutIndex)` — 内部

- **逐行**：
  1. `onWordBoundary = !isWordChar(content[cutIndex-1]) || !isWordChar(content[cutIndex])`。
     - `content[-1]` 为 `undefined` → `isWordChar` 返回 `false` → 取非为 true，即 `cutIndex===0` 视为边界。
     - `cutIndex >= content.length` 时 `content[cutIndex]` 为 `undefined` → 同样视为边界。
     - 任一侧是空白也算边界。
  2. 在边界 → 返回 `cutIndex`。
  3. `backward = findWhitespaceBackward(...)`；`!== -1` → 返回。
  4. `forward = findWhitespaceForward(...)`；`!== -1` → 返回。
  5. 都找不到 → 返回原 `cutIndex`（硬切）。

### 5.11 `truncateToolText(text, maxLength)` — 内部

- **行为**：`cutIndex = backOffToWordBoundary(text, maxLength)`；返回 `text.slice(0, cutIndex) + "\n...[truncated]"`。
- **注意**：调用方保证 `text.length > maxLength` 才进入。`maxLength ≥ 256` 保证后缀（14 字符）不会反超。

### 5.12 `truncateToolResultBlocks(msg, maxLength)` — 内部

- **输出**：`{ message: Message, applied: boolean }`
- **逐行**：
  1. `msg.role !== "user" || !Array.isArray(msg.content)` → `{ message: msg, applied: false }`（**只处理 user 的 blocks**）。
  2. 遍历 `msg.content` 每个 `block`：
     - `block.type !== "tool_result"` → 原样。
     - `inner = block.content`。
     - **inner 是 string**：`inner.length <= maxLength` → 原样；否则 `applied=true`，`{ ...block, content: truncateToolText(inner, maxLength) }`。
     - **inner 是数组**：遍历每个 `part`：`part.type !== "text"` 或 `typeof part.text !== "string"` 或 `part.text.length <= maxLength` → 原样；否则 `innerApplied=true`，`{ ...part, text: truncateToolText(part.text, maxLength) }`。若 `innerApplied` → `applied=true`，`{ ...block, content: newInner }`；否则 block 原样。
     - **inner 其他类型** → block 原样。
  3. `applied` 为真 → `{ message: { ...msg, content }, applied: true }`；否则 `{ message: msg, applied: false }`（原引用）。

### 5.13 `compressToolResults(body, options = {})` — 导出

- **逐行**：
  1. `!body.messages` → `{ body, applied: false }`。
  2. `MAX_TOOL_LENGTH = resolveLiteMaxToolLength(options.maxToolLength)`。
  3. `lastAssistant = body.messages.findLastIndex(m => m.role === "assistant")`。
     - **`findLastIndex` 是 ES2023 API**；沙箱若无，需 polyfill（从尾到头扫）。
  4. `currentTurnStart = lastAssistant === -1 ? body.messages.length : lastAssistant + 1`。
     - **含义**：最后一条 assistant 及其之后的所有消息**永不截断**（模型本轮刚要的工具结果不能切，否则无限重读）。
     - 没有 assistant 时 `currentTurnStart = messages.length`，即**没有任何消息被截断**。
  5. 遍历 `(msg, index)`：
     - `index >= currentTurnStart` → 原样。
     - `msg.role === "tool" && typeof msg.content === "string"`：`msg.content.length <= MAX_TOOL_LENGTH` → 原样；否则 `applied=true`，`{ ...msg, content: truncateToolText(msg.content, MAX_TOOL_LENGTH) }`。
     - 其他 → `truncateToolResultBlocks(msg, MAX_TOOL_LENGTH)`，合并 `applied`。
  6. 返回 `{ body: { ...body, messages }, applied }`。
- **边界**：`role:"tool"` 且 content 是**数组** → 走 `truncateToolResultBlocks`，因其 `role !== "user"` 直接返回原样 —— OpenAI 风格 array-content tool 消息**不被截断**。

### 5.14 `removeRedundantContent(body, options = {})` — 导出

- **逐行**：
  1. `!body.messages` → `{ body, applied: false }`。
  2. 循环 `i = 0..len-1`：
     - `options.preserveSystemPrompt === true && msg.role === "system"` → push，`continue`（**system 永不删**，且不参与比较）。
     - `contentStr = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)`。
     - 删除条件**全部**满足才删：
       - `i > 0`
       - `msg.role !== "tool"`（tool 消息豁免）
       - `body.messages[i-1].role === msg.role`（与**原始数组**前一条同 role —— 不是结果数组最后一条）
       - `typeof body.messages[i-1].content === "string"`
       - `body.messages[i-1].content === contentStr`（**全等**，不 trim）
     - 满足 → `applied = true`，`continue`。
     - 否则 push。
  3. 返回 `{ body: { ...body, messages }, applied }`。
- **边界**：
  - 数组 content 消息实际永不因重复被删（要求前一条 `typeof content === "string"` 且全等）。
  - `i=0` 永不删。
  - 三连重复 `A A A`：`i=1` 删（与原始 `i=0` 比），`i=2` 与**原始** `i=1`（也是 A）比 → 也删。结果剩 1 条。

### 5.15 `replaceImageUrls(body, options?)` — 导出

- **签名特例**：`options?: LiteCompressionOptions | string`（string 是 legacy model id）。
- **逐行**：
  1. `!body.messages` → `{ body, applied: false }`。
  2. 解析 `supportsVision`：
     - `typeof options === "object" && options !== null` → `options.supportsVision`。
     - `typeof options === "string"` → `modelSupportsVision(options)`。
     - 其他（`undefined` 等）→ `undefined`。
  3. `supportsVision !== false` → `{ body, applied: false }`（**只有显式 `false` 才剥离**；`undefined`/`null`/`true` 全不动）。
  4. 遍历每条 `msg`：
     - `!Array.isArray(msg.content)` → 原样。
     - 遍历每个 `part`，条件（全满足）：`part` 是非 null 对象；`part.type === "image_url"`；`part.image_url` 是对象；`part.image_url.url` truthy。
       - `url = String(part.image_url.url)`。
       - `url.startsWith("data:image/")` 才处理：
         - `applied = true`；
         - `format = url.slice(url.indexOf("/") + 1, url.indexOf(";")) || "unknown"`；
           - `"data:image/png;base64,..."`：`indexOf("/")`=10，`indexOf(";")`=15 → `format="png"`。
         - 返回 `{ type: "text", text: "[image: " + format + "]" }`（**全新对象**，原 part 的 `detail` 等字段全部丢弃）。
       - 非 data URI（http/https）→ **原样保留**。
     - 返回 `{ ...msg, content: newContent }`。
  5. 返回 `{ body: { ...body, messages }, applied }`。
- **注意**：此函数**不检查** `preserveSystemPrompt`。

### 5.16 `applyLiteCompression(body, options?)` — 导出（主编排）

- **输出**：`{ body, compressed: boolean, stats: CompressionStats | null }`
- **管线顺序固定**：
  1. `originalBody = body`；`current = body`；`techniquesApplied = []`。
  2. **步骤1**：`collapseWhitespace` → applied 则 push `"whitespace"`。
  3. **步骤2**：`dedupSystemPrompt` → push `"system-dedup"`。
  4. **步骤3（条件）**：`options?.compressToolResults !== false` 时才跑 `compressToolResults` → push `"tool-compress"`。默认跑，显式 `false` 才跳过。
  5. **步骤4**：`removeRedundantContent` → push `"redundant-remove"`。
  6. **步骤5**：`replaceImageUrls` → push `"image-placeholder"`。
  7. `compressed = techniquesApplied.length > 0`。
  8. `stats = compressed ? createCompressionStats(originalBody, current, "lite", techniquesApplied) : null`。
  9. 返回 `{ body: current, compressed, stats }`。
- **techniques 标签全集**（保序子集）：`["whitespace", "system-dedup", "tool-compress", "redundant-remove", "image-placeholder"]`。

### 5.17 `LiteCompressionOptions` 字段与默认值

| 字段 | 类型 | 默认 | 生效点 |
|---|---|---|---|
| `model` | `string?` | — | lite.ts 内未使用（保留字段） |
| `supportsVision` | `boolean \| null ?` | `undefined` | 仅 `replaceImageUrls`；`!== false` 即跳过 |
| `preserveSystemPrompt` | `boolean?` | `undefined`(=false) | `collapseWhitespace`(跳过system)、`dedupSystemPrompt`(整步跳过)、`removeRedundantContent`(跳过system) |
| `compressToolResults` | `boolean?` | `undefined`(≠false→跑) | `applyLiteCompression` 步骤3 开关 |
| `maxToolLength` | `number?` | env `OMNIROUTE_LITE_MAX_TOOL_LENGTH` → 2000 | `compressToolResults` |

---

## 6. 外部辅助函数精确行为

### 6.1 `isVisionModelId(modelId)` — 必须移植（逐字逻辑）

```js
const VISION_MODEL_ID_FRAGMENTS = [ /* §2.3 完整列表，原样 */ ];

function isVisionModelId(modelId) {
  if (!modelId) return false;                          // null/undefined/"" → false
  const normalized = String(modelId).toLowerCase();
  if (/(?:^|\/)mimo-v2\.5-pro(?:$|[:/])/i.test(normalized)) return false;
  if (/(?:^|\/)mimo-v2-pro(?:$|[:/])/i.test(normalized)) return false;
  return VISION_MODEL_ID_FRAGMENTS.some((f) => normalized.includes(f));
}
```

- **语义**：小写化 → 两条 MiMo Pro 排除正则 → 子串包含任一 fragment → true。
- **注意**：fragment 全小写，`normalized.includes(fragment)` 大小写安全。`"claude-fable"` 列表中出现两次（源码原样，无害）。
- **依赖**：无 node API，纯字符串。**直接照抄即可**。

### 6.2 `createCompressionStats(...)` — 最小移植版

原实现（stats.ts）对 original/compressed body 各算一次 token 估算再算节省率。完整实现牵扯 tiktoken/omniglyph/PNG 解码（见 §7），**与压缩正确性无关**。最小行为等价版：

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

> 与原版差异：原版在 Codex 上下文且 ≤50000 字符时用 js-tiktoken 精确计数，并对 base64 图片做专门估算（Anthropic PNG 按 `anthropicImageTokens(w,h,"standard") + 每块 overhead`；OpenAI PNG 按 `openAIVisionTokens(model,w,h)`；不可解码图按 1200/张）。**lite 模式下 stats 只是遥测**，最小版 `chars/4` 在 lite 流水线（图片已被替换成 `[image: fmt]` 短占位符）里误差可接受。需与 OmniRoute 上报数字严格一致时才移植 §7 完整链路。

---

## 7. node API / npm 依赖清单（移植替换点）

| 位置 | 依赖 | 替换方案 |
|---|---|---|
| `lite.ts` `envInt()` | `process.env["OMNIROUTE_LITE_MAX_TOOL_LENGTH"]` | 注入配置对象，或直接常量 2000 |
| `lite.ts` `compressToolResults()` | `Array.prototype.findLastIndex`（ES2023） | 沙箱若无：手写 for 循环从尾扫 |
| `stats.ts` | `Buffer.from(prefix, "base64")`、`bytes.readUInt32BE` | 仅完整版 stats 需要；最小版不引 |
| `stats.ts` | npm 包 `omniglyph`（`anthropicImageTokens`、`ANTHROPIC_IMAGE_BLOCK_OVERHEAD_TOKENS`、`openAIVisionTokens`） | 仅完整版 stats 需要；最小版不引 |
| `stats.ts` | npm 包 `js-tiktoken`（经 `createRequire(import.meta.url)`） | 仅完整版 stats 需要；最小版不引 |
| `tiktokenCounter.ts` | `createRequire`（node `module` API） | 同上 |
| `visionModels.ts` | 无 | 直接可用 |
| `jsonSize.ts` | 无 node API（纯 JS），只服务完整版 stats | 最小版不引 |
| `contextManager.ts` `isInlineBase64ImageBlock` | 无 node API，只服务完整版 stats | 最小版不引 |
| `types.ts` | TS 类型 + `ENGINE_IDS` 常量 | lite 只需要 `"lite"` 字符串字面量 |

**lite.ts 本体的唯一硬性替换点**：`process.env` 一处 + `findLastIndex` 一处。其余全部纯 JS。

---

## 8. 移植检查清单（可测试行为断言）

**collapseWhitespace**
1. `content = "a\n\n\nb"` → `"a\n\nb"`，`applied: true`。
2. `content = "a\n\n\n\n\nb"`（5 个 \n）→ `"a\n\nb"`（**恰好 2 个**，不是按比例）。
3. `content = "a\n\nb"`（2 个 \n）→ 原样，`applied: false`。
4. `content = "foo   \nbar\t\t\n"` → `"foo\nbar\n"`（行尾空格+tab 都被剥，`applied:true`）。
5. `content = ""` → `""`，`applied: false`。
6. `options.preserveSystemPrompt=true` 且 `role:"system"`、`content:"a\n\n\nb"` → 原样。
7. `content` 是数组（如 `[{type:"text",text:"a\n\n\nb"}]`）→ **原样不动**（不递归进 blocks）。
8. `body.messages` 缺失（`{}`）→ 返回**同一引用** `{body, applied:false}`。

**dedupSystemPrompt**
9. 两条 system `content:"hello"`（连续或不连续）→ 第 2 条被删，`applied:true`；第 1 条保留。
10. 两条 system `"  hello  "` 与 `"hello"` → trim 后键相同 → 删第 2 条。
11. 两条 system 共享 trim 后前 200 字符但第 201 字符不同 → **仍被去重**（键只取前 200）。
12. system 的 content 是数组 → 不参与去重，永远保留。
13. `preserveSystemPrompt=true` → 即使两条完全相同 system 也全保留，`applied:false`。
14. system 与 user 内容相同 → 不互查（只 system 对 system）。

**compressToolResults / truncateToolText**
15. `role:"tool"`、`content` 长 3000、`maxToolLength:2000`，且其后存在 assistant → 截到 ≤2000 的词边界 + `"\n...[truncated]"`，`applied:true`。
16. 截断后缀逐字为 `"\n...[truncated]"`（`\n` + 3 点 + `[truncated]`，共 14 字符）。
17. 词边界：第 2000 字符落在单词中间 → 截到该词前空白处（< 2000）；前 80 字符内无空白 → 向后找词尾（> 2000）；±80 窗口都无空白 → 硬切 2000。
18. `role:"tool"` 消息位于**最后一条 assistant 之后**（index ≥ lastAssistant+1）→ 永不截断。
19. 消息列表无 assistant → 无任何截断（`currentTurnStart = messages.length`）。
20. `role:"tool"`、`content.length === 2000`（恰好等于上限）→ 不截断（`<=` 放行）。
21. `role:"tool"` 的 content 是数组 → 不截断。
22. Anthropic 风格：`role:"user"`，`content:[{type:"tool_result", content:"<3000字符>"}]` → inner string 截断，块结构保留。
23. `tool_result` 的 `content` 是数组 `[{type:"text", text:"<3000字符>"}]` → 只截 `part.text`；短 text part 与非 text part 不动。
24. `role:"assistant"` content 数组里的 `tool_result` 块 → 不动（只认 `role:"user"`）。
25. `maxToolLength` 传 100（<256）→ 落默认 2000；传 2000000（>1000000）→ 落默认；传 500.7 → `Math.floor` → 500。

**removeRedundantContent**
26. 连续两条 `role:"user"`、`content:"same"` → 删第 2 条，`applied:true`。
27. 三连 `user"same"` → 删第 2、3 条，剩 1 条（与原始前一条比较，非结果数组）。
28. 两条 `role:"user"` 中间隔一条 assistant → 不删（要求**相邻**）。
29. `role:"tool"` 与前一条 `role:"tool"` content 相同 → **不删**（tool 豁免）。
30. 当前条 content 是数组，前一条是同内容数组 → 不删（前一条必须是 string）。
31. `i=0` 永不删。
32. `preserveSystemPrompt=true` 时两条相同 system → 都保留。
33. `"same "` 与 `"same"`（尾随空格差异）→ 不删（全等，不 trim）。

**replaceImageUrls**
34. `supportsVision:false`，content 含 `{type:"image_url", image_url:{url:"data:image/png;base64,AAAA"}}` → 替换为 `{type:"text", text:"[image: png]"}`，`applied:true`。
35. 同上有 `detail:"high"` 字段 → 替换后 `detail` 丢失（新对象只有 type+text）。
36. `url:"https://example.com/x.png"`（非 data URI）→ 原样保留。
37. `supportsVision:true` / `undefined` / `null` → 全不动（只有显式 `false` 触发）。
38. `options` 传字符串 `"gpt-4o"` → `isVisionModelId("gpt-4o")=true` → 不动；传 `"some-text-model"` → false → 触发剥离。
39. `content` 是 string → 不动。
40. format 提取：`"data:image/jpeg;base64,..."` → `"jpeg"`；`"data:image/svg+xml;base64,..."` → `"svg+xml"`。

**applyLiteCompression 编排**
41. 五步顺序固定：whitespace → system-dedup → tool-compress（可关）→ redundant-remove → image-placeholder。techniquesApplied 保持此相对顺序。
42. 无任何变化 → `{compressed:false, stats:null}`。
43. `options.compressToolResults:false` → 步骤 3 跳过，techniques 不含 `"tool-compress"`。
44. 管线串联：user `"a\n\n\nb"` 先被 whitespace 改成 `"a\n\nb"`，若之后与相邻同 role 消息全等 → 再被 redundant-remove 删（后步骤看到前步骤产物）。
45. `stats.mode === "lite"`；`stats.techniquesUsed` 与 `techniquesApplied` 同数组。

**isVisionModelId**
46. `"openai/gpt-4o"` → true；`"gpt-4"` → false。
47. `"kimi-k2"` → false；`"kimi-k2.5"` → true（fragment 是 `"kimi-k2."`，带句点）。
48. `"mimo-v2.5-pro"`、`"x/mimo-v2.5-pro"`、`"x/mimo-v2.5-pro:free"` → false；`"mimo-v2.5"` → true。
49. `""` / `null` / `undefined` → false。
50. 大小写：`"CLAUDE-3-OPUS"` → true。

**stats（最小版）**
51. `originalTokens=0` → `savingsPercent=0`（不除零）。
52. `savingsPercent` 保留两位小数：`Math.round(x*10000)/100`（33.333… → 33.33）。

---

## 9. 移植要点速记

1. 全部更新不可变（`{...obj}`），无原地修改；`collapseWhitespace`/`dedupSystemPrompt`/`compressToolResults`/`removeRedundantContent` 总是重建 body 与 messages 数组（即使 `applied:false`），`replaceImageUrls` 在 `supportsVision!==false` 或无 messages 时返回原引用。
2. `preserveSystemPrompt` 只影响 `collapseWhitespace`（跳过 system）、`dedupSystemPrompt`（整步跳过）、`removeRedundantContent`（跳过 system）；**不影响** `compressToolResults` 和 `replaceImageUrls`。
3. 图片剥离是**显式 opt-in**：`supportsVision` 必须严格 `=== false`。
4. tool 截断保护当前轮：最后一条 assistant 之后（含）的所有消息免疫；无 assistant 时全部免疫。
5. 去重键设计：system 去重用 `trim().slice(0,200)`；相邻消息去重用**原始全等**（不 trim）。
6. ES2023 `findLastIndex` 与 `process.env` 是 lite.ts 本体仅有的两个环境依赖。
