import { readFileSync } from "node:fs"
import vm from "node:vm"
import { check } from "./helpers.mjs"

const page = new URL("../page/", import.meta.url)
export const name = "page-interaction"

function element(tagName) {
  return {
    tagName, children: [], dataset: {}, attrs: {}, listeners: {},
    append(...children) { this.children.push(...children) },
    replaceChildren(...children) { this.children = children },
    setAttribute(key, value) { this.attrs[key] = value },
    getAttribute(key) { return this.attrs[key] },
    addEventListener(type, listener) { this.listeners[type] = listener },
  }
}

export function run() {
  for (const file of ["app.js", "panel.js"]) {
    const source = readFileSync(new URL(file, page), "utf8")
    // Exercise the private function without adding a production export for tests.
    const start = source.indexOf("  function diffStats(")
    const end = source.indexOf("  function renderLines(", start)
    const windowSize = Number(source.match(/var DIFF_WINDOW = (\d+)/)[1])
    for (const lang of ["zh", "en"]) {
      const diff = vm.runInNewContext("(" + source.slice(start, end).trim() + ")", {
        DIFF_WINDOW: windowSize,
        pick: (zh, en) => lang === "zh" ? zh : en,
      })
      const identical = lang === "zh" ? "逐行一致" : "identical line by line"
      for (const [before, after] of [["A\nA\nB", "A\nB"], ["A\nB", "B\nA"], ["A\nB", "A\nA\nB"]]) {
        const result = diff(before, after)
        check(`${file}/${lang}: changed sequence is not identical (${JSON.stringify(before)})`, !result.note.includes(identical), result.note)
      }
      check(`${file}/${lang}: equal text remains identical`, diff("A\nB", "A\nB").note.includes(identical))
      const prefix = Array.from({ length: 60 }, (_, i) => `line ${i}`).join("\n")
      const changed = diff(prefix + "\nA\nA\nB", prefix + "\nA\nB")
      check(`${file}/${lang}: repeated-line change beyond line 40 stays in the window`, changed.start > 0 && changed.start <= 61 && changed.end > 61)
      const added = diff("A\nB", "A\nC")
      check(`${file}/${lang}: new and removed lines are still counted`, added.added === 1 && added.removed === 1 && added.prefix === 1)
    }
  }

  const sandbox = { document: { createElement: element } }
  vm.runInNewContext(readFileSync(new URL("ui.js", page), "utf8"), sandbox)
  const host = element("div")
  let toggles = 0
  let switches = 0
  sandbox.CompressUI.rows(host, [{ id: "lite", on: false, label: "Lite", why: "Cleanup", badge: "Lossless", description: "Cleanup" }], {
    open: {}, config: {}, T: {},
    onToggle() { toggles++ },
    onSwitch(id, next) { if (id === "lite" && next === true) switches++ },
    onField() {},
  })
  const row = host.children[0]
  const button = row.children[2].children[0]
  for (const key of [" ", "Enter"]) {
    let prevented = false
    const before = toggles
    row.listeners.keydown({ key, target: button, preventDefault() { prevented = true } })
    check(`switch ${JSON.stringify(key)}: native activation is not cancelled`, !prevented && toggles === before)
    const beforeSwitch = switches
    button.listeners.click({ stopPropagation() {} })
    check(`switch ${JSON.stringify(key)}: activation changes the strategy`, switches === beforeSwitch + 1)
    const beforeRow = toggles
    prevented = false
    row.listeners.keydown({ key, target: row, preventDefault() { prevented = true } })
    check(`row ${JSON.stringify(key)}: keyboard still expands details`, prevented && toggles === beforeRow + 1)
  }
}
