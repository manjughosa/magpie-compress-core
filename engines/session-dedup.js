// engines/session-dedup.js — OmniRoute session-dedup 引擎的逐字移植（纯 JS，moejs 兼容）。
// 依据: open-sse/services/compression/engines/session-dedup/index.ts + fuzzy.ts，
//       ccr/protocolInstruction.ts 的 callerSupportsCcrRetrieve。
// 规格书见 test/session-dedup-spec.md。
//
// 与 OmniRoute 原版的差异（仅环境适配，行为一致）：
//   1. node:crypto → ../hash.js 的纯 JS sha256hex（已与 node:crypto 对拍验证）。
//   2. performance.now() → Date.now()（只影响遥测）。
//   3. createCompressionStats → lite.js 的 chars/4 最小版（只影响遥测）。
//   4. __sessionDedupMap__：上游源码并未实际把 map 挂到 body（只有头注释的设计意图）。
//      本移植同样不污染发往供应商的 body；改为把 sha→原文 map 记录到 ctx.state
//      （restoreDedup 用它做 round-trip 验证）。上游语义——模型回看首次出现处——不变。
//   5. fuzzy 的 tryStoreBlock 换成本次请求内的内存 Map。moejs 同步中间件没有跨请求
//      状态，[CCR retrieve] marker 在后续轮无法兑现，所以 fuzzy 默认关（与上游一致），
//      只在调用方声明了 omniroute_ccr_retrieve 工具时才会跑（上游同一门控）。
//      要真正启用 fuzzy，需要后续接持久 CCR 存储（Bun 异步钩子/工具插件）。
//
// 协议覆盖：上游只认 body["messages"]（chat/anthropic）。responses/gemini 无 messages
// 数组时本引擎不动（与上游一致；扩展覆盖属于后续工作）。

import { sha256hex } from "../hash.js"
import { createCompressionStats } from "./lite.js"

const ENGINE_ID = "session-dedup"
const DEFAULT_MIN_BLOCK_CHARS = 80
const MIN_BLOCK_LINES = 3
const MAX_SUFFIX_STARTS = 2000
const MAX_TOTAL_BLOCK_BYTES = 8 * 1024 * 1024

// ─── hash ────────────────────────────────────────────────────────────────────

function hashBlock(text) {
  // 24 hex / 96 bits。Pass 2 另验 owner.block === block，碰撞不会导致错误替换。
  return sha256hex(text).slice(0, 24)
}

// ─── suffix-block extraction（逐字） ─────────────────────────────────────────

function findSuffixBlocks(lines, minBlockChars) {
  const n = lines.length
  const seen = new Set()
  const results = []
  const maxStarts = Math.min(n, MAX_SUFFIX_STARTS)
  let totalBlockBytes = 0
  for (let start = 0; start < maxStarts; start++) {
    const block = lines.slice(start).join("\n")
    const blockLines = n - start
    if (blockLines >= MIN_BLOCK_LINES && block.length >= minBlockChars && !seen.has(block)) {
      seen.add(block)
      results.push({ block, startLine: start })
      totalBlockBytes += block.length
      if (totalBlockBytes >= MAX_TOTAL_BLOCK_BYTES) break
    }
  }
  return results
}

// ─── intra-message（逐字；blockFreq 在上游恒为 1——seen 已去重——原样保留） ────

function countLiteralOccurrences(text, needle) {
  if (!needle) return 0
  let count = 0
  let offset = 0
  while (true) {
    const idx = text.indexOf(needle, offset)
    if (idx === -1) return count
    count++
    offset = idx + needle.length
  }
}

function replaceLiteralOccurrencesAfterFirst(text, needle, replacement) {
  if (!needle) return text
  const first = text.indexOf(needle)
  if (first === -1) return text
  let result = text.slice(0, first + needle.length)
  let offset = first + needle.length
  while (true) {
    const idx = text.indexOf(needle, offset)
    if (idx === -1) {
      result += text.slice(offset)
      return result
    }
    result += text.slice(offset, idx) + replacement
    offset = idx + needle.length
  }
}

