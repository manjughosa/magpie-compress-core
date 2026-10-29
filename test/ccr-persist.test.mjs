// test/ccr-persist.test.mjs — task-3：跨请求持久 store + retrieve 工具链路。
// 覆盖：序列化/水合 round-trip、过期与大条目处理、共享 store 压缩→落盘→重载→
// 工具兑现原文（端到端 round-trip）、门控 reason、ramp 计数跨进程可见。

import { mkdtempSync } from "node:fs"
import { readFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { check, ctxFor } from "./helpers.mjs"
import {
  apply, applyCcr, makeStore, tryStoreBlock, retrieveBlock, recordRetrieval,
  shouldSkipCompression, hashContent, restoreCcr, buildCcrMarker,
} from "../engines/ccr/index.js"
import {
  serializeCcrStore, hydrateCcrStore, createPersistentCcrStore,
  PERSIST_MAX_ENTRY_BYTES,
} from "../ccr-store-file.js"
import { callRetrieve, handleRpc, resolveStoreFile } from "../mcp/ccr-retrieve-server.mjs"
import { runPipeline } from "../pipeline.js"

export const name = "ccr-persist"

const retrieveTool = { type: "function", function: { name: "omniroute_ccr_retrieve" } }
const big = (n) => {
  let s = ""
  let i = 0
  while (s.length < n) s += `report line ${i++} ${"y".repeat(50)}\n`
  return s.slice(0, n)
}

export async function run() {
  const dir = mkdtempSync(join(tmpdir(), "ccr-persist-"))
  const file = join(dir, "ccr-store.json")

  // P-1 序列化→水合 round-trip：条目内容与取回计数都在
  {
    const store = makeStore()
    const text = big(3000)
    const r = tryStoreBlock(store, text, "p1")
    recordRetrieval(store, r.hash, "p1")
    recordRetrieval(store, r.hash, "p1")
    const back = hydrateCcrStore(serializeCcrStore(store))
    check("P-1 水合后取回原文逐字节一致", retrieveBlock(back, r.hash, "p1") === text)
    check("P-1 取回计数随档存活", back.retrievalCounts.get(`p1 ${r.hash}`) === 2)
    check("P-1 总额重算一致", back.totalBytes === store.totalBytes)
  }

  // P-2 过期条目在水合时被丢掉
  {
    const doc = serializeCcrStore(makeStore())
    doc.entries.push(["p2 deadbeef", {
      hash: "deadbeef", principalId: "p2", content: "old", bytes: 3, chars: 3, lines: 1,
      contentType: "text/plain", source: "compression",
      createdAt: 1, lastAccessedAt: 1, expiresAt: Date.now() - 1000,
    }])
    const store = hydrateCcrStore(doc)
    check("P-2 过期条目不水合", store.entries.size === 0 && store.totalBytes === 0)
  }

  // P-3 >512KB 的块不进持久文件（上游口径：大块只活内存层）
  {
    const store = makeStore()
    const huge = "z".repeat(PERSIST_MAX_ENTRY_BYTES + 10)
    const r = tryStoreBlock(store, huge, "p3")
    check("P-3 大块在内存里能存", r.stored === true)
    const doc = serializeCcrStore(store)
    check("P-3 大块不落盘", doc.entries.length === 0)
  }

  // P-4 持久 handle：压缩 → flushNow → 新 handle 能读到
  {
    const h1 = createPersistentCcrStore(file)
    await h1.ready
    const text = big(4000)
    const r = tryStoreBlock(h1.get(), text, "p4")
    h1.persist()
    await h1.flushNow()
    const h2 = createPersistentCcrStore(file)
    await h2.ready
    check("P-4 落盘后新进程视角能取回", retrieveBlock(h2.get(), r.hash, "p4") === text)
  }

  // P-5 端到端：声明 retrieve 工具的 body → 共享 store 命中 → 落盘 →
  // 从磁盘水合 → handleCcrRetrieve 兑现原文（marker round-trip）
  {
    const text = big(5000)
    const body = {
      model: "m",
      tools: [retrieveTool],
      messages: [
        { role: "user", content: "hi" },
        { role: "assistant", content: text },
      ],
    }
    const shared = makeStore()
    let persisted = 0
    const r = applyCcr(body, {}, { protocol: "chat", store: shared, persistStore: () => persisted++ })
    check("P-5 共享 store 上 ccr 命中", r.compressed === true)
    check("P-5 触发了一次落盘回调", persisted === 1)
    const hash = Object.keys(r.map)[0]
    const marker = buildCcrMarker(hash, text.length)
    // 协议指令 unshift 到 messages[0]，assistant 段现在按 marker 定位
    const replacedMsg = body.messages.find((m) => typeof m.content === "string" && /\[CCR retrieve hash=[0-9a-f]{24} chars=\d+\]/.test(m.content))
    check("P-5 消息里是 preamble+marker", !!replacedMsg &&
      replacedMsg.content.includes(marker) && replacedMsg.content.length < text.length)
    // 模拟「另一个进程」：序列化→水合，只靠文件内容兑现
    const disk = hydrateCcrStore(serializeCcrStore(shared))
    const answer = retrieveBlock(disk, hash, undefined)
    check("P-5 marker 可经磁盘 store 兑现原文", answer === text)
    // restoreCcr 只把 marker 换回原文，preamble 前缀保留是上游设计（#7746）；
    // 所以断言是「marker 位被原文替换」，不是整段等于原文。
    const restored = restoreCcr(replacedMsg.content, { [hash]: answer })
    check("P-5 restoreCcr 把 marker 位换回原文", restored.endsWith(text) &&
      restored.length === replacedMsg.content.length - marker.length + text.length)
    // 协议指令已注入且幂等
    check("P-5 协议指令注入到 system", body.messages[0].role === "system" &&
      body.messages[0].content.includes("[CCR protocol]"))
  }

  // P-6 门控：没声明 retrieve 工具 → 跳过且 reason 准确（管线级）
  {
    const body = {
      model: "m",
      messages: [{ role: "assistant", content: big(3000) }],
    }
    const before = JSON.parse(JSON.stringify(body))
    const record = runPipeline(body, { protocol: "chat", state: {} }, { strategies: { ccr: true, lite: false, "session-dedup": false, headroom: false } }, before)
    const ccr = record.strategies.find((s) => s.id === "ccr")
    check("P-6 未声明工具时 ccr 跳过", ccr.status === "skipped")
    check("P-6 reason 是 no_retrieve_tool", ccr.reason === "no_retrieve_tool", ccr.reason)
    check("P-6 body 未被改动", JSON.stringify(body) === JSON.stringify(before))
  }

  // P-7 ramp 跨进程：磁盘上的取回计数让阈值爬升
  {
    const store = makeStore()
    const text = big(2500)
    const r = tryStoreBlock(store, text, "p7")
    for (let i = 0; i < 3; i++) recordRetrieval(store, r.hash, "p7")
    const disk = hydrateCcrStore(serializeCcrStore(store))
    check("P-7 计数≥阈值后水合副本也拒绝再压", shouldSkipCompression(disk, r.hash, "p7"))
  }

  // P-8 工具链路（MCP 层）：initialize/tools/list/tools/call + full 兑现
  {
    const store = makeStore()
    const text = big(3500)
    const r = tryStoreBlock(store, text, undefined)
    const f2 = join(dir, "mcp-store.json")
    const h = createPersistentCcrStore(f2)
    await h.ready
    for (const [k, e] of store.entries) h.get().entries.set(k, e)
    h.persist()
    await h.flushNow()

    const init = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} }, f2)
    check("P-8 initialize 有 tools 能力", init.result?.capabilities?.tools !== undefined)
    const list = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, f2)
    check("P-8 tools/list 只暴露 omniroute_ccr_retrieve",
      list.result.tools.length === 1 && list.result.tools[0].name === "omniroute_ccr_retrieve")
    const call = await handleRpc({
      jsonrpc: "2.0", id: 3, method: "tools/call",
      params: { name: "omniroute_ccr_retrieve", arguments: { hash: r.hash, mode: "full" } },
    }, f2)
    check("P-8 工具兑现原文逐字节一致", call.result?.content?.[0]?.text === text, call.result?.content?.[0]?.text?.length)
    // 取回后计数写回了文件
    const onDisk = hydrateCcrStore(JSON.parse(await readFile(f2, "utf8")))
    check("P-8 取回计数经工具进程落盘", (onDisk.retrievalCounts.get(`__anon__ ${r.hash}`) || 0) >= 1)
    // head 模式截行
    const head = await callRetrieve({ hash: r.hash, mode: "head", n: 2 }, f2)
    check("P-8 head 模式只回前两行", head.content === text.split("\n").slice(0, 2).join("\n"))
    // 坏 hash / 未知工具 / 未知方法
    const bad = await callRetrieve({ hash: "0".repeat(24) }, f2)
    check("P-8 未命中 hash 报错不抛", typeof bad.error === "string")
    const unknown = await handleRpc({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "nope" } }, f2)
    check("P-8 未知工具走 JSON-RPC error", unknown.error?.code === -32602)
  }

  // P-9 store 路径解析优先级
  {
    check("P-9 argv 优先", resolveStoreFile(["/x/store.json"], {}) === "/x/store.json")
    check("P-9 env 次之", resolveStoreFile([], { CCR_STORE_PATH: "/y/s.json" }) === "/y/s.json")
    const d = resolveStoreFile([], { COMPRESS_CORE_DATA_DIR: "/z/data" })
    check("P-9 数据目录兜底", d === join("/z/data", "ccr-store.json"), d)
  }

  // P-10 一键安装命令链路：processCcrCommand 执行 magpie library mcp add（用
  // MAGPIE_EXE=node + cwd 下的 library 桩代替真 magpie），结果写 commands.json
  // 并发布 compress-ccr-status.js 给页面。
  {
    const { processCcrCommand } = await import("../options-commands.js")
    const { writeFileSync, readFileSync, existsSync } = await import("node:fs")
    const dir2 = mkdtempSync(join(tmpdir(), "ccr-cmd-"))
    const pageDir = join(dir2, "page")
    // node 把 argv[0] 当脚本路径解析（相对 cwd）：桩文件就叫 library。
    writeFileSync(join(dir2, "library"), "process.exit(0)\n")
    const saved = {
      MAGPIE_EXE: process.env.MAGPIE_EXE,
      DATA: process.env.COMPRESS_CORE_DATA_DIR,
      PAGE: process.env.COMPRESS_CORE_PAGE_DIR,
      NOPUB: process.env.COMPRESS_CORE_NO_PUBLISH,
      cwd: process.cwd(),
    }
    process.env.MAGPIE_EXE = process.execPath
    process.env.COMPRESS_CORE_DATA_DIR = join(dir2, "data")
    process.env.COMPRESS_CORE_PAGE_DIR = pageDir
    delete process.env.COMPRESS_CORE_NO_PUBLISH
    process.chdir(dir2)
    try {
      const id = "ccr-test-" + Date.now()
      const ok = await processCcrCommand({ ccrCommand: { id, action: "install-mcp" } })
      check("P-10 命令执行成功", ok === true)
      const journal = JSON.parse(readFileSync(join(dir2, "data", "commands.json"), "utf8"))
      check("P-10 commands.json 记 done", journal.ccrCommand?.id === id && journal.ccrCommand?.status === "done")
      const published = join(pageDir, "compress-ccr-status.js")
      check("P-10 状态发布成页面脚本", existsSync(published))
      const text = readFileSync(published, "utf8")
      check("P-10 发布内容含 id 与 done",
        text.startsWith("globalThis.__COMPRESS_CORE_CCR__ = ") && text.includes(id) && text.includes('"status":"done"'))
      // 幂等：同 id 重放不再执行（completed 集合）
      check("P-10 同 id 重放被拒", processCcrCommand({ ccrCommand: { id, action: "install-mcp" } }) === false)
    } finally {
      process.chdir(saved.cwd)
      if (saved.MAGPIE_EXE === undefined) delete process.env.MAGPIE_EXE; else process.env.MAGPIE_EXE = saved.MAGPIE_EXE
      if (saved.DATA === undefined) delete process.env.COMPRESS_CORE_DATA_DIR; else process.env.COMPRESS_CORE_DATA_DIR = saved.DATA
      if (saved.PAGE === undefined) delete process.env.COMPRESS_CORE_PAGE_DIR; else process.env.COMPRESS_CORE_PAGE_DIR = saved.PAGE
      if (saved.NOPUB === undefined) delete process.env.COMPRESS_CORE_NO_PUBLISH; else process.env.COMPRESS_CORE_NO_PUBLISH = saved.NOPUB
    }
  }

  // P-11 / P-12 共用的环境布置：MAGPIE_EXE=node + cwd 下名为 library 的桩，
  // 数据目录 / 页面目录 / 参数日志都指到 tmp，完事恢复。
  async function withStubbedMagpie(stubSource, fn) {
    const { writeFileSync } = await import("node:fs")
    const dir = mkdtempSync(join(tmpdir(), "ccr-cmd-"))
    writeFileSync(join(dir, "library"), stubSource)
    const saved = {
      MAGPIE_EXE: process.env.MAGPIE_EXE,
      DATA: process.env.COMPRESS_CORE_DATA_DIR,
      PAGE: process.env.COMPRESS_CORE_PAGE_DIR,
      NOPUB: process.env.COMPRESS_CORE_NO_PUBLISH,
      ARGVLOG: process.env.STUB_ARGV_LOG,
      cwd: process.cwd(),
    }
    process.env.MAGPIE_EXE = process.execPath
    process.env.COMPRESS_CORE_DATA_DIR = join(dir, "data")
    process.env.COMPRESS_CORE_PAGE_DIR = join(dir, "page")
    process.env.STUB_ARGV_LOG = join(dir, "argv.log")
    delete process.env.COMPRESS_CORE_NO_PUBLISH
    process.chdir(dir)
    try {
      await fn(dir)
    } finally {
      process.chdir(saved.cwd)
      for (const [key, value] of [["MAGPIE_EXE", saved.MAGPIE_EXE], ["COMPRESS_CORE_DATA_DIR", saved.DATA], ["COMPRESS_CORE_PAGE_DIR", saved.PAGE], ["COMPRESS_CORE_NO_PUBLISH", saved.NOPUB], ["STUB_ARGV_LOG", saved.ARGVLOG]]) {
        if (value === undefined) delete process.env[key]; else process.env[key] = value
      }
    }
  }

  // P-11 add 报「已存在」按成功处理（幂等安装），且 ccrAgents 选项传给 mcp agents
  {
    const { processCcrCommand } = await import("../options-commands.js")
    const stub = [
      'const fs = require("node:fs")',
      'fs.appendFileSync(process.env.STUB_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")',
      'if (process.argv.includes("agents")) process.exit(0)',
      'console.error("magpie: the library already has a server called ccr-retrieve")',
      'process.exit(1)',
      '',
    ].join("\n")
    await withStubbedMagpie(stub, async (dir) => {
      const { readFileSync } = await import("node:fs")
      const id = "ccr-test-exists-" + Date.now()
      const ok = await processCcrCommand({ ccrCommand: { id, action: "install-mcp" }, ccrAgents: "pi,opencode" })
      check("P-11 已存在按成功处理", ok === true)
      const journal = JSON.parse(readFileSync(join(dir, "data", "commands.json"), "utf8"))
      check("P-11 commands.json 记 done", journal.ccrCommand?.status === "done" && journal.ccrCommand?.agents === "pi,opencode")
      const published = readFileSync(join(dir, "page", "compress-ccr-status.js"), "utf8")
      check("P-11 发布 done", published.includes('"status":"done"') && published.includes(id))
      const calls = readFileSync(join(dir, "argv.log"), "utf8").trim().split("\n").map((line) => JSON.parse(line))
      check("P-11 跑了 add 与 agents 两步",
        calls.some((a) => a[0] === "mcp" && a[1] === "add") &&
        calls.some((a) => a[0] === "mcp" && a[1] === "agents" && a[3] === "pi,opencode"))
    })
  }

  // P-12 宿主重启后同 id 重放：journal 已是 done 就不再执行（防 done 被 already-exists 冲成 error）
  {
    const { processCcrCommand } = await import("../options-commands.js")
    const stub = [
      'const fs = require("node:fs")',
      'fs.appendFileSync(process.env.STUB_ARGV_LOG, JSON.stringify(process.argv.slice(2)) + "\\n")',
      'process.exit(1)',
      '',
    ].join("\n")
    await withStubbedMagpie(stub, async (dir) => {
      const { mkdirSync, writeFileSync, readFileSync, existsSync } = await import("node:fs")
      const id = "ccr-test-replay-" + Date.now()
      mkdirSync(join(dir, "data"), { recursive: true })
      writeFileSync(join(dir, "data", "commands.json"), JSON.stringify({ ccrCommand: { id, action: "install-mcp", status: "done" } }))
      const ok = await processCcrCommand({ ccrCommand: { id, action: "install-mcp" } })
      check("P-12 重放直接算成功", ok === true)
      check("P-12 根本没执行 magpie", !existsSync(join(dir, "argv.log")))
      const published = readFileSync(join(dir, "page", "compress-ccr-status.js"), "utf8")
      check("P-12 回画 done", published.includes('"status":"done"') && published.includes(id))
    })
  }
}
