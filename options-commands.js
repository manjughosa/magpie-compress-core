// Page sandbox <-> Bun file channel. Commands run on a subsequent local request;
// a result never replaces unrelated strategies or settings.
import { randomUUID } from "node:crypto"
import { execFile } from "node:child_process"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { runLab } from "./lab.js"
import { clearCaptures } from "./capture-store.js"
import { clearCaptureIndex, flush } from "./stats-writer.js"
import { redactSecrets, telemetryDir } from "./telemetry-store.js"
import { publishPageScript } from "./page-publish.js"

// Command results go into this plugin's own file, not magpie's plugins.json:
// a lab result carries the text the operator pasted plus the full request body,
// and a settings file is the wrong place for either. Both are masked before they
// land on disk, and a result too large to be worth storing keeps only the report.
const LAB_RESULT_LIMIT = 2_000_000

// Results the page used to read back through `magpie.options`. A page cannot
// read a file (connect-src 'none'), so it no longer shows a lab result inline:
// it points at this file instead.
const commandsFile = () => join(telemetryDir(), "commands.json")

function maskDeep(value) {
  if (typeof value === "string") return redactSecrets(value)
  if (Array.isArray(value)) return value.map(maskDeep)
  if (value && typeof value === "object") {
    const out = {}
    for (const [key, item] of Object.entries(value)) out[key] = maskDeep(item)
    return out
  }
  return value
}

export function maskLabResult(result) {
  if (!result || typeof result !== "object") return result
  const masked = maskDeep(result)
  if (JSON.stringify(masked).length <= LAB_RESULT_LIMIT) return masked
  return { ...masked, before: null, after: null, truncated: true }
}

let queue = Promise.resolve()
const completed = new Set()
function remember(id) {
  completed.add(id)
  if (completed.size > 128) completed.delete(completed.values().next().value)
}
const later = task => {
  const result = queue.then(task, task)
  queue = result.catch(() => {})
  return result
}

// Read-modify-write this plugin's own command file. magpie's settings file is
// never opened: writing it fought magpie's lock and restarted the hooks host on
// every change.
async function patch(fields) {
  const path = commandsFile()
  const tmp = path + ".tmp"
  let doc = {}
  try {
    const text = await readFile(path, "utf8")
    if (text.length <= LAB_RESULT_LIMIT) doc = JSON.parse(text)
  } catch {
    // No file yet: start from an empty document.
  }
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) doc = {}
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) delete doc[key]
    else doc[key] = value
  }
  await mkdir(telemetryDir(), { recursive: true })
  await writeFile(tmp, JSON.stringify(doc, null, 2) + "\n")
  await rename(tmp, path)
  return true
}

// A command's status is journalled to this file, so the same id runs once even
// though the host that ran it is gone. magpie starts the hooks host again on any
// options change and `options.captureCommand` still holds the last command it was
// given — without this record a single "clear" would empty the operator's list on
// every restart.
async function alreadyDone(id) {
  try {
    const text = await readFile(commandsFile(), "utf8")
    if (text.length > LAB_RESULT_LIMIT) return false
    const doc = JSON.parse(text)
    return doc?.captureCommand?.id === id && doc.captureCommand.status === "done"
  } catch {
    return false
  }
}

export function processCaptureCommand(options) {
  const command = options?.captureCommand
  if (!command || typeof command.id !== "string" || command.id.length > 80 || completed.has(command.id)) return false
  remember(command.id)
  return later(async () => {
    // The journal is the only record that survives a restart: a command already
    // marked done must not run again, or a clear replays forever.
    if (await alreadyDone(command.id)) return true
    let success = false
    try {
      await flush(true)
      if (command.action === "clear") {
        await clearCaptures()
        clearCaptureIndex()
        await flush(true)
      }
      await patch({ captureCommand: { id: command.id, action: command.action, status: "done" } })
      success = true
    } catch (error) {
      await patch({ captureCommand: { id: command.id, action: command.action, status: "error", error: error.message } }).catch(() => {})
    }
    return success
  })
}

export function processLabCommand(options) {
  const command = options?.labCommand
  if (!command || typeof command.id !== "string" || command.id.length > 80 || completed.has(command.id)) return false
  remember(command.id)
  if (command.action !== "test") return false
  return later(async () => {
    let success = false
    try {
      const result = await runLab(command.request, options)
      await patch({ labResult: { id: command.id, status: "done", result: maskLabResult(result) }, labCommand: undefined })
      success = true
    } catch (error) {
      await patch({ labResult: { id: command.id, status: "error", error: error.message } }).catch(() => {})
    }
    return success
  })
}

