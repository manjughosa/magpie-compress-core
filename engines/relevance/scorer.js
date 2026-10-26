// engines/relevance/scorer.js — 句子打分器
// 逐字移植自 OmniRoute: open-sse/services/compression/engines/relevance/scorer.ts（85 行）
//
// 算法（上游原样，一行没改）：
//   score(sentence) = max(0, jaccard(sentence_tokens, query_tokens)
//                           - boilerplateRatio(sentence_tokens) * boilerplateWeight)
//   tokenize 只认 [a-z0-9] 连续段（手写 charCode 扫描，不是正则）——上游如此，照搬。
//
// 适配点：
//   1. 去掉 `import type { RelevanceConfig }`（纯类型，运行期不存在）。
//   2. 其余逻辑、常量、注释语义逐字保留。
//
// 砍掉的东西：无。

// 空话/套话词表。命中越多，句子分越低（乘 boilerplateWeight）。
const BOILERPLATE_TOKENS = new Set([
  "please",
  "note",
  "important",
  "indeed",
  "certainly",
  "basically",
  "essentially",
  "obviously",
  "clearly",
  "simply",
  "just",
  "really",
  "actually",
  "honestly",
  "conclusion",
  "summary",
  "hope",
  "understand",
  "thing",
  "things",
  "something",
])

/**
 * 切成小写字母数字 token。手写扫描而非正则 split：上游为了确定性这样做，逐字保留。
 */
function tokenize(text) {
  const lower = text.toLowerCase()
  const tokens = []
  let start = -1
  for (let i = 0; i <= lower.length; i++) {
    const ch = i < lower.length ? lower.charCodeAt(i) : -1
    const isAlnum = ch !== -1 && ((ch >= 97 && ch <= 122) || (ch >= 48 && ch <= 57))
    if (isAlnum) {
      if (start === -1) start = i
    } else {
      if (start !== -1) {
        tokens.push(lower.slice(start, i))
        start = -1
      }
    }
  }
  return tokens
}

/** Jaccard 相似度。任一集合为空 → 0。 */
function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0
  let intersection = 0
  for (const t of setA) {
    if (setB.has(t)) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** 空话词占比。 */
function boilerplateScore(tokens) {
  if (tokens.length === 0) return 0
  let count = 0
  for (const t of tokens) {
    if (BOILERPLATE_TOKENS.has(t)) count++
  }
  return count / tokens.length
}

/**
 * 给每个句子打分，返回与 sentences 等长的分数数组。
 * query 为空 → 全 0（上游行为：调用方会因此丢掉所有非强制保留句，
 * 但 relevance 引擎在 query 为空时根本不进这条路，见 index.js）。
 */
export function scoreSentences(sentences, query, cfg) {
  if (sentences.length === 0) return []
  if (!query || query.trim().length === 0) return sentences.map(() => 0)

  const queryTokens = new Set(tokenize(query))

  return sentences.map((sentence) => {
    const sentTokens = tokenize(sentence)
    if (sentTokens.length === 0) return 0
    const sentSet = new Set(sentTokens)
    const overlap = jaccard(sentSet, queryTokens)
    const boilerplate = boilerplateScore(sentTokens) * cfg.boilerplateWeight
    return Math.max(0, overlap - boilerplate)
  })
}

export { BOILERPLATE_TOKENS, tokenize, jaccard, boilerplateScore }
