// 页面与面板共用的绘制层。视觉参考 magpie 自己的设置行：
// 一行只放「名字 + 一句话 + 一个控件」，点开才展开说明、数字和参数。
(function () {
  "use strict"

  function el(tag, cls, text) {
    var e = document.createElement(tag)
    if (cls) e.className = cls
    if (text != null) e.textContent = text
    return e
  }

  function clear(host) {
    if (host) host.replaceChildren()
  }

  function tag(label, tone) {
    return el("span", "tag" + (tone ? " " + tone : ""), label)
  }

  function switchButton(on, disabled, onChange, label) {
    var b = el("button", "sw")
    b.type = "button"
    b.setAttribute("role", "switch")
    b.setAttribute("aria-checked", on ? "true" : "false")
    if (label) b.setAttribute("aria-label", label)
    if (disabled) b.disabled = true
    b.addEventListener("click", function (ev) {
      ev.stopPropagation()
      if (disabled) return
      onChange(b.getAttribute("aria-checked") !== "true")
    })
    return b
  }

  // 顶部压缩尺。用原生 progress，不写内联样式（页面 CSP 不允许）。
  function meter(host, m, T) {
    clear(host)
    var box = el("section", "meter" + (m.empty ? " is-empty" : ""))
    var top = el("div", "meter-top")
    top.append(
      el("span", "in num", m.before),
      el("span", "arrow", "→"),
      el("span", "out num", m.after),
      el("span", "rate num", m.empty ? "—" : "−" + m.savedPct + "%"),
    )
    var bar = el("progress", "bar")
    bar.max = 100
    bar.value = m.empty ? 0 : m.savedPct
    bar.setAttribute("aria-label", T.cut)
    var foot = el("div", "meter-foot")
    foot.append(
      el("span", "", m.requests + " " + T.requests),
      el("span", "", m.tokens + " " + T.tokensSaved),
      el("span", m.bad ? "bad" : "", m.failOpen + " " + T.failedOpen),
      el("span", "muted", m.last ? T.lastRequest + " · " + m.last.when : T.emptyMeter),
    )
    box.append(top, bar, foot)
    host.append(box)
  }

  function fieldControl(field, value, onChange, T) {
    var row = el("div", "field")
    var head = el("div", "fh")
    head.append(el("span", "fname", field.label))
    if (field.description) head.append(el("span", "fhint", field.description))
    var ctl = el("div", "fctl")
    if (field.type === "boolean") {
      ctl.append(switchButton(value === true, false, onChange, field.label))
    } else if (field.type === "select") {
      var sel = document.createElement("select")
      ;(field.options || []).forEach(function (o) {
        var op = document.createElement("option")
        op.value = o.value
        op.textContent = o.label
        if (String(o.value) === String(value)) op.selected = true
        sel.append(op)
      })
      sel.addEventListener("change", function () { onChange(sel.value) })
      ctl.append(sel)
    } else if (field.type === "number") {
      var inp = document.createElement("input")
      inp.type = "number"
      inp.className = "num-in"
      if (field.min != null) inp.min = field.min
      if (field.max != null) inp.max = field.max
      inp.value = value == null ? "" : value
      inp.addEventListener("change", function () {
        var n = Number(inp.value)
        if (!isFinite(n)) return
        if (field.min != null) n = Math.max(field.min, n)
        if (field.max != null) n = Math.min(field.max, n)
        inp.value = n
        onChange(n)
      })
      ctl.append(inp)
    } else if (field.type === "multiselect") {
      var wrap = el("div", "multi")
      var picked = Array.isArray(value) ? value.slice() : []
      ;(field.options || []).forEach(function (o) {
        var lab = el("label", "chk")
        var box = document.createElement("input")
        box.type = "checkbox"
        box.checked = picked.indexOf(o.value) !== -1
        box.addEventListener("change", function () {
          var i = picked.indexOf(o.value)
          if (box.checked && i === -1) picked.push(o.value)
          if (!box.checked && i !== -1) picked.splice(i, 1)
          onChange(picked.slice())
        })
        lab.append(box, el("span", "", o.label))
        wrap.append(lab)
      })
      ctl.append(wrap)
    } else {
      var txt = document.createElement("input")
      txt.type = "text"
      txt.value = value == null ? "" : value
      txt.addEventListener("change", function () { onChange(txt.value) })
      ctl.append(txt)
    }
    row.append(head, ctl)
    return row
  }

  function statCell(label, value) {
    var d = el("div", "stat")
    d.append(el("span", "sk", label), el("span", "sv num", value))
    return d
  }

  // 一行一个策略；详情只在这一行展开，不把 15 张卡片同时铺开。
  function rows(host, cards, ctx) {
    clear(host)
    host.className = "list"
    cards.forEach(function (c, i) {
      var open = ctx.open[c.id] === true
      var row = el("div", "row pref" + (c.on ? "" : " is-off") + (c.available === false ? " is-unavailable" : ""))
      row.tabIndex = 0
      row.setAttribute("role", "button")
      row.setAttribute("aria-expanded", open ? "true" : "false")
      row.setAttribute("aria-controls", "d-" + c.id)
      row.dataset.id = c.id

      var ord = el("span", "ord num", String(i + 1).padStart(2, "0"))
      var who = el("div", "who")
      var nameLine = el("div", "name-line")
      nameLine.append(el("span", "name", c.label))
      nameLine.append(tag(c.badge, c.tone))
      who.append(nameLine, el("div", "sub", c.why))

      var val = el("div", "val")
      if (c.available !== false && c.on && c.saved) val.append(el("span", "gain num", c.gain))
      var sw = switchButton(c.on, c.available === false, function (next) {
        ctx.onSwitch(c.id, next)
      }, c.label)
      var chev = el("span", "chev", "›")
      val.append(sw, chev)
      row.append(ord, who, val)

      var detail = el("div", "detail")
      detail.id = "d-" + c.id
      if (!open) detail.hidden = true
      var inner = el("div", "detail-in")
      inner.append(el("p", "desc", c.description))
      var stats = el("div", "stats")
      stats.append(
        statCell(ctx.T.hits, String(c.runs || 0)),
        statCell(ctx.T.saved, c.saved ? c.gain.replace("−", "") : "—"),
        statCell(ctx.T.share, c.share ? Math.round(c.share * 100) + "%" : "—"),
      )
      inner.append(stats)
      var meta = el("div", "meta")
      meta.append(
        el("span", "", ctx.T.priority + " " + c.priority),
        el("span", "", ctx.T.cacheImpact + " " + (ctx.T["cache" + String(c.cacheImpact || "none").charAt(0).toUpperCase() + String(c.cacheImpact || "none").slice(1)] || c.cacheImpact || "—")),
        el("span", "", ctx.T.inputScope + " " + (ctx.T["scope" + String(c.inputScope || "messages").charAt(0).toUpperCase() + String(c.inputScope || "messages").slice(1)] || c.inputScope || "—")),
      )
      inner.append(meta)
      if (c.available === false) inner.append(el("p", "requires", ctx.T.needs + " " + (c.requires || "—")))
      if (c.fields && c.fields.length) {
        var fields = el("div", "fields")
        c.fields.forEach(function (f) {
          var v = ctx.config[c.id] && ctx.config[c.id][f.key] != null ? ctx.config[c.id][f.key] : f.defaultValue
          fields.append(fieldControl(f, v, function (next) { ctx.onField(c.id, f.key, next) }, ctx.T))
        })
        inner.append(el("div", "fold-h", ctx.T.config), fields)
      }
      detail.append(inner)

      row.addEventListener("click", function (ev) {
        if (ev.target.closest(".sw, input, select, button, textarea, label")) return
        ctx.onToggle(c.id)
      })
      row.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault()
          ctx.onToggle(c.id)
        }
      })
      host.append(row, detail)
    })
  }

  function recent(host, list, T) {
    clear(host)
    if (!list.length) {
      host.append(el("p", "empty", T.noRecent))
      return
    }
    var table = el("table", "recent-table")
    var head = el("tr")
    ;[T.when, T.model, T.agent, T.before + " → " + T.after, T.took].forEach(function (h) {
      head.append(el("th", "", h))
    })
    table.append(head)
    list.forEach(function (r) {
      var tr = el("tr", r.bad ? "bad" : "")
      tr.append(
        el("td", "muted", r.when),
        el("td", "mono", r.model),
        el("td", "muted", r.agent),
        el("td", "num", r.before + " → " + r.after),
        el("td", "num", r.took),
      )
      table.append(tr)
    })
    host.append(table)
  }

  globalThis.CompressUI = {
    el: el,
    clear: clear,
    tag: tag,
    switchButton: switchButton,
    meter: meter,
    fieldControl: fieldControl,
    rows: rows,
    recent: recent,
  }
})()
