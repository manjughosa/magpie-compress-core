// engines/relevance/index.js — relevance 引擎（抽取式句打分压缩）的纯 JS 移植。
// 来源: OmniRoute open-sse/services/compression/engines/relevance/index.ts（185 行）
//       + ./scorer.ts（85 行，已落到 scorer.js）
//       + ./configSchema.ts（63 行，已落到 config.js）
//
// 适配点：
//   1. `(?<=[.!?]\s)` 句界切分改用 lookbehind —— moejs 运行时无法保证支持 lookbehind
//      （现有 lite.js / headroom.js 里零 lookbehind 用法），改为手写扫描 splitSentences，
//      切点语义与 lookbehind 完全一致：在标点后紧跟空白处切开，空白归前一段。
//   2. 上游走 body.messages，本模块走 conversationView(body, ctx.protocol) 的文本段视图，
//      因此 chat / anthropic / responses / gemini 四协议统一覆盖。
//   3. 上游对 array content 有"仅当恰好 1 个 text block 才压缩"的限制（防止多模态块被打乱）；
//      adapter 已把每个 text block 拆成独立段，该限制自然消失 —— 这是行为超集，
//      逐块独立打分比整条 no-op 更合理，不会产生重复内容。
//   4. 上游返回新 body 对象；magpie 契约是原地改写，这里用 seg.set() 就地写回。
//
// 砍掉的东西：
//   - 上游的 stats 结构（compressed/stats 字段）不导出：pipeline 只认 apply 的布尔返回，
//     统计由 stats-writer.js 统一处理。
//   - 没有任何功能被删。relevance 的全部压缩逻辑（force-preserve / budget / 保底 / 原序重排）
//     逐条保留。
//
// 关键坑（上游注释明确警告，必须保留）：
//   不要复用 ultraHeuristic.ts 的 FORCE_PRESERVE_RE —— 那个模式含 `[._/\\]`，
//   会匹配每一个句子末尾的句号，导致 force-preserve 吃掉全部句子、永久 no-op。
//   relevance 必须用自己的 SENTENCE_PRESERVE_RE。

import { conversationView } from "../../adapter.js"
import { resolveRelevanceConfig, RELEVANCE_SCHEMA, configSchema, validateRelevanceConfig } from "./config.js"
import { scoreSentences } from "./scorer.js"

// ---------------------------------------------------------------------------
// 句子切分（替代上游 `text.split(/(?<=[.!?]\s)/)`）
// ---------------------------------------------------------------------------

/**
 * 在「句末标点 + 其后空白」之后切分。
 * 空白留在前一段里，所以 join("") 能原样复原段落与换行结构。
 */
function splitSentences(text) {
  const out = []
  let start = 0
  for (let i = 1; i < text.length; i++) {
    const prev = text[i - 1]
    if ((prev === "." || prev === "!" || prev === "?") && isSpace(text[i])) {
      out.push(text.slice(start, i))
      start = i
    }
  }
  out.push(text.slice(start))
  return out.filter((s) => s.trim().length > 0)
}

function isSpace(ch) {
  return ch === " " || ch === "\t" || ch === "\n" || ch === "\r" || ch === "\f" || ch === "\v"
}

// ---------------------------------------------------------------------------
// 强制保留模式 —— 与 ultraHeuristic 的 FORCE_PRESERVE_RE 刻意不同（见文件头）
// 命中者无条件保留，且不占 budget（防止 force-preserve starvation）。
// ---------------------------------------------------------------------------

