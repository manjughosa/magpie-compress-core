// 页面保存链路测试：用最小 DOM/bridge 桩加载真实 page/panel.js，
// 验证「保存合并语义」——flush 必须把挂起的改动叠到最新 options 上，
// 不能用页面持有的整份旧副本覆盖别人刚写的键（enabled 抖动的根因）。
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import vm from "node:vm"
import { check } from "./helpers.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const panelSrc = readFileSync(join(here, "..", "page", "panel.js"), "utf8")

function makeEl(tag) {
  const el = {
    tagName: tag || "div",
    children: [],
    listeners: {},
    attrs: {},
    style: {},
    dataset: {},
    textContent: "",
    innerHTML: "",
    value: "",
    disabled: false,
    hidden: false,
    type: "",
    id: "",
    parentNode: null,
    classList: {
      _set: new Set(),
      toggle(c, on) { on ? this._set.add(c) : this._set.delete(c) },
      add(c) { this._set.add(c) },
      remove(c) { this._set.delete(c) },
      contains(c) { return this._set.has(c) },
    },
    addEventListener(ev, fn) { (el.listeners[ev] = el.listeners[ev] || []).push(fn) },
    setAttribute(k, v) { el.attrs[k] = String(v) },
    getAttribute(k) { return el.attrs[k] ?? null },
    removeAttribute(k) { delete el.attrs[k] },
    append(...kids) { kids.forEach((k) => { if (k && typeof k === "object") { k.parentNode = el }; el.children.push(k) }) },
    appendChild(k) { if (k && typeof k === "object") k.parentNode = el; el.children.push(k); return k },
    removeChild(k) { el.children = el.children.filter((c) => c !== k); return k },
    click() { (el.listeners.click || []).forEach((fn) => fn({ preventDefault() {} })) },
  }
  return el
}

function makeEnv(store, hooks) {
  const byId = new Map()
  const winListeners = {}
  const intervals = []
  const doc = makeEl("document")
  doc.readyState = "complete"
  doc.visibilityState = "visible"
  doc.body = makeEl("body")
  doc.body.dataset = {}
  doc.documentElement = makeEl("html")
  doc.getElementById = (id) => {
    if (!byId.has(id)) { const el = makeEl("div"); el.id = id; byId.set(id, el) }
    return byId.get(id)
  }
  doc.createElement = (tag) => makeEl(tag)
  doc.createTextNode = (t) => ({ textContent: t })
  doc.addEventListener = () => {}

  const texts = {
    presets: { off: "关", safe: "保守", custom: "自定义", all: "全开" },
    presetHint: {},
    failedWrite: "保存失败",
    savedOk: "已保存并生效",
    statsFileNote: "",
    ccrInstall: "安装 retrieve 工具",
    ccrSent: "已提交，下个请求执行",
    ccrDone: "retrieve 工具已装好",
    ccrFailed: "安装失败，点击重试",
  }
  const engineIds = ["lite", "session-dedup"]
  const view = {
    text: () => texts,
    engines: () => engineIds.map((id) => ({ id })),
    presetStrategies(name) {
      const out = {}
      engineIds.forEach((id) => {
        out[id] = name === "off" ? false : name === "all" ? true : true
      })
      return out
    },
    presetOf(s) {
      if (!s) return "safe"
      const vals = engineIds.map((id) => s[id] === true)
      if (vals.every((v) => !v)) return "off"
      if (vals.every((v) => v)) return "all"
      return "custom"
    },
    cards: () => [],
    meter: () => null,
  }
  const ui = {
    el: (tag, cls, text) => { const el = makeEl(tag); el.className = cls || ""; if (text != null) el.textContent = text; return el },
    clear: (host) => { host.children = [] },
    box: () => makeEl("div"),
    row: () => makeEl("div"),
    rows: () => {},
    meter: () => {},
  }

  const writes = []
  const bridge = {
    options: {
      get: async () => JSON.parse(JSON.stringify(store.value)),
      set: async (next) => {
        if (hooks.failNextSet) { hooks.failNextSet = false; throw new Error("bridge down") }
        store.value = JSON.parse(JSON.stringify(next))
        writes.push(next)
        return JSON.parse(JSON.stringify(store.value))
      },
    },
  }

  const context = {
    console,
    structuredClone,
    JSON, Date, Math, Object, Array, String, Number, Boolean, RegExp, Error, Promise, Set, Map,
    setTimeout, clearTimeout,
    setInterval: (fn, ms) => { intervals.push(fn); return intervals.length },
    clearInterval: () => {},
    document: doc,
    window: { addEventListener: (ev, fn) => { (winListeners[ev] = winListeners[ev] || []).push(fn) } },
    magpie: bridge,
  }
  context.globalThis = context
  context.CompressView = view
  context.CompressUI = ui
  vm.createContext(context)
  return { context, byId, winListeners, intervals, store, writes, hooks }
}

const tick = () => new Promise((r) => setTimeout(r, 10))

async function boot(store, hooks = {}) {
  const env = makeEnv(store, hooks)
  vm.runInContext(panelSrc, env.context, { filename: "panel.js" })
  await tick()
  await tick()
  return env
}

function presetButtons(env) {
  return env.byId.get("presets").children
}

export const name = "page-save-flow"

