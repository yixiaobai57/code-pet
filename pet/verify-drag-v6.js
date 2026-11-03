/* v6 验证：主进程轮询拖动方案 — IPC 链路 + 右键 + 渲染 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/drag-result.txt';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listPages() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  return r.json();
}
(async () => {
  fs.writeFileSync(LOG, 'drag v6 start\n');
  const pages = await listPages();
  const cat = pages.find(p => p.url.includes('index.html'));
  if (!cat) throw new Error('cat not found');
  const ws = new WebSocket(cat.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };

  // 1) 渲染 + JS 无状态机
  await send('Page.enable');
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/ui-check/drag6-render.png', Buffer.from(shot.result.data, 'base64'));
  const js = await send('Runtime.evaluate', { expression: `({ dragVar: (typeof dragging !== 'undefined'), hasApi: !!(window.electronAPI && window.electronAPI.dragStart && window.electronAPI.dragEnd), region: getComputedStyle(document.body).webkitAppRegion })`, returnByValue: true });
  log('渲染截图保存; JS 检查: ' + JSON.stringify(js.result.result.value));

  // 2) 右键真实事件 → 菜单窗口出现（验证 no-drag 恢复后右键不被吞）
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 71, y: 71, button: 'right', buttons: 2, clickCount: 1, modifiers: 0 });
  await sleep(700);
  let pages2 = await listPages();
  const menu = pages2.find(p => p.url.includes('menu.html'));
  log('右键触发菜单: ' + (menu ? 'PASS' : 'FAIL'));
  // 关掉菜单窗口
  if (menu) {
    const w2 = new WebSocket(menu.webSocketDebuggerUrl);
    await new Promise((r, j) => { w2.onopen = r; w2.onerror = j; });
    w2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `window.electronAPI.closeMenu ? window.electronAPI.closeMenu() : (window.close(), 0)` } }));
    await sleep(400);
    w2.close();
  }

  // 3) 拖动 IPC 链路：dragStart 不抛错、轮询期间窗口位置保持（光标未动 → 原位钳制）
  const p0 = await send('Runtime.evaluate', { expression: `({ sx: window.screenX, sy: window.screenY })`, returnByValue: true });
  const before = p0.result.result.value;
  const r1 = await send('Runtime.evaluate', { expression: `window.electronAPI.dragStart(window.screenX + 71, window.screenY + 71)`, returnByValue: true });
  const noThrowStart = !r1.result.exceptionDetails;
  await sleep(400);
  const p1 = await send('Runtime.evaluate', { expression: `({ sx: window.screenX, sy: window.screenY })`, returnByValue: true });
  const mid = p1.result.result.value;
  const stable = Math.abs(mid.sx - before.sx) <= 1 && Math.abs(mid.sy - before.sy) <= 1;
  const r2 = await send('Runtime.evaluate', { expression: `window.electronAPI.dragEnd()`, returnByValue: true });
  const noThrowEnd = !r2.result.exceptionDetails;
  await sleep(400);
  const p2 = await send('Runtime.evaluate', { expression: `({ sx: window.screenX, sy: window.screenY })`, returnByValue: true });
  const after = p2.result.result.value;
  log('dragStart IPC 无异常: ' + (noThrowStart ? 'PASS' : 'FAIL'));
  log('dragEnd IPC 无异常:   ' + (noThrowEnd ? 'PASS' : 'FAIL'));
  log('轮询期间窗口位置稳定(光标未动): ' + (stable ? 'PASS' : 'FAIL ' + JSON.stringify({ before, mid })));
  log('结束后位置不变: ' + (Math.abs(after.sx - mid.sx) <= 1 ? 'PASS' : 'FAIL'));

  log('drag v6 done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'DRAG6-ERR ' + e.message + '\n'); process.exit(1); });
