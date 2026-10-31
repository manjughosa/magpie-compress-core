// test/performance.test.mjs — every engine must scale linearly on pathological input.
//
// The lite quadratic bug shipped because nothing timed an engine. A loose absolute
// bound is not enough (the old lite took ~700ms at 40k, under any generous cap), so
// each case runs at half and full size and the full run must not take ~4x as long as
// the half run. The inputs are the ones the review used to expose quadratic regexes:
// long space runs, "\n \n" repetition, and "a." sentences.
import { check } from "./helpers.mjs"
import { REGISTRY } from "../engines/index.js"

export const name = "performance"

const CAP_MS = 3000 // a hard stop so a runaway regex cannot hang the suite forever
const CASES = [
  { label: "40k spaces + a", n: 40000, make: (n) => " ".repeat(n) + "a" },
  { label: "\\n \\n × 20k", n: 20000, make: (n) => "\n \n".repeat(n) },
  { label: "a. × 30k", n: 30000, make: (n) => "a.".repeat(n) },
]

function timeOnce(engine, content) {
  const body = { model: "m", messages: [{ role: "user", content }] }
  const t0 = Date.now()
  try { engine.apply(body, { protocol: "chat", state: {} }, { requireRetrieveTool: false }) } catch { /* fail-open is fine */ }
  return Date.now() - t0
}

export function run() {
  for (const [id, eng] of REGISTRY) {
    for (const c of CASES) {
      const full = timeOnce(eng, c.make(c.n))
      const half = timeOnce(eng, c.make(Math.floor(c.n / 2)))
      const label = id + " · " + c.label
      check(label + " 线性（全量不超过半量 3 倍 + 50ms）", full <= half * 3 + 50, `half=${half}ms full=${full}ms`)
      check(label + " 未失控", full < CAP_MS, full + "ms")
    }
  }
}
