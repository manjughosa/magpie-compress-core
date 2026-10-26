// engines/rtk/deduplicator.js — deduplicator.ts 逐字移植（纯逻辑，零依赖）
// 来源：open-sse/services/compression/engines/rtk/deduplicator.ts

export function deduplicateRepeatedLines(text, options = {}) {
  const threshold = Math.max(2, Math.floor(options.threshold ?? 3))
  const lines = text.split(/\r?\n/)
  const output = []
  let collapsed = 0

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]
    let runLength = 1
    while (index + runLength < lines.length && lines[index + runLength] === line) {
      runLength++
    }

    if (line.trim() && runLength >= threshold) {
      output.push(line)
      output.push(`[line repeated ${runLength - 1}x]`)
      output.push(`[rtk:dropped ${runLength - 1} repeated lines]`)
      collapsed += runLength - 1
      index += runLength - 1
      continue
    }

    output.push(line)
  }

  return { text: output.join("\n"), collapsed }
}
