# Task-1 取证：基线数据表 + 上游 OmniRoute 语义摘要

日期：2026-10-29 · 目标 goal=mvt0a83q-fvzhss（四策略全活）

## 一、基线数据表（真实流量回放）

数据源：`%USERPROFILE%\.config\magpie\compress-core\` 的 requests.jsonl（6445 条，2026-10-26T00 → 10-28T19）+ captures-index.json 最近 50 条 + `scripts/replay-captures.mjs` 回放。

### 1. 最近 50 条回放（生产记录吻合：生产 5291B vs 回放 5391B）

| 策略 | enabled | 命中 | 省字节 | 平均耗时 | 备注 |
|:--|:--|:--|:--|:--|:--|
| lite | 50/50 | 50 | 5391B | 2.2ms | 仅折 `\n{3,}` 和行尾空白 |
| session-dedup | 33 | 0 | 0 | **170.4ms** | 白烧 600ms 预算的 28%，reason=no_repeat_eligible_block |
| ccr | 50 | 0 | 0 | — | 100% 死于门控 |
| headroom | 50 | 0 | 0 | — | no_eligible_json_array_or_not_smaller |

总压缩率 **0.07%**。

### 2. 时间线（小时聚合）

| 时段 | 节省率 | lite 均省 | 场景 |
|:--|:--|:--|:--|
| 10-26 00-06 | 6~19% | 31~70KB | 调试期，消息大量重复 |
| 10-26 10-11 | 68~69% | 636~1319KB | 大重复 payload |
| 10-27 多次 | 20~37% | 88~618KB | 同上 |
| 10-28 12 起 | 0.06~0.63% | ~0 | 上游 bili 代理已先折叠 |
| 10-28 19（最近） | 0.13% | 0KB | dedup 0 hit |

### 3. 最近 capture 消息结构（107 段）

tool 67.7K 字符 / system 27.9K / user 6.4K / assistant 5.1K。
无损冗余实测：重复行 164 字符、0 个 500 字符窗口重复、无 base64、1 个不达标 JSON 数组。829KB body 大头是 tools schema（不可碰）。

## 二、上游 OmniRoute 语义摘要（release/v3.8.51 源码实测）

仓库已重定向 `github.com/cheaper-inference/OmniRoute`。本地取证文件：/tmp/omni-sd.ts（session-dedup 511 行）、/tmp/omni-ccr.ts（ccr/index 1023 行）、/tmp/omni-ccrQuery.ts（110 行）、/tmp/omni-proto.ts（protocolInstruction 119 行）、/tmp/omni-ccrTools.ts（MCP 工具 schema 202 行）、/tmp/omni-ccrBlocks.ts（持久层 138 行）。

### session-dedup（上游）

- dedup 单元 = `findSuffixBlocks`：从某行**到消息末尾**的整块（≥3 行、≥80 字符），跨消息精确重复才替换成 `[dedup:ref]` 后向引用。
- fuzzy pass 可选（默认关），~85% 相似的整条消息换成可 CCR 取回的 marker——**需 caller 声明 omniroute_ccr_retrieve 工具**。
- 对最近 capture（102 段）实测：suffix-block 重复 0/5151 对 → 真实 pi 流量下结构性 0 命中。

### ccr（上游）

1. **门控**：`callerSupportsCcrRetrieve(body)` 扫描 tools[]，名字须精确等于 `omniroute_ccr_retrieve` 或以分隔符（`__` `.` `/` `:`）结尾匹配（如 `mcp__docker__omniroute__omniroute_ccr_retrieve`）。不通过 → 整个引擎跳过，fail-open。协议指令（`[CCR protocol]` system 消息）也只在门控通过时注入。
2. **替换**：整条非 system/非 tool 消息的 text（≥`minChars`，默认 600）→ `preamble(前200字符)… [CCR retrieve hash=<24hex> chars=N]`。替换串不短于原文则不动。
3. **store**：`(principalId ?? "__anon__") + hash` 为键。两层：模块级内存 Map + better-sqlite3 持久表（>512KB 的块仅内存）。容量：5000 条 / 单块 2MB / 单 principal 16MB / 全局 64MB。TTL 默认 24h（最大 7d）。写盘经 setImmediate 延迟队列，同队列保序 persist/delete。
4. **ramp**：`effectiveMinChars = minChars + retrievalCount × rampFactor(默认2) × minChars`——被取回过的内容越取门槛越高，防"压了取、取了压"循环。
5. **retrieve 工具链**：上游通过自带 MCP server 暴露 6 个工具：`omniroute_ccr_store / retrieve / inspect / list / delete / stats`。retrieve 输入 `{hash, mode?, n?, start?, end?, pattern?, unique?}`，mode ∈ full/head/tail/lines/grep/stats；full 响应上限 256KiB，超限返回 `tooLargeForFull` + `suggestedModes`。grep 用 safe-regex 防回溯爆炸（≤512 字符 pattern、≤1000 匹配、≤10000 行 range）。store 工具让模型主动存原文换 `ccr://` 引用。

## 三、移植版差距（ccr/index.js 705 行）

- 门控、preamble、marker 格式、ramp：已对齐上游。
- **store 是请求级内存**（ctx.state.ccr.map），同请求内 restoreCcr() 可还原；**跨请求 marker 成死引用**——这是 0 命中的另一半原因（门控本来就过不去，因为 pi 流量没声明 retrieve 工具）。
- 持久化与 retrieve 工具链缺位 = task-3 的核心工作。

## 四、magpie 侧可行通道（已实测）

- 无 onToolCall 钩子（二进制 strings 确认）→ 插件不能在网关侧替模型执行工具。
- `magpie library mcp add <name> <command args…> [agents=a,b…]` 可把 stdio MCP server 写进 agent——task-3 落点：插件自带 `mcp/ccr-retrieve.mjs`（Node stdio MCP server，读宿主写的持久 store 文件），页面一键安装走 options-commands 通道。
- `magpie plugin options <name> [<json>]` 是整包替换，页面保存须提交完整 options。
