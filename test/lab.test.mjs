import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"
import { conversationText, MAX_LAB_BYTES, runLab } from "../lab.js"

export const name = "lab"

const bodies = {
  chat: { model: "lab", messages: [{ role: "user", content: "a  \n\n\nb" }] },
  anthropic: { model: "lab", messages: [{ role: "user", content: [{ type: "text", text: "a  \n\n\nb" }] }] },
  responses: { model: "lab", input: [{ role: "user", content: [{ type: "input_text", text: "a  \n\n\nb" }] }] },
  gemini: { model: "lab", contents: [{ role: "user", parts: [{ text: "a  \n\n\nb" }] }] },
}

async function rejects(promise, pattern) {
  await assert.rejects(promise, error => error instanceof Error && pattern.test(error.message))
}

export async function run() {
  const text = await runLab({ id: "lab-text-001", mode: "text", input: "a  \n\n\nb", protocol: "chat", strategy: "lite" }, {
    strategies: Object.fromEntries(["lite", "ccr", "headroom"].map(id => [id, true])),
    preserveSystemPrompt: false,
  })
  assert.equal(text.ok, true)
  assert.equal(text.error, null)
  assert.equal(text.strategy, "lite")
  assert.deepEqual(text.before, { model: "lab", messages: [{ role: "user", content: "a  \n\n\nb" }] })
  assert.equal(text.after.messages[0].content, "a\n\nb")
  assert.equal(text.beforeText.includes("[user]"), true)
  assert.equal(text.afterText.includes("a\n\nb"), true)
  assert.equal(Object.hasOwn(text.after, "__magpieCompressCore"), false)
  assert.ok(text.report)
  assert.equal(text.report.protocol, "chat")
  assert.equal(text.report.strategies.filter(item => item.enabled).length, 1)
  assert.equal(text.report.strategies.find(item => item.enabled).id, "lite")

  for (const protocol of Object.keys(bodies)) {
    const result = await runLab({ id: `lab-${protocol}-001`, mode: "json", input: JSON.stringify(bodies[protocol]), protocol, strategy: "lite" })
    assert.equal(result.ok, true, protocol)
    assert.equal(result.protocol, protocol)
    if (protocol === "chat") assert.notEqual(result.afterText, result.beforeText, protocol)
    else assert.equal(typeof result.afterText, "string")
    assert.equal(result.report.strategies.filter(item => item.enabled).length, 1)
    assert.equal(result.report.strategies.find(item => item.enabled).id, "lite")
  }

  const rendered = conversationText({ messages: [
    { role: "user", content: "question" },
    { role: "tool", tool_call_id: "call-1", content: "result" },
  ] }, "chat")
  assert.match(rendered, /\[#1\] \[user\] question/)
  assert.match(rendered, /\[#2\] \[tool\] \[tool\] result/)
  assert.equal(conversationText({}, "unknown"), "")

  await rejects(runLab({ id: "lab-bad-json", mode: "json", input: "{", protocol: "chat", strategy: "lite" }), /JSON/)
  await rejects(runLab({ id: "lab-json-array", mode: "json", input: "[]", protocol: "chat", strategy: "lite" }), /对象/)
  await rejects(runLab({ id: "lab-bad-strategy", mode: "text", input: "x", protocol: "chat", strategy: "missing" }), /策略/)
  await rejects(runLab({ id: "lab-bad-protocol", mode: "text", input: "x", protocol: "other", strategy: "lite" }), /protocol/)
  await rejects(runLab({ id: "lab-too-large", mode: "text", input: "界".repeat(MAX_LAB_BYTES), protocol: "chat", strategy: "lite" }), /字节/)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await run()
