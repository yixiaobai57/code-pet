const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const STARTUP_FLAG = '--launch-at-login';
const EDGE_OVERHANG = 24;
const ALWAYS_ON_TOP_LEVEL = 'screen-saver';
const INT32_MIN = -2147483648;
const INT32_MAX = 2147483647;

// CodePet 新增：VSCode 桥接地址与轮询间隔
const VSCODE_BRIDGE_URL = 'http://127.0.0.1:48672';
const POLL_VSCODE_MS = 3000;
const BUBBLE_SHOW_MS = 7000;

// CodePet 新增：码字计时器
const TIMER_FILE = 'code-pet-timer.json';
const POLL_ACTIVE_GRANULARITY_MS = POLL_VSCODE_MS; // 每轮询到 active 时累计的毫秒数

// 桌宠只保留猫猫（用户偏好）：去掉企鹅
const MASCOT_WINDOW_CONFIGS = [
  {
    id: 'cat',
    windowWidth: 140,
    windowHeight: 140,
    startOffsetX: 32
  }
];

const mascotWindows = new Map();

let backgroundWindow = null;
let tray = null;
let bubbleWindow = null;
let bubbleTimer = null;
let settingsWindow = null;
let contextMenuWindow = null;
let isBackgroundVisible = false;
let currentMode = 'vscode';
let lastVsCodeActive = false;

// CodePet 新增：系统开关（AutoHotkey）状态
let ahkProc = null;
const switchState = { symbol: false, shiftIME: false, insertOff: false };

// CodePet 新增：码字计时器状态
// autoActiveMs  —— VSCode 活跃（写代码）自动累计时长
// manualState    —— 手动计时：idle | running | paused
// manualStartAt  —— 手动计时开始时间戳（running 时有效）
// manualAccMs    —— 手动计时已累计毫秒（暂停时保留）
let timerState = { autoActiveMs: 0, manualState: 'idle', manualStartAt: 0, manualAccMs: 0 };
let timerDirty = false;

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
}

// ---------------------------------------------------------------- 系统开关

function findAhkExe() {
  const candidates = [
    process.env.AUTOHOTKEY_EXE,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'AutoHotkey', 'v2', 'AutoHotkey32.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'AutoHotkey', 'AutoHotkey64.exe'),
    path.join(process.env.PROGRAMFILES || '', 'AutoHotkey', 'v2', 'AutoHotkey64.exe'),
    'AutoHotkey.exe'
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes(path.sep) && fs.existsSync(c)) return c;
  }
  return candidates[candidates.length - 1];
}

function getSwitchScriptPath() {
  return path.join(__dirname, 'switches', 'code-switches.ahk');
}

function syncSwitches() {
  if (ahkProc) {
    try { ahkProc.kill(); } catch (e) { /* ignore */ }
    ahkProc = null;
  }

  const args = [];
  if (switchState.symbol) args.push('--symbol');
  if (switchState.shiftIME) args.push('--shift-ime');
  if (switchState.insertOff) args.push('--insert-off');

  if (args.length === 0) return;

  const ahk = findAhkExe();
  const script = getSwitchScriptPath();
  if (!fs.existsSync(script)) {
    console.error('[CodePet] switches script not found:', script);
    return;
  }

  try {
    ahkProc = spawn(ahk, [script, ...args], {
      windowsHide: true,
      stdio: 'ignore'
    });
    ahkProc.on('error', (err) => {
      console.error('[CodePet] failed to start switches:', err.message);
      ahkProc = null;
    });
    ahkProc.on('exit', () => {
      ahkProc = null;
    });
    console.log('[CodePet] switches started:', args.join(' '));
  } catch (err) {
    console.error('[CodePet] switches spawn error:', err);
    ahkProc = null;
  }
}

// ---------------------------------------------------------------- 窗口与桌宠（继承自 desktop-pet-mitarashi，MIT）

function supportsLaunchAtLogin() {
  return process.platform === 'win32' || process.platform === 'darwin';
}

function getStartupExecutablePath() {
  if (process.platform === 'win32' && process.env.PORTABLE_EXECUTABLE_FILE) {
    return process.env.PORTABLE_EXECUTABLE_FILE;
  }
  return process.execPath;
}

function getStartupRegistrationArgs() {
  if (process.platform !== 'win32') return [];
  if (app.isPackaged) return [STARTUP_FLAG];
  return [path.resolve(app.getAppPath()), STARTUP_FLAG];
}

