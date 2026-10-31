// Trusted Bun companion: compression and telemetry.
// The gateway sandbox intentionally has no filesystem. No private request text is logged by default.
// The in-app page writes magpie options through the bridge; this hook reads the
// same options on every request, so one control surface owns every toggle.
import { createHash, randomUUID } from "node:crypto"
import { runPipeline, clone, byteLength } from "./pipeline.js"
import { conversationView } from "./adapter.js"
import { persist, redact, redactSecrets } from "./telemetry-store.js"
import { record as recordCompression, flush as flushStats, snapshot as statsSnapshot } from "./stats-writer.js"
import { saveCapture, refreshCapturesIndex } from "./capture-store.js"
import { processCaptureCommand, processCcrCommand, processLabCommand, captureCommandId } from "./options-commands.js"
import { createPersistentCcrStore } from "./ccr-store-file.js"

// CCR 跨请求共享 store：引擎换出去的原文在这里活过请求边界，retrieve 工具
// 进程（mcp/ccr-retrieve-server.mjs）读同一份文件兑现 marker。
// 惰性创建：宿主还没起数据目录时不抢跑；首次加载完成前是空 store（fail-open）。
let ccrStore = null
function ccrStoreHandle() {
  if (!ccrStore) ccrStore = createPersistentCcrStore()
  return ccrStore
}

let options = {}
// The page's list is a file beside it, and a host may start long after that file
// was last written (a fresh install, an update that replaced the plugin folder).
// One republish per process closes that gap without touching every request.
let published = false
const hash = text => createHash("sha256").update(text).digest("hex").slice(0, 16)

function finishOptions(ctx) {
  options = ctx.options && typeof ctx.options === "object" ? ctx.options : {}
}
function samplePairs(before, after, protocol) {
  if (options.telemetry?.samples !== true) return []
  const a = conversationView(before, protocol)?.segments || []
  const b = conversationView(after, protocol)?.segments || []
  const samples = []
  for (let i = 0; i < Math.min(a.length, b.length) && samples.length < 6; i++) {
    if (a[i].text === b[i].text) continue
    samples.push({ role: a[i].role, before: redact(a[i].text), after: redact(b[i].text), truncated: a[i].text.length > 1600 || b[i].text.length > 1600 })
  }
  return samples
}


export async function onRequest(body, ctx) {
  try {
    finishOptions(ctx)
    if (options.observability === false) return undefined
    if (ctx.origin === "local") {
      if (!published) {
        published = true
        void refreshCapturesIndex().catch(() => {})
      }
      await processLabCommand(ctx.options)
      await processCaptureCommand(ctx.options)
      await processCcrCommand(ctx.options)
    }
    // Unknown / non-local origins must not export request-derived data.
    if (ctx.origin !== "local") return undefined
    const before = clone(body)
    const working = clone(body)
    const ccr = ccrStoreHandle()
    const record = runPipeline(working, { ...ctx, state: {}, ccrStore: ccr.get(), persistCcrStore: ccr.persist }, options, before)
    record.id = randomUUID()
    record.type = "request"
    record.session = record.session ? `sha256:${hash(record.session)}` : ""
    record.beforeSha256 = createHash("sha256").update(JSON.stringify(before)).digest("hex")
    record.afterSha256 = createHash("sha256").update(JSON.stringify(working)).digest("hex")
    record.samples = samplePairs(before, working, ctx.protocol)
    // telemetry.enabled=false stops recording; compression itself keeps running.
    if (options.telemetry?.enabled !== false) await persist(record)
    // Keep the page's numbers current; a failure here never reaches the caller.
    recordCompression(record)
    // Capture writes the whole conversation to disk and publishes its index into
    // the package's page/ folder, so it is OPT-IN: only an explicit true turns it
    // on. This cannot be `!== false`, because magpie never applies package.json's
    // magpie.options as runtime defaults — that object is only the options editor's
    // starting example (OptionsExample, magpie internal/plugin/middleware.go). A
    // fresh install hands the hooks options:{}, where `undefined !== false` is true:
    // every local request's conversation, code and private notes would land on disk
    // in two places before the operator ever saw a switch. Masking hides credentials
    // only. Telemetry (above) keeps no text and stays on by default; anything that
    // keeps conversation text must not. With capture off the page's session list is
    // simply empty.
    if (options.capture === true) {
      // A capture is the one place the whole conversation is written out, so
      // every credential in it is masked before it reaches disk or the page.
      const beforeText = redactSecrets(conversationView(before, ctx.protocol)?.segments.map((s, i) => `[${i + 1}] [${s.role}] ${s.text}`).join("\n") || "")
      const afterText = redactSecrets(conversationView(working, ctx.protocol)?.segments.map((s, i) => `[${i + 1}] [${s.role}] ${s.text}`).join("\n") || "")
      const captureId = captureCommandId()
      const agent = String(ctx.agent || "").slice(0, 40)
      const meta = { id: captureId, at: record.ts, agent, protocol: ctx.protocol, model: String(ctx.model || "").slice(0, 160), beforeBytes: record.beforeBytes, afterBytes: record.afterBytes, savedBytes: record.savedBytes }
      const snapshotRecord = { ...meta, beforeText, afterText, report: record }
      let saved = await saveCapture(snapshotRecord)
      if (!saved.saved && saved.reason === "too_large") {
        // A conversation over the cap would otherwise vanish from the list with
        // nothing said. Keep the row and its numbers, drop only the text, and mark
        // it so the list says "summary only" instead of offering a diff that is
        // not there.
        saved = await saveCapture({ ...meta, summary: true, beforeText: "", afterText: "" })
      }
      if (saved.saved) {
        const current = statsSnapshot()
        current.captures.unshift({ id: captureId, at: record.ts, agent, protocol: ctx.protocol, model: String(ctx.model || "").slice(0, 160), before: record.beforeBytes, after: record.afterBytes, saved: record.savedBytes, summary: false })
        current.captures = current.captures.slice(0, 50)
      } else {
        const current = statsSnapshot()
        current.captures.unshift({ id: captureId, at: record.ts, agent, protocol: ctx.protocol, model: String(ctx.model || "").slice(0, 160), before: record.beforeBytes, after: record.afterBytes, saved: record.savedBytes, summary: true, reason: saved.reason })
        current.captures = current.captures.slice(0, 50)
      }
      await flushStats(true)
    }
    ctx.state.magpieCompressCoreRequestId = record.id
    Object.assign(body, working)
    ctx.report?.("ready", record.savedBytes)
    return body
  } catch (error) {
    await persist({ type: "fail_open", ts: new Date().toISOString(), stage: "bun_onRequest", error: String(error?.message || error).slice(0, 160) })
    console.error("compress-core: Bun companion failed; moejs fallback remains active:", error.message)
    return undefined
  }
}
export async function onResponse(reply, ctx) {
  try {
    if (options.telemetry?.enabled === false) return
    const id = ctx.state.magpieCompressCoreRequestId
    if (!id) return
    delete ctx.state.magpieCompressCoreRequestId
    await persist({ type: "response", id, ts: new Date().toISOString(), status: ctx.success ? 200 : null, success: !!ctx.success })
  } catch { /* notification is best effort */ }
}
