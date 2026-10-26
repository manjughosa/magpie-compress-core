// scripts/check-orphans.mjs — refuse to carry dead weight.
// Every check here exists because this plugin actually shipped the problem:
// a 430 KB orphan bundle, a test file missing from the runner, and a stale
// bundle that no longer matched its sources.
// Usage: <bun|node> scripts/check-orphans.mjs   (exit 1 on any finding)
import { readFile, readdir, stat } from "node:fs/promises"
import { join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(fileURLToPath(new URL(".", import.meta.url)), "..")
const skipDirs = new Set(["node_modules", ".git", "captures"])
const findings = []
const note = (code, file, detail) => findings.push({ code, file, detail })

async function walk(dir, out = []) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) await walk(path, out)
    else out.push(path)
  }
  return out
}

const files = await walk(root)
const rel = path => relative(root, path).split("\\").join("/")
const text = new Map()
for (const path of files) {
  if (!/\.(js|mjs|html|json|md)$/.test(path)) continue
  text.set(rel(path), await readFile(path, "utf8"))
}

// A: a backup copy on disk is a second version of the truth. git is the backup.
for (const [file] of text) {
  if (/\.(bak|orig|rej)$/.test(file) || /\.bak-|\.(replace|set|write)\./.test(file) || /\.tmp$/.test(file)) note("BACKUP_FILE", file, "删除；版本历史归 git")
}

// B: a test file the runner never loads proves nothing.
const runner = text.get("test/run.mjs") || ""
for (const file of [...text.keys()].filter(name => /^test\/.*\.test\.mjs$/.test(name))) {
  if (!runner.includes(`"${file.slice("test/".length)}"`)) note("UNRUN_TEST", file, "未列入 test/run.mjs 的 suites")
}

// C: a page that references a missing script fails only in the browser.
for (const page of ["page/index.html", "page/settings.html", "page/usage.html"]) {
  const html = text.get(page)
  if (!html) continue
  for (const match of html.matchAll(/<script[^>]+src="([^"]+)"/g)) {
    const src = match[1]
    if (src.startsWith("_magpie/") || /^https?:/.test(src)) continue
    const target = join(root, "page", src)
    if (!files.includes(target)) note("MISSING_ASSET", page, `引用的 ${src} 不在磁盘`)
  }
}

// D: an engine file that nothing imports cannot run, however good it is.
const engineRefs = [...text.entries()].filter(([file]) => !file.startsWith("engines/") || file === "engines/index.js").map(([, body]) => body).join("\n")
for (const file of [...text.keys()].filter(name => /^engines\/[^/]+\.js$/.test(name) && name !== "engines/index.js")) {
  const base = file.slice("engines/".length, -".js".length)
  const imported = new RegExp(`["'\`]\\.\\.?/?(?:engines/)?${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\.js["'\`]`).test(engineRefs)
  if (!imported) note("ORPHAN_ENGINE", file, "没有任何模块 import 它")
}

// E: the browser runs the bundle, not the sources. A bundle older than its
// sources means the page is testing code that no longer exists.
const bundlePath = join(root, "page", "lab-engine.bundle.js")
try {
  const bundleTime = (await stat(bundlePath)).mtimeMs
  const sources = files.filter(path => /(^|\/)(engines|lab\.js|catalog\.js)/.test(rel(path)) && /\.js$/.test(path))
  let newest = 0
  let newestFile = ""
  for (const path of sources) {
    const time = (await stat(path)).mtimeMs
    if (time > newest) { newest = time; newestFile = rel(path) }
  }
  if (newest > bundleTime) note("STALE_BUNDLE", "page/lab-engine.bundle.js", `比 ${newestFile} 旧，需重新构建`)
} catch {
  note("MISSING_BUNDLE", "page/lab-engine.bundle.js", "试压页依赖它，缺失时页面按钮会静默失效")
}

if (!findings.length) {
  console.log("clean: no orphan, stale, or duplicate artifact found")
  process.exit(0)
}
for (const { code, file, detail } of findings) console.log(`${code}  ${file}  ${detail}`)
console.log(`\n${findings.length} finding(s)`)
process.exit(1)