function getLaunchAtLoginSettings() {
  if (!supportsLaunchAtLogin()) return { openAtLogin: false };
  if (process.platform === 'win32') {
    return app.getLoginItemSettings({ path: getStartupExecutablePath(), args: getStartupRegistrationArgs() });
  }
  return app.getLoginItemSettings();
}

function isLaunchAtLoginEnabled() {
  return Boolean(getLaunchAtLoginSettings().openAtLogin);
}

function setLaunchAtLogin(enabled) {
  if (!supportsLaunchAtLogin()) return;
  const settings = { openAtLogin: enabled };
  if (process.platform === 'darwin') {
    settings.openAsHidden = true;
  } else if (process.platform === 'win32') {
    settings.path = getStartupExecutablePath();
    settings.args = getStartupRegistrationArgs();
  }
  app.setLoginItemSettings(settings);
}

function shouldStartHidden() {
  if (process.platform === 'darwin') {
    return Boolean(app.getLoginItemSettings().wasOpenedAsHidden);
  }
  return process.argv.includes(STARTUP_FLAG);
}

function getWindowDisplay(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) {
    return screen.getPrimaryDisplay();
  }
  const [windowX, windowY] = targetWindow.getPosition();
  const [windowWidth, windowHeight] = targetWindow.getSize();
  return screen.getDisplayNearestPoint({
    x: Math.round(windowX + windowWidth / 2),
    y: Math.round(windowY + windowHeight / 2)
  });
}

function getMascotWindows() {
  return MASCOT_WINDOW_CONFIGS
    .map((config) => mascotWindows.get(config.id))
    .filter((targetWindow) => targetWindow && !targetWindow.isDestroyed());
}

function getInitialMascotPosition(config, display = screen.getPrimaryDisplay()) {
  // 用户偏好：不吸附边框 → 初始放在屏幕右下角，完整可见
  const margin = 12;
  return {
    x: display.bounds.x + display.bounds.width - config.windowWidth - margin,
    y: display.bounds.y + display.bounds.height - config.windowHeight - margin
  };
}

function applyMascotWindowBehavior(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  // 用户偏好：可交互（拖动拎出、右键菜单）→ 不再忽略鼠标事件
  targetWindow.setFocusable(false);
}

function toFiniteInteger(value) {
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return null;
  const roundedValue = Math.round(numericValue);
  if (!Number.isSafeInteger(roundedValue)) return null;
  if (roundedValue === 0) return 0;
  return Math.min(INT32_MAX, Math.max(INT32_MIN, roundedValue));
}

function clamp(value, min, max) {
  const lowerBound = Math.min(min, max);
  const upperBound = Math.max(min, max);
  return Math.min(Math.max(value, lowerBound), upperBound);
}

function getWindowPositionPayload(payload, y) {
  if (payload && typeof payload === 'object') {
    return { x: payload.x, y: payload.y };
  }
  return { x: payload, y };
}

function getVirtualDisplayBounds() {
  const displays = screen.getAllDisplays();
  if (displays.length === 0) return screen.getPrimaryDisplay().bounds;
  const left = Math.min(...displays.map((d) => d.bounds.x));
  const top = Math.min(...displays.map((d) => d.bounds.y));
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width));
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height));
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

function getSafeMascotWindowPosition(targetWindow, x, y) {
  const [windowWidth, windowHeight] = targetWindow.getSize();
  const virtualBounds = getVirtualDisplayBounds();
  const minX = virtualBounds.x - EDGE_OVERHANG;
  const minY = virtualBounds.y - EDGE_OVERHANG;
  const maxX = virtualBounds.x + virtualBounds.width - windowWidth + EDGE_OVERHANG;
  const maxY = virtualBounds.y + virtualBounds.height - windowHeight + EDGE_OVERHANG;
  return { x: clamp(x, minX, maxX), y: clamp(y, minY, maxY) };
}

function revealMascotWindow(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  if (typeof targetWindow.showInactive === 'function') {
    targetWindow.showInactive();
  } else {
    targetWindow.show();
  }
  applyMascotWindowBehavior(targetWindow);
}

