// caveman-rules.js — caveman 规则引擎（移植自 OmniRouteDesktop 的 cavemanRules.ts）
//
// 来源（OmniRoute@ff679ab86e0113a009d8aeeeee464139bd090874 open-sse/services/compression/）：
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

export const RULE_KEYWORDS = {
  redundant_phrasing: ["make sure", "be sure"],
  redundant_because: ["due to the fact", "the reason is because"],
  redundant_directive: ["it is important", "you should", "remember to"],
  pleasantries: [
    "sure",
    "certainly",
    "of course",
    "happy to",
    "thanks",
    "thank you",
    "glad to help",
    "glad to",
    "no problem",
    "you're welcome",
    "youre welcome",
    "absolutely",
  ],
  polite_framing: [
    "please",
    "kindly",
    "could you please",
    "would you please",
    "can you please",
    "i would like you",
    "i want you",
    "i need you",
  ],
  hedging: [
    "it seems like",
    "it appears that",
    "i think that",
    "i believe that",
    "probably",
    "possibly",
    "maybe it",
  ],
  verbose_instructions: [
    "provide a detailed",
    "give me a comprehensive",
    "write an in-depth",
    "create a thorough",
    "explain in detail",
  ],
  filler_adverbs: ["basically", "essentially", "actually", "literally", "simply", "currently"],
  filler_phrases: ["i want to", "i need to", "i'd like to", "i'm looking for"],
  redundant_openers: ["hi there", "hello", "good morning", "hey"],
  verbose_requests: ["i was wondering", "would it be possible"],
  leader_phrases: [
    "i'll",
    "i will",
    "i can",
    "i'd",
    "let me",
    "you can",
    "we will",
    "we can",
    "let's",
  ],
  self_reference: ["i am trying to", "i am working on", "i have been"],
  excessive_gratitude: ["thank you so much", "thanks in advance", "i really appreciate"],
  qualifier_removal: ["a bit", "a little", "somewhat", "kind of", "sort of"],
  softeners: ["if possible", "when you get a chance", "at your convenience", "just wondering"],
  uncertainty_fillers: ["i guess", "i suppose", "more or less", "in a way"],
  assistant_fillers: ["here's", "below is", "this is"],
  compound_collapse: ["and any potential"],
  explanatory_prefix: [
    "the function appears to be handling",
    "the code seems to",
    "the class is",
    "this module is",
  ],
  question_to_directive: [
    "can you explain why",
    "could you show me how",
    "would you tell me",
    "can you tell me",
  ],
  context_setup: ["i have the following code", "here is my code", "below is the code"],
  intent_clarification: [
    "what i'm trying to do",
    "my objective is to",
    "what i need is",
    "i'm aiming to",
  ],
  background_removal: ["as you may know", "as we discussed earlier"],
  meta_commentary: ["note that", "keep in mind", "remember that"],
  purpose_statement: ["for the purpose of", "with the goal of", "in an effort to", "for every"],
  list_conjunction: ["and also", "as well as"],
  purpose_phrases: ["in order to", "so as to"],
  redundant_quantifiers: ["each and every", "any and all"],
  all_quantifier: ["any and all"],
  verbose_connectors: ["furthermore", "additionally", "moreover", "in addition"],
  transition_removal: ["on the other hand", "in contrast", "however"],
  emphasis_removal: ["very", "really", "extremely", "highly", "quite"],
  passive_voice: [
    "is being used",
    "is being called",
    "is being generated",
    "was created",
    "was generated",
    "was implemented",
  ],
  repeated_context: [
    "as we discussed earlier",
    "as mentioned before",
    "as previously stated",
    "as i said before",
  ],
  repeated_question: [
    "same question as before",
    "i asked this earlier",
    "this is the same question",
  ],
  reestablished_context: ["going back to the code above", "referring back to", "returning to"],
  summary_replacement: ["to summarize", "in summary of our conversation", "to recap"],
  ultra_abbreviations: ["database"],
  ultra_config_abbreviation: ["configuration"],
  ultra_function_abbreviation: ["function"],
  ultra_request_abbreviation: ["request"],
  ultra_response_abbreviation: ["response"],
  ultra_implementation_abbreviation: ["implementation"],
  ultra_authentication_abbreviation: ["authentication"],
  ultra_authorization_abbreviation: ["authorization"],
  ultra_application_abbreviation: ["application"],
  ultra_dependency_abbreviation: ["dependency", "dependencies"],
  ultra_common_abbreviations: [
    "implementation",
    "authentication",
    "authorization",
    "application",
    "dependency",
    "dependencies",
  ],
};

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

