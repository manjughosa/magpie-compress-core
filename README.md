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

## 四档预设

| 档 | 含义 |
| --- | --- |
| 关闭 | 全关。 |
| 稳妥 | OmniRoute 的"安全默认"：**无损且可用**的策略全开，其余不开。也就是 `session-dedup`、`ccr`、`lite`、`headroom`。 |
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

钩子能在**每一次**经过网关的请求上留一条快照，但 `capture` 默认**关**，只有打开之后才写。打开后，快照落在插件配置目录的 `captures/`（索引在 `captures-index.json`），最多保留最近 50 条，每条上限 2MB。

这些文件在页面沙箱里读不到，所以页面上的「已处理会话」列表不会再自己长出来；要看就打开 `captures/` 里的文件。行上的 `agent`（`dsh`、`pi` 等）标的是这条请求由哪一路 harness 发出。

页面每 5 秒读一次 `magpie.options`，有变化就重绘，不需要手动刷新。

## 隐私

落盘只发生在插件自己的目录（`MAGPIE_CONFIG_DIR` 优先，其次 `XDG_CONFIG_HOME/magpie`，默认 `~/.config/magpie` 下的 `compress-core/`；`COMPRESS_CORE_DATA_DIR` 可整体改掉）：

- `requests.jsonl`：每个请求一行统计（原始/压缩后字节、命中哪个策略、模型、客户端），**不含正文**。开关 `telemetry.samples` 打开后才额外存最多 8 对问答，每段 1600 字符，存前先过下面这套打码。
- `captures/`：只在 `capture` 打开时才有，是完整请求正文，单条上限 2MB（超了整条不落盘，索引里标 `too_large`），只保留最新 50 条。
- `captures-index.json`、`options-override.json`：索引与本地覆盖，不含正文。

打码在 `telemetry-store.js` 的 `SECRET_RULES`，快照与样本共用一套：私钥块整段、`ghp_`/`github_pat_`/`AKIA`/`AIza`/`sk-`/`xox?-` 形态的令牌、`eyJ…` 的 JWT、`Bearer …`、以及 `authorization`、`api_key`、`password`、`client_secret` 这类字段的值，全部换成 `[redacted:…]`；邮箱和 `C:\Users\…` 这类路径只在样本里替换（快照要能看清代码原文）。字段名保留、值丢掉，所以仍然看得出这条请求带了什么凭据。

两个开关都不碰代码本身——它们要回答的是「压缩对这段文本做了什么」。一段对话里如果有不能落盘的东西，就别打开 `capture` 和 `telemetry.samples`。

清空：页面上点「清空快照」，钩子删掉两个目录并清索引；`requests.jsonl` 直接删文件，下一次请求会重建。

## 实验室

试压台回答的是「这个策略对这段文本做了什么」，所以这台**不挂 `preserve`**：实验室的输入是单独一条 user 消息，挂上 preserve 之后它永远落在「保护最近 N 轮」的窗口里，每个策略看到的都只是占位符，结果就是每个策略都「前后没区别」。

输入形态有两种：**纯文本**当成一条 user 消息；**请求体 JSON**粘真实请求体，才能测到 `rtk`（工具输出）、`session-dedup`（重复块）、`headroom`（JSON 数组）这些靠结构的策略。

没命中时面板会写出原因（中文），不留一句「前后一样」让人猜。

## 许可与来源

MIT（`LICENSE`，保留 OmniRoute 的版权行）。每个引擎都是 OmniRoute `open-sse/services/compression` 的移植；来源仓库、对应文件与移植副本的 sha256 在 `PROVENANCE.json`。

经由 OmniRoute 触达、本身是 Apache-2.0 的上游：`caveman`（github.com/JuliusBrussee/caveman）、`headroom`（github.com/headroomlabs-ai/headroom，含 `engines/gcf/` 里的 GCF 列式编解码）、`rtk`（github.com/rtk-ai/rtk）。三者的许可全文在 `LICENSES/Apache-2.0.txt`，署名在 `NOTICE`。

## 开发

```bash
node test/run.mjs                 # 全部测试（22 套）
node test/run.mjs lite            # 只跑一套
bun test                          # 同一个入口的 bun 版：CI 就是它
node scripts/gen-page-catalog.mjs # 改完 catalog.js 后重新生成 page/engines.js
npm run build:page                # 改完 lab.js / engines 后重新打包 page/lab-engine.bundle.js
node test/live-probe.mjs          # 对着真的 magpie 打一次
```

`catalog.js` 是策略元数据的单一真相源；`page/engines.js` 是它的镜像（页面是 sandbox 里的普通 `<script>`，不能 import ES module），改 catalog 必须重新生成。

`page/lab-engine.bundle.js` 同样是产物：入口是 `page/lab-engine.js`，它 import `lab.js` 与 `catalog.js`，靠 esbuild 打成 IIFE。esbuild 不在这包的依赖里，只在改了那几个源文件之后手动跑一次 `npm run build:page`，产物跟着提交——装插件的人不需要构建环境。两个产物都别手改，改了会在下次生成时丢掉。

面板按钮点不动、或者要改页面的渲染层，先读 `DEBUGGING.md`：里面记了渲染契约、会话快照的取法，以及为什么「看起来像沙箱问题」其实不是。

`test/lite-spec.md` 和 `test/session-dedup-spec.md` 是这两个策略的行为契约，改引擎之前先看。

`cases.json` 是对外契约：23 条用例里，21 条与 magpie-community/plugins 里被合并的 history-trim (#423) 逐字一致，另外 2 条是这一包自己的默认档行为（正在发送的这一轮同样被改写、表格化的工具结果转成 `gcf-generic` 块）。它回答一个具体问题——同一份输入经过这个中间件之后，body 是否与那份实现留下的完全一致；不一致就是语义分叉，要么这里改，要么去那边论证。那 21 条显式写成保守模式（`preserveCurrentTurn: true`），因为 history-trim 的语义就是「正在发送的这一轮原样送出」，而这里默认是全量改写。magpie 仓库跑它用 `bun scripts/check.mjs`，这边等价的入口是 `node test/run.mjs gateway`。

## 卸载

```bash
magpie plugin rm compress-core
```

`~/.config/magpie/compress-core/` 里的遥测（`requests.jsonl`）不会被自动删掉。
