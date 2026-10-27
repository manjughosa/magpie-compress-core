// scripts/port-caveman.mjs — caveman 引擎的构建期移植脚本。
//
// 做三件事（都只在开发机上跑一次，产物提交进仓库；moejs 运行时不需要 Node）：
//   1. 把 OmniRouteDesktop 的 rules/{lang}/*.json 原样复制到 engines/rules/（可读来源）。
//   2. 按 rules/_schema.json 校验每个规则包，再把它们内联成 engines/rules-data.js。
//      —— moejs 没有 fs，规则只能在构建期变成 .js 里的对象字面量。
//   3. 从 .ts 源逐字抽取 RULE_KEYWORDS / CAVEMAN_RULES / LANGUAGE_HINTS 三张表（只剥类型注解），
//      注入 engines/caveman-rules.js 模板，生成最终规则引擎模块。
//
// 用法：node scripts/port-caveman.mjs
// 幂等：重复跑结果一致（不含时间戳、不含随机数）。

import fs from "node:fs"
import path from "node:path"

// Point this at an OmniRoute checkout (open-sse/services/compression):
// OMNIROUTE_SRC=/path/to/OmniRoute node scripts/port-caveman.mjs
const SRC_ROOT = process.env.OMNIROUTE_SRC || path.resolve("OmniRoute", "open-sse", "services", "compression")
const SRC_RULES = path.join(SRC_ROOT, "rules")
const SCRIPT_DIR = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1"))
const OUT_DIR = path.resolve(SCRIPT_DIR, "..", "engines")
const OUT_RULES = path.join(OUT_DIR, "rules")

const TEMPLATE = path.join(SCRIPT_DIR, "caveman-rules.template.js")
const OUT_RULES_DATA = path.join(OUT_DIR, "rules-data.js")
const OUT_ENGINE = path.join(OUT_DIR, "caveman-rules.js")

function readUtf8(file) {
  return fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "")
}

function fail(message) {
  console.error(`port-caveman: ${message}`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 1. 复制规则包
// ---------------------------------------------------------------------------

function listRuleJson(dir) {
  const out = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...listRuleJson(full))
    else if (entry.name.endsWith(".json")) out.push(full)
  }
  return out.sort()
}

const ruleFiles = listRuleJson(SRC_RULES)
if (ruleFiles.length === 0) fail(`no rule json under ${SRC_RULES}`)

