// engines/rtk/splitCommand.js — splitCompositeCommand.ts 逐字移植（纯字符扫描，零依赖）
// 来源：open-sse/services/compression/engines/rtk/splitCompositeCommand.ts

export function lastCommandSegment(command) {
  if (!command) return command

  const segments = []
  let current = 0
  let depth = 0
  let inSingle = false
  let inDouble = false
  let inBacktick = false

  const push = (end) => {
    segments.push(command.slice(current, end))
  }

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]

    if (inSingle) {
      if (ch === "'") inSingle = false
      continue
    }
    if (inBacktick) {
      if (ch === "`") inBacktick = false
      continue
    }
    if (inDouble) {
      if (ch === '"') inDouble = false
      if (ch === "$" && command[i + 1] === "(") {
        depth++
        i++
      }
      continue
    }
    if (depth > 0) {
      if (ch === "(") depth++
      else if (ch === ")") depth--
      continue
    }

    if (ch === "'") {
      inSingle = true
      continue
    }
    if (ch === '"') {
      inDouble = true
      continue
    }
    if (ch === "`") {
      inBacktick = true
      continue
    }
    if (ch === "$" && command[i + 1] === "(") {
      depth++
      i++
      continue
    }
    if (ch === "(") {
      depth++
      continue
    }

    if (ch === "&" && command[i + 1] === "&") {
      push(i)
      i += 1
      current = i + 1
      continue
    }
    if (ch === "|" && command[i + 1] === "|") {
      push(i)
      i += 1
      current = i + 1
      continue
    }
    if (ch === ";") {
      push(i)
      current = i + 1
      continue
    }
  }

  push(command.length)

  if (segments.length === 1) {
    return command
  }

  for (let i = segments.length - 1; i >= 0; i--) {
    const trimmed = segments[i].trim()
    if (trimmed) return trimmed
  }

  return command
}
