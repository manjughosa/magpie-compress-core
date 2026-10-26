// test/ionizer.test.mjs — ionizer 引擎移植测试。
// 覆盖：能压 / 无内容返回 false / 畸形输入不抛 / 确定性采样 / 错误行与骨架保留 /
//       CCR 缺失后的 marker 语义 / 纯函数单元（fnv1a、mulberry32、seededSample、isErrorRow）。

import {
  apply,
  ionize,
  ionizeSegmentText,
  fnv1a,
  mulberry32,
  schemaUnion,
  isErrorRow,
  seededSample,
  id,
  label,
  lossy,
  cacheImpact,
  defaultOn,
  stackPriority,
  isSingleMode,
  levels,
  available,
  sampling,
  configSchema,
  MAX_IONIZER_ROWS,
  DEFAULT_THRESHOLD,
} from "../engines/ionizer.js"
import { check, ctxFor, bodyChars, chatBody, segmentsOf } from "./helpers.mjs"

export const name = "ionizer"

function rows(n) {
  const out = []
  for (let i = 0; i < n; i++) {
    const row = { id: i, name: "row" + i, status: 200, payload: "value-" + i }
    if (i % 10 === 0) row.status = 500
    if (i % 97 === 0) row.error = "boom at row " + i
    if (i === n - 5) row.extraKey = "late-schema-key"
    out.push(row)
  }
  return out
}

