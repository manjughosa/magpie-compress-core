// 清空日志是两条命令里更危险那条：它删的是 requests.jsonl 的两代文件，并且
// 把累计计数归零。三个断言缺一不可 —— 文件真的没了、磁盘上的计数真的归零、
// 同一个 id 不会因为宿主重载再清一次（否则每次 options 变更都会把日志扫一遍）。
import assert from "node:assert/strict"
import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"

export const name = "telemetry-command"
const root = await mkdtemp(join(tmpdir(), "compress-core-telemetry-"))

const exists = (p) => stat(p).then(() => true, () => false)

export async function run() {
  process.env.COMPRESS_CORE_DATA_DIR = root
  process.env.COMPRESS_CORE_NO_PUBLISH = "1"
  // 不设 COMPRESS_CORE_NO_STATS：本套要验的正是 stats.json 被改写。
  const stats = await import("../stats-writer.js")

  // 造一份"跑过一段时间"的环境：两代日志 + 一些累计计数。
  await writeFile(join(root, "requests.jsonl"), '{"type":"request"}\n')
  await writeFile(join(root, "requests.jsonl.1"), '{"type":"request"}\n')
  stats.record({ beforeBytes: 1000, afterBytes: 400, estimatedBeforeTokens: 250, estimatedAfterTokens: 100, strategies: [{ id: "ccr", enabled: true, savedBytes: 600 }] })
  await stats.flush(true)
  const before = JSON.parse(await readFile(join(root, "stats.json"), "utf8"))
  assert.ok(before.requests >= 1, "前置条件：stats.json 里应当有计数")
  check("TEL-00 前置：两代日志与累计计数都在", true)

  const command = { id: "telemetry-fixed-0001", action: "clear" }
  const host1 = await import("../options-commands.js?host=t1")
  assert.equal(await host1.processTelemetryCommand({ telemetryCommand: command }), true)
  check("TEL-01 清空命令返回成功", true)

  assert.equal(await exists(join(root, "requests.jsonl")), false)
  assert.equal(await exists(join(root, "requests.jsonl.1")), false)
  check("TEL-02 requests.jsonl 与 .1 都被删掉", true)

  const after = JSON.parse(await readFile(join(root, "stats.json"), "utf8"))
  assert.equal(after.requests, 0)
  assert.equal(after.savedBytes, 0)
  assert.equal(after.recent.length, 0)
  assert.deepEqual(after.strategies, {})
  check("TEL-03 磁盘上的累计计数归零", true)

  const journal = JSON.parse(await readFile(join(root, "commands.json"), "utf8"))
  assert.equal(journal.telemetryCommand.id, command.id)
  assert.equal(journal.telemetryCommand.status, "done")
  check("TEL-04 命令落盘留痕", true)

  // 重放：宿主随 options 变更重启，同一个 id 又会被交到新宿主手上。
  await writeFile(join(root, "requests.jsonl"), '{"type":"request"}\n')
  const host2 = await import("../options-commands.js?host=t2")
  assert.equal(await host2.processTelemetryCommand({ telemetryCommand: command }), true)
  assert.ok(await exists(join(root, "requests.jsonl")), "同一个 id 不该再清一次")
  check("TEL-05 同一条命令不因宿主重载重放", true)

  // 新 id 必须仍然生效，别把去重做成"清空永远失败"。
  const next = { id: "telemetry-fixed-0002", action: "clear" }
  assert.equal(await host2.processTelemetryCommand({ telemetryCommand: next }), true)
  assert.equal(await exists(join(root, "requests.jsonl")), false)
  check("TEL-06 新的命令仍然生效", true)

  // action 不认识就当没这回事，不能顺手清。
  await writeFile(join(root, "requests.jsonl"), '{"type":"request"}\n')
  assert.equal(await host2.processTelemetryCommand({ telemetryCommand: { id: "telemetry-fixed-0003", action: "nope" } }), false)
  assert.ok(await exists(join(root, "requests.jsonl")))
  check("TEL-07 未知 action 不动数据", true)
}

if (typeof Bun === "undefined" && process.argv[1] === fileURLToPath(import.meta.url)) await run()