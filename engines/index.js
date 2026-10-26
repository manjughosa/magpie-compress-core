// 引擎注册表 —— 把 catalog.js 的元数据和 engines/*.js 的实现合并。
// 新增引擎时：在这里加一行 import + 往 MODULES 里塞一个条目。
import * as sessionDedup from "./session-dedup.js"
import * as lite from "./lite.js"
import * as rtk from "./rtk/index.js"
import * as codexResponses from "./codex-responses.js"
import * as headroom from "./headroom.js"
import * as relevance from "./relevance/index.js"
import * as ultra from "./ultra.js"
import * as caveman from "./caveman.js"
import * as aggressive from "./aggressive.js"
import * as ionizer from "./ionizer.js"
import * as llm from "./llm.js"
import * as ccr from "./ccr/index.js"
import * as readLifecycle from "./read-lifecycle.js"
import { ENGINES, ORDER, engineById } from "../catalog.js"

const MODULES = {
  "session-dedup": sessionDedup,
  lite,
  rtk,
  "codex-responses": codexResponses,
  headroom,
  relevance,
  ultra,
  caveman,
  aggressive,
  ionizer,
  llm,
  ccr,
  "read-lifecycle": readLifecycle,
}

// id -> { ...catalog 元数据, ...引擎实现, ported: true }
export const REGISTRY = new Map()
for (const meta of ENGINES) {
  const mod = MODULES[meta.id]
  if (!mod) continue
  REGISTRY.set(meta.id, { ...meta, ...mod, stackPriority: meta.stackPriority, ported: true })
}

// stackPriority 升序 = 执行顺序；只含已移植的引擎
export const PIPELINE = ORDER.map((id) => REGISTRY.get(id)).filter(Boolean)

export const PORTED_IDS = Array.from(REGISTRY.keys())

export function engineModule(id) {
  return REGISTRY.get(id) || null
}

export { engineById }
