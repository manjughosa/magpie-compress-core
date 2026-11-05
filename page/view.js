// 面板的纯函数层：把 catalog 元数据 + 运行时统计合成卡片模型。
// 不碰 DOM，可以直接在 node 里 eval 后用假数据测。
(function () {
  "use strict"

  var CAT = globalThis.CompressCatalog || { engines: [], order: [], presets: [] }

  var TEXT = {
    en: {
      title: "Compression",
      subtitle: "Shrinks what leaves for the model. Every strategy runs in order, cheapest first.",
      presets: { off: "Off", safe: "Safe", custom: "Custom", all: "All" },
      presetHint: {
        off: "Nothing runs. Requests pass through untouched.",
        safe: "Only lossless strategies — content is never summarized or dropped.",
        custom: "Your own mix.",
        all: "Every available strategy, including the lossy ones.",
      },
      requests: "Requests",
      saved: "Saved",
      rate: "Rate",
      share: "Share",
      failedOpen: "Failed open",
      kept: "kept",
      cut: "saved",
      tokensSaved: "tokens saved",
      lastRequest: "last request",
      advanced: "Advanced",
      config: "Settings",
      meta: "At a glance",
      clickDetail: "Open details",
      closeDetail: "Close details",
      noRecent: "No requests yet.",
      showAll: "Show all",
      showLess: "Show less",
      emptyMeter: "Send a request through magpie to see the first numbers.",
      ofPrompt: "of the prompt",
      perRequest: "per request",
      strategies: "Strategies",
      recent: "Recent",
      budget: "Time budget",
      budgetHint: "ms per request. Past it, the rest of the pipeline is skipped.",
      preserve: "Preserve",
      preserveSystem: "System prompt",
      preserveHint: "Keep the system prompt and the newest turns out of lossy rewrites.",
      lastTurns: "Last turns",
      statsFileNote:
        "Counts and snapshots go to stats.json and captures/ under the plugin config folder (magpie/compress-core/). The page sandbox can read plugin settings but not files, so there are no live numbers here.",
      lastWrite: "Last write",
      never: "never",
      loadedAt: "Loaded",
      writeEvery: "at most once a second",
      lossless: "lossless",
      lossy: "lossy",
      sampling: "sampled",
      unavailable: "unavailable",
      needs: "Needs",
      on: "on",
      off: "off",
      hits: "hits",
      never: "never",
      noData: "No requests yet. Send one through magpie and this fills in.",
      allOff: "Every strategy is off — nothing is being compressed.",
      detail: "Details",
      priority: "Order",
      cacheImpact: "Cache impact",
      inputScope: "Reads",
      model: "Model",
      agent: "Agent",
      before: "Before",
      after: "After",
      took: "Took",
      when: "When",
      scopeMessages: "messages",
      scopeToolResults: "tool output",
      scopeMixed: "mixed",
      cacheNone: "none",
      cacheLow: "low",
      cacheModerate: "moderate",
      cacheHigh: "high",
      tier: "Compression level",
      tier1: "Light",
      tier2: "Moderate",
      tier3: "Strong",
      tier4: "Extreme",
      tierMeasured: "measured {pct}% median · {n} runs",
      tierNone: "not measured",
      note: "Note: ",
      save: "Save",
      saving: "Saving…",
      savedDone: "Saved",
      failedRead: "Could not read options",
      failedWrite: "Could not save options",
      savedOk: "Saved and applied",
      ccrInstall: "Install retrieve tool",
      ccrSent: "Submitted — runs on the next request",
      ccrDone: "retrieve tool installed",
      ccrFailed: "Install failed — click to retry",
      clearConfirm: "Click again to confirm",
      clearSent: "Submitted — runs on the next local request",
      justNow: "just now",
      minutesAgo: "{n}m ago",
      hoursAgo: "{n}h ago",
      daysAgo: "{n}d ago",
    },
    zh: {
      title: "压缩",
      subtitle: "在请求离开本机之前把它缩小。每个策略按顺序执行，先跑便宜的。",
      presets: { off: "关闭", safe: "稳妥", custom: "自定义", all: "全开" },
      presetHint: {
        off: "什么都不跑，请求原样通过。",
        safe: "只开无损策略——不总结、不丢内容。",
        custom: "你自己配的组合。",
        all: "所有可用的策略都开，包括有损的。",
      },
      requests: "请求数",
      saved: "省下",
      rate: "压缩率",
      share: "占总节省",
      failedOpen: "失败放行",
      kept: "保留",
      cut: "省下",
      tokensSaved: "省下 token",
      lastRequest: "上次请求",
      advanced: "高级",
      config: "参数",
      meta: "概况",
      clickDetail: "展开详情",
      closeDetail: "收起详情",
      noRecent: "还没有请求。",
      showAll: "显示全部",
      showLess: "收起",
      emptyMeter: "让一个请求穿过 magpie，这里就会出现第一组数字。",
      ofPrompt: "占原始体积",
      perRequest: "每次请求",
      strategies: "策略",
      recent: "最近",
      budget: "时间预算",
      budgetHint: "每次请求的毫秒数。超了就跳过剩下的管线。",
      preserve: "保留",
      preserveSystem: "系统提示词",
      preserveHint: "系统提示词和最近几轮不参与有损改写。",
      lastTurns: "最近轮次",
      statsFileNote:
        "统计与快照写在插件配置目录的 compress-core/stats.json 与 captures/。页面沙箱只能读插件设置、读不到文件，所以这一页不显示实时数字。",
      lastWrite: "上次写入",
      never: "从未",
      loadedAt: "已加载",
      writeEvery: "每秒最多一次",
      lossless: "无损",
      lossy: "有损",
      sampling: "采样",
      unavailable: "不可用",
      needs: "需要",
      on: "开",
      off: "关",
      hits: "命中",
      noData: "还没有请求。让一个请求穿过 magpie，这里就会填上。",
      allOff: "所有策略都关着——现在什么都没压。",
      detail: "详情",
      priority: "顺序",
      cacheImpact: "缓存影响",
      inputScope: "读取",
      model: "模型",
      agent: "Agent",
      before: "压缩前",
      after: "压缩后",
      took: "耗时",
      when: "时间",
      scopeMessages: "对话",
      scopeToolResults: "工具输出",
      scopeMixed: "混合",
      cacheNone: "无",
      cacheLow: "低",
      cacheModerate: "中",
      cacheHigh: "高",
      tier: "压缩等级",
      tier1: "轻度",
      tier2: "中度",
      tier3: "强",
      tier4: "极限",
      tierMeasured: "实测中位 {pct}% · {n} 次",
      tierNone: "未实测",
      note: "注意：",
      save: "保存",
      saving: "保存中…",
      savedDone: "已保存",
      failedRead: "读不到配置",
      failedWrite: "保存失败",
      savedOk: "已保存并生效",
      ccrInstall: "安装 retrieve 工具",
      ccrSent: "已提交，下个请求执行",
      ccrDone: "retrieve 工具已装好",
      ccrFailed: "安装失败，点击重试",
      clearConfirm: "再点一次确认",
      clearSent: "已提交，下一次本地请求时执行",
      justNow: "刚刚",
      minutesAgo: "{n} 分钟前",
      hoursAgo: "{n} 小时前",
      daysAgo: "{n} 天前",
    },
  }

  // OmniRoute 原文是英文；中文界面用这组等价说明，技术含义保持一致。
  var DESC_ZH = {
    "session-dedup": "无损：只省略同一会话里此前已经发过的文本，不总结也不删除；延迟几乎为零。",
    ccr: "无损：把大的重复或连续块换成内容寻址引用，而不是删掉；原文仍可取回。",
    lite: "最保守（约省 15%，延迟 <1ms）：只做空白、去重和格式清理，不改变语义；可以一直开着。",
    rtk: "剥掉命令/工具输出里的 ANSI 噪声、进度条和重复行，保留失败、警告和摘要（上游省 60–90%）。",
    "codex-responses": "对 OpenAI Responses API 的 shell/patch/search/build 工具输出做保守压缩。",
    headroom: "把表格化 JSON 按列压成 [N rows] 形式，结构仍然可读。",
    "leanctx-structured": "把工具输出中的 CSV/TSV 和 YAML 清单整理成结构化数据；常量只留一次，可选择丢弃高熵列。",
    relevance: "按最后一条用户消息给句子打分，丢掉低分句。",
    caveman: "按语言规则包做基于规则的散文压缩（全强度约省 30%）。",
    "read-lifecycle": "折叠被后续 Read/Write 覆盖的 Read 结果，每个路径只保留最新视图。",
    aggressive: "摘要较早的轮次并逐步老化（约省 50%），最近的细节保持不变。",
    llmlingua: "在 worker 线程上做 LLMLingua-2 ONNX 语义剪枝；模型是可选依赖。",
    ultra: "启发式 token 级剪枝（约 75%），最激进的纯本地选项。",
    ionizer: "采样式压缩，丢掉低信息片段，保留骨架和关键事实；故意有损。",
    llm: "通过可插拔的 chat-completion 后端压缩散文；默认后端是 no-op，开箱即用不会改请求。",
    omniglyph: "实验性的上下文转图片编码，只直连 Claude Fable 5；最激进、兼容性最窄，不建议作为通用默认。",
  }

  // English card copy and parameter labels. The catalog keeps the Chinese
  // panel labels as its display source; this map is the English peer.
  var WHY_EN = {
    "session-dedup": "Replace text already sent in this session with a reference; nothing is summarized or dropped.",
    ccr: "Replace large repeated or contiguous blocks with content-addressed references; originals stay retrievable.",
    lite: "Whitespace, repeated lines and formatting only — never wording. Fastest, always safe.",
    rtk: "Strip ANSI noise, progress bars and repeated rows from tool output; keep errors, warnings and summaries.",
    "codex-responses": "Conservative trimming of shell / patch / search / build output on the Responses API.",
    headroom: "Tabular JSON becomes columnar; constant columns are declared once and restored from the GCF payload.",
    "leanctx-structured": "Compact CSV/TSV/YAML tool output; constants once, optional high-entropy column dropping.",
    relevance: "Score sentences against the last user message and drop the low ones.",
    caveman: "Rule-based prose compression with rule packs for 11 languages.",
    "read-lifecycle": "Fold file reads superseded by a later Read/Write into a short stub.",
    aggressive: "Summarize and age older turns.",
    llmlingua: "LLMLingua-2 ONNX semantic pruning on worker threads; optional model dependency.",
    ultra: "Heuristic token-level pruning; the most aggressive local option.",
    ionizer: "Sampling-based compression; deliberately lossy.",
    llm: "Compress prose through a pluggable chat-completion backend; no-op without a backend.",
    omniglyph: "Experimental context-to-image encoding for Claude Fable 5 only; narrowest compatibility.",
  }

  var NOTE_EN = {
    ccr: "Scope note: ccr could handle larger blocks, but investigation confirmed that replacing tool output with retrieval markers breaks the agent tool loop; tool-output compression is intentionally excluded from ccr and not merged into compress-core.",
    rtk: "Do not enable this together with Magpie's official RTK compression: both process tool output, the same block gets rewritten twice, savings do not double, and failures become hard to attribute. Turn the official one off if you enable this.",
  }

  var REQUIRES_EN = {
    "需要 @atjsh/llmlingua-2 + ONNX 模型文件，插件宿主里跑不了 worker": "Requires @atjsh/llmlingua-2 + ONNX model files; the plugin host cannot run worker threads",
    "可选：由可信 Bun 宿主配置现有网关的 chat-completion 后端；未配置时 no-op": "Optional: the trusted Bun host can configure a chat-completion backend from the existing gateway; no-op when unconfigured",
    "需要 omniglyph npm 包与支持图片直传的供应商": "Requires the omniglyph npm package and a provider that accepts inline images",
  }

  var OPTION_EN = {
    "轻（minimal）": "Light (minimal)",
    "标准（standard）": "Standard",
    "激进（aggressive）": "Aggressive",
    "YAML 清单": "YAML manifests",
    "自动检测": "Auto-detect",
    "简体中文": "Simplified Chinese",
    "日本語": "Japanese",
    "上下文（context）": "Context",
    "去重（dedup）": "Dedup",
    "填充词（filler）": "Filler words",
    "结构（structural）": "Structural",
    "激进（ultra）": "Ultra",
    "轻（lite）": "Light (lite)",
    "标准（full）": "Standard (full)",
    "本机 Magpie": "Local Magpie",
  }

  // [label, description] keyed by strategy id and config field key. Fields whose
  // labels are already English are left out and fall through unchanged.
  var FIELD_EN = {
    "session-dedup": {
      minBlockChars: ["Minimum block chars", "Blocks shorter than this are not deduplicated."],
      fuzzy: ["Fuzzy near-duplicate dedup", "Replace a whole message whose similarity to an earlier message is 85% or more with a retrievable CCR reference. Requires the caller's CCR retrieve tool; otherwise skipped. Similarity threshold and other fine settings are options-only."],
      preserveCurrentTurn: ["Preserve current turn", "Off by default: the turn being sent is deduplicated too, keeping the prefix strictly stable. On: send the current turn as-is; it is rewritten once when it becomes history, costing one cache miss."],
    },
    ccr: {
      minBlockBytes: ["Minimum block bytes", "Blocks smaller than this UTF-8 byte count are not replaced; 0 uses only the minChars character threshold."],
      minRepeat: ["Minimum repeats", "How many times the same block must appear in this body before folding; 1 = upstream semantics (no repeat required)."],
      requireRetrieveTool: ["Require the caller to retrieve", "Upstream gate: compress only when tools[] declares omniroute_ccr_retrieve. Turning it off leaves markers unredeemable and makes the engine effectively lossy."],
    },
    lite: {
      compressToolResults: ["Compress tool output", "Keep only the head of tool output over maxToolLength and mark it truncated (lossy, off by default). Turning it on rewrites messages the model has already read and moves the prefix; keeping only the head also loses errors that live at the tail. Use rtk instead if error lines must be preserved."],
      maxToolLength: ["Tool output limit", "Tool output longer than this is truncated, only when “Compress tool output” is on. Values below 2000 fall back to 2000."],
      preserveSystemPrompt: ["Preserve the system prompt", "Never touch system messages. Off by default: system segments also take part in whitespace folding and duplicate removal."],
      preserveCurrentTurn: ["Preserve current turn", "Off by default: rewrite everything, keeping the prefix strictly stable and the cache never missing (the text just typed is whitespace-folded too). On: send everything after the last assistant message as-is, rewriting it once when it becomes history and costing one cache miss."],
      supportsVision: ["Target model can see images", "Default true (images untouched). Set false to replace data:image/* attachments with a one-line [image: png] placeholder — a compatibility treatment for models that cannot read images, not compression. Older versions guessed from the model name and could replace user screenshots for names that did not look visual."],
    },
    rtk: {
      intensity: ["Intensity", "minimal relaxes line caps and only removes noise; standard is the default; aggressive tightens head/tail retention and compresses harder."],
      maxLinesPerResult: ["Max lines per result", "Truncate tool output beyond this many lines, keeping head + tail + error lines (the severity list is always kept). 0 disables line truncation."],
      maxCharsPerResult: ["Max chars per result", "Character cap after line truncation. 0 disables character truncation."],
      deduplicateThreshold: ["Repeated-line fold threshold", "Fold a line repeated consecutively this many times into one summary with a count."],
      enableGrouping: ["Group similar lines", "Group structurally similar lines (off by default, opt-in)."],
      groupingThreshold: ["Grouping threshold", "Group only when this many similar lines appear; effective only when “Group similar lines” is on."],
      disabledFilters: ["Disabled built-in filters", "Checked built-in filters do not run. Empty = all enabled."],
      applyToToolResults: ["Apply to tool results", "Process tool / tool_result content (on by default). Turning it off effectively disables this engine."],
      preserveDocstrings: ["Preserve docstrings", "Keep docstrings and documentation comments inside code blocks verbatim (on by default)."],
    },
    "codex-responses": {
      minBytes: ["Minimum output bytes", "Do not compress tool output smaller than this (not worth it)."],
      maxOutputBytes: ["Maximum output bytes", "Per-tool-output processing cap; larger outputs are not compressed."],
      maxCandidateBytes: ["Maximum candidate bytes", "Byte cap for candidate blocks considered for compression."],
      maxLines: ["Max retained lines", "Maximum lines retained after folding log-like output."],
      minSearchMatches: ["Minimum search matches", "Fold web_search-like output only when it has at least this many matches."],
      minLogLines: ["Minimum log lines", "Fold log-like output only when it has at least this many lines."],
    },
    headroom: {
      minRows: ["Minimum rows", "Do not compress a tabular JSON array with fewer rows than this (little to save)."],
    },
    "leanctx-structured": {
      dropEntropy: ["High-entropy column drop threshold", "1 = drop no columns; below 1 drops columns whose unique-value ratio reaches the threshold. Tool output only."],
      formats: ["Formats", "Only explicitly recognized CSV/TSV/YAML; never ordinary conversation or JSON."],
    },
    caveman: {
      lang: ["Language", "auto detects from content (Han characters without kana => Chinese; otherwise keyword scoring); falls back to the English rule pack."],
      groups: ["Rule groups", "Run only the selected rule groups. The zh pack has only dedup / filler / ultra."],
      intensity: ["Intensity", "lite removes pleasantries only; full adds structural rewriting; ultra is the most aggressive."],
      compressRoles: ["Roles", "Compress user messages only by default; system prompts and assistant history stay as-is."],
      preserveCode: ["Preserve code and paths", "Code fences, inline code, URLs, file paths and error lines are never rewritten. Turning this off risks breaking code."],
      minMessageLength: ["Minimum message length", "Skip text shorter than this (rules can misfire on short sentences)."],
    },
    "read-lifecycle": {
      keepStub: ["Keep stub line", "Off clears old Read results entirely (smallest, but leaves the model no trace)."],
      stubChars: ["Stub summary chars", "How many original characters the summary keeps when stubKeepSummary is on; 0 = chars/lines only."],
      stubKeepSummary: ["Keep original summary in stub", "Append “original N chars / M lines + opening fragment” to the stub so the model knows what was folded."],
      readToolNames: ["Read tool names", "Empty = built-in set; non-empty = replace the built-in set."],
      writeToolNames: ["Write tool names", "Empty = built-in set; non-empty = replace the built-in set."],
    },
    aggressive: {
      keepTurns: ["Keep recent turns", "Keep this many recent turns verbatim."],
      summaryChars: ["Summary length", "Character cap for each summarized block."],
    },
    llmlingua: {
      rate: ["Compression rate", "Fraction of content to retain."],
    },
    ultra: {
      compressionRate: ["Retention ratio", "Fraction of word tokens to keep after pruning (0–1, default 0.5 = keep half). Lower values prune harder."],
      minScoreThreshold: ["Score threshold", "Only tokens below this score are eligible for pruning; higher scores prune less."],
      maxTokensPerMessage: ["Per-message cap", "Maximum tokens processed per message; 0 = unlimited."],
    },
    ionizer: {
      sampleRate: ["Sample rate", "Fraction of fragments to retain."],
    },
    llm: {
      model: ["Backend model", "Used only in the trusted Bun host; choose a provider/model from the existing gateway. No model configured = no-op."],
      baseUrl: ["Backend URL", "OpenAI-compatible /v1 URL, defaulting to local Magpie; never paste a key here."],
      timeoutMs: ["Backend timeout (ms)", "After a timeout that segment stays as-is and does not block the request."],
      maxChars: ["Per-segment cap", "Maximum text length handed to the backend."],
    },
    omniglyph: {
      dpi: ["Render DPI", "Sharpness when converting context to an image."],
    },
  }

  function text(lang) {
    return String(lang || "").toLowerCase().indexOf("zh") === 0 ? TEXT.zh : TEXT.en
  }

  function whyEn(id) {
    return WHY_EN[id] || ""
  }

  function count(n) {
    n = Number(n) || 0
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B"
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M"
    if (n >= 1e5) return Math.round(n / 1e3) + "K"
    return n.toLocaleString("en-US")
  }

  function bytes(n) {
    n = Number(n) || 0
    if (n >= 1024 * 1024 * 1024) return (n / 1073741824).toFixed(1) + " GB"
    if (n >= 1024 * 1024) return (n / 1048576).toFixed(1) + " MB"
    if (n >= 1024) return Math.round(n / 1024) + " KB"
    return n + " B"
  }

  function pct(part, whole) {
    if (!whole) return "0%"
    return Math.round((Number(part) / Number(whole)) * 100) + "%"
  }

  function dur(ms) {
    ms = Number(ms)
    if (!ms) return "—"
    if (ms < 1) return "<1 ms"
    if (ms < 1000) return Math.round(ms) + " ms"
    return (ms / 1000).toFixed(1) + " s"
  }

  function ago(iso, t) {
    if (!iso) return t.never
    var ms = Date.now() - new Date(iso).getTime()
    if (!isFinite(ms) || ms < 0) return t.justNow
    var m = Math.floor(ms / 60000)
    if (m < 1) return t.justNow
    if (m < 60) return t.minutesAgo.replace("{n}", m)
    var h = Math.floor(m / 60)
    if (h < 24) return t.hoursAgo.replace("{n}", h)
    return t.daysAgo.replace("{n}", Math.floor(h / 24))
  }

  function engines() {
    return CAT.engines || []
  }

  function presetStrategies(name) {
    var out = {}
    engines().forEach(function (e) {
      if (name === "off") out[e.id] = false
      else if (name === "all") out[e.id] = true
      else out[e.id] = e.available !== false && !e.lossy
    })
    return out
  }

  function sameAs(strategies, target) {
    var list = engines()
    for (var i = 0; i < list.length; i++) {
      var id = list[i].id
      if ((strategies[id] === true) !== (target[id] === true)) return false
    }
    return true
  }

  function presetOf(strategies) {
    if (!strategies) return "safe"
    if (sameAs(strategies, presetStrategies("off"))) return "off"
    if (sameAs(strategies, presetStrategies("all"))) return "all"
    if (sameAs(strategies, presetStrategies("safe"))) return "safe"
    return "custom"
  }

  function tiles(stats, lang) {
    var t = text(lang)
    var s = stats || {}
    return [
      { k: t.requests, v: count(s.requests), s: s.requests ? t.perRequest : "" },
      { k: t.saved, v: bytes(s.savedBytes), s: s.beforeBytes ? pct(s.savedBytes, s.beforeBytes) + " " + t.ofPrompt : "" },
      { k: t.rate, v: pct(s.savedBytes, s.beforeBytes), s: bytes(s.beforeBytes) },
      { k: t.failedOpen, v: count(s.failOpen), s: s.failOpen ? t.failedOpen : "", bad: (s.failOpen || 0) > 0 },
    ]
  }

  function badgeFor(e, t) {
    if (e.available === false) return { label: t.unavailable, tone: "muted" }
    if (e.sampling) return { label: t.sampling, tone: "warn" }
    return e.lossy ? { label: t.lossy, tone: "warn" } : { label: t.lossless, tone: "ok" }
  }

  function scopeLabel(e, t) {
    if (e.inputScope === "tool-results") return t.scopeToolResults
    if (e.inputScope === "mixed") return t.scopeMixed
    return t.scopeMessages
  }

  function cacheLabel(e, t) {
    var m = { none: t.cacheNone, low: t.cacheLow, moderate: t.cacheModerate, high: t.cacheHigh }
    return m[e.cacheImpact] || e.cacheImpact || "—"
  }

  function cards(strategies, stats, lang) {
    var t = text(lang)
    var s = stats || {}
    var per = s.strategies || {}
    var totalSaved = Number(s.savedBytes) || 0
    return engines()
      .slice()
      .sort(function (a, b) { return a.stackPriority - b.stackPriority })
      .map(function (e) {
        var run = per[e.id] || {}
        var saved = Number(run.savedBytes) || 0
        var on = strategies ? strategies[e.id] === true : e.available !== false && !e.lossy
        var badge = badgeFor(e, t)
        var isEn = t === TEXT.en
        var fieldMeta = isEn && FIELD_EN[e.id] ? FIELD_EN[e.id] : null
        var fields = (e.fields || []).map(function (f) {
          var en = fieldMeta && fieldMeta[f.key]
          var options = (f.options || []).map(function (o) {
            return isEn && OPTION_EN[o.label] ? { value: o.value, label: OPTION_EN[o.label] } : o
          })
          return {
            key: f.key,
            type: f.type,
            label: en ? en[0] : f.label,
            description: en ? en[1] : (f.description || ""),
            defaultValue: f.defaultValue,
            options: options.length ? options : null,
            min: f.min,
            max: f.max,
          }
        })
        return {
          id: e.id,
          label: e.label,
          why: isEn ? (WHY_EN[e.id] || e.why) : e.why,
          description: (t === TEXT.zh && DESC_ZH[e.id]) || e.description,
          badge: badge.label,
          tone: badge.tone,
          available: e.available !== false,
          requires: isEn ? (REQUIRES_EN[e.requires] || e.requires || "") : (e.requires || ""),
          on: on,
          runs: Number(run.runs) || 0,
          saved: saved,
          share: totalSaved ? saved / totalSaved : 0,
          gain: saved ? "−" + bytes(saved) : "—",
          priority: e.stackPriority,
          cacheImpact: cacheLabel(e, t),
          inputScope: scopeLabel(e, t),
          lossy: !!e.lossy,
          sampling: !!e.sampling,
          tier: e.tier || null,
          tierLabel: e.tier ? (t["tier" + e.tier] || "") : "",
          tierPct: typeof e.tierPct === "number" ? e.tierPct : null,
          tierN: typeof e.tierN === "number" ? e.tierN : null,
          note: isEn ? (NOTE_EN[e.id] || e.note || "") : (e.note || ""),
          fields: fields,
        }
      })
  }

  function recent(stats, lang, limit) {
    var t = text(lang)
    var list = (stats && stats.recent) || []
    return list.slice(0, limit || 8).map(function (r) {
      return {
        when: ago(r.ts ? new Date(r.ts).toISOString() : null, t),
        model: r.model || "—",
        agent: r.agent || "—",
        before: bytes(r.beforeBytes),
        after: bytes(r.afterBytes),
        took: dur(r.totalMs),
        bad: !!r.failOpen,
      }
    })
  }

  // 顶部的压缩尺：一条读数把「进来多少、出去多少、省了多少」讲完。
  // 不做四个大色块，压缩本身有一条可画的横轴。
  function meter(stats, lang) {
    var t = text(lang)
    var s = stats || {}
    var before = Number(s.beforeBytes) || 0
    var after = Number(s.afterBytes) || 0
    var saved = Number(s.savedBytes) || 0
    var requests = Number(s.requests) || 0
    var rate = before ? Math.round((saved / before) * 100) : 0
    var last = s.recent && s.recent[0] ? s.recent[0] : null
    return {
      empty: requests === 0,
      before: bytes(before),
      after: bytes(after),
      saved: bytes(saved),
      savedPct: rate,
      keptPct: before ? Math.max(0, 100 - rate) : 0,
      requests: count(requests),
      tokens: count(s.savedTokens),
      failOpen: count(s.failOpen),
      bad: (Number(s.failOpen) || 0) > 0,
      lastMs: last ? dur(last.totalMs) : "—",
      last: last
        ? {
            model: last.model || "—",
            agent: last.agent || "—",
            before: bytes(last.beforeBytes),
            after: bytes(last.afterBytes),
            saved: bytes(last.savedBytes),
            took: dur(last.totalMs),
            when: ago(last.ts, t),
            bad: !!last.failOpen,
          }
        : null,
    }
  }

  function anyOn(strategies) {
    var list = engines()
    for (var i = 0; i < list.length; i++) {
      if (list[i].available !== false && strategies && strategies[list[i].id] === true) return true
    }
    return false
  }

  globalThis.CompressView = {
    TEXT: TEXT,
    text: text,
    count: count,
    bytes: bytes,
    pct: pct,
    dur: dur,
    ago: ago,
    engines: engines,
    presetStrategies: presetStrategies,
    presetOf: presetOf,
    tiles: tiles,
    cards: cards,
    meter: meter,
    recent: recent,
    anyOn: anyOn,
    whyEn: whyEn,
  }
})()