export function captureCommandId() { return `capture-${randomUUID()}` }

// ── ccrCommand：一键把 retrieve 工具装进调用方 agent ───────────────────────
// 页面沙箱不能 spawn，也不能写 magpie 的库文件；它把命令写进 options，下一次
// 本地请求时由这里执行。`magpie library mcp add` 幂等性由 magpie 自己保证，
// 我们只记录结果。action 目前只有一种：install-mcp。
function run(cmd, args) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 30000 }, (error, stdout, stderr) => {
      resolve({ ok: !error, stdout: String(stdout || "").slice(0, 4000), stderr: String(stderr || "").slice(0, 4000), error: error ? String(error.message) : null })
    })
  })
}

// install-mcp 把工具分给哪些 agent：options.ccrAgents（逗号分隔）优先；
// 缺省用 library.json 里已经在收 library MCP 的 agent 并集（都是合法 id，
// magpie 对未知 id 会整条报错，不能瞎猜）。都没有就只装不分。
async function resolveCcrAgents(options) {
  const explicit = typeof options?.ccrAgents === "string" ? options.ccrAgents.trim() : ""
  if (explicit) return explicit
  try {
    const base = process.env.MAGPIE_CONFIG_DIR || join(homedir(), ".config", "magpie")
    const lib = JSON.parse(await readFile(join(base, "library.json"), "utf8"))
    const set = new Set()
    for (const entry of lib?.mcp || [])
      for (const agent of entry?.agents || [])
        if (typeof agent === "string" && agent) set.add(agent)
    return set.size ? [...set].join(",") : null
  } catch {
    return null
  }
}

export function processCcrCommand(options) {
  const command = options?.ccrCommand
  if (!command || typeof command.id !== "string" || command.id.length > 80 || completed.has(command.id)) return false
  remember(command.id)
  if (command.action !== "install-mcp") return false
  // 页面读不到 commands.json（connect-src 'none'），执行结果同时发布成页面
  // 目录下的脚本，面板轮询时捡起 __COMPRESS_CORE_CCR__ 画状态。
  const publish = (fields) =>
    publishPageScript("compress-ccr-status.js", "__COMPRESS_CORE_CCR__", {
      id: command.id,
      action: command.action,
      at: new Date().toISOString(),
      ...fields,
    }).catch(() => {})
  return later(async () => {
    try {
      // 宿主随 options 变更重启，completed 集合会丢；ccrCommand 又一直留在
      // options 里，不查 journal 就会反复重跑（重跑的 add 报 already-exists
      // 还会把 done 冲成 error）。同 id 已成功过：直接回画 done，不再执行。
      const journal = await readFile(commandsFile(), "utf8")
        .then((text) => { try { return JSON.parse(text) } catch { return null } })
        .catch(() => null)
      if (journal?.ccrCommand?.id === command.id && journal.ccrCommand.status === "done") {
        await publish({ status: "done" })
        return true
      }
      const server = join(dirname(fileURLToPath(import.meta.url)), "mcp", "ccr-retrieve-server.mjs")
      const magpie = process.env.MAGPIE_EXE || "magpie"
      const result = await run(magpie, ["library", "mcp", "add", "ccr-retrieve", process.execPath, server])
      // 同名服务器已在 library 里 = 装过了，按成功继续（幂等安装）。
      const exists = !result.ok && /already has a server/i.test(result.stderr || result.error || "")
      if (!result.ok && !exists) {
        await patch({ ccrCommand: { id: command.id, action: command.action, status: "error", result } })
        await publish({ status: "error", error: result.error || (result.stderr || "").slice(0, 500) })
        return false
      }
      // 只装上不派给 agent，门控照样不放行——add 不带 agents 默认是空名单。
      const agents = await resolveCcrAgents(options)
      if (agents) {
        const assigned = await run(magpie, ["library", "mcp", "agents", "ccr-retrieve", agents])
        if (!assigned.ok) {
          await patch({ ccrCommand: { id: command.id, action: command.action, status: "error", result: assigned } })
          await publish({ status: "error", error: assigned.error || (assigned.stderr || "").slice(0, 500) })
          return false
        }
      }
      await patch({ ccrCommand: { id: command.id, action: command.action, status: "done", result, agents: agents || null } })
      await publish({ status: "done" })
      return true
    } catch (error) {
      await patch({ ccrCommand: { id: command.id, action: command.action, status: "error", error: error.message } }).catch(() => {})
      await publish({ status: "error", error: String(error.message || error).slice(0, 500) })
      return false
    }
  })
}
