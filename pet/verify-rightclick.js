/* 右键补测：完整右键（按下+松开）是否触发菜单 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/drag-result.txt';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  fs.appendFileSync(LOG, 'right-click retest start\n');
  const pages = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const cat = pages.find(p => p.url.includes('index.html'));
  if (!cat) throw new Error('cat not found');
  const ws = new WebSocket(cat.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };
  // 完整右键：按下 + 松开
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 71, y: 71, button: 'right', buttons: 2, clickCount: 1, modifiers: 0 });
  await sleep(150);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 71, y: 71, button: 'right', buttons: 0, clickCount: 1, modifiers: 0 });
  await sleep(800);
  const pages2 = await (await fetch('http://127.0.0.1:9222/json/list')).json();
  const menu = pages2.find(p => p.url.includes('menu.html'));
  log('完整右键触发菜单: ' + (menu ? 'PASS' : 'FAIL'));
  if (!menu) {
    // 兜底：直接派发 contextmenu 事件验证 JS 监听链路
    const r = await send('Runtime.evaluate', { expression: `document.querySelector('.container').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))` });
    await sleep(800);
    const pages3 = await (await fetch('http://127.0.0.1:9222/json/list')).json();
    const menu3 = pages3.find(p => p.url.includes('menu.html'));
    log('JS contextmenu 派发触发菜单: ' + (menu3 ? 'PASS' : 'FAIL'));
  }
  log('right-click retest done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'RC-ERR ' + e.message + '\n'); process.exit(1); });
