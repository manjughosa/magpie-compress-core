// scripts/replay-platforms.mjs — 把各平台真实会话/抓包灌进当前管线，只输出数字。
//
// 用途：每次改门控/引擎后，一条命令回答“各 harness 还都能不能在真实会话上压”。
// 与 replay-captures.mjs 的区别：后者把所有抓包都当 chat 回放，ccr 必然 no_retrieve_tool；
// 这个脚本按平台重建各自的请求形状（anthropic/chat/responses）和工具声明，门控才会被真正走过。
//
// 数据源（本机路径，可用环境变量覆盖）：
//   claude  C:\Users\...\.config\magpie\compress-core\captures（真实抓包，含对话正文）
//   pi      E:\pi-agent\agent\sessions\--C--Users-32203--（真实会话）
//   codex   C:\Users\...\.codex\sessions\2026\11\03（真实 rollout）
// 只在本机跑，不打印正文；不要提交 captures / 会话文件。
//
// 用法: node scripts/replay-platforms.mjs

import fs from "node:fs"
import { runPipeline, clone } from "../pipeline.js"
import { detectRetrieveCapability } from "../engines/ccr/index.js"

const DATA = process.env.COMPRESS_DATA_DIR || "C:/Users/32203/.config/magpie/compress-core"
const CLAUDE_CAPTURES = DATA + "/captures"
const PI_SESSIONS = process.env.PI_SESSIONS_DIR || "E:/pi-agent/agent/sessions/--C--Users-32203--"
const CODEX_SESSIONS = process.env.CODEX_SESSIONS_DIR || "C:/Users/32203/.codex/sessions/2026/11/03"

const BASE = {
  budgetMs: 600,
  strategies: {
    "session-dedup": true,
    ccr: true,
    lite: true,
    headroom: true,
    rtk: false,
    "codex-responses": false,
    relevance: false,
    caveman: false,
    "read-lifecycle": false,
    aggressive: false,
    ultra: false,
    ionizer: false,
    llm: false,
    "leanctx-structured": false,
  },
}

function withLite(flag) {
  return { ...BASE, strategies: { ...BASE.strategies, lite: { enabled: true, compressToolResults: flag } } }
}

function stats(rec) {
  const out = { total: rec.beforeBytes, after: rec.afterBytes, saved: rec.savedBytes, pct: rec.savedPct, ccr: null, dedup: null, lite: null, headroom: null, failOpen: rec.failOpen, budget: rec.budgetExceeded }
  for (const s of rec.strategies || []) {
    const key = s.id === "session-dedup" ? "dedup" : s.id
    if (!(key in out)) continue
    out[key] = { status: s.status, reason: s.reason, saved: s.savedBytes || 0, retrieval: s.retrieval }
  }
  return out
}

function run(body, protocol, agent, options = BASE) {
  return runPipeline(body, { protocol, agent, state: {} }, options, clone(body))
}

function line(label, s) {
  const c = s.ccr || {}, d = s.dedup || {}, l = s.lite || {}, h = s.headroom || {}
  console.log(
    `${label.padEnd(26)} ${String(Math.round(s.total / 1024)).padStart(5)}KB -> ${String(Math.round(s.after / 1024)).padStart(5)}KB ` +
    `saved=${String(s.saved).padStart(7)}B (${s.pct}%) | ` +
    `ccr=${c.status}/${c.reason || "-"}${c.retrieval ? "[" + c.retrieval + "]" : ""} -${c.saved || 0}B | ` +
    `dedup=${d.status}/${d.reason || "-"} -${d.saved || 0}B | lite=${l.status}/${l.reason || "-"} -${l.saved || 0}B | ` +
    `headroom=${h.status} -${h.saved || 0}B | failOpen=${s.failOpen} budget=${s.budget}`
  )
}

// ───────────── Claude Code：真实抓包 ─────────────
function parseSegments(text) {
  const parts = String(text).split(/\n(?=\[\d+\] \[[a-z]+\] )/)
  const segs = []
  for (const p of parts) {
    const m = p.match(/^\[(\d+)\] \[([a-z]+)\] ([\s\S]*)$/)
    if (m) segs.push({ i: +m[1], role: m[2], text: m[3] })
  }
  return segs
}

function claudeBody(cap) {
  const segs = parseSegments(cap.beforeText || "")
  const system = segs.filter((s) => s.role === "system").map((s) => s.text).join("\n\n")
  const messages = []
  for (const s of segs) {
    if (s.role === "system") continue
    if (s.role === "tool") messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: "r" + s.i, content: s.text }] })
    else if (s.role === "user" || s.role === "assistant") messages.push({ role: s.role, content: s.text })
  }
  return { model: cap.model, system, tools: [{ name: "ToolSearch" }, { name: "Read" }, { name: "Bash" }], messages }
}

