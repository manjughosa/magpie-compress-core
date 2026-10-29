// scripts/replay-captures.mjs — 把数据目录里的 captures 回放到当前管线上。
// 用法: node scripts/replay-captures.mjs [数据目录] [条数]
// 输出: 每条 capture 的 before/after/savedPct 与各引擎命中情况 + 汇总表。
// 注意: capture 存的是 conversationView 拼出的文本（已脱敏、丢失 content-block 结构），
// 所以这是「文本级」近似回放：重建 {messages:[{role,content}]} 后跑 runPipeline。
// 它回答的是「这段文本里各引擎还能压出多少」，不是逐字节复现生产路径。
import fs from "node:fs"
import path from "node:path"
import { runPipeline } from "../pipeline.js"

const DATA_DIR = process.argv[2] || "C:/Users/32203/.config/magpie/compress-core"
const LIMIT = Number(process.argv[3]) || 50

const OPTIONS = {
  budgetMs: 600,
  capture: true,
  preserve: { lastTurns: 0, system: false },
  strategies: {
    "session-dedup": true, ccr: true, lite: true, headroom: true,
    rtk: false, "codex-responses": false, relevance: false, caveman: false,
    "read-lifecycle": false, aggressive: false, llmlingua: false, ultra: false,
    ionizer: false, llm: false, omniglyph: false,
  },
}

function parseSegments(beforeText) {
  // observability.hooks.js 的落盘格式: `[i] [role] text`，段间 \n 分隔，text 本身可含 \n
  const parts = String(beforeText).split(/\n(?=\[\d+\] \[[a-z]+\] )/)
  const messages = []
  for (const part of parts) {
    const m = part.match(/^\[(\d+)\] \[([a-z]+)\] ([\s\S]*)$/)
    if (!m) continue
    messages.push({ role: m[2], content: m[3] })
  }
  return messages
}

const index = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "captures-index.json"), "utf8"))
const rows = (Array.isArray(index) ? index : index.captures).slice(0, LIMIT)

const agg = new Map() // engineId -> {enabled, hit, saved}
let totalBefore = 0, totalAfter = 0, totalOrigSaved = 0, replayed = 0
for (const row of rows) {
  const file = path.join(DATA_DIR, "captures", `${row.id}.json`)
  if (!fs.existsSync(file)) continue
  const cap = JSON.parse(fs.readFileSync(file, "utf8"))
  if (!cap.beforeText) continue
  const messages = parseSegments(cap.beforeText)
  if (messages.length === 0) continue
  replayed++
  const body = { model: cap.model || "replay", messages }
  const beforeBytes = Buffer.byteLength(JSON.stringify(body))
  const record = runPipeline(body, { protocol: "chat", agent: "replay", model: body.model, state: {} }, OPTIONS)
  totalBefore += record.beforeBytes
  totalAfter += record.afterBytes
  totalOrigSaved += cap.savedBytes || 0
  const per = []
  for (const s of record.strategies) {
    if (!s.enabled) continue
    const a = agg.get(s.id) || { enabled: 0, hit: 0, saved: 0, ms: 0 }
    a.enabled++
    if (s.status === "hit") { a.hit++; a.saved += s.savedBytes || 0 }
    a.ms += s.ms || 0
    agg.set(s.id, a)
    per.push(`${s.id}:${s.status}${s.status === "hit" ? `(-${s.savedBytes})` : `(${s.reason})`}`)
  }
  console.log(`${cap.at.slice(0, 16)} msgs=${String(messages.length).padStart(3)} ${record.beforeBytes}B→${record.afterBytes}B saved=${record.savedBytes} (${record.savedPct}%) orig=${cap.savedBytes} | ${per.join(" ")}`)
}

console.log("\n=== 汇总 ===")
console.log(`回放 ${replayed}/${rows.length} 条; 文本级 before=${totalBefore}B after=${totalAfter}B saved=${totalBefore - totalAfter}B (${totalBefore ? ((totalBefore - totalAfter) / totalBefore * 100).toFixed(2) : 0}%); 生产记录 saved=${totalOrigSaved}B`)
for (const [id, a] of agg) {
  console.log(`${id.padEnd(16)} enabled=${a.enabled} hit=${a.hit} hitRate=${(a.hit / a.enabled * 100).toFixed(0)}% saved=${a.saved}B avgMs=${(a.ms / a.enabled).toFixed(1)}`)
}
