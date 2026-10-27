// caveman-rules.js — caveman 规则引擎（移植自 OmniRouteDesktop 的 cavemanRules.ts）
//
// 来源（OmniRoute: open-sse/services/compression/）：
//   cavemanRules.ts (14020B / 432 行)     —— CAVEMAN_RULES 规则表、getRulesForContext、元数据
//   caveman.ts    (第 28–162 行)          —— RULE_KEYWORDS 关键字预筛表
//   caveman.ts    (第 164–226 行)         —— shouldAttemptRule / applyRulesToText
//   ruleLoader.ts                         —— compileRule / compileReplacement / normalizeReplacementKey
//   languageDetector.ts (3586B / 67 行)   —— LANGUAGE_HINTS 语言提示表
//
// 本文件由 scripts/port-caveman.mjs 生成：规则表与正则字面量是从 .ts 源逐字抽取、只剥离类型注解
// 得到的，不要手改（下一次生成会覆盖）。要改逻辑请改 scripts/caveman-rules.template.js。
//
// 适配点（与原 .ts 的差异，全部因为 moejs 没有 Node API）：
//   1. ruleLoader.ts 用 fs.readdirSync 在运行时扫 rules/{lang}/*.json —— moejs 没有 fs。
//      改为构建期把 53 个 JSON 内联成 ./rules-data.js（同目录），运行时只遍历对象。
//      原始 JSON 仍原样保留在 ./rules/ 下作为可读来源。
//   2. import attributes（`with { type: "json" }`）在 Go 内嵌 JS 引擎里支持不确定，故不使用。
//   3. ruleLoader 的 os.homedir()/process.argv 目录探测、mtime 缓存失效、validateRulePack 运行时
//      校验全部砍掉：内联数据是静态的，模块加载时编译一次即可。
//   4. compileRule 失败由 throw 改为 skip + 计数：moejs 的正则引擎可能不支持 lookbehind 或 \p{...}，
//      单条规则编译失败不能拖垮整个引擎（契约要求 fail-open）。
//   5. 语言提示表放进 try 块求值：不支持 \p{L} / lookbehind 的引擎退化成「永远判 en」，
//      而不是整个模块加载失败。
//   6. getRulesForContext 多一个 options.groups：magpie 面板要能单独关掉某个规则组
//      （原版没有这个概念，它总是全量加载该语言包）。
//
// 保留的东西：34 条内置英文规则的 pattern / replacement / replacementMap 逐字语义（另有 53 个
// 语言规则包共 439 条，内联在 ./rules-data.js）；强度档位
// （lite/full/ultra）与 context（all/user/system/assistant）筛选；规则组按 category 字母序
// （context→dedup→filler→structural→ultra）叠加；applyRulesToText 的关键字预筛优化，
// 包括 #12825 对文件包规则改用「当前文本」测锚定正则的那条分支。

import { RULE_PACKS } from "./rules-data.js"

/*__RULE_KEYWORDS__*/

const VALID_CONTEXTS = new Set(["all", "user", "system", "assistant"])
const VALID_CATEGORIES = new Set(["filler", "context", "structural", "dedup", "terse", "ultra"])
const VALID_INTENSITIES = new Set(["lite", "full", "ultra"])

const INTENSITY_RANK = { lite: 0, full: 1, ultra: 2 }

let compileSkipped = 0

/** 清零「正则不被运行时支持」计数。每次 apply 前调用，便于把告警带进统计。 */
export function resetRuleCompileWarnings() {
  compileSkipped = 0
}

/** 最近一次加载里被跳过的规则条数（正则编译失败）。 */
export function ruleCompileWarningCount() {
  return compileSkipped
}

function normalizeReplacementKey(value) {
  return value.trim().replace(/\s+/g, " ").toLowerCase()
}

function compileReplacement(rule) {
  if (!rule.replacementMap) return rule.replacement ?? ""

  const normalizedMap = new Map(
    Object.entries(rule.replacementMap).map(([key, value]) => [normalizeReplacementKey(key), value]),
  )
  const fallback = rule.replacement
  return (match) => {
    const normalized = normalizeReplacementKey(match)
    if (normalizedMap.has(normalized)) return normalizedMap.get(normalized) ?? ""
    return fallback ?? match
  }
}

