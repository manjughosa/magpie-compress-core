# magpie-compress-core 可观测性：运行时能力侦察

侦察日期：2026-10-26。对象：本机 `E:\LLM_Config\Magpie\magpie-windows-amd64.exe`、已安装插件源码与 magpie 中文插件文档。

## 1. moejs 中间件

证据：`@magpie-community/middleware-model-map/model-map.middleware.js`、`magpie-retry/retry.middleware.js`。

- 入口为 ESM 具名导出 `onRequest(body, ctx)` / `onEvent(event, ctx)` / `onResponse(reply, ctx)`。
- `ctx` 至少提供 `protocol`、`model`、`agent`、`session`、`options`、`state`。
- `ctx.state` 是**同一请求内**的共享状态，可在三个钩子间传数据。
- `onResponse` 能收到响应状态和响应对象；`onEvent` 可读取 `event.data`。它不是供应商原始出口 HTTP body 的镜像。
- 模块级变量能跨请求留存，但宿主可能复用多个 runtime，各实例分别记账；因此它不是可靠的集中遥测存储。
- `onRequest` / `onResponse` 各 250ms，`onEvent` 50ms；错误和超时按原样放行。
- moejs 无 Node API、无 npm、无网络/定时器；不能直接把 JSONL 写到磁盘或启动 HTTP 服务。
- `magpie-retry` 通过 `ctx.options` 接收设置；设置后约一秒热加载。仅修改源码需要重新加载插件。

结论：**中间件适合做请求压缩与请求内审计，不适合做看板的持久化数据面。**

## 2. 页面沙箱与原生栏目

证据：`@magpie-community/page-usage` 的 `package.json`、`usage.html`；`magpie-retry` 的 panel；官方页面插件文档；exe 内嵌前端字符串。

- `magpie.page` 支持 `file/title/titles/icon/replaces`；`replaces` 会替换内置页，**本任务禁用**。早期试验已撤销，旧实例已 `plugin off`，原「用量 / 脱敏」恢复接管。
- 最终需求只是新增独立「压缩」，与现有「用量 / 脱敏」同组相邻；不复制、不重写、不替换那两个页面，也不增加自己的用量/脱敏栏目。
- 文档的 panel slot 只有 `agents/usage/settings/provider`；`slot=usage` 只是用量概览末尾卡片，不是相邻栏目。公开 page 默认进入 Plugins 组，`replaces` 是替换而非插入。当前公开接口不能满足精确位置。
- 用户已明确授权为本机 magpie 壳层增加通用「在指定栏目后挂载插件页」能力。实现只能增加独立导航挂载点，不得修改 usage/masking 的页面实现。
- 页面桥提供 `magpie.ready/theme/options.get/options.set/read/onAction/context`。
- 公开 `magpie.read` 仅允许 `usage:summary`、`providers:list`；没有插件自有文件读取或 JSONL 权限。
- CSP 为 `sandbox="allow-scripts"`、`connect-src 'none'`，脚本必须是文件。不能把 fetch 本机 JSONL 当成页面数据通道。

结论：**页面数据只走 `magpie.options` 中的脱敏快照。原始请求和脱敏样本不放进 options。**

## 3. 可用遥测通道

文档「异步网关请求钩子」证实：

- `magpie.hooks` 指向 Bun 模块；`onRequest(body, ctx)` 在 moejs 前执行，每请求一次。
- `onResponse(reply, ctx)` 在输出完成后尽力通知。
- `ctx` 有 `protocol/model/stream/path/agent/session/cwd/query/options/signal`；另有受限的 `ctx.report`。
- Bun 钩子具有宿主能力，可以用本机文件与 loopback 网络；默认 1 秒，可通过 `gatewayTimeoutMs` 调整。
- 钩子失败、超时、无返回时保留原请求。

采用：**Bun 伴随钩子执行同一压缩管线，写本机 JSONL；同时启动仅绑定 127.0.0.1 的只读详情服务。** 页面通过受同源限制的 iframe 读取本机详情，父页面只传自身配置。不往 magpie options 写请求快照。moejs 移除伴随钩子的内部标记；若伴随钩子失败，中间件仍执行原压缩管线。

安全边界：

- 默认只保存数值、策略原因码、模型/agent 标识、延迟和错误类型。
- before/after 样本默认关闭；用户显式开启后，仅保留有长度上限的脱敏片段，不能作为完整会话存档。
- 本机详情服务只绑定 127.0.0.1；只接受 null/loopback Origin，无写接口，默认不含原文，不设置第三方 CORS。
- 遥测与样本不写页面 options，不进入供应商请求。iframe 方案与内置页面隔离，需真机验证。

## 4. 地面真值与对账

- 新建仅测试用的 OpenAI-compatible provider，URL 指向 127.0.0.1 echo 服务。
- echo 捕获网关**真实发出的最终 body**，而不是在 Agent 入口自行推测压缩效果。
- 遥测前后字节与 echo 出口 body 对账；usage 的 `input_tokens` 来自供应商/网关记账，是独立的第二类证据。
- 无损 headroom 用 decode(encode(x)) 恒等式抽检；session-dedup 用本次请求的 sha→原文映射还原引用并校验。
- 对账验证和最终 `magpie plugin rm` 后全新安装均实跑，不用静态阅读代替。

## 5. 尚未由静态侦察证明的部分

- 页面 options 快照的大小/写入频率限制，需控制为小型摘要并做真机验证。
- 自定义 echo provider 的实际协议转换与 HTTP 状态需实测。
- 各供应商 tokenizer 不同，本插件的 `chars/4` 只能标为**估算 token**，不得冒充供应商 usage。
