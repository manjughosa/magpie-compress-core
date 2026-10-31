#!/usr/bin/env node
// omniroute_ccr_retrieve —— CCR marker 的兑现端（上游 OmniRoute ccrTools.ts 的
// 无依赖移植）。网关插件不能替模型执行工具调用（magpie 无 onToolCall 钩子），
// 所以取回走标准 MCP：本脚本是 stdio MCP server，由调用方 agent 的 MCP 客户端
// 拉起。声明了本工具的 body 才会被 ccr 引擎压缩（上游 #7746 门控）。
//
// 安装（调用方 agent 侧，一次性）：
//   magpie library mcp add ccr-retrieve node <本文件绝对路径>
//
// store 文件解析顺序：argv[2] > CCR_STORE_PATH > 与宿主相同的默认
// （$COMPRESS_CORE_DATA_DIR/ccr-store.json 或 <magpie配置目录>/compress-core/ccr-store.json）。
// 协议：MCP stdio = 换行分隔的 JSON-RPC 2.0。
import { createInterface } from "node:readline"
import { readFile, rename, writeFile, mkdir, stat, open, unlink } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import {
  queryBlock, retrieveBlock, recordRetrieval, utf8ByteLength,
} from "../engines/ccr/index.js"
import { hydrateCcrStore, serializeCcrStore } from "../ccr-store-file.js"

const TOOL_NAME = "omniroute_ccr_retrieve"
const MAX_FULL_BYTES = 256 * 1024 // 与上游 MAX_CCR_MCP_FULL_BYTES 一致

export function resolveStoreFile(argv = process.argv.slice(2), env = process.env) {
  if (argv[0]) return argv[0]
  if (env.CCR_STORE_PATH) return env.CCR_STORE_PATH
  const xdg = env.XDG_CONFIG_HOME ? join(env.XDG_CONFIG_HOME, "magpie") : null
  const base = env.MAGPIE_CONFIG_DIR || xdg || join(homedir(), ".config", "magpie")
  return join(env.COMPRESS_CORE_DATA_DIR || join(base, "compress-core"), "ccr-store.json")
}

// ── store 的读（mtime 缓存）与 retrievalCounts 的合并写 ─────────────────────

let cache = { file: null, mtimeMs: -1, store: null }

async function loadStore(file) {
  let mtimeMs = 0
  try { mtimeMs = (await stat(file)).mtimeMs } catch { /* 文件不存在 = 空 store */ }
  if (cache.file === file && cache.mtimeMs === mtimeMs && cache.store) return cache.store
  let store = hydrateCcrStore(null)
  if (mtimeMs > 0) {
    try {
      const text = await readFile(file, "utf8")
      if (text.length <= 80 * 1024 * 1024) store = hydrateCcrStore(JSON.parse(text))
    } catch { /* 坏文件当空 store，fail-open */ }
  }
  cache = { file, mtimeMs, store }
  return store
}

// Two MCP server processes can call persistCounts at once; an unlocked
// read-modify-write loses whichever increment lands between the read and the
// rename. A lock file serialises the window (same 0o600 sidecar idea as magpie's
// plugin-auth.json.lock). Stale locks are broken after LOCK_STALE_MS.
const LOCK_WAIT_MS = 2000
const LOCK_STALE_MS = 15000

async function acquireLock(file) {
  const lock = file + ".lock"
  const deadline = Date.now() + LOCK_WAIT_MS
  for (;;) {
    try {
      const handle = await open(lock, "wx")
      return { lock, handle }
    } catch {
      try {
        const st = await stat(lock)
        if (Date.now() - st.mtimeMs > LOCK_STALE_MS) { await unlink(lock); continue }
      } catch { /* lock vanished between open and stat: retry */ }
      if (Date.now() >= deadline) return null
      await new Promise((r) => setTimeout(r, 15))
    }
  }
}

async function releaseLock(held) {
  if (!held) return
  try { await held.handle.close() } catch { /* already closed */ }
  try { await unlink(held.lock) } catch { /* already gone */ }
}

