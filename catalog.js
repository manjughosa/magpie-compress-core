// 压缩引擎目录 —— 逐字照搬 OmniRoute open-sse/services/compression/engineCatalog.ts
// 另加 catalog 外 3 个（ionizer / llm / read-lifecycle）。mcpAccessibility 不是引擎，不收。
//
// 字段对齐 OmniRoute：
//   stackPriority 升序即执行顺序；isSafeDefault(id) === !lossy
//   label 用 OmniRoute 英文原名（用户要求「名字照搬」）
//   why 是本插件加的中文一句话；description 是 OmniRoute 原文

export const ENGINES = [
  {
    id: "session-dedup",
    fields: [
      { key: "minBlockChars", type: "number", label: "最小块字符", description: "小于这个长度的文本块不参与去重", defaultValue: 80, min: 20, max: 4000 },
      { key: "minJaccard", type: "number", label: "相似度阈值", description: "越高越保守，1 表示只合并完全相同的块", defaultValue: 0.85, min: 0.5, max: 1 },
      { key: "shingleSize", type: "number", label: "分片大小", description: "相似度计算的分片长度", defaultValue: 3, min: 2, max: 8 },
    ],
    label: "Session Dedup",
    description:
      "Lossless — elides only text already sent earlier in the same session; nothing is summarized or dropped. Negligible latency overhead.",
    why: "同一会话里已经发过的文本，后面再出现就换成引用；不总结也不丢内容。",
    stackPriority: 3,
    lossy: false,
    cacheImpact: "low",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "ccr",
    fields: [
      { key: "minBlockBytes", type: "number", label: "最小块字节", description: "小于这个大小的块不换成引用", defaultValue: 2048, min: 256, max: 65536 },
      { key: "minRepeat", type: "number", label: "最少重复次数", description: "同一块至少出现几次才折叠", defaultValue: 2, min: 2, max: 10 },
    ],
    label: "CCR",
    description:
      "Lossless — replaces large repeated/contiguous blocks with content-addressed references instead of deleting them; the original content stays retrievable.",
    why: "把大的重复或连续块换成内容寻址引用，原文仍可取回。",
    stackPriority: 4,
    lossy: false,
    cacheImpact: "low",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "lite",
    fields: [
      { key: "compressToolResults", type: "boolean", label: "压缩工具输出", description: "超过 maxToolLength 的工具输出只留头部并标记截断（有损，默认关）", defaultValue: false },
      { key: "preserveSystemPrompt", type: "boolean", label: "保护系统提示词", description: "完全不碰 system 消息", defaultValue: false },
      { key: "maxToolLength", type: "number", label: "工具输出上限", description: "超过这个字符数的工具输出会被截断", defaultValue: 2000, min: 200, max: 20000 },
    ],
    label: "Lite Cleanup",
    description:
      "Safest mode (~15% savings, <1ms latency): whitespace/dedup/formatting cleanup only, zero semantic change. Always safe to leave on.",
    why: "只清空白、重复行和格式，零语义改动，永远可以开着（约 15%）。",
    stackPriority: 5,
    lossy: false,
    cacheImpact: "none",
    isSingleMode: true,
    levels: null,
    sampling: false,
    inputScope: "mixed",
    available: true,
    requires: null,
  },
  {
    id: "rtk",
    fields: [
      { key: "level", type: "select", label: "强度", description: "minimal 只去噪音，aggressive 连摘要一起压", defaultValue: "standard", options: [ { value: "minimal", label: "minimal" }, { value: "standard", label: "standard" }, { value: "aggressive", label: "aggressive" } ] },
    ],
    label: "RTK Tool Output",
    description:
      "Strips ANSI noise, progress bars, and repeated lines from command/tool output while preserving failures, warnings, and summaries (60-90% upstream savings)",
    why: "剥掉命令输出里的 ANSI 噪音、进度条、重复行，保留报错、警告和摘要（60–90%）。",
    stackPriority: 10,
    lossy: true,
    cacheImpact: "moderate",
    isSingleMode: true,
    levels: ["minimal", "standard", "aggressive"],
    sampling: false,
    inputScope: "tool-results",
    available: true,
    requires: null,
  },
  {
    id: "codex-responses",
    fields: [
      { key: "compressShell", type: "boolean", label: "压缩 shell 输出", defaultValue: true },
      { key: "compressPatch", type: "boolean", label: "压缩 patch 输出", defaultValue: true },
      { key: "compressSearch", type: "boolean", label: "压缩 search 输出", defaultValue: true },
      { key: "compressBuild", type: "boolean", label: "压缩 build 输出", defaultValue: true },
    ],
    label: "Codex Tool Output",
    description:
      "Conservative compression of shell/patch/search/build tool output on the OpenAI Responses API.",
    why: "Responses 接口里 shell / patch / search / build 工具输出的保守压缩。",
    stackPriority: 12,
    lossy: true,
    cacheImpact: "low",
    isSingleMode: true,
    levels: null,
    sampling: false,
    inputScope: "tool-results",
    available: true,
    requires: null,
  },
  {
    id: "headroom",
    fields: [
      { key: "minRows", type: "number", label: "最小行数", description: "表格行数少于这个值就不压", defaultValue: 8, min: 2, max: 200 },
    ],
    label: "Headroom (GCF)",
    description:
      "Column-wise compaction of tabular JSON into [N rows] form while keeping the structure readable.",
    why: "把表格化的 JSON 按列压紧成 [N rows]，结构仍然可读。",
    stackPriority: 15,
    lossy: false,
    cacheImpact: "low",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "tool-results",
    available: true,
    requires: null,
  },
  {
    id: "relevance",
    fields: [
      { key: "overlapThreshold", type: "number", label: "重叠阈值", description: "与用户问题词重叠低于此值的句子被丢掉（默认 0.1）", defaultValue: 0.1, min: 0, max: 1 },
      { key: "budgetPercent", type: "number", label: "保留预算", description: "最多保留原文的多少比例，是上限不是目标（默认 0.5）", defaultValue: 0.5, min: 0.1, max: 1 },
      { key: "boilerplateWeight", type: "number", label: "套话权重", description: "套话句子的降权幅度（默认 0.5）", defaultValue: 0.5, min: 0, max: 1 },
    ],
    label: "Relevance",
    description:
      "Sentence-level relevance scoring against the last user query; low-scoring sentences are dropped.",
    why: "按最后一条用户消息给句子打分，丢掉低分句。",
    stackPriority: 18,
    lossy: true,
    cacheImpact: "moderate",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "caveman",
    fields: [
      { key: "lang", type: "select", label: "语言", description: "auto 按内容自动判断", defaultValue: "auto", options: [ { value: "auto", label: "auto" }, { value: "zh", label: "中文" }, { value: "en", label: "English" }, { value: "ja", label: "日本語" }, { value: "de", label: "Deutsch" }, { value: "es", label: "Español" }, { value: "fr", label: "Français" }, { value: "it", label: "Italiano" }, { value: "pt-BR", label: "Português" }, { value: "ru", label: "Русский" }, { value: "hu", label: "Magyar" }, { value: "id", label: "Indonesia" } ] },
      { key: "groups", type: "multiselect", label: "规则组", description: "启用哪些规则类别", defaultValue: ["dedup", "filler", "context", "structural", "ultra"], options: [ { value: "dedup", label: "去重" }, { value: "filler", label: "填充词" }, { value: "context", label: "上下文冗余" }, { value: "structural", label: "句式结构" }, { value: "ultra", label: "激进" } ] },
    ],
    label: "Caveman",
    description:
      "Rule-based prose compaction (~30% at full strength) driven by per-language rule packs.",
    why: "按语言规则表删掉啰嗦措辞、客套话、冗余从句，保留代码与事实（约 30%）。",
    stackPriority: 20,
    lossy: true,
    cacheImpact: "moderate",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "read-lifecycle",
    fields: [
      { key: "keepStub", type: "boolean", label: "保留短 stub", description: "折叠后留一行说明，而不是完全删掉", defaultValue: true },
      { key: "stubChars", type: "number", label: "stub 长度", description: "折叠后保留的字符数", defaultValue: 120, min: 0, max: 600 },
    ],
    label: "Read Lifecycle",
    description:
      "Collapses Read tool results that a strictly-later Read or Write superseded, keeping only the newest view of each path.",
    why: "同一文件反复 Read 时，把被后续 Read/Write 覆盖掉的旧结果折叠成短 stub，只留最新一次。（注意：同一条路径被再次 Read/Write 时，更早的结果会被折叠，prefix 随之失配。）",
    stackPriority: 22,
    lossy: true,
    cacheImpact: "moderate",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "tool-results",
    available: true,
    requires: null,
  },
  {
    id: "aggressive",
    fields: [
      { key: "keepTurns", type: "number", label: "保留最近轮次", description: "最近这么多轮对话原样保留", defaultValue: 4, min: 1, max: 30 },
      { key: "summaryChars", type: "number", label: "摘要长度", description: "每段被摘要化内容的字符上限", defaultValue: 400, min: 80, max: 4000 },
    ],
    label: "Aggressive",
    description:
      "Summarizes older turns and progressively ages them out (~50%), keeping recent detail intact.",
    why: "把较早的轮次摘要化并逐步老化，只保留最近的细节（约 50%）。（注意：每新增一轮对话都会重写更早的轮次，prompt cache 的 prefix 会随之前移失配。）",
    stackPriority: 30,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "llmlingua",
    fields: [
      { key: "rate", type: "number", label: "压缩率", description: "保留多少比例的内容", defaultValue: 0.5, min: 0.1, max: 0.9 },
    ],
    label: "LLMLingua-2",
    description:
      "LLMLingua-2 ONNX semantic pruning on a worker thread; the model is an optional dependency.",
    why: "用 LLMLingua-2 的 ONNX 模型做语义剪枝。",
    stackPriority: 35,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: false,
    requires: "需要 @atjsh/llmlingua-2 + ONNX 模型文件，插件宿主里跑不了 worker",
  },
  {
    id: "ultra",
    fields: [
      { key: "compressionRate", type: "number", label: "保留比例", description: "剪枝后保留多少比例的 token（默认 0.5 = 保留一半），数值越低压得越狠。上游语义是「keep」不是「prune」", defaultValue: 0.5, min: 0.05, max: 0.95 },
      { key: "minScoreThreshold", type: "number", label: "分数门槛", description: "低于此分的 token 才可剪，分数越高剪得越少（默认 0.3）", defaultValue: 0.3, min: 0, max: 1 },
      { key: "maxTokensPerMessage", type: "number", label: "单条上限", description: "单条消息最多处理的 token 数，0 表示不限", defaultValue: 0, min: 0, max: 100000 },
    ],
    label: "Ultra",
    description:
      "Heuristic token-level pruning (~75%) — the most aggressive fully-local option.",
    why: "启发式 token 级剪枝，最激进的纯本地压缩（约 75%）。",
    stackPriority: 40,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "ionizer",
    fields: [
      { key: "sampleRate", type: "number", label: "采样率", description: "保留多少比例的片段", defaultValue: 0.4, min: 0.1, max: 0.9 },
    ],
    label: "Ionizer",
    description:
      "Sampling-based compaction that drops low-information fragments and keeps the skeleton and key facts. Deliberately lossy.",
    why: "按采样策略丢掉低信息量片段，保留骨架与关键事实（故意有损）。",
    stackPriority: 50,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: false,
    levels: null,
    sampling: true,
    inputScope: "messages",
    available: true,
    requires: null,
  },
  {
    id: "llm",
    fields: [
      { key: "maxChars", type: "number", label: "单段上限", description: "交给后端压缩的文本长度上限", defaultValue: 4000, min: 500, max: 20000 },
    ],
    label: "LLM Compressor",
    description:
      "Condenses prose through a pluggable chat-completion backend. Ships with a no-op backend, so out of the box it never mutates the payload.",
    why: "用一个 LLM 压缩散文。没有外部模型后端时原样放行。",
    stackPriority: 60,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: false,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: false,
    requires: "需要一个外部 chat-completion 后端，本插件内无法提供",
  },
  {
    id: "omniglyph",
    fields: [
      { key: "dpi", type: "number", label: "渲染 DPI", description: "上下文转图片时的清晰度", defaultValue: 150, min: 72, max: 300 },
    ],
    label: "OmniGlyph",
    description:
      "Experimental context-as-image encoding routed directly to Claude Fable 5 only — the most aggressive and least broadly compatible option; not recommended as a general-purpose default.",
    why: "把上下文编码成图片喂给模型（实验性，只对 Claude Fable 5 直连有效，最激进也最不通用）。",
    stackPriority: 90,
    lossy: true,
    cacheImpact: "high",
    isSingleMode: true,
    levels: null,
    sampling: false,
    inputScope: "messages",
    available: false,
    requires: "需要 omniglyph npm 包与支持图片直传的供应商",
  },
]

