// test/rtk.test.mjs — RTK 引擎移植的验证
// 范围：命令检测、dedup、grouping、smartTruncate、filter 匹配、
// tool_call lookup、Anthropic tool_result blocks、intensity 缩放、
// cache_control 保护、document-like 跳过、middleware 端到端。

import { check, ctxFor } from "./helpers.mjs"
import * as middleware from "../compress-core.middleware.js"
import * as rtk from "../engines/rtk/index.js"

export const name = "rtk"

// ─── 测试语料 ───────────────────────────────────────────────────────────

const LONG_LOG = Array.from({ length: 200 }, (_, i) => `[info] log line ${i}`).join("\n")

const GIT_STATUS = `On branch main
Changes not staged for commit:
  (use "git add" to update)
\tmodified: src/app.ts
\tmodified: src/util.ts
nothing added to commit
`

const GIT_LOG = `commit abcdef1234567890abcdef1234567890abcdef12
Author: Dev <dev@example.com>
Date:   Mon Oct 20 10:00:00 2025 +0800

    feat: add rtk compression

commit 1234567890abcdef1234567890abcdef12345678
Author: Dev <dev@example.com>
Date:   Sun Oct 19 09:00:00 2025 +0800

    fix: session-dedup hash
`

const DOCKER_LOGS = `Attaching to api
2025-10-20T10:00:01 INFO started
2025-10-20T10:00:02 INFO connecting
2025-10-20T10:00:03 INFO connected
2025-10-20T10:00:04 INFO heartbeat
2025-10-20T10:00:05 ERROR failed to connect to db
2025-10-20T10:00:06 WARN retrying in 5s
2025-10-20T10:00:07 INFO heartbeat
2025-10-20T10:00:08 INFO heartbeat
`

const TS_ERRORS = `src/a.ts:1:1 - error TS2322: Type 'string' is not assignable to type 'number'.
src/b.ts:5:3 - error TS2345: Argument of type 'null' is not assignable
src/c.ts:10:1 - error TS2304: Cannot find name 'foo'
Found 3 errors.
`

const STACK_TRACE = `Error: boom
${Array.from({ length: 120 }, (_, i) => `    at fn (/repo/a.ts:${i + 1}:1)`).join("\n")}
Caused by: bad input
`

const REPEATED_LINES = Array.from({ length: 50 }, () => "same repeated line").join("\n")

const DOCUMENT_READ = `# README.md

This is a project readme file.

## Getting Started

Install dependencies and run the dev server.

## API Reference

See the docs folder for details.

The quick brown fox jumps over the lazy dog. Pack my box with five dozen liquor jugs.
How vexingly quick daft zebras jump! Bright vixens jump; dozy fowl quack.
Sphinx of black quartz, judge my vow. The five boxing wizards jump quickly.
`

// ─── 构造 body ──────────────────────────────────────────────────────────

function toolBody(toolName, command, output) {
  return {
    model: "claude-sonnet-4-20250514",
    messages: [
      { role: "user", content: "run this" },
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tu_1",
            name: toolName,
            input: { command: command || "" },
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tu_1",
            content: output,
          },
        ],
      },
    ],
  }
}

function openaiToolBody(toolName, command, output) {
  return {
    model: "gpt-5",
    messages: [
      { role: "user", content: "run this" },
      {
        role: "assistant",
        content: null,
        tool_calls: [
          {
            id: "call_1",
            type: "function",
            function: { name: toolName, arguments: JSON.stringify({ command: command || "" }) },
          },
        ],
      },
      { role: "tool", tool_call_id: "call_1", content: output },
    ],
  }
}

// ─── 测试 ───────────────────────────────────────────────────────────────

