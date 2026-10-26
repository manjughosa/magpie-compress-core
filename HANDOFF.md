# magpie 压缩插件 — 交接文档

## 项目位置

`C:\Users\maste\.config\magpie\plugins\compress-core`

## 当前状态

**已完成**：
- 压缩核心功能正常（15 个策略引擎、四档预设、真实请求压缩）
- 测试 15 个 suite 全绿
- 数据通道正常（钩子写 plugins.json 的 options.stats）

**正在做（卡住）**：
- UI 重新设计：两级视图（主面板 ↔ 自定义策略）+ 实验室全窗口
- 差异对比弹窗（点击会话弹出）

**当前问题**：
- 在 magpie 设置面板里，UI 完全无法交互（按钮点击无反应）
- 已确认：HTML 已更新、JS 语法正确、iframe 已加载新代码
- 怀疑：magpie 的 iframe 沙箱（`connect-src 'none'`）阻止了某些行为，或 `hidden` 属性切换失效

## 文件结构

```
page/
  settings.html    # 设置面板（两级视图 + 弹窗）
  index.html       # 整页入口（同样结构）
  panel.js         # 设置面板逻辑（视图切换、会话列表、差异弹窗）
  app.js           # 整页逻辑（与 panel.js 共享同一套代码）
  audit.js         # 试压实验室逻辑
  style.css        # 样式（850 行，两级视图 + 弹窗 + 实验室）
  engines.js       # 策略引擎定义（勿动）
  view.js          # 视图工具（勿动）
  ui.js            # UI 工具（勿动）
  lab-engine.js    # 试压引擎（暴露 engines 列表）
```

## 调试线索

1. **iframe 沙箱**：magpie 插件页面在 `<iframe sandbox="allow-scripts">` 里，CSP 是 `connect-src 'none'`。数据通道只有 `magpie.options`（整包替换，1s 限流）。

2. **视图切换**：`switchView()` 函数切换 `hidden` 属性 + `style.display`。已尝试只用 `hidden`、只用 `display`、两者都用——都不行。

3. **事件绑定**：`bindViewButtons()` 在 `init()` 里调用，绑定齿轮/烧杯/返回按钮。已确认函数被调用（加了 `console.log`），但 magpie iframe 的 console 输出看不到。

4. **脚本加载顺序**：
   ```html
   <script src="_magpie/bridge.js"></script>
   <script src="engines.js"></script>
   <script src="view.js"></script>
   <script src="ui.js"></script>
   <script src="lab-engine.bundle.js"></script>
   <script src="audit.js"></script>
   <script src="panel.js" defer></script>
   ```

5. **已验证**：
   - `node --check panel.js` 语法正确
   - `git log` 最新提交 `304b8e3`
   - 直接访问 `http://127.0.0.1:3426/_magpie/plugin/08b0be69.../settings.html` 返回新 HTML

## 下一步建议

1. **在 iframe 里注入调试脚本**：用 CDP 向 iframe 注入 `console.log` 收集器，看 `init()` 是否执行、事件是否绑定成功。

2. **检查 `magpie.options.get()`**：确认 bridge.js 在 iframe 里正常初始化，`options.get()` 能返回数据。

3. **简化测试**：注释掉 `paintSessions()` 和 `paintRows()`，只留 `bindViewButtons()`，看按钮点击是否切换视图。

4. **备选方案**：如果 iframe 沙箱限制太死，考虑：
   - 用 `postMessage` 与父页面通信，让父页面切换视图
   - 或放弃两级视图，回到单层列表（但用户明确要求两级）

## 联系

原助手：Claude（已完成核心功能，UI 交互卡住）
用户：YG（中文，要求精致 UI，参考 OmniRoute 风格）

## 测试命令

```bash
cd ~/.config/magpie/plugins/compress-core
node test/run.mjs    # 15 个 suite 应全绿
```

## 提交历史

```
304b8e3 wip: layered UI redesign, interaction broken in magpie iframe
9f3c0cd redesign: layered UI with OmniRoute-style diff view
25ca06f fix: settings panel shows lab + captures; await command processing in hook
```
