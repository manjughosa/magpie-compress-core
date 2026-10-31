// A tiny cross-process lock for the CCR store file.
//
// Two writers touch ccr-store.json: the host's writeStoreFile (ccr-store-file.js)
// and the MCP server's persistCounts. Both are read-modify-write, so without a lock
// the later writer drops the other's counts. The lock is a sidecar `<file>.lock`
// created with O_EXCL; a stale one (crashed holder) is broken after STALE_MS.
import { open, stat, unlink } from "node:fs/promises"

const WAIT_MS = 2000
const STALE_MS = 15000

/** Returns a handle, or null when the lock could not be taken in time. */
export async function acquireLock(file) {
  const lock = file + ".lock"
  const deadline = Date.now() + WAIT_MS
  for (;;) {
    try {
      const handle = await open(lock, "wx")
      return { lock, handle }
    } catch {
      try {
        const st = await stat(lock)
        if (Date.now() - st.mtimeMs > STALE_MS) { await unlink(lock); continue }
      } catch { /* vanished between open and stat: retry */ }
      if (Date.now() >= deadline) return null
      await new Promise((r) => setTimeout(r, 15))
    }
  }
}

export async function releaseLock(held) {
  if (!held) return
  try { await held.handle.close() } catch { /* already closed */ }
  try { await unlink(held.lock) } catch { /* already gone */ }
}
