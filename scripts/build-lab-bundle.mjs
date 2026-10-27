// 重建 page/lab-engine.bundle.js。
//
// 页面跑在 magpie 的沙箱里，加载的是普通脚本（不是 module），所以试压台要用
// 的那几个源模块必须打成一个 IIFE。esbuild 不在这包的依赖里：这一步只在改到
// lab.js / catalog.js / engines 之后手动跑一次，产物跟着提交，装插件的人不需要
// 构建。命令：`npm run build:page`（等价 `node scripts/build-lab-bundle.mjs`）。
import { spawnSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const args = [
  "--yes",
  "esbuild",
  join(root, "page", "lab-engine.js"),
  "--bundle",
  "--format=iife",
  "--platform=browser",
  "--target=es2020",
  "--legal-comments=none",
  `--outfile=${join(root, "page", "lab-engine.bundle.js")}`,
]

const r = spawnSync("npx", args, { stdio: "inherit", shell: process.platform === "win32" })
if (r.status !== 0) {
  console.error("esbuild failed; the bundle was not rebuilt")
  process.exit(r.status ?? 1)
}
