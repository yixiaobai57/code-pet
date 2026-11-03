/* 验证重启功能：设置页点“重启桌宠” → 进程 relaunch → 桌宠窗口恢复 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/drag-result.txt';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function listPages() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  return r.json();
}
async function waitPage(urlPart, ms) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const pages = await listPages();
      const p = pages.find(x => x.url.includes(urlPart));
      if (p) return p;
    } catch (e) { /* 进程重启瞬间连不上，正常 */ }
    await sleep(300);
  }
  return null;
}
(async () => {
  fs.writeFileSync(LOG, 'restart-check start\n');
  const before = await listPages();
  log('pages before: ' + before.map(p => p.url.split('/').pop()).join(', '));

  const settings = await waitPage('settings.html', 3000);
  if (!settings) throw new Error('settings not found for restart test');
  const ws = new WebSocket(settings.webSocketDebuggerUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0; const pend = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
  const send = (method, params = {}) => { const i = ++id; ws.send(JSON.stringify({ id: i, method, params })); return new Promise((r) => pend.set(i, r)); };
  await send('Runtime.evaluate', { expression: `document.getElementById('btn-restart-about').click()` });
  log('restart clicked');

  // 等旧进程退出 + 新进程起来（relaunch 会保留 --remote-debugging-port）
  await sleep(2500);
  const cat = await waitPage('index.html', 15000);
  log('new cat window: ' + (cat ? 'RECOVERED' : 'NOT FOUND'));
  if (cat) log('cat url: ' + cat.url);
  log('restart-check done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'RESTART-ERR ' + e.message + '\n'); process.exit(1); });
