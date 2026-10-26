// engines/rtk/lineFilter.js — lineFilter.ts 移植（纯逻辑 + regex cache，零依赖）
// 来源：open-sse/services/compression/engines/rtk/lineFilter.ts
// 差异：zod 验证手工化；severity bypass 逻辑逐字保留。

import { smartTruncate } from "./smartTruncate.js"
import { deduplicateRepeatedLines } from "./deduplicator.js"
import { severityPattern } from "./severity.js"

const SEVERITY_PATTERN = severityPattern()

const regexCache = new Map()

function cachedRegExp(pattern, flags) {
  const key = `${pattern}::${flags}`
  const cached = regexCache.get(key)
  if (cached) return cached
  try {
    const re = new RegExp(pattern, flags)
    regexCache.set(key, re)
    return re
  } catch {
    return null
  }
}

function compilePatterns(patterns) {
  return patterns.flatMap((pattern) => {
    const re = cachedRegExp(pattern, "i")
    return re ? [re] : []
  })
}

function compileGlobalPattern(pattern) {
  return cachedRegExp(pattern, "g")
}

function compileBlobPattern(pattern) {
  return cachedRegExp(pattern, "im")
}

function stripAnsi(text) {
  return text.replace(/\[[0-?]*[ -/]*[@-~]/g, "")
}

function normalizeStderrPrefix(line) {
  return line.replace(/^\s*(?:stderr|err)\s*(?:\||:)\s*/i, "")
}

function truncateUnicodeSafe(line, maxChars) {
  if (maxChars <= 0) return line
  const chars = Array.from(line)
  if (chars.length <= maxChars) return line
  if (maxChars <= 3) return chars.slice(0, maxChars).join("")
  return `${chars.slice(0, maxChars - 3).join("")}...`
}

export function applyLineFilter(text, filter) {
  const stripPatterns = compilePatterns(filter.stripPatterns)
  const keepPatterns = compilePatterns(filter.keepPatterns)
  const collapsePatterns = compilePatterns(filter.collapsePatterns)
  const priorityPatterns = compilePatterns(filter.priorityPatterns)
  const appliedRules = []

  let lines = text.split(/\r?\n/)
  const originalLineCount = lines.length

  if (filter.stripAnsi) {
    const stripped = lines.map(stripAnsi)
    if (stripped.join("\n") !== lines.join("\n")) {
      appliedRules.push(`${filter.id}:strip-ansi`)
    }
    lines = stripped
  }

  if (filter.filterStderr) {
    const normalized = lines.map(normalizeStderrPrefix)
    if (normalized.join("\n") !== lines.join("\n")) {
      appliedRules.push(`${filter.id}:filter-stderr`)
    }
    lines = normalized
  }

  for (const rule of filter.replace) {
    const pattern = compileGlobalPattern(rule.pattern)
    if (!pattern) continue
    const replaced = lines.map((line) => line.replace(pattern, rule.replacement))
    if (replaced.join("\n") !== lines.join("\n")) {
      appliedRules.push(`${filter.id}:replace`)
    }
    lines = replaced
  }

  if (filter.matchOutput.length > 0) {
    const blob = lines.join("\n")
    for (const rule of filter.matchOutput) {
      const pattern = compileBlobPattern(rule.pattern)
      if (!pattern?.test(blob)) continue
      const unless = rule.unless ? compileBlobPattern(rule.unless) : null
      if (unless?.test(blob)) continue
      appliedRules.push(`${filter.id}:match-output`)
      return {
        text: rule.message,
        strippedLines: Math.max(0, originalLineCount - 1),
        keptByRule: false,
        appliedRules,
      }
    }
  }

  if (stripPatterns.length > 0) {
    lines = lines.filter((line) => !stripPatterns.some((pattern) => pattern.test(line)))
    if (lines.length !== originalLineCount) appliedRules.push(`${filter.id}:strip`)
  }

  if (keepPatterns.length > 0) {
    const kept = lines.filter(
      (line) => keepPatterns.some((pattern) => pattern.test(line)) || SEVERITY_PATTERN.test(line)
    )
    if (kept.length > 0) {
      lines = kept
      appliedRules.push(`${filter.id}:keep`)
    }
  }

  if (collapsePatterns.length > 0) {
    const seen = new Set()
    lines = lines.filter((line) => {
      if (!collapsePatterns.some((pattern) => pattern.test(line))) return true
      const key = line.trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    appliedRules.push(`${filter.id}:collapse`)
  }

  if (filter.truncateLineAt > 0) {
    const truncatedLines = lines.map((line) => truncateUnicodeSafe(line, filter.truncateLineAt))
    if (truncatedLines.join("\n") !== lines.join("\n")) {
      lines = truncatedLines
      appliedRules.push(`${filter.id}:truncate-line`)
    }
  }

  if (filter.deduplicate) {
    const deduped = deduplicateRepeatedLines(lines.join("\n"))
    if (deduped.collapsed > 0) {
      lines = deduped.text.split(/\r?\n/)
      appliedRules.push(`${filter.id}:deduplicate`)
    }
  }

  const truncated = smartTruncate(lines.join("\n"), {
    maxLines: filter.maxLines,
    preserveHead: filter.preserveHead,
    preserveTail: filter.preserveTail,
    priorityPatterns,
  })
  if (truncated.truncated) appliedRules.push(`${filter.id}:truncate`)
  const output =
    truncated.text.trim().length === 0 && filter.onEmpty ? filter.onEmpty : truncated.text

  return {
    text: output,
    strippedLines: Math.max(0, originalLineCount - output.split(/\r?\n/).length),
    keptByRule: keepPatterns.length > 0,
    appliedRules,
  }
}
