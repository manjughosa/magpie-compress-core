// test/caveman.test.mjs — caveman 引擎移植保真测试。
// 断言覆盖：元数据契约、语言检测与选包、preservation（代码/URL/路径/数字）、
// 校验回退、规则组开关、角色过滤、四协议遍历、fail-open。
// 源码：open-sse/services/compression/{caveman,preservation,validation,languageDetector,ruleLoader}.ts

import {
  apply,
  compressText,
  resolveConfig,
  cleanupArtifacts,
  isCodeDominantText,
  validateCompression,
  findFencedCodeBlocks,
  extractPreservedBlocks,
  restorePreservedBlocks,
  estimateCompressionTokens,
  configSchema,
  ALL_RULE_GROUPS,
  id,
  label,
  why,
  lossy,
  cacheImpact,
  defaultOn,
  stackPriority,
  isSingleMode,
  levels,
  available,
} from "../engines/caveman.js"
import {
  CAVEMAN_RULES,
  RULE_KEYWORDS,
  applyRulesToText,
  detectCompressionLanguage,
  getRulesForContext,
  listRulePackLanguages,
  listRulePackCategories,
  listSupportedCompressionLanguages,
  getCavemanRuleMetadata,
} from "../engines/caveman-rules.js"
import { check, ctxFor, chatBody, segmentsOf } from "./helpers.mjs"

export const name = "caveman"

const EN_SAMPLE =
  "Could you please take a look at this function? I would be happy to help you understand what it does. " +
  "Please make sure to run the tests and explain in detail what happened when it failed. Thanks in advance."

const ZH_SAMPLE =
  "我需要你帮我仔细检查一下这个函数，它看起来好像有一些问题，请务必确保它能够正确地处理所有的边界情况，" +
  "并且请一定要注意不要遗漏任何细节，非常感谢你的帮助。"

// zh 规则包只有 dedup/filler/ultra 三组共 16 条（源项目就没给中文写 context/structural），
// 覆盖的是「如前所述 / 麻烦你 / 我觉得 / 其实 / 谢谢」这类措辞。这段样本用的就是规则表
// 实际覆盖的说法，用来测中文包的真实压缩上限；上面那段干净中文只用来测「不会压坏」。
const ZH_TYPICAL =
  "你好，麻烦你帮我看看这段代码。我觉得其实这个问题呢，就是配置文件里的依赖关系没有处理好。" +
  "如前所述，数据库连接也有问题。谢谢你的帮助！"

function firstSegment(body, protocol = "chat") {
  const segs = segmentsOf(body, protocol)
  return segs.length > 0 ? segs[0] : null
}

