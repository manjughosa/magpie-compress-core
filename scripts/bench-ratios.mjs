// 逐个引擎的实测压缩率。两个口径，分开报，不混：
//
//   real     —— 50 份真实抓包（captures/*.json 的 beforeText）还原成 chat 请求，
//               引擎默认参数、单独开它一个。这一列回答「在我真实流量上它省多少」。
//   targeted —— 引擎声明的作用域里的输入。真实语料里没有它认的形状时（headroom 要
//               JSON 对象数组、ionizer 要 >200 行的数组、codex-responses 要 responses
//               协议、read-lifecycle 要 tool_calls 的路径），用真实数据搭出那个形状：
//               数组来自 captures-index.json / requests.jsonl 本身，responses 的
//               function_call_output 装的是真实工具输出，read-lifecycle 读的是仓库里
//               真实文件的全文。这一列回答「它一旦命中能省多少」，分级用它。
//
// 用法：
//   node scripts/bench-ratios.mjs            人读表格
//   node scripts/bench-ratios.mjs --json     机器读 JSON
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
import { runPipeline, clone } from "../pipeline.js"
import { conversationView } from "../adapter.js"
import { ENGINES } from "../catalog.js"
import { REGISTRY } from "../engines/index.js"

const telemetryDir = process.env.COMPRESS_TELEMETRY_DIR || join(homedir(), ".config", "magpie", "compress-core")
const captureDir = process.env.COMPRESS_CAPTURE_DIR || join(telemetryDir, "captures")
const root = join(import.meta.dirname, "..")

// ─── 语料还原 ────────────────────────────────────────────────────────────────

const TAG = /^\[(\d+)\] \[(\w+)\]( \[tool\])? /gm

// 段号逐段递增，用它当校验：正文里偶然出现的 `[3] [user] ` 不会被当成段头。
export function segmentsFromText(text) {
  const found = []
  TAG.lastIndex = 0
  let m
  while ((m = TAG.exec(text)) !== null) {
    found.push({ number: Number(m[1]), role: m[2], tool: Boolean(m[3]), start: m.index, head: m[0].length })
  }
  const kept = []
  let expected = 1
  for (const item of found) {
    if (item.number !== expected) continue
    expected += 1
    kept.push(item)
  }
  const out = []
  for (let i = 0; i < kept.length; i++) {
    const from = kept[i].start + kept[i].head
    const to = i + 1 < kept.length ? kept[i + 1].start : text.length
    out.push({ role: kept[i].role, tool: kept[i].tool, text: text.slice(from, to) })
  }
  return out
}

export function bodyFromCapture(record) {
  const segments = segmentsFromText(record.beforeText || "")
  if (segments.length === 0) return null
  const messages = segments.map((s) => ({ role: s.tool ? "tool" : s.role, content: s.text }))
  return { model: record.model || "bench", messages }
}

export function loadCorpus(dir = captureDir) {
  if (!existsSync(dir)) return []
  const out = []
  for (const name of readdirSync(dir).filter((n) => n.endsWith(".json"))) {
    try {
      const record = JSON.parse(readFileSync(join(dir, name), "utf8"))
      if (record.protocol !== "chat") continue
      const body = bodyFromCapture(record)
      if (!body) continue
      out.push({ id: record.id || name, body })
    } catch { /* 坏文件跳过：语料里一个坏的不该让整轮跑不起来。 */ }
  }
  return out
}

// ─── 单引擎跑一遍 ────────────────────────────────────────────────────────────

const ALL_OFF = Object.fromEntries(ENGINES.map((e) => [e.id, false]))

function segmentTexts(body, protocol) {
  const view = conversationView(body, protocol)
  return view ? view.segments.map((seg) => seg.text) : []
}

export function benchOne(body, protocol, id) {
  const options = {
    strategies: { ...ALL_OFF, [id]: true },
    preserve: { system: false, lastTurns: 0 },
    // 与 lab 台同一套语义：语料正文都当历史，否则单条消息永远落在保护窗口里。
    lite: { treatAllAsHistory: true },
  }
  const work = clone(body)
  const before = segmentTexts(work, protocol)
  const report = runPipeline(work, { protocol, state: {}, origin: "local" }, options)
  const after = segmentTexts(work, protocol)
  // 只算引擎真的改写过的片段：命中片段上的压缩率，是「它一旦动手有多狠」。
  let touchedChars = 0
  let touchedSaved = 0
  for (let i = 0; i < before.length; i++) {
    const next = after[i]
    if (typeof next !== "string" || next === before[i]) continue
    touchedChars += before[i].length
    touchedSaved += Math.max(0, before[i].length - next.length)
  }
  const record = (report.strategies || []).find((r) => r.id === id) || null
  return {
    record,
    report,
    touchedChars,
    touchedPct: touchedChars ? (touchedSaved / touchedChars) * 100 : 0,
  }
}

