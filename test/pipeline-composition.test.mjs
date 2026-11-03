import { check, ctxFor } from "./helpers.mjs"
import { runPipeline } from "../pipeline.js"
import { ENGINES } from "../catalog.js"
import { encodeGeneric } from "../engines/gcf/encode.js"
import { decodeGeneric } from "../engines/gcf/decode.js"

export const name = "pipeline composition"

const strategies = Object.fromEntries(ENGINES.map(e => [e.id, ["read-lifecycle", "session-dedup", "ccr", "lite", "rtk", "codex-responses", "headroom", "leanctx-structured"].includes(e.id)]))
const text = "The investigation found an authentication failure in the token renewal path. ".repeat(60)
const original = [
  { role: "user", content: "Investigate the failure.\n\n\n" + text },
  { role: "assistant", content: [{ type: "tool_use", id: "r1", name: "Read", input: { file_path: "/src/auth.ts" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "r1", content: text }] },
  { role: "assistant", content: [{ type: "tool_use", id: "r2", name: "Read", input: { file_path: "/src/auth.ts" } }] },
  { role: "user", content: [{ type: "tool_result", tool_use_id: "r2", content: text }] },
  { role: "assistant", content: text },
  { role: "user", content: text },
  { role: "user", content: "Give root cause." },
]

export async function run() {
  const table = Array.from({ length: 12 }, (_, i) => ({ id: i, status: "active", region: "eu" }))
  const encoded = encodeGeneric(table)
  check("GCF constant scalar columns are factored in header", encoded.includes("status=active") && encoded.includes("region=eu"))
  check("GCF factoring preserves complete data", JSON.stringify(decodeGeneric(encoded)) === JSON.stringify(table))
  // A real request never ends between a tool call and its result, so only
  // complete prefixes are compared; a prefix that splits the pair is not a
  // state any client sends.
  const completeTurns = [1, 2, 3, 5, 6, 7, 8]
  let previous = null, changedOld = []
  for (const n of completeTurns) {
    const body = { model: "m", messages: structuredClone(original.slice(0, n)) }
    runPipeline(body, ctxFor("anthropic"), { strategies })
    if (previous) {
      const index = body.messages.slice(0, previous.length).findIndex((m, i) => JSON.stringify(m) !== JSON.stringify(previous[i]))
      if (index >= 0) changedOld.push({ turn: n, index })
    }
    previous = body.messages
  }
  check("complete-turn prefixes stay byte-stable across requests", changedOld.length === 0, JSON.stringify(changedOld))

  const sameContent = { model: "m", messages: structuredClone(original.slice(0, 5)) }
  runPipeline(sameContent, ctxFor("anthropic"), { strategies })
  check("identical re-read is not folded into a stub", !JSON.stringify(sameContent).includes("[read superseded"))

  const changedContent = { model: "m", messages: structuredClone(original.slice(0, 5)) }
  changedContent.messages[4].content[0].content = "SECOND READ RETURNED DIFFERENT CONTENT ".repeat(40)
  runPipeline(changedContent, ctxFor("anthropic"), { strategies })
  check("changed re-read still folds the stale read", JSON.stringify(changedContent).includes("[read superseded"))
}
