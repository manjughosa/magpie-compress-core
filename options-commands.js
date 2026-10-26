// Page sandbox <-> Bun file channel. Commands run on a subsequent local request;
// a result never replaces unrelated strategies or settings.
import { randomUUID } from "node:crypto"
import { readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { runLab } from "./lab.js"
import { clearCaptures } from "./capture-store.js"
import { configDir, flush, snapshot, sync } from "./stats-writer.js"

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

// Read-modify-write only this plugin's command/stat fields. Other entries and
// the user's current switches remain untouched, even when a page was stale.
async function patch(fields) {
  const path = join(configDir(), "plugins.json")
  const tmp = path + ".compress-command.tmp"
  const doc = JSON.parse(await readFile(path, "utf8"))
  const entries = Array.isArray(doc?.plugins) ? doc.plugins : []
  const entry = entries.find(item => item?.name === "compress-core" || /(?:^|\/)compress-core$/.test(item?.spec || ""))
  if (!entry) return false
  entry.options ||= {}
  Object.assign(entry.options, fields)
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
      await sync()
      if (command.action === "clear") {
        await clearCaptures()
        const current = snapshot()
        current.captures = []
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
      await patch({ labResult: { id: command.id, status: "done", result }, labCommand: undefined })
      success = true
    } catch (error) {
      await patch({ labResult: { id: command.id, status: "error", error: error.message } }).catch(() => {})
    }
    return success
  })
}

export function captureCommandId() { return `capture-${randomUUID()}` }
