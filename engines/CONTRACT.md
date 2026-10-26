# 引擎移植契约（所有引擎模块必须遵守）

目标：把 OmniRoute 的压缩引擎逐个移植成纯 JS 模块，跑在 magpie 的 moejs 网关中间件里。

## 运行时铁律（moejs）

- 标准 JS，**没有** Node API：无 node:fs / node:crypto / node:path 等宿主能力。
- **没有 fetch、没有 setTimeout/setInterval、没有 worker、没有 WASM、没有 npm 依赖。**
- **只能相对路径 import**（./x.js、../hash.js）。不能 import "zod" 之类。
- 每个 onRequest 总预算 **250ms**。单引擎应在个位数毫秒内完成；遇到超大输入要提前放弃而不是硬算。
- 必须 **fail-open**：任何异常都让 apply 返回 false，绝不能抛到上层。上游 body 必须原样。

## 模块导出契约

每个引擎一个文件（或一个目录 + index.js），导出以下**具名常量/函数**：

```js
export const id = "relevance"          // OmniRoute 原 id，逐字（连字符，不驼峰）
export const label = "Relevance"       // OmniRoute engineCatalog 里的 name
export const why = "..."               // 一句话中文说明，给面板卡片用
export const lossy = true              // engineCatalog 的 lossy
export const cacheImpact = "moderate"  // "none" | "low" | "moderate" | "high"
export const defaultOn = false         // 稳妥档是否默认开 = !lossy
export const stackPriority = 18        // engineCatalog 的 stackPriority
export const isSingleMode = false      // engineCatalog 的 isSingleMode
export const levels = undefined        // 有强度档位时给数组，如 ["minimal","standard","aggressive"]
export const available = true          // 依赖缺失（ONNX/npm 包）时 false
export const configSchema = []         // EngineConfigField[]，见下

export function apply(body, ctx, cfg) {
  // body: 请求体对象（就地修改）
  // ctx:  { protocol, model, agent, session, state, options }
  // cfg:  该引擎的配置对象（已合并默认值）
  // 返回 true 表示确实改动了 body；false 表示没动。
}
```

`configSchema` 每项：

```js
{ key: "minRows", type: "number", label: "最小行数", description: "...",
  defaultValue: 8, min: 2, max: 200 }
// type: "boolean" | "number" | "string" | "select" | "multiselect"
// select/multiselect 需给 options: [{ value, label }]
```

## 协议处理

不要自己写四协议遍历。用 ../adapter.js 的 conversationView(body, ctx.protocol)：

```js
import { conversationView } from "../adapter.js"
const view = conversationView(body, ctx.protocol)
// view.segments: [{ text, role, kind, set(text) }]  -- set 会把新文本写回 body 原位置
```

参考 engines/lite.js 和 engines/headroom.js 的用法。

## 禁止改动

pipeline.js、catalog.js、page/*、package.json、README.md、adapter.js、hash.js、
stats-writer.js、telemetry-store.js、observability.hooks.js、compress-core.middleware.js
-- 这些由 lead 维护。你只写你负责的引擎文件。

## 交付要求

1. node --check <file> 通过。
2. 自己写一个 test/<id>.test.mjs（用 node:assert，格式参考现有测试），
   至少覆盖：改得动、没东西改时返回 false、异常输入不抛。
3. 文件头部注释写清：来源 OmniRoute 哪个 .ts、做了哪些适配、砍了什么。
4. 中文注释，ASCII 代码标识符。

## 源码位置

E:\LLM_Config\OmniRouteDesktop\resources\app\open-sse\services\compression\
