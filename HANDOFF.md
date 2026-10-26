# compress-core 交接

## 当前任务状态（2026-10-26）

用户要求停止继续开发，交给下一位处理。本文件记录真实状态，不把未完成的交互标成完成。

用户最终收敛的范围：小压缩工具，单策略试压实验室、真实压缩前后审计；复用现有四种协议适配，不新增 CLI 适配。页面沿用 magpie 原生脱敏页风格：逐行、渐进展开、首屏简洁。

**已完成且实际可用：**
- 插件位于 `C:\Users\32203\.config\magpie\plugins\compress-core`，由 magpie 从该路径加载。
- 压缩主链路、15 策略目录、四档预设、原生风格页面/设置与用量面板。13 个策略可用，`llmlingua` / `llm` / `omniglyph` 显示不可用。
- 本地单策略试压：在真实页面点击 lite 验证成功，使用浏览器内同一引擎，无模型调用、无试压文本落盘。
- 实际网关请求压缩正常。近期真实快照示例：605,150 B → 455,298 B，省 149,852 B；当前策略开关以 `plugins.json` 为准。
- 快照完整对话文本已能写入本地，列表已能在真实页面显示真实记录及字节差。
- 最后一次完整测试 `all tests passed`，15 个 suite，含 `AUDIT-01..04`。

**尚未完成，交接重点：**
1. **点击真实快照后，完整前后文没有载入页面。** 页面停留在“正在读取本地快照；下一次网关请求后载入。”，`captureDetail` 为空。`plugins.json` 中保留 `labCommand`，`captureResult` 仍为 `null`，说明命令未被宿主取走/返回。
2. **清空快照的同一命令通道尚未完成端到端验证。** 不应把它称为可用。
3. **统计与快照索引通过直接写 `plugins.json` 暴露给页面，存在宿主缓存与竞态。** 曾出现统计更新、列表为空，或页面保存覆盖统计的情况；现在部分由 `flushStats(true)` 缓解，但未验证长期一致性。
4. 大快照处理刚改过：不再存重复的 `before` / `after` JSON，只存 `beforeText` / `afterText`；单文件上限从 1 MB 改为 2 MB。超限时索引仍写 `summary: true` 和 `reason`，页面显示“仅摘要”、禁用展开。**此改动已通过测试与真实列表显示，但未完成完整审计闭环。**

## 最小复现

1. 打开 magpie 的压缩页，展开“真实压缩前后”。能看到真实快照列表，例如 `chat · 14:29 · 605,150 B → 455,298 B`。
2. 点击一行。`page/audit.js` 的 `requestCapture(id)` 发送：
   ```js
   opts.labCommand = { id: `view-${Date.now()}`, action: "capture", captureId: id }
   options.saveOptions(opts)
   ```
3. 后续实际请求已发生、列表有新记录，但 `labCommand` 仍保留旧命令，`captureResult` 为 `null`。
4. 运行 `E:\LLM_Config\Magpie\magpie.cmd plugin off compress-core` / `on` 后仍未解决。不要重复猜测“再发一次请求”。

真实页面 iframe：`http://127.0.0.1:3426/_magpie/plugin/9bcaea3cc988369819d7a4129e358241/index.html`。CDP 在 `127.0.0.1:9222`，辅助脚本 `C:\Users\32203\AppData\Local\Temp\cdp-eval.mjs`：第二参数为 Base64 JS，第三参数 `nav` 用新 query 刷新 iframe。目标是 `type:iframe` 且 URL 匹配 `index.html`，不是顶层 document。

## 关键实现与问题定位

### 压缩与捕获

- `observability.hooks.js`：Bun 网关钩子，运行 `runPipeline`、持久统计、保存完整对话文本。`onRequest(body, ctx)` 目前只有 `ctx.origin === "local"` 才调用 `processLabCommand(ctx.options)` 与 `processCaptureCommand(ctx.options)`，且未 `await`。
- `capture-store.js`：完整快照存 `MAGPIE_CONFIG_DIR/compress-core/captures`，保留 50 份；`saveCapture` 大小保护为 `MAX_CAPTURE_BYTES = 2000000`；`readCapture(id)` / `clearCaptures()` 已有。
- `stats-writer.js`：统计与快照索引在内存 `summary` 中，写回 `plugins.json` 的当前插件 `options.stats`。`flush()` 在文件超过 4,000,000 B 时静默跳过；当前 `plugins.json` 约 4 KB，**不是本次问题的根因**。
- `options-commands.js`：`processLabCommand` 负责 `action:"capture"` 读文件、`action:"test"` 试压；`processCaptureCommand` 负责清空。结果通过 `patch()` 直接改 `plugins.json`。命令 ID 去重集合最多 128 个。
- `page/audit.js`：本地试压与审计 UI。`pollCaptureResult()` 等待 `options.captureResult`；当前未收到。
- `page/app.js`：每 5 秒 `magpie.options.get()`；`magpie.options.set()` 是整包替换，所以 `save()` 总是发送完整 `options`，不要发送局部 patch。

