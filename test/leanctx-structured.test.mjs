import assert from "node:assert/strict"
import { check, ctxFor } from "./helpers.mjs"
import { apply, compactDelimited, compactYaml, parseDelimited, parseYamlSubset, restoreStructured, configSchema, defaultOn, lossy, stackPriority } from "../engines/leanctx-structured.js"
import { runPipeline } from "../pipeline.js"
import { ENGINES } from "../catalog.js"

export const name = "leanctx-structured"

function csv() {
  return "id,name,status,region\n" + Array.from({ length: 20 }, (_, i) => `${i},user${i},active,eu-central-1`).join("\n")
}
function yaml() {
  return "items:\n" + Array.from({ length: 16 }, (_, i) => `  - apiVersion: v1\n    kind: Pod\n    namespace: prod\n    name: pod-${i}`).join("\n")
}
function toolBody(text) {
  return { model: "m", messages: [
    { role: "assistant", content: null, tool_calls: [{ id: "r1", type: "function", function: { name: "read", arguments: "{\"path\":\"values.yaml\"}" } }] },
    { role: "tool", tool_call_id: "r1", content: text },
  ] }
}

export async function run() {
  check("metadata opt-in lossy at Headroom→Relevance boundary", lossy === true && defaultOn === false && stackPriority === 17)
  check("config has entropy and format controls", ["dropEntropy", "formats"].every(k => configSchema.some(f => f.key === k)))
  const rows = parseDelimited(csv(), ",")
  check("CSV parses header and all rows", rows.length === 21 && rows[0][2] === "status")
  const quoted = parseDelimited('id,note,status\n1,"a, ""q""",ok\n2,"multi\nline",ok\n3,plain,ok\n4,last,ok', ",")
  check("RFC4180 embedded delimiter, escaped quotes and newlines survive", quoted?.[1][1] === 'a, "q"' && quoted?.[2][1] === "multi\nline")
  const packed = compactDelimited(csv(), ",")
  check("constant CSV columns factor once", packed?.includes('"status":"active"') && packed?.includes('"r":['))
  assert.deepEqual(restoreStructured(packed), rows)
  check("CSV remaining data round-trips exactly", true)
  check("ordinary CSV-looking text with quotes is not guessed", compactDelimited('id,name\n1,"Alice"\n2,"Bob"\n3,"Carol"\n4,"Dan"', ",") === null)
  check("ragged CSV never changed", compactDelimited("a,b\n1,ok\n2\n3,ok\n4,ok", ",") === null)
  const tsv = compactDelimited(csv().replaceAll(",", "\t"), "\t")
  check("TSV has same value-level round-trip", JSON.stringify(restoreStructured(tsv)) === JSON.stringify(rows))
  const allHighEntropy = compactDelimited(csv(), ",", 0.9)
  check("high entropy drops both varying columns but retains constants", allHighEntropy !== null && JSON.parse(allHighEntropy.slice(allHighEntropy.indexOf("\n") + 1)).d.join(",") === "id,name")
  check("all-high-entropy table restores constants", JSON.stringify(restoreStructured(allHighEntropy)?.[1]) === JSON.stringify(["active", "eu-central-1"]))
  const highEntropy = compactDelimited("id,note,status,region\n" + Array.from({ length: 60 }, (_, i) => `id-${i}-abcdefghijklmnopqrstuvwxyz,repeated note,active,eu-central-1`).join("\n"), ",", 0.9)
  check("high entropy larger table drops id", highEntropy !== null && JSON.parse(highEntropy.slice(highEntropy.indexOf("\n") + 1)).d.join(",") === "id")
  check("dropped columns are excluded from remaining-data comparison", restoreStructured(highEntropy)[0].join(",") === "note,status,region")
  const parsedYaml = parseYamlSubset(yaml())
  check("common YAML manifest parses without external dependency", parsedYaml.items.length === 16 && parsedYaml.items[0].kind === "Pod")
  const packedYaml = compactYaml(yaml())
  check("YAML constants factor and data round-trips", JSON.stringify(restoreStructured(packedYaml)) === JSON.stringify(parsedYaml))
  check("complex YAML is rejected, not guessed", compactYaml("root:\n  child:\n    grandchild: true\n") === null)
  check("YAML aliases/tags/block scalars are rejected", compactYaml("a: &anchor\nb: *anchor\nc: |\n  text\n") === null)
  check("no compression on plain prose", apply(toolBody("This is ordinary prose with: punctuation\n".repeat(20)), ctxFor("chat"), {}) === false)
  const body = toolBody(csv())
  check("tool output actually compresses", apply(body, ctxFor("chat"), {}) === true && body.messages[1].content.length < csv().length)
  check("second pass is a no-op", apply(body, ctxFor("chat"), {}) === false)
  const options = { strategies: Object.fromEntries(ENGINES.map(e => [e.id, e.id === "leanctx-structured"])) }
  const before = toolBody(csv()), after = structuredClone(before)
  const record = runPipeline(after, ctxFor("chat"), options, structuredClone(before))
  check("pipeline round-trip guard passes", record.roundTripsChecked === 1 && record.roundTripsPassed === 1 && record.failOpen === 0)
  check("non-tool text is outside scope", apply({ messages: [{ role: "user", content: csv() }] }, ctxFor("chat"), {}) === false)
  for (const bad of [null, undefined, "", "{bad", "a,b\n1\n"]) {
    let threw = false
    try { restoreStructured(bad) } catch { threw = true }
    check("malformed restore fails explicitly without returning data: " + JSON.stringify(bad), threw || restoreStructured(bad) === null)
  }
}
