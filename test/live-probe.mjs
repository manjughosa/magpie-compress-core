// test/live-probe.mjs — 真机验证：穿过运行中的 magpie gateway (127.0.0.1:3425)
// 探针设计：同一 ≥80字符/≥3行的块在「最后一条 assistant 之前」出现两次。
// 若 session-dedup 在网关真实生效，第二次出现会被改写成 [dedup:ref sha=<24hex>]，
// 模型的回答里应能原样复述出这个占位符（模型只看得到压缩后的 body）。

const BLOCK = [
  "喜鹊网关压缩探针 alpha 段落：这一行用来凑够三行与八十字符的下限要求。",
  "喜鹊网关压缩探针 beta 段落：重复块检测需要内容完全一致才会被替换成指针。",
  "喜鹊网关压缩探针 gamma 段落：如果模型看到 dedup ref 说明中间件真的改写了请求。",
].join("\n")

const body = {
  model: "opencode-zen-free/deepseek-v4.1-flash-free",
  max_tokens: 120,
  messages: [
    { role: "user", content: BLOCK },
    { role: "assistant", content: "收到第一段。" },
    { role: "user", content: BLOCK },
    { role: "assistant", content: "收到第二段，与第一段完全相同。" },
    {
      role: "user",
      content:
        "请检查上面的对话记录：有没有出现形如 [dedup:ref sha=...] 的占位符？如果有，请原样完整引用它；如果没有，回答“没有看到占位符”。只回答这一件事。",
    },
  ],
}

const res = await fetch("http://127.0.0.1:3425/v1/messages", {
  method: "POST",
  headers: {
    "content-type": "application/json",
    "x-api-key": "magpie",
    "anthropic-version": "2023-06-01",
  },
  body: JSON.stringify(body),
})

const text = await res.text()
console.log("HTTP", res.status)
try {
  const j = JSON.parse(text)
  const out = (j.content || []).map((b) => b.text || "").join("") || text
  console.log("MODEL SAYS:", out)
  console.log("---")
  console.log(/\[dedup:ref sha=[0-9a-f]{24}/.test(out) ? "✓ 模型看到了 dedup 占位符 → 中间件在真实网关生效" : "✗ 回答中无 dedup 占位符（需人工判读上面原文）")
} catch {
  console.log(text.slice(0, 500))
}
