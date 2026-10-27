# 面板点不动的时候先看这里

这份记录写的是 0.4.0 之前的那次 UI 交互失效：**magpie 设置面板里所有按钮都没反应**——预设点不动，齿轮和烧瓶切不了视图，策略开关也按不动。

结论先说：跟 iframe 沙箱没关系。是渲染函数抛了异常，`init()` 中断在半路，按钮的监听根本没绑上。

## 排查走过弯路

现象很容易让人怀疑沙箱，下面这几条**都不是**原因：

- `sandbox="allow-scripts"` 加 `connect-src 'none'` 的 CSP：页面确实拿不到网络，但点击、`hidden`、`style.display` 全都不受影响。
- 视图切换的写法（只用 `hidden`、只用 `display`、两者都写）：三种都试过，都没用——因为压根没走到那一步。
- 脚本加载顺序、`node --check` 语法检查、HTML 是否被浏览器缓存：都查过，全是干净的。
- 也不要在 iframe 里靠 `console.log` 找线索：magpie 主界面的 devtools 里看不到插件 iframe 的输出，日志会静悄悄地丢掉。

## 真正的原因

`paint()` 是按「想当然的接口」写的，magpie 一挂载就抛错：

- 把 `V.engines()` 当 map/对象遍历，它其实是数组；
- 调了 `page/ui.js` 里不存在的 `U.row` / `U.box`；
- 读了 `page/view.js` 的 TEXT 里不存在的字段（例如 `T.status`）。

第一行就 `TypeError`。而 `init()` 的顺序是「先渲染、后绑定事件」，异常把 `init()` 打断在渲染那一步，后面 `bindViewButtons()` 之类的绑定一次都没执行——所以整个面板死掉。表现上跟「沙箱拦住点击」一模一样，排查方向很容易被带跑。

修法：每个渲染函数外面套一层 `safePaint()`，单个区块炸掉不再拖死整轮；然后所有渲染严格按 `page/view.js` / `page/ui.js` 的真实契约重写。

## 契约（不要再猜）

- `page/view.js:293` `cards(strategies, stats, lang)` → 返回卡片数组，每项 `{id, label, why, description, badge, tone, available, requires, on, rule}`。
- `page/ui.js:6` `el(tag, cls, text)`、`page/ui.js:13` `clear(host)`、`page/ui.js:21` `switchButton(on, disabled, onChange, label)`、`page/ui.js:37` `meter(host, m, T)`、`rows(host, cards, ctx)`，其中 `ctx = {T, open, config, onToggle, onSwitch, onField}`。
- 会话索引在 `options.stats.captures[]`，字段是 `{id, at, protocol, model, before, after, saved, summary}`。**旧的 `cap.ts` / `cap.strategy` / `rate` / `beforeText` 都不存在**，照着写只会渲染出 `Invalid Date … NaN MB → NaN MB NaN%`。
- 完整快照不在索引里：每条 capture 另有一份 `page/captures/<id>.js`，插入 `<script src="captures/<id>.js">` 之后读 `globalThis.__COMPRESS_CAPTURES__[id]`，得到 `{id, at, protocol, model, beforeText, afterText, beforeBytes, afterBytes, savedBytes, report}`。CSP 允许这种同源动态脚本，弹窗就是按需这么加载的。
- `report.strategies[]` 每项 `{id, label, available, enabled, status, reason, beforeBytes, afterBytes, ms, savedBytes}`。
- 页面在沙箱里唯一的数据通道是 `magpie.options`，而且 `set` 是**整包替换**：保存时必须提交完整 options（包括钩子写进去的 `stats`），只提交改动字段会把 `strategies`、`preserve` 一起抹掉。

## 怎么复验

```bash
node test/run.mjs          # 全部引擎与钩子套件
node test/live-probe.mjs   # 对着真的 magpie 打一次
```

UI 本身不进 `test/run.mjs`（那套只跑引擎和钩子）。要给面板做交互回归，用最小 DOM 加 `vm` 直接加载 `page/engines.js` + `view.js` + `ui.js` + `panel.js`（或 `app.js`）+ 一个 `magpie` stub，断言按钮数量、点击后的写回和视图切换；注意保存走 1100ms 节流窗口，断言要跨过去。

要连真机看的话，magpie 开了远程调试端口后，用 CDP 附着到 `settings.html` 那个 iframe target：`Runtime.consoleAPICalled` / `Runtime.exceptionThrown` 能收到里面抛的异常，`Runtime.evaluate` 可以读 `#viewMain` / `#viewCustom` 的 `hidden` 与几何，改完 `location.reload()` 即可。注意 iframe target 不支持 `Page.reload`。