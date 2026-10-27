// Trusted Bun companion: compression and telemetry.
// The gateway sandbox intentionally has no filesystem. No private request text is logged by default.
// The in-app page writes magpie options through the bridge; this hook reads the
// same options on every request, so one control surface owns every toggle.
import { createHash, randomUUID } from "node:crypto"
import { runPipeline, clone, byteLength, INTERNAL_MARKER, removeInternalMarker } from "./pipeline.js"
import { conversationView } from "./adapter.js"
import { persist, redact, redactSecrets } from "./telemetry-store.js"
import { record as recordCompression, flush as flushStats, snapshot as statsSnapshot } from "./stats-writer.js"
import { saveCapture } from "./capture-store.js"
import { processCaptureCommand, processLabCommand, captureCommandId } from "./options-commands.js"

let options = {}
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
      await processLabCommand(ctx.options)
      await processCaptureCommand(ctx.options)
    }
    // Unknown / non-local origins must not export request-derived data.
    if (ctx.origin !== "local") return undefined
    const before = clone(body)
    const working = clone(body)
    const record = runPipeline(working, { ...ctx, state: {} }, options, before)
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
    // Capture stores the full conversation text on disk and republishes it to
    // the page, so it stays off unless the operator asks for it explicitly.
    // The page's session list is built from these snapshots, so with capture
    // off that list is simply empty — the intended default.
    if (options.capture === true) {
      // A capture is the one place the whole conversation is written out, so
      // every credential in it is masked before it reaches disk or the page.
      const beforeText = redactSecrets(conversationView(before, ctx.protocol)?.segments.map((s, i) => `[${i + 1}] [${s.role}] ${s.text}`).join("\n") || "")
      const afterText = redactSecrets(conversationView(working, ctx.protocol)?.segments.map((s, i) => `[${i + 1}] [${s.role}] ${s.text}`).join("\n") || "")
      const captureId = captureCommandId()
      const agent = String(ctx.agent || "").slice(0, 40)
      const snapshotRecord = { id: captureId, at: record.ts, agent, protocol: ctx.protocol, model: String(ctx.model || "").slice(0, 160), beforeText, afterText, beforeBytes: record.beforeBytes, afterBytes: record.afterBytes, savedBytes: record.savedBytes, report: record }
      let saved = await saveCapture(snapshotRecord)
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
    body[INTERNAL_MARKER] = { version: 1 }
    Object.assign(body, working)
    removeInternalMarker(body)
    body[INTERNAL_MARKER] = { version: 1 }
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
