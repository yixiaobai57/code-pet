/* 奶蛙验证：形象替换全链路 — 渲染/模式切换/右键/拖动 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/frog-result.txt';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listPages() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  return r.json();
}
(async () => {
  fs.writeFileSync(LOG, 'frog verify start\n');
  const pages = await listPages();
  const frog = pages.find(p => p.url.includes('index.html'));
  if (!frog) throw new Error('index.html page not found');
  log('窗口 URL: ' + frog.url + ' ' + (frog.url.includes('mascot=frog') ? 'PASS' : 'FAIL'));
  const ws = new WebSocket(frog.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };

  // 1) 渲染 + 配置核对
  await send('Page.enable');
  const js = await send('Runtime.evaluate', { expression: `(() => {
    const img = document.getElementById('mascot');
    return {
      src: img.src.split('/').pop(),
      w: img.style.width, h: img.style.height,
      alt: img.alt,
      cfgId: new URLSearchParams(location.search).get('mascot'),
      hasFrogCfg: !!MASCOT_CONFIGS.frog,
      hasApi: !!(window.electronAPI && window.electronAPI.dragStart && window.electronAPI.dragEnd && window.electronAPI.onSetMode)
    };
  })()`, returnByValue: true });
  const v = js.result.result.value;
  log('形象配置: src=' + v.src + ' 尺寸=' + v.w + 'x' + v.h + ' alt=' + v.alt + ' cfgId=' + v.cfgId + ' hasFrogCfg=' + v.hasFrogCfg + ' hasApi=' + v.hasApi);
  log('idle src=frog_idle.webp: ' + (v.src === 'frog_idle.webp' ? 'PASS' : 'FAIL'));
  log('尺寸 120x120: ' + (v.w === '120px' && v.h === '120px' ? 'PASS' : 'FAIL'));
  log('默认 mascot=frog: ' + (v.cfgId === 'frog' && v.hasFrogCfg ? 'PASS' : 'FAIL'));

  // 2) 渲染截图
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/ui-check/frog-idle.png', Buffer.from(shot.result.data, 'base64'));
  log('idle 渲染截图: ui-check/frog-idle.png');

  // 3) 模式切换 → running（直接驱动渲染层状态机：mode + updateImage）
  await send('Runtime.evaluate', { expression: `mode = 'running'; updateImage();` });
  await sleep(500);
  const shotRun = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync('C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/ui-check/frog-running.png', Buffer.from(shotRun.result.data, 'base64'));
  const rMode2 = await send('Runtime.evaluate', { expression: `document.getElementById('mascot').src.split('/').pop()`, returnByValue: true });
  log('running 切换 src=frog_running.webp: ' + (rMode2.result.result.value === 'frog_running.webp' ? 'PASS' : 'FAIL ' + rMode2.result.result.value));
  log('running 渲染截图: ui-check/frog-running.png');
  // 切回 idle
  await send('Runtime.evaluate', { expression: `mode = 'idle'; updateImage();` });
  await sleep(300);

  // 4) 右键 → 菜单窗口
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 71, y: 71, button: 'right', buttons: 2, clickCount: 1, modifiers: 0 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 71, y: 71, button: 'right', buttons: 0, clickCount: 1, modifiers: 0 });
  await sleep(800);
  let pages2 = await listPages();
  const menu = pages2.find(p => p.url.includes('menu.html'));
  log('右键弹出菜单: ' + (menu ? 'PASS' : 'FAIL'));
  if (menu) {
    const w2 = new WebSocket(menu.webSocketDebuggerUrl);
    await new Promise((r, j) => { w2.onopen = r; w2.onerror = j; });
    w2.send(JSON.stringify({ id: 1, method: 'Runtime.evaluate', params: { expression: `window.electronAPI.closeMenu ? window.electronAPI.closeMenu() : (window.close(), 0)` } }));
    await sleep(400);
    w2.close();
  }

  // 5) 拖动 IPC：dragStart/dragEnd 无异常 + 光标未动窗口稳定
  const p0 = await send('Runtime.evaluate', { expression: `({ sx: window.screenX, sy: window.screenY })`, returnByValue: true });
  const before = p0.result.result.value;
  const r1 = await send('Runtime.evaluate', { expression: `window.electronAPI.dragStart(window.screenX + 71, window.screenY + 71)`, returnByValue: true });
  const noThrowStart = !r1.result.exceptionDetails;
  await sleep(500);
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
  log('结束后位置不变: ' + (Math.abs(after.sx - mid.sx) <= 1 ? 'PASS' : 'FAIL ' + JSON.stringify({ mid, after })));

  log('frog verify done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'FROG-ERR ' + e.message + '\n'); process.exit(1); });
