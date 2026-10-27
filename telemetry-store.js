// Persistent telemetry store. Runs only in the trusted Bun/Node host, never moejs.
import { appendFile, mkdir, readFile, rename, stat } from "node:fs/promises"
import { join } from "node:path"
import { homedir } from "node:os"

export function telemetryDir() {
  // 与 magpie 的配置目录解析保持一致：XDG_CONFIG_HOME 优先，退回 ~/.config。
  const xdg = process.env.XDG_CONFIG_HOME ? join(process.env.XDG_CONFIG_HOME, "magpie") : null
  const base = process.env.MAGPIE_CONFIG_DIR || xdg || join(homedir(), ".config", "magpie")
  return process.env.COMPRESS_CORE_DATA_DIR || join(base, "compress-core")
}
const file = () => join(telemetryDir(), "requests.jsonl")
// A request log that grows forever is a disk leak, not telemetry. The file keeps
// one previous generation (`requests.jsonl.1`) and starts over past this size;
// ~8 MB is many thousands of requests and costs nothing to carry.
const MAX_LOG_BYTES = 8_000_000
let logBytes = -1   // -1: size not measured yet, so the first write takes a stat
let queue = Promise.resolve()

async function rotateIfGrown(wrote) {
  if (logBytes < 0) {
    logBytes = await stat(file()).then(s => s.size, () => 0)
  }
  logBytes += wrote
  if (logBytes < MAX_LOG_BYTES) return
  await rename(file(), file() + ".1").catch(() => {})
  logBytes = 0
}

export function persist(event) {
  queue = queue.then(async () => {
    await mkdir(telemetryDir(), { recursive: true })
    const line = JSON.stringify(event) + "\n"
    await appendFile(file(), line, "utf8")
    await rotateIfGrown(Buffer.byteLength(line))
  }).catch(error => console.error("compress-core telemetry:", error.message))
  return queue
}
// A capture keeps the whole conversation text, so a key pasted into a prompt
// must not follow it onto disk or into a script the page loads. Each rule
// leaves a short tag: a reader can tell what was removed without seeing it.
// Ordered most specific first, so "sk-proj-…" becomes [redacted:key] and not
// the generic [credential] the word-shape rule below would produce.
const SECRET_RULES = [
  [/-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g, "[redacted:private-key]"],
  [/\bgithub_pat_[A-Za-z0-9_]{20,}/g, "[redacted:github-token]"],
  [/\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/g, "[redacted:github-token]"],
  [/\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g, "[redacted:aws-key]"],
  // The secret half of an AWS key pair has no prefix: 40 base64 characters that
  // only the parameter name gives away.
  [/(secret[-_]?access[-_]?key|aws_secret_access_key)(["'\s:=]+)([A-Za-z0-9/+=]{16,})/gi, "$1$2[redacted:aws-secret]"],
  [/\bhf_[A-Za-z0-9]{20,}/g, "[redacted:hf-token]"],
  [/\bnpm_[A-Za-z0-9]{36}\b/g, "[redacted:npm-token]"],
  [/\/\/[^\s/:]+:_authToken=\S+/g, "[redacted:npm-token]"],
  [/\bAIza[0-9A-Za-z_-]{35}\b/g, "[redacted:google-key]"],
  [/\bxox[abprs]-[A-Za-z0-9-]{10,}/g, "[redacted:slack-token]"],
  [/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g, "[redacted:jwt]"],
  [/\b(?:sk|rk|pk|ak)-[A-Za-z0-9_-]{16,}/g, "[redacted:key]"],
  // A password carried inside a URL: scheme://user:secret@host.
  [/\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+:)([^\s@/]{3,})(@)/gi, "$1[redacted]$3"],
  // A whole Cookie / Set-Cookie header; the session ids are the value.
  [/^[ \t]*((?:set-)?cookie[ \t]*:)[^\r\n]*/gim, "$1 [redacted:cookie]"],
  // The same header inside a JSON body, where nothing sits on its own line:
  // {"cookie":"session=…"} or {"headers":{"Cookie":"…"}}. The line-anchored rule
  // above cannot see those, and a capture stores whole request bodies verbatim.
  [/("(?:set-)?cookie"\s*:\s*")(?:[^"\\]|\\.)*/gi, "$1[redacted:cookie]"],
  // A password is short often enough that the 8-character floor below would miss it.
  [/(password|passwd|pwd)(["'\s:=]+)([^\s,"'}\[]{3,})/gi, "$1$2[redacted]"],
  [/\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/gi, "[redacted:credential]"],
  [/\b(?:sk|rk|pk|ak|key|token|bearer)[-_ ][A-Za-z0-9._-]{8,}/gi, "[credential]"],
  // The value must not start with "[" so a rule never re-masks a tag an earlier
  // rule just wrote ("Authorization: [redacted:credential]" stays legible).
  [/(authorization|api[-_ ]?key|access[-_ ]?token|client[-_ ]?secret|secret)(["'\s:=]+)([^\s,"'}\[]{8,})/gi, "$1$2[redacted]"],
]

// Masking only: no truncation, so a capture's before/after view stays whole.
export function redactSecrets(text) {
  let out = String(text)
  for (const [pattern, replacement] of SECRET_RULES) out = out.replace(pattern, replacement)
  return out
}

export function redact(text, limit = 1600) {
  const masked = String(text)
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[email]")
    .replace(/(?:[A-Za-z]:\\|\/(?:home|Users)\/)[^\s"']+/g, "[path]")
  return redactSecrets(masked).slice(0, limit)
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
