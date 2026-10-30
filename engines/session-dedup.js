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
//   6. 【task-2 改造，有意的行为放宽】块粒度：上游只认「从某行到消息末尾」的
//      后缀块——真实对话里重复内容两端常贴着别的话，suffix 对齐等于结构性
//      0 命中（最近 50 条回放 0 中，还白烧 ~170ms）。本移植放宽为两类块的并集：
//      a) 段落块：空行（\n{2,}）切分的整段，≥ minBlockChars，不限行数；
//      b) 后缀行块：保留上游语义（≥3 行、≥ minBlockChars、到消息末尾），
//         覆盖「前缀行紧贴重复块、无空行分隔」的形态。
//      替换策略统一为「全局首次出现保留，其余出现（同消息内/跨消息）全部换成
//      marker」，区间内非重叠、长块优先。marker 格式与 round-trip 协议不变。
//      性能：后缀块改行级 rolling hash（fnv1a 行哈希 + Horner 双模合并），提取
//      全程 O(文本)，sha256 只对真正替换的块算；候选先按哈希聚类，替换前逐条
//      slice 比对原文，撞哈希不会错换。
//
// 协议覆盖：上游只认 body["messages"]（chat/anthropic）。responses/gemini 无 messages
// 数组时本引擎不动（与上游一致；扩展覆盖属于后续工作）。

import { sha256hex } from "../hash.js"
import { createCompressionStats } from "./lite.js"

const ENGINE_ID = "session-dedup"
const DEFAULT_MIN_BLOCK_CHARS = 80
const MIN_BLOCK_LINES = 3
const MAX_BLOCK_GROUPS = 4000 // 候选组上限：防爆内存，先到先服务（确定性）
const MAX_TOTAL_BLOCK_BYTES = 8 * 1024 * 1024

// ─── hash ────────────────────────────────────────────────────────────────────

function hashBlock(text) {
  // 24 hex / 96 bits。Pass 2 另验 owner.block === block，碰撞不会导致错误替换。
  return sha256hex(text).slice(0, 24)
}

// ─── block extraction（task-2：段落块 ∪ 后缀行块） ────────────────────────

// rolling hash 参数：两个 < 2^25 的模数，lh*pow < 2^48，远在 2^53 精度内。
const HASH_P1 = 16777213
const HASH_P2 = 33554393
const HASH_BASE = 257

