// 审计模块：真实压缩前后的快照列表 + 差异查看
// 分层结构：第一层是折叠的列表，点击后展开第二层差异详情
(function () {
  "use strict"

  var U = globalThis.CompressUI
  var V = globalThis.CompressView
  var $ = function (id) { return document.getElementById(id) }
  var lang = "zh"
  var getOptions = function () { return {} }
  var saveOptions = function () {}
  var captures = []
  var selectedId = null

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

  function renderList() {
    var host = $("captures")
    var status = $("captureStatus")
    if (!host) return

    U.clear(host)

    if (!captures.length) {
      host.append(U.el("p", "empty", "暂无记录。发一条消息触发网关请求后，这里会显示压缩前后的快照。"))
      if (status) status.textContent = ""
      return
    }

    captures.forEach(function (cap) {
      var row = U.el("button", "capture-row")
      row.type = "button"
      row.dataset.id = cap.id

      var name = U.el("span", "capture-name", cap.strategy || "auto")
      var time = U.el("span", "capture-time", fmtTime(cap.ts))
      var size = U.el("span", "capture-size", fmtBytes(cap.beforeBytes) + " → " + fmtBytes(cap.afterBytes))
      var rate = U.el("span", "capture-rate " + (cap.rate > 0 ? "good" : cap.rate < 0 ? "bad" : ""), fmtRate(cap.rate))

      row.append(name, time, size, rate)

      row.addEventListener("click", function () {
        selectCapture(cap.id)
      })

      host.append(row)
    })

    if (status) status.textContent = captures.length + " 条记录 · 点击一条查看差异"
  }

  function selectCapture(id) {
    selectedId = id
    var cap = captures.find(function (c) { return c.id === id })
    if (!cap) return

    // 高亮选中行
    var rows = document.querySelectorAll(".capture-row")
    rows.forEach(function (r) { r.classList.toggle("selected", r.dataset.id === id) })

    // 显示第二层
    var layerDiff = $("layerDiff")
    var diffTitle = $("diffTitle")
    var diffDetail = $("captureDetail")

    if (!layerDiff || !diffDetail) return

    layerDiff.hidden = false
    if (diffTitle) diffTitle.textContent = "压缩前后差异 · " + (cap.strategy || "auto") + " · " + fmtTime(cap.ts)

    renderDiff(diffDetail, cap)

    // 滚动到详情区
    layerDiff.scrollIntoView({ behavior: "smooth", block: "start" })
  }

  function renderDiff(host, cap) {
    U.clear(host)

    // 头部统计
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

    // 进度条（OmniRoute 风格）
    var progressWrap = U.el("div", "")
    progressWrap.style.cssText = "flex:1;max-width:200px;min-width:100px"
    var progressBar = U.el("div", "progress-bar")
    var progressFill = U.el("i")
    progressFill.style.width = Math.min(100, Math.max(0, cap.rate * 100)) + "%"
    progressBar.append(progressFill)
    progressWrap.append(progressBar)

    header.append(stats, progressWrap)

    // 双栏对比
    var panes = U.el("div", "diff-panes")

    var beforePane = U.el("div", "diff-pane")
    var beforeHead = U.el("div", "diff-pane-head")
    beforeHead.append(
      U.el("span", "diff-pane-title", "压缩前"),
      U.el("span", "diff-pane-size", fmtBytes(cap.beforeBytes))
    )
    var beforeBody = U.el("div", "diff-pane-body")
    beforeBody.textContent = cap.beforeText || "(无内容)"
    beforePane.append(beforeHead, beforeBody)

    var afterPane = U.el("div", "diff-pane")
    var afterHead = U.el("div", "diff-pane-head")
    afterHead.append(
      U.el("span", "diff-pane-title", "压缩后"),
      U.el("span", "diff-pane-size", fmtBytes(cap.afterBytes))
    )
    var afterBody = U.el("div", "diff-pane-body")
    afterBody.innerHTML = highlightDiff(cap.beforeText || "", cap.afterText || "")
    afterPane.append(afterHead, afterBody)

    panes.append(beforePane, afterPane)

    host.append(header, panes)
  }

  // 简单的差异高亮：标出被删除的部分
  function highlightDiff(before, after) {
    if (!before || !after) return escapeHtml(after)

    // 找出 after 中不存在的 before 的行
    var beforeLines = before.split("\n")
    var afterLines = after.split("\n")
    var afterSet = new Set(afterLines)

    var result = []
    var currentBlock = []

    afterLines.forEach(function (line) {
      // 检查这行是否在 before 中存在
      var existsInBefore = beforeLines.some(function (bl) { return bl === line })
      if (existsInBefore) {
        result.push(escapeHtml(line))
      } else {
        // 新增的行（压缩后新增的，通常是摘要或标记）
        result.push('<span class="diff-added">' + escapeHtml(line) + "</span>")
      }
    })

    // 如果 after 比 before 短很多，说明有大量删除
    // 在末尾添加一个"已删除 X 行"的提示
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

  function loadCaptures() {
    var opts = getOptions()
    var list = (opts.stats && opts.stats.captures) || []
    captures = list.slice().sort(function (a, b) { return b.ts - a.ts })
    renderList()
  }

  function clearCaptures() {
    if (!confirm("确定清空所有快照记录？此操作在下一次网关请求时执行。")) return
    var opts = getOptions()
    var next = Object.assign({}, opts)
    next.captureCommand = { action: "clear", ts: Date.now() }
    saveOptions(next)

    var status = $("captureStatus")
    if (status) status.textContent = "已提交清空命令，请发一条消息触发网关请求…"
  }

  function bindBack() {
    var backBtn = $("diffBack")
    if (!backBtn) return
    backBtn.addEventListener("click", function () {
      var layerDiff = $("layerDiff")
      if (layerDiff) layerDiff.hidden = true
      selectedId = null
      var rows = document.querySelectorAll(".capture-row")
      rows.forEach(function (r) { r.classList.remove("selected") })
    })
  }

  // ═══ 试压实验室 ═══

  function populateLabStrategies() {
    var sel = $("labStrategy")
    if (!sel || !globalThis.CompressLab) return

    var engines = globalThis.CompressLab.engines || []
    sel.innerHTML = ""

    engines.forEach(function (eng) {
      var opt = document.createElement("option")
      opt.value = eng.id
      opt.textContent = eng.label || eng.id
      if (eng.available === false) opt.disabled = true
      sel.append(opt)
    })

    // 默认选第一个可用的
    var firstAvailable = engines.find(function (e) { return e.available !== false })
    if (firstAvailable) sel.value = firstAvailable.id
  }

  function runLabTest() {
    var input = $("labInput")
    var strategy = $("labStrategy")
    var status = $("labStatus")
    var result = $("labResult")
    var btn = $("runLab")

    if (!input || !strategy || !result) return

    var text = input.value.trim()
    if (!text) {
      if (status) status.textContent = "请输入要试压的文本"
      return
    }

    if (!globalThis.CompressLab) {
      if (status) status.textContent = "试压引擎未加载"
      return
    }

    btn.disabled = true
    if (status) status.textContent = "正在运行…"

    globalThis.CompressLab.run(text, strategy.value, getOptions())
      .then(function (res) {
        if (status) status.textContent = ""
        renderLabResult(result, res)
      })
      .catch(function (err) {
        if (status) status.textContent = "试压失败：" + (err.message || err)
      })
      .finally(function () {
        btn.disabled = false
      })
  }

  function renderLabResult(host, res) {
    U.clear(host)

    var wrap = U.el("div", "lab-result")

    // 头部统计
    var head = U.el("div", "lab-result-head")
    var stat = U.el("div", "lab-stat")
    stat.append(
      U.el("span", "from", fmtBytes(res.before)),
      U.el("span", "arrow", "→"),
      U.el("span", "to", fmtBytes(res.after)),
      U.el("span", "rate", "−" + Math.round((res.saved / res.before) * 100) + "%")
    )
    head.append(stat)

    // 差异对比
    var panes = U.el("div", "diff-panes")

    var beforePane = U.el("div", "diff-pane")
    var beforeHead = U.el("div", "diff-pane-head")
    beforeHead.append(
      U.el("span", "diff-pane-title", "压缩前"),
      U.el("span", "diff-pane-size", fmtBytes(res.before))
    )
    var beforeBody = U.el("div", "diff-pane-body")
    beforeBody.textContent = res.beforeText
    beforePane.append(beforeHead, beforeBody)

    var afterPane = U.el("div", "diff-pane")
    var afterHead = U.el("div", "diff-pane-head")
    afterHead.append(
      U.el("span", "diff-pane-title", "压缩后"),
      U.el("span", "diff-pane-size", fmtBytes(res.after))
    )
    var afterBody = U.el("div", "diff-pane-body")
    afterBody.innerHTML = highlightDiff(res.beforeText, res.afterText)
    afterPane.append(afterHead, afterBody)

    panes.append(beforePane, afterPane)

    wrap.append(head, panes)
    host.append(wrap)
  }

  function bindLab() {
    var btn = $("runLab")
    if (!btn) return
    btn.addEventListener("click", runLabTest)
    populateLabStrategies()
  }

  function init(opts) {
    if (!opts) return
    lang = opts.lang || "zh"
    getOptions = opts.getOptions || getOptions
    saveOptions = opts.saveOptions || saveOptions

    var clearBtn = $("clearCaptures")
    if (clearBtn) clearBtn.addEventListener("click", clearCaptures)

    bindBack()
    bindLab()
    loadCaptures()

    // 轮询更新
    setInterval(loadCaptures, 5000)
  }

  globalThis.CompressAudit = { init: init, reload: loadCaptures }
})()