function dedupeWithinMessage(text, minBlockChars, blockMap, deadline) {
  const lines = text.split("\n")
  const blocks = findSuffixBlocks(lines, minBlockChars)
  if (blocks.length < 2) return { deduped: text, changed: false }

  const blockFreq = new Map()
  for (const { block } of blocks) {
    blockFreq.set(block, (blockFreq.get(block) || 0) + 1)
  }
  const sortedBlocks = [...blocks].sort((a, b) => {
    const freqDiff = (blockFreq.get(b.block) || 0) - (blockFreq.get(a.block) || 0)
    return freqDiff !== 0 ? freqDiff : b.block.length - a.block.length
  })

  let result = text
  let changed = false
  for (const { block } of sortedBlocks) {
    if (deadline && Date.now() > deadline) break // 时间盒：到点即停，已替换的仍正确
    const occurrences = countLiteralOccurrences(result, block)
    if (occurrences < 2) continue
    const sha = hashBlock(block)
    const marker = `[dedup:ref sha=${sha}]`
    result = replaceLiteralOccurrencesAfterFirst(result, block, marker)
    changed = true
    if (blockMap && !blockMap.has(sha)) blockMap.set(sha, block)
  }
  return { deduped: result, changed }
}

// ─── two-pass dedup（逐字） ──────────────────────────────────────────────────

function dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart, blockMap, deadline) {
  const deduped = new Map()
  let dedupCount = 0
  const over = () => deadline && Date.now() > deadline

  if (msgTexts.length === 1) {
    const { text, msgIdx } = msgTexts[0]
    const r = dedupeWithinMessage(text, minBlockChars, blockMap, deadline)
    if (r.changed) {
      deduped.set(msgIdx, r.deduped)
      dedupCount++
    }
    return { deduped, dedupCount }
  }

  // 性能适配（行为不可见）：每个 slot 的 suffix 块与其 sha 只计算一次，
  // Pass 1 / Pass 2 复用同一数组。上游是每 Pass 各算一遍，输出完全相同。
  // 时间盒：超时的 slot 退化为 blocks=[]（不参与 owning/替换，少压缩但不错误）。
  const perSlot = []
  for (const { msgIdx, messageIndex, text } of msgTexts) {
    if (over()) {
      perSlot.push({ msgIdx, messageIndex, text, blocks: [] })
      continue
    }
    perSlot.push({
      msgIdx,
      messageIndex,
      text,
      blocks: findSuffixBlocks(text.split("\n"), minBlockChars).map(({ block }) => ({
        block,
        sha: hashBlock(block),
      })),
    })
  }

  // Pass 1: firstSeen sha → { ownerMsgIdx, block }
  // firstSeen 同时充当 sha→原文 还原图（每个被替换块都经 owner.block === block 验证）
  const firstSeen = new Map()
  for (const { msgIdx, blocks } of perSlot) {
    for (const { block, sha } of blocks) {
      if (!firstSeen.has(sha)) {
        firstSeen.set(sha, { ownerMsgIdx: msgIdx, block })
      }
    }
  }
  if (blockMap) {
    for (const [sha, { block }] of firstSeen) {
      if (!blockMap.has(sha)) blockMap.set(sha, block)
    }
  }

  // Pass 2: 只替换「严格更早消息首次出现」的块；当前轮（>= currentTurnStart）不改。
  for (const { msgIdx, messageIndex, text, blocks } of perSlot) {
    if (messageIndex >= currentTurnStart) continue

    const dupBlocks = []
    for (const { block, sha } of blocks) {
      const owner = firstSeen.get(sha)
      if (owner && owner.ownerMsgIdx < msgIdx && owner.block === block) {
        dupBlocks.push({ block, sha })
      }
    }
    if (dupBlocks.length === 0) continue

    dupBlocks.sort((a, b) => b.block.length - a.block.length)

    let result = text
    let changed = false
    const replaced = new Set()
    for (const { block, sha } of dupBlocks) {
      if ([...replaced].some((r) => r.includes(block))) continue
      const idx = result.indexOf(block)
      if (idx !== -1) {
        const marker = `[dedup:ref sha=${sha}]`
        result = result.slice(0, idx) + marker + result.slice(idx + block.length)
        changed = true
        replaced.add(block)
        break // 每条消息每轮只替换一个块（上游逐字行为）
      }
    }
    if (changed) {
      deduped.set(msgIdx, result)
      dedupCount++
    }
  }
  return { deduped, dedupCount }
}

