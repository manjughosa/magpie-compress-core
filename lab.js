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
  // 试压台要回答的是「这个策略对这段文本做了什么」，所以这台上不挂 preserve：
  // 实验室的输入是单独一条 user 消息，它永远落在「保护最近 N 轮」的窗口里；
  // 一旦挂上 preserve，每个策略看到的都只是占位符，结果必然「压缩前后没区别」。
  // preserve 本身由 observability.hooks.js 的套件单独覆盖。
  // 试压台的输入是单独一条 user 消息，按生产语义它属于「正在发送的这一轮」，本来不该被改写。
  // 这台要回答的是「这个策略对这段文本做了什么」，所以用 treatAllAsHistory 把输入当作历史；
  // 生产路径上没有这个开关，当前轮保持原样。
  const bench = {
    ...options,
    strategies,
    preserve: { system: false, lastTurns: 0 },
    lite: { ...(options.lite && typeof options.lite === "object" ? options.lite : {}), treatAllAsHistory: true },
  }
  const before = clone(body)
  const beforeText = conversationText(before, protocol)
  try {
    const ctx = { protocol, state: {}, origin: "local" }
    const result = await runPipeline(body, ctx, bench)
    const report = result
    const record = report.strategies.find(item => item.id === strategy) || null
    removeInternalMarker(body, options, strategy)
    const after = body
    return {
      id, ok: true, at: new Date().toISOString(), mode, protocol, strategy,
      before, after, beforeText, afterText: conversationText(after, protocol),
      record, report, error: null,
    }
  } catch (error) {
    return {
      id, ok: false, at: new Date().toISOString(), mode, protocol, strategy,
      before, after: before, beforeText, afterText: beforeText,
      record: null, report: null,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
