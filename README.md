# compress-core

给 magpie 网关用的上下文压缩插件。它在请求离开本机之前改写 `messages`，把重复的、噪声的、格式化的部分去掉，然后照原样交给上游。

这是 OmniRoute 压缩策略的完整移植：策略 id、名字、优先级、有损标记都跟那边一致，能搬的都搬了，搬不动的在表里标了原因。

## 装

```bash
magpie plugin add @magpie-community/middleware-compress-core  # 从 registry 装
magpie plugin add <本目录>                                    # 本地目录
magpie plugin add github:magpie-community/plugins             # 从仓库装（packages/compress-core）
```

装完 `magpie plugin list` 里应该能看到这个插件声明了 `middleware`、`hooks`、`page` 和两个 `panels`。

## 策略

按 `stackPriority` 升序执行，每个都可以单独开关、单独调参。

| id | 名字 | 优先级 | 有损 | 状态 | 做什么 |
| --- | --- | --- | --- | --- | --- |
| `session-dedup` | Session Dedup | 3 | 否 | 已移植 | 本会话早前发过的文本换成 `[dedup:ref sha=…]`，原文可用映射还原。 |
| `ccr` | CCR | 4 | 否 | 已移植 | 大段重复/连续块换成内容寻址引用，原文可检索。 |
| `lite` | Lite Cleanup | 5 | 否 | 已移植 | 只处理空白、重复行与格式，不动措辞。最快，永远安全。 |
| `rtk` | RTK Tool Output | 10 | 是 | 已移植 | 剥掉 ANSI 噪声、进度条与重复行，保留报错、警告与摘要。 |
| `codex-responses` | Codex Tool Output | 12 | 是 | 已移植 | 对 Responses API 的 shell / 补丁 / 搜索 / 构建输出做保守裁剪。 |
| `headroom` | Headroom (GCF) | 15 | 否 | 已移植 | 表格化 JSON 转列式，长行折成 `[N rows]`，靠围栏里的 GCF 数据还原。 |
| `relevance` | Relevance | 18 | 是 | 已移植 | 按最后一条用户消息给句子打分，丢掉低分句；数字、URL、报错、代码、堆栈行永不丢。 |
| `caveman` | Caveman | 20 | 是 | 已移植 | 规则式散文压缩，11 种语言的规则包。 |
| `read-lifecycle` | Read Lifecycle | 22 | 是 | 已移植 | 把被后续 Read/Write 覆盖掉的旧文件读取结果折成短桩。 |
| `aggressive` | Aggressive | 30 | 是 | 已移植 | 老轮次摘要 + 老化。 |
| `llmlingua` | LLMLingua-2 | 35 | 是 | 不可用 | 需要 ONNX 模型与 worker 线程，插件宿主里跑不了。 |
| `ultra` | Ultra | 40 | 是 | 已移植 | 启发式 token 级剪枝，最激进的纯本地选项。 |
| `ionizer` | Ionizer | 50 | 是 | 已移植 | 采样式压缩，故意有损。 |
| `llm` | LLM Compressor | 60 | 是 | 不可用 | 需要一个外部 chat-completion 后端，本插件内提供不了。 |
| `omniglyph` | OmniGlyph | 90 | 是 | 不可用 | 需要 omniglyph 包与支持图片直传的供应商。 |

不可用的三个在面板上照常显示，标 `不可用` 并写明缺什么，开关点不动。

## ccr 与 retrieve：压掉的东西去哪了

ccr 是「把大段文本换成一个标签」的策略。它和其他压缩不一样的地方是：**原文一字不删，只是挪了个地方**。

工作流程：

1. **压缩时**：请求里有一段够长的文本（默认 600 字符以上），ccr 把它整个换成一行
   标签：`[CCR retrieve hash=955dac5846d17f19c5811f24 chars=1641]`。原文以这个
   哈希为键，存进插件数据目录的 `ccr-store.json`。请求体积当场瘦下来。
2. **模型读到标签时**：它看到的是占位符不是原文。需要原文时，它调用
   `omniroute_ccr_retrieve` 工具，把哈希递过去。
3. **retrieve 工具**：一个本地小 MCP server（`mcp/ccr-retrieve-server.mjs`，零依赖），
   拿哈希去 store 里查，把原文逐字节吐回给模型。支持 `full`（全文，上限 256KiB）、
   `head` / `tail`（前后 N 行）、`lines`（行区间）、`grep`（正则筛选）、`stats`（元信息）
   六种取法，模型可以只取它要的那一段。

**为什么要单独「装 retrieve」**：ccr 动手前先检查调用方 agent 的工具清单里有没有
`omniroute_ccr_retrieve`。没有就不压，原样放行（遥测里会看到 `no_retrieve_tool`）——
因为压了模型却没有取回手段，等于把内容真丢了。门控宁可不干活也不丢东西，所以
**不装 retrieve 工具时 ccr 永远是 0 命中，这是设计行为不是故障**。