function createMascotWindow(config, { show = true } = {}) {
  const initialDisplay = screen.getPrimaryDisplay();
  const initialPosition = getInitialMascotPosition(config, initialDisplay);

  const targetWindow = new BrowserWindow({
    width: config.windowWidth,
    height: config.windowHeight,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  targetWindow.loadFile('index.html', { query: { mascot: config.id } });
  targetWindow.setPosition(initialPosition.x, initialPosition.y);
  applyMascotWindowBehavior(targetWindow);

  if (show) {
    revealMascotWindow(targetWindow);
  }

  targetWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      targetWindow.hide();
    }
  });

  targetWindow.on('closed', () => {
    mascotWindows.delete(config.id);
  });

  mascotWindows.set(config.id, targetWindow);
  return targetWindow;
}

function ensureMascotWindows({ show = true } = {}) {
  return MASCOT_WINDOW_CONFIGS.map((config) => {
    let targetWindow = mascotWindows.get(config.id);
    if (!targetWindow || targetWindow.isDestroyed()) {
      targetWindow = createMascotWindow(config, { show });
    } else if (show) {
      revealMascotWindow(targetWindow);
    }
    return targetWindow;
  });
}

function showMascotWindows() {
  ensureMascotWindows({ show: true });
}

function sendToMascotWindows(channel, payload) {
  const windows = ensureMascotWindows({ show: false });
  windows.forEach((targetWindow) => {
    const dispatch = () => {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send(channel, payload);
      }
    };
    if (targetWindow.webContents.isLoadingMainFrame()) {
      targetWindow.webContents.once('did-finish-load', dispatch);
      return;
    }
    dispatch();
  });
}

