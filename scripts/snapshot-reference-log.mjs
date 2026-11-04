// scripts/snapshot-reference-log.mjs — 用最新的 magpie 日志刷新对比日志的环境快照与 harness 汇总。
//
// 为什么要有这个：docs/reference-logs.local.md 以前是手工冻结的（旧 Claude 基线一直留着，
// 数字早就不是线上状态）。现在每个迭代结束/每次行为改动落地后跑一遍，旧快照整块替换。
//
// 输入（只读，无正文）：
//   <数据目录>/requests.jsonl(.1)
//   <数据目录>/../plugins.json（本机 options，取生效策略/budgetMs；只为写说明）
// 输出：docs/reference-logs.local.md 里
//   <!-- AUTO-SNAPSHOT:BEGIN --> ... <!-- AUTO-SNAPSHOT:END --> 之间的内容
//
// 用法: node scripts/snapshot-reference-log.mjs [数据目录] [日志文件]

import fs from "node:fs"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"

const HERE = path.dirname(fileURLToPath(import.meta.url))
const PLUGIN = path.resolve(HERE, "..")
const DATA = process.argv[2] || "C:/Users/32203/.config/magpie/compress-core"
const TARGET = process.argv[3] || path.join(PLUGIN, "docs/reference-logs.local.md")
const BEGIN = "<!-- AUTO-SNAPSHOT:BEGIN -->"
const END = "<!-- AUTO-SNAPSHOT:END -->"

function readRequests() {
  const rows = []
  for (const f of ["requests.jsonl", "requests.jsonl.1"]) {
    const p = path.join(DATA, f)
    if (!fs.existsSync(p)) continue
    for (const line of fs.readFileSync(p, "utf8").split("\n")) {
      if (!line) continue
      let r
      try { r = JSON.parse(line) } catch { continue }
      if (r.type === "request") rows.push(r)
    }
  }
  rows.sort((a, b) => String(a.ts).localeCompare(String(b.ts)))
  return rows
}

