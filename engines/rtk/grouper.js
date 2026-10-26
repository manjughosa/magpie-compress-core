// engines/rtk/grouper.js — grouper.ts 逐字移植（纯逻辑，零依赖）
// 来源：open-sse/services/compression/engines/rtk/grouper.ts

export function normalizeLine(line) {
  let s = line
  // ISO timestamps like 2024-01-15T10:30:00.123Z or 2024-01-15 10:30:00
  s = s.replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?/g, "<N>")
  // Bracketed date+time like [2024-01-01 10:00:00]
  s = s.replace(/\[\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\]/g, "[<N>]")
  // Hex ids: 6-40 hex chars
  s = s.replace(/\b[0-9a-fA-F]{6,40}\b/g, "<N>")
  // Semantic version tokens like v1.2.3 or 1.2.3
  s = s.replace(/\bv?\d+\.\d+\.\d+(?:\.\d+)*\b/g, "<N>")
  // Standalone integers
  s = s.replace(/\b\d+\b/g, "<N>")
  // Collapse repeated whitespace
  s = s.replace(/\s+/g, " ")
  return s.trim()
}

export function groupSimilarLines(text, options = {}) {
  const threshold = Math.max(2, Math.floor(options.threshold ?? 3))
  const lines = text.split(/\r?\n/)
  const output = []
  let grouped = 0

  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const normalised = normalizeLine(line)

    let runLength = 1
    while (
      index + runLength < lines.length &&
      normalizeLine(lines[index + runLength]) === normalised
    ) {
      runLength++
    }

    if (runLength >= threshold) {
      output.push(`${line} [rtk:grouped ×${runLength}]`)
      grouped += runLength - 1
      index += runLength
    } else {
      output.push(line)
      index++
    }
  }

  return { text: output.join("\n"), grouped }
}