function createBackgroundWindow() {
  const workArea = screen.getPrimaryDisplay().workArea;
  const imageAspectRatio = 1360 / 436;
  const windowHeight = Math.round(workArea.width / imageAspectRatio);

  backgroundWindow = new BrowserWindow({
    width: workArea.width,
    height: windowHeight,
    transparent: true,
    frame: false,
    alwaysOnTop: false,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  backgroundWindow.loadFile('background.html');
  backgroundWindow.setPosition(workArea.x, workArea.y + workArea.height - windowHeight);
  backgroundWindow.setIgnoreMouseEvents(true);
  backgroundWindow.hide();

  backgroundWindow.on('closed', () => {
    backgroundWindow = null;
  });
}

// ---------------------------------------------------------------- CodePet 新增：气泡窗口

function showBubble(payload) {
  if (!payload || (!payload.comment && !payload.detail)) return;

  if (!bubbleWindow || bubbleWindow.isDestroyed()) {
    bubbleWindow = new BrowserWindow({
      width: 360,
      height: 132,
      show: false,
      transparent: true,
      frame: false,
      alwaysOnTop: true,
      resizable: false,
      skipTaskbar: true,
      focusable: false,
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    bubbleWindow.loadFile('bubble.html');
    bubbleWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
    bubbleWindow.setIgnoreMouseEvents(true);
    bubbleWindow.setFocusable(false);
    bubbleWindow.on('closed', () => { bubbleWindow = null; });
  }

  const mascot = getMascotWindows()[0];
  let pos = { x: 200, y: 200 };
  if (mascot) {
    const [mx, my] = mascot.getPosition();
    pos = { x: mx - 110, y: my - 150 };
  }
  const display = screen.getDisplayNearestPoint({ x: pos.x, y: pos.y }).workArea;
  pos.x = clamp(pos.x, display.x, display.x + display.width - 360);
  pos.y = clamp(pos.y, display.y, display.y + display.height - 132);

  bubbleWindow.setPosition(Math.round(pos.x), Math.round(pos.y));

  const dispatch = () => {
    if (bubbleWindow && !bubbleWindow.isDestroyed()) {
      bubbleWindow.webContents.send('bubble', payload);
      bubbleWindow.showInactive();
      if (bubbleTimer) clearTimeout(bubbleTimer);
      bubbleTimer = setTimeout(() => {
        if (bubbleWindow && !bubbleWindow.isDestroyed()) bubbleWindow.hide();
      }, BUBBLE_SHOW_MS);
    }
  };
  if (bubbleWindow.webContents.isLoadingMainFrame()) {
    bubbleWindow.webContents.once('did-finish-load', dispatch);
  } else {
    dispatch();
  }
}

// ---------------------------------------------------------------- CodePet 新增：VSCode 联动

async function pollVsCodeStatus() {
  if (currentMode !== 'vscode') return;
  try {
    const res = await fetch(`${VSCODE_BRIDGE_URL}/api/status`);
    const data = await res.json();
    const active = Boolean(data && data.active);
    if (active !== lastVsCodeActive) {
      lastVsCodeActive = active;
      sendToMascotWindows('set-mode', active ? 'running' : 'idle');
    }
    // 码字计时器：活跃时自动累计
    accumulateAutoTimer();
  } catch (e) {
    if (lastVsCodeActive !== false) {
      lastVsCodeActive = false;
      sendToMascotWindows('set-mode', 'idle');
    }
  }
}

async function pollBubble() {
  if (currentMode !== 'vscode') return;
  try {
    const res = await fetch(`${VSCODE_BRIDGE_URL}/api/bubble`);
    const data = await res.json();
    if (data && data.bubble) {
      showBubble(data.bubble);
    }
  } catch (e) {
    /* 桌宠未启动桥接时静默 */
  }
}

function startVsCodePolling() {
  lastVsCodeActive = false;
  void pollVsCodeStatus();
  setInterval(() => { void pollVsCodeStatus(); }, POLL_VSCODE_MS);
  setInterval(() => { void pollBubble(); }, 1200);
}

// ---------------------------------------------------------------- CodePet 新增：设置面板

function openSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show();
    settingsWindow.focus();
    return;
  }
  settingsWindow = new BrowserWindow({
    width: 500,
    height: 600,
    title: 'CodePet 码宠 · 设置',
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  settingsWindow.loadFile('settings.html');
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

// ---------------------------------------------------------------- CodePet 新增：重启

function restartApp() {
  // 保留当前参数（如 --open-settings）并干净重启
  app.relaunch();
  app.exit(0);
}

// ---------------------------------------------------------------- CodePet 新增：右键菜单（桌宠）

function openContextMenu(x, y) {
  if (contextMenuWindow && !contextMenuWindow.isDestroyed()) {
    contextMenuWindow.close();
  }
  contextMenuWindow = new BrowserWindow({
    width: 210,
    height: 176,
    show: false,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  contextMenuWindow.loadFile('menu.html');
  contextMenuWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  contextMenuWindow.setPosition(Math.round(x), Math.round(y));
  contextMenuWindow.setFocusable(true);

  contextMenuWindow.on('closed', () => { contextMenuWindow = null; });

  contextMenuWindow.webContents.once('did-finish-load', () => {
    contextMenuWindow.showInactive();
  });
  // 点击空白处关闭
  contextMenuWindow.on('blur', () => {
    if (contextMenuWindow && !contextMenuWindow.isDestroyed()) contextMenuWindow.close();
  });
}

// ---------------------------------------------------------------- CodePet 新增：码字计时器

function getTimerFilePath() {
  return path.join(app.getPath('userData'), TIMER_FILE);
}

function loadTimerState() {
  try {
    const raw = fs.readFileSync(getTimerFilePath(), 'utf8');
    const data = JSON.parse(raw);
    timerState.autoActiveMs = Math.max(0, Number(data.autoActiveMs) || 0);
    timerState.manualState = 'idle';
    timerState.manualStartAt = 0;
    timerState.manualAccMs = Math.max(0, Number(data.manualAccMs) || 0);
  } catch (e) {
    /* 首次运行或文件损坏：使用默认值 */
  }
}

function persistTimerState() {
  if (!timerDirty) return;
  try {
    fs.writeFileSync(getTimerFilePath(), JSON.stringify({
      autoActiveMs: timerState.autoActiveMs,
      manualAccMs: timerState.manualAccMs
    }));
    timerDirty = false;
  } catch (e) {
    console.error('[CodePet] failed to persist timer:', e.message);
  }
}

function getTimerView() {
  const now = Date.now();
  const manualMs = timerState.manualState === 'running'
    ? timerState.manualAccMs + (now - timerState.manualStartAt)
    : timerState.manualAccMs;
  return {
    autoActiveMs: timerState.autoActiveMs,
    manualState: timerState.manualState,
    manualMs
  };
}

/** VSCode 活跃（写代码）时自动累计码字时长 */
function accumulateAutoTimer() {
  if (lastVsCodeActive) {
    timerState.autoActiveMs += POLL_ACTIVE_GRANULARITY_MS;
    timerDirty = true;
    persistTimerState();
  }
}

/** 每 1 秒向设置面板广播一次计时视图 */
function startTimerBroadcast() {
  setInterval(() => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.webContents.send('timer:tick', getTimerView());
    }
  }, 1000);
}

// ---------------------------------------------------------------- 托盘

async function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'fav.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon);
  tray.setToolTip('CodePet 码宠 · 写代码的陪伴 AI');
  updateTrayMenu();
  tray.on('double-click', () => {
    showMascotWindows();
  });
}

function toggleBackground() {
  if (!backgroundWindow) createBackgroundWindow();
  isBackgroundVisible = !isBackgroundVisible;
  if (isBackgroundVisible) {
    backgroundWindow.show();
  } else {
    backgroundWindow.hide();
  }
  updateTrayMenu();
}

function updateTrayMenu() {
  const contextMenuTemplate = [
    {
      label: 'Show',
      click: () => { showMascotWindows(); }
    },
    {
      label: '设置面板（系统开关）',
      click: () => { openSettings(); }
    },
    { type: 'separator' }
  ];

  if (supportsLaunchAtLogin()) {
    contextMenuTemplate.push(
      {
        label: process.platform === 'win32' ? 'Start with Windows' : 'Start at Login',
        type: 'checkbox',
        checked: isLaunchAtLoginEnabled(),
        click: (menuItem) => {
          setLaunchAtLogin(menuItem.checked);
          updateTrayMenu();
        }
      },
      { type: 'separator' }
    );
  }

  const modeEntries = [
    {
      label: 'Running Mode（溜达）',
      type: 'radio',
      checked: currentMode === 'running',
      click: () => { setMode('running'); }
    },
    {
      label: 'Idle Mode（待机）',
      type: 'radio',
      checked: currentMode === 'idle',
      click: () => { setMode('idle'); }
    },
    {
      label: 'Random Mode（随机）',
      type: 'radio',
      checked: currentMode === 'random',
      click: () => { setMode('random'); }
    },
    {
      label: 'VSCode 联动（写代码时跑起来）',
      type: 'radio',
      checked: currentMode === 'vscode',
      click: () => { setMode('vscode'); }
    }
  ];
  contextMenuTemplate.push(...modeEntries, { type: 'separator' });

  contextMenuTemplate.push(
    {
      label: 'Speed: Fast',
      click: () => { sendToMascotWindows('set-speed', 8); }
    },
    {
      label: 'Speed: Medium',
      click: () => { sendToMascotWindows('set-speed', 5); }
    },
    {
      label: 'Speed: Slow',
      click: () => { sendToMascotWindows('set-speed', 2); }
    },
    { type: 'separator' },
    {
      label: 'Show Background',
      type: 'checkbox',
      checked: isBackgroundVisible,
      click: () => { toggleBackground(); }
    },
    { type: 'separator' },
    {
      label: '重启（Relaunch）',
      click: () => { restartApp(); }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true;
        app.quit();
      }
    }
  );

  tray.setContextMenu(Menu.buildFromTemplate(contextMenuTemplate));
}

function setMode(mode) {
  currentMode = mode;
  sendToMascotWindows('set-mode', mode);
  updateTrayMenu();
}

// ---------------------------------------------------------------- 生命周期

app.whenReady().then(async () => {
  const startHidden = shouldStartHidden();

  loadTimerState();
  startTimerBroadcast();

  await createTray();
  ensureMascotWindows({ show: !startHidden });

  // CodePet 默认进入 VSCode 联动模式：写代码时桌宠活跃陪伴
  setMode('vscode');
  startVsCodePolling();

  // 启动参数 --open-settings：直接打开设置面板
  if (process.argv.includes('--open-settings')) {
    openSettings();
  }

  app.on('activate', () => {
    if (getMascotWindows().length === 0) {
      ensureMascotWindows({ show: true });
      return;
    }
    showMascotWindows();
  });
});

app.on('window-all-closed', (event) => {
  event.preventDefault();
});

app.on('second-instance', (event, commandLine) => {
  event.preventDefault();
  if (commandLine.includes(STARTUP_FLAG)) return;
  if (!app.isReady()) {
    app.whenReady().then(() => { showMascotWindows(); });
    return;
  }
  showMascotWindows();
});

app.on('will-quit', () => {
  if (ahkProc) {
    try { ahkProc.kill(); } catch (e) { /* ignore */ }
    ahkProc = null;
  }
});

// ---------------------------------------------------------------- IPC

ipcMain.on('set-window-position', (event, payload, y) => {
  let targetWindow = null;
  let positionPayload = null;
  try {
    targetWindow = BrowserWindow.fromWebContents(event.sender);
    if (!targetWindow || targetWindow.isDestroyed()) return;
    positionPayload = getWindowPositionPayload(payload, y);
    const nextX = toFiniteInteger(positionPayload.x);
    const nextY = toFiniteInteger(positionPayload.y);
    if (nextX === null || nextY === null) {
      console.warn('Ignored invalid mascot window position update', {
        mascotId: targetWindow.webContents.getURL(),
        payload: positionPayload
      });
      return;
    }
    const safePosition = getSafeMascotWindowPosition(targetWindow, nextX, nextY);
    targetWindow.setPosition(safePosition.x, safePosition.y);
  } catch (error) {
    console.error('Failed to handle mascot window position update', {
      mascotId: targetWindow && !targetWindow.isDestroyed() ? targetWindow.webContents.getURL() : null,
      payload: positionPayload ?? getWindowPositionPayload(payload, y),
      error: error?.stack || error?.message || String(error)
    });
  }
});

ipcMain.handle('get-window-position', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow || targetWindow.isDestroyed()) return { x: 0, y: 0 };
  const [x, y] = targetWindow.getPosition();
  return { x, y };
});

ipcMain.handle('get-display-bounds', (event) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  return getWindowDisplay(targetWindow).bounds;
});

