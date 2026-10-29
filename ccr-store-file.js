// CCR 块的持久化。只跑在可信的 Bun/Node 宿主与 retrieve 工具进程里，moejs
// fallback 永远不 import 它（它没有 fs）。引擎本身仍是纯函数：store 由宿主
// 通过 ctx.ccrStore 注入，写盘由 ctx.persistCcrStore 回调触发——同步钩子
// 路径不传这两个，就退回上游移植版原本的「本次请求内存 store」行为。
//
// 文件格式（ccr-store.json，v1）：
//   { version, savedAt, entries: [[storeKey, entry]...], retrievalCounts: [[storeKey, n]...] }
// 与上游的两处刻意差异：
//   - 上游用 better-sqlite3，这里不允许新增 npm 依赖，用 JSON + tmp/rename 原子写；
//   - >512KB 的块不落盘（与上游 persistEntry 的口径一致：大块只活内存层）。
import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { makeStore } from "./engines/ccr/index.js"
import { telemetryDir } from "./telemetry-store.js"

const FORMAT_VERSION = 1
/** 与上游一致：超过 512KB 的块只留在内存层，不进持久文件。 */
export const PERSIST_MAX_ENTRY_BYTES = 512 * 1024
/** 落盘去抖：一次请求压几十个块也只写一次盘。 */
const FLUSH_DELAY_MS = 2000

export function ccrStoreFile() {
  return join(telemetryDir(), "ccr-store.json")
}

/** store → 可序列化文档。大条目跳过；retrievalCounts 全量带上（ramp 靠它跨请求生效）。 */
export function serializeCcrStore(store) {
  const entries = []
  for (const [key, entry] of store.entries) {
    if (!entry || typeof entry.content !== "string") continue
    if (entry.bytes > PERSIST_MAX_ENTRY_BYTES) continue
    entries.push([key, entry])
  }
  return {
    version: FORMAT_VERSION,
    savedAt: new Date().toISOString(),
    entries,
    retrievalCounts: [...store.retrievalCounts],
  }
}

/** 文档 → 引擎可用的 store 形状。坏行跳过、过期条目丢掉、总额重算（不信任文件里的派生数）。 */
export function hydrateCcrStore(doc, now = Date.now()) {
  const store = makeStore()
  if (!doc || doc.version !== FORMAT_VERSION || !Array.isArray(doc.entries)) return store
  for (const pair of doc.entries) {
    if (!Array.isArray(pair)) continue
    const [key, e] = pair
    if (typeof key !== "string" || !e || typeof e !== "object") continue
    if (typeof e.hash !== "string" || typeof e.content !== "string") continue
    if (typeof e.bytes !== "number" || typeof e.expiresAt !== "number") continue
    if (e.expiresAt <= now) continue
    store.entries.set(key, e)
    store.totalBytes += e.bytes
    const owner = typeof e.principalId === "string" ? e.principalId : "__anon__"
    store.principalBytes.set(owner, (store.principalBytes.get(owner) || 0) + e.bytes)
  }
  if (Array.isArray(doc.retrievalCounts)) {
    for (const pair of doc.retrievalCounts) {
      if (!Array.isArray(pair)) continue
      const [k, v] = pair
      if (typeof k === "string" && typeof v === "number" && Number.isFinite(v)) {
        store.retrievalCounts.set(k, v)
      }
    }
  }
  return store
}

export async function loadCcrStoreFile(file) {
  try {
    const text = await readFile(file, "utf8")
    if (text.length > MAX_CCR_STORE_FILE_BYTES) return makeStore()
    return hydrateCcrStore(JSON.parse(text))
  } catch {
    return makeStore() // 没有文件/坏文件：全新 store，fail-open
  }
}
/** 持久文件自身的体积保险丝（全局字节上限 64MB 的内容 + 元数据，再大就是坏了）。 */
const MAX_CCR_STORE_FILE_BYTES = 80 * 1024 * 1024

async function writeStoreFile(file, store) {
  const doc = serializeCcrStore(store)
  // retrievalCounts 是单调递增的：retrieve 工具进程也会写这个文件，直接覆盖
  // 会把它的计数抹掉。落盘前读回旧文件，计数按 key 取 max 合并；条目以内存为准。
  try {
    const old = hydrateCcrStore(JSON.parse(await readFile(file, "utf8")))
    for (const [k, v] of old.retrievalCounts) {
      if (v > (doc.retrievalCounts.find(([dk]) => dk === k)?.[1] || 0)) {
        const idx = doc.retrievalCounts.findIndex(([dk]) => dk === k)
        if (idx === -1) doc.retrievalCounts.push([k, v])
        else doc.retrievalCounts[idx][1] = v
      }
    }
  } catch {
    // 没有旧文件可合并，直接写
  }
  await mkdir(join(file, ".."), { recursive: true })
  const tmp = file + ".tmp"
  await writeFile(tmp, JSON.stringify(doc))
  await rename(tmp, file)
}

/**
 * 宿主侧共享 store：进程内一份内存，改动去抖落盘。
 * get() 同步返回（首次加载完成前是空 store——fail-open，不会错压）；
 * persist() 标记脏并调度落盘，永不抛错（持久化失败不能拖垮压缩）。
 */
export function createPersistentCcrStore(file = ccrStoreFile()) {
  let store = makeStore()
  let dirty = false
  let timer = null
  let chain = Promise.resolve()

  const loaded = loadCcrStoreFile(file).then((s) => {
    // 加载期间引擎可能已经压了新块进空 store：以内存为准合并旧条目。
    if (store.entries.size === 0) store = s
    else {
      for (const [k, e] of s.entries) if (!store.entries.has(k)) store.entries.set(k, e)
      for (const [k, v] of s.retrievalCounts) {
        if (v > (store.retrievalCounts.get(k) || 0)) store.retrievalCounts.set(k, v)
      }
    }
  })
  loaded.catch(() => {})

  function flush() {
    if (!dirty) return
    dirty = false
    chain = chain.then(() => writeStoreFile(file, store)).catch(() => {})
  }
  return {
    get() { return store },
    persist() {
      dirty = true
      if (timer) return
      timer = setTimeout(() => { timer = null; flush() }, FLUSH_DELAY_MS)
      if (typeof timer.unref === "function") timer.unref()
    },
    /** 测试与关机用：立刻把脏数据写出去。 */
    async flushNow() { if (timer) { clearTimeout(timer); timer = null } flush(); await chain },
    ready: loaded,
  }
}
