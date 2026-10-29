# CCR 压缩-取回链路（task-3 · 2026-10-29）

> **这是什么**：ccr 把请求里的大段文本换成一行哈希标签（`[CCR retrieve hash=…]`），
> 原文存在本地 store 文件里，一字不删。模型需要原文时调用 `omniroute_ccr_retrieve`
> 工具按哈希取回——所以叫「无损压缩」。**前提是 agent 的工具清单里装了这个 retrieve
> 工具**：没装时 ccr 门控直接放行什么都不压（`no_retrieve_tool`），因为压了模型就
> 找不回原文。装法：面板点「装 retrieve」按钮，或 `magpie library mcp add`（见下文）。
> 更通俗的介绍见 README 的「ccr 与 retrieve」一节；本文是技术细节。

## 架构

```
调用方 body(tools 含 omniroute_ccr_retrieve)
   │  magpie → Bun 宿主 observability.hooks.js
   ▼
engines/ccr/index.js  applyCcr()
   ├─ 门控 callerSupportsCcrRetrieve（上游 #7746，可用 requireRetrieveTool:false 关）
   ├─ 命中：消息段 → preamble(200字符) + [CCR retrieve hash=<24hex> chars=N]
   ├─ 原文写入共享 store（ctx.ccrStore 注入；未注入=本次请求内存，moejs 语义）
   └─ 协议指令 [CCR protocol]… 幂等注入 system
   ▼
ccr-store-file.js  createPersistentCcrStore()
   └─ 去抖 2s 落盘 <数据目录>/ccr-store.json（>512KB 块只活内存，同上游）
   ▼
mcp/ccr-retrieve-server.mjs（stdio MCP，零依赖）
   └─ omniroute_ccr_retrieve(hash, mode=full|head|tail|lines|grep|stats)
      full ≤256KiB；取回计数合并写回文件 → ramp 跨进程生效
```

## 安装 retrieve 工具（调用方 agent 侧，一次性）

```sh
magpie library mcp add ccr-retrieve node <插件目录>/mcp/ccr-retrieve-server.mjs
```

或点界面上的「装 retrieve」按钮（预设区、保存按钮旁）：页面写 options
`ccrCommand: { id, action: "install-mcp" }`，下次本地请求由 options-commands.js
执行同一命令（结果记进 commands.json，幂等；同 id 重放不重复执行）。
执行结果同时发布成页面目录的 `compress-ccr-status.js`，面板轮询捡起后
回画按钮：done 锁定为「已装好」，error 显示「安装失败，点击重试」。
幂等三层：`completed` 集合（进程内）→ commands.json journal（宿主重启后同 id 重放
直接回画 done 不再执行）→ add 报「already has a server」按成功处理（同名已装）。
**agents 派单**：add 不带 agents 参数默认派给零个 agent（门控照样不放行）。
取 `options.ccrAgents`（逗号分隔 id），缺省用 library.json 里已有 library MCP 的
agent 并集（合法 id，magpie 遇未知 id 会整条失败，不能猜）；解析不到就只装不分。
store 路径解析：argv > CCR_STORE_PATH > COMPRESS_CORE_DATA_DIR/MAGPIE_CONFIG_DIR 默认。

## 与上游的差异（全部刻意）

| 点 | 上游 OmniRoute | 本移植 | 原因 |
|:--|:--|:--|:--|
| 持久层 | better-sqlite3 | JSON 原子写（tmp+rename） | 不新增 npm 依赖 |
| 工具注册 | 网关内建 MCP | 独立 stdio MCP server | magpie 无 onToolCall 钩子 |
| 计数并发 | 单进程 Map | 落盘前 max 合并 | hooks 与工具是两个进程 |
| 门控失败 | 静默跳过 | state.ccrGateReason → 遥测 reason `no_retrieve_tool` | 观测性 |

## 验证证据

- test/ccr-persist.test.mjs P-1~P-9 全绿（序列化 round-trip、过期剔除、512KB 上限、
  持久 handle、端到端命中+兑现、门控 reason、ramp 持久、MCP 层、路径解析）
- stdio 冒烟：真实子进程 JSON-RPC initialize/tools/list/tools/call，
  full 模式取回 6000 字符逐字节一致。
- 回放口径不变：历史 capture 未声明 retrieve 工具，ccr 按门控跳过（上游语义），
  遥测 reason 从笼统的 nothing_to_remove 变为准确的 no_retrieve_tool。
