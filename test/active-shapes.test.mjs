// test/active-shapes.test.mjs — task-4：headroom / lite 在匹配数据形状下的活性复核。
// 在 runPipeline 层面（不是引擎函数层面）锁定：命中、省字、round-trip 校验、
// 以及「默认配置下没有任何有损行为」。

import { check, ctxFor } from "./helpers.mjs"
import { runPipeline, byteLength, clone } from "../pipeline.js"
import { restoreText } from "../engines/headroom.js"
import { apply as liteApply } from "../engines/lite.js"

export const name = "active-shapes"

const onlyLite = { strategies: { lite: true, "session-dedup": false, ccr: false, headroom: false } }
const onlyHeadroom = { strategies: { lite: false, "session-dedup": false, ccr: false, headroom: true } }

export async function run() {
  // ── H1 headroom：≥8 行同质 JSON 数组在管线级命中，round-trip 校验全过 ──
  {
    const arr = Array.from({ length: 12 }, (_, i) => ({
      id: i, name: `operator-${i}-with-a-longer-name`, active: i % 2 === 0, score: i * 1.5,
    }))
    const js = JSON.stringify(arr, null, 2)
    const body = { model: "m", messages: [{ role: "user", content: js }] }
    const before = clone(body)
    const rec = runPipeline(body, { protocol: "chat", state: {} }, onlyHeadroom, before)
    const h = rec.strategies.find((s) => s.id === "headroom")
    check("H1 管线级命中", h.status === "hit", h.status)
    check("H1 省字>0", h.savedBytes > 0, String(h.savedBytes))
    check("H1 消息已是 gcf 围栏", body.messages[0].content.startsWith("```gcf-generic"))
    check("H1 roundTrip 全过", h.roundTrip && h.roundTrip.checked >= 1 &&
      h.roundTrip.passed === h.roundTrip.checked, JSON.stringify(h.roundTrip))
    // 字节级：还原后 canonical 等值（restoreText 出紧凑 JSON，与管线的 canonicalJson 比对口径一致）
    check("H1 restoreText 逐键还原", JSON.stringify(JSON.parse(restoreText(body.messages[0].content))) === JSON.stringify(arr))
  }

  // ── H2 headroom：不够格的形状保持不动（5 行 → 默认 minRows 不压）──
  {
    const small = JSON.stringify(Array.from({ length: 3 }, (_, i) => ({ id: i })), null, 2)
    const body = { model: "m", messages: [{ role: "user", content: small }] }
    const before = clone(body)
    const rec = runPipeline(body, { protocol: "chat", state: {} }, onlyHeadroom, before)
    const h = rec.strategies.find((s) => s.id === "headroom")
    check("H2 小数组不压", h.status === "skipped" && body.messages[0].content === small)
  }

  // ── L1 lite：空白折叠在管线级命中，字节级精确 ──
  {
    const body = { model: "m", messages: [{ role: "user", content: "alpha\n\n\n\nbeta   \n" }] }
    const before = clone(body)
    const rec = runPipeline(body, { protocol: "chat", state: {} }, onlyLite, before)
    const l = rec.strategies.find((s) => s.id === "lite")
    check("L1 管线级命中", l.status === "hit", l.status)
    check("L1 结果逐字正确", body.messages[0].content === "alpha\n\nbeta\n")
    check("L1 省字=before-after 实测字节", l.savedBytes === l.beforeBytes - l.afterBytes)
  }

  // ── L2 lite 默认无损：3000 字符 tool 结果在默认配置下不截断 ──
  {
    const long = "tool output line\n".repeat(200) // ~3400 字符
    const body = { model: "m", messages: [{ role: "tool", content: long }, { role: "assistant", content: "done" }] }
    const ctx = ctxFor("chat")
    const changed = liteApply(body, ctx, {})
    const after = body.messages[0].content
    check("L2 默认配置不截 tool 结果", after === long, `len=${after.length}`)
    check("L2 默认配置未报 tool-compress",
      !(ctx.state.lite?.techniques || []).includes("tool-compress"))
    // 显式开启才截（有损项只能显式配置开启）
    const body2 = { model: "m", messages: [{ role: "tool", content: long }, { role: "assistant", content: "done" }] }
    liteApply(body2, ctxFor("chat"), { compressToolResults: true, maxToolLength: 2000 })
    check("L2 显式开启后截断且带标记", body2.messages[0].content.length <= 2040 &&
      body2.messages[0].content.includes("[truncated]"))
  }

  // ── L3 lite 默认不剥图（有损；视觉模型判定之外也要默认关）──
  {
    const body = {
      model: "some-vision-model",
      messages: [{ role: "user", content: [
        { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
      ] }],
    }
    liteApply(body, ctxFor("chat"), {})
    check("L3 默认不动图片段", body.messages[0].content[0].type === "image_url")
  }
}
