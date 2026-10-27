// Browser-only entry: the same engines used by the gateway, bundled for lab tests.
import { runLab } from "../lab.js"
import { engineById, ENGINES } from "../catalog.js"

const encoder = new TextEncoder()

// 为什么这次没动：把 pipeline 的 reason 翻成人话，免得面板上只剩「没区别」。
const REASON_ZH = {
  no_repeat_eligible_block: "输入里没有重复出现的块——去重要靠同一会话里已经发过的文本。",
  nothing_to_remove: "扫过了：这段文本里没有它能去掉的东西。",
  no_whitespace_or_tool_result_change: "输入里没有多余空白、重复行或可以精简的工具输出。",
  no_matching_tool_output_filter: "输入里没有识别到命令输出——这个策略只处理工具结果。",
  no_eligible_json_array_or_not_smaller: "没有够大的 JSON 数组可折叠，或者压完反而更大。",
  no_eligible_response_item: "这条请求里没有 Responses 协议的 shell / patch / search 工具输出。",
  protocol_not_responses: "这个策略只对 Responses 协议生效，实验室目前按 chat 跑。",
  budget_exceeded: "超出了这次试压的时间预算。",
  round_trip_mismatch: "压完还原不回去，已按 fail-open 回滚。",
  engine_error: "策略内部报错，已按 fail-open 回滚。",
  unavailable: "这个策略在当前环境里跑不了。",
  disabled: "这次没启用这个策略。",
  changed: "改动了。",
}

globalThis.CompressLab = {
  engines: ENGINES.map(function (e) {
    return { id: e.id, label: e.label, available: e.available !== false, why: e.why || "" }
  }),
  async run(input, strategy, options, mode) {
    if (typeof input !== "string" || !input.trim()) throw new Error("请输入要试压的文本。")
    if (encoder.encode(input).length > 256000) throw new Error("试压文本不能超过 256 KB。")
    const meta = engineById(strategy)
    if (!meta || meta.available === false) throw new Error("这个策略当前不可用。")

    const shape = mode === "json" ? "json" : "text"
    if (shape === "json") {
      let parsed = null
      try { parsed = JSON.parse(input) } catch { throw new Error("请求体 JSON 解析失败，检查一下括号和引号。") }
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("请求体 JSON 的顶层必须是对象。")
    }

    const result = await runLab({ id: `lab-${Date.now()}`, mode: shape, input, protocol: "chat", strategy }, options)
    if (!result.ok) throw new Error(result.error || "试压失败")

    const record = result.record || {}
    return {
      id: result.id,
      at: result.at,
      strategy,
      label: meta.label || strategy,
      why: meta.why || "",
      mode: shape,
      status: record.status || "skipped",
      reason: record.reason || "",
      reasonText: REASON_ZH[record.reason] || "",
      ms: record.ms || 0,
      before: result.report.beforeBytes,
      after: result.report.afterBytes,
      saved: result.report.savedBytes,
      beforeText: result.beforeText,
      afterText: result.afterText,
      error: null,
    }
  },
}