// Optional LLM prose-compression backend. Only runs when options.llm is
// explicitly configured; the synchronous moejs fallback never imports it.
import { setLlmCompressorBackend } from "./engines/llm.js"

export function configureLlmBackend(options) {
  const cfg = options?.strategies?.llm
  if (!cfg || typeof cfg !== "object" || cfg.enabled === false || typeof cfg.model !== "string" || !cfg.model.trim()) {
    setLlmCompressorBackend(null)
    return
  }
  const baseUrl = typeof cfg.baseUrl === "string" ? cfg.baseUrl.replace(/\/$/, "") : "http://127.0.0.1:3425/v1"
  const timeoutMs = Number.isFinite(cfg.timeoutMs) ? Math.max(1000, Math.min(30000, cfg.timeoutMs)) : 12000
  const apiKey = typeof cfg.apiKey === "string" ? cfg.apiKey : "magpie"
  setLlmCompressorBackend(async (text, opts) => {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(baseUrl + "/chat/completions", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: opts?.model || cfg.model,
          stream: false,
          messages: [
            { role: "system", content: "Condense the supplied prose without changing facts or intent. Return only the condensed prose. Do not summarize protected placeholders or invent information." },
            { role: "user", content: text },
          ],
        }),
      })
      if (!response.ok) throw new Error(`llm backend HTTP ${response.status}`)
      const data = await response.json()
      const content = data?.choices?.[0]?.message?.content
      if (typeof content !== "string") throw new Error("llm backend returned no text")
      return content
    } finally {
      clearTimeout(timer)
    }
  })
}
