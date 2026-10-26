// engines/rtk/severity.js — severityVocabulary.ts 移植（纯常量，零依赖）
// 来源：open-sse/services/compression/engines/rtk/severityVocabulary.ts

export const SEVERITY_WORDS = [
  "error",
  "failed",
  "failure",
  "exception",
  "traceback",
  "fail",
  "ts\\d{4}",
  "✖",
  "panic",
  "fatal",
  "critical",
  "severe",
  "oomkilled",
  "out of memory",
  "denied",
  "timeout",
  "timed out",
  "unreachable",
  "refused",
  "aborted",
  "rollback",
  "corrupt",
  "deadlock",
]

export const SEVERITY_ALTERNATION = SEVERITY_WORDS.join("|")

export function severityPattern() {
  return new RegExp(SEVERITY_ALTERNATION, "i")
}

export function severityWordPattern() {
  return new RegExp(`\\b(${SEVERITY_ALTERNATION})\\b`, "i")
}

export function severityPatternStrings() {
  return [...SEVERITY_WORDS]
}