function fnv1a32(s, start, end) {
  let h = 0x811c9dc5
  for (let i = start; i < end; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

// 返回 [{ start, end, key }]：key 相同 ≠ 内容相同（碰撞留给验证阶段 slice 比对）。
function extractBlocks(text, minBlockChars) {
  const out = []
  // 1) 段落块：空行切分，任意行数，≥ minBlockChars
  let segStart = 0
  const re = /\n{2,}/g
  let m
  while ((m = re.exec(text)) !== null) {
    if (m.index - segStart >= minBlockChars) {
      out.push({ start: segStart, end: m.index, key: "p:" + fnv1a32(text, segStart, m.index) })
    }
    segStart = m.index + m[0].length
  }
  if (text.length - segStart >= minBlockChars) {
    out.push({ start: segStart, end: text.length, key: "p:" + fnv1a32(text, segStart, text.length) })
  }
  // 2) 后缀行块（上游语义）：lines[i..end]，≥ MIN_BLOCK_LINES 行且 ≥ minBlockChars。
  //    rolling hash 只算键，不 materialize 任何后缀串。
  const lines = text.split("\n")
  const n = lines.length
  if (n >= MIN_BLOCK_LINES) {
    const starts = new Uint32Array(n)
    const lh1 = new Uint32Array(n)
    const lh2 = new Uint32Array(n)
    let off = 0
    for (let i = 0; i < n; i++) {
      starts[i] = off
      const h = fnv1a32(lines[i], 0, lines[i].length)
      lh1[i] = h % HASH_P1
      lh2[i] = h % HASH_P2
      off += lines[i].length + 1
    }
    let h1 = 0, h2 = 0, pow1 = 1, pow2 = 1
    for (let i = n - 1; i >= 0; i--) {
      h1 = (lh1[i] * pow1 + h1) % HASH_P1
      h2 = (lh2[i] * pow2 + h2) % HASH_P2
      const lineCount = n - i
      const clen = text.length - starts[i]
      if (lineCount >= MIN_BLOCK_LINES && clen >= minBlockChars) {
        out.push({ start: starts[i], end: text.length, key: "s:" + h1 + "_" + h2 })
      }
      pow1 = (pow1 * HASH_BASE) % HASH_P1
      pow2 = (pow2 * HASH_BASE) % HASH_P2
    }
  }
  return out
}

// ─── 统一 two-pass：全局首次出现保留，其余出现全替换 ────────────────────────

function dedupMessageTexts(msgTexts, minBlockChars, currentTurnStart, blockMap, deadline) {
  const deduped = new Map()
  let dedupCount = 0
  const over = () => deadline && Date.now() > deadline

  // 提取 + 全局分组（msgTexts 顺序 = 消息顺序，组内 entries 顺序 = 出现顺序）
  const groups = new Map()
  const perSlot = []
  for (let s = 0; s < msgTexts.length; s++) {
    const { msgIdx, messageIndex, text } = msgTexts[s]
    let blocks = []
    if (!over()) {
      blocks = extractBlocks(text, minBlockChars) // 时间盒：超时的 slot 退化为不参与
      for (const b of blocks) {
        let g = groups.get(b.key)
        if (!g) {
          g = []
          groups.set(b.key, g)
        }
        g.push({ slot: s, start: b.start, end: b.end })
      }
    }
    perSlot.push({ msgIdx, messageIndex, text })
  }

  // 候选组：验证（防哈希碰撞错换）→ owner=全局首次出现 → 其余出现进替换表
  const replPerSlot = new Map()
  let materialized = 0
  let groupCount = 0
  for (const entries of groups.values()) {
    if (entries.length < 2) continue
    if (over()) break
    if (++groupCount > MAX_BLOCK_GROUPS) break
    const first = entries[0]
    const block = perSlot[first.slot].text.slice(first.start, first.end)
    materialized += block.length
    if (materialized > MAX_TOTAL_BLOCK_BYTES) break
    const verified = [first]
    for (let k = 1; k < entries.length; k++) {
      const e = entries[k]
      const t = perSlot[e.slot].text
      if (e.end - e.start === block.length && t.slice(e.start, e.end) === block) verified.push(e)
    }
    if (verified.length < 2) continue
    const sha = hashBlock(block)
    if (blockMap && !blockMap.has(sha)) blockMap.set(sha, block)
    for (let k = 1; k < verified.length; k++) {
      const e = verified[k]
      let arr = replPerSlot.get(e.slot)
      if (!arr) {
        arr = []
        replPerSlot.set(e.slot, arr)
      }
      arr.push({ start: e.start, end: e.end, sha })
    }
  }

  // 应用替换：当前轮豁免；区间内非重叠（长优先、位置次之、sha 决胜）；从右往左 splice
  for (const [s, repls] of replPerSlot) {
    const slot = perSlot[s]
    if (slot.messageIndex >= currentTurnStart) continue
    repls.sort((a, b) =>
      (b.end - b.start) - (a.end - a.start) ||
      a.start - b.start ||
      (a.sha < b.sha ? -1 : a.sha > b.sha ? 1 : 0)
    )
    const accepted = []
    for (const r of repls) {
      if (over()) break
      let ok = true
      for (const a of accepted) {
        if (r.start < a.end && a.start < r.end) {
          ok = false
          break
        }
      }
      if (ok) accepted.push(r)
    }
    if (accepted.length === 0) continue
    accepted.sort((a, b) => b.start - a.start)
    let result = slot.text
    for (const r of accepted) {
      result = result.slice(0, r.start) + `[dedup:ref sha=${r.sha}]` + result.slice(r.end)
    }
    deduped.set(slot.msgIdx, result)
    dedupCount++
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

function processMessages(messages, minBlockChars, blockMap, deadline, preserveCurrentTurn) {
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

  // 当前轮 = 最后一条 assistant 之后；无 assistant → currentTurnStart=0 → 全部豁免。
  // 豁免只在 preserveCurrentTurn 打开时生效：豁免的代价是消息「从当前轮变成历史」的
  // 那一刻被改写一次，前缀随之改变，provider 的缓存从那一点起全部作废（review
  // blocking 第 2 条）。默认不豁免，同一份原文前缀永远压成同一串字节。
  let currentTurnStart = messages.length
  if (preserveCurrentTurn) {
    currentTurnStart = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        currentTurnStart = i + 1
        break
      }
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

  // 与 lite 同一个开关，默认 false：正在发送的这一轮也照常处理。只保护当前轮会让
  // 同一条消息在下一轮请求里被改写，前缀一变，provider 的缓存全部作废（review
  // blocking 第 2 条）。
  const preserveCurrentTurn = stepConfig["preserveCurrentTurn"] === true

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
  const { messages: exactMessages, dedupCount, dedupMap } = processMessages(
    messages,
    minBlockChars,
    blockMap,
    deadline,
    preserveCurrentTurn
  )
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

// configSchema —— 面板契约。catalog.js 的静态 fields 把 minJaccard / shingleSize 声明成
// 顶层数字旋钮，但 runFuzzyPass 只从 stepConfig.fuzzy 这个**子对象**里读它们
// （stepConfig.fuzzy.minJaccard）：顶层写这两个键引擎永远看不见。而上游的
// SESSION_DEDUP_SCHEMA 压根不暴露它们，只给 fuzzy 一个布尔开关。
// 面板渲染器只支持扁平类型（number / boolean / select / multiselect），画不出嵌套
// 子对象，所以这里按上游的契约给 fuzzy 一个布尔——引擎对布尔的解读是 { enabled: raw }。
// 要调 minJaccard / shingleSize 只能手写 options（strategies["session-dedup"] 写成
// { enabled: true, fuzzy: { enabled: true, minJaccard: 0.8 } }）。
export const configSchema = [
  {
    key: "minBlockChars",
    type: "number",
    label: "最小块字符",
    description: "小于这个长度的文本块不参与去重。",
    defaultValue: DEFAULT_MIN_BLOCK_CHARS,
    min: 20,
    max: 4000,
  },
  {
    key: "fuzzy",
    type: "boolean",
    label: "模糊近似去重",
    description:
      "把与更早消息相似度 ≥85% 的整条消息换成可取回的 CCR 引用。需要调用方带 CCR retrieve 工具，否则自动跳过。相似度阈值等细参只能手写 options。",
    defaultValue: false,
  },
  {
    key: "preserveCurrentTurn",
    type: "boolean",
    label: "保护当前轮",
    description:
      "默认关：正在发送的这一轮也照常去重，前缀严格稳定、缓存不失配。开启后当前轮原样送出，代价是它变成历史的那一轮被改写一次、缓存失配一次。",
    defaultValue: false,
  },
]

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
