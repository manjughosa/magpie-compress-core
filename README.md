# compress-core

给 magpie 网关用的上下文压缩插件。它在请求离开本机之前改写 `messages`，把重复的、噪声的、格式化的部分去掉，然后照原样交给上游。

这是 OmniRoute 压缩策略的完整移植：策略 id、名字、优先级、有损标记都跟那边一致，能搬的都搬了，搬不动的在表里标了原因。

## 装

```bash
magpie plugin add <本目录>                              # 本地目录
magpie plugin add github:manjughosa/magpie-compress-core # 从 GitHub 装
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

## 页面与面板

- **页面**（侧栏 Plugins 组 → 压缩）：一条压缩尺、档位、每个策略一行、最近八次请求。
- **面板 · 设置**（设置 → 插件）：同样的档位与策略行，紧凑版。
- **面板 · 用量**（用量 → Overview 末尾）：压缩尺 + 最近四次请求。

首屏一行只放顺序、名字、无损/有损、一句说明、省下字节和开关；点行才展开完整描述、命中/省下/占比、执行顺序、缓存影响、读取范围，以及这个策略自己的参数（数字框、下拉、复选组）。

三个界面共用 `page/view.js` 的计算和 `page/style.css` 的样式，颜色全部取自 magpie 自己的 `--magpie-*` 变量，所以深浅色主题都跟着走。

一个已知行为：这个插件同时有 `middleware` 和 `hooks`，所以从界面上保存 options 时 magpie 会重启一次钩子宿主（不到一秒）。期间请求原样通过，之后压缩继续。纯页面插件不会有这个代价。

另一个坑：`magpie.options.set` 是**整包替换**，不是深合并。页面每次保存必须提交完整 options（包括钩子写的 `stats`），只提交改动的字段会把 `strategies`、`preserve` 一起抹掉。`app.js` / `panel.js` 的 `save()` 已经按整包写。

## 数字是从哪来的

magpie 给页面和面板的沙箱是 `connect-src 'none'`，页面拿不到网络，`magpie.options` 是它唯一能读的东西。

所以钩子侧压完一次请求，就把累计摘要写回 `plugins.json` 里本插件条目的 `options.stats`，页面再去读。这条路 magpie 没有为此设计过，但 `pluginrt.KeepFresh` 每 2 秒会重读这个文件，实测可行。写的时候很保守：

- 只在本插件条目**唯一匹配**时动手；
- 文件 mtime 在 1.5 秒内（magpie 刚写过）就跳过；
- 先写 `.tmp` 再 rename，失败静默；
- 最快 30 秒一次（首个请求立即写一次）；
- `COMPRESS_CORE_NO_STATS=1` 时完全不碰磁盘（测试用）。

如果哪天 magpie 改成内存持有这个文件，数字会停在最后一次写回的值，压缩本身不受影响。页面没有另起服务，也不开端口；它只读 `magpie.options`。

## 两条通道

- `observability.hooks.js` 跑在 Bun 宿主里（默认 1s，`gatewayTimeoutMs` 可配到 10s），负责真正的压缩、遥测与回写统计。**主战场。**
- `compress-core.middleware.js` 跑在 magpie 的 moejs 里（Go 进程内，250ms 预算、无文件系统、无 fetch）。它负责在钩子已经压过的请求上去掉内部标记，以及钩子没跑时补一次压缩。

`pipeline.js` 里 `INTERNAL_MARKER` 就是两边不重复压的约定。

引擎本身写在 `engines/`，契约见 `engines/CONTRACT.md`：纯函数、无 Node API、无 fetch、无定时器、只能相对 import、250ms 预算、必须 fail-open。

## 会话记录

页面上的「已处理会话」列表来自 `options.stats.captures[]`，钩子在**每一次**经过网关的请求上都会写一条（`capture` 默认开，设成 `false` 才关），只保留最新 50 条；每条同时把完整快照发布到 `page/captures/<id>.js`，点开才加载，所以列表本身很轻。

行上会标出 `agent`（`dsh`、`pi` 等），也就是这条请求是哪一路 harness 发的——和脱敏页看到的语言是一致的。

页面每 5 秒读一次 `magpie.options`，有变化就重绘，不需要手动刷新；写回设置时会把最新的 `stats` 一起带上，避免整包替换把钩子刚写进去的数字覆盖掉。

## 开发

```bash
node test/run.mjs                 # 全部测试
node test/run.mjs lite            # 只跑一套
node scripts/gen-page-catalog.mjs # 改完 catalog.js 后重新生成 page/engines.js
node test/live-probe.mjs          # 对着真的 magpie 打一次
```

`catalog.js` 是策略元数据的单一真相源；`page/engines.js` 是它的镜像（页面是 sandbox 里的普通 `<script>`，不能 import ES module），改 catalog 必须重新生成。

面板按钮点不动、或者要改页面的渲染层，先读 `DEBUGGING.md`：里面记了渲染契约、会话快照的取法，以及为什么「看起来像沙箱问题」其实不是。

`test/lite-spec.md` 和 `test/session-dedup-spec.md` 是这两个策略的行为契约，改引擎之前先看。

## 卸载

```bash
magpie plugin rm compress-core
```

`~/.config/magpie/compress-core/` 里的遥测（`requests.jsonl`）不会被自动删掉。