export const CAVEMAN_RULES = [
  // ── Category 1: Filler Removal (10+ rules) ──────────────────────────

  {
    name: "redundant_phrasing",
    pattern:
      /\b(?:make sure to|be sure to|due to the fact that|the reason is because|it is important to|you should|remember to)\b\s*/gi,
    replacement: (match) => {
      const map = {
        "make sure to": "ensure ",
        "be sure to": "ensure ",
        "due to the fact that": "because ",
        "the reason is because": "because ",
        "it is important to": "",
        "you should": "",
        "remember to": "",
      };
      return map[match.trim().toLowerCase()] ?? "";
    },
    context: "all",
    category: "structural",
    minIntensity: "full",
    description: "Replace verbose stock phrases with shorter equivalents.",
  },
  {
    name: "pleasantries",
    pattern:
      /(?<!make\s)(?<!be\s)\b(?:i'?d be happy to|i would be happy to|i'?d be glad to|i would be glad to|glad to help|happy to|thank you|thanks|no problem|you'?re welcome|absolutely|certainly|of course|sure)\b[,.!?\s]*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
    description: "Drop conversational acknowledgements that do not change request meaning.",
  },
  {
    name: "polite_framing",
    pattern:
      /\b(?:please|kindly|could you please|would you please|can you please|I would like you to|I want you to|I need you to)\b\s*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "hedging",
    pattern:
      /\b(?:it seems like|it appears that|I think that|I believe that|probably|possibly|maybe it)\b\s*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "verbose_instructions",
    pattern:
      /\b(?:provide a detailed explanation of|give me a comprehensive explanation of|write an in-depth explanation of|create a thorough explanation of|provide a detailed|give me a comprehensive|write an in-depth|create a thorough|explain in detail)\b/gi,
    replacement: (match) => {
      const map = {
        "provide a detailed explanation of": "explain ",
        "give me a comprehensive explanation of": "explain ",
        "write an in-depth explanation of": "explain ",
        "create a thorough explanation of": "explain ",
        "provide a detailed": "provide ",
        "give me a comprehensive": "give ",
        "write an in-depth": "write ",
        "create a thorough": "create ",
        "explain in detail": "explain ",
      };
      const lower = match.toLowerCase();
      return map[lower] ?? match;
    },
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "filler_adverbs",
    pattern: /(?<![a-z])\b(?:basically|essentially|actually|literally|simply|currently)\b\s*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "articles",
    pattern: /\b(?:[Aa]n|[Aa]|[Tt]he)\s+(?=[a-z])/g,
    replacement: "",
    context: "all",
    category: "terse",
    minIntensity: "full",
    description: "Remove English articles from prose while protected technical tokens stay intact.",
  },
  {
    name: "filler_phrases",
    pattern: /^(?:I want to|I need to|I'd like to|I'm looking for)\b\s*/gim,
    replacement: "",
    context: "user",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "redundant_openers",
    pattern: /^(?:Hi there|Hello|Good morning|Hey)\s*[,.!?\s]?\s*/gim,
    replacement: "",
    context: "user",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "verbose_requests",
    pattern: /\b(?:I was wondering if you could|Would it be possible to)\b\s*/gi,
    replacement: "",
    context: "user",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "leader_phrases",
    pattern: /^(?:i'?ll|i will|i can|i'?d|let me|you can|we will|we can|let'?s)\s+(?=[a-z])/gim,
    replacement: "",
    context: "all",
    category: "terse",
    minIntensity: "full",
    description: "Remove leading helper phrases before the actual instruction or answer.",
  },
  {
    name: "self_reference",
    pattern: /^(?:I am trying to|I am working on|I have been)\b\s*/gim,
    replacement: "",
    context: "user",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "excessive_gratitude",
    pattern: /\b(?:Thank you so much|Thanks in advance|I really appreciate)\b[,.!?\s]*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },
  {
    name: "qualifier_removal",
    pattern: /\b(?:a bit|a little|somewhat|kind of|sort of)\b\s*/gi,
    replacement: "",
    context: "all",
    category: "filler",
    minIntensity: "lite",
  },

  // ── Category 2: Context Condensation (8+ rules) ──────────────────────

  {
    name: "compound_collapse",
    pattern: /\band any potential\b/gi,
    replacement: "",
    context: "all",
    category: "context",
    minIntensity: "full",
  },
  {
    name: "explanatory_prefix",
    pattern:
      /\b(?:The function appears to be handling|The code seems to|The class is|This module is)\b/gi,
    replacement: (match) => {
      const map = {
        "the function appears to be handling": "Function:",
        "the code seems to": "Code:",
        "the class is": "Class:",
        "this module is": "Module:",
      };
      return map[match.toLowerCase()] ?? match;
    },
    context: "all",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "question_to_directive",
    pattern:
      /\b(?:Can you explain why|Could you show me how|Would you tell me|Can you tell me)\b\s*/gi,
    replacement: (match) => {
      const trimmed = match.trimEnd().toLowerCase();
      const map = {
        "can you explain why": "Explain why ",
        "could you show me how": "Show how ",
        "would you tell me": "Tell me ",
        "can you tell me": "Tell me ",
      };
      return map[trimmed] ?? match;
    },
    context: "user",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "context_setup",
    pattern: /\b(?:I have the following code|Here is my code|Below is the code)\b\s*[:.]?\s*/gi,
    replacement: "Code:",
    context: "user",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "intent_clarification",
    pattern:
      /\b(?:What I'm trying to do is|My objective is to|What I need is|I'm aiming to)\b\s*/gi,
    replacement: "Goal:",
    context: "user",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "background_removal",
    pattern: /\b(?:As you may know,?\s*|As we discussed earlier,?\s*)/gi,
    replacement: "",
    context: "all",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "meta_commentary",
    pattern: /^(?:Note that|Keep in mind that|Remember that)\b\s*/gim,
    replacement: "",
    context: "all",
    category: "context",
    minIntensity: "lite",
  },
  {
    name: "purpose_statement",
    pattern: /\b(?:for the purpose of|with the goal of|in an effort to|for every)\b/gi,
    replacement: (match) => {
      const map = {
        "for the purpose of": "for",
        "with the goal of": "to",
        "in an effort to": "to",
        "for every": "per",
      };
      return map[match.toLowerCase()] ?? match;
    },
    context: "all",
    category: "context",
    minIntensity: "lite",
  },

  // ── Category 3: Structural Compression (7+ rules) ────────────────────

  {
    name: "list_conjunction",
    pattern: /,\s*and also\s+|,\s*as well as\s+/gi,
    replacement: ", ",
    context: "all",
    category: "structural",
    minIntensity: "full",
  },
  {
    name: "purpose_phrases",
    pattern: /\b(?:in order to|so as to)\b\s*/gi,
    replacement: "to ",
    context: "all",
    category: "structural",
    minIntensity: "lite",
  },
  {
    name: "redundant_quantifiers",
    pattern: /\b(?:each and every single|each and every|any and all)\b/gi,
    replacement: (match) => {
      const map = {
        "each and every single": "each",
        "each and every": "each",
        "any and all": "all",
      };
      return map[match.toLowerCase()] ?? match;
    },
    context: "all",
    category: "structural",
    minIntensity: "full",
  },
  {
    name: "verbose_connectors",
    pattern: /\b(?:furthermore|additionally|moreover|in addition)\b\s*/gi,
    replacement: "also ",
    context: "all",
    category: "structural",
    minIntensity: "lite",
  },
  {
    name: "transition_removal",
    pattern: /^(?:On the other hand,?\s*|In contrast,?\s*|However,?\s*)/gim,
    replacement: "",
    context: "all",
    category: "structural",
    minIntensity: "lite",
  },
  {
    name: "emphasis_removal",
    pattern: /\b(?:very|really|extremely|highly|quite)\s+(?=[a-z])/gi,
    replacement: "",
    context: "all",
    category: "structural",
    minIntensity: "lite",
  },
  {
    name: "passive_voice",
    pattern:
      /\b(?:is being used|is being called|is being generated|was created|was generated|was implemented)\b/gi,
    replacement: (match) => {
      const map = {
        "is being used": "uses",
        "is being called": "calls",
        "is being generated": "generated",
        "was created": "created",
        "was generated": "generated",
        "was implemented": "implemented",
      };
      return map[match.toLowerCase()] ?? match;
    },
    context: "all",
    category: "structural",
    minIntensity: "full",
  },

  // ── Category 4: Multi-Turn Dedup (5+ rules) ─────────────────────────

  {
    name: "repeated_context",
    pattern:
      /\b(?:As we discussed earlier|As mentioned before|As previously stated|As I said before)\b[,.]?\s*/gi,
    replacement: "See above. ",
    context: "all",
    category: "dedup",
    minIntensity: "lite",
  },
  {
    name: "repeated_question",
    pattern:
      /\b(?:Same question as before|I asked this earlier|This is the same question)\b[,.]?\s*/gi,
    replacement: "[same question] ",
    context: "user",
    category: "dedup",
    minIntensity: "lite",
  },
  {
    name: "reestablished_context",
    pattern: /\b(?:Going back to the code above|Referring back to|Returning to)\b\s*/gi,
    replacement: "Re: ",
    context: "all",
    category: "dedup",
    minIntensity: "lite",
  },
  {
    name: "summary_replacement",
    pattern:
      /\b(?:To summarize what we've discussed|In summary of our conversation|To recap)\b[,.]?\s*/gi,
    replacement: "Summary: ",
    context: "assistant",
    category: "dedup",
    minIntensity: "lite",
  },

  // ── Category 5: Ultra Abbreviations ─────────────────────────────────

  {
    name: "ultra_abbreviations",
    pattern:
      /\b(?:database|configuration|function|request|response|implementation|authentication|authorization|application|dependency|dependencies)\b/gi,
    replacement: (match) => {
      const map = {
        database: "DB",
        configuration: "config",
        function: "fn",
        request: "req",
        response: "res",
        implementation: "impl",
        authentication: "auth",
        authorization: "authz",
        application: "app",
        dependency: "dep",
        dependencies: "deps",
      };
      return map[match.toLowerCase()] ?? match;
    },
    context: "all",
    category: "ultra",
    minIntensity: "ultra",
  },
];

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
  LANGUAGE_HINTS = {
  it: [
    /(?<![\p{L}\p{N}])(?:perche|perché|pero|però|cioe|cioè|quindi|potresti|vorrei|adesso|errore|grazie|devo|voglio|questo|quello|anche|sono|molto)(?![\p{L}\p{N}])/iu,
  ],
  "pt-BR": [
    /(?<![\p{L}\p{N}])(?:voce|você|preciso|arquivo|codigo|código|erro|falha|obrigado)(?![\p{L}\p{N}])/iu,
  ],
  // NOTE: English-ambiguous words are intentionally excluded — "error" (es) and
  // "configuration" (fr) are identical in English and would misclassify English text.
  // Spanish/French keep their distinctive native spellings (fallo / erreur, etc).
  es: [
    /(?<![\p{L}\p{N}])(?:necesito|archivo|codigo|código|fallo|gracias|puedes)(?![\p{L}\p{N}])/iu,
  ],
  de: [/(?<![\p{L}\p{N}])(?:ich|datei|fehler|bitte|kannst|konfiguration|danke)(?![\p{L}\p{N}])/iu],
  fr: [/(?<![\p{L}\p{N}])(?:fichier|erreur|merci|peux|besoin)(?![\p{L}\p{N}])/iu],
  ru: [
    /(?<![\p{L}\p{N}])(?:\u044d\u0442\u043e|\u0447\u0442\u043e|\u043a\u0430\u043a|\u0435\u0441\u043b\u0438|\u0447\u0442\u043e\u0431\u044b|\u043a\u043e\u0442\u043e\u0440\u044b\u0439|\u043c\u043e\u0436\u0435\u0442|\u043d\u0443\u0436\u043d\u043e|\u0435\u0441\u0442\u044c|\u0431\u044b\u043b\u043e|\u0431\u0443\u0434\u0435\u0442|\u043c\u043e\u0436\u043d\u043e|\u0434\u043e\u043b\u0436\u0435\u043d|\u0444\u0430\u0439\u043b|\u043e\u0448\u0438\u0431\u043a\u0430|\u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430|\u0434\u0430\u043d\u043d\u044b\u0435)(?![\p{L}\p{N}])/iu,
    /[\u0430-\u044f\u0451]/iu,
  ],
  ja: [/[\u3040-\u30ff]/u],
  hu: [
    /(?<![\p{L}\p{N}])(?:kérlek|tudnád|szeretném|magyarázd|mutasd|miért|hogyan|függvény|beállítás|adatbázis|következő|problémám|megoldani|hiba|fájl|így)(?![\p{L}\p{N}])/iu,
  ],
  id: [
    /(?<![\p{L}\p{N}])(?:saya|kamu|anda|dengan|untuk|yang|tidak|bisa|terima\s+kasih|dari)(?![\p{L}\p{N}])/iu,
  ],
}
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