function getRuleFlags(rule) {
  return rule.flags ?? "gi"
}

// ---------------------------------------------------------------------------
// 语言包查询
// ---------------------------------------------------------------------------

/** 某语言实际存在的规则组名。zh 只有 dedup/filler/ultra 三个，缺 context/structural。 */
export function listRulePackCategories(language) {
  const pack = RULE_PACKS[language]
  if (!pack) return []
  return Object.keys(pack).sort()
}

/** 内置规则包的全部语言代码。 */
export function listRulePackLanguages() {
  return Object.keys(RULE_PACKS).sort()
}

/** 某语言包的规则条数（面板展示用）。 */
export function countRulePackRules(language) {
  const pack = RULE_PACKS[language]
  if (!pack) return 0
  let total = 0
  for (const category of Object.keys(pack)) {
    const rules = pack[category] && pack[category].rules
    if (Array.isArray(rules)) total += rules.length
  }
  return total
}

const packCache = new Map()

function compileRule(rule, source) {
  try {
    return {
      name: rule.name,
      pattern: new RegExp(rule.pattern, getRuleFlags(rule)),
      replacement: compileReplacement(rule),
      context: VALID_CONTEXTS.has(rule.context) ? rule.context : "all",
      category: VALID_CATEGORIES.has(rule.category) ? rule.category : "filler",
      minIntensity: VALID_INTENSITIES.has(rule.minIntensity) ? rule.minIntensity : "lite",
      description: rule.description,
      source,
    }
  } catch {
    compileSkipped++
    return null
  }
}

/** 原 ruleLoader.loadAllRulesForLanguage：读该语言全部 category 文件并编译。此处遍历内联数据。 */
export function loadAllRulesForLanguage(language) {
  if (!language) return []
  const cached = packCache.get(language)
  if (cached) return cached

  const compiled = []
  for (const category of listRulePackCategories(language)) {
    const pack = RULE_PACKS[language][category]
    const rules = pack && Array.isArray(pack.rules) ? pack.rules : []
    for (const rule of rules) {
      if (!rule || typeof rule.name !== "string" || typeof rule.pattern !== "string") continue
      const out = compileRule(rule, language + "/" + category)
      if (out) compiled.push(out)
    }
  }
  packCache.set(language, compiled)
  return compiled
}

/*__CAVEMAN_RULES__*/

/**
 * 取某 role/强度/语言下要跑的规则。
 * options.groups：只保留 category 落在其中的规则（magpie 的规则组开关）。
 * 语言包为空时回落到内置英文表；两者都筛空时再回落到内置英文表的同条件子集。
 */
export function getRulesForContext(context, intensity = "full", language = "en", options) {
  const rank = INTENSITY_RANK[intensity] ?? INTENSITY_RANK.full
  // groups 未给（undefined/null）＝不按组过滤；给了空数组＝用户把所有组关掉，一条都不跑。
  // 这两种语义必须分开，否则面板上全不勾等于全勾。
  const groups = options && Array.isArray(options.groups) ? options.groups : null
  const groupAllowed = (rule) => groups === null || groups.indexOf(rule.category ?? "terse") !== -1

  const fileRules = language ? loadAllRulesForLanguage(language) : []
  const rules = fileRules.length > 0 ? fileRules : CAVEMAN_RULES
  const selected = rules.filter((rule) => {
    const minRank = INTENSITY_RANK[rule.minIntensity ?? "lite"]
    return (rule.context === "all" || rule.context === context) && minRank <= rank && groupAllowed(rule)
  })
  if (selected.length > 0) return selected
  return CAVEMAN_RULES.filter((rule) => {
    const minRank = INTENSITY_RANK[rule.minIntensity ?? "lite"]
    return (rule.context === "all" || rule.context === context) && minRank <= rank && groupAllowed(rule)
  })
}

export function getRuleByName(name) {
  return CAVEMAN_RULES.find((rule) => rule.name === name)
}

export function getCavemanRuleMetadata() {
  const intensities = ["lite", "full", "ultra"]
  return CAVEMAN_RULES.map((rule) => ({
    name: rule.name,
    context: rule.context,
    category: rule.category ?? "terse",
    minIntensity: rule.minIntensity ?? "lite",
    intensities: intensities.filter(
      (intensity) => INTENSITY_RANK[intensity] >= INTENSITY_RANK[rule.minIntensity ?? "lite"],
    ),
    description: rule.description ?? rule.name.replace(/_/g, " "),
  }))
}

