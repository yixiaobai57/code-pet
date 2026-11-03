/* 拖动方案 v5 验证：系统级 drag + 右键菜单链路 + 渲染 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/drag-result.txt';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listPages() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  return r.json();
}
(async () => {
  fs.writeFileSync(LOG, 'drag v5 start\n');
  const pages = await listPages();
  const cat = pages.find(p => p.url.includes('index.html'));
  if (!cat) throw new Error('cat not found');
  const ws = new WebSocket(cat.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };

  // 1) 渲染检查：截图 + 检查 JS 无报错（drag 代码已清）
  await send('Page.enable');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/ui-check/drag5-render.png', Buffer.from(shot.result.data, 'base64'));
  log('render shot saved');

  // 2) JS 无拖动状态机残留
  const js = await send('Runtime.evaluate', {
    expression: `({ hasPointerdown: window.__pd || document.querySelector('.container').onpointerdown !== null, dragVar: (typeof dragging !== 'undefined') })`,
    returnByValue: true
  });
  log('JS 状态检查: ' + JSON.stringify(js.result.result.value));

  // 3) 右键链路：注入 contextmenu 事件 → 菜单窗口应出现
  await send('Runtime.evaluate', {
    expression: `document.querySelector('.container').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 50, clientY: 50 }))`
  });
  await sleep(700);
  const pages2 = await listPages();
  const menu = pages2.find(p => p.url.includes('menu.html'));
  log('右键菜单窗口出现: ' + (menu ? 'PASS' : 'FAIL'));

  // 4) 真实右键事件路径：CDP mousePressed button=right → contextmenu 应触发 → 菜单出现
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 71, y: 71, button: 'right', buttons: 2, clickCount: 1, modifiers: 0 });
  await sleep(700);
  const pages3 = await listPages();
  const menu2 = pages3.find(p => p.url.includes('menu.html'));
  log('真实右键事件触发菜单: ' + (menu2 ? 'PASS' : 'FAIL'));

  log('drag v5 done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'DRAG5-ERR ' + e.message + '\n'); process.exit(1); });
