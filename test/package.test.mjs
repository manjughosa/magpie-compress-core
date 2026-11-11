import { execFileSync } from "node:child_process"
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, posix } from "node:path"
import { fileURLToPath } from "node:url"
import { check } from "./helpers.mjs"

const root = fileURLToPath(new URL("../", import.meta.url))
const generated = ["page/captures-index.js", "page/compress-stats.js", "page/compress-ccr-status.js", "page/captures/example.js"]
export const name = "package"

function packFiles(cwd, cache) {
  const args = ["pack", "--dry-run", "--ignore-scripts", "--offline", "--json"]
  const windows = process.platform === "win32"
  const output = execFileSync(windows ? "cmd.exe" : "npm",
    windows ? ["/d", "/s", "/c", "npm " + args.join(" ")] : args,
    { cwd, encoding: "utf8", env: { ...process.env, npm_config_cache: cache } })
  return new Set(JSON.parse(output)[0].files.map(file => file.path))
}

export function run() {
  const temp = mkdtempSync(join(tmpdir(), "compress-package-"))
  const cache = join(temp, "cache")
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
  const files = packFiles(root, cache)
  const pending = [pkg.magpie.middleware, pkg.magpie.hooks, "mcp/ccr-retrieve-server.mjs"]
  const visited = new Set()
  const missing = []
  while (pending.length) {
    const file = posix.normalize(pending.pop())
    if (visited.has(file)) continue
    visited.add(file)
    if (!files.has(file)) { missing.push(file); continue }
    const source = readFileSync(join(root, file), "utf8")
    for (const match of source.matchAll(/\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["'](\.[^"']+)["']/g)) {
      pending.push(posix.join(posix.dirname(file), match[1]))
    }
  }
  check("package: hook, middleware and retrieve runtime imports are included", missing.length === 0, missing.join(", "))
  check("package: installed machine state is excluded", generated.every(file => !files.has(file)))

  // Seed local state in a throwaway package so clean CI checkouts test exclusions too.
  const fixture = join(temp, "fixture")
  mkdirSync(fixture)
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ name: pkg.name, version: pkg.version, files: pkg.files }))
  for (const file of [...generated, "page/app.js"]) {
    const target = join(fixture, file)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, "// package fixture\n")
  }
  const packed = packFiles(fixture, cache)
  check("package: seeded runtime state is excluded while page scripts ship", generated.every(file => !packed.has(file)) && packed.has("page/app.js"))
}