安装（一次性，二选一）：

- 面板预设区点「装 retrieve」按钮；
- 或命令行：`magpie library mcp add ccr-retrieve node <插件目录>/mcp/ccr-retrieve-server.mjs`

装完之后的第一次请求里 ccr 就开始真命中。安装时会把工具派给 agent：
默认派给 library 里已经在收 library MCP 的那些 agent；想自己点名，在插件 options 里加
`"ccrAgents": "pi,opencode"`（逗号分隔的 agent id）再点按钮。事后也能随时用
`magpie library mcp agents ccr-retrieve <a,b…>` 调整。重复安装是幂等的——已存在同名
服务器按成功处理，按钮不会因为「装过了」报错。

store 是本地文件，默认 24 小时过期、
容量有上限（单块 2MB / 全局 64MB），超了按最久未用淘汰；同一段内容被取回得越频繁，
ccr 越倾向不再压它（防乒乓）。模型读到的标签行前面会保留原文开头 200 个字符，
方便它判断要不要取回。

技术细节（store 格式、ramp、门控规则、与上游 OmniRoute 的差异）见
`docs/ccr-retrieval-chain.md`。

## 四档预设

| 档 | 含义 |
| --- | --- |
| 关闭 | 全关。 |
| 稳妥 | OmniRoute 的"安全默认"：**不删原文**的策略全开，其余不开。也就是 `session-dedup`、`ccr`、`lite`、`headroom`。前两个会把文本换成引用标记（dedup 指向本会话里已有的副本，ccr 可经 retrieve 取回），所以这里说的是"原文仍在"，不是"一个字节都不动"。 |
| 自定义 | 你自己逐个点出来的结果。手动改任何开关，档位自动落到这一档。 |
| 全开 | 所有可用策略全开（不可用的仍然开不了）。 |

"自定义"是结果态，不是按钮——点它没意义，所以它是灰的。

## 缓存与前缀

提供方按**请求前缀**命中 prompt cache：前缀里有一个字节变了，后面整段都按未命中计费。

lite 默认**全量改写、严格前缀稳定**：每条消息从第一轮起就走同一套确定性变换（折叠空白本身幂等），一条消息一旦发出去，此后每个字节都是同一个结果，前缀不再变化，缓存一次都不失配。代价是正在发送的这一轮也会被折叠空白与去重——用户刚打的字同样会被压缩。

把 `preserveCurrentTurn` 设成 `true` 换回保守模式：最后一条 assistant 之后的消息（没有 assistant 时整段）原样送出，只在它从「当前轮」变成「历史」的那一轮被改写一次，那一次前缀失配，之后重新稳定。代价是这条消息被改写了一次，缓存那次 miss。

`session-dedup` 认同一个开关：默认也把正在发送的这一轮照常处理，显式 `preserveCurrentTurn: true` 才保护它。理由是同一个——只保护当前轮，等于让那条消息在下一轮里被改写一次，前缀跟着变。

`test/prefix-stability.test.mjs` 就是这条验收：逐轮追加原文，每一轮发出的前缀必须与上一轮逐字节相同，默认档、稳妥档与每个无损引擎各测一遍。

`preserve.lastTurns` 默认 `0`（不额外保护任何轮次）。设成 N 会把最近 N 轮排除在所有改写之外；那一轮滑出窗口时同样被改写一次，这是窗口本身带来的，不是 lite 的。

`preserve.system` 默认 `false`。开着它会把 system 段整段占位保护、跑完再还原，代价是依赖 system 内容的那一步（例如「同一段 system 写了两遍只留一份」）整段失效——上一版把它默认成 `true`，等于把那一步变成死配置。要绝对不动 system 的人显式写 `true`。

`compressToolResults` 默认 `false`，也就是不截断历史里的工具结果。把工具的输出来腰斩，模型是在读一段它不知道被切过的东西；截断还按长度改写模型已经读过的消息，前缀跟着失配。要旧行为（OmniRoute 默认会按 `maxToolLength` 截断）就显式写 `compressToolResults: true`，`maxToolLength` 仍按原样解析（低于 2000 的下限回落到 2000）。

## 超大的 body

`maxBytes` 默认 `8000000`：**超过这个尺寸的 body 一个引擎都不跑，原样发出去**，遥测里记 `tooLarge` 与 `body_too_large`。钩子只有 250 ms，而 20 MB 的 body 光 `JSON.stringify` 就要 70 ms 上下，任何引擎还没看它一眼——那种尺寸在任何机器上都压不进预算。按尺寸而不是按时钟跳过，是因为尺寸是确定的：同一份 body 每次都得到同一个判断，它贡献给上游提示词缓存的前缀就不动。判断本身不算精确字节数：先数文本长度（O(n)、不分配、永远是真实字节数的下界），下界已经过线就直接下结论，离门限还远就直接放行，只有卡在中间那一小段才付一次精确计数。

