# CCR 压缩-取回链路（task-3 · 2026-10-29）

[中文](./ccr-retrieval-chain.md) | [English](./ccr-retrieval-chain.en.md)

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
   ├─ 门控 detectRetrieveCapability（harness.js 唯一实现，上游 #7746；
   │    direct=tools[] / indirect=code tool+agent / deferred=ToolSearch 清单；
   │    可用 requireRetrieveTool:false 关）
   ├─ 命中：消息段 → preamble(200字符) + [CCR retrieve hash=<24hex> chars=N]
   ├─ 原文写入共享 store（ctx.ccrStore 注入；未注入=本次请求内存，moejs 语义）
   └─ 协议指令 [CCR protocol]… 幂等注入 system（deferred 走 ToolSearch 变体）
   ▼
ccr-store-file.js  createPersistentCcrStore()
   └─ 去抖 2s 落盘 <数据目录>/ccr-store.json（>512KB 块只活内存，同上游）
   ▼
mcp/ccr-retrieve-server.mjs（stdio MCP，零依赖）
   └─ omniroute_ccr_retrieve(hash, mode=full|head|tail|lines|grep|stats)
      full ≤256KiB；取回计数合并写回文件 → ramp 跨进程生效
```

## 门控的可达形状（harness.js）

| 模式 | 判据 | 典型调用方 |
|:--|:--|:--|
| `direct` | `body.tools[]` 里有以 `omniroute_ccr_retrieve` 结尾的名字（`__ _ . / : -` 分隔符均可） | Claude Code（旧版）、Copilot、codex `type:"mcp"` |
| `indirect` | 有 code tool（eval/execute/…）且 agent 在 `INDIRECT_CALL_HINTS` 白名单（**按声明推断的启发式，不是能取回的证明**） | omp / pi / opencode |
| `deferred` | system/instructions 里有“deferred tools / ToolSearch”说明，且工具名**单独成行** | Claude Code 2.1.3xx（MCP 工具延迟加载） |
| `none` | 以上都不成立 | hindsight、未装 retrieve 的客户端 |

`deferred` 是 2026-11-04 补的：Claude Code 把 MCP 工具从 `tools[]` 移到 system 的
ToolSearch 清单，只查 `tools[]` 的门控会静默变成 `no_retrieve_tool`。判定只读
`tools[]` / `system` / `instructions`，**不扫描 messages 正文**——正文里提到工具名
不代表模型能调用。`test/harness-matrix.test.mjs` 为每种形状钉了夹具。

2026-11-12 补两点：

- 判定支持的形状多了一类：**system/developer 消息** content 块数组里的显式文本块
  （`[{type:"text",text:…}]`，只认 `text` / `input_text`；user/assistant/tool 消息与其它
  块类型一律不看）。原生 Claude CLI 的回环请求已验证这种容器，旧门控判 `none`、修复后判 `deferred`。
  历史线性化 capture 仍不能恢复旧请求的容器结构。
- **间接可达不等于真能取回**：`indirect` 只是按声明推断的启发式（有 code tool 且 agent
  在白名单），不证明模型真的会调。codex 常带 shell/`exec_command`，但 shell 本身不构成
  retrieve 通道，所以 codex 已移出 `INDIRECT_CALL_HINTS`：只有显式声明（`tools[]` 全名
  或 `type:"mcp"`）或延迟清单命中时 ccr 才动手，否则 `none` → `no_retrieve_tool`。若当前
  宿主上 `/mcp/run/ccr-retrieve` 返回 404（网关运行门控没把 server 派给该 agent），推荐把
  Library 里的 ccr-retrieve 设为 direct（stdio 命令）：同步会据此重写 agent 配置，比手改
  `config.toml` 耐久。客户端是否已修要单独验证，不能从代码侧修好推断。

以上都只是**判定**；真正取回一次要靠调用方实际调用工具，历史命中数字只是当时快照，
不代表所有客户端都健康。

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

- test/ccr-persist.test.mjs P-1~P-11 全绿（序列化 round-trip、过期剔除、512KB 上限、
  持久 handle、端到端命中+兑现、门控 reason、ramp 持久、MCP 层、路径解析、
  安装命令日志与幂等重放）
- stdio 冒烟：真实子进程 JSON-RPC initialize/tools/list/tools/call，
  full 模式取回 6000 字符逐字节一致。
- 回放口径不变：历史 capture 未声明 retrieve 工具，ccr 按门控跳过（上游语义），
  遥测 reason 从笼统的 nothing_to_remove 变为准确的 no_retrieve_tool。
- 持久上限（512KiB）**严格之上**的块：Bun 宿主按序列化排除规则跳过压缩，原文原样发出
  （正好 512KiB 的块仍会落盘）。
- 生产管线只校验**本次真正被替换的段**（协议指令注入与历史旧 marker 不算）；映射对不上
  就回滚到 ccr 进入前的快照，不是整条管线进入前的 body。Bun 宿主先 `await` store 就绪
  再压，且只有本次请求的原文落盘成功才发布 marker，写失败时保持原文；落盘成功不代表
  永久可取回，TTL 与容量淘汰仍然适用。
- 历史回放与命中数字是各自日期的实测快照，不是「所有客户端都健康」的保证。
