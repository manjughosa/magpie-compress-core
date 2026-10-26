// test/session-bench.mjs — run the compression pipeline against a real pi
// session (JSONL) reshaped as an OpenAI chat-completions request body.
//
//   node test/session-bench.mjs <session.jsonl> [maxMessages]
//
// Reports per-strategy and total compression. Text content only; tool
// calls and non-text parts are skipped.

import { readFileSync } from "node:fs"
import * as middleware from "../compress-core.middleware.js"

const file = process.argv[2]
const maxMessages = Number(process.argv[3] ?? 400)
if (!file) {
  console.error("usage: node test/session-bench.mjs <session.jsonl> [maxMessages]")
  process.exit(2)
}

const entries = []
for (const line of readFileSync(file, "utf8").split("\n")) {
  if (!line.includes('"type":"message"')) continue
  let rec
  try {
    rec = JSON.parse(line)
  } catch {
    continue
  }
  const m = rec.message
  if (!m || typeof m !== "object") continue
  const role = m.role
  if (role !== "user" && role !== "assistant" && role !== "system" && role !== "tool") continue
  let text = ""
  if (typeof m.content === "string") text = m.content
  else if (Array.isArray(m.content)) {
    text = m.content
      .filter((p) => p && typeof p === "object" && p.type === "text" && typeof p.text === "string")
      .map((p) => p.text)
      .join("\n")
  }
  if (!text && m.sections && typeof m.sections === "object") text = Object.values(m.sections).join("\n\n")
  if (!text) continue
  entries.push({ role: role === "tool" ? "tool" : role, text })
}

const picked = entries.slice(-maxMessages)
const body = { model: "session-bench", messages: picked.map((e) => ({ role: e.role, content: e.text })) }

const before = JSON.stringify(body).length
const t0 = process.hrtime.bigint()
const out = middleware.onRequest(body, { protocol: "chat", options: { strategies: { rtk: process.env.BENCH_RTK === "1" } }, state: {} }) ?? body
const ms = Number(process.hrtime.bigint() - t0) / 1e6
const after = JSON.stringify(out).length

console.log(`session:   ${file}`)
console.log(`messages:  ${picked.length} (of ${entries.length} total)`)
console.log(`before:    ${before} chars (~${Math.ceil(before / 4)} tokens)`)
console.log(`after:     ${after} chars (~${Math.ceil(after / 4)} tokens)`)
console.log(`saved:     ${before - after} chars (${(((before - after) / before) * 100).toFixed(2)}%)`)
console.log(`time:      ${ms.toFixed(1)}ms  (moejs request-hook budget: 250ms)`)
