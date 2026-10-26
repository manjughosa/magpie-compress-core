// Observability, real round-trip, Bun -> moejs handoff and loopback API tests.
import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { check } from "./helpers.mjs"
import { ENGINES } from "../catalog.js"
import { runPipeline, clone, INTERNAL_MARKER } from "../pipeline.js"
import { summarize, readEvents } from "../telemetry-store.js"
import * as middleware from "../compress-core.middleware.js"
import * as hooks from "../observability.hooks.js"

export const name = "observability"
const block = Array.from({ length: 6 }, (_, i) => `stable diagnostic line ${i} ${"x".repeat(28)}`).join("\n")
// ccr 是 defaultOn:true 的引擎：不显式列 false 它就会跑，破坏下面 "全部 disabled" 的断言。
const allOff = { strategies: Object.fromEntries(ENGINES.map((e) => [e.id, false])) }
const dedupOnly = { strategies: { ...allOff.strategies, "session-dedup": true } }
const headroomOnly = { strategies: { ...allOff.strategies, headroom: true } }
function repeatedBody(model = "observe-test") {
  return { model, messages: [{ role: "system", content: "answer briefly" }, { role: "user", content: block }, { role: "user", content: block }, { role: "assistant", content: "I have read the repeated diagnostic lines." }, { role: "user", content: "continue" }] }
}
function jsonBody() {
  const rows = Array.from({ length: 12 }, (_, i) => ({ id: i, name: `a-long-user-name-${i}`, active: i % 2 === 0, score: i * 1.5 }))
  return { model: "json-test", messages: [{ role: "assistant", content: JSON.stringify(rows, null, 2) }, { role: "user", content: "continue" }] }
}

