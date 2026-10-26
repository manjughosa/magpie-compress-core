// 压缩整页：与设置面板共享同一套两级视图逻辑
// 主面板：预设 + 会话列表；自定义策略：策略开关 + 高级设置；实验室：试压工具
(function () {
  "use strict"

  var V = globalThis.CompressView
  var U = globalThis.CompressUI
  var $ = function (id) { return document.getElementById(id) }
  var lang = "zh"
  var T = V.text(lang)
  var options = {}
  var state = { stats: null, preset: "safe", open: {}, view: "main" }
  var pending = null
  var timer = 0
  var writeAt = 0
  var lastStats = ""
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

  function flush() {
    if (!pending) return
    var patch = options
    pending = null
    writeAt = Date.now()
    magpie.options
      .set(patch)
      .then(function (fresh) {
        if (fresh) options = fresh
        notifyOptions()
        setMessage("")
        paintAdvanced()
      })
      .catch(function () { setMessage(T.failedWrite, "err") })
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
    pending = true
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
    state.preset = V.presetOf(all)
    paintPresets()
    paintMeter()
    paintRows()
    paintAdvanced()
    paintSessions()
  }

  function paintPresets() {
    var host = $("presets")
    if (!host) return
    U.clear(host)
    var presets = V.presets()
    presets.forEach(function (p) {
      var b = U.el("button", "opt" + (state.preset === p.id ? " on" : ""), p.label)
      b.type = "button"
      b.setAttribute("aria-selected", state.preset === p.id ? "true" : "false")
      b.addEventListener("click", function () {
        if (p.id === "custom") return
        var next = {}
        Object.keys(V.engines()).forEach(function (id) { next[id] = p.on(id) })
        options.strategies = next
        state.preset = p.id
        save({ strategies: next })
        paint()
      })
      host.append(b)
    })
    var hint = $("presetHint")
    if (hint) hint.textContent = V.presetHint(state.preset, lang)
  }

  function paintMeter() {
    var host = $("meter")
    if (!host) return
    var m = V.meter(state.stats, lang)
    U.meter(host, m, T)
  }

  function paintRows() {
    var host = $("rows")
    if (!host) return
    U.clear(host)
    var engines = V.engines()
    var order = V.order(engines)
    var all = strategies()
    order.forEach(function (id, i) {
      var eng = engines[id]
      var row = U.row({
        index: i,
        id: id,
        eng: eng,
        on: all[id] !== false,
        open: state.open[id],
        stats: statsFor(id),
        lang: lang,
        T: T,
      })
      row.addEventListener("click", function () { toggleOpen(id) })
      host.append(row)
      var detail = U.detail({
        id: id,
        eng: eng,
        config: configOf(id),
        stats: statsFor(id),
        lang: lang,
        T: T,
        onField: function (key, value) {
          var cfg = Object.assign({}, configOf(id))
          cfg[key] = value
          options[id] = cfg
          save({ [id]: cfg })
        },
        onSwitch: function (next) {
          var all = Object.assign({}, strategies())
          all[id] = next
          options.strategies = all
          state.preset = V.presetOf(all)
          save({ strategies: all })
          paint()
        },
      })
      detail.id = "d-" + id
      detail.hidden = !state.open[id]
      host.append(detail)
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
    var s = options.stats || {}
    if (document.activeElement !== $("budget")) $("budget").value = options.budgetMs != null ? options.budgetMs : 600
    if (document.activeElement !== $("lastTurns")) $("lastTurns").value = options.preserve && options.preserve.lastTurns != null ? options.preserve.lastTurns : 2
    var keepSystem = !(options.preserve && options.preserve.system === false)
    $("preserveSystem").setAttribute("aria-checked", keepSystem ? "true" : "false")
  }

  function paintSessions() {
    var host = $("sessionList")
    var hint = $("sessionHint")
    if (!host) return

    var captures = (options.stats && options.stats.captures) || []
    captures = captures.slice().sort(function (a, b) { return b.ts - a.ts })

    U.clear(host)

    if (!captures.length) {
      if (hint) hint.textContent = "暂无记录。发一条消息触发网关请求后，这里会显示压缩前后的快照。"
      return
    }

    if (hint) hint.textContent = captures.length + " 条记录 · 点击一条查看差异"

    captures.forEach(function (cap) {
      var row = document.createElement("button")
      row.className = "session-row"
      row.type = "button"
      row.dataset.id = cap.id

      var info = document.createElement("div")
      info.className = "session-info"

      var preview = document.createElement("div")
      preview.className = "session-preview"
      preview.textContent = (cap.beforeText || "").slice(0, 60) + "…"

      var meta = document.createElement("div")
      meta.className = "session-meta"

      var time = document.createElement("span")
      time.textContent = fmtTime(cap.ts)

      var strategy = document.createElement("span")
      strategy.textContent = cap.strategy || "auto"

      meta.append(time, strategy)
      info.append(preview, meta)

      var strategiesDiv = document.createElement("div")
      strategiesDiv.className = "session-strategies"
      var tag = document.createElement("span")
      tag.className = "strategy-tag"
      tag.textContent = cap.strategy || "auto"
      strategiesDiv.append(tag)

      var size = document.createElement("span")
      size.className = "session-size"
      size.textContent = fmtBytes(cap.beforeBytes) + " → " + fmtBytes(cap.afterBytes)

      var rate = document.createElement("span")
      rate.className = "session-rate " + (cap.rate > 0 ? "good" : cap.rate < 0 ? "bad" : "")
      rate.textContent = fmtRate(cap.rate)

      row.append(info, strategiesDiv, size, rate)

      row.addEventListener("click", function () {
        showDiffModal(cap)
      })

      host.append(row)
    })
  }

  // ═══ 差异弹窗 ═══

  function showDiffModal(cap) {
    var modal = $("diffModal")
    var title = $("diffTitle")
    var meta = $("diffMeta")
    var body = $("diffBody")

    if (!modal || !body) return

    if (title) title.textContent = "压缩前后差异"
    if (meta) {
      meta.innerHTML = ""
      var items = [
        fmtTime(cap.ts),
        cap.strategy || "auto",
        fmtBytes(cap.beforeBytes) + " → " + fmtBytes(cap.afterBytes),
        "压缩率 " + fmtRate(cap.rate)
      ]
      items.forEach(function (text) {
        var span = document.createElement("span")
        span.textContent = text
        meta.append(span)
      })
    }

    renderDiffBody(body, cap)
    modal.hidden = false

    var closeBtn = $("diffClose")
    var backdrop = $("diffBackdrop")
    if (closeBtn) closeBtn.onclick = hideDiffModal
    if (backdrop) backdrop.onclick = hideDiffModal
  }

  function hideDiffModal() {
    var modal = $("diffModal")
    if (modal) modal.hidden = true
  }

  function renderDiffBody(host, cap) {
    U.clear(host)

    var header = U.el("div", "diff-header")
    var stats = U.el("div", "diff-stats")

    var stat1 = U.el("div", "diff-stat")
    stat1.append(U.el("span", "k", "压缩前"), U.el("span", "v", fmtBytes(cap.beforeBytes)))

    var stat2 = U.el("div", "diff-stat")
    stat2.append(U.el("span", "k", "压缩后"), U.el("span", "v", fmtBytes(cap.afterBytes)))

    var stat3 = U.el("div", "diff-stat")
    var rateV = U.el("span", "v " + (cap.rate > 0 ? "good" : ""), fmtRate(cap.rate))
    stat3.append(U.el("span", "k", "压缩率"), rateV)

    var stat4 = U.el("div", "diff-stat")
    stat4.append(U.el("span", "k", "节省"), U.el("span", "v", fmtBytes(cap.beforeBytes - cap.afterBytes)))

    stats.append(stat1, stat2, stat3, stat4)

    var progressWrap = U.el("div", "")
    var progressBar = U.el("div", "progress-bar")
    var progressFill = U.el("i")
    progressFill.style.width = Math.min(100, Math.max(0, cap.rate * 100)) + "%"
    progressBar.append(progressFill)
    progressWrap.append(progressBar)

    header.append(stats, progressWrap)

    var panes = U.el("div", "diff-panes")

    var beforePane = U.el("div", "diff-pane")
    var beforeHead = U.el("div", "diff-pane-head")
    beforeHead.append(
      U.el("span", "diff-pane-title", "处理前"),
      U.el("span", "diff-pane-size", fmtBytes(cap.beforeBytes))
    )
    var beforeBody = U.el("div", "diff-pane-body")
    beforeBody.textContent = cap.beforeText || "(无内容)"
    beforePane.append(beforeHead, beforeBody)

    var afterPane = U.el("div", "diff-pane")
    var afterHead = U.el("div", "diff-pane-head")
    afterHead.append(
      U.el("span", "diff-pane-title", "处理后"),
      U.el("span", "diff-pane-size", fmtBytes(cap.afterBytes))
    )
    var afterBody = U.el("div", "diff-pane-body")
    afterBody.innerHTML = highlightDiff(cap.beforeText || "", cap.afterText || "")
    afterPane.append(afterHead, afterBody)

    panes.append(beforePane, afterPane)

    host.append(header, panes)
  }

  function highlightDiff(before, after) {
    if (!before || !after) return escapeHtml(after)

    var beforeLines = before.split("\n")
    var afterLines = after.split("\n")

    var result = []
    afterLines.forEach(function (line) {
      var existsInBefore = beforeLines.some(function (bl) { return bl === line })
      if (existsInBefore) {
        result.push(escapeHtml(line))
      } else {
        result.push('<span class="diff-added">' + escapeHtml(line) + "</span>")
      }
    })

    var removedCount = beforeLines.length - afterLines.length
    if (removedCount > 0) {
      result.push("")
      result.push('<span class="diff-removed">… 已删除 ' + removedCount + " 行 …</span>")
    }

    return result.join("\n")
  }

  function escapeHtml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  }

  // ═══ 工具函数 ═══

  function fmtBytes(n) {
    if (n < 1024) return n + " B"
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB"
    return (n / 1024 / 1024).toFixed(2) + " MB"
  }

  function fmtTime(ts) {
    var d = new Date(ts)
    var today = new Date()
    var sameDay = d.toDateString() === today.toDateString()
    return sameDay
      ? d.toLocaleTimeString(lang, { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString(lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
  }

  function fmtRate(rate) {
    var pct = Math.round(rate * 100)
    return (pct > 0 ? "-" : pct < 0 ? "+" : "") + Math.abs(pct) + "%"
  }

  function strategies() { return options.strategies || {} }
  function configOf(id) { return options[id] || {} }
  function statsFor(id) {
    var s = options.stats || {}
    return s.byStrategy && s.byStrategy[id] ? s.byStrategy[id] : null
  }

  // ═══ 初始化 ═══

  function init() {
    bindViewButtons()

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
        p.lastTurns = parseInt(lastTurns.value, 10) || 2
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

    magpie.options.get().then(function (fresh) {
      if (fresh) options = fresh
      paint()

      if (globalThis.CompressAudit) {
        globalThis.CompressAudit.init({
          lang: lang,
          getOptions: function () { return options },
          saveOptions: function (next) { options = next; save(next) },
        })
      }
    })

    setInterval(function () {
      magpie.options.get().then(function (fresh) {
        if (!fresh) return
        var s = JSON.stringify(fresh.stats || {})
        if (s !== lastStats) {
          lastStats = s
          options = fresh
          paintSessions()
        }
      })
    }, 5000)
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init)
  } else {
    init()
  }
})()