export async function run() {
  // ---- 元数据 ----
  check("1 id", id === "ionizer")
  check("2 label", label === "Ionizer")
  check("3 lossy/cacheImpact/defaultOn", lossy === true && cacheImpact === "high" && defaultOn === false)
  check("4 stackPriority 取源码值 13", stackPriority === 13)
  check("5 isSingleMode/levels", isSingleMode === false && levels === undefined)
  check("6 available", available === true)
  check("7 sampling=true（故意有损，保真门会跳过）", sampling === true)
  check(
    "8 configSchema 只有 sampleRate",
    configSchema.length === 1 &&
      configSchema[0].key === "sampleRate" &&
      configSchema[0].defaultValue === 0.4 &&
      configSchema[0].min === 0.1 &&
      configSchema[0].max === 0.9
  )
  check("9 常量", MAX_IONIZER_ROWS === 100000 && DEFAULT_THRESHOLD === 200)

  // ---- 纯函数 ----
  check("10 fnv1a 空串", fnv1a("") === 2166136261)
  check("11 fnv1a('a')", fnv1a("a") === 3826002220, String(fnv1a("a")))
  check("12 fnv1a 稳定", fnv1a("hello world") === fnv1a("hello world"))
  const rand = mulberry32(12345)
  let inRange = true
  const seqA = []
  for (let i = 0; i < 100; i++) {
    const v = rand()
    seqA.push(v)
    if (!(v >= 0 && v < 1)) inRange = false
  }
  check("13 mulberry32 落在 [0,1)", inRange)
  const rand2 = mulberry32(12345)
  const seqB = []
  for (let i = 0; i < 100; i++) seqB.push(rand2())
  check("14 mulberry32 可复现", seqA.join(",") === seqB.join(","))

  check("15 schemaUnion 首见顺序", schemaUnion([{ b: 1 }, { a: 1, b: 2 }, { c: 1 }]).join(",") === "b,a,c")
  check(
    "16 isErrorRow 键名命中",
    isErrorRow({ message: "x", error: "boom" }) === true && isErrorRow({ message: "x" }) === false
  )
  check("17 isErrorRow 状态码命中", isErrorRow({ status: 500 }) && isErrorRow({ code: 404 }))
  check("18 isErrorRow 状态码不命中", !isErrorRow({ status: 200 }) && !isErrorRow({ status: 302 }))

  const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
  const sample1 = seededSample(pool, 4, 999)
  const sample2 = seededSample(pool, 4, 999)
  check("19 seededSample 数量与可复现", sample1.length === 4 && sample1.join(",") === sample2.join(","))
  check("20 seededSample 升序且来自 pool", sample1.every((v, i) => i === 0 || v > sample1[i - 1]))
  check("21 seededSample k>=n 返回全量", seededSample(pool, 20, 1).length === 10)

  // ionize 单元
  const small = ionize(rows(5), { targetRows: 10, firstK: 3, lastK: 3, seed: 1 })
  check("22 ionize n<=targetRows 全留", small.keptCount === 5 && small.totalCount === 5)
  const big = ionize(rows(400), { targetRows: 40, firstK: 3, lastK: 3, seed: 7 })
  check("23 ionize 保留 targetRows 量级", big.keptCount >= 40 && big.keptCount < 400, String(big.keptCount))
  check("24 ionize 保留全部错误行", big.kept.filter((r) => r.status === 500).length === 40)
  check("25 ionize 保留首尾", big.kept[0].id === 0 && big.kept[big.kept.length - 1].id === 399)

  // ---- 片段级采样 ----
  const payload = JSON.stringify(rows(500))
  const next = ionizeSegmentText(payload, 0.4)
  check("26 超阈值数组被采样", typeof next === "string" && next.length < payload.length)
  const lines = next.split("\n")
  const keptRows = JSON.parse(lines[0])
  check("27 采样后仍是合法 JSON 数组", Array.isArray(keptRows))
  check("28 保留行数 = round(500*0.4)", keptRows.length === 200, String(keptRows.length))
  check(
    "29 marker 声明不可恢复（无 CCR）",
    lines[1].startsWith("[ionizer: kept 200/500 rows;") && lines[1].includes("no CCR backend")
  )
  check("30 错误行全部保留", keptRows.filter((r) => r.status === 500).length === 50)
  check("31 后引入的新键所在行保留", keptRows.some((r) => r.extraKey === "late-schema-key"))
  check("32 首尾行保留", keptRows[0].id === 0 && keptRows[keptRows.length - 1].id === 499)

  // 确定性
  check("33 同输入同输出（确定性采样）", ionizeSegmentText(payload, 0.4) === next)

  // 不够阈值 / 非数组
  check("34 低于 threshold 不动", ionizeSegmentText(JSON.stringify(rows(100)), 0.4) === null)
  check("35 非数组 JSON 不动", ionizeSegmentText(JSON.stringify({ a: 1 }), 0.4) === null)
  check("36 非纯对象数组不动", ionizeSegmentText(JSON.stringify(rows(500).map((r) => r.id)), 0.4) === null)
  check("37 坏 JSON 不动", ionizeSegmentText("[{oops", 0.4) === null)
  check("38 普通文本不动", ionizeSegmentText("hello world", 0.4) === null)

  // ---- 引擎 apply ----
  const body = chatBody([
    { role: "system", text: "system prompt stays" },
    { role: "user", text: "here is the dataset" },
    { role: "tool", text: payload },
    { role: "user", text: "summarize it" },
  ])
  const before = bodyChars(body)
  const changed = apply(body, ctxFor("chat"), {})
  const after = bodyChars(body)
  check("39 能压：apply 返回 true", changed === true)
  check("40 能压：体积变小", after < before, `${before} → ${after}`)
  console.log(
    `        [实测] ionizer 压缩率 ${(((before - after) / before) * 100).toFixed(1)}% (${before} → ${after} chars)`
  )
  const segs = segmentsOf(body, "chat")
  check("41 system 段不动", segs[0].text === "system prompt stays")
  check("42 目标片段带 marker", segs[2].text.includes("[ionizer: kept 200/500 rows;"))
  check("43 幂等：第二次返回 false", apply(body, ctxFor("chat"), {}) === false)

  // sampleRate 影响保留行数
  const lowBody = chatBody([{ role: "tool", text: payload }])
  apply(lowBody, ctxFor("chat"), { sampleRate: 0.1 })
  const lowKept = JSON.parse(segmentsOf(lowBody, "chat")[0].text.split("\n")[0]).length
  const highBody = chatBody([{ role: "tool", text: payload }])
  apply(highBody, ctxFor("chat"), { sampleRate: 0.9 })
  const highKept = JSON.parse(segmentsOf(highBody, "chat")[0].text.split("\n")[0]).length
  // 强制保留行（错误行 / 骨架 / 首尾）是 targetRows 的下限，所以低采样率只会趋近它
  check("44 sampleRate 生效", lowKept < highKept && lowKept >= 50 && highKept === 450, `${lowKept}/${highKept}`)

  // system 段里的数组不动
  const sysBody = { messages: [{ role: "system", content: payload }] }
  check("45 system 段不采样", apply(sysBody, ctxFor("chat"), {}) === false)

  // ---- 无内容 → false ----
  check("46 空 messages", apply({ messages: [] }, ctxFor("chat"), {}) === false)
  check("47 无 messages", apply({}, ctxFor("chat"), {}) === false)
  check("48 未知协议", apply(chatBody([{ role: "tool", text: payload }]), ctxFor("nope"), {}) === false)
  check("49 无参数", apply() === false)

  // ---- 畸形输入不抛 ----
  let threw = false
  let allBool = true
  for (const bad of [
    null,
    undefined,
    0,
    "string",
    [],
    { messages: null },
    { messages: [null, 1, "x"] },
    { messages: [{ role: "tool", content: 12345 }] },
    { messages: [{ role: "tool", content: "[1,2,3," }] },
  ]) {
    try {
      const r = apply(bad, ctxFor("chat"), {})
      if (typeof r !== "boolean") allBool = false
    } catch {
      threw = true
    }
  }
  check("50 畸形输入不抛", threw === false)
  check("51 畸形输入返回布尔", allBool)
}