`budgetMs` 默认 `0`，即不按时间跳过任何策略。给它一个正值，pipeline 会在超时后停掉剩下的策略——但同一个请求在负载下可能压出两种结果，而变过的 body 是缓存永远复用不了的 body，所以默认不给时间预算。引擎自己也不带 deadline（`session-dedup` 的 `timeBudgetMs` 同样默认 `0`）。

## 页面

侧栏 Plugins 组 → 压缩：一条压缩尺、档位、每个策略一行、最近八次请求。

## 面板 · 设置

设置 → 插件：同样的档位与策略行，紧凑版。

## 面板 · 用量

用量 → Overview 末尾：压缩尺 + 最近四次请求。

首屏一行只放顺序、名字、无损/有损、一句说明、省下字节和开关；点行才展开完整描述、命中/省下/占比、执行顺序、缓存影响、读取范围，以及这个策略自己的参数（数字框、下拉、复选组）。

三个界面共用 `page/view.js` 的计算和 `page/style.css` 的样式，颜色全部取自 magpie 自己的 `--magpie-*` 变量，所以深浅色主题都跟着走。

一个已知行为：这个插件同时有 `middleware` 和 `hooks`，所以从界面上保存 options 时 magpie 会重启一次钩子宿主（不到一秒）。期间请求原样通过，之后压缩继续。纯页面插件不会有这个代价。

另一个坑：`magpie.options.set` 是**整包替换**，不是深合并。页面每次保存必须提交完整 options（包括钩子写的 `stats`），只提交改动的字段会把 `strategies`、`preserve` 一起抹掉。`app.js` / `panel.js` 的 `save()` 已经按整包写。

## 数字是从哪来的

钩子把累计统计写进插件配置目录的 `stats.json`，和 `requests.jsonl`、`captures/` 放在一起，**不碰 magpie 自己的 `plugins.json`**。那个文件 magpie 盯着 mtime，一改就重启钩子宿主——等于每压一次请求重启一次，代价远超收益。

magpie 给页面和面板的沙箱是 `connect-src 'none'`，也没有文件系统，`magpie.options` 是它唯一能读的东西。所以页面读不到 `stats.json`：压缩尺旁边会写明数字在哪个文件里，页面上不再显示实时数字。

写文件时很保守：

- 先写 `.tmp` 再 rename，失败静默；
- 最快 30 秒一次（首个请求立即写一次）；
- 读回来超过 4MB 就不解析，避免被坏文件拖住；
- `COMPRESS_CORE_NO_STATS=1` 时完全不碰磁盘（测试用）。

压缩本身不依赖这些数字：文件写不进去，压缩照跑。

## 会话记录

钩子能在**每一次**经过网关的请求上留一条快照，`capture` 默认**关**（显式设 `true` 才开）。快照落在插件配置目录的 `captures/`，索引另存 `captures-index.json`，最多保留最近 50 条，每条上限 2MB。

页面的 CSP 是 `connect-src 'none'`，只放行插件自己的 `page/` 目录。所以数字和列表都由钩子发布成同目录的两个脚本，页面用 `<script src>` 载入：`captures-index.js`（会话列表：id、时间、`agent`、模型、字节数）和 `compress-stats.js`（顶部统计与每个策略的 saving）。对话原文只在 `captures/`，不进安装包。行上的 `agent`（`dsh`、`pi` 等）标的是这条请求由哪一路 harness 发出。

页面每 5 秒重新取一次两个已发布脚本和 `magpie.options`，有变化就重绘，不需要手动刷新。

## 隐私

落盘只发生在插件自己的目录（`MAGPIE_CONFIG_DIR` 优先，其次 `XDG_CONFIG_HOME/magpie`，默认 `~/.config/magpie` 下的 `compress-core/`；`COMPRESS_CORE_DATA_DIR` 可整体改掉）：

- `requests.jsonl`：每个请求一行统计（原始/压缩后字节、命中哪个策略、模型、客户端），**不含正文**。开关 `telemetry.samples` 打开后才额外存最多 8 对问答，每段 1600 字符，存前先过下面这套打码。
- `captures/`：只在 `capture` 打开时才有，是完整请求正文，单条上限 2MB（超了整条不落盘，索引里标 `too_large`），只保留最新 50 条。
- `captures-index.json`：索引，不含正文。

