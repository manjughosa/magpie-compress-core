// Use magpie's own Bun; no package or runtime dependency is added.
import { execFileSync } from "node:child_process"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { homedir } from "node:os"
const candidates = [process.env.BUN, process.platform === "win32" ? join(homedir(), ".cache", "magpie", "bun", "1.4.2", "magpie-bun.exe") : "", "bun"].filter(Boolean)
const bun = candidates.find(candidate => candidate === "bun" || existsSync(candidate))
if (!bun) throw new Error("Set BUN to a Bun executable.")
execFileSync(bun, ["build", "--target=browser", "--format=iife", "--outfile=page/lab-engine.bundle.js", "page/lab-engine.js"], { stdio: "inherit", cwd: new URL(".", import.meta.url) })
