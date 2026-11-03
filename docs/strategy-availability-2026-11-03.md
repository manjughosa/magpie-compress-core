# 策略可用性完善 · 2026-11-03

## 已完成

- 修复 Lite 在 Responses 默认保护当前轮、导致与其他协议默认行为不一致的问题；显式 `preserveCurrentTurn: true` 仍保留保护行为。
- CCR 指令支持 Responses `instructions` 与 Gemini `systemInstruction`；哨兵检查覆盖 Responses；保留原块上限、TTL、范围隔离与 retrieve 门控。
- CCR / session-dedup 支持 Codex MCP `server_label: ccr-retrieve` 以及带单下划线命名空间的真实工具名，不把任意相似工具名当成 retrieve。
- Read Lifecycle 支持 `multi_edit`；RTK 显式跳过 Responses/Gemini，工具输出转图片只给 Responses 与 Gemini 的 Codex 专用引擎处理。
- RTK、Codex Tool Output、Read Lifecycle 在代码默认配置、安装清单、实际 Magpie 配置与页面覆盖配置中一致开启；旧配置备份保留在 Magpie 自己的备份目录。
- LLM Compressor 增加可信 Bun 宿主的可选 chat-completion 后端：默认关闭，未配置模型不请求；默认同步 moejs 路径保持同步；真实网关后端已实测，合格散文 9,349 → 4,370 字符。
- CCR `minRepeat` 默认值统一为 1，消除面板默认值与实现不一致。

## 验证

- `node test/run.mjs`：全套通过。
- `node scripts/gen-page-catalog.mjs` 与 `npm run build:page`：页面元数据与试压台已重建。
- `magpie healthcheck`：退出码 0。
- 真实网关请求：HTTP 200，遥测确认 rtk / codex-responses / read-lifecycle `enabled: true`，fail-open 0。
- 可选 LLM 后端：真实现有网关调用成功，端到端命中；默认配置不启用。

## 未宣称完成

- `llmlingua` 尚无实现；需要本地 ONNX 模型与真实模型验收。当前 registry 查询受本机 `127.0.0.1:7890` 代理拒绝连接影响，未取得可靠模型文档，未凭猜测接 API。
- `omniglyph` 是 Fable 5 专用的上下文转图片代理，不是当前多平台通用文本压缩策略。需要独立 Fable 路由、逐字关键标识符保护与准确率验收，不能全局开启。
- Relevance / Caveman / Aggressive / Ultra / Ionizer 保留显式启用；它们是有损策略，不以“全开”作为完善标准。
