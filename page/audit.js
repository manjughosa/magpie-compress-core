// Shared lab form and real-request before/after viewer. No server or host API.
(function () {
  "use strict"
  var V = globalThis.CompressView
  var CAT = globalThis.CompressCatalog || { engines: [] }
  var $ = function (id) { return document.getElementById(id) }

  function el(tag, cls, text) {
    var node = document.createElement(tag)
    if (cls) node.className = cls
    if (text != null) node.textContent = text
    return node
  }
  function bytes(n) { return (Number(n) || 0).toLocaleString() + " B" }
  function time(value) { try { return new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) } catch { return "" } }
  function field(tagName, id) { var node = el(tagName); node.id = id; return node }

  function pane(label) {
    var box = el("div", "diff-pane")
    var head = el("div", "diff-label")
    var copy = el("button", "link")
    copy.type = "button"
    copy.textContent = "复制"
    var pre = el("pre", "diff-text")
    copy.addEventListener("click", function () {
      navigator.clipboard.writeText(pre.textContent).then(function () { copy.textContent = "已复制" }).catch(function () { copy.textContent = "选中文本复制" })
    })
    head.append(el("span", "", label), copy)
    box.append(head, pre)
    return { box: box, pre: pre }
  }

  function diff(before, after) {
    var a = String(before).split("\n"), b = String(after).split("\n")
    var first = 0
    while (first < a.length && first < b.length && a[first] === b[first]) first++
    var end = 0
    while (end < a.length - first && end < b.length - first && a[a.length - 1 - end] === b[b.length - 1 - end]) end++
    return [
      { title: "原文 · 第 " + (first + 1) + " 行起", lines: a.slice(first, a.length - end) },
      { title: "压缩后 · 第 " + (first + 1) + " 行起", lines: b.slice(first, b.length - end) },
    ]
  }

  function renderDetail(host, record) {
    host.replaceChildren()
    if (!record) { host.append(el("p", "hint", "选择一个请求查看完整前后文。")); return }
    var meta = el("div", "diff-meta")
    meta.append(el("span", "", (record.protocol || "chat") + " · " + bytes(record.beforeBytes ?? record.before)), el("span", "arrow", "→"), el("span", "", bytes(record.afterBytes ?? record.after)), el("span", "muted", "−" + bytes(record.savedBytes ?? record.saved)))
    host.append(meta)
    if (record.saved === 0) { host.append(el("p", "hint", "这次请求没有变化。")); return }
    if (record.beforeText == null || record.afterText == null) {
      host.append(el("p", "hint", "这个请求发生在快照记录启用之前，只有统计数据。")); return
    }
    diff(record.beforeText, record.afterText).forEach(function (part) {
      var p = pane(part.title)
      p.pre.textContent = part.lines.join("\n")
      host.append(p.box)
    })
  }

  function init(options) {
    var getOptions = options.getOptions
    var T = function () { return V.text(options.lang() || "en") }
    var Tc = T()
    var labSelect = $("labStrategy")
    CAT.engines.filter(function (e) { return e.available !== false }).forEach(function (e) {
      var choice = el("option", "", e.name)
      choice.value = e.id
      labSelect.append(choice)
    })
    labSelect.value = "lite"
    var textInput = $("labInput")
    textInput.placeholder = "粘贴一段文本，只测试选中的策略；不会发送给模型。"
    var labResult = null
    var labExpanded = false

    function paintLab() {
      var host = $("labResult")
      host.replaceChildren()
      if (!labResult) return
      var head = el("div", "diff-meta")
      head.append(el("strong", "", CAT.engines.find(function (e) { return e.id === labResult.strategy })?.name || labResult.strategy), el("span", "", bytes(labResult.before)), el("span", "arrow", "→"), el("span", "", bytes(labResult.after)), el("span", "muted", "−" + bytes(labResult.saved)))
      host.append(head)
      if (labResult.error) host.append(el("p", "message err", labResult.error))
      var fold = el("details", "diff-fold")
      fold.open = labExpanded
      fold.addEventListener("toggle", function () { labExpanded = fold.open })
      var summary = el("summary", "", "查看前后文本")
      fold.append(summary)
      diff(labResult.beforeText, labResult.afterText).forEach(function (part) {
        var p = pane(part.title)
        p.pre.textContent = part.lines.join("\n")
        fold.append(p.box)
      })
      host.append(fold)
    }

    $("runLab").addEventListener("click", async function () {
      var button = this
      button.disabled = true
      $("labStatus").textContent = "正在本地试压…"
      try {
        if (!globalThis.CompressLab) throw new Error("试压引擎未加载，请刷新页面。")
        labResult = await globalThis.CompressLab.run(textInput.value, labSelect.value, getOptions())
        labExpanded = false
        $("labStatus").textContent = "已用同一策略管线完成；没有调用模型。"
      } catch (error) {
        labResult = null
        $("labStatus").textContent = error.message
      }
      paintLab()
      button.disabled = false
    })
    textInput.addEventListener("keydown", function (event) { if ((event.ctrlKey || event.metaKey) && event.key === "Enter") $("runLab").click() })

    var selectedCapture = null
    var expanded = false
    var known = ""
    var requestedCapture = null
    var captureResultId = ""
    function requestCapture(id) {
      selectedCapture = id
      requestedCapture = id
      var opts = Object.assign({}, getOptions())
      opts.labCommand = { id: `view-${Date.now()}`, action: "capture", captureId: id }
      options.saveOptions(opts)
      $("captureStatus").textContent = "正在读取本地快照；下一次网关请求后载入。"
    }
    function pollCaptureResult() {
      var result = getOptions().captureResult
      if (!result || result.id === captureResultId || !requestedCapture) return
      captureResultId = result.id
      if (result.status === "done" && result.record) {
        renderDetail($("captureDetail"), result.record)
        $("captureStatus").textContent = "已载入完整前后文。"
      } else if (result.status === "error") {
        $("captureStatus").textContent = "快照读取失败：" + (result.error || "未知错误")
      }
    }
    options.onOptions(pollCaptureResult)
    $("captureDiff").addEventListener("toggle", function () { if (this.open && requestedCapture) pollCaptureResult() })
    function paintCaptures() {
      var stats = getOptions().stats || {}
      var records = Array.isArray(stats.captures) ? stats.captures : []
      var signature = JSON.stringify(records)
      if (signature === known) return
      known = signature
      if (records.length && !records.some(function (r) { return r.id === selectedCapture })) selectedCapture = records[0].id
      if (!records.length) selectedCapture = null
      var host = $("captures")
      host.replaceChildren()
      if (!records.length) { host.append(el("p", "hint", "还没有真实压缩快照。通过网关发出请求后，完整前后文会留在这里。")); $("captureDetail").replaceChildren(); return }
      records.forEach(function (record) {
        var row = el("button", "capture-row" + (record.id === selectedCapture ? " selected" : ""))
        row.type = "button"
        var full = record.summary !== true
        var label = (record.protocol || "chat") + " · " + time(record.at)
        if (!full) label += " · 仅摘要"
        row.append(el("span", "num", time(record.at)), el("span", "capture-name", label), el("span", "muted", bytes(record.before) + " → " + bytes(record.after)), el("span", "num", "−" + bytes(record.saved)))
        row.title = full ? "查看压缩前后完整内容" : "单侧超过 1 MB，按保护规则仅保存摘要"
        row.disabled = !full
        row.addEventListener("click", function () {
          if (!full) { $("captureStatus").textContent = "该次完整前后文超过存储上限，仅保留统计。"; return }
          selectedCapture = record.id
          expanded = true
          $("captureDiff").open = true
          host.querySelectorAll(".capture-row").forEach(function (item) { item.classList.remove("selected") })
          row.classList.add("selected")
          requestCapture(record.id)
        })
        host.append(row)
      })
      if ($("captureDiff").open && !requestedCapture) $("captureDetail").replaceChildren(el("p", "hint", "点击一条快照后，在下一次网关请求时载入完整前后文。"))
    }
    $("clearCaptures").addEventListener("click", function () {
      var opts = Object.assign({}, getOptions())
      opts.captureCommand = { id: `clear-${Date.now()}`, action: "clear" }
      if (options.saveOptions) options.saveOptions(opts)
      else options.save({ captureCommand: opts.captureCommand })
      $("captureStatus").textContent = "已请求清除；在下一次网关请求时执行。"
    })
    options.onOptions(paintCaptures)
    paintCaptures()
  }
  globalThis.CompressAudit = { init: init, renderDetail: renderDetail }
})()
