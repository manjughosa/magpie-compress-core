// test/gateway-cases.test.mjs — 包根 cases.json 的 21 条，按 magpie 网关的调用形态跑：
// ctx.options 就是插件 options，body 是请求 JSON 的一份拷贝，onRequest 的返回值
// undefined 表示「没动，原样发」。
//
// 这些用例与 history-trim (#423) 的 cases.json 逐字一致，所以这套测试回答的是一个
// 具体问题：同一份输入，经过我们的中间件之后，body 和那份被合并的实现留下的 body
// 是不是同一个。不同就说明两边的语义还有分叉。

import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"
import { onRequest } from "../compress-core.middleware.js"

const here = dirname(fileURLToPath(import.meta.url))
const cases = JSON.parse(readFileSync(join(here, "..", "cases.json"), "utf8"))

const copy = (v) => JSON.parse(JSON.stringify(v))
const show = (v) => JSON.stringify(v)

export const name = "gateway cases (cases.json)"

export async function run() {
  for (const c of cases) {
    const ctx = {
      protocol: "anthropic",
      model: "",
      stream: false,
      path: "",
      ...(c.ctx ?? {}),
      options: c.options ?? {},
      state: {},
      reject() {},
    }
    const out = onRequest ? onRequest(copy(c.request), ctx) : undefined
    const got = out === undefined ? c.request : copy(out)
    const want = c.expect_request ?? c.request
    const ok = show(got) === show(want)
    check(c.name, ok, ok ? "" : `\n      want ${show(want).slice(0, 300)}\n      got  ${show(got).slice(0, 300)}`)
  }
}
