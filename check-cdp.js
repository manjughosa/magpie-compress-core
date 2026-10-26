// CDP 脚本：检查 magpie 页面的 iframe 和 panel.js 加载情况
import WebSocket from 'ws';
const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/7975DE04ED16876E5AFA213A0ACB704B');

ws.on('open', () => {
  const expr = `
    (function() {
      const result = {
        iframes: document.querySelectorAll('iframe').length,
        ids: Array.from(document.querySelectorAll('[id]')).map(e => e.id),
        panelJsLoaded: typeof window.CompressView !== 'undefined'
      };
      return result;
    })()
  `;
  ws.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: expr, returnByValue: true } }));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data);
  if (msg.id === 1) {
    console.log('Main page:', JSON.stringify(msg.result, null, 2));
    // 检查 iframe
    const iframeExpr = `
      (function() {
        // 强制刷新所有 iframe
        document.querySelectorAll('iframe').forEach(f => f.src = f.src);
        return { refreshed: true };
      })()
    `;
    ws.send(JSON.stringify({ id: 2, method: 'Runtime.evaluate', params: { expression: iframeExpr, returnByValue: true } }));
  }
  if (msg.id === 2) {
    console.log('Iframe:', JSON.stringify(msg.result, null, 2));
    ws.close();
  }
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
  process.exit(1);
});

setTimeout(() => {
  console.error('Timeout');
  ws.close();
  process.exit(1);
}, 10000);