### 已排除的错误方向

- **不是页面 DOM 没找到。** 正确 iframe 中 `.capture-row` 已能显示，点击能发出命令。
- **不是单纯的小文件写失败。** 小的合成钩子请求能保存文件、写入索引，文件和 `plugins.json` 均存在。
- **大文件曾确实失败。** 诊断日志显示 `capture_debug ... saved:false, reason:"too_large"`。原因是 JSON + 文本重复存储超过 1 MB；已改纯文本存储及 2 MB 上限。调试日志 `capture_debug` 已删除，不会继续新增此类日志。
- **页面没有通用文件读取或网络通道。** `magpie.read(name, params)` 只读取声明的宿主资源；本插件未声明权限。iframe 网络受限，`fetch` 本地文件服务不是当前实现。
- `observability.hooks.js` 中已确认存在的代码：`let saved = await saveCapture(snapshotRecord)` 后，如果 `saved.reason === "too_large"` 会再次保存**相同对象**。这是无效重试，下一位应删除或明确其目的。

### 宿主实现线索

运行时 host：`C:\Users\32203\.cache\magpie\plugin-host\host-25ef7cf0d281.js`。
- `gatewayRequest` 在约 1300 行调用 `h.onRequest(structuredClone(body), ctx)`，`ctx.options` 来自 `structuredClone(h.options)`。
- `setOptions` 在约 2600 行更新宿主持有的选项。插件自己改 `plugins.json` 并不会天然更新这些内存值。
- `gatewayTimeout(h)` 默认 1000ms；本插件 options 的 `gatewayTimeoutMs:4000`。小合成请求捕获与索引写入耗时约 28ms。
- 当前宿主不是直接运行 TypeScript，它通过 Bun 进程执行上述生成的 host 文件。

**建议下一位优先验证：** 是否需要把审计读取/清空拆为独立 `audit.hooks.js`，从压缩 hook 中完全分离，再检查多个 hook 的注册、顺序与选项缓存。这个方向尚未实施，不要当作已证实方案。先解释为什么现有 `processLabCommand` 没被宿主取走，再动架构。

## 选项与现场

配置：`C:\Users\32203\.config\magpie\plugins.json`，只修改 `spec` 末尾为 `compress-core` 的条目，别动其他插件配置。

当前用户启用了 `ionizer: true`（有损采样），其余常用稳妥策略 `session-dedup/ccr/lite/headroom` 为 true。不要擅自把它改回安全档；如做测试，只改临时 `MAGPIE_CONFIG_DIR` / `COMPRESS_CORE_DATA_DIR`。

有一个真实残留的待处理 `labCommand`（id `view-1792996072900`，指向 `capture-ca0b1879-6e63-4c47-a642-d4bd97c87752`）。它是复现证据，不是已完成命令。清理前先备份当前插件 options。

快照目录含真实请求内容，不能外发或提交。此前很多 1 MB 左右文件是开发阶段留下的真实历史快照；本轮额外生成的 `audit-test` 合成快照应清理，不碰真实历史记录。

## 验证

```powershell
cd 'C:\Users\32203\.config\magpie\plugins\compress-core'
$env:COMPRESS_CORE_NO_STATS = '1'
node test/run.mjs
```

已通过，包含：
- AUDIT-01 文本 / JSON 单策略试压；
- AUDIT-02 完整 after、50 份封顶、删除/清空；
- AUDIT-03 命令保留其他选项、重复 ID 幂等；
- AUDIT-04 真实钩子保存完整快照、写回索引且保留最新提问。

这些单元测试没有覆盖“真实 magpie 宿主执行命令 → options 返回页面”的缺口。

浏览器试压入口源码为 `page/lab-engine.js`，`page/lab.js` 是约 9,673 行的构建产物。改引擎后重新构建：

```powershell
& 'C:\Users\32203\.cache\magpie\bun\1.4.2\magpie-bun.exe' build page/lab-engine.js --outfile page/lab.js --target browser
```

钩子修改后需重新加载插件；页面 JS 变更需要带新 query 导航 iframe，普通刷新可能继续使用旧 bundle。

## 历史设计资料

- `E:\LLM_Config\_reports\omni-compression-architecture.md`
- `E:\LLM_Config\_reports\magpie-plugin-mechanism.md`
- `E:\LLM_Config\_reports\port-mapping.md`
- 插件使用说明：`C:\Users\32203\.config\magpie\plugins\compress-core\README.md`

停止前的状态：功能代码保留，插件已重载，完整测试通过；没有新增独立 audit hook、服务或新 CLI 适配。