export const SENTENCE_PRESERVE_RE =
  /\d|https?:\/\/|(?:Error|Exception|TypeError|RangeError|SyntaxError|ReferenceError|Traceback):|```|^\s*at\s|\/[\w.-]+\/|\w+=\S/i

// ---------------------------------------------------------------------------
// 单段压缩
// ---------------------------------------------------------------------------

/**
 * 对一段文本做 relevance 压缩。
 * @returns {{ result: string, changed: boolean }}
 */
export function applyRelevanceToText(text, query, cfg) {
  if (typeof text !== "string" || text.length === 0) return { result: text, changed: false }
  if (typeof query !== "string" || query.trim().length === 0) return { result: text, changed: false }

  const sentences = splitSentences(text)
  if (sentences.length <= 1) return { result: text, changed: false }

  const scores = scoreSentences(sentences, query, cfg)
  const totalChars = text.length
  const budget = Math.floor(totalChars * cfg.budgetPercent)

  const keepSet = new Set()

  // 第一步：强制保留（不占 budget）
  for (let i = 0; i < sentences.length; i++) {
    if (SENTENCE_PRESERVE_RE.test(sentences[i])) keepSet.add(i)
  }

  // 第二步：其余按分数降序贪心纳入 budget
  const sorted = sentences
    .map((s, i) => ({ i, s, score: scores[i] }))
    .filter((x) => !keepSet.has(x.i))
    .sort((a, b) => b.score - a.score)

  let kept = 0
  for (const item of sorted) {
    if (item.score >= cfg.overlapThreshold) {
      keepSet.add(item.i)
      kept += item.s.length + 1
      if (kept >= budget) break
    }
  }

  // 第三步：保底 —— 一句都不留时保留分最高的一句，绝不产出空文本
  if (keepSet.size === 0 && sorted.length > 0) keepSet.add(sorted[0].i)

  if (keepSet.size === sentences.length) return { result: text, changed: false }

  // 第四步：按原始下标重排（保持阅读顺序）
  const ordered = []
  for (let i = 0; i < sentences.length; i++) {
    if (keepSet.has(i)) ordered.push(sentences[i])
  }
  const result = ordered.join("")
  return { result, changed: result !== text }
}

// ---------------------------------------------------------------------------
// 引擎元数据（label 用上游英文原名，中文解释放 why）
// ---------------------------------------------------------------------------

export const id = "relevance"
export const label = "Relevance"
export const why = "按最后一条用户消息给句子打分，丢掉低分句。"
export const description = "Extractive sentence scoring against the last user query."
export const lossy = true
export const cacheImpact = "moderate"
export const defaultOn = false
export const stackPriority = 18
export const isSingleMode = false
export const levels = undefined
export const available = true

export { RELEVANCE_SCHEMA, configSchema, validateRelevanceConfig, resolveRelevanceConfig }

// ---------------------------------------------------------------------------
// magpie 中间件引擎入口
// cfg 来自 options.relevance，不含默认值 —— 必须自己 resolve（见 config.js）。
// 注意：不检查 cfg.enabled。上游同样不检查（enabled 由上层 runner / pipeline 的
// strategies 开关负责），引擎内检查会因 pipeline 不传该键而永久 no-op。
// ---------------------------------------------------------------------------

export function apply(body, ctx, cfg) {
  try {
    if (!body || typeof body !== "object") return false

    const conf = resolveRelevanceConfig(cfg)
    const view = conversationView(body, ctx && ctx.protocol)
    if (!view || !Array.isArray(view.segments) || view.segments.length === 0) return false

    const segs = view.segments

    // query 是压缩前快照：先从尾往前取最后一条 user 段。
    // 上游注释：压缩最后一条 user 消息不构成循环，且这条消息常载着待裁剪的粘贴上下文，
    // 所以不跳过它。
    let query = ""
    for (let i = segs.length - 1; i >= 0; i--) {
      if (segs[i].role === "user") {
        query = typeof segs[i].text === "string" ? segs[i].text.trim() : ""
        break
      }
    }
    if (!query) return false

    let changed = false
    for (const seg of segs) {
      if (seg.role !== "user") continue
      const r = applyRelevanceToText(seg.text, query, conf)
      if (!r.changed) continue
      seg.set(r.result)
      changed = true
    }
    return changed
  } catch {
    // fail-open：任何异常都不许冒泡到中间件链
    return false
  }
}