// CodePet 新增：设置面板 IPC

ipcMain.handle('switches:get-state', () => {
  return { ...switchState };
});

ipcMain.on('switches:set', (event, payload) => {
  if (!payload || typeof payload.key !== 'string') return;
  const key = payload.key;
  const value = Boolean(payload.value);
  if (key === 'symbol') switchState.symbol = value;
  else if (key === 'shiftIME') switchState.shiftIME = value;
  else if (key === 'insertOff') switchState.insertOff = value;
  else return;
  syncSwitches();
  event.sender.send('switches:state', { ...switchState });
});

ipcMain.on('settings:close', (event) => {
  if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();
});

ipcMain.on('settings:quit-pet', (event) => {
  app.isQuitting = true;
  app.quit();
});

// CodePet 新增：重启 / 右键菜单 / 计时器 IPC

ipcMain.on('settings:restart-pet', () => {
  restartApp();
});

ipcMain.on('mascot:context-menu', (event, pos) => {
  const targetWindow = BrowserWindow.fromWebContents(event.sender);
  if (!targetWindow || targetWindow.isDestroyed()) return;
  let x = pos && Number.isFinite(Number(pos.x)) ? Number(pos.x) : null;
  let y = pos && Number.isFinite(Number(pos.y)) ? Number(pos.y) : null;
  if (x === null || y === null) {
    const [wx, wy] = targetWindow.getPosition();
    x = wx + 20;
    y = wy + 20;
  }
  openContextMenu(x, y);
});

