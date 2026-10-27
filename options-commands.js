// Page sandbox <-> Bun file channel. Commands run on a subsequent local request;
// a result never replaces unrelated strategies or settings.
import { randomUUID } from "node:crypto"
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runLab } from "./lab.js"
import { clearCaptures } from "./capture-store.js"
import { clearCaptureIndex, flush } from "./stats-writer.js"
import { redactSecrets, telemetryDir } from "./telemetry-store.js"

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

export function processCaptureCommand(options) {
  const command = options?.captureCommand
  if (!command || typeof command.id !== "string" || command.id.length > 80 || completed.has(command.id)) return false
  remember(command.id)
  return later(async () => {
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
