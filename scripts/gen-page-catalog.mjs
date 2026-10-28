// 把 catalog.js 的数据镜像成页面能用的 classic script。
// page 是 sandbox 里的普通 <script>，不能 import ES module，所以生成一份 globalThis 挂载的副本。
// 改完 catalog.js 或引擎的 configSchema 后跑：node scripts/gen-page-catalog.mjs
//
// 这份产物是提交进仓库的（它小、可逐字节重建），所以 test/page-catalog.test.mjs
// 用同一个 pageCatalogSource() 在内存里重生一次比对：catalog.js 或某个 configSchema
// 变了而 page/engines.js 没跟着变，测试就红。
//
// fields 的来源优先级：引擎自己导出的 configSchema > catalog.js 里的静态声明。
// 已移植的引擎以实现为准（它才知道自己读哪些键）；还没移植的引擎只能靠 catalog 声明。
import { ENGINES, ORDER, PRESET_NAMES } from "../catalog.js"
import { REGISTRY } from "../engines/index.js"
import { readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath, pathToFileURL } from "node:url"
import { dirname, join } from "node:path"

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, "..", "page", "engines.js")

// enabled 是每个引擎的通用开关，面板上已经有独立的开关按钮，不该再当成一个参数显示。
const HIDDEN_FIELDS = new Set(["enabled"])

function fieldsFor(meta) {
  const reg = REGISTRY.get(meta.id)
  const fromEngine =
    reg && Array.isArray(reg.configSchema) && reg.configSchema.length ? reg.configSchema : null
  const declared = fromEngine || meta.fields || []
  return declared.filter((f) => f && f.key && !HIDDEN_FIELDS.has(f.key))
}

const slim = ENGINES.map((e) => ({
  id: e.id,
  label: e.label,
  description: e.description,
  why: e.why,
  stackPriority: e.stackPriority,
  lossy: e.lossy,
  cacheImpact: e.cacheImpact,
  isSingleMode: e.isSingleMode,
  levels: e.levels,
  sampling: e.sampling,
  inputScope: e.inputScope,
  available: e.available,
  requires: e.requires,
  fields: fieldsFor(e),
}))

// 生成的内容本身，不落盘：测试拿它和仓库里那份逐字节比。
export function pageCatalogSource() {
  return (
    "// 由 scripts/gen-page-catalog.mjs 生成，不要手改。真相源是 catalog.js 与各引擎的 configSchema。\n" +
    "globalThis.CompressCatalog = " +
    JSON.stringify({ engines: slim, order: ORDER, presets: PRESET_NAMES }, null, 2) +
    ";\n"
  )
}

export function committedPageCatalog() {
  return readFileSync(out, "utf8")
}

export const pageCatalogPath = out

// 直接跑这个文件才写盘；被 import（测试）时不写。
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const body = pageCatalogSource()
  writeFileSync(out, body, "utf8")
  console.log(`wrote ${out} (${body.length} bytes, ${slim.length} engines)`)
}
