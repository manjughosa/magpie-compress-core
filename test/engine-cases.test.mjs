// test/engine-cases.test.mjs — 每个引擎一条契约。
//
// 用例在 test/fixtures/engine-cases.json：会动手的引擎存压完的 body（golden），
// 不该动手的引擎存 "unchanged"。这些锁的是**当前行为**，不是正确性的证明；
// 但它保证任何一次改动都能说清「哪个引擎在哪份输入上变了」。
//
// 新增引擎时：往 fixture 里加一条，这里不用改。

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"
import { engineModule } from "../engines/index.js"

const here = dirname(fileURLToPath(import.meta.url))
const doc = JSON.parse(readFileSync(join(here, "fixtures", "engine-cases.json"), "utf8"))

const copy = (v) => JSON.parse(JSON.stringify(v))
const show = (v) => JSON.stringify(v)

export const name = "engine cases (one contract per engine)"

export async function run() {
  for (const c of doc.cases) {
    const engine = engineModule(c.engine)
    check(`${c.engine}: registered`, !!engine)
    if (!engine) continue
    const input = copy(c.use === "input" ? doc.input : c.request)
    const body = copy(input)
    const changed = engine.apply(body, { protocol: "chat", state: {} }, copy(c.options ?? {}))

    if (c.expect === "unchanged") {
      check(`${c.engine}: leaves it alone`, changed === false && show(body) === show(input), c.why)
      continue
    }
    check(`${c.engine}: changes it`, changed === true, c.why)
    check(`${c.engine}: same body as the fixture`, show(body) === show(c.expect_request), c.why)
  }
}
