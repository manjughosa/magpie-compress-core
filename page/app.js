// 压缩整页：顶部一条压缩尺，下面是一列可展开的策略行。
// 第一层只回答问题「哪个策略在跑、省了多少」，点开才给说明、数字和参数。
(function () {
  "use strict"

  var V = globalThis.CompressView
  var U = globalThis.CompressUI
  var $ = function (id) { return document.getElementById(id) }
  var lang = "en"
  var T = V.text("en")
  var options = {}
  var state = { stats: null, preset: "safe", open: {}, recentAll: false }
  var pending = null
  var timer = 0
  var writeAt = 0
  var lastStats = ""
  var optionsListeners = []
  function notifyOptions() { optionsListeners.forEach(function (fn) { fn() }) }

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

  // magpie.options.set replaces the whole options object, so every write has to
  // carry the fields this page is not touching — including the hook's stats.
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

  function localize() {
    var nodes = document.querySelectorAll("[data-t]")
    for (var i = 0; i < nodes.length; i++) {
      var key = nodes[i].getAttribute("data-t")
      if (typeof T[key] === "string") nodes[i].textContent = T[key]
    }
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

  // 老版本用驼峰 id（sessionDedup / codexResponses），读到时顺手搬过来。
  function migrate() {
    var map = { sessionDedup: "session-dedup", codexResponses: "codex-responses" }
    var old = options.strategies || {}
    var next = {}
    var changed = false
    Object.keys(old).forEach(function (k) {
      if (map[k]) {
        next[map[k]] = old[k] === true
        changed = true
      } else {
        next[k] = old[k] === true
      }
    })
    if (changed) {
      options.strategies = next
      save({ strategies: next })
    }
  }

  function renderPresets() {
    var host = $("presets")
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
    $("presetHint").textContent = T.presetHint[state.preset] || ""
  }

  function paintMeter() {
    U.meter($("meter"), V.meter(state.stats, lang), T)
  }

  function paintRows() {
    var cards = V.cards(strategies(), state.stats, lang)
    var countEl = $("strategyCount")
    if (!countEl) {
      countEl = document.createElement("span")
      countEl.id = "strategyCount"
      countEl.className = "sec-count"
      document.querySelector("h2").append(countEl)
    }
    countEl.textContent = cards.filter(function (c) { return c.on }).length + " / " + cards.length
    U.rows($("rows"), cards, {
      T: T,
      open: state.open,
      config: options,
      onToggle: function (id) {
        state.open[id] = !state.open[id]
        var row = document.querySelector('.row[data-id="' + id + '"]')
        var detail = $("d-" + id)
        if (row) row.setAttribute("aria-expanded", state.open[id] ? "true" : "false")
        if (detail) detail.hidden = !state.open[id]
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

  function paintRecent() {
    var list = V.recent(state.stats, lang, state.recentAll ? 30 : 5)
    U.recent($("recent"), list, T)
    var total = state.stats && state.stats.recent ? state.stats.recent.length : 0
    var last = V.meter(state.stats, lang).last
    $("recentSummary").textContent = "· " + total + (last ? " · " + last.before + " → " + last.after : "")
    var more = $("recentMore")
    more.hidden = total <= 5
    more.textContent = state.recentAll ? T.showLess : T.showAll
  }

  function paintAdvanced() {
    var s = options.stats || {}
    if (document.activeElement !== $("budget")) $("budget").value = options.budgetMs != null ? options.budgetMs : 600
    if (document.activeElement !== $("lastTurns")) $("lastTurns").value = options.preserve && options.preserve.lastTurns != null ? options.preserve.lastTurns : 2
    var keepSystem = !(options.preserve && options.preserve.system === false)
    $("preserveSystem").setAttribute("aria-checked", keepSystem ? "true" : "false")
    $("preserveSystem").setAttribute("aria-label", T.preserveSystem)
    $("lastWrite").textContent = s.at ? V.ago(s.at, T) : T.never
  }

  function paint() {
    renderPresets()
    paintMeter()
    paintRows()
    paintRecent()
    paintAdvanced()
    if (!V.anyOn(strategies())) setMessage(T.allOff, "warn")
    else setMessage("")
  }

  function bindAdvanced() {
    $("budget").addEventListener("change", function () {
      var n = Math.max(50, Math.min(10000, Number($("budget").value) || 600))
      $("budget").value = n
      options.budgetMs = n
      save({ budgetMs: n })
    })
    $("lastTurns").addEventListener("change", function () {
      var n = Math.max(0, Math.min(20, Number($("lastTurns").value) || 0))
      $("lastTurns").value = n
      var p = Object.assign({}, options.preserve || {})
      p.lastTurns = n
      options.preserve = p
      save({ preserve: p })
    })
    $("preserveSystem").addEventListener("click", function () {
      var next = $("preserveSystem").getAttribute("aria-checked") !== "true"
      $("preserveSystem").setAttribute("aria-checked", next ? "true" : "false")
      var p = Object.assign({}, options.preserve || {})
      p.system = next
      options.preserve = p
      save({ preserve: p })
    })
    $("recentMore").addEventListener("click", function (e) {
      e.preventDefault()
      e.stopPropagation()
      state.recentAll = !state.recentAll
      paintRecent()
    })
  }

  function watch() {
    setInterval(function () {
      magpie.options
        .get()
        .then(function (fresh) {
          if (!fresh) return
          options = fresh
          notifyOptions()
          var key = JSON.stringify(fresh.stats || {})
          if (key === lastStats) return
          lastStats = key
          state.stats = fresh.stats || null
          paintMeter()
          paintRecent()
          // 正在展开里调参数时不要重建行，避免输入框失焦。
          if (!document.activeElement || document.activeElement === document.body) paintRows()
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
      migrate()
      state.stats = options.stats || null
      lastStats = JSON.stringify(state.stats || {})
      state.preset = V.presetOf(strategies())
      localize()
      bindAdvanced()
      paint()
      globalThis.CompressAudit.init({
        lang: function () { return lang },
        getOptions: function () { return options },
        saveOptions: function (next) { options = next; pending = true; throttle() },
        onOptions: function (fn) { optionsListeners.push(fn) },
      })
      watch()
    } catch (e) {
      setMessage(T.failedRead, "err")
    }
  })()
})()
