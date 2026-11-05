// 实验室模块：单策略试压 + 结果渲染
// 注意：会话列表和差异弹窗已移至 panel.js（主面板视图）
(function () {
  "use strict"

  var U = globalThis.CompressUI
  var I18N = globalThis.CompressI18n
  var $ = function (id) { return document.getElementById(id) }
  var lastResult = null
  function pick(zh, en) { return I18N && I18N.pick ? I18N.pick(zh, en) : zh }
  if (I18N && I18N.onChange) {
    I18N.onChange(function (next) {
      lang = next
      var input = $("labInput")
      var modeEl = $("labMode")
      if (input) {
        input.placeholder = modeEl && modeEl.value === "json"
          ? '{"model":"lab","messages":[{"role":"user","content":"…"},{"role":"tool","content":"…"}]}'
          : pick("粘贴一段对话或文本…", "Paste a conversation or some text…")
      }
      if (lastResult) renderLabResult($("labResult"), lastResult)
    })
  }
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
      if (status) status.textContent = pick("请输入要试压的文本", "Enter some text to compress")
      return
    }

    if (!globalThis.CompressLab) {
      if (status) status.textContent = pick("试压引擎未加载", "Lab engine not loaded")
      return
    }

    btn.disabled = true
    if (status) status.textContent = pick("正在运行…", "Running…")

    var modeEl = $("labMode")
    var mode = modeEl ? modeEl.value : "text"

    globalThis.CompressLab.run(text, strategy.value, getOptions(), mode)
      .then(function (res) {
        lastResult = res
        if (status) status.textContent = ""
        renderLabResult(result, res)
      })
      .catch(function (err) {
        if (status) status.textContent = pick("试压失败：", "Test failed: ") + (err.message || err)
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
    var rate = res.before ? Math.round((res.saved / res.before) * 100) : 0
    stat.append(
      U.el("span", "from", fmtBytes(res.before)),
      U.el("span", "arrow", "→"),
      U.el("span", "to", fmtBytes(res.after)),
      U.el("span", "rate" + (rate > 0 ? "" : " is-flat"), rate > 0 ? "−" + rate + "%" : pick("没改动", "no change"))
    )
    head.append(stat)

    // 这次为什么动 / 为什么没动——「前后一样」必须有个交代
    var note = U.el("div", "lab-note" + (rate > 0 ? "" : " is-miss"))
    var engineMeta = globalThis.CompressView && globalThis.CompressView.engines
      ? globalThis.CompressView.engines().filter(function (e) { return e.id === res.strategy })[0]
      : null
    var whyText = I18N && I18N.lang === "en" && globalThis.CompressView
      ? (globalThis.CompressView.whyEn(res.strategy) || res.why || "")
      : ((engineMeta && engineMeta.why) || res.why || "")
    var reasonText = I18N && I18N.t ? I18N.t(res.reasonText || "") : (res.reasonText || "")
    note.append(U.el("p", "lab-note-line", (res.label || res.strategy) + pick("：", ": ") + whyText))
    note.append(U.el("p", "lab-note-line", rate > 0
      ? pick("这次命中了 · " + res.ms + " ms", "Hit this time · " + res.ms + " ms")
      : pick("这次没命中 —— ", "Miss this time — ") + (reasonText || pick("输入里没有它要的东西", "nothing in the input matches what it looks for"))))
    head.append(note)

    // 差异对比
    var panes = U.el("div", "diff-panes")

    var beforePane = U.el("div", "diff-pane")
    var beforeHead = U.el("div", "diff-pane-head")
    beforeHead.append(
      U.el("span", "diff-pane-title", pick("压缩前", "Before")),
      U.el("span", "diff-pane-size", fmtBytes(res.before))
    )
    var beforeBody = U.el("div", "diff-pane-body")
    beforeBody.textContent = res.beforeText
    beforePane.append(beforeHead, beforeBody)

    var afterPane = U.el("div", "diff-pane")
    var afterHead = U.el("div", "diff-pane-head")
    afterHead.append(
      U.el("span", "diff-pane-title", pick("压缩后", "After")),
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
      result.push('<span class="diff-removed">' + pick("… 已删除 " + removedCount + " 行 …", "… " + removedCount + " lines removed …") + "</span>")
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

    // 换个形态就换个例子，免得对着 textarea 猜该粘什么
    var modeEl = $("labMode")
    var input = $("labInput")
    if (modeEl && input) {
      var syncPlaceholder = function () {
        input.placeholder = modeEl.value === "json"
          ? '{"model":"lab","messages":[{"role":"user","content":"…"},{"role":"tool","content":"…"}]}'
          : pick("粘贴一段对话或文本…", "Paste a conversation or some text…")
      }
      modeEl.addEventListener("change", syncPlaceholder)
      syncPlaceholder()
    }

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