function pluginMeta() {
  const out = { head: "unknown", strategies: "unknown", budgetMs: "unknown", lite: "unknown" }
  try {
    out.head = execFileSync("git", ["-C", PLUGIN, "rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()
  } catch { /* 不是 git 仓库也能跑 */ }
  const candidates = [
    process.env.MAGPIE_PLUGINS_JSON,
    path.resolve(DATA, "../plugins.json"),
    path.resolve(DATA, "plugins.json"),
  ].filter(Boolean)
  const p = candidates.find((f) => fs.existsSync(f))
  if (!p) return out
  try {
    const list = JSON.parse(fs.readFileSync(p, "utf8")).plugins || []
    const entry = list.find((x) => x && typeof x.spec === "string" && x.spec.includes("compress-core"))
    const o = (entry && entry.options) || {}
    if (Number.isFinite(o.budgetMs)) out.budgetMs = String(o.budgetMs)
    const enabled = []
    for (const [id, v] of Object.entries(o.strategies || {})) {
      if (v === true || (v && typeof v === "object" && v.enabled !== false)) enabled.push(id)
    }
    if (enabled.length) out.strategies = enabled.join(" / ")
    const lite = o.strategies && o.strategies.lite
    out.lite = lite && typeof lite === "object" && lite.compressToolResults === true
      ? "`compressToolResults: true`（有损，本机 options）"
      : "默认 false（不截工具输出）"
  } catch { /* 读不到就保留 unknown */ }
  return out
}

const rows = readRequests()
if (rows.length === 0) {
  console.error("没有读到 request 事件：" + path.join(DATA, "requests.jsonl"))
  process.exit(1)
}

// 默认只取最近 24h：对比日志要反映“现在的行为”，不是把历史一起平均。
// SNAPSHOT_HOURS=0 表示全窗口（做长期趋势时才用）。
const HOURS = Number(process.env.SNAPSHOT_HOURS ?? 24)
const cutoff = HOURS > 0 ? new Date(Date.now() - HOURS * 3600e3).toISOString() : ""
const recent = cutoff ? rows.filter((r) => String(r.ts) >= cutoff) : rows
if (recent.length === 0) {
  console.error(`最近 ${HOURS}h 没有 request 事件；用 SNAPSHOT_HOURS=0 跑全窗口`)
  process.exit(1)
}

function aggregate(list) {
  const byAgent = new Map()
  for (const r of list) {
    const a = r.agent || "(none)"
    const o = byAgent.get(a) || { n: 0, maxBefore: 0, ccrHit: 0, ccrSaved: 0, totalSaved: 0, pcts: [], retrieval: {} }
    o.n++
    o.maxBefore = Math.max(o.maxBefore, r.beforeBytes || 0)
    o.totalSaved += r.savedBytes || 0
    o.pcts.push(Number(r.savedPct) || 0)
    for (const s of r.strategies || []) {
      if (s.id === "ccr") {
        if (s.status === "hit") { o.ccrHit++; o.ccrSaved += s.savedBytes || 0 }
        if (s.retrieval) o.retrieval[s.retrieval] = (o.retrieval[s.retrieval] || 0) + 1
      }
    }
    byAgent.set(a, o)
  }
  return byAgent
}

const median = (arr) => {
  const a = arr.slice().sort((x, y) => x - y)
  return a.length ? a[Math.floor(a.length / 2)] : 0
}
const fmt = (n) => Number(n).toLocaleString("en-US")
const ret = (m) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(" ") || "—"

const meta = pluginMeta()
const firstTs = recent[0].ts
const lastTs = recent[recent.length - 1].ts
const totalBefore = recent.reduce((s, r) => s + (r.beforeBytes || 0), 0)
const totalSaved = recent.reduce((s, r) => s + (r.savedBytes || 0), 0)

function table(list, heading, note) {
  const agg = aggregate(list)
  const sum = list.reduce((s, r) => s + (r.savedBytes || 0), 0)
  const out = [`## ${heading}（自动生成，勿手改）`, ""]
  if (note) out.push(note, "")
  out.push("| agent | 请求数 | 最大 beforeBytes | ccr 命中/总数 | ccr 省字节 | 总省字节 | 中位 pct | ccr retrieval |")
  out.push("| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |")
  for (const [a, o] of [...agg.entries()].sort((x, y) => y[1].n - x[1].n)) {
    out.push(`| ${a} | ${o.n} | ${fmt(o.maxBefore)} | ${o.ccrHit}/${o.n} | ${fmt(o.ccrSaved)} | ${fmt(o.totalSaved)} | ${median(o.pcts).toFixed(2)} | ${ret(o.retrieval)} |`)
  }
  out.push(`| **合计** | **${fmt(list.length)}** | — | — | — | **${fmt(sum)}** | — | — |`)
  out.push("")
  return out
}

const lines = []
lines.push("## 环境快照（自动生成，勿手改）")
lines.push("")
lines.push("| 项 | 值 |")
lines.push("| --- | --- |")
lines.push(`| 快照时间 | ${new Date().toISOString()} |`)
lines.push(`| 插件 HEAD | \`${meta.head}\` |`)
lines.push(`| 数据窗口 | ${HOURS > 0 ? `最近 ${HOURS}h：` : "全窗口："}${firstTs} → ${lastTs} |`)
lines.push(`| 数据源 | \`requests.jsonl\` + \`requests.jsonl.1\`，本次取 ${fmt(recent.length)} 条（文件共 ${fmt(rows.length)} 条） |`)
lines.push(`| 生效策略 | ${meta.strategies} |`)
lines.push(`| \`budgetMs\` | ${meta.budgetMs} |`)
lines.push(`| lite | ${meta.lite} |`)
lines.push("")

lines.push(...table(recent, "最近 24h 全平台", "中位 `savedPct` 是每条请求的百分比取中位数，不是总和除以总和。"))

// “本次版本”用 retrieval 字段做分界：旧代码没有这个字段，重载后才有。
const versionStart = recent.find((r) => (r.strategies || []).some((s) => s.id === "ccr" && s.retrieval))
if (versionStart) {
  const current = recent.filter((r) => String(r.ts) >= versionStart.ts)
  lines.push(...table(current, `本次版本（自 ${versionStart.ts}）`,
    "分界点 = 第一条带 `retrieval` 字段的请求（旧代码不写这个字段）。没有近期请求的 agent 不出现。"))
} else {
  lines.push("## 本次版本", "", "还没有带 `retrieval` 字段的请求：重载后再跑一次。", "")
}

lines.push(`> 生成命令：\`node scripts/snapshot-reference-log.mjs\` · 最近 24h 产物 ${fmt(totalBefore)} B → 省 ${fmt(totalSaved)} B`)
lines.push("")

const block = `${BEGIN}\n${lines.join("\n")}${END}`
let doc = fs.readFileSync(TARGET, "utf8")
if (!doc.includes(BEGIN) || !doc.includes(END)) {
  console.error(`目标文件缺少标记：${BEGIN} / ${END}`)
  process.exit(1)
}
doc = doc.replace(new RegExp(`${BEGIN.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\s\\S]*?${END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`), block)
fs.writeFileSync(TARGET, doc)
console.log(`已刷新 ${path.relative(PLUGIN, TARGET)}：${fmt(recent.length)} 条 request（最近 ${HOURS}h），${aggregate(recent).size} 个 agent`)
