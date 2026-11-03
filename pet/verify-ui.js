/* UI 验证：触发右键菜单 → 打开设置 → 截图 settings/menu 各状态 */
const fs = require('fs');
const LOG = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/drag-result.txt';
const OUT = 'C:/Users/19421/Doubao/chats/2026-11-03/new-chat/code-pet/pet/ui-check';
const log = (s) => fs.appendFileSync(LOG, s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function listPages() {
  const r = await fetch('http://127.0.0.1:9222/json/list');
  return r.json();
}
async function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let seq = 0; const pending = new Map();
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
  };
  return {
    send(method, params = {}) {
      const id = ++seq;
      ws.send(JSON.stringify({ id, method, params }));
      return new Promise((res) => pending.set(id, res));
    }
  };
}
async function shot(cdp, file) {
  const r = await cdp.send('Page.captureScreenshot', { format: 'png' });
  if (r.result && r.result.data) {
    fs.writeFileSync(file, Buffer.from(r.result.data, 'base64'));
    return true;
  }
  return false;
}
async function waitPage(urlPart, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const pages = await listPages();
    const p = pages.find(x => x.url.includes(urlPart));
    if (p) return p;
    await sleep(250);
  }
  return null;
}

(async () => {
  fs.writeFileSync(LOG, 'ui-check start\n');
  fs.mkdirSync(OUT, { recursive: true });

  // 0) 若旧 settings 窗口还开着，先关闭（否则 openSettings 只聚焦不重载新文件）
  const old = await waitPage('settings.html', 1500);
  if (old) {
    try {
      let ocdp = await connect(old.webSocketDebuggerUrl);
      await ocdp.send('Runtime.evaluate', { expression: `window.electronAPI.closeSettings()` });
      await sleep(600);
      log('old settings closed');
    } catch (e) { log('close old settings err: ' + e.message); }
  }

  // 1) 桌宠页触发右键菜单（模拟 contextmenu）
  const cat = await waitPage('index.html', 3000);
  if (!cat) throw new Error('cat not found');
  let cdp = await connect(cat.webSocketDebuggerUrl);
  await cdp.send('Runtime.evaluate', { expression: `window.electronAPI.showContextMenu(700, 420)` });
  await sleep(600);
  log('menu triggered');

  // 2) 菜单窗口出现 → 截图菜单 → 点击“设置面板”
  const menu = await waitPage('menu.html', 4000);
  if (!menu) throw new Error('menu window not found');
  let mcdp = await connect(menu.webSocketDebuggerUrl);
  await shot(mcdp, OUT + '/menu.png');
  log('menu shot saved');
  await mcdp.send('Runtime.evaluate', { expression: `document.getElementById('m-settings').click()` });
  await sleep(800);
  log('settings clicked');

  // 3) 设置窗口出现 → 截图初始状态（主页）
  const settings = await waitPage('settings.html', 4000);
  if (!settings) throw new Error('settings window not found');
  let scdp = await connect(settings.webSocketDebuggerUrl);
  await shot(scdp, OUT + '/settings-home.png');
  log('settings-home shot saved');

  // 3b) 切到“设置”导航（默认通用设置标签）→ 截图通用设置（文字开关）
  await scdp.send('Runtime.evaluate', { expression: `document.querySelector('.nav-item[data-target="sec-settings"]').click()` });
  await sleep(400);
  await shot(scdp, OUT + '/settings-general.png');
  log('settings-general shot saved');

  // 4) 读取开关状态与文字
  const swInfo = await scdp.send('Runtime.evaluate', {
    expression: `({ symbol: { checked: document.getElementById('sw-symbol').checked, text: document.querySelector('#sw-symbol + .slider').textContent }, shiftIME: { checked: document.getElementById('sw-shiftIME').checked, text: document.querySelector('#sw-shiftIME + .slider').textContent }, insertOff: { checked: document.getElementById('sw-insertOff').checked, text: document.querySelector('#sw-insertOff + .slider').textContent } })`,
    returnByValue: true
  });
  log('switch states: ' + JSON.stringify(swInfo.result.result.value));

  // 5) 切到“界面设置”标签 → 截图
  await scdp.send('Runtime.evaluate', { expression: `document.querySelector('.tab[data-tab="tab-ui"]').click()` });
  await sleep(400);
  await shot(scdp, OUT + '/settings-ui.png');
  log('settings-ui shot saved');

  // 6) 切到“计时器”导航 → 截图
  await scdp.send('Runtime.evaluate', { expression: `document.querySelector('.nav-item[data-target="sec-timer"]').click()` });
  await sleep(400);
  await shot(scdp, OUT + '/settings-timer.png');
  log('settings-timer shot saved');

  // 7) 切回“设置”导航 + “关于”标签 → 截图
  await scdp.send('Runtime.evaluate', { expression: `document.querySelector('.nav-item[data-target="sec-settings"]').click(); document.querySelector('.tab[data-tab="tab-about"]').click()` });
  await sleep(400);
  await shot(scdp, OUT + '/settings-about.png');
  log('settings-about shot saved');

  // 8) 开关切换测试：点击 sw-symbol → 文字应变“开”
  await scdp.send('Runtime.evaluate', { expression: `document.getElementById('sw-symbol').click()` });
  await sleep(400);
  const afterToggle = await scdp.send('Runtime.evaluate', {
    expression: `({ checked: document.getElementById('sw-symbol').checked, text: document.querySelector('#sw-symbol + .slider').textContent })`,
    returnByValue: true
  });
  log('after toggle sw-symbol: ' + JSON.stringify(afterToggle.result.result.value));

  log('ui-check done');
  process.exit(0);
})().catch((e) => { fs.appendFileSync(LOG, 'UI-ERR ' + e.message + '\n'); process.exit(1); });