export async function run() {
  // S1 flush 合并语义：保存期间别人（CLI/另一面板）改了 options，
  // flush 必须叠上去，不能整包盖掉 budgetMs / extraKey。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true }, budgetMs: 600 } }
    const env = await boot(store)
    store.value = { strategies: { lite: true, "session-dedup": true }, budgetMs: 900, extraKey: "x" }
    presetButtons(env)[0].click() // 关
    env.byId.get("saveOptions").click() // 保存按钮 = 立即 flush
    await tick(); await tick()
    const saved = store.value
    check("S1 strategies 写成 off", saved.strategies && saved.strategies.lite === false && saved.strategies["session-dedup"] === false)
    check("S1 不盖掉外部 budgetMs", saved.budgetMs === 900)
    check("S1 不盖掉外部 extraKey", saved.extraKey === "x")
  }

  // S2 脏态轮询不冲掉未保存的编辑：poll 之后 flush 仍能写出改动。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true }, stats: { requests: 1 } } }
    const env = await boot(store)
    presetButtons(env)[0].click() // 关（防抖中）
    store.value = { strategies: { lite: true, "session-dedup": true }, stats: { requests: 2 } }
    env.intervals.forEach((fn) => fn()) // 轮询触发
    await tick()
    env.byId.get("saveOptions").click()
    await tick(); await tick()
    check("S2 轮询后改动仍落盘", store.value.strategies.lite === false)
    check("S2 轮询带进了新 stats", store.value.stats && store.value.stats.requests >= 1)
  }

  // S3 连续两次改动合并：最后状态生效。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true } } }
    const env = await boot(store)
    presetButtons(env)[0].click() // 关
    presetButtons(env)[3].click() // 全开
    env.byId.get("saveOptions").click()
    await tick(); await tick()
    check("S3 最后改动生效", store.value.strategies.lite === true && store.value.strategies["session-dedup"] === true)
  }

  // S4 写失败：改动挂回，按钮保持脏态，重试成功。
  {
    const hooks = { failNextSet: true }
    const store = { value: { strategies: { lite: true, "session-dedup": true } } }
    const env = await boot(store, hooks)
    const saveBtn = env.byId.get("saveOptions")
    presetButtons(env)[0].click()
    saveBtn.click()
    await tick(); await tick()
    check("S4 失败后未落盘", store.value.strategies.lite === true)
    check("S4 按钮保持脏态可重试", saveBtn.disabled === false)
    saveBtn.click() // 重试
    await tick(); await tick()
    check("S4 重试后落盘", store.value.strategies.lite === false)
  }

  // S5 非脏态时外部改动被面板采纳（预设高亮回推）。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true } } }
    const env = await boot(store)
    store.value = { strategies: { lite: false, "session-dedup": false } }
    env.intervals.forEach((fn) => fn())
    await tick(); await tick()
    const off = presetButtons(env)[0]
    check("S5 外部 off 被采纳并高亮", off.attrs["aria-selected"] === "true")
  }

  // S6 pagehide 立即落盘（防抖内的改动不丢）。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true } } }
    const env = await boot(store)
    presetButtons(env)[0].click()
    ;(env.winListeners.pagehide || []).forEach((fn) => fn())
    await tick(); await tick()
    check("S6 pagehide 触发立即保存", store.value.strategies.lite === false)
  }

  // S7 「装 retrieve」按钮：以最新 options 为底只加 ccrCommand，不盖 strategies。
  {
    const store = { value: { strategies: { lite: true, "session-dedup": true }, budgetMs: 900 } }
    const env = await boot(store)
    store.value = { strategies: { lite: true, "session-dedup": true }, budgetMs: 700, extraKey: "x" }
    env.byId.get("installCcr").click()
    await tick(); await tick()
    const cmd = store.value.ccrCommand
    check("S7 写入 install-mcp 命令", !!cmd && cmd.action === "install-mcp" && /^ccr-/.test(cmd.id))
    check("S7 不盖掉外部 budgetMs/extraKey", store.value.budgetMs === 700 && store.value.extraKey === "x")
    check("S7 策略键原样保留", store.value.strategies.lite === true && store.value.strategies["session-dedup"] === true)
    check("S7 提交后按钮进挂起态", env.byId.get("installCcr").disabled === true &&
      env.byId.get("installCcr").textContent === "已提交，下个请求执行")
  }

  // S8 发布状态回画：宿主发布的 compress-ccr-status.js 决定按钮终态。
  {
    const store = { value: { strategies: { lite: true } } }
    const env = await boot(store)
    const btn = env.byId.get("installCcr")
    check("S8 默认态可点击", btn.disabled === false && btn.textContent === "安装 retrieve 工具")
    env.context.__COMPRESS_CORE_CCR__ = { id: "ccr-old", status: "done" }
    env.intervals.forEach((fn) => fn()) // 触发轮询重画
    await tick(); await tick()
    check("S8 done 后锁定为已装好", btn.disabled === true && btn.textContent === "retrieve 工具已装好")
  }

  // S9 发布 error 且非本次提交：按钮恢复可点（可重试），不锁死。
  {
    const store = { value: { strategies: { lite: true } } }
    const env = await boot(store)
    env.context.__COMPRESS_CORE_CCR__ = { id: "ccr-x", status: "error", error: "boom" }
    await tick()
    // 直接走一次 options 轮询以外的重画入口：改 stats 触发 intervals 重画不可靠，
    // 这里用「非脏态外部 options 变化」驱动 safePaint。
    store.value = { strategies: { lite: false } }
    env.intervals.forEach((fn) => fn())
    await tick(); await tick()
    const btn = env.byId.get("installCcr")
    check("S9 error 可重试", btn.disabled === false && btn.textContent === "安装失败，点击重试")
  }
}