打码在 `telemetry-store.js` 的 `SECRET_RULES`，快照与样本共用一套：私钥块整段、`ghp_`/`github_pat_`/`AKIA`/`AIza`/`sk-`/`xox?-` 形态的令牌、`eyJ…` 的 JWT、`Bearer …`、以及 `authorization`、`api_key`、`password`、`client_secret` 这类字段的值，全部换成 `[redacted:…]`；邮箱和 `C:\Users\…` 这类路径只在样本里替换（快照要能看清代码原文）。字段名保留、值丢掉，所以仍然看得出这条请求带了什么凭据。

两个开关都不碰代码本身——它们要回答的是「压缩对这段文本做了什么」。一段对话里如果有不能落盘的东西，就别打开 `capture` 和 `telemetry.samples`。

清空：页面上点「清空快照」，钩子删掉两个目录并清索引；`requests.jsonl` 直接删文件，下一次请求会重建。`ccr-store.json` 同样直接删文件——代价是已替换的原文标记暂时取不回（模型读到标签时会发现取不到，正文在 24 小时后本来也会过期）。

## 实验室

试压台回答的是「这个策略对这段文本做了什么」，所以这台**不挂 `preserve`**：实验室的输入是单独一条 user 消息，挂上 preserve 之后它永远落在「保护最近 N 轮」的窗口里，每个策略看到的都只是占位符，结果就是每个策略都「前后没区别」。

输入形态有两种：**纯文本**当成一条 user 消息；**请求体 JSON**粘真实请求体，才能测到 `rtk`（工具输出）、`session-dedup`（重复块）、`headroom`（JSON 数组）这些靠结构的策略。

没命中时面板会写出原因（中文），不留一句「前后一样」让人猜。

## 许可与来源

MIT（`LICENSE`，保留 OmniRoute 的版权行）。每个引擎都是 OmniRoute `open-sse/services/compression` 的移植；来源仓库、对应文件与移植副本的 sha256 在 `PROVENANCE.json`。

经由 OmniRoute 触达、本身是 Apache-2.0 的上游：`caveman`（github.com/JuliusBrussee/caveman）、`headroom`（github.com/headroomlabs-ai/headroom，含 `engines/gcf/` 里的 GCF 列式编解码）、`rtk`（github.com/rtk-ai/rtk）。三者的许可全文在 `LICENSES/Apache-2.0.txt`，署名在 `NOTICE`。

## 开发

```bash
node test/run.mjs                 # 全部测试（24 套）
node test/run.mjs lite            # 只跑一套：参数是套件名（每个套件文件里的 name；例：`lite`、`gateway cases (cases.json)`）
bun test                          # 同一个入口的 bun 版：CI 就是它
node scripts/gen-page-catalog.mjs # 改完 catalog.js 后重新生成 page/engines.js
npm run build:page                # 改完 lab.js / engines 后重新打包 page/lab-engine.bundle.js
node test/live-probe.mjs          # 对着真的 magpie 打一次
```

`catalog.js` 是策略元数据的单一真相源；`page/engines.js` 是它的镜像（页面是 sandbox 里的普通 `<script>`，不能 import ES module），改 catalog 必须重新生成。

`page/lab-engine.bundle.js` 同样是产物：入口是 `page/lab-engine.js`，它 import `lab.js` 与 `catalog.js`，靠 esbuild 打成 IIFE。esbuild 不在这包的依赖里，只在改了那几个源文件之后手动跑一次 `npm run build:page`，产物跟着提交——装插件的人不需要构建环境。两个产物都别手改，改了会在下次生成时丢掉。

面板按钮点不动、或者要改页面的渲染层，先读 `DEBUGGING.md`：里面记了渲染契约、会话快照的取法，以及为什么「看起来像沙箱问题」其实不是。

`test/lite-spec.md` 和 `test/session-dedup-spec.md` 是这两个策略的行为契约，改引擎之前先看。

`cases.json` 是对外契约：23 条用例里，21 条与 magpie-community/plugins 里被合并的 history-trim (#423) 逐字一致，另外 2 条是这一包自己的默认档行为（正在发送的这一轮同样被改写、表格化的工具结果转成 `gcf-generic` 块）。它回答一个具体问题——同一份输入经过这个中间件之后，body 是否与那份实现留下的完全一致；不一致就是语义分叉，要么这里改，要么去那边论证。那 21 条显式写成保守模式（`preserveCurrentTurn: true`），因为 history-trim 的语义就是「正在发送的这一轮原样送出」，而这里默认是全量改写。magpie 仓库跑它用 `bun scripts/check.mjs`，这边等价的入口是 `node test/run.mjs "gateway cases (cases.json)"`。

## 卸载

```bash
magpie plugin rm compress-core
```

`~/.config/magpie/compress-core/` 里的遥测（`requests.jsonl`）不会被自动删掉。