/** 取回计数写回文件（ramp 靠它跨进程生效）。读-改-写，计数按 key 取 max。 */
async function persistCounts(file, store) {
  const held = await acquireLock(file)
  try {
    let base = serializeCcrStore(store)
    try {
      const disk = hydrateCcrStore(JSON.parse(await readFile(file, "utf8")))
      base = serializeCcrStore(store) // 条目以磁盘为准，本进程不写条目
      base.entries = serializeCcrStore(disk).entries
      for (const [k, v] of disk.retrievalCounts) {
        const idx = base.retrievalCounts.findIndex(([dk]) => dk === k)
        if (idx === -1) base.retrievalCounts.push([k, v])
        else if (v > base.retrievalCounts[idx][1]) base.retrievalCounts[idx][1] = v
      }
    } catch { /* 没有旧文件：直接写 */ }
    await mkdir(dirname(file), { recursive: true })
    const tmp = `${file}.mcp.tmp`
    await writeFile(tmp, JSON.stringify(base))
    await rename(tmp, file)
    cache.mtimeMs = -1 // 自己写的也让下次读重新加载
  } catch { /* 计数丢失只影响 ramp 精度，不影响取回正确性 */ }
  finally { await releaseLock(held) }
}

// ── 工具实现 ────────────────────────────────────────────────────────────────

export async function callRetrieve(args, storeFile) {
  const store = await loadStore(storeFile)
  if (!args || typeof args.hash !== "string" || !/^[0-9a-f]{24}$/.test(args.hash)) {
    return { error: "hash parameter is required and must be 24 lowercase hex characters" }
  }
  const block = retrieveBlock(store, args.hash, args.principalId)
  if (block === null) {
    return { error: `CCR block not found for hash=${args.hash}. The block may have expired or the hash is invalid.` }
  }
  recordRetrieval(store, args.hash, args.principalId)
  await persistCounts(storeFile, store)
  const mode = args.mode || "full"
  if (mode === "full" && utf8ByteLength(block) > MAX_FULL_BYTES) {
    return {
      error: `block is ${utf8ByteLength(block)} bytes, over the ${MAX_FULL_BYTES}-byte full-retrieval limit`,
      tooLargeForFull: true,
      suggestedModes: ["head", "tail", "lines", "grep", "stats"],
    }
  }
  return queryBlock(block, args)
}

const TOOL_DEF = {
  name: TOOL_NAME,
  description:
    "Retrieve the original text behind a [CCR retrieve hash=<24hex> chars=N] marker. " +
    "Copy the hash exactly. Modes: full (default, ≤256KiB), head/tail (n lines), " +
    "lines (start,end 1-indexed), grep (pattern, unique), stats.",
  inputSchema: {
    type: "object",
    properties: {
      hash: { type: "string", pattern: "^[0-9a-f]{24}$" },
      mode: { type: "string", enum: ["full", "head", "tail", "lines", "grep", "stats"] },
      n: { type: "number" },
      start: { type: "number" },
      end: { type: "number" },
      pattern: { type: "string" },
      unique: { type: "boolean" },
    },
    required: ["hash"],
  },
}

// ── JSON-RPC 层（与 stdio 解耦，测试直接调 handleRpc） ──────────────────────

export async function handleRpc(msg, storeFile) {
  if (!msg || msg.jsonrpc !== "2.0" || typeof msg.method !== "string") return null
  const reply = (result) => (msg.id === undefined ? null : { jsonrpc: "2.0", id: msg.id, result })
  const fail = (code, message) => (msg.id === undefined ? null : { jsonrpc: "2.0", id: msg.id, error: { code, message } })
  switch (msg.method) {
    case "initialize":
      return reply({
        protocolVersion: msg.params?.protocolVersion || "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "compress-core-ccr-retrieve", version: "1.0.0" },
      })
    case "ping":
      return reply({})
    case "tools/list":
      return reply({ tools: [TOOL_DEF] })
    case "tools/call": {
      if (msg.params?.name !== TOOL_NAME) return fail(-32602, `unknown tool: ${String(msg.params?.name)}`)
      const out = await callRetrieve(msg.params.arguments || {}, storeFile)
      const text = out.error
        ? (out.tooLargeForFull ? `${out.error}\nsuggestedModes: ${out.suggestedModes.join(", ")}` : out.error)
        : String(out.content)
      return reply({ content: [{ type: "text", text }], isError: !!out.error })
    }
    default:
      if (msg.method.startsWith("notifications/")) return null
      return fail(-32601, `method not found: ${msg.method}`)
  }
}

// ── stdio 入口 ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]
if (isMain) {
  const storeFile = resolveStoreFile()
  const rl = createInterface({ input: process.stdin, terminal: false })
  rl.on("line", async (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    let msg
    try { msg = JSON.parse(trimmed) } catch { return }
    const out = await handleRpc(msg, storeFile).catch((e) => ({
      jsonrpc: "2.0", id: msg?.id, error: { code: -32603, message: String(e?.message || e) },
    }))
    if (out) process.stdout.write(JSON.stringify(out) + "\n")
  })
}