// ─── 汇总 ────────────────────────────────────────────────────────────────────

function median(values) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

function quantile(values, q) {
  if (values.length === 0) return 0
  const sorted = values.slice().sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))]
}

export function summarize(id, runs) {
  const pcts = runs.map((r) => (r.record?.beforeBytes ? (r.record.savedBytes / r.record.beforeBytes) * 100 : 0))
  const hitPcts = runs.filter((r) => r.record && r.record.status === "hit" && r.record.savedBytes > 0).map((r) => (r.record.beforeBytes ? (r.record.savedBytes / r.record.beforeBytes) * 100 : 0))
  const totalBefore = runs.reduce((sum, r) => sum + (r.record?.beforeBytes || 0), 0)
  const totalSaved = runs.reduce((sum, r) => sum + (r.record?.savedBytes || 0), 0)
  return {
    id,
    runs: runs.length,
    hits: hitPcts.length,
    hitRate: runs.length ? hitPcts.length / runs.length : 0,
    medianPctOnHits: median(hitPcts),
    medianTouchedPct: median(runs.filter((r) => r.touchedChars > 0).map((r) => r.touchedPct)),
    totalTouchedChars: runs.reduce((sum, r) => sum + (r.touchedChars || 0), 0),
    totalTouchedSaved: runs.reduce((sum, r) => sum + (r.touchedChars || 0) * (r.touchedPct || 0) / 100, 0),
    p90PctOnHits: quantile(hitPcts, 0.9),
    maxPctOnHits: hitPcts.length ? Math.max(...hitPcts) : 0,
    medianPctAll: median(pcts),
    weightedPct: totalBefore ? (totalSaved / totalBefore) * 100 : 0,
    failOpen: runs.filter((r) => r.record && r.record.status === "fail_open").length,
  }
}

// ─── 作用域语料（都用真实数据搭形状，见文件头）────────────────────────────────

// CCR 在生产里由网关声明取回工具，调用方没带 tools[] 时它整段门控关掉。
export const CCR_TOOLS = [{
  type: "function",
  function: {
    name: "omniroute_ccr_retrieve",
    description: "Retrieve the original text behind a [CCR retrieve hash=...] marker.",
    parameters: { type: "object", properties: { hash: { type: "string" } }, required: ["hash"] },
  },
}]

export function withCcrTools(body) {
  return { ...body, tools: CCR_TOOLS }
}

// codex-responses 只认 responses 协议：把真实工具输出装进 function_call_output，
// 并补上配对的 function_call（引擎按 call_id 判资格）。
export function responsesCorpus(corpus) {
  const out = []
  for (const item of corpus) {
    const input = [{ type: "message", role: "user", content: [{ type: "input_text", text: "Continue." }] }]
    let n = 0
    for (const message of item.body.messages) {
      if (message.role !== "tool") continue
      const callId = `call_${++n}`
      input.push({ type: "function_call", call_id: callId, name: "shell", arguments: "{}" })
      input.push({ type: "function_call_output", call_id: callId, output: message.content })
    }
    if (n === 0) continue
    out.push({ id: item.id, body: { model: "bench", instructions: "You are a coding agent.", input } })
  }
  return out
}

// headroom 要「全对象 JSON 数组」：用抓包索引本身（真实数组，69 行）。
export function headroomCorpus() {
  const path = join(telemetryDir, "captures-index.json")
  if (!existsSync(path)) return []
  const parsed = JSON.parse(readFileSync(path, "utf8"))
  if (!Array.isArray(parsed) || parsed.length < 8) return []
  return [{ id: "captures-index", body: { model: "bench", messages: [{ role: "tool", content: JSON.stringify(parsed) }] } }]
}