ipcMain.on('menu:action', (event, action) => {
  if (action === 'settings') openSettings();
  else if (action === 'restart') restartApp();
  else if (action === 'quit') {
    app.isQuitting = true;
    app.quit();
  }
  if (contextMenuWindow && !contextMenuWindow.isDestroyed()) contextMenuWindow.close();
});

ipcMain.handle('timer:get-state', () => getTimerView());

ipcMain.on('timer:action', (event, action) => {
  const now = Date.now();
  if (action === 'start') {
    if (timerState.manualState !== 'running') {
      timerState.manualState = 'running';
      timerState.manualStartAt = now;
    }
  } else if (action === 'pause') {
    if (timerState.manualState === 'running') {
      timerState.manualAccMs += now - timerState.manualStartAt;
      timerState.manualState = 'paused';
      timerState.manualStartAt = 0;
      timerDirty = true;
      persistTimerState();
    }
  } else if (action === 'reset') {
    timerState.manualState = 'idle';
    timerState.manualStartAt = 0;
    timerState.manualAccMs = 0;
    timerDirty = true;
    persistTimerState();
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('timer:tick', getTimerView());
  }
});

// 应用退出前持久化计时数据
app.on('before-quit', () => {
  if (timerState.manualState === 'running') {
    timerState.manualAccMs += Date.now() - timerState.manualStartAt;
    timerState.manualState = 'paused';
  }
  persistTimerState();
});
