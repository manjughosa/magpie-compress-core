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
      justNow: "刚刚",
      minutesAgo: "{n} 分钟前",
      hoursAgo: "{n} 小时前",
      daysAgo: "{n} 天前",
    },
  }

  // OmniRoute 原文是英文；中文界面用这组等价说明，技术含义保持一致。
  var DESC_ZH = {
    "session-dedup": "把本会话里已经出现过的重复文本换成引用；原文仍在历史中（要模型回看），不总结、不删改。",
    ccr: "把大的重复/连续块换成可取回的引用；调用方装了 retrieve 工具才会启用。",
    lite: "只清空白、重复行和格式，零语义改动。内容大多唯一的流量上通常只省 0.1–1%，不是固定 15%。",
    rtk: "只作用于工具输出：剥掉 ANSI/进度条/重复行，保留报错、警告与摘要。噪音密集时该部分可省 60–95%，整条请求的收益取决于工具输出占比。",
    "codex-responses": "对 OpenAI Responses API 的 shell/patch/search/build 工具输出做保守压缩。",
    headroom: "把表格化 JSON 按列压成 [N rows] 形式，结构仍然可读。",
    relevance: "按最后一条用户消息给句子打分，丢掉低分句。",
    caveman: "按语言规则包压缩用户散文；实测约 10–20%（上游标称 30%），代码与事实保留。",
    "read-lifecycle": "折叠被后续 Read/Write 覆盖的 Read 结果，每个路径只保留最新视图。",
    aggressive: "摘要较早轮次并逐步老化；实测约 25–35%（上游标称 50%），会改写历史轮次、影响 prompt cache。",
    llmlingua: "在 worker 线程上做 LLMLingua-2 ONNX 语义剪枝；模型是可选依赖。",
    ultra: "启发式 token 级剪枝；实测约 30–35%（上游标称 75%，默认保留率 0.5），数值越低压得越狠。",
    ionizer: "采样式压缩，丢掉低信息片段，保留骨架和关键事实；故意有损。",
    llm: "通过可插拔的 chat-completion 后端压缩散文；默认后端是 no-op，开箱即用不会改请求。",
    omniglyph: "实验性的上下文转图片编码，只直连 Claude Fable 5；最激进、兼容性最窄，不建议作为通用默认。",
  }

  function text(lang) {
    return String(lang || "").toLowerCase().indexOf("zh") === 0 ? TEXT.zh : TEXT.en
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
        var fields = (e.fields || []).map(function (f) {
          return {
            key: f.key,
            type: f.type,
            label: f.label,
            description: f.description || "",
            defaultValue: f.defaultValue,
            options: f.options || null,
            min: f.min,
            max: f.max,
          }
        })
        return {
          id: e.id,
          label: e.label,
          why: e.why,
          description: (t === TEXT.zh && DESC_ZH[e.id]) || e.description,
          badge: badge.label,
          tone: badge.tone,
          available: e.available !== false,
          requires: e.requires || "",
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
  }
})()
