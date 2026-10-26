// 试压实验室模块：单策略试压 + 结果渲染
// 注意：会话列表和差异弹窗已移至 panel.js（主面板视图）
(function () {
  "use strict"

  var U = globalThis.CompressUI
  var $ = function (id) { return document.getElementById(id) }
  var lang = "zh"
  var getOptions = function () { return {} }

  function fmtBytes(n) {
    if (n < 1024) return n + " B"
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " KB"
    return (n / 1024 / 1024).toFixed(2) + " MB"
  }

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

    bindLab()
  }

  globalThis.CompressAudit = { init: init }
})()
