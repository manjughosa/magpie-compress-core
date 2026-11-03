# 第 16 策略与组合流水线 · 2026-11-03

## 完成内容

- **LeanCTX Structured（第 16 条）**：`stackPriority: 17`，位于 Headroom(15) 与 Relevance(18) 之间；默认关闭、显式有损，只处理工具输出中的 CSV/TSV 与受限 YAML 清单，不处理普通对话。
- CSV/TSV 支持 RFC-4180 引号、转义引号、嵌入分隔符和换行；常量列提取，可选高熵列丢弃。YAML 仅支持明确可解析的常见清单子集，复杂结构原样跳过，不引入新运行时依赖。
- 数据值可还原；原始格式和主动丢弃的列不属于可恢复范围。主管线 round-trip 不符时回滚该策略。
- **Headroom/GCF 升级**：加入新版常量列编码与对应解码，保留既有嵌套/附件 round-trip 契约。全部既有 Headroom 测试通过。
- **RTK 评估结论**：不做整仓替换。当前 JS 实现与上游 Rust 引擎的架构不同，且上游 engine/proxy 是 BUSL-1.1；本次只保留现有兼容规则，不引入 BUSL 引擎。
- **组合链路修复**：Read Lifecycle 只折叠真正不同的旧读取；相同重复读取保留可还原正文。修复与 Dedup/LeanCTX 组合时旧引用被后续变换破坏的问题，并补逐轮追加原文的跨请求回归。
- **流水线入口**：主页与设置页齿轮旁新增 ⓘ，展开完整注册表顺序、每条是否启用和作用边界；步骤按实际注册表生成，不写死文案。

## 验证

- `node test/run.mjs`：全套通过（含新增策略、GCF、组合与页面测试）。
- `node scripts/gen-page-catalog.mjs` / `npm run build:page`：16 策略目录与试压台 bundle 已重建。
- `node --check page/app.js page/panel.js`：页面脚本语法通过。
- 组合回归覆盖：原文逐轮增长时，旧 Read 不再被折叠成 stub 破坏引用；真正变化的旧读取仍折叠。

## 边界

- LeanCTX 是自定义/全开策略，不属于无损默认档；没有 CCR 原文恢复通道时，主动丢列不可逆。
- YAML 支持范围是明确子集，不宣称完整 YAML 1.2。别名、tag、flow、block scalar 与复杂嵌套跳过。
- 本次未升级 RTK 到 BUSL 引擎，也未加入 LeanCTX 的权限、记忆、文件读取、MCP 或代理系统。