export function run() {
  // —— A 组：命令检测 ——

  {
    // A-01 git-status 内容匹配
    const body = toolBody("bash", "git status", GIT_STATUS)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    check("A-01 git-status 压缩", result.length < GIT_STATUS.length)
    check("A-01 git-status 保 branch", result.includes("On branch main"))
    check("A-01 git-status 保 modified", result.includes("modified: src/app.ts"))
  }

  {
    // A-02 docker-logs 匹配
    const body = toolBody("bash", "docker logs myapp", DOCKER_LOGS)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    check("A-02 docker-logs 压缩", result.length < DOCKER_LOGS.length)
    check("A-02 docker-logs 保 ERROR", result.includes("ERROR"))
  }

  // —— B 组：dedup ——

  {
    // B-01 重复行折叠
    const body = toolBody("bash", "npm install", REPEATED_LINES)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    check("B-01 重复行折叠", result.includes("[rtk:dropped") || result.length < REPEATED_LINES.length)
  }

  // —— C 组：smartTruncate ——

  {
    // C-01 长文本截断
    const body = toolBody("bash", "cat log.txt", LONG_LOG)
    rtk.apply(body, ctxFor("chat"), { enabled: true, maxLinesPerResult: 50 })
    const result = body.messages[2].content[0].content
    check("C-01 截断", result.length < LONG_LOG.length)
    check("C-01 保头", result.includes("[info] log line 0"))
  }

  {
    // C-02 截断保尾
    const body = toolBody("bash", "cat log.txt", LONG_LOG)
    rtk.apply(body, ctxFor("chat"), { enabled: true, maxLinesPerResult: 50 })
    const result = body.messages[2].content[0].content
    check("C-02 保尾", result.includes("[info] log line 199") || result.includes("truncated"))
  }

  // —— D 组：intensity ——

  {
    // D-01 aggressive 更短
    const body1 = toolBody("bash", "cat log.txt", LONG_LOG)
    rtk.apply(body1, ctxFor("chat"), { enabled: true, maxLinesPerResult: 50, intensity: "standard" })
    const r1 = body1.messages[2].content[0].content

    const body2 = toolBody("bash", "cat log.txt", LONG_LOG)
    rtk.apply(body2, ctxFor("chat"), { enabled: true, maxLinesPerResult: 50, intensity: "aggressive" })
    const r2 = body2.messages[2].content[0].content

    check("D-01 aggressive更短", r2.length <= r1.length)
  }

  // —— E 组：保护 ——

  {
    // E-01 非 shell 工具跳 filter
    const body = toolBody("read", null, DOCUMENT_READ)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    // document-like read 且 skipFilters → 不应被 filter 压缩
    check("E-01 非shell不动", result === DOCUMENT_READ)
  }

  {
    // E-02 document-like 跳过截断
    const body = toolBody("bash", null, DOCUMENT_READ)
    rtk.apply(body, ctxFor("chat"), { enabled: true, maxLinesPerResult: 5 })
    const result = body.messages[2].content[0].content
    // 无 command 且无 error markers → isDocumentLikeRead → 跳过截断
    check("E-02 document不截断", result === DOCUMENT_READ)
  }

  {
    // E-03 cache_control 保护
    const body = {
      model: "claude-sonnet-4-20250514",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "tu_1",
              content: LONG_LOG,
              cache_control: { type: "ephemeral" },
            },
          ],
        },
      ],
    }
    rtk.apply(body, ctxFor("chat"), { enabled: true, maxLinesPerResult: 10 })
    check("E-03 cache_control保护", body.messages[0].content[0].content === LONG_LOG)
  }

  // —— F 组：开关 ——

  {
    // F-01 enabled:false 不动
    const body = toolBody("bash", "git status", GIT_STATUS)
    const r = rtk.apply(body, ctxFor("chat"), { enabled: false })
    check("F-01 关闭返false", r === false)
    check("F-01 关闭不动", body.messages[2].content[0].content === GIT_STATUS)
  }

  {
    // F-02 applyToToolResults:false 不动 tool_result
    const body = toolBody("bash", "git status", GIT_STATUS)
    rtk.apply(body, ctxFor("chat"), { enabled: true, applyToToolResults: false })
    check("F-02 不动tool_result", body.messages[2].content[0].content === GIT_STATUS)
  }

  // —— G 组：OpenAI shape ——

  {
    // G-01 OpenAI tool message
    const body = openaiToolBody("bash", "git status", GIT_STATUS)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    check("G-01 OpenAI压缩", body.messages[2].content.length < GIT_STATUS.length)
  }

  // —— H 组：state 留痕 ——

  {
    const body = toolBody("bash", "git status", GIT_STATUS)
    const ctx = ctxFor("chat")
    rtk.apply(body, ctx, { enabled: true })
    check("H-01 state.rtk", ctx.state.rtk && ctx.state.rtk.techniquesUsed.length > 0)
  }

  // —— I 组：middleware 端到端 ——

  {
    const body = toolBody("bash", "git status", GIT_STATUS)
    middleware.onRequest(body, ctxFor("chat", {
      strategies: { lite: false, "session-dedup": false, headroom: false, "codex-responses": false, rtk: true },
    }))
    check("I-01 经middleware", body.messages[2].content[0].content.length < GIT_STATUS.length)
  }

  {
    // I-02 默认关闭（defaultOn=false）
    const body = toolBody("bash", "git status", GIT_STATUS)
    middleware.onRequest(body, ctxFor("chat", {}))
    check("I-02 默认关闭", body.messages[2].content[0].content === GIT_STATUS)
  }

  // —— J 组：build-typescript ——

  {
    const body = toolBody("bash", "tsc", TS_ERRORS)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    check("J-01 TS错误保error", result.includes("error TS2322"))
    check("J-01 TS错误保Found", result.includes("Found 3 errors"))
  }

  // —— K 组：error-stacktrace ——

  {
    const body = toolBody("bash", "node app.js", STACK_TRACE)
    rtk.apply(body, ctxFor("chat"), { enabled: true })
    const result = body.messages[2].content[0].content
    check("K-01 stacktrace压缩", result.length < STACK_TRACE.length)
    check("K-01 stacktrace保Error", result.includes("Error: boom"))
    check("K-01 stacktrace保CausedBy", result.includes("Caused by:"))
  }
}
