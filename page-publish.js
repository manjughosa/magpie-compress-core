// Publishing to the page. magpie hands a plugin page two channels only: its own
// options in `plugins.json`, and its own folder beside the page. Writing the
// first restarts the hooks host, so everything the panel draws with travels here
// as a script the page loads with `<script src>`.
//
// What lands in these files is what a row needs: index metadata and the savings
// summary. Never a conversation — a capture's text stays in `captures/`, which
// is the whole reason the page cannot read it.
import { mkdir, rename, rm, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { randomUUID } from "node:crypto"

// A suite runs against throwaway folders and must not leave a file in the
// installed plugin's page folder; test/run.mjs sets this, so only a real run
// publishes.
const off = () => process.env.COMPRESS_CORE_NO_PUBLISH === "1"
const dir = () => process.env.COMPRESS_CORE_PAGE_DIR || fileURLToPath(new URL("./page/", import.meta.url))

// publishPageScript writes `globalThis.<global> = <value>` to <page>/<name>,
// through a temp file and a rename, so a page loading mid-write never parses half
// a document. A folder that cannot be written (a read-only install) leaves the
// reader to fall back to what it had.
export async function publishPageScript(name, global, value) {
  if (off()) return false
  const temp = join(dir(), `.${name}.${process.pid}.${randomUUID()}.tmp`)
  try {
    await mkdir(dir(), { recursive: true })
    await writeFile(temp, `globalThis.${global} = ${JSON.stringify(value)}\n`, "utf8")
    await rename(temp, join(dir(), name))
    return true
  } catch {
    try { await rm(temp, { force: true }) } catch { /* Nothing left to clean. */ }
    return false
  }
}