// ---------------------------------------------------------------------------
// 规则应用
// ---------------------------------------------------------------------------

const ARTICLE_HINT_RE = /\b(?:a|an|the)\b/

function shouldAttemptRule(rule, lowerText) {
  if (rule.name === "articles") {
    ARTICLE_HINT_RE.lastIndex = 0
    return ARTICLE_HINT_RE.test(lowerText)
  }

  const keywords = RULE_KEYWORDS[rule.name]

  if (!keywords) return true

  // 文件包规则有自己的本地化正则，不能用英文关键字预筛挡掉它们。
  if (!CAVEMAN_RULES.includes(rule)) {
    rule.pattern.lastIndex = 0
    const matches = rule.pattern.test(lowerText)
    rule.pattern.lastIndex = 0
    return matches
  }

  return keywords.some((keyword) => lowerText.includes(keyword))
}

export function applyRulesToText(text, rules) {
  let result = text
  // 关键字预筛只需要「原始文本」：被前面规则删掉的关键字不会重新出现。
  // 但 #12825 那条针对文件包正则的预筛不一样 —— 像 leader_phrases 的 `^(?:i will|…)`
  // 这种锚定模式，只有在 pleasantries 把行首的 "Sure, " 删掉之后才会命中，
  // 所以必须拿「当前文本」去测，而不是规则开跑前的快照。
  let lowerResult = text.toLowerCase()
  let lowerResultSource = text
  const appliedRules = []

  for (const rule of rules) {
    if (lowerResultSource !== result) {
      lowerResult = result.toLowerCase()
      lowerResultSource = result
    }
    if (!shouldAttemptRule(rule, lowerResult)) continue

    const before = result
    const { pattern, replacement } = rule
    if (typeof replacement === "function") {
      const fn = replacement
      result = result.replace(pattern, (...args) => {
        const match = args[0]
        return fn(match, ...args.slice(1, -2))
      })
    } else {
      result = result.replace(pattern, replacement)
    }
    if (result !== before) {
      appliedRules.push(rule.name)
    }
  }

  return { text: result, appliedRules }
}

// ---------------------------------------------------------------------------
// 语言检测（移植自 languageDetector.ts）
// ---------------------------------------------------------------------------

let LANGUAGE_HINTS = {}
try {
  LANGUAGE_HINTS = /*__LANGUAGE_HINTS__*/
} catch {
  // 运行时正则能力不足（无 lookbehind / \p{...}）：退化为永远返回 en。
  LANGUAGE_HINTS = {}
}

const BASE_LANGUAGES = ["en", "zh"]

/** 支持的语言代码列表：en、zh，加上提示表里的语言（顺序与原版一致）。 */
export function listSupportedCompressionLanguages() {
  return BASE_LANGUAGES.concat(Object.keys(LANGUAGE_HINTS))
}

/**
 * 打分式语言检测。
 * CJK 先分流：含汉字且无假名 → zh（汉字中日共用，假名是日文独占）；含假名则交给打分器，
 * ja 的假名提示会命中。这样汉字密集的日文句子不会被误判成中文。
 * 每个语言按命中次数累加，最高分胜出；平局保留先出现的；零命中 → en。
 */
export function detectCompressionLanguage(text) {
  if (typeof text !== "string" || text.length === 0) return "en"

  try {
    if (/[\u4e00-\u9fff]/.test(text) && !/[\u3040-\u30ff]/.test(text)) return "zh"
  } catch {
    return "en"
  }

  let best = "en"
  let bestScore = 0
  for (const language of Object.keys(LANGUAGE_HINTS)) {
    const patterns = LANGUAGE_HINTS[language]
    if (!Array.isArray(patterns)) continue
    let score = 0
    for (const pattern of patterns) {
      try {
        const global = pattern.flags.includes("g")
          ? pattern
          : new RegExp(pattern.source, pattern.flags + "g")
        const matches = text.match(global)
        if (matches) score += matches.length
      } catch {
        // 单条提示正则失败只丢这一条，不影响其它语言打分。
      }
    }
    if (score > bestScore) {
      bestScore = score
      best = language
    }
  }
  return best
}
