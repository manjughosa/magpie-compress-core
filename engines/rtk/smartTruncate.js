// engines/rtk/smartTruncate.js — smartTruncate.ts 逐字移植（纯逻辑，零依赖）
// 来源：open-sse/services/compression/engines/rtk/smartTruncate.ts

export function smartTruncate(text, options = {}) {
  const maxChars = Math.max(0, Math.floor(options.maxChars ?? 0))
  const maxLines = Math.max(0, Math.floor(options.maxLines ?? 0))
  const lines = text.split(/\r?\n/)
  const overLineLimit = maxLines > 0 && lines.length > maxLines
  const overCharLimit = maxChars > 0 && text.length > maxChars
  if (!overLineLimit && !overCharLimit) {
    return { text, truncated: false, droppedLines: 0 }
  }

  const preserveHead = Math.max(0, Math.floor(options.preserveHead ?? 20))
  const preserveTail = Math.max(0, Math.floor(options.preserveTail ?? 20))
  const priorityPatterns = options.priorityPatterns ?? []
  const priorityLines = priorityPatterns.length
    ? lines.filter((line) => priorityPatterns.some((pattern) => pattern.test(line)))
    : []

  const head = lines.slice(0, preserveHead)
  const tail = preserveTail > 0 ? lines.slice(-preserveTail) : []
  const selected = [...head]
  for (const line of priorityLines) {
    if (!selected.includes(line)) selected.push(line)
  }
  const tailStart = lines.length - tail.length
  tail.forEach((line, offset) => {
    const originalIndex = tailStart + offset
    if (originalIndex >= preserveHead && !selected.includes(line)) selected.push(line)
  })

  const droppedLines = Math.max(0, lines.length - selected.length)
  let result = [
    ...selected.slice(0, head.length),
    `[rtk:truncated ${droppedLines} lines]`,
    ...selected.slice(head.length),
  ].join("\n")

  if (maxChars > 0 && result.length > maxChars) {
    const marker = "\n[rtk:truncated by chars]\n"
    const budget = Math.max(0, maxChars - marker.length)
    if (budget === 0) {
      result = marker.slice(0, maxChars)
      return { text: result, truncated: true, droppedLines }
    }
    const lines2 = result.split(/\r?\n/)
    const ranked = []
    for (const pattern of priorityPatterns) {
      let hits = 0
      for (const line of lines) if (pattern.test(line)) hits += 1
      if (hits > 0 && hits * 2 <= lines2.length) ranked.push({ pattern, hits })
    }
    ranked.sort((a, b) => a.hits - b.hits)

    const forcedCap = Math.floor(budget / 2)
    const seen = new Set()
    const forced = []
    let forcedLength = 0
    for (const entry of ranked) {
      for (const line of lines) {
        if (seen.has(line)) continue
        if (!entry.pattern.test(line)) continue
        const cost = line.length + 1
        if (cost > forcedCap - forcedLength) continue
        seen.add(line)
        forced.push(line)
        forcedLength += cost
      }
    }

    const rest = Math.max(0, budget - forcedLength)
    const headChars = Math.ceil(rest * 0.55)
    const tailChars = Math.max(0, rest - headChars)
    const headText = rest > 0 ? result.slice(0, headChars) : ""
    const tailText = tailChars > 0 ? result.slice(-tailChars) : ""
    const forcedText = forced
      .filter((line) => !headText.includes(line) && !tailText.includes(line))
      .join("\n")
    result = `${headText}${marker}${forcedText ? `${forcedText}\n` : ""}${tailText}`
    if (result.length > maxChars) result = result.slice(0, maxChars)
  }

  return { text: result, truncated: true, droppedLines }
}