// ─── message slots（逐字） ───────────────────────────────────────────────────

function collectTextSlots(msg) {
  if (typeof msg.content === "string") return [msg.content]
  if (!Array.isArray(msg.content)) return []
  const texts = []
  for (const part of msg.content) {
    if (part["type"] === "text" && typeof part["text"] === "string") {
      texts.push(part["text"])
      continue
    }
    if (part["type"] !== "tool_result") continue
    const inner = part["content"]
    if (typeof inner === "string") {
      texts.push(inner)
    } else if (Array.isArray(inner)) {
      for (const block of inner) {
        if (block["type"] === "text" && typeof block["text"] === "string") {
          texts.push(block["text"])
        }
      }
    }
  }
  return texts
}

function applyTextSlots(msg, baseKey, deduped) {
  if (typeof msg.content === "string") {
    const replacement = deduped.get(baseKey + 1)
    return replacement !== undefined ? { ...msg, content: replacement } : { ...msg }
  }
  if (!Array.isArray(msg.content)) return { ...msg }

  let slot = 0
  let changed = false
  const newContent = msg.content.map((part) => {
    if (part["type"] === "text" && typeof part["text"] === "string") {
      slot++
      const replacement = deduped.get(baseKey + slot)
      if (replacement !== undefined) {
        changed = true
        return { ...part, text: replacement }
      }
      return part
    }
    if (part["type"] !== "tool_result") return part
    const inner = part["content"]
    if (typeof inner === "string") {
      slot++
      const replacement = deduped.get(baseKey + slot)
      if (replacement !== undefined) {
        changed = true
        return { ...part, content: replacement }
      }
      return part
    }
    if (!Array.isArray(inner)) return part
    let innerChanged = false
    const newInner = inner.map((block) => {
      if (block["type"] !== "text" || typeof block["text"] !== "string") return block
      slot++
      const replacement = deduped.get(baseKey + slot)
      if (replacement !== undefined) {
        innerChanged = true
        return { ...block, text: replacement }
      }
      return block
    })
    if (!innerChanged) return part
    changed = true
    return { ...part, content: newInner }
  })
  return changed ? { ...msg, content: newContent } : { ...msg }
}

function processMessages(messages, minBlockChars, blockMap, deadline) {
  const msgTexts = []
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i]
    if (msg.role === "system") continue
    const slots = collectTextSlots(msg)
    for (let s = 0; s < slots.length; s++) {
      msgTexts.push({ msgIdx: i * 100000 + s + 1, messageIndex: i, text: slots[s] })
    }
  }
  if (msgTexts.length === 0) return { messages, dedupCount: 0 }

  // 当前轮 = 最后一条 assistant 之后；无 assistant → currentTurnStart=0 → 全部豁免
  let currentTurnStart = 0
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "assistant") {
      currentTurnStart = i + 1
      break
    }
  }
  const { deduped, dedupCount } = dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart, blockMap, deadline)
  if (dedupCount === 0) return { messages, dedupCount: 0 }

  const result = messages.map((msg, i) => {
    if (msg.role === "system") return { ...msg }
    return applyTextSlots(msg, i * 100000, deduped)
  })
  const dedupMap = []
  const seenRefs = new Set()
  const refPattern = /\[dedup:ref sha=([0-9a-f]{24})\]/g
  for (const [, text] of deduped) {
    for (const match of text.matchAll(refPattern)) {
      const sha = match[1]
      if (!seenRefs.has(sha) && blockMap.has(sha)) {
        seenRefs.add(sha)
        dedupMap.push([sha, blockMap.get(sha)])
      }
    }
  }
  return { messages: result, dedupCount, dedupMap }
}

// ─── fuzzy（逐字；store 注入，默认关） ───────────────────────────────────────

