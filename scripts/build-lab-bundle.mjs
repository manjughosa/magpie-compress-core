// 重建 page/lab-engine.bundle.js 与 page/engines.js。
//
// 页面跑在 magpie 的沙箱里，加载的是普通脚本（不是 module），所以试压台要用
// 的那几个源模块必须打成一个 IIFE。产物不进 git（review 第 H1 条），改成在
// `npm pack` / publish 之前由 prepack 生成：装插件的人拿到的是已经打好的包，
// 仓库里不留生成物。命令：`npm run build:page`。
//
// esbuild 是 devDependency：本地装着就用本地那份（离线、版本固定），没装才
// 回退到 npx 现下。CI 与发布机器都装了 devDeps，走的是前者。
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const local = join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild")
const useLocal = existsSync(local)

const args = [
  join(root, "page", "lab-engine.js"),
  "--bundle",
  "--format=iife",
  "--platform=browser",
  "--target=es2020",
  "--legal-comments=none",
  `--outfile=${join(root, "page", "lab-engine.bundle.js")}`,
]

const r = useLocal
  ? spawnSync(local, args, { stdio: "inherit" })
  : spawnSync("npx", ["--yes", "esbuild", ...args], { stdio: "inherit", shell: process.platform === "win32" })
if (r.status !== 0) {
  console.error(`esbuild failed (${useLocal ? "local" : "npx"}); the bundle was not rebuilt`)
  process.exit(r.status ?? 1)
}