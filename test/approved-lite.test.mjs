// test/approved-lite.test.mjs — the lite engine against the case file the
// gateway maintainer reviewed and merged (magpie-community/plugins PR #423,
// packages/history-trim/cases.json at the merge commit).
//
// The point is not "our own tests pass": it is that on the same 21 inputs,
// sending the same body through lite.apply leaves exactly the body that
// build's middleware left. Anything this file fails is a place where the
// local engine and the reviewed one disagree, and the reviewed one wins.
//
// The cases go in through apply() — the adapter that rewrites the body in
// place — not through the pure helpers, because that is the shape the gateway
// actually calls.

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"
import { apply } from "../engines/lite.js"

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, "fixtures", "approved-lite-cases.json"), "utf8"))

const copy = (v) => JSON.parse(JSON.stringify(v))
const show = (v) => JSON.stringify(v)

export const name = "approved lite cases (history-trim #423)"

export async function run() {
  for (const c of cases) {
    const body = copy(c.request)
    const options = c.options ?? {}
    const changed = apply(body, { protocol: c.ctx?.protocol, state: {} }, options)
    const got = changed ? body : c.request
    const want = c.expect_request ?? c.request
    const ok = show(got) === show(want)
    check(c.name, ok, ok ? "" : `\n      want ${show(want).slice(0, 400)}\n      got  ${show(got).slice(0, 400)}`)
  }
}
