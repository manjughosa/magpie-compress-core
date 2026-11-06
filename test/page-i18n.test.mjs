// test/page-i18n.test.mjs — the page's language switch is data, not a promise.
// It checks detection, the English static dictionary coverage, and that the
// English card metadata no longer leaks Chinese labels into the panel.
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import vm from "node:vm"
import { check } from "./helpers.mjs"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..")
const i18nSrc = readFileSync(join(root, "page", "i18n.js"), "utf8")
const viewSrc = readFileSync(join(root, "page", "view.js"), "utf8")

export const name = "page-i18n"

function loadI18n(navigatorLanguage, stored) {
  const sandbox = {
    navigator: { language: navigatorLanguage, languages: [navigatorLanguage] },
    localStorage: {
      getItem: () => stored || null,
      setItem: () => {},
    },
    console,
  }
  vm.createContext(sandbox)
  vm.runInContext(i18nSrc, sandbox)
  return sandbox.CompressI18n
}

function loadView(engines) {
  const sandbox = { CompressCatalog: { engines, order: [], presets: [] }, console }
  vm.createContext(sandbox)
  vm.runInContext(viewSrc, sandbox)
  return sandbox.CompressView
}

export async function run() {
  {
    // 宿主 iframe 是 sandbox="allow-scripts"，没有存储也没有同源；没有存量时一律中文，
    // navigator 不参与判定。
    const blank = loadI18n("en-US", "")
    check("language: default zh without stored choice", blank.lang === "zh" && blank.pick("压缩", "Compression") === "压缩")
    const en = loadI18n("en-US", "en")
    check("language: stored en wins", en.lang === "en" && en.pick("压缩", "Compression") === "Compression")
    check("language: exact translate", en.t("压缩") === "Compression")
    const zh = loadI18n("zh-CN", "")
    check("language: zh-CN -> zh", zh.lang === "zh" && zh.pick("压缩", "Compression") === "压缩")
    const forced = loadI18n("en-US", "zh")
    check("language: stored choice wins", forced.lang === "zh")
  }

  {
    // A tiny DOM is enough for the text/attribute round-trip; the real page
    // sandbox has the same node shape.
    function el(tag) {
      return {
        nodeType: 1, tagName: (tag || "div").toUpperCase(), children: [], firstChild: null,
        nextSibling: null, parentNode: null, classList: { contains: () => false }, attrs: {},
        textContent: "",
        append(x) { this.appendChild(x) },
        appendChild(x) { x.parentNode = this; this.children.push(x); this.firstChild = this.children[0]; return x },
        hasAttribute(k) { return k in this.attrs },
        getAttribute(k) { return this.attrs[k] ?? null },
        setAttribute(k, v) { this.attrs[k] = String(v) },
        addEventListener() {},
      }
    }
    const body = el("body")
    const text = { nodeType: 3, nodeValue: "压缩", parentNode: body }
    body.children = [text]
    body.firstChild = text
    const toggle = el("button")
    const doc = {
      body, documentElement: el("html"),
      querySelector(sel) { return sel === "[data-lang-toggle]" || sel === ".preset-group" ? toggle : null },
      createElement: el,
    }
    const sandbox = {
      document: doc,
      navigator: { language: "en-US", languages: ["en-US"] },
      localStorage: { getItem: () => "en", setItem: () => {} },
      console,
    }
    vm.createContext(sandbox)
    vm.runInContext(i18nSrc, sandbox)
    const I = sandbox.CompressI18n
    check("DOM: English applies", I.lang === "en" && text.nodeValue === "Compression")
    I.setLang("zh")
    check("DOM: Chinese restores", text.nodeValue === "压缩" && toggle.textContent === "EN")
    I.setLang("en")
    check("DOM: English re-applies", text.nodeValue === "Compression" && toggle.textContent === "中文")
  }

  {
    const I = loadI18n("en-US", "")
    const missing = []
    for (const file of ["page/index.html", "page/settings.html", "page/usage.html"]) {
      const html = readFileSync(join(root, file), "utf8")
      for (const m of html.matchAll(/>([^<>]*[一-鿿][^<>]*)</g)) {
        const value = m[1].trim()
        if (value && !/^(中文|English)$/.test(value) && !(value in I.TEXT_EN)) missing.push(`${file} text: ${value}`)
      }
      for (const m of html.matchAll(/(?:title|placeholder|aria-label)="([^"]*[一-鿿][^"]*)"/g)) {
        const value = m[1]
        if (value && !(value in I.ATTR_EN)) missing.push(`${file} attr: ${value}`)
      }
    }
    check("static HTML: every Chinese chrome string has an English entry", missing.length === 0, missing.join(" | "))
  }

  {
    const catalog = [{
      id: "ccr",
      label: "CCR",
      why: "把大的重复或连续块换成内容寻址引用，原文仍可取回。",
      description: "Lossless — replaces large blocks with content-addressed references.",
      note: "范围说明：工具输出压缩已从 CCR 中切掉。",
      fields: [{ key: "minBlockBytes", type: "number", label: "最小块字节", description: "小于这个大小的块不换成引用", defaultValue: 2048 }],
      stackPriority: 4,
      lossy: false,
      available: true,
      isSingleMode: false,
      inputScope: "messages",
      cacheImpact: "low",
    }]
    const view = loadView(catalog)
    check("view: English title", view.text("en").title === "Compression")
    check("view: English why", view.whyEn("ccr").indexOf("content-addressed") >= 0)
    const enCard = view.cards({ ccr: true }, {}, "en")[0]
    check("view: English field label", enCard.fields[0].label === "Minimum block bytes", enCard.fields[0].label)
    check("view: English field description", enCard.fields[0].description.indexOf("UTF-8") >= 0)
    check("view: English note", enCard.note.indexOf("Scope note") === 0)
    const zhCard = view.cards({ ccr: true }, {}, "zh")[0]
    check("view: Chinese card preserved", zhCard.why.indexOf("内容寻址") >= 0 && zhCard.fields[0].label === "最小块字节")
  }
}