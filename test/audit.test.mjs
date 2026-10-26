import assert from "node:assert/strict"
import { mkdtemp, readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { check } from "./helpers.mjs"
import { runLab } from "../lab.js"
import { saveCapture, readCapture, clearCaptures } from "../capture-store.js"
import { processCaptureCommand, processLabCommand } from "../options-commands.js"
import { snapshot, flush } from "../stats-writer.js"
import { onRequest } from "../observability.hooks.js"

export const name = "audit"
export async function run() {
  const dir = await mkdtemp(join(tmpdir(), "compress-audit-"))
  const old = process.env.COMPRESS_CORE_DATA_DIR
  const oldConfig = process.env.MAGPIE_CONFIG_DIR
  process.env.COMPRESS_CORE_DATA_DIR = dir
  process.env.MAGPIE_CONFIG_DIR = dir
  const { writeFile } = await import("node:fs/promises")
  await writeFile(join(dir, "plugins.json"), JSON.stringify({ plugins: [{ spec: "compress-core", options: { strategies: { lite: true } } }] }))
  try {
    const input = "Please please please retain every fact.\n".repeat(6)
    const result = await runLab({ id: "text-test", mode: "text", input, protocol: "chat", strategy: "lite" }, {})
    assert.equal(result.ok, true)
    assert.ok(result.beforeText.endsWith(input))
    assert.ok(result.report.afterBytes > 0)
    assert.ok(result.report.afterBytes > 0)
    const json = await runLab({ id: "json-test", mode: "json", input: JSON.stringify({ model: "m", messages: [{ role: "user", content: input }] }), protocol: "chat", strategy: "lite" }, {})
    assert.ok(json.report.afterBytes > 0)
    assert.ok(json.after.messages)
    check("AUDIT-01 text/JSON 单策略试压与结构检查", true)

    const before = { model: "m", messages: [{ role: "user", content: input }] }
    const after = { model: "m", messages: [{ role: "user", content: input.slice(0, 25) }] }
    for (let i = 0; i < 50; i++) await saveCapture({ id: `capture-${String(i).padStart(2, "0")}`, before, after, beforeText: input, afterText: input.slice(0, 25) })
    await saveCapture({ id: "capture-50", before, after, beforeText: input, afterText: input.slice(0, 25) })
    assert.equal(await readCapture("capture-00"), null)
    assert.equal((await readCapture("capture-50")).after.messages[0].content, input.slice(0, 25))
    await clearCaptures()
    assert.equal(await readCapture("capture-50"), null)
    assert.equal(await readCapture("capture-49"), null)
    check("AUDIT-02 快照包含完整 after，50 条封顶，删除/清空生效", true)

    const oldOptions = snapshot().options
    assert.ok(await processLabCommand({ labCommand: { id: "cmd-lab", action: "test", request: { id: "req-lab", mode: "text", input, strategy: "lite", protocol: "chat" } } }))
    const saved = JSON.parse(await readFile(join(dir, "plugins.json"), "utf8")).plugins[0].options
    assert.equal(saved.labResult.status, "done")
    assert.equal(saved.labResult.result.strategy, "lite")
    assert.equal(saved.labCommand, undefined)
    assert.deepEqual(saved.strategies, { lite: true })
    assert.equal(await processLabCommand({ labCommand: { id: "cmd-lab", action: "test", request: { id: "req-lab", mode: "text", input, strategy: "lite", protocol: "chat" } } }), false)
    assert.deepEqual(snapshot().options, oldOptions)
    check("AUDIT-03 本地命令不污染其他选项，重复请求只执行一次", true)

    const requestOptions = JSON.parse(await readFile(join(dir, "plugins.json"), "utf8")).plugins[0].options
    const repeat = Array.from({ length: 40 }, (_, i) => `Audit line ${i}: repeated block.`).join("\n")
    const hookCtx = {
      protocol: "chat", model: "provider/" + "m".repeat(220), stream: false,
      path: "/v1/chat/completions", origin: "local", agent: "audit-test",
      session: "audit-test", query: "Latest stays.", options: requestOptions,
      state: {}, signal: new AbortController().signal, report() {},
    }
    const beforeHook = { model: "m", messages: [
      { role: "system", content: "Audit." }, { role: "user", content: repeat },
      { role: "assistant", content: "Reply." }, { role: "user", content: repeat },
      { role: "assistant", content: "Reply again." }, { role: "user", content: repeat },
      { role: "user", content: "Latest stays." },
    ] }
    // Only this isolated hook test writes; its config root is the temp dir.
    const oldNoStats = process.env.COMPRESS_CORE_NO_STATS
    delete process.env.COMPRESS_CORE_NO_STATS
    let afterHook
    try {
      afterHook = await onRequest(beforeHook, hookCtx)
      await flush(true)
    } finally {
      if (oldNoStats === undefined) delete process.env.COMPRESS_CORE_NO_STATS
      else process.env.COMPRESS_CORE_NO_STATS = oldNoStats
    }
    const diskOptions = JSON.parse(await readFile(join(dir, "plugins.json"), "utf8")).plugins[0].options
    // Prior capture commands create a baseline; the important invariant is
    // that the new hook capture is also persisted, not an absolute list size.
    assert.ok(diskOptions.stats.captures.some(r => r.id === snapshot().captures.at(-1).id))
    assert.equal(afterHook.messages.at(-1).content, "Latest stays.")
    assert.ok(snapshot().captures[0].model.length <= 160)
    const storedHook = await readCapture(snapshot().captures[0].id)
    assert.ok(storedHook.afterText.includes("Latest stays."))
    check("AUDIT-04 真实钩子保存完整快照、写回索引且保留最新提问", true)
  } finally {
    if (old === undefined) delete process.env.COMPRESS_CORE_DATA_DIR
    else process.env.COMPRESS_CORE_DATA_DIR = old
    if (oldConfig === undefined) delete process.env.MAGPIE_CONFIG_DIR
    else process.env.MAGPIE_CONFIG_DIR = oldConfig
  }
}
