// Persistent telemetry store. Runs only in the trusted Bun/Node host, never moejs.
import { appendFile, mkdir, readFile } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export function telemetryDir() {
  // 与 magpie 的配置目录解析保持一致：XDG_CONFIG_HOME 优先，退回 ~/.config。
  const xdg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "magpie") : null
  const base = process.env.MAGPIE_CONFIG_DIR || xdg || join(homedir(), ".config", "magpie")
  return process.env.COMPRESS_CORE_DATA_DIR || join(base, "compress-core")
}
const file = () => join(telemetryDir(), "requests.jsonl")
let queue = Promise.resolve()
export function persist(event) {
  queue = queue.then(async () => {
    await mkdir(telemetryDir(), { recursive: true })
    await appendFile(file(), JSON.stringify(event) + "\n", "utf8")
  }).catch(error => console.error("compress-core telemetry:", error.message))
  return queue
}
export function redact(text, limit = 1600) {
  return String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/\b(?:sk|rk|pk|ak|key|token|bearer)[-_ ][A-Za-z0-9._-]{8,}/gi, "[credential]")
    .replace(/(authorization|api[-_ ]?key|access[-_ ]?token|password|secret)(["'\s:=]+)[^\s,"'}]+/gi, "$1$2[redacted]")
    .replace(/(?:[A-Za-z]:\\|\/(?:home|Users)\/)[^\s"']+/g, "[path]")
    .slice(0, limit)
}
export async function readEvents() {
  try {
    const text = await readFile(file(), "utf8")
    return text.split("\n").filter(Boolean).flatMap(line => { try { return [JSON.parse(line)] } catch { return [] } })
  } catch { return [] }
}

const DAY = 86400000
function percentile(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1)] : 0 }
export function summarize(events, options = {}) {
  const requests = events.filter(e => e.type === "request")
  const completions = new Map(events.filter(e => e.type === "response").map(e => [e.id, e]))
  const recent = requests.slice(-40).reverse().map(r => ({ ...r, response: completions.get(r.id) || null }))
  const periods = {}
  for (const [label, days] of [["today", 1], ["7d", 7], ["30d", 30]]) {
    const start = label === "today" ? new Date().setHours(0, 0, 0, 0) : Date.now() - days * DAY
    const subset = requests.filter(r => Date.parse(r.ts) >= start)
    const latencies = subset.map(r => r.totalMs).sort((a, b) => a - b)
    const models = {}
    for (const r of subset) {
      const m = models[r.model] ||= { model: r.model, requests: 0, beforeBytes: 0, afterBytes: 0, savedBytes: 0 }
      m.requests++; m.beforeBytes += r.beforeBytes; m.afterBytes += r.afterBytes; m.savedBytes += r.savedBytes
    }
    periods[label] = {
      requests: subset.length, changed: subset.filter(r => r.savedBytes > 0).length,
      beforeBytes: subset.reduce((n, r) => n + r.beforeBytes, 0), afterBytes: subset.reduce((n, r) => n + r.afterBytes, 0),
      savedBytes: subset.reduce((n, r) => n + r.savedBytes, 0), estimatedSavedTokens: subset.reduce((n, r) => n + r.estimatedBeforeTokens - r.estimatedAfterTokens, 0),
      failOpen: events.filter(e => Date.parse(e.ts) >= start && (e.type === "fail_open" || e.type === "request")).reduce((n, r) => n + (r.type === "fail_open" ? 1 : (r.failOpen ?? 0)), 0), budgetExceeded: subset.filter(r => r.totalMs > r.budgetMs).length,
      p50Ms: percentile(latencies, .5), p95Ms: percentile(latencies, .95), maxMs: latencies.at(-1) || 0,
      roundTripsChecked: subset.reduce((n, r) => n + r.roundTripsChecked, 0), roundTripsPassed: subset.reduce((n, r) => n + r.roundTripsPassed, 0),
      models: Object.values(models).sort((a, b) => b.savedBytes - a.savedBytes),
    }
  }
  const strategies = {}
  for (const id of ["lite", "sessionDedup", "headroom", "codexResponses", "rtk"]) {
    const rs = requests.map(r => r.strategies.find(s => s.id === id)).filter(Boolean)
    const hits = rs.filter(s => s.status === "hit")
    strategies[id] = { enabled: options.strategies?.[id] === true, hits: hits.length, skipped: rs.filter(s => s.status === "skipped").length, failOpen: rs.filter(s => s.status === "fail_open").length, savedBytes: hits.reduce((n, s) => n + (s.savedBytes || 0), 0) }
  }
  return { generatedAt: new Date().toISOString(), dataDir: telemetryDir(), samples: options.telemetry?.samples === true, periods, strategies, recent }
}