const MAX_FUZZY_BLOCKS = 200
const CCR_RETRIEVE_TOOL_NAME = "omniroute_ccr_retrieve"
const CCR_RETRIEVE_TOOL_NAME_SEPARATORS = ["__", ".", "/", ":"]

function fnv1a(s) {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

export function shingles(text, k) {
  k = k === undefined ? 3 : k
  const words = text.split(/\s+/).filter(Boolean)
  const out = new Set()
  if (words.length < k) return out
  for (let i = 0; i + k <= words.length; i++) {
    out.add(fnv1a(words.slice(i, i + k).join(" ")))
  }
  return out
}

export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  const small = a.size <= b.size ? a : b
  const large = a.size <= b.size ? b : a
  let inter = 0
  for (const x of small) if (large.has(x)) inter++
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

export function findNearDuplicates(blocks, minJaccard, maxBlocks, shingleSize) {
  if (blocks.length > maxBlocks) return []
  const sets = blocks.map((b) => shingles(b.text, shingleSize === undefined ? 3 : shingleSize))
  const out = []
  for (let i = 0; i < blocks.length; i++) {
    let best = -1
    let bestSim = 0
    for (let j = 0; j < i; j++) {
      const sim = jaccard(sets[i], sets[j])
      if (sim >= minJaccard && sim > bestSim) {
        bestSim = sim
        best = j
      }
    }
    if (best >= 0) {
      out.push({ block: blocks[i], matchedIndex: blocks[best].index, similarity: bestSim })
    }
  }
  return out
}

function buildCcrMarker(hash, charCount) {
  return `[CCR retrieve hash=${hash} chars=${charCount}]`
}

function matchesCcrRetrieveToolName(name) {
  if (typeof name !== "string") return false
  if (name === CCR_RETRIEVE_TOOL_NAME) return true
  return CCR_RETRIEVE_TOOL_NAME_SEPARATORS.some((sep) =>
    name.endsWith(`${sep}${CCR_RETRIEVE_TOOL_NAME}`)
  )
}

export function callerSupportsCcrRetrieve(body) {
  const tools = body["tools"]
  if (!Array.isArray(tools)) return false
  return tools.some((tool) => {
    const flatName = tool && typeof tool.name === "string" ? tool.name : undefined
    const fn = tool && tool.function && typeof tool.function.name === "string" ? tool.function.name : undefined
    return matchesCcrRetrieveToolName(flatName) || matchesCcrRetrieveToolName(fn)
  })
}

function applyFuzzyPass(messages, opts, store) {
  try {
    const blocks = []
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i]
      if (m.role === "system") continue
      if (typeof m.content === "string" && m.content.length >= opts.minBlockChars) {
        blocks.push({ text: m.content, index: i })
      }
    }
    if (blocks.length < 2) return { messages, fuzzyCount: 0 }

    const nearDups = findNearDuplicates(blocks, opts.minJaccard, opts.maxBlocks, opts.shingleSize)
    if (nearDups.length === 0) return { messages, fuzzyCount: 0 }

    const replacements = new Map()
    for (const nd of nearDups) {
      // tryStoreBlock 的请求内 Map 版（见文件头差异说明 5）
      const hash = hashBlock(nd.block.text)
      store.set(hash, nd.block.text)
      const marker = buildCcrMarker(hash, nd.block.text.length)
      if (marker.length < nd.block.text.length) replacements.set(nd.block.index, marker)
    }
    if (replacements.size === 0) return { messages, fuzzyCount: 0 }

    const out = messages.map((m, i) =>
      replacements.has(i) ? { ...m, content: replacements.get(i) } : m
    )
    return { messages: out, fuzzyCount: replacements.size, store }
  } catch {
    return { messages, fuzzyCount: 0 }
  }
}

