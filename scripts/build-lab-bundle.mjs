// 重建 page/lab-engine.bundle.js。
//
// 页面跑在 magpie 的沙箱里，加载的是普通脚本（不是 module），所以试压台要用的
// 那几个源模块必须打成一个 IIFE。
//
// 这份产物**提交进仓库**（历史提交里一直如此）：装插件的人没有构建环境，页面加载的
// 就是仓库里这一份。改完 lab.js / catalog.js / engines/* 之后必须重建并一起提交，
// 否则实验室跑的是旧代码。page/engines.js 也一样是产物，由 gen-page-catalog.mjs 生成。
//
// esbuild 必须按 package.json 里 pin 的确切版本装好：不同版本打出来的字节不一样，
// diff 会变成噪声。没有本地 esbuild 就直接失败——不去 npx 现下，那会拿到一个谁也
// 不知道的版本。命令：`npm run build:page`。
import { spawnSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
const pin = manifest.devDependencies?.esbuild
if (!pin || !/^\d+\.\d+\.\d+$/.test(pin)) {
  console.error(`esbuild 必须在 devDependencies 里精确 pin（现在是 ${pin ?? "没有"}）`)
  process.exit(1)
}

const local = join(root, "node_modules", ".bin", process.platform === "win32" ? "esbuild.cmd" : "esbuild")
if (!existsSync(local)) {
  console.error(`这里没有装 esbuild：先跑 \`npm install --no-save esbuild@${pin}\``)
  process.exit(1)
}
const version = spawnSync(local, ["--version"], { encoding: "utf8", shell: process.platform === "win32" })
const here = (version.stdout || "").trim()
if (version.status !== 0 || here !== pin) {
  console.error(`这里装的 esbuild 是 ${here || "跑不起来"}，而 package.json pin 的是 ${pin}`)
  process.exit(1)
}

const out = join(root, "page", "lab-engine.bundle.js")
const args = [
  join(root, "page", "lab-engine.js"),
  "--bundle",
  "--format=iife",
  "--platform=browser",
  "--target=es2020",
  "--legal-comments=none",
  `--outfile=${out}`,
]
const r = spawnSync(local, args, { stdio: "inherit", shell: process.platform === "win32" })
if (r.status !== 0) {
  console.error(`esbuild 失败，${out} 没有重建`)
  process.exit(r.status ?? 1)
}
console.log(`built ${out}`)