export async function run() {
  // ---- 元数据契约 ----
  check("1 id", id === "caveman")
  check("2 label", label === "Caveman")
  check("3 lossy=true", lossy === true)
  check("4 cacheImpact=moderate", cacheImpact === "moderate")
  check("5 defaultOn=false", defaultOn === false)
  check("6 stackPriority=20", stackPriority === 20)
  check("7 isSingleMode=false", isSingleMode === false)
  check("8 levels=undefined", levels === undefined)
  check("9 available=true", available === true)
  check("10 why 含 30%", typeof why === "string" && why.indexOf("30%") !== -1, why)

  // ---- configSchema ----
  const langField = configSchema.find((f) => f.key === "lang")
  const groupsField = configSchema.find((f) => f.key === "groups")
  check("11 语言字段是 select", !!langField && langField.type === "select")
  check("12 auto + 11 种语言", !!langField && langField.options.length === 12, String(langField && langField.options.length))
  check(
    "13 语言选项齐全",
    !!langField &&
      ["auto", "en", "zh", "ja", "de", "es", "fr", "it", "pt-BR", "ru", "hu", "id"].every((v) =>
        langField.options.some((o) => o.value === v),
      ),
  )
  check("14 规则组是 multiselect", !!groupsField && groupsField.type === "multiselect")
  check(
    "15 五个规则组",
    !!groupsField && groupsField.options.map((o) => o.value).join(",") === ALL_RULE_GROUPS.join(","),
  )

  // ---- 规则包：11 种语言，zh 只有 3 类 ----
  const packLangs = listRulePackLanguages()
  check("16 规则包 11 种语言", packLangs.length === 11, packLangs.join(","))
  check(
    "17 语言列表齐全",
    ["de", "en", "es", "fr", "hu", "id", "it", "ja", "pt-BR", "ru", "zh"].every((l) => packLangs.indexOf(l) !== -1),
  )
  const zhCats = listRulePackCategories("zh")
  check("18 zh 只有 dedup/filler/ultra", zhCats.join(",") === "dedup,filler,ultra", zhCats.join(","))
  const enCats = listRulePackCategories("en")
  check("19 en 五类齐全", enCats.length === 5, enCats.join(","))
  check("20 内置英文规则表非空", CAVEMAN_RULES.length >= 30, String(CAVEMAN_RULES.length))
  check("21 RULE_KEYWORDS 非空", Object.keys(RULE_KEYWORDS).length >= 40, String(Object.keys(RULE_KEYWORDS).length))
  check("22 支持的检测语言含 en/zh", listSupportedCompressionLanguages().indexOf("zh") !== -1)

  // ---- 语言检测 ----
  check("23 中文→zh", detectCompressionLanguage(ZH_SAMPLE) === "zh")
  check("24 英文→en", detectCompressionLanguage(EN_SAMPLE) === "en")
  check("25 日文→ja", detectCompressionLanguage("これはテストです。ありがとうございます。") === "ja")
  check("26 空串→en", detectCompressionLanguage("") === "en")

  // ---- getRulesForContext ----
  const enUserRules = getRulesForContext("user", "full", "en")
  check("27 en/user/full 有规则", enUserRules.length > 0, String(enUserRules.length))
  const enLiteRules = getRulesForContext("user", "lite", "en")
  check("28 lite 规则更少", enLiteRules.length <= enUserRules.length)
  const zhRules = getRulesForContext("user", "full", "zh")
  check("29 zh 规则非空", zhRules.length > 0, String(zhRules.length))
  const zhOnlyDedup = getRulesForContext("user", "full", "zh", { groups: ["dedup"] })
  check("30 groups 过滤生效", zhOnlyDedup.length > 0 && zhOnlyDedup.length < zhRules.length)
  check("31 每条规则有 name/pattern", enUserRules.every((r) => typeof r.name === "string" && r.pattern instanceof RegExp))

  // ---- applyRulesToText ----
  {
    const r = applyRulesToText(EN_SAMPLE, getRulesForContext("user", "full", "en"))
    check("32 英文规则改写生效", r.text !== EN_SAMPLE && r.appliedRules.length > 0)
    check("33 英文改写更短", r.text.length < EN_SAMPLE.length, `${EN_SAMPLE.length} -> ${r.text.length}`)
    const empty = applyRulesToText("", enUserRules)
    check("34 空串不动", empty.text === "" && empty.appliedRules.length === 0)
  }

  // ---- preservation ----
  {
    const src = "Run this please:\n\n```js\nconst a = 1\nfunction f() { return a }\n```\n\nAnd read https://example.com/x?y=1 and E:\\tmp\\a.js"
    const { text, blocks } = extractPreservedBlocks(src, { preservePatterns: [] })
    check("35 抽出保护区", blocks.length >= 2, String(blocks.length))
    check("36 代码围栏被占位", text.indexOf("function f()") === -1)
    check("37 还原一字不差", restorePreservedBlocks(text, blocks) === src)
    check("38 围栏数量", findFencedCodeBlocks(src).length === 1)
  }

  // ---- validateCompression ----
  {
    const good = validateCompression("see `a` and ```js\nx\n```", "see `a` and ```js\nx\n```")
    check("39 相同文本校验通过", good.valid === true && good.errors.length === 0)
    const bad = validateCompression("see `a` and ```js\nx\n```", "see and")
    check("40 丢行内代码校验失败", bad.valid === false)
    const badFence = validateCompression("```js\nx\n```", "```js\ny\n```")
    check("41 改代码围栏内容校验失败", badFence.valid === false)
  }

  // ---- 收尾与代码占比 ----
  check("42 cleanup 折叠空格", cleanupArtifacts("a   b") === "a b")
  check("43 cleanup 去空格标点", cleanupArtifacts("a , b") === "a, b")
  check("44 cleanup 去多余空行", cleanupArtifacts("a\n\n\n\nb") === "a\n\nb")
  check("45 纯代码段落被识别", isCodeDominantText("const a = 1\nfunction f() {\n  return a\n}\nexport default f"))
  check("46 纯散文不算代码", !isCodeDominantText("This is prose.\nIt has two lines only.\nReally."))

  // ---- 端到端：英文变小 ----
  {
    const body = chatBody([{ role: "user", text: EN_SAMPLE }])
    const before = firstSegment(body).text
    const changed = apply(body, ctxFor("chat"))
    const after = firstSegment(body).text
    check("47 英文 apply 返回 true", changed === true)
    check("48 英文确实变小", after.length < before.length, `${before.length} -> ${after.length}`)
    check(
      "49 英文压缩率 ≥15%",
      (before.length - after.length) / before.length >= 0.15,
      `${(((before.length - after.length) / before.length) * 100).toFixed(1)}%`,
    )
  }

  // ---- 端到端：中文变小 ----
  {
    const body = chatBody([{ role: "user", text: ZH_SAMPLE }])
    const before = firstSegment(body).text
    const changed = apply(body, ctxFor("chat"))
    const after = firstSegment(body).text
    check("50 中文 apply 返回 true", changed === true)
    check("51 中文确实变小", after.length < before.length, `${before.length} -> ${after.length}`)
    check(
      "52 中文压缩率 ≥5%（zh 包规则少，率天然低于英文）",
      (before.length - after.length) / before.length >= 0.05,
      `${(((before.length - after.length) / before.length) * 100).toFixed(1)}%`,
    )
  }

  // ---- 端到端：中文典型措辞（规则表实际覆盖的说法）----
  {
    const body = chatBody([{ role: "user", text: ZH_TYPICAL }])
    const before = firstSegment(body).text
    apply(body, ctxFor("chat"))
    const after = firstSegment(body).text
    check("52b 中文典型措辞变小", after.length < before.length, `${before.length} -> ${after.length}`)
    check(
      "52c 中文典型措辞压缩率 ≥15%",
      (before.length - after.length) / before.length >= 0.15,
      `${(((before.length - after.length) / before.length) * 100).toFixed(1)}%`,
    )
    check("52d 中文标点收尾不粘连", after.indexOf("。，") === -1 && after.indexOf("，,") === -1, after)
  }

  // ---- 代码块一字不变 ----
  {
    const code = "```js\nconst total = items.reduce((a, b) => a + b, 0)\nfunction sum() { return total }\n```"
    const text =
      "Please make sure to run this code and explain in detail what it does, and please be sure to " +
      "let me know if there are any issues with it.\n\n" +
      code
    const body = chatBody([{ role: "user", text }])
    apply(body, ctxFor("chat"))
    const after = firstSegment(body).text
    check("53 代码块原样保留", after.indexOf(code) !== -1, after.slice(0, 120))
    check("54 代码块内容一字不差", findFencedCodeBlocks(after).join("") === code)
    check("55 代码块外的散文被压", after.length < text.length, `${text.length} -> ${after.length}`)
  }

  // ---- URL / 路径 / 版本号 / CONST_CASE 保留 ----
  {
    const text =
      "Please make sure to check https://example.com/api?x=1 and read the file at E:\\proj\\src\\index.js " +
      "and also please verify that version 1.2.3 works with MAX_RETRY_COUNT before you explain in detail."
    const body = chatBody([{ role: "user", text }])
    apply(body, ctxFor("chat"))
    const after = firstSegment(body).text
    check("56 URL 保留", after.indexOf("https://example.com/api?x=1") !== -1)
    check("57 路径保留", after.indexOf("E:\\proj\\src\\index.js") !== -1)
    check("58 版本号保留", after.indexOf("1.2.3") !== -1)
    check("59 CONST_CASE 保留", after.indexOf("MAX_RETRY_COUNT") !== -1)
  }

  // ---- 角色过滤 ----
  {
    const body = chatBody([
      { role: "system", text: EN_SAMPLE },
      { role: "user", text: EN_SAMPLE },
    ])
    apply(body, ctxFor("chat"))
    const segs = segmentsOf(body, "chat")
    const sys = segs.find((s) => s.role === "system")
    check("60 system 默认不动", !!sys && sys.text === EN_SAMPLE)
    check("61 user 被压", segs.find((s) => s.role === "user").text !== EN_SAMPLE)
  }
  {
    const body = chatBody([{ role: "user", text: EN_SAMPLE }])
    const changed = apply(body, ctxFor("chat"), { compressRoles: ["system"] })
    check("62 只压 system 时 user 不动", changed === false && firstSegment(body).text === EN_SAMPLE)
  }

  // ---- 规则组开关 ----
  {
    const body = chatBody([{ role: "user", text: EN_SAMPLE }])
    apply(body, ctxFor("chat"), { lang: "en", groups: [] })
    check("63 groups 为空时不改", firstSegment(body).text === EN_SAMPLE)
  }

  // ---- 语言配置 ----
  {
    const cfg = resolveConfig({ lang: "zh" })
    check("64 lang 配置生效", cfg.language === "zh" && cfg.autoDetectLanguage === false)
    const cfg2 = resolveConfig({ language: "ja" })
    check("65 language 别名生效", cfg2.language === "ja")
    const cfg3 = resolveConfig({ lang: "auto" })
    check("66 auto 保持自动检测", cfg3.autoDetectLanguage === true)
    const cfg4 = resolveConfig({ preserveCode: false })
    check("67 preserveCode=false 清空保护区", cfg4.preservePatterns.length === 0)
  }
  {
    // 强制 zh 规则包处理中文，强制 en 处理英文，都应变小
    const zhBody = chatBody([{ role: "user", text: ZH_SAMPLE }])
    apply(zhBody, ctxFor("chat"), { lang: "zh" })
    check("68 强制 zh 包仍压缩", firstSegment(zhBody).text.length < ZH_SAMPLE.length)
  }

  // ---- 其它协议 ----
  {
    const anthropic = {
      model: "m",
      system: EN_SAMPLE,
      messages: [{ role: "user", content: [{ type: "text", text: EN_SAMPLE }] }],
    }
    const changed = apply(anthropic, ctxFor("anthropic"))
    check("69 anthropic 协议可压", changed === true)
    check("70 anthropic 文本变小", anthropic.messages[0].content[0].text.length < EN_SAMPLE.length)
  }
  {
    const gemini = {
      contents: [{ role: "user", parts: [{ text: EN_SAMPLE }] }],
    }
    const changed = apply(gemini, ctxFor("gemini"))
    check("71 gemini 协议可压", changed === true)
    check("72 gemini 文本变小", gemini.contents[0].parts[0].text.length < EN_SAMPLE.length)
  }

  // ---- fail-open ----
  check("73 空 body 返回 false", apply(null, ctxFor("chat")) === false)
  check("74 空对象返回 false", apply({}, ctxFor("chat")) === false)
  check("75 空 messages 返回 false", apply({ messages: [] }, ctxFor("chat")) === false)
  check("76 字符串 body 返回 false", apply("nope", ctxFor("chat")) === false)
  check("77 数组 body 返回 false", apply([1, 2, 3], ctxFor("chat")) === false)
  check("78 ctx 为 null 不抛", apply(chatBody([{ role: "user", text: EN_SAMPLE }]), null) === true)
  check("79 未知协议返回 false", apply(chatBody([{ role: "user", text: EN_SAMPLE }]), ctxFor("nope")) === false)
  {
    let threw = false
    let ret
    try {
      ret = apply({ messages: [{ role: "user", content: null }] }, ctxFor("chat"))
      apply({ messages: [{ role: "user", content: { weird: true } }] }, ctxFor("chat"))
      apply({ messages: [{}] }, ctxFor("chat"))
      apply({ messages: [{ role: "user", content: "" }] }, ctxFor("chat"))
      apply({ messages: [{ role: "user", content: 42 }] }, ctxFor("chat"))
      apply({ messages: [{ role: "user", content: [{ type: "text", text: null }] }] }, ctxFor("chat"))
      apply({ model: "m", messages: [{ role: "tool", content: "x".repeat(200) }] }, ctxFor("chat"))
    } catch {
      threw = true
    }
    check("80 畸形输入不抛", threw === false)
    check("81 畸形输入返回 false", ret === false)
  }
  {
    // 短文本不压（minMessageLength）
    const short = chatBody([{ role: "user", text: "Please be sure to help." }])
    check("82 短文本跳过", apply(short, ctxFor("chat")) === false)
  }
  {
    // 已经压过的文本再压应基本稳定（幂等倾向）
    const body = chatBody([{ role: "user", text: EN_SAMPLE }])
    apply(body, ctxFor("chat"))
    const once = firstSegment(body).text
    apply(body, ctxFor("chat"))
    const twice = firstSegment(body).text
    check("83 二次压缩不再大幅变短", twice.length >= once.length * 0.9, `${once.length} -> ${twice.length}`)
  }

  // ---- 直接调用 compressText ----
  {
    const out = compressText(EN_SAMPLE, "user", resolveConfig({}))
    check("84 compressText 返回结构", typeof out.text === "string" && Array.isArray(out.appliedRules))
    check("85 compressText 压小了", out.text.length < EN_SAMPLE.length)
    check("86 compressText 语言是 en", out.language === "en", out.language)
    const empty = compressText("", "user", resolveConfig({}))
    check("87 compressText 空串原样", empty.text === "")
  }

  // ---- token 估算 ----
  check("88 空串 0 token", estimateCompressionTokens("") === 0)
  check("89 4 字符 1 token", estimateCompressionTokens("abcd") === 1)
  check("90 8 字符 2 token", estimateCompressionTokens("abcdefgh") === 2)

  // ---- 规则元数据 ----
  {
    const meta = getCavemanRuleMetadata()
    check("91 规则元数据是数组", Array.isArray(meta) && meta.length === CAVEMAN_RULES.length, String(meta.length))
    check(
      "92 每条元数据带 intensities",
      meta.every((m) => typeof m.name === "string" && Array.isArray(m.intensities) && m.intensities.length > 0),
    )
  }
}
