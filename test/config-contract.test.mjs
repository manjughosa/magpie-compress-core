// test/config-contract.test.mjs — 面板旋钮与引擎实现的契约。
//
// 这套断言盯的是一类具体的 bug：**声明了但引擎从不读的键**（死旋钮）。用户在面板上拨动
// 它，看起来设置生效了，实际引擎完全无视——比压缩率低更糟，因为它让人以为自己已经调过了。
//
// 真实发生过的三例（都由本套件现在守住）：
//   1. rtk：catalog.js 声明 `level`，而 mergeRtkConfig 只读 `intensity`。上游用的是通用
//      levels 机制，移植时摊成 fields 却写错了键名，强度选择形同虚设。
//   2. codex-responses：catalog.js 声明 compressShell / compressPatch / compressSearch /
//      compressBuild 四个开关，而 mergeConfig 一个都不读——那四个键来自上游另一个组件
//      toolResultCompressor.ts，不属于这个引擎。
//   3. session-dedup：catalog.js 把 minJaccard / shingleSize 声明成顶层键，而 runFuzzyPass
//      只从 stepConfig.fuzzy 子对象里读它们。
// 反向也发生过：lite 的 apply() 读五个键，catalog 只声明三个，preserveCurrentTurn 与
// supportsVision 在 README 里写得很详细，面板却设不到。
//
// 修法不是去改 catalog.js 的静态声明，而是让**引擎自己导出 configSchema**：
// scripts/gen-page-catalog.mjs 的约定是「引擎导出的 configSchema 优先于 catalog.js 的
// 静态 fields」，因为「已移植的引擎以实现为准（它才知道自己读哪些键）」。
//
// 源码：engines/*.js 的 configSchema 导出 + apply()/mergeConfig() 的键读取。

import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { check } from "./helpers.mjs"
import { ENGINES } from "../catalog.js"
import { REGISTRY } from "../engines/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const ENGINES_DIR = join(here, "..", "engines")

// id → 相对 engines/ 的实现路径。engineModule 不暴露文件位置，所以这里显式建表；
// 新增引擎时漏建表会被 C-04 抓到（表里没有的已移植引擎会失败）。
const SOURCES = {
  "session-dedup": "session-dedup.js",
  lite: "lite.js",
  rtk: "rtk/index.js",
  "codex-responses": "codex-responses.js",
  headroom: "headroom.js",
  relevance: "relevance/index.js",
  ultra: "ultra.js",
  caveman: "caveman.js",
  aggressive: "aggressive.js",
  ionizer: "ionizer.js",
  llm: "llm.js",
  ccr: "ccr/index.js",
  "read-lifecycle": "read-lifecycle.js",
}

// enabled 是通用开关，面板另有独立的开关按钮，gen-page-catalog 会把它过滤掉。
const HIDDEN = new Set(["enabled"])

/** 键在实现源码里是否处于「被读取」的位置。 */
function keyIsRead(src, key) {
  const patterns = [
    `.${key}`, // cfg.key / merged.key / config.key / raw.key / o.key
    `["${key}"]`, // cfg["key"] / stepConfig["key"]
    `['${key}']`,
  ]
  if (patterns.some((p) => src.includes(p))) return true
  // 解构：const { key } = cfg
  return new RegExp(`\\{[^}]*\\b${key}\\b[^}]*\\}\\s*=`).test(src)
}

export const name = "config-contract"

