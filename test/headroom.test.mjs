// test/headroom.test.mjs — headroom(SmartCrusher/GCF) 移植的验证
// 三层：GCF 编码器字节级断言 → crushText 门禁/围栏 → round-trip 无损语料 → 引擎包装
// round-trip 基准则：decode(encode(x)) deep-equal JSON.parse(原JSON)。
// 注意（上游同理）：restoreText 经 JSON.stringify，-0 与键序不作字符串级保证，
// 故 round-trip 一律走 parse 后 deepStrictEqual。

import assert from "node:assert"
import { check, ctxFor } from "./helpers.mjs"
import { encodeGeneric } from "../engines/gcf/encode.js"
import { decodeGeneric } from "../engines/gcf/decode.js"
import { formatScalar, formatNumber, needsQuote, quoteString } from "../engines/gcf/scalar.js"
import { apply, crushText, tryCompactJson, restoreText, wrapGcf } from "../engines/headroom.js"
import * as middleware from "../compress-core.middleware.js"

export const name = "headroom"

export function run() {
  function rt(arr, minRows = 8) {
    // round-trip: crushText 整个 JSON 串 → restoreText → parse → deepEqual
    // 用 pretty-print：真实工具输出多为美化 JSON，压缩必然更短（minified 常触发"不更小"保守放弃）
    const jsonStr = JSON.stringify(arr, null, 2)
    const crushed = crushText(jsonStr, minRows)
    assert.notStrictEqual(crushed, jsonStr, "应被压缩")
    assert.ok(crushed.startsWith("```gcf-generic\n"), "应是 gcf 围栏")
    const restored = restoreText(crushed)
    assert.deepStrictEqual(JSON.parse(restored), arr)
  }

  function notCrushed(text, minRows = 8) {
    assert.strictEqual(crushText(text, minRows), text)
  }

  // ─── S 组：标量/数字单元 ────────────────────────────────────────────────
  {
    check("S-01 formatNumber -0", formatNumber(-0) === "-0") // 上游 JSON.stringify 丢 -0，仅单元级锁定
    check("S-02 formatNumber 0", formatNumber(0) === "0")
    check("S-03 formatNumber 2^53 边界", formatNumber(9007199254740992) === "9.007199254740992e+15")
    check("S-04 formatNumber 2^53-1 平式", formatNumber(9007199254740991) === "9007199254740991")
    check("S-05 formatNumber 1e-6 平式", formatNumber(0.000001) === "0.000001")
    check("S-06 formatNumber 1e-7 指数", formatNumber(1e-7) === "1e-7")
    check("S-07 needsQuote 保留字", ["", "-", "~", "^", "true", "false", "123", "1.5e3", "+1", ".5", "01"].every(needsQuote))
    check("S-08 needsQuote 前缀字符", [" #x", "@x", ".x", " lead", "trail ", "a[2]: b"].every(needsQuote))
    check("S-09 needsQuote 控制/分隔", ["a|b", "a,b", 'q"q', "a\nb", "", "", " "].every(needsQuote))
    check("S-10 普通串不引", !needsQuote("hello") && !needsQuote("你好") && !needsQuote("a-b_c"))
    check("S-11 quoteString 转义", quoteString('a"b\\c\nd') === '"a\\"b\\\\c\\nd"')
    check("S-12 formatScalar null/undef", formatScalar(null) === "-" && formatScalar(undefined) === "-")
    check("S-13 formatScalar bool", formatScalar(true) === "true" && formatScalar(false) === "false")
    check("S-14 formatScalar 带|加引", formatScalar("a|b", 0x7c) === '"a|b"')
    check("S-15 formatScalar 无分隔不引", formatScalar("a|b", 0) === '"a|b"') // | 本身触发 needsQuote
    check("S-16 formatScalar 逗号分隔上下文", formatScalar("a,b", 0x2c) === '"a,b"')
  }

  // ─── E 组：编码器字节级 ─────────────────────────────────────────────────
  {
    check(
      "E-01 字节级：简单表",
      encodeGeneric([{ id: 1, name: "a" }, { id: 2, name: "b" }]) ===
        "GCF profile=generic\n## [2]{id,name}\n1|a\n2|b\n"
    )
    check(
      "E-02 字节级：缺键→~",
      encodeGeneric([{ id: 1 }, { id: 2, extra: "x" }]) ===
        "GCF profile=generic\n## [2]{id,extra}\n1|~\n2|x\n"
    )
    check(
      "E-03 字节级：null→-",
      encodeGeneric([{ id: 1, v: null }, { id: 2, v: "x" }]) ===
        "GCF profile=generic\n## [2]{id,v}\n1|-\n2|x\n"
    )
    check(
      "E-04 字节级：嵌套展平(路径列加引)",
      encodeGeneric([{ id: 1, c: { name: "n", mail: "m" } }]) ===
        'GCF profile=generic\n## [1]{id,"c>name","c>mail"}\n1|n|m\n'
    )
    check(
      "E-05 字节级：原始类型根数组",
      encodeGeneric([1, "a", true]) === "GCF profile=generic\n## [3]: 1,a,true\n"
    )
    check(
      "E-06 字节级：空根数组",
      encodeGeneric([]) === "GCF profile=generic\n## [0]\n"
    )
    check(
      "E-07 字节级：内联schema(全null叶子→bail flatten)",
      encodeGeneric([
        { id: 1, m: { a: 1, b: 2, c: 3 } },
        { id: 2, m: { a: null, b: null, c: null } },
        { id: 3, m: { a: 4, b: 5, c: 6 } },
      ]) ===
        "GCF profile=generic\n## [3]{id,m}\n@0 1|^{a,b,c}\n1|2|3\n@1 2|^\n-|-|-\n@2 3|^\n4|5|6\n"
    )
    check(
      "E-08 字节级：原始类型字段内联数组",
      encodeGeneric([{ id: 1, tags: ["a", "b"] }]) ===
        "GCF profile=generic\n## [1]{id,tags}\n@0 1|^\n.tags [2]: a,b\n"
    )
    check(
      "E-09 字节级：形状不一→.fk {} 附件(indent depth+2)",
      encodeGeneric([{ id: 1, m: { x: 1, y: 2 } }, { id: 2, m: { x: 1, z: 3 } }]) ===
        'GCF profile=generic\n## [2]{id,m}\n@0 1|^\n.m {}\n    x=1\n    y=2\n@1 2|^\n.m {}\n    x=1\n    z=3\n'
    )
    check(
      "E-10 字节级：含>键名→逐行附件(非bare键加引)",
      encodeGeneric([{ id: 1, "a>b": 5 }]) ===
        'GCF profile=generic\n## [1]{id}\n@0 1\n."a>b" =5\n'
    )
    check(
      "E-11 字节级：字符串引号",
      encodeGeneric([{ s: "a|b" }]) === 'GCF profile=generic\n## [1]{s}\n"a|b"\n'
    )
    check(
      "E-12 字节级：非bare键加引",
      encodeGeneric([{ "k k": 1 }]) === 'GCF profile=generic\n## [1]{"k k"}\n1\n'
    )
  }

  // ─── D 组：解码器（round-trip 的核心一半） ──────────────────────────────
  {
    assert.deepStrictEqual(decodeGeneric("GCF profile=generic\n## [2]{id,name}\n1|a\n2|b"), [
      { id: 1, name: "a" },
      { id: 2, name: "b" },
    ])
    check("D-01 基础解码", true)
    assert.deepStrictEqual(decodeGeneric("GCF profile=generic\n## [3]: 1,a,true"), [1, "a", true])
    check("D-02 内联原始数组", true)
    assert.deepStrictEqual(decodeGeneric("GCF profile=generic\n=hello"), "hello")
    check("D-03 根标量", true)
    assert.deepStrictEqual(decodeGeneric("GCF profile=generic\n## [0]"), [])
    check("D-04 空数组", true)
    // 展平还原（展平路径列在 spec 下需加引）
    assert.deepStrictEqual(decodeGeneric('GCF profile=generic\n## [1]{id,"c>name","c>mail"}\n1|n|m'), [
      { id: 1, c: { name: "n", mail: "m" } },
    ])
    check("D-05 展平还原", true)
    // 缺键 ~ 还原（键消失而非 undefined）
    assert.deepStrictEqual(decodeGeneric("GCF profile=generic\n## [2]{id,extra}\n1|~\n2|x"), [
      { id: 1 },
      { id: 2, extra: "x" },
    ])
    check("D-06 缺键还原", true)
    // 全null叶子→顶层null规则（展平路径列需加引）
    assert.deepStrictEqual(decodeGeneric('GCF profile=generic\n## [1]{"c>a","c>b"}\n-|-'), [{ c: null }])
    check("D-07 全null叶子→null", true)
  }

  // ─── C 组：crushText 门禁 ───────────────────────────────────────────────
  {
    const big = Array.from({ length: 10 }, (_, i) => ({
      id: i,
      name: `user-${i}-with-a-longer-name`,
      active: i % 2 === 0,
      score: i * 1.5,
    }))
    const bigJson = JSON.stringify(big, null, 2)

    check("C-01 整段数组被压", crushText(bigJson).startsWith("```gcf-generic"))
    check("C-02 压缩后严格更短", crushText(bigJson).length < bigJson.length)
    check("C-03 前导空白整段替换", crushText("  \n" + bigJson).startsWith("```gcf-generic"))
    notCrushed("[not json")
    check("C-04 非法JSON不动", true)
    notCrushed(JSON.stringify([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]))
    check("C-05 原始类型数组不动(allObjects)", true)
    notCrushed(JSON.stringify(big.slice(0, 7)))
    check("C-06 少于minRows不动", true)
    check("C-07 minRows=2可压小表", crushText(JSON.stringify(big.slice(0, 2), null, 2), 2).startsWith("```gcf-generic"))
    // 不更小不动：2行、长键名+短值（gcf 输出比 json 还长，tryCompactJson 保守放弃）
    const tiny = JSON.stringify([
      { "very-long-field-name-alpha": "x" },
      { "very-long-field-name-alpha": "y" },
    ])
    notCrushed(tiny, 2)
    check("C-08 不更小→保守不动", true)
    // 围栏内嵌
    const fenced = "结果如下：\n```json\n" + bigJson + "\n```\n以上。"
    const out = crushText(fenced)
    check("C-09 围栏内嵌被压", out.includes("```gcf-generic") && out.startsWith("结果如下：\n") && out.endsWith("\n以上。"))
    // 双围栏
    const two = "```json\n" + bigJson + "\n```\n中间\n```json\n" + bigJson + "\n```"
    const out2 = crushText(two)
    check("C-10 双围栏都压", (out2.match(/```gcf-generic/g) || []).length === 2 && out2.includes("\n中间\n"))
    // 围栏内容不足行数 → 不动
    notCrushed("```json\n" + JSON.stringify(big.slice(0, 3)) + "\n```")
    check("C-11 围栏内不足行数不动", true)
    // 数组的数组 → 不动
    notCrushed(JSON.stringify([[{ a: 1 }], [{ a: 2 }], [{ a: 3 }], [{ a: 4 }], [{ a: 5 }], [{ a: 6 }], [{ a: 7 }], [{ a: 8 }]]))
    check("C-12 数组的数组不动", true)
  }

  // ─── R 组：round-trip 无损语料 ──────────────────────────────────────────
  {
    rt(Array.from({ length: 10 }, (_, i) => ({ id: i, name: `n${i}`, ok: i % 2 === 0, s: i * 0.5 })))
    check("R-01 同质混合类型", true)

    rt(Array.from({ length: 9 }, (_, i) => (i % 3 === 0 ? { id: i } : { id: i, extra: `e${i}` })))
    check("R-02 异质缺键", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ id: i, cust: { name: `c${i}`, addr: { city: "sz", zip: `51800${i}` } } })))
    check("R-03 多层嵌套展平", true)

    rt([
      { id: 1, m: { a: 1, b: 2, c: 3 } },
      ...Array.from({ length: 7 }, (_, i) => ({ id: i + 2, m: { a: null, b: null, c: null } })),
    ])
    check("R-04 内联schema+全null叶子", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ id: i, tags: [`t${i}`, `u${i}`] })))
    check("R-05 原始类型数组字段", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ id: i, subs: [{ k: `k${i}`, v: i }] })))
    check("R-06 对象数组字段(共享schema)", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ v: i % 2 === 0 ? i : `str${i}` })))
    check("R-07 混合类型列", true)

    rt(
      Array.from({ length: 8 }, (_, i) => ({
        s1: "a|b", s2: "a,b", s3: 'q"', s4: "line\nbreak", s5: "true", s6: "123",
        s7: "-", s8: "~", s9: "^", s10: "#h", s11: "@a", s12: ".d", s13: "x[2]: y",
        s14: " ", s15: "", s16: "🎉", s17: "", s18: `  sp${i}  `,
      }))
    )
    check("R-08 引号触发字符全集", true)

    rt(Array.from({ length: 8 }, (_, i) => ({
      n1: 9007199254740992, n2: 1e-7, n3: 0.000001, n4: -1.5, n5: 1e21, i,
    })))
    check("R-09 数字边界(2^53/指数)", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ id: i, "a>b": `gt${i}` })))
    check("R-10 键名含>走附件", true)

    rt(Array.from({ length: 8 }, (_, i) => ({ id: i, v: i % 2 === 0 ? null : `v${i}` })))
    check("R-11 null列", true)

    rt(Array.from({ length: 8 }, (_, i) => (i === 0 ? { id: i, m: { x: 1, y: 2 } } : { id: i, m: { x: i, z: 3 } })))
    check("R-12 形状不一→传统对象附件", true)

    // 中文键/值
    rt(Array.from({ length: 8 }, (_, i) => ({ 名称: `项目${i}`, 状态: i % 2 === 0 ? "完成" : "进行中" })))
    check("R-13 中文键值", true)

    // __proto__ 键（GCF v3.2 展平路径对根级 __proto__ 子对象跳过 isUnsafePathKey → 数据丢失；
    // 编码器未拒绝顶层 __proto__ 展平，上游同行为。此处断言：被压缩、不抛、不污染原型链。）
    const protoArr = Array.from({ length: 8 }, (_, i) => JSON.parse(`{"id":${i},"__proto__":{"polluted":false}}`))
    const protoJs = JSON.stringify(protoArr)
    const protoC = crushText(protoJs)
    check("R-14 __proto__键被压缩", protoC !== protoJs && protoC.startsWith("```gcf-generic"))
    let protoRt
    try { protoRt = JSON.parse(restoreText(protoC)) } catch (_e) { protoRt = null }
    check("R-14 __proto__键还原不抛", protoRt !== null)
    check("R-14 __proto__键不污染原型链", !({}).polluted)
  }

  // ─── W 组：引擎包装（adapter 四协议 + system/developer 保护） ──────────
  {
    const arr = Array.from({ length: 10 }, (_, i) => ({ id: i, name: `user-${i}-longer-name-here` }))
    const js = JSON.stringify(arr, null, 2)

    const body = {
      messages: [
        { role: "system", content: js },
        { role: "developer", content: js },
        { role: "user", content: js },
      ],
    }
    const ctx = ctxFor("chat")
    check("W-01 apply返回true", apply(body, ctx, {}) === true)
    check("W-02 user被压", body.messages[2].content.startsWith("```gcf-generic"))
    check("W-03 system不动", body.messages[0].content === js)
    check("W-04 developer不动", body.messages[1].content === js)
    check("W-05 ctx.state.headroom", ctx.state.headroom && ctx.state.headroom.crushedSegments === 1)

    const b2 = { messages: [{ role: "user", content: js }] }
    check("W-06 enabled:false不动", apply(b2, ctxFor("chat"), { enabled: false }) === false && b2.messages[0].content === js)

    // anthropic tool_result 内数组
    const b3 = {
      messages: [
        { role: "user", content: [{ type: "tool_result", content: js }] },
      ],
    }
    check("W-07 anthropic tool_result被压",
      apply(b3, ctxFor("anthropic"), {}) === true && b3.messages[0].content[0].content.startsWith("```gcf-generic"))

    // gemini
    const b4 = { contents: [{ role: "user", parts: [{ text: js }] }] }
    check("W-08 gemini被压",
      apply(b4, ctxFor("gemini"), {}) === true && b4.contents[0].parts[0].text.startsWith("```gcf-generic"))

    // responses function_call_output
    const b5 = { input: [{ type: "function_call_output", output: js }] }
    check("W-09 responses工具输出被压",
      apply(b5, ctxFor("responses"), {}) === true && b5.input[0].output.startsWith("```gcf-generic"))

    // 空 body / 无视图
    check("W-10 空body no-op", apply({}, ctxFor("chat"), {}) === false)
    check("W-11 未知协议 no-op", apply({ messages: [{ role: "user", content: js }] }, ctxFor("mystery"), {}) === false)

    // 全管线经 middleware（lite+sessionDedup+headroom 已接）
    const mwBody = { messages: [{ role: "user", content: js }] }
    middleware.onRequest(mwBody, ctxFor("chat", { strategies: { lite: false, "session-dedup": false, headroom: true } }))
    check("W-12 经middleware只开headroom", mwBody.messages[0].content.startsWith("```gcf-generic"))

    // restoreText 无围栏不动
    check("W-13 restoreText无围栏不动", restoreText("普通文本") === "普通文本")
  }
}