// stackPriority 升序 = 执行顺序
export const ORDER = ENGINES.slice().sort((a, b) => a.stackPriority - b.stackPriority).map((e) => e.id)

export const PRESET_NAMES = ["off", "safe", "custom", "all"]

const byId = new Map(ENGINES.map((e) => [e.id, e]))
export function engineById(id) {
  return byId.get(id) || null
}

// 稳妥档 = OmniRoute 的 isSafeDefault(id) === !lossy
export function isSafeDefault(engine) {
  return engine.lossy === false
}

export function presetStrategies(preset) {
  const out = {}
  for (const e of ENGINES) {
    if (preset === "off") out[e.id] = false
    else if (preset === "all") out[e.id] = true
    else if (preset === "safe") out[e.id] = e.available && isSafeDefault(e)
    else out[e.id] = e.available && isSafeDefault(e) // custom 的起点 = 稳妥
  }
  return out
}

function sameAs(strategies, target) {
  for (const e of ENGINES) {
    if ((strategies[e.id] === true) !== (target[e.id] === true)) return false
  }
  return true
}

export function detectPreset(strategies) {
  if (!strategies) return "safe"
  if (sameAs(strategies, presetStrategies("off"))) return "off"
  if (sameAs(strategies, presetStrategies("all"))) return "all"
  if (sameAs(strategies, presetStrategies("safe"))) return "safe"
  return "custom"
}

// 把旧版的驼峰键（sessionDedup / codexResponses）迁移到 OmniRoute 原名
const LEGACY_KEYS = { sessionDedup: "session-dedup", codexResponses: "codex-responses" }
export function normalizeStrategies(strategies) {
  if (!strategies || typeof strategies !== "object") return null
  const out = {}
  for (const [key, value] of Object.entries(strategies)) {
    out[LEGACY_KEYS[key] || key] = value === true
  }
  return out
}
