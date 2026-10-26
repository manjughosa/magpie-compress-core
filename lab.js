import { runPipeline, removeInternalMarker, clone } from "./pipeline.js"
import { conversationView } from "./adapter.js"
import { ENGINES, engineById } from "./catalog.js"
import { engineModule } from "./engines/index.js"

export const MAX_LAB_BYTES = 256000
const PROTOCOLS = new Set(["chat", "responses", "anthropic", "gemini"])
const encoder = new TextEncoder()

export function conversationText(body, protocol) {
  const view = conversationView(body, protocol)
  if (!view) return ""
  return view.segments.map((segment, index) => {
    const tags = [`#${index + 1}`, segment.role || "unknown"]
    if (segment.toolOutput) tags.push("tool")
    return `[${tags.join("] [")}] ${segment.text}`
  }).join("\n")
}

function inputError(message) {
  throw new Error(`实验室输入错误：${message}`)
}

function parseRequest(request) {
  if (!request || typeof request !== "object" || Array.isArray(request)) inputError("请求必须是对象")
  const { mode, input, protocol, strategy } = request
  if (mode !== "text" && mode !== "json") inputError("mode 仅支持 text 或 json")
  if (!PROTOCOLS.has(protocol)) inputError("protocol 仅支持 chat、responses、anthropic、gemini")
  if (typeof input !== "string") inputError("input 必须是字符串")
  if (encoder.encode(input).length > MAX_LAB_BYTES) inputError(`input 不能超过 ${MAX_LAB_BYTES} 字节`)

  if (mode === "text") return { model: "lab", messages: [{ role: "user", content: input }] }
  let body
  try { body = JSON.parse(input) } catch { inputError("JSON 格式无效") }
  if (!body || typeof body !== "object" || Array.isArray(body)) inputError("JSON 顶层必须是对象")
  return body
}

export async function runLab(request, options = {}) {
  const body = parseRequest(request)
  const { id, mode, protocol, strategy } = request
  const meta = typeof strategy === "string" ? engineById(strategy) : null
  if (!meta) inputError("策略不在引擎目录中")
  if (meta.available === false) inputError("策略当前不可用")
  if (!engineModule(strategy)) inputError("策略没有可用实现")
  if (!options || typeof options !== "object" || Array.isArray(options)) inputError("options 必须是对象")

  const strategies = Object.fromEntries(ENGINES.map(engine => [engine.id, false]))
  strategies[strategy] = true
  const before = clone(body)
  const beforeText = conversationText(before, protocol)
  try {
    const ctx = { protocol, state: {}, origin: "local" }
    const result = await runPipeline(body, ctx, { ...options, strategies })
    const report = result
    removeInternalMarker(body, options, strategy)
    const after = body
    return {
      id, ok: true, at: new Date().toISOString(), mode, protocol, strategy,
      before, after, beforeText, afterText: conversationText(after, protocol),
      report, error: null,
    }
  } catch (error) {
    return {
      id, ok: false, at: new Date().toISOString(), mode, protocol, strategy,
      before, after: before, beforeText, afterText: beforeText, report: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
