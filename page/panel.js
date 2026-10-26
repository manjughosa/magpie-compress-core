// 面板版：设置里的插件标签页 + 用量页末尾的小卡。和整页共用同一套行式 UI。
(function () {
  "use strict"

  var V = globalThis.CompressView
  var U = globalThis.CompressUI
  var $ = function (id) { return document.getElementById(id) }
  var which = document.body.dataset.panel || "settings"
  var lang = "en"
  var T = V.text("en")
  var options = {}
  var state = { stats: null, preset: "safe", open: {} }
  var pending = null
  var timer = 0
  var writeAt = 0
  var lastStats = ""

  function localize() {
    var nodes = document.querySelectorAll("[data-t]")
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-t")
      if (typeof T[key] === "string") nodes[i].textContent = T[key]
    }
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
        setMessage("")
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
    clearTimeout(timer)
    timer = setTimeout(flush, Math.max(0, 1100 - (Date.now() - writeAt)))
  }

  function setMessage(text, tone) {
    var m = $("message")
    if (!m) return
    m.textContent = text || ""
    m.className = "message" + (tone ? " " + tone : "")
    m.hidden = !text
  }

  function strategies() {
    var base = V.presetStrategies("safe")
    var raw = options.strategies
    return raw && typeof raw === "object" ? Object.assign(base, raw) : base
  }

  function configOf(id) {
    var c = options[id]
    return c && typeof c === "object" ? c : {}
  }

  function renderPresets() {
    var host = $("presets")
    if (!host) return
    U.clear(host)
    host.className = "segs"
    ;["off", "safe", "custom", "all"].forEach(function (name) {
      var b = U.el("button", "opt" + (name === state.preset ? " on" : ""), T.presets[name])
      b.type = "button"
      b.setAttribute("aria-selected", name === state.preset ? "true" : "false")
      if (name === "custom") b.disabled = true
      b.addEventListener("click", function () {
        if (name === "custom" || name === state.preset) return
        var next = V.presetStrategies(name)
        options.strategies = next
        state.preset = name
        save({ strategies: next })
        paint()
      })
      host.append(b)
    })
    if ($("presetHint")) $("presetHint").textContent = T.presetHint[state.preset] || ""
  }

  function paintRows() {
    var host = $("rows")
    if (!host) return
    var cards = V.cards(strategies(), state.stats, lang)
    U.rows(host, cards, {
      T: T,
      open: state.open,
      config: options,
      onToggle: function (id) {
        state.open[id] = !state.open[id]
        paintRows()
      },
      onSwitch: function (id, next) {
        var all = Object.assign({}, strategies())
        all[id] = next
        options.strategies = all
        state.preset = V.presetOf(all)
        save({ strategies: all })
        paint()
      },
      onField: function (id, key, value) {
        var cfg = Object.assign({}, configOf(id))
        cfg[key] = value
        options[id] = cfg
        save({ [id]: cfg })
      },
    })
  }

  function paintUsage() {
    if ($("meter")) U.meter($("meter"), V.meter(state.stats, lang), T)
    if ($("recent")) U.recent($("recent"), V.recent(state.stats, lang, 6), T)
    if ($("recentSummary")) {
      var m = V.meter(state.stats, lang)
      $("recentSummary").textContent = m.empty ? "" : m.requests + " " + T.requests
    }
  }

  function paint() {
    renderPresets()
    paintRows()
    paintUsage()
    if (which === "settings" && !V.anyOn(strategies())) setMessage(T.allOff, "warn")
    else setMessage("")
  }

  function watch() {
    setInterval(function () {
      magpie.options
        .get()
        .then(function (fresh) {
          if (!fresh) return
          options = fresh
          var key = JSON.stringify(fresh.stats || {})
          if (key === lastStats) return
          lastStats = key
          state.stats = fresh.stats || null
          paintUsage()
        })
        .catch(function () {})
    }, 5000)
  }

  ;(async function () {
    try {
      var theme = await magpie.ready
      lang = (theme && theme.lang) || "en"
      T = V.text(lang)
      options = (await magpie.options.get()) || {}
      state.stats = options.stats || null
      lastStats = JSON.stringify(state.stats || {})
      state.preset = V.presetOf(strategies())
      localize()
      paint()
      watch()
    } catch (e) {
      setMessage(T.failedRead, "err")
    }
  })()
})()