// ionizer 要 >200 行的同构对象数组：用请求遥测本身（真实 1209 行）。
export function ionizerCorpus() {
  const path = join(telemetryDir, "requests.jsonl")
  if (!existsSync(path)) return []
  const rows = readFileSync(path, "utf8").split("\n").filter((line) => line.trim().startsWith("{"))
    .map((line) => { try { return JSON.parse(line) } catch { return null } })
    .filter((row) => row && typeof row === "object")
  if (rows.length <= 200) return []
  return [{ id: "requests.jsonl", body: { model: "bench", messages: [{ role: "tool", content: JSON.stringify(rows) }] } }]
}

// read-lifecycle 要 tool_calls 里的路径：用仓库里真实文件的全文，同一批文件读 4 轮。
// 每轮之间内容必须有变化：引擎的 filterSupersededReads 会保留「结果相同的重读」
// （相同的交给 session-dedup），4 轮读同一版本会被整包判成 nothing_to_remove。
// 所以第 1 轮之后给真实文件追加一段 round 标记，模拟「读过又改过再读」。
export function readLifecycleCorpus() {
  const files = ["catalog.js", "pipeline.js", "adapter.js", "lab.js"]
  const contents = files.map((name) => readFileSync(join(root, name), "utf8"))
  const messages = [{ role: "system", content: "You are a coding agent." }]
  let callIndex = 0
  for (let round = 0; round < 4; round++) {
    files.forEach((name, i) => {
      const callId = `call_${++callIndex}`
      messages.push({
        role: "assistant",
        content: `Reading ${name}.`,
        tool_calls: [{ id: callId, type: "function", function: { name: "read", arguments: JSON.stringify({ file_path: name }) } }],
      })
      messages.push({ role: "tool", tool_call_id: callId, name: "read", content: round === 0 ? contents[i] : `${contents[i]}\n// round ${round}: edited since previous read\n` })
    })
    messages.push({ role: "user", content: `Round ${round + 1} done, keep going.` })
  }
  return [{ id: "synthetic-read-session", body: { model: "bench", messages } }]
}

// ─── main ────────────────────────────────────────────────────────────────────

if (process.argv[1] && process.argv[1].endsWith("bench-ratios.mjs")) {
  const corpus = loadCorpus()
  const scoped = {
    ccr: corpus.map((item) => ({ id: item.id, body: withCcrTools(item.body) })),
    "codex-responses": responsesCorpus(corpus),
    headroom: headroomCorpus(),
    ionizer: ionizerCorpus(),
    "read-lifecycle": readLifecycleCorpus(),
  }
  const ids = Array.from(REGISTRY.keys())
  const results = []
  for (const id of ids) {
    const realRuns = corpus.map((item) => benchOne(item.body, "chat", id))
    const real = summarize(id, realRuns)
    const source = scoped[id] || corpus
    const protocol = id === "codex-responses" ? "responses" : "chat"
    const targetRuns = source.map((item) => benchOne(item.body, protocol, id))
    const targeted = summarize(id, targetRuns)
    results.push({ id, real, targeted, targetedCorpus: scoped[id] ? source.length : null })
  }
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify({ captureDir, corpus: corpus.length, results }, null, 2))
  } else {
    console.log(`real corpus: ${corpus.length} captures from ${captureDir}`)
    console.log(`targeted: ccr=tools[] gate, codex-responses=responses, headroom=JSON array, ionizer=>200 rows, read-lifecycle=tool_calls\n`)
    const head = ["engine".padEnd(16), "real hit%".padStart(10), "real med%".padStart(10), "tgt n".padStart(6), "tgt hit".padStart(8), "tgt med%".padStart(9), "tgt p90%".padStart(9), "tgt max%".padStart(9), "touched%".padStart(9), "failOpen".padStart(9)]
    console.log(head.join(" "))
    for (const r of results) {
      console.log([
        r.id.padEnd(16),
        (r.real.hitRate * 100).toFixed(0).padStart(10),
        r.real.medianPctOnHits.toFixed(1).padStart(10),
        String(r.targeted.runs).padStart(6),
        String(r.targeted.hits).padStart(8),
        r.targeted.medianPctOnHits.toFixed(1).padStart(9),
        r.targeted.p90PctOnHits.toFixed(1).padStart(9),
        r.targeted.maxPctOnHits.toFixed(1).padStart(9),
        r.targeted.medianTouchedPct.toFixed(1).padStart(9),
        String(r.targeted.failOpen + r.real.failOpen).padStart(9),
      ].join(" "))
    }
  }
}
