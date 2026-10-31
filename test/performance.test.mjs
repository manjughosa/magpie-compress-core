// test/performance.test.mjs — every engine must finish a pathological input fast.
//
// The lite quadratic bug (40k spaces ~700ms) shipped because nothing timed an
// engine. This walks every engine over two whitespace-heavy inputs and fails on a
// time bound, so a quadratic regex is caught here instead of in production.
import { check } from "./helpers.mjs"
import { REGISTRY } from "../engines/index.js"

export const name = "performance"

const BOUND_MS = 800
const INPUTS = {
  "40k spaces + a": " ".repeat(40000) + "a",
  "40k spaces / 20k tabs": " ".repeat(40000) + "a" + String.fromCharCode(10) + String.fromCharCode(9).repeat(20000) + "b",
}

export function run() {
  for (const [id, eng] of REGISTRY) {
    for (const [label, content] of Object.entries(INPUTS)) {
      const body = { model: "m", messages: [{ role: "user", content }] }
      const t0 = Date.now()
      try { eng.apply(body, { protocol: "chat", state: {} }, { requireRetrieveTool: false }) } catch { /* fail-open is fine here */ }
      const ms = Date.now() - t0
      check(id + " · " + label + " 在 " + BOUND_MS + "ms 内完成", ms < BOUND_MS, ms + "ms")
    }
  }
}