export async function run() {
  {
    const body = repeatedBody(), original = clone(body), ctx = { protocol: "chat", state: {} }
    const record = runPipeline(body, ctx, allOff, clone(body))
    assert.deepEqual(body, original)
    assert.equal(record.savedBytes, 0)
    // unavailable（如依赖 ONNX/npm 的 llm）也是没跑，同样算"没动 body"。
    assert.ok(record.strategies.every(s => s.reason === "disabled" || s.reason === "unavailable"))
    check("OBS-01 全停用时字节完全不变", true)
  }
  {
    const body = repeatedBody(), before = clone(body), ctx = { protocol: "chat", state: {} }
    const record = runPipeline(body, ctx, dedupOnly, before)
    assert.ok(record.savedBytes > 0)
    assert.ok(record.roundTripsChecked > 0)
    assert.equal(record.roundTripsPassed, record.roundTripsChecked)
    assert.equal(record.failOpen, 0)
    check("OBS-02 dedup 实际还原映射逐段相等", true)
  }
  {
    const body = jsonBody(), before = clone(body), ctx = { protocol: "chat", state: {} }
    const record = runPipeline(body, ctx, headroomOnly, before)
    assert.ok(record.savedBytes > 0)
    assert.ok(record.roundTripsChecked > 0)
    assert.equal(record.roundTripsPassed, record.roundTripsChecked)
    assert.equal(record.failOpen, 0)
    check("OBS-03 headroom GCF 解码语义相等", true)
  }
  {
    const body = repeatedBody(), marked = clone(body)
    marked[INTERNAL_MARKER] = { version: 1 }
    const out = middleware.onRequest(marked, { protocol: "chat", options: dedupOnly, state: {} }) || marked
    assert.equal(out[INTERNAL_MARKER], undefined)
    assert.deepEqual(out, body)
    check("OBS-04 Bun 已压缩时 moejs 只去内部标记，不重复执行", true)
  }
  {
    const body = repeatedBody()
    const out = middleware.onRequest(body, { protocol: "chat", options: dedupOnly, state: {} }) || body
    assert.ok(JSON.stringify(out).includes("[dedup:ref sha="))
    assert.equal(out[INTERNAL_MARKER], undefined)
    check("OBS-05 无 Bun 标记时 moejs 独立压缩兜底", true)
  }
  {
    const summary = summarize([{ type: "fail_open", ts: new Date().toISOString(), stage: "bun_onRequest", error: "test" }], allOff)
    assert.equal(summary.periods.today.failOpen, 1)
    check("OBS-06 Bun 伴随层 fail-open 也进入聚合", true)
  }
  {
    const unknown = repeatedBody(), ctx = { protocol: "chat", state: {}, options: dedupOnly }
    assert.equal(await hooks.onRequest(unknown, ctx), undefined)
    check("OBS-06b 未知来源不由 Bun 伴随层导出遥测", true)
  }
  {
    const record = runPipeline(repeatedBody(), { protocol: "chat", state: {} }, dedupOnly, repeatedBody())
    record.type = "fail_open"
    const summary = summarize([record], dedupOnly)
    assert.equal(summary.periods.today.failOpen, 1)
  }
  {
    const dir = await mkdtemp(join(tmpdir(), "compress-core-observe-"))
    process.env.COMPRESS_CORE_DATA_DIR = dir
    const port = 44320
    const options = { ...dedupOnly, observability: true, telemetry: { enabled: true, port, samples: false } }
    const body = repeatedBody("echo-test")
    const ctx = { protocol: "chat", model: "echo-test", agent: "node-test", session: "raw-session-id", origin: "local", state: {}, options }
    const out = await hooks.onRequest(body, ctx)
    assert.ok(out)
    assert.ok(out[INTERNAL_MARKER])
    const compressed = JSON.stringify(out)
    await hooks.onResponse({}, { ...ctx, success: true })
    const events = await readEvents()
    const request = events.find(e => e.type === "request")
    assert.ok(request)
    assert.equal(request.samples.length, 0)
    assert.ok(request.session.startsWith("sha256:"))
    assert.ok(!JSON.stringify(events).includes(block))
    assert.ok(!JSON.stringify(events).includes("raw-session-id"))
    assert.ok(request.beforeSha256 && request.afterSha256 && request.beforeSha256 !== request.afterSha256)
    const cleaned = middleware.onRequest(out, ctx) || out
    assert.equal(cleaned[INTERNAL_MARKER], undefined)
    assert.equal(JSON.stringify(cleaned), compressed.replace(/,"__magpieCompressCore":\{"version":1\}/, ""))
    check("OBS-07 Bun真管线→JSONL→响应→moejs清理，默认无原文", true)

    const sampleOptions = { ...options, telemetry: { enabled: true, port, samples: true } }
    const secretBlock = block + "\ncontact person@example.com token_abcdefghijklmnopqrstuvwxyz C:\\Users\\name\\secret.txt"
    const sampleBody = { model: "sample-test", messages: [{ role: "user", content: secretBlock }, { role: "user", content: secretBlock }, { role: "assistant", content: "ack" }, { role: "user", content: "continue" }] }
    const sampleCtx = { protocol: "chat", model: "sample-test", origin: "local", options: sampleOptions, state: {} }
    await hooks.onRequest(sampleBody, sampleCtx)
    const raw = await readFile(join(dir, "requests.jsonl"), "utf8")
    assert.ok(!raw.includes("person@example.com"))
    assert.ok(!raw.includes("token_abcdefghijklmnopqrstuvwxyz"))
    assert.ok(!raw.includes("secret.txt"))
    assert.ok(raw.includes("[email]"))
    check("OBS-09 显式样本仍限长并脱敏", true)
  }
  // OBS-10: failOpen aggregation must not count failOpen:0 requests as failures.
  {
    const summary = summarize([
      { type: "request", ts: new Date().toISOString(), failOpen: 0, savedBytes: 10, beforeBytes: 100, afterBytes: 90, strategies: [] },
      { type: "fail_open", ts: new Date().toISOString() },
    ], allOff)
    assert.equal(summary.periods.today.failOpen, 1)
    const clean = summarize([{ type: "request", ts: new Date().toISOString(), failOpen: 0, savedBytes: 0, beforeBytes: 5, afterBytes: 5, strategies: [] }], allOff)
    assert.equal(clean.periods.today.failOpen, 0)
    check("OBS-10 failOpen:0 不再被 || 1 聚合为失败", true)
  }
}