function replayClaude() {
  if (!fs.existsSync(CLAUDE_CAPTURES)) { console.log("\n######## Claude Code：找不到 captures，跳过"); return }
  const files = fs.readdirSync(CLAUDE_CAPTURES).filter((f) => f.endsWith(".json"))
  let main = 0, side = 0, mainSaved = 0, mainBefore = 0, ccrHits = 0, prodSaved = 0
  const modes = {}
  const details = []
  for (const f of files) {
    const cap = JSON.parse(fs.readFileSync(CLAUDE_CAPTURES + "/" + f, "utf8"))
    if (cap.agent !== "claude") continue
    const body = claudeBody(cap)
    if (!body.messages.length) continue
    const mode = detectRetrieveCapability(body, "claude").mode
    modes[mode] = (modes[mode] || 0) + 1
    const s = stats(run(body, "anthropic", "claude"))
    prodSaved += cap.savedBytes || 0
    if (mode === "deferred") {
      main++; mainSaved += s.saved; mainBefore += s.total
      if (s.ccr && s.ccr.status === "hit") ccrHits++
      details.push({ at: cap.at, kb: Math.round(s.total / 1024), saved: s.saved, pct: s.pct, ccr: s.ccr.status, ccrSaved: s.ccr.saved })
    } else side++
  }
  details.sort((a, b) => String(a.at).localeCompare(String(b.at)))
  console.log(`\n######## Claude Code（真实抓包 ${main + side} 份）`)
  console.log("能力判定分布:", modes, " 主请求:", main, " 侧请求:", side)
  for (const d of details.slice(-6)) {
    console.log(`  ${d.at.slice(0, 19)} ${String(d.kb).padStart(5)}KB saved=${String(d.saved).padStart(6)}B (${d.pct}%) ccr=${d.ccr} -${d.ccrSaved}B`)
  }
  if (main) console.log(`  主请求合计: ${Math.round(mainBefore / 1024)}KB -> saved=${mainSaved}B (${(mainSaved / mainBefore * 100).toFixed(2)}%); ccr 命中 ${ccrHits}/${main}; 同期生产记录 saved=${prodSaved}B`)
}

// ───────────── Pi：真实会话 ─────────────
function piBody(file) {
  const msgs = []
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    if (!raw) continue
    let o
    try { o = JSON.parse(raw) } catch { continue }
    if (o.type !== "message" || !o.message) continue
    const m = o.message
    const text = Array.isArray(m.content)
      ? m.content.filter((p) => p && p.type === "text" && typeof p.text === "string").map((p) => p.text).join("\n")
      : typeof m.content === "string" ? m.content : ""
    if (!text) continue
    if (m.role === "system") msgs.push({ role: "system", content: text })
    else if (m.role === "user") msgs.push({ role: "user", content: text })
    else if (m.role === "assistant") msgs.push({ role: "assistant", content: text })
    else if (m.role === "toolResult") msgs.push({ role: "tool", content: text })
  }
  return { model: "pi-replay", tools: [{ type: "function", function: { name: "eval" } }], messages: msgs }
}

function replayPi() {
  if (!fs.existsSync(PI_SESSIONS)) { console.log("\n######## Pi：找不到会话目录，跳过"); return }
  const files = fs.readdirSync(PI_SESSIONS).filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: fs.statSync(PI_SESSIONS + "/" + f).mtimeMs })).sort((a, b) => b.m - a.m)
  if (!files.length) { console.log("\n######## Pi：没有 .jsonl 会话，跳过"); return }
  const pick = files[0].f
  const body = piBody(PI_SESSIONS + "/" + pick)
  console.log(`\n######## Pi（真实会话 ${pick.slice(0, 19)}，msgs=${body.messages.length}）`)
  line("pi · lite 默认（不截工具）", stats(run(clone(body), "chat", "pi", BASE)))
  line("pi · lite 截工具输出", stats(run(clone(body), "chat", "pi", withLite(true))))
}

// ───────────── Codex：真实 rollout ─────────────
function codexBody(file) {
  const input = []
  for (const raw of fs.readFileSync(file, "utf8").split("\n")) {
    if (!raw) continue
    let o
    try { o = JSON.parse(raw) } catch { continue }
    if (o.type !== "response_item" || !o.payload) continue
    const p = o.payload
    if (p.type === "message") {
      const text = Array.isArray(p.content)
        ? p.content.filter((c) => c && typeof c.text === "string").map((c) => c.text).join("\n")
        : typeof p.content === "string" ? p.content : ""
      if (text) input.push({ type: "message", role: p.role, content: [{ type: p.role === "assistant" ? "output_text" : "input_text", text }] })
    } else if (p.type === "function_call_output" && typeof p.output === "string") {
      input.push({ type: "function_call_output", output: p.output })
    }
  }
  return { model: "codex-replay", tools: [{ type: "function", name: "exec_command" }], input }
}

function replayCodex() {
  if (!fs.existsSync(CODEX_SESSIONS)) { console.log("\n######## Codex：找不到 rollout 目录，跳过"); return }
  const files = fs.readdirSync(CODEX_SESSIONS).filter((f) => f.endsWith(".jsonl"))
    .map((f) => ({ f, m: fs.statSync(CODEX_SESSIONS + "/" + f).mtimeMs })).sort((a, b) => b.m - a.m)
  if (!files.length) { console.log("\n######## Codex：没有 rollout，跳过"); return }
  const pick = files[0].f
  const body = codexBody(CODEX_SESSIONS + "/" + pick)
  console.log(`\n######## Codex（真实 rollout ${pick.slice(0, 30)}，items=${body.input.length}）`)
  line("codex · 当前配置", stats(run(body, "responses", "codex", BASE)))
}

replayClaude()
replayPi()
replayCodex()