function runFuzzyPass(messages, stepConfig, minBlockChars, callerCanRetrieve, store) {
  const raw = stepConfig["fuzzy"]
  const cfg = typeof raw === "boolean" ? { enabled: raw } : raw
  if (!cfg || !cfg.enabled) return { messages, fuzzyCount: 0 }
  if (!callerCanRetrieve) return { messages, fuzzyCount: 0 }
  return applyFuzzyPass(messages, {
    minJaccard: typeof cfg.minJaccard === "number" ? cfg.minJaccard : 0.85,
    shingleSize: typeof cfg.shingleSize === "number" ? cfg.shingleSize : 3,
    maxBlocks: MAX_FUZZY_BLOCKS,
    minBlockChars,
  }, store)
}

// ─── 主编排（对应上游 sessionDedupEngine.apply） ─────────────────────────────

export function applySessionDedup(body, stepConfig) {
  stepConfig = stepConfig || {}
  if (stepConfig["enabled"] === false) return { body, compressed: false, stats: null }

  const minBlockChars =
    typeof stepConfig["minBlockChars"] === "number" ? stepConfig["minBlockChars"] : DEFAULT_MIN_BLOCK_CHARS

  const messages = body["messages"]
  if (!Array.isArray(messages) || messages.length === 0) {
    return { body, compressed: false, stats: null }
  }

  const start = Date.now()
  // 时间盒（moejs 250ms 请求钩子上游的硬约束）：dedup 是 best-effort，
  // 到点即停——已替换的保持正确，未处理的少压缩。上游原话：
  // "skipping the tail only forgoes some compression, never changes output correctness"。
  // No time box by default: a deadline that bites under load turns the same request
    // into two different request bodies, and a body that changes is a body the
    // provider's prompt cache can never reuse. Set timeBudgetMs to trade that away.
    const budgetMs = typeof stepConfig["timeBudgetMs"] === "number" ? stepConfig["timeBudgetMs"] : 0
  const deadline =
    typeof stepConfig["deadlineAt"] === "number"
      ? stepConfig["deadlineAt"] // 测试注入：绝对时间戳
      : budgetMs > 0
        ? start + budgetMs
        : 0 // <=0 表示不限
  const blockMap = new Map()
  const { messages: exactMessages, dedupCount, dedupMap } = processMessages(messages, minBlockChars, blockMap, deadline)
  const store = new Map()
  const { messages: finalMessages, fuzzyCount } = runFuzzyPass(
    exactMessages,
    stepConfig,
    minBlockChars,
    callerSupportsCcrRetrieve(body),
    store
  )

  if (dedupCount + fuzzyCount === 0) return { body, compressed: false, stats: null, blockMap, dedupMap }

  const newBody = { ...body, messages: finalMessages }
  const durationMs = Math.round(Date.now() - start)
  const techniques = ["session-dedup"]
  if (fuzzyCount > 0) techniques.push("fuzzy-dedup")
  const stats = createCompressionStats(body, newBody, "stacked", techniques)
  stats.durationMs = durationMs

  // fuzzy store 合流进还原图（exact dedup 的块已在 Pass 1 进入 blockMap）
  for (const [k, v] of store) blockMap.set(k, v)

  return { body: newBody, compressed: true, stats, dedupCount, fuzzyCount, blockMap }
}

// ─── round-trip 还原（map 来自 ctx.state；差异说明 4） ───────────────────────

export function restoreDedup(text, map) {
  return text.replace(/\[dedup:ref sha=([0-9a-f]{24})\]/g, (m, sha) =>
    map && map[sha] !== undefined ? map[sha] : m
  )
}

// ─── 中间件引擎包装 ──────────────────────────────────────────────────────────

export const id = "session-dedup"
export const defaultOn = true

export function apply(body, ctx, cfg) {
  if (!body || typeof body !== "object") return false
  const r = applySessionDedup(body, cfg)
  if (!r.compressed) return false
  body.messages = r.body.messages
  if (ctx && ctx.state) {
    // sha → 原文，供 onResponse/测试 round-trip 还原；不进发往供应商的 body
    const map = Object.fromEntries(r.dedupMap || [])
    for (const [k, v] of r.blockMap || []) if (!(k in map)) map[k] = v
    ctx.state.sessionDedup = {
      dedupCount: r.dedupCount,
      fuzzyCount: r.fuzzyCount,
      stats: r.stats,
      map,
    }
  }
  return true
}