export function run() {
  const ported = ENGINES.filter((meta) => REGISTRY.has(meta.id))

  // ─── C 组：不变量 ────────────────────────────────────────────────────────
  check("C-01 已移植引擎数量与源码表一致", ported.length === Object.keys(SOURCES).length,
    `ported=${ported.length} table=${Object.keys(SOURCES).length}`)

  let allHaveSchema = true
  let allKeysRead = true
  const deadKnobs = []
  const missingSchema = []

  for (const meta of ported) {
    const engine = REGISTRY.get(meta.id)
    const rel = SOURCES[meta.id]

    // C-02：每个已移植引擎都必须导出自己的 configSchema，页面才不必回落到 catalog 的
    // 静态 fields（那份声明正是三次死旋钮的来源）。
    const schema = Array.isArray(engine.configSchema) ? engine.configSchema : null
    if (!schema || schema.length === 0) {
      allHaveSchema = false
      missingSchema.push(meta.id)
      continue
    }

    // C-03：声明的每个键都必须被实现读取，否则就是死旋钮。
    let src = ""
    try {
      src = readFileSync(join(ENGINES_DIR, rel), "utf8")
    } catch {
      src = ""
    }
    // 引擎可能把读取逻辑拆到同目录的别的文件（relevance → config.js / scorer.js）。
    if (rel.includes("/")) {
      try {
        const dir = join(ENGINES_DIR, dirname(rel))
        for (const f of ["config.js", "scorer.js", "sample.js"]) {
          try { src += "\n" + readFileSync(join(dir, f), "utf8") } catch { /* 没有就算了 */ }
        }
      } catch { /* ignore */ }
    }
    for (const field of schema) {
      if (!field || !field.key || HIDDEN.has(field.key)) continue
      if (!src || !keyIsRead(src, field.key)) {
        allKeysRead = false
        deadKnobs.push(`${meta.id}.${field.key}`)
      }
    }
  }

  check("C-02 每个已移植引擎都导出自己的 configSchema（页面不回落 catalog 静态声明）",
    allHaveSchema, missingSchema.join(","))
  check("C-03 声明的每个键都被引擎读取（无死旋钮）", allKeysRead, deadKnobs.join(","))

  // C-04：源码表必须覆盖所有已移植引擎——漏建表会让 C-03 静默跳过某个引擎。
  const untabled = ported.filter((m) => !SOURCES[m.id]).map((m) => m.id)
  check("C-04 源码表覆盖所有已移植引擎", untabled.length === 0, untabled.join(","))

  // ─── C 组：具体回归（三例真实发生过的死旋钮）─────────────────────────────
  const keysOf = (id) => (REGISTRY.get(id).configSchema || []).map((f) => f.key)

  check("C-05 rtk 暴露的是 intensity，不是 catalog 里那个引擎从不读的 level",
    keysOf("rtk").includes("intensity") && !keysOf("rtk").includes("level"))
  check("C-06 codex-responses 不再有 compressShell/compressPatch/compressSearch/compressBuild 四个死开关",
    !keysOf("codex-responses").some((k) => /^compress(Shell|Patch|Search|Build)$/.test(k)))
  check("C-07 codex-responses 暴露 mergeConfig 真正读的键",
    ["minBytes", "maxOutputBytes", "maxCandidateBytes", "maxLines"].every((k) => keysOf("codex-responses").includes(k)))
  check("C-08 session-dedup 不再把 minJaccard/shingleSize 声明成顶层键（引擎只从 fuzzy 子对象读）",
    !keysOf("session-dedup").includes("minJaccard") && !keysOf("session-dedup").includes("shingleSize"))
  check("C-09 session-dedup 暴露 fuzzy 布尔与 minBlockChars",
    keysOf("session-dedup").includes("fuzzy") && keysOf("session-dedup").includes("minBlockChars"))
  check("C-10 lite 暴露 apply() 真正读的全部五个键（含此前面板设不到的两个）",
    ["compressToolResults", "maxToolLength", "preserveSystemPrompt", "preserveCurrentTurn", "supportsVision"]
      .every((k) => keysOf("lite").includes(k)))
  check("C-11 lite 不暴露试压台专用的 treatAllAsHistory",
    !keysOf("lite").includes("treatAllAsHistory"))

  // ─── C 组：schema 自身形状 ───────────────────────────────────────────────
  {
    const bad = []
    for (const meta of ported) {
      for (const f of REGISTRY.get(meta.id).configSchema || []) {
        if (!f || typeof f.key !== "string" || !f.key) { bad.push(`${meta.id}:<no key>`); continue }
        if (!["number", "boolean", "select", "multiselect"].includes(f.type)) bad.push(`${meta.id}.${f.key}:type=${f.type}`)
        if (typeof f.label !== "string" || !f.label) bad.push(`${meta.id}.${f.key}:no label`)
        if (f.defaultValue === undefined) bad.push(`${meta.id}.${f.key}:no defaultValue`)
        if (f.type === "number" && (typeof f.min !== "number" || typeof f.max !== "number")) {
          bad.push(`${meta.id}.${f.key}:number without min/max`)
        }
        if ((f.type === "select" || f.type === "multiselect") && !Array.isArray(f.options)) {
          bad.push(`${meta.id}.${f.key}:${f.type} without options`)
        }
      }
    }
    check("C-12 每个字段都有 type/label/defaultValue，number 带 min/max，select 带 options",
      bad.length === 0, bad.join(" | "))
  }

  // C-13：defaultValue 必须等于实现里的默认值，否则面板显示的初值与真实行为不符。
  {
    const mismatches = []
    const expectations = {
      rtk: { intensity: "standard", maxLinesPerResult: 120 },
      lite: { compressToolResults: false, maxToolLength: 2000, preserveCurrentTurn: false, supportsVision: true },
      headroom: { minRows: 8 },
      "session-dedup": { minBlockChars: 80, fuzzy: false },
      "codex-responses": { minBytes: 512, maxLines: 160 },
    }
    for (const [id, want] of Object.entries(expectations)) {
      const schema = REGISTRY.get(id).configSchema || []
      for (const [key, expected] of Object.entries(want)) {
        const f = schema.find((x) => x.key === key)
        if (!f) { mismatches.push(`${id}.${key}:not declared`); continue }
        if (f.defaultValue !== expected) mismatches.push(`${id}.${key}: default=${f.defaultValue} want=${expected}`)
      }
    }
    check("C-13 面板显示的默认值与实现默认值一致", mismatches.length === 0, mismatches.join(" | "))
  }
}
