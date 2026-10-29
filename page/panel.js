// 面板版：设置里的插件标签页。两级视图 + 实验室全窗口。
// 主面板：预设 + 会话列表；自定义策略：策略开关 + 高级设置；实验室：试压工具。
(function () {
  "use strict"

  var V = globalThis.CompressView
  var U = globalThis.CompressUI
  var $ = function (id) { return document.getElementById(id) }
  var which = document.body.dataset.panel || "settings"
  var lang = "zh"
  var T = V.text(lang)
  var options = {}
  var state = { preset: "safe", open: {}, view: "main", pinned: null }
  // 页面读不到 capture-store.js，保留上限在这里镜像一份，只用于提示文案。
  var KEEP_CAPTURES = 50
  var pendingPatch = null
  var ccrPending = null
  var timer = 0
  var writeAt = 0
  var lastStats = ""
  var lastOptions = ""
  var optionsListeners = []

  function notifyOptions() { optionsListeners.forEach(function (fn) { fn() }) }

  // ═══ 视图切换 ═══

  function switchView(viewName) {
    state.view = viewName
    var views = { main: "viewMain", custom: "viewCustom", lab: "viewLab" }
    Object.keys(views).forEach(function (name) {
      var el = $(views[name])
      if (el) {
        if (name === viewName) {
          el.removeAttribute("hidden")
          el.style.display = "block"
        } else {
          el.setAttribute("hidden", "")
          el.style.display = "none"
        }
      }
    })
  }

  function bindViewButtons() {
    var btnCustom = $("btnCustom")
    var btnLab = $("btnLab")
    var btnLabFromCustom = $("btnLabFromCustom")
    var backFromCustom = $("backFromCustom")
    var backFromLab = $("backFromLab")

    if (btnCustom) btnCustom.addEventListener("click", function () { switchView("custom") })
    if (btnLab) btnLab.addEventListener("click", function () { switchView("lab") })
    if (btnLabFromCustom) btnLabFromCustom.addEventListener("click", function () { switchView("lab") })
    if (backFromCustom) backFromCustom.addEventListener("click", function () { switchView("main") })
    if (backFromLab) backFromLab.addEventListener("click", function () { switchView("main") })
  }

  // ═══ 数据流 ═══

  function throttle() {
    var wait = Math.max(0, 1100 - (Date.now() - writeAt))
    clearTimeout(timer)
    timer = setTimeout(flush, wait)
  }

  function flushNow() {
    clearTimeout(timer)
    flush()
  }

  function paintSaveBtn() {
    var btn = $("saveOptions")
    if (!btn) return
    btn.disabled = !pendingPatch
    btn.classList.toggle("dirty", !!pendingPatch)
  }

  // ═══ ccr retrieve 工具安装 ═══
  // 页面不能 spawn：把命令写进 options，下一次本地请求时宿主执行
  // （options-commands.js 的 processCcrCommand），结果发布成 compress-ccr-status.js。
  function installCcr() {
    var btn = $("installCcr")
    if (btn) btn.disabled = true
    var id = "ccr-" + Date.now() + "-" + Math.random().toString(16).slice(2, 8)
    magpie.options
      .get()
      .then(function (fresh) {
        // 与 flush 同一原则：以最新 options 为底只加一个键，不拿页面旧副本整包盖。
        var next = Object.assign({}, fresh && typeof fresh === "object" ? fresh : {})
        next.ccrCommand = { id: id, action: "install-mcp" }
        return magpie.options.set(next)
      })
      .then(function (saved) {
        options = saved && typeof saved === "object" ? saved : options
        ccrPending = id
        setMessage(T.ccrSent || "已提交，下个请求执行")
        paintCcrBtn()
      })
      .catch(function () {
        if (btn) btn.disabled = false
        setMessage(T.failedWrite, "err")
      })
  }

  function paintCcrBtn() {
    var btn = $("installCcr")
    if (!btn) return
    var st = globalThis.__COMPRESS_CORE_CCR__
    if (st && st.status === "done") {
      btn.disabled = true
      btn.textContent = T.ccrDone || "retrieve 工具已装好"
      return
    }
    if (st && st.status === "error" && (!ccrPending || st.id === ccrPending)) {
      btn.disabled = false
      btn.textContent = T.ccrFailed || "安装失败，点击重试"
      return
    }
    if (ccrPending) {
      btn.disabled = true
      btn.textContent = T.ccrSent || "已提交，下个请求执行"
      return
    }
    btn.disabled = false
    btn.textContent = T.ccrInstall || "安装 retrieve 工具"
  }

  function withoutStats(o) {
    var c = Object.assign({}, o)
    delete c.stats
    return c
  }

  // 落盘语义：先取最新 options，把挂起的改动叠上去再整包写回。
  // 旧版直接写页面持有的整份 options——主面板和设置面板同时开着、或 5 秒轮询
  // 恰好刷新过页面副本时，会把别人刚写的键整包盖掉（策略开关因此抖动）。
  function flush() {
    if (!pendingPatch) return
    var patch = pendingPatch
    pendingPatch = null
    writeAt = Date.now()
    magpie.options
      .get()
      .then(function (fresh) {
        var next = mergeInto(fresh && typeof fresh === "object" ? fresh : {}, patch)
        return magpie.options.set(next)
      })
      .then(function (saved) {
        options = saved && typeof saved === "object" ? saved : options
        lastOptions = JSON.stringify(withoutStats(options))
        notifyOptions()
        setMessage(T.savedOk || "已保存并生效")
        safePaint()
      })
      .catch(function () {
        // 失败把改动挂回去，保存按钮保持脏态，还能重试
        pendingPatch = mergeInto(patch, pendingPatch || {})
        setMessage(T.failedWrite, "err")
        paintSaveBtn()
      })
  }

  function mergeInto(target, patch) {
    Object.keys(patch).forEach(function (key) {
      var value = patch[key]
      if (value && typeof value === "object" && !Array.isArray(value)) {
        target[key] = Object.assign({}, target[key] || {}, value)
      } else {
        target[key] = value
      }
    })
    return target
  }

  function save(patch) {
    options = mergeInto(Object.assign({}, options), patch)
    // 改动单独记账：flush 时叠到最新 options 上，不靠页面这份可能过期的整包。
    pendingPatch = mergeInto(pendingPatch || {}, patch)
    paintSaveBtn()
    throttle()
  }

  function setMessage(text, tone) {
    var m = $("message")
    if (!m) return
    m.textContent = text || ""
    m.className = "message" + (tone ? " " + tone : "")
    m.hidden = !text
  }

  // ═══ 渲染 ═══

  function paint() {
    var all = strategies()
    // 档位是按策略组合回推的；只有用户点了「自定义」才用 pinned 覆盖，
    // 因为「自定义」等于「不属于任何预设」本身没有可回推的组合。
    state.preset = state.pinned || V.presetOf(all)
    paintPresets()
    paintCcrBtn()
    // The Usage panel is this file too: it declares #meter and nothing painted it,
    // so that tab stayed blank while the numbers were already published. A panel
    // without a #meter (the settings one) returns at once.
    paintMeter()
    paintRows()
    paintAdvanced()
    paintSessions()
  }

  // view.js 的 V.engines() 返回数组（每项带 id），V.cards() 产出卡片，列表统一交给 U.rows 渲染。
  // 根因记录：V.engines() 返回数组，旧代码按 map 取 V.engines()[id.id] 得 undefined，
  // 随后调用了 registerView 从未导出的 U.row/U.box/T.status，paint() 抛错 → init 中断 → 所有按钮无监听。

  function safePaint() {
    try {
      paint()
    } catch (err) {
      setMessage("渲染失败：" + (err && err.message ? err.message : err), "err")
      if (globalThis.console) console.error("[Compress] paint failed", err)
    }
  }

  function paintPresets() {
    var host = $("presets")
    if (!host) return
    U.clear(host)
    ;["off", "safe", "custom", "all"].forEach(function (id) {
      var label = (T.presets && T.presets[id]) || id
      var btn = U.el("button", "opt" + (state.preset === id ? " on" : ""), label)
      btn.type = "button"
      btn.setAttribute("aria-selected", state.preset === id ? "true" : "false")
      btn.addEventListener("click", function () {
        // 四个档位按钮只管显示与切换，不管导航：视图切换是齿轮的事。
        if (id === "custom") {
          // 「自定义」不对应任何策略组合，点它只把选中态落到自定义，
          // 具体开哪几个开关留在自定义策略屏里做。
          state.pinned = "custom"
          state.preset = "custom"
          paintPresets()
          return
        }
        var next = V.presetStrategies(id)
        options.strategies = next
        state.pinned = null
        state.preset = id
        save({ strategies: next })
        safePaint()
      })
      host.append(btn)
    })
    var hint = $("presetHint")
    if (hint) hint.textContent = (T.presetHint && T.presetHint[state.preset]) || ""
  }

  function paintMeter() {
    var host = $("meter")
    if (!host) return
    var stats = statsSummary()
    U.meter(host, V.meter(stats, lang), T)
    if (!stats && T.statsFileNote) {
      var note = U.el("p", "hint")
      note.textContent = T.statsFileNote
      host.appendChild(note)
    }
  }

  function paintRows() {
    var host = $("rows")
    if (!host) return
    U.rows(host, V.cards(strategies(), statsSummary(), lang), {
      T: T,
      open: state.open,
      config: configMap(),
      onToggle: toggleOpen,
      onSwitch: function (id, next) {
        var all = strategies()
        all[id] = next
        options.strategies = all
        // 手动改开关后档位回到真实回推，之前手点的「自定义」不再抢占显示。
        state.pinned = null
        save({ strategies: all })
        safePaint()
      },
      onField: function (id, key, value) {
        var cfg = Object.assign({}, configOf(id))
        cfg[key] = value
        options[id] = cfg
        var patch = {}
        patch[id] = cfg
        save(patch)
      },
    })
  }

  function toggleOpen(id) {
    state.open[id] = !state.open[id]
    var row = document.querySelector('.row[data-id="' + id + '"]')
    var detail = $("d-" + id)
    if (row) row.setAttribute("aria-expanded", state.open[id] ? "true" : "false")
    if (detail) detail.hidden = !state.open[id]
  }

  function paintAdvanced() {
    var budget = $("budget")
    var lastTurns = $("lastTurns")
    var keep = $("preserveSystem")
    if (budget && document.activeElement !== budget) {
      budget.value = options.budgetMs != null ? options.budgetMs : 0
    }
    if (lastTurns && document.activeElement !== lastTurns) {
      var turns = options.preserve && options.preserve.lastTurns != null ? options.preserve.lastTurns : 0
      lastTurns.value = turns
    }
    if (keep) {
      // Keep this identical to pipeline.js: only an explicit true protects system.
      var keepSystem = !!(options.preserve && options.preserve.system === true)
      keep.setAttribute("aria-checked", keepSystem ? "true" : "false")
    }
    var captureFull = $("captureFull")
    if (captureFull) {
      captureFull.setAttribute("aria-checked", options.capture === true ? "true" : "false")
    }
  }

  // 索引条目：{ id, at, protocol, agent, model, before, after, saved, summary }（字节数 + ISO 时间）
  // 完整 before/after 文本不在这里，只存在 <config>/magpie/compress-core/captures/<id>.json。

  // 页面能拿到数据的只有两条路：`magpie.options`（写它会重载 hooks host，钩子已不再往里写
  // stats）和页面自己的目录。所以数字和列表都由钩子发布成同目录的脚本，用 <script src> 取。
  var wheel = [
    { id: "statsScript", file: "compress-stats.js" },
    { id: "capturesScript", file: "captures-index.js" },
    { id: "ccrStatusScript", file: "compress-ccr-status.js" },
  ]
  var lastData = ""

  function statsSummary() {
    var published = globalThis.__COMPRESS_CORE_STATS__
    if (published && typeof published === "object") return published
    return options.stats || null
  }

  function captureList() {
    var published = globalThis.__COMPRESS_CAPTURES_INDEX__
    if (Object.prototype.toString.call(published) === "[object Array]") return published.slice()
    return ((options.stats && options.stats.captures) || []).slice()
  }

  function dataSignature() {
    try {
      return JSON.stringify([globalThis.__COMPRESS_CORE_STATS__ || null, globalThis.__COMPRESS_CAPTURES_INDEX__ || null, globalThis.__COMPRESS_CORE_CCR__ || null])
    } catch { return "" }
  }

  function loadPublished() {
    var left = wheel.length
    var settle = function () {
      left -= 1
      if (left > 0) return
      var now = dataSignature()
      if (now === lastData) return
      lastData = now
      safePaint()
    }
    wheel.forEach(function (item) {
      var old = document.getElementById(item.id)
      if (old && old.parentNode) old.parentNode.removeChild(old)
      var script = document.createElement("script")
      script.id = item.id
      script.src = item.file + "?t=" + Date.now()
      script.onload = settle
      // 文件还没生成（从未有过记录、或刚装好）：保持原来的提示。
      script.onerror = settle
      ;(document.body || document.documentElement).append(script)
    })
  }

  function sessionRate(cap) {
    var before = Number(cap.before) || 0
    if (!before) return 0
    return (before - (Number(cap.after) || 0)) / before
  }

  function paintSessions() {
    var host = $("sessionList")
    var hint = $("sessionHint")
    if (!host) return

    var captures = captureList()
    captures.sort(function (a, b) { return new Date(b.at).getTime() - new Date(a.at).getTime() })

    U.clear(host)

    if (!captures.length) {
      if (hint) hint.textContent = options.capture === false
        ? "暂无记录。打开下面的「记录完整快照」后，每条经过网关的请求都会在这里留一条。"
        : "暂无记录。记录已打开，下一条经过网关的请求就会出现在这里，保留最新 " + KEEP_CAPTURES + " 条。"
      return
    }
    if (hint) hint.textContent = captures.length + " / " + KEEP_CAPTURES + " 条记录 · 点击一条查看差异"

    captures.forEach(function (cap) {
      var rate = sessionRate(cap)
      var before = Number(cap.before) || 0
      var after = Number(cap.after) || 0

      var row = document.createElement("button")
      row.className = "session-row"
      row.type = "button"
      row.dataset.id = cap.id
      row.setAttribute("aria-label", (cap.model || "请求") + "，" + fmtBytes(before) + " 压缩到 " + fmtBytes(after))

      var info = document.createElement("div")
      info.className = "session-info"

      var preview = document.createElement("div")
      preview.className = "session-preview"
      preview.textContent = cap.model || "(未知模型)"

      var metaRow = document.createElement("div")
      metaRow.className = "session-meta"
      var timeSpan = document.createElement("span")
      timeSpan.textContent = fmtTime(cap.at)
      var protoSpan = document.createElement("span")
      protoSpan.textContent = cap.protocol || "chat"
      metaRow.append(timeSpan, protoSpan)
      if (cap.agent) {
        var agentSpan = document.createElement("span")
        agentSpan.className = "session-agent"
        agentSpan.textContent = cap.agent
        metaRow.append(agentSpan)
      }
      info.append(preview, metaRow)

      var tags = document.createElement("div")
      tags.className = "session-strategies"
      var tag = document.createElement("span")
      tag.className = "strategy-tag"
      tag.textContent = cap.summary ? "仅摘要" : "全文"
      tags.append(tag)

      var size = document.createElement("span")
      size.className = "session-size"
      size.textContent = fmtBytes(before) + " → " + fmtBytes(after)

      var rateEl = document.createElement("span")
      rateEl.className = "session-rate " + (rate > 0 ? "good" : rate < 0 ? "bad" : "")
      rateEl.textContent = fmtRate(rate)

      row.append(info, tags, size, rateEl)
      row.addEventListener("click", function () { showDiffModal(cap) })
      host.append(row)
    })
  }

  // ═══ 差异弹窗 ═══

  // 完整快照按需加载：页面 CSP 只允许同源脚本，所以用 <script> 而不是 fetch。
  // capture-store 在每条 capture 落盘时同步发布 page/captures/<id>.js。
  var captureCache = {}

  function ensureCapture(id) {
    if (captureCache[id]) return Promise.resolve(captureCache[id])
    var store = globalThis.__COMPRESS_CAPTURES__
    if (store && store[id]) {
      captureCache[id] = store[id]
      return Promise.resolve(store[id])
    }
    return new Promise(function (resolve) {
      var done = false
      var finish = function (value) {
        if (done) return
        done = true
        resolve(value || null)
      }
      var script = document.createElement("script")
      script.src = "captures/" + encodeURIComponent(id) + ".js"
      script.onload = function () {
        var got = globalThis.__COMPRESS_CAPTURES__ ? globalThis.__COMPRESS_CAPTURES__[id] : null
        if (got) captureCache[id] = got
        finish(got)
      }
      script.onerror = function () { finish(null) }
      document.head.append(script)
      setTimeout(function () { finish(captureCache[id] || null) }, 6000)
    })
  }

  function onDiffKey(ev) {
    if (ev && ev.key === "Escape") hideDiffModal()
  }

  function showDiffModal(cap) {
    var modal = $("diffModal")
    var title = $("diffTitle")
    var meta = $("diffMeta")
    var body = $("diffBody")
    if (!modal || !body) return

    if (title) title.textContent = "压缩前后差异"
    if (meta) {
      U.clear(meta)
      var rate = sessionRate(cap)
      var items = [
        fmtTime(cap.at),
        cap.model || "",
        cap.protocol || "",
        fmtBytes(Number(cap.before) || 0) + " → " + fmtBytes(Number(cap.after) || 0),
        "压缩率 " + fmtRate(rate),
      ]
      items.forEach(function (text) {
        if (!text) return
        var span = document.createElement("span")
        span.textContent = text
        meta.append(span)
      })
    }

    renderDiffBody(body, cap, null, "loading")
    modal.hidden = false
    modal.removeAttribute("hidden")
    modal.style.display = "flex"

    var closeBtn = $("diffClose")
    var backdrop = $("diffBackdrop")
    if (closeBtn) closeBtn.onclick = hideDiffModal
    if (backdrop) backdrop.onclick = hideDiffModal
    document.addEventListener("keydown", onDiffKey)

    if (cap.summary) {
      renderDiffBody(body, cap, null, "summary")
      return
    }
    ensureCapture(cap.id).then(function (record) {
      if (modal.hidden) return
      renderDiffBody(body, cap, record, record ? "ready" : "missing")
    })
  }

  function hideDiffModal() {
    var modal = $("diffModal")
    if (modal) {
      modal.hidden = true
      modal.setAttribute("hidden", "")
      modal.style.display = "none"
    }
    document.removeEventListener("keydown", onDiffKey)
  }

  // 实测一份 150 KB 快照有 3326 行，第一处变化在第 891 行；
  // 所以不能只渲染开头——先按公共前缀定位，再渲染差异附近的行窗口。
  var DIFF_WINDOW = 30
  var MAX_LINE_CHARS = 400

  // report.strategies[].reason 的实测取值，未知值原样透出，不做猜测。
  var REASON_ZH = {
    changed: "有改动",
    disabled: "未启用",
    unavailable: "不可用",
    no_repeat_eligible_block: "没有可折叠的重复块",
    nothing_to_remove: "扫过了：这段文本里没有它能去掉的东西",
    no_whitespace_or_tool_result_change: "没有可清理的空白或工具输出",
    no_eligible_json_array_or_not_smaller: "没有可压缩的 JSON，或压缩后不更小",
    budget_exceeded: "超出时间预算",
    failed_open: "出错后放行",
  }

  function renderStrategyReport(report) {
    var rows = (report && report.strategies) || []
    var active = rows.filter(function (row) { return row.enabled === true || row.status === "hit" })
    var rest = rows.length - active.length

    var wrap = U.el("section", "diff-report")
    var head = U.el("div", "diff-report-head")
    var tokens =
      report && report.estimatedBeforeTokens != null
        ? "约 " + report.estimatedBeforeTokens.toLocaleString("zh-CN") + " → " + report.estimatedAfterTokens.toLocaleString("zh-CN") + " token"
        : ""
    head.append(
      U.el("span", "", "策略贡献"),
      U.el("span", "muted", tokens + (report && report.totalMs != null ? " · 总耗时 " + report.totalMs + " ms" : "")),
    )
    wrap.append(head)

    if (!active.length) {
      wrap.append(U.el("p", "diff-note", "这次请求没有任何策略被启用。"))
      return wrap
    }

    var list = U.el("div", "diff-report-rows")
    active.forEach(function (row) {
      var hit = row.status === "hit"
      var line = U.el("div", "diff-report-row")
      line.append(
        U.el("span", "diff-report-name", row.label || row.id),
        U.el("span", "diff-report-verdict " + (hit ? "hit" : "skip"), hit ? "命中" : REASON_ZH[row.reason] || row.reason || "跳过"),
        U.el("span", "diff-report-saved", row.savedBytes ? fmtBytes(row.savedBytes) : "—"),
        U.el("span", "diff-report-ms", (row.ms != null ? row.ms : 0) + " ms"),
      )
      list.append(line)
    })
    wrap.append(list)

    if (rest > 0) wrap.append(U.el("p", "diff-note", "另有 " + rest + " 个策略未启用。"))
    return wrap
  }

  function diffStats(beforeText, afterText) {
    var beforeLines = (beforeText || "").split("\n")
    var afterLines = (afterText || "").split("\n")
    var beforeSet = new Set(beforeLines)
    var afterSet = new Set(afterLines)

    var added = 0
    afterLines.forEach(function (line) { if (!beforeSet.has(line)) added++ })
    var removed = 0
    beforeLines.forEach(function (line) { if (!afterSet.has(line)) removed++ })

    var prefix = 0
    while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix++

    var longest = Math.max(beforeLines.length, afterLines.length)
    if (added === 0 && removed === 0) {
      return {
        beforeLines: beforeLines, afterLines: afterLines, beforeSet: beforeSet, afterSet: afterSet,
        added: 0, removed: 0, prefix: prefix, start: 0, end: Math.min(40, longest),
        note: "两段文本逐行一致（" + beforeLines.length + " 行）——这次压缩没有改动文本内容。",
      }
    }

    return {
      beforeLines: beforeLines, afterLines: afterLines, beforeSet: beforeSet, afterSet: afterSet,
      added: added, removed: removed, prefix: prefix,
      start: Math.max(0, prefix - DIFF_WINDOW),
      end: Math.min(longest, prefix + DIFF_WINDOW * 2),
      note: "前 " + prefix + " 行完全相同，差异从第 " + (prefix + 1) + " 行开始；"
        + "逐行比对共新增 " + added + " 行、少了 " + removed + " 行。",
    }
  }

  function renderLines(lines, offset, classify) {
    return lines
      .map(function (line, i) {
        var text = line.length > MAX_LINE_CHARS
          ? line.slice(0, MAX_LINE_CHARS) + " …（本行还有 " + (line.length - MAX_LINE_CHARS) + " 字符）"
          : line
        var cls = classify(line)
        return (
          '<span class="diff-line' + (cls ? " " + cls : "") + '">'
          + '<span class="diff-lineno">' + (offset + i + 1) + "</span>"
          + escapeHtml(text)
          + "</span>"
        )
      })
      .join("")
  }

  function renderDiffBody(host, cap, record, phase) {
    U.clear(host)

    var beforeBytes = Number(cap.before) || 0
    var afterBytes = Number(cap.after) || 0
    var rate = sessionRate(cap)

    var header = U.el("div", "diff-header")
    var stats = U.el("div", "diff-stats")
    var cells = [
      ["压缩前", fmtBytes(beforeBytes), ""],
      ["压缩后", fmtBytes(afterBytes), ""],
      ["压缩率", fmtRate(rate), rate > 0 ? "good" : ""],
      ["节省", fmtBytes(Math.max(0, beforeBytes - afterBytes)), ""],
    ]
    cells.forEach(function (cell) {
      var box = U.el("div", "diff-stat")
      box.append(U.el("span", "k", cell[0]), U.el("span", "v " + cell[2], cell[1]))
      stats.append(box)
    })

    var progressWrap = U.el("div", "")
    var progressBar = U.el("div", "progress-bar")
    var fill = U.el("i")
    fill.style.width = Math.min(100, Math.max(0, rate * 100)) + "%"
    progressBar.append(fill)
    progressWrap.append(progressBar)
    header.append(stats, progressWrap)
    host.append(header)

    if (phase === "loading") {
      host.append(U.el("p", "diff-note", "正在加载完整快照…"))
      return
    }
    if (!record) {
      host.append(
        U.el(
          "p",
          "diff-note",
          "这条记录的完整快照没有随页面发布（可能已被清理或超过发布上限），只剩索引里的体积、模型与协议。",
        ),
      )
      return
    }

    var st = diffStats(record.beforeText, record.afterText)
    host.append(U.el("p", "diff-note", st.note))

    var panes = U.el("div", "diff-panes")

    var leftPane = U.el("div", "diff-pane")
    var leftHead = U.el("div", "diff-pane-head")
    leftHead.append(
      U.el("span", "diff-pane-title", "处理前 · 第 " + (st.start + 1) + "–" + Math.min(st.end, st.beforeLines.length) + " 行"),
      U.el("span", "diff-pane-size", fmtBytes(beforeBytes)),
    )
    var leftBody = U.el("div", "diff-pane-body")
    leftBody.innerHTML = renderLines(st.beforeLines.slice(st.start, st.end), st.start, function (line) {
      return st.afterSet.has(line) ? "" : "is-removed"
    })
    leftPane.append(leftHead, leftBody)

    var rightPane = U.el("div", "diff-pane")
    var rightHead = U.el("div", "diff-pane-head")
    rightHead.append(
      U.el("span", "diff-pane-title", "处理后 · 第 " + (st.start + 1) + "–" + Math.min(st.end, st.afterLines.length) + " 行"),
      U.el("span", "diff-pane-size", fmtBytes(afterBytes)),
    )
    var rightBody = U.el("div", "diff-pane-body")
    rightBody.innerHTML = renderLines(st.afterLines.slice(st.start, st.end), st.start, function (line) {
      return st.beforeSet.has(line) ? "" : "is-added"
    })
    rightPane.append(rightHead, rightBody)

    panes.append(leftPane, rightPane)
    host.append(panes)

    if (st.prefix > 0) {
      host.append(U.el("p", "diff-note", "窗口外还有 " + st.prefix + " 行完全一致的内容未显示。"))
    }

    host.append(renderStrategyReport(record.report))
  }

  // 差异高亮

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  // ═══ 工具函数 ═══

  function fmtBytes(n) {
    if (n < 1024) return n + " B"
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB"
    return (n / 1024 / 1024).toFixed(2) + " MB"
  }

  function fmtTime(value) {
    var d = new Date(value)
    if (!value || isNaN(d.getTime())) return "—"
    var today = new Date()
    var sameDay = d.toDateString() === today.toDateString()
    return sameDay
      ? d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  // rate 已是 0..1 的比率；小数点放进 fmtBytes 的 KB 显示之后，近 0.5%
  // 的保存会被四舍五入抹成「同体积」，于是 ±0% 的行必须显示 0%，不能带上负号。
  function fmtRate(rate) {
    var value = Number(rate) || 0
    var pct = Math.round(value * 100)
    if (pct === 0) return "0%"
    return (pct > 0 ? "-" : "+") + Math.abs(pct) + "%"
  }

  function strategies() {
    var base = V.presetStrategies("safe")
    var raw = options.strategies
    if (raw && typeof raw === "object") {
      Object.keys(raw).forEach(function (id) {
        if (Object.prototype.hasOwnProperty.call(base, id)) base[id] = raw[id] === true
      })
    }
    return base
  }

  function configOf(id) { return options[id] || {} }

  function configMap() {
    var out = {}
    V.engines().forEach(function (e) {
      if (options[e.id]) out[e.id] = options[e.id]
    })
    return out
  }
  function statsFor(id) {
    var s = options.stats || {}
    return s.byStrategy && s.byStrategy[id] ? s.byStrategy[id] : null
  }

  // ═══ 初始化 ═══

  function init() {
    bindViewButtons();

    var saveBtn = $("saveOptions")
    if (saveBtn) saveBtn.addEventListener("click", flushNow)
    var ccrBtn = $("installCcr")
    if (ccrBtn) ccrBtn.addEventListener("click", installCcr)
    // 防抖内的改动在面板被关掉/切走时会整个丢掉——离开前补一次立即写。
    window.addEventListener("pagehide", flushNow)
    document.addEventListener("visibilitychange", function () {
      if (document.visibilityState === "hidden") flushNow()
    })

    // 高级设置绑定
    var budget = $("budget")
    var lastTurns = $("lastTurns")
    var preserveSystem = $("preserveSystem")

    if (budget) {
      budget.addEventListener("change", function () {
        save({ budgetMs: parseInt(budget.value, 10) || 600 })
      })
    }

    if (lastTurns) {
      lastTurns.addEventListener("change", function () {
        var p = Object.assign({}, options.preserve)
        var n = parseInt(lastTurns.value, 10)
        p.lastTurns = Number.isFinite(n) ? Math.max(0, Math.min(50, n)) : 0
        save({ preserve: p })
      })
    }

    if (preserveSystem) {
      preserveSystem.addEventListener("click", function () {
        var p = Object.assign({}, options.preserve)
        p.system = preserveSystem.getAttribute("aria-checked") !== "true"
        save({ preserve: p })
      })
    }

    var captureFull = $("captureFull")
    if (captureFull) {
      captureFull.addEventListener("click", function () {
        save({ capture: captureFull.getAttribute("aria-checked") !== "true" })
      })
    }

    // 加载选项
    magpie.options.get().then(function (fresh) {
      if (fresh) options = fresh
      lastOptions = JSON.stringify(withoutStats(options))
      paintSaveBtn()
      safePaint()
      loadPublished()

      // 初始化审计模块
      if (globalThis.CompressAudit) {
        globalThis.CompressAudit.init({
          lang: lang,
          getOptions: function () { return options },
          saveOptions: function (next) { options = next; save(next) },
        })
      }
    })

    // 轮询更新
    setInterval(function () {
      // 数字和列表都在页面同目录的脚本里，不在 options 里：两边都取一次，谁变了就重绘。
      loadPublished()
      magpie.options.get().then(function (fresh) {
        if (!fresh) return
        var s = JSON.stringify(fresh.stats || {})
        // 有未保存的改动时只更新数字：不能用 fresh 整份替换 options，
        // 会把用户在防抖窗口里的编辑冲掉。
        if (pendingPatch) {
          if (s !== lastStats) {
            lastStats = s
            options.stats = fresh.stats
            paintMeter()
            paintRows()
            paintSessions()
          }
          return
        }
        var o = JSON.stringify(withoutStats(fresh))
        if (s !== lastStats || o !== lastOptions) {
          lastStats = s
          lastOptions = o
          options = fresh
          safePaint()
        }
      })
    }, 5000)
  }

  // 启动
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
