# compress-core 复活收尾报告（goal mvt0a83q-fvzhss）

日期：2026-10-29 ｜ 目标：四策略全活 + 界面预设切换真正生效

## 一、问题诊断（起点）

- 面板「捕获」列表把 0.3~0.6% 的节省显示成绿色 `-1%`：`fmtRate` 用正负号表达「压缩后/膨胀」，`Math.round(0.5)=0` 时符号先贴，视觉上像负增长。真实负数压缩 0 条。
- 真实压缩率近 48h 跌到 0.03~0.13%：lite 均省 0KB、session-dedup 0 命中（reason 全为 `no_repeat_eligible_block`）、ccr/headroom 各 0/500。
- session-dedup 在 enabled/disabled 间翻转 14 次、532 次请求被误关。

## 二、改动清单（全部有 .bak，落盘读回核验过）

| 任务 | 文件 | 备份 |
|:--|:--|:--|
| 显示修复 | page/panel.js、page/app.js（fmtRate 0% 分支） | .bak.20261029-0338 |
| task-2 子串级 dedup | engines/session-dedup.js | .bak.20261029-task2 |
| task-3 ccr 链路 | engines/ccr/index.js、pipeline.js、observability.hooks.js、options-commands.js、test/run.mjs | .bak.20261029-1351 |
| task-3 新文件 | ccr-store-file.js、mcp/ccr-retrieve-server.mjs、test/ccr-persist.test.mjs、docs/ccr-retrieval-chain.md | 新文件无旧态 |
| task-4 新测试 | test/active-shapes.test.mjs | 新文件 |
| task-5 界面 | page/panel.js、page/app.js、page/index.html、page/settings.html、page/style.css、page/view.js、test/run.mjs | .bak.20261029-task5 |
| task-5 新测试 | test/page-save-flow.test.mjs | 新文件 |
| 新增工具 | scripts/replay-captures.mjs（回放基线器） | 新文件 |

## 三、验证证据（逐条对照 success criteria）

### (1) session-dedup 真实命中且无损 ✅
- 回放 50 条历史 capture：命中 0→**49/50**，省 40705B，均耗 170.4ms→**2.2ms**，round-trip 0 mismatch。
- 生产真实流量（本会话 pi 流量，416KB body）：`status:"hit"` 省 1015B，`roundTrip 5/5 passed`，总耗 27ms / 600 预算。
- 算法：段落块（`\n{2,}` 切分 ≥minBlockChars）∪ 后缀行块（≥3行≥80字符，保上游语义）；行级 rolling hash（fnv1a32 + Horner 双模）O(n) 提取；哈希聚类后逐条 slice 比对再替换（撞哈希不错换）；全局首次保留、其余全换。
- 测试：A-01~A-32 全绿 + N-1~N-4（中段段落命中/幂等/全局首次保留）+ prefix-stability。

### (2) ccr 按上游语义可用 ✅（门控如实，链路已建）
- 持久 store（ccr-store-file.js：tmp+rename、2s 去抖、retrievalCounts 跨进程 max 合并、>512KB 不落盘同上游口径）。
- retrieve 工具链：mcp/ccr-retrieve-server.mjs 零依赖 stdio MCP server（full≤256KiB/head/tail/lines/grep/stats），stdio 真实子进程冒烟通过（6000 字符逐字节一致）。
- 门控未通过时如实报 `no_retrieve_tool`（与上游 fail-open 一致）。
- 页面一键安装：options-commands.js 的 `ccrCommand:{action:"install-mcp"}` → `magpie library mcp add ccr-retrieve …`。
- **遗留决策点**：安装 MCP server 会改 magpie library 配置（触及 agents 工具清单），按边界未自动执行。界面已补「装 retrieve」按钮（2026-10-29 二轮）：点击写 `ccrCommand` → 宿主在下一次本地请求时执行 `magpie library mcp add` → 结果发布为 `compress-ccr-status.js` 回画按钮状态（done 锁定/error 可重试）。也可手动跑 CLI：
- **端到端演示（验证合约要求）**：声明 `omniroute_ccr_retrieve` 工具的 body → 门控 pass → 长消息替换为 marker `[CCR retrieve hash=955dac… chars=1641]`（body 3467→1471 字符）→ 落盘后经 MCP server `handleRpc` full 模式取回 1641 字符**逐字节一致**，head 模式正常，store 落盘 5325B。临时目录已清理。

### (3) headroom/lite 匹配形状下命中，测试锁定 ✅
- test/active-shapes.test.mjs：H1 12 行同质 JSON 数组 headroom 命中+roundTrip 全过+restoreText canonical 等值（注意 restoreText 出紧凑 JSON 非原 pretty-print）；H2 3 行小数组不压；L1 lite 空白折叠逐字正确；L2 默认 cfg 不截 tool 结果（显式 `compressToolResults:true` 才截）；L3 默认不剥图。
- 真实流量上两者 0 命中是**输入形状使然**（无 ≥8 行同质数组、无大空白），reason 如实上报，不是引擎死。

### (4) 界面保存生效 + enabled 零抖动 ✅
- 根因：页面用**旧副本整包覆盖** options（双面板/轮询/CLI 并发互相盖键）+ 防抖窗口丢编辑。
- 修复：pendingPatch 增量记账 → flush 取最新 options 合并后 set；保存按钮（失败重挂保持脏态）；pagehide/visibilitychange 立即 flush；轮询脏态不冲编辑、非脏态采纳外部写入。
- 测试 S1-S6 全绿（合并语义/脏态轮询/连续合并/失败重试/外部采纳/pagehide）。
- CLI round-trip：set 后读回与 plugins.json 一致（15 键、off 已清除）。
- 最近 6 条真实请求 enabled 表完全一致，**零翻转**。
- 附带：插件原被 `"off": true` 整体关闭，已 `magpie plugin on compress-core` 打开。

### (5) 面板数字与遥测一致 ✅（含已知语义标注）
- 面板读 stats.json（与遥测同一写入器 publish）。
- jsonl 全量 6534req/468MB vs stats.json 1770/33MB 的差，来源有二：requests.jsonl.1 是旧轮转文件；24req 缺口是 stats-writer 的**设计内语义**（30s 节流 flush + 宿主重启丢进程内增量，文件头注释明写）。属归因而非 bug。

## 四、预算与兼容

- budgetMs 600：回放各引擎 avgMs ≤2.2ms；生产 totalMs 27ms。无恶化。
- 遥测格式向后兼容（reasonFor 仅新增 ccr 的 gateReason 分支）。
- 无新增 npm 依赖（mcp server 零依赖、相对导入）。
- 默认不开有损：compressToolResults/剥图仍需显式开启；ccr 有门控。

## 五、未验证项（如实标注）

1. **真实 webview 点击**：保存按钮/预设切换在真实 magpie webview 里未点击验证（CLI 环境不可达）。逻辑层由 stub DOM 驱动真实 panel.js 的 S1-S6 锁定。
2. **ccr 真命中**：需先在界面点「安装 retrieve 工具」（或手动 `magpie library mcp add`），装完后真实流量才会命中；链路本身已端到端冒烟。
3. stats.json 的 30s 节流窗口内面板数字滞后 ≤30s（设计语义，非缺陷）。

## 六、遗留决策点（需用户拍板）

- 是否安装 ccr retrieve MCP server（一键按钮已就位；装=改 magpie library 配置，给 agents 加工具）。
- options-override.json 是死文件（无任何代码读取），建议删或接进读取链路——删除需授权。
- 回放口径说明：captures 存的是文本视图（丢 content-block 结构），回放为文本级近似；生产口径以 requests.jsonl 为准。