fs.mkdirSync(OUT_RULES, { recursive: true })
let copiedBytes = 0
for (const file of ruleFiles) {
  const rel = path.relative(SRC_RULES, file)
  const dest = path.join(OUT_RULES, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  const raw = readUtf8(file)
  fs.writeFileSync(dest, raw, "utf8")
  copiedBytes += Buffer.byteLength(raw, "utf8")
}

// ---------------------------------------------------------------------------
// 2. 按 schema 校验并内联
// ---------------------------------------------------------------------------

const schema = JSON.parse(readUtf8(path.join(SRC_RULES, "_schema.json")))
const VALID_CONTEXTS = new Set(schema.properties.rules.items.properties.context.enum)
const VALID_CATEGORIES = new Set(schema.properties.rules.items.properties.category.enum)
const VALID_INTENSITIES = new Set(schema.properties.rules.items.properties.minIntensity.enum)
// _schema.json 的 flags 枚举比实际数据旧：de/*.json 用了 "giu"，schema 只列到 "gi"。
// 以数据为准放宽成「合法 JS 正则标志字符」，仍然能挡住拼错的 flags。
const SCHEMA_FLAGS = new Set(schema.properties.rules.items.properties.flags.enum)
const VALID_FLAGS = new Set(Array.from(SCHEMA_FLAGS).concat(["giu", "gu", "iu", "gimsuy"]))
const FLAG_CHARS_RE = /^[dgimsuvy]+$/

function validatePack(pack, source) {
  const errors = []
  if (!pack || typeof pack !== "object") return ["must be an object"]
  if (typeof pack.language !== "string" || !pack.language.trim()) errors.push("language missing")
  if (typeof pack.category !== "string" || !pack.category.trim()) errors.push("category missing")
  if (!Array.isArray(pack.rules)) {
    errors.push("rules must be an array")
    return errors
  }
  pack.rules.forEach((rule, index) => {
    const at = `rules[${index}]`
    if (!rule || typeof rule !== "object") {
      errors.push(`${at} must be an object`)
      return
    }
    if (typeof rule.name !== "string" || !rule.name.trim()) errors.push(`${at}.name missing`)
    if (typeof rule.pattern !== "string" || !rule.pattern) errors.push(`${at}.pattern missing`)
    if (rule.replacement !== undefined && typeof rule.replacement !== "string") {
      errors.push(`${at}.replacement must be a string`)
    }
    if (rule.flags !== undefined && !FLAG_CHARS_RE.test(rule.flags)) {
      errors.push(`${at}.flags invalid: ${rule.flags}`)
    }
    if (rule.context !== undefined && !VALID_CONTEXTS.has(rule.context)) {
      errors.push(`${at}.context invalid: ${rule.context}`)
    }
    if (rule.category !== undefined && !VALID_CATEGORIES.has(rule.category)) {
      errors.push(`${at}.category invalid: ${rule.category}`)
    }
    if (rule.minIntensity !== undefined && !VALID_INTENSITIES.has(rule.minIntensity)) {
      errors.push(`${at}.minIntensity invalid: ${rule.minIntensity}`)
    }
    if (rule.replacementMap !== undefined) {
      if (!rule.replacementMap || typeof rule.replacementMap !== "object") {
        errors.push(`${at}.replacementMap must be an object`)
      }
    }
    // 正则在 Node 里能编译才收进来；编不出来的规则在 moejs 里同样没用。
    try {
      new RegExp(rule.pattern, rule.flags ?? "gi")
    } catch (error) {
      errors.push(`${at}.pattern does not compile: ${error.message}`)
    }
  })
  if (errors.length > 0) fail(`${source} failed schema check:\n  - ${errors.join("\n  - ")}`)
}

const packs = {}
let totalRules = 0
for (const file of ruleFiles) {
  const rel = path.relative(SRC_RULES, file).split(path.sep)
  if (rel[0].startsWith("_")) continue // _schema.json 不是规则包
  if (rel.length !== 2) fail(`unexpected rule file layout: ${rel.join("/")}`)
  const language = rel[0]
  const category = rel[1].replace(/\.json$/, "")
  const pack = JSON.parse(readUtf8(file))
  validatePack(pack, rel.join("/"))
  if (pack.language !== language) fail(`${rel.join("/")}: language "${pack.language}" != dir "${language}"`)
  if (pack.category !== category) fail(`${rel.join("/")}: category "${pack.category}" != file "${category}"`)
  if (!packs[language]) packs[language] = {}
  packs[language][category] = pack
  totalRules += pack.rules.length
}

function safeJson(value) {
  // U+2028/2029 在 JS 源码里是行终止符，会把字符串字面量截断。
  return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029")
}

const languages = Object.keys(packs).sort()
const ruleDataLines = [
  "// rules-data.js — caveman 规则包的内联数据（自动生成，勿手改）。",
  "//",
  "// 生成器: scripts/port-caveman.mjs",
  "// 来源  : " + SRC_RULES + "\\{lang}\\*.json",
  "// 可读原文: ./rules/{lang}/*.json（原样复制，含 _schema.json）",
  "//",
  "// 为什么不用 JSON import：moejs 是 Go 内嵌的 JS 引擎，import attributes",
  "// （`with { type: \"json\" }`）支持不确定，运行时也没有 fs 可以读文件。",
  "// 所以构建期把规则包转成这个模块的对象字面量，运行时只做对象遍历。",
  "//",
  "// 结构: { [language]: { [category]: { language, category, rules[] } } }",
  "// zh 只有 dedup / filler / ultra 三组（没有 context 与 structural），缺组即缺键。",
  "",
  "export const RULE_PACKS = {",
]
for (const language of languages) {
  const categories = Object.keys(packs[language]).sort()
  const inner = categories.map((category) => `      ${category}: ${safeJson(packs[language][category])}`).join(",\n")
  ruleDataLines.push(`  ${JSON.stringify(language)}: {\n${inner},\n  },`)
}
ruleDataLines.push("}", "")
fs.writeFileSync(OUT_RULES_DATA, ruleDataLines.join("\n"), "utf8")

// ---------------------------------------------------------------------------
// 3. 从 .ts 抽取三张表并生成规则引擎
// ---------------------------------------------------------------------------

function lines(file) {
  return readUtf8(file).split(/\r?\n/)
}

/** 从 startRe 命中的行开始，取到 trim 后等于 endTrim 的那一行（含两端）。 */
function extractBlock(file, startRe, endTrim) {
  const src = lines(file)
  let start = -1
  for (let i = 0; i < src.length; i++) {
    if (startRe.test(src[i])) {
      start = i
      break
    }
  }
  if (start < 0) fail(`cannot find block start ${startRe} in ${file}`)
  for (let j = start + 1; j < src.length; j++) {
    if (src[j].trim() === endTrim) return src.slice(start, j + 1)
  }
  return fail(`cannot find block end "${endTrim}" in ${file}`)
}

function stripTypes(blockLines, source) {
  const block = blockLines.join("\n")
  const out = block
    .replace(/^const RULE_KEYWORDS: Record<string, string\[\]> = \{$/m, "export const RULE_KEYWORDS = {")
    .replace(/^const CAVEMAN_RULES: CavemanRule\[\] = \[$/m, "export const CAVEMAN_RULES = [")
    .replace(/\(match: string\): string =>/g, "(match) =>")
    .replace(/const map: Record<string, string> = \{/g, "const map = {")
    .replace(/ as const;/g, ";")
    .replace(/ as const/g, "")
  if (/\((\w+): (?:string|number|boolean)\)/.test(out)) {
    // 只是提醒：规则体里还有函数参数类型注解，说明剥离规则漏了一种写法。
    console.warn(`port-caveman: warning — residual type annotation in ${source}`)
  }
  return out
}

const cavemanTs = path.join(SRC_ROOT, "caveman.ts")
const cavemanRulesTs = path.join(SRC_ROOT, "cavemanRules.ts")
const langDetectorTs = path.join(SRC_ROOT, "languageDetector.ts")

const ruleKeywords = stripTypes(
  extractBlock(cavemanTs, /^const RULE_KEYWORDS: Record<string, string\[\]> = \{$/, "};"),
  "caveman.ts RULE_KEYWORDS",
)

const cavemanRulesTable = stripTypes(
  extractBlock(cavemanRulesTs, /^const CAVEMAN_RULES: CavemanRule\[\] = \[$/, "];"),
  "cavemanRules.ts CAVEMAN_RULES",
)

// LANGUAGE_HINTS 注入到模板的 try 块里，所以只要对象字面量（去掉 `const ... = ` 前缀与结尾分号）。
const langHintsBlock = extractBlock(
  langDetectorTs,
  /^const LANGUAGE_HINTS: Record<string, RegExp\[\]> = \{$/,
  "};",
)
langHintsBlock[0] = "{"
langHintsBlock[langHintsBlock.length - 1] = "}"

const template = readUtf8(TEMPLATE)
for (const marker of ["/*__RULE_KEYWORDS__*/", "/*__CAVEMAN_RULES__*/", "/*__LANGUAGE_HINTS__*/"]) {
  if (!template.includes(marker)) fail(`template is missing ${marker}`)
}

const engine = template
  .replace("/*__RULE_KEYWORDS__*/", ruleKeywords)
  .replace("/*__CAVEMAN_RULES__*/", cavemanRulesTable)
  .replace("/*__LANGUAGE_HINTS__*/", langHintsBlock.join("\n"))

fs.writeFileSync(OUT_ENGINE, engine, "utf8")

// ---------------------------------------------------------------------------
// 汇总
// ---------------------------------------------------------------------------

const builtinRuleCount = (cavemanRulesTable.match(/^\s{4}name: "/gm) || []).length
const engineBytes = Buffer.byteLength(engine, "utf8")
const dataBytes = Buffer.byteLength(ruleDataLines.join("\n"), "utf8")

console.log("port-caveman: done")
console.log(`  rules copied      : ${ruleFiles.length} files, ${copiedBytes} bytes -> engines/rules/`)
console.log(`  languages         : ${languages.join(", ")}`)
console.log(`  pack rules        : ${totalRules} rules across ${ruleFiles.length - 1} packs`)
console.log(`  builtin en rules  : ${builtinRuleCount}`)
console.log(`  rules-data.js     : ${dataBytes} bytes`)
console.log(`  caveman-rules.js  : ${engineBytes} bytes`)
