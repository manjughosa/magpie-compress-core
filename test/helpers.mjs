// test/helpers.mjs — shared test utilities (runs in Node, not moejs).
import { conversationView } from "../adapter.js"

export function ctxFor(protocol, options = {}) {
  return { protocol, options, state: {} }
}

export function estTokens(text) {
  return Math.ceil(text.length / 4)
}

export function bodyChars(body) {
  return JSON.stringify(body).length
}

// Build an OpenAI chat-completions body from simple [{role, text}] entries.
export function chatBody(entries, model = "bench-model") {
  return {
    model,
    messages: entries.map((e) => ({ role: e.role, content: e.text })),
  }
}

// Run the middleware's onRequest and measure the effect.
export function runMiddleware(middleware, body, protocol, options = {}) {
  const before = bodyChars(body)
  const t0 = process.hrtime.bigint()
  const out = middleware.onRequest(body, ctxFor(protocol, options)) ?? body
  const ms = Number(process.hrtime.bigint() - t0) / 1e6
  const after = bodyChars(out)
  return { out, before, after, saved: before - after, pct: ((before - after) / before) * 100, ms }
}

// Re-extract segments from the (possibly mutated) body to verify integrity.
export function segmentsOf(body, protocol) {
  const view = conversationView(body, protocol)
  return view ? view.segments : []
}

let failures = 0
export function check(name, cond, detail = "") {
  if (cond) {
    console.log(`  ok    ${name}`)
  } else {
    failures++
    console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`)
  }
}
export function failedCount() {
  return failures
}
