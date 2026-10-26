// Browser-only entry: the same engines used by the gateway, bundled for lab tests.
import { runLab } from "../lab.js"
import { engineById, ENGINES } from "../catalog.js"

const encoder = new TextEncoder()
globalThis.CompressLab = {
  engines: ENGINES.map(function (e) {
    return { id: e.id, label: e.label, available: e.available !== false }
  }),
  async run(input, strategy, options) {
    if (typeof input !== "string" || !input.trim()) throw new Error("请输入要试压的文本。")
    if (encoder.encode(input).length > 256000) throw new Error("试压文本不能超过 256 KB。")
    if (!engineById(strategy) || engineById(strategy).available === false) throw new Error("这个策略当前不可用。")
    const result = await runLab({ id: `lab-${Date.now()}`, mode: "text", input, protocol: "chat", strategy }, options)
    if (!result.ok) throw new Error(result.error || "试压失败")
    return {
      id: result.id,
      at: result.at,
      strategy,
      before: result.report.beforeBytes,
      after: result.report.afterBytes,
      saved: result.report.savedBytes,
      beforeText: result.beforeText,
      afterText: result.afterText,
      error: null,
    }
  },
}
