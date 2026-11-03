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

const MASCOT_WINDOW_CONFIGS = [
  {
    id: 'cat',
    windowWidth: 140,
    windowHeight: 140,
    startOffsetX: 32
  },
  {
    id: 'penguin',
    windowWidth: 108,
    windowHeight: 108,
    startOffsetX: 136
  }
];

const mascotWindows = new Map();

let backgroundWindow = null;
let tray = null;
let bubbleWindow = null;
let bubbleTimer = null;
let settingsWindow = null;
let isBackgroundVisible = false;
let currentMode = 'vscode';
let lastVsCodeActive = false;

// CodePet 新增：系统开关（AutoHotkey）状态
let ahkProc = null;
const switchState = { symbol: false, shiftIME: false, insertOff: false };

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
  return {
    x: display.bounds.x + config.startOffsetX,
    y: display.bounds.y + display.bounds.height - config.windowHeight + EDGE_OVERHANG
  };
}

function applyMascotWindowBehavior(targetWindow) {
  if (!targetWindow || targetWindow.isDestroyed()) return;
  targetWindow.setAlwaysOnTop(true, ALWAYS_ON_TOP_LEVEL);
  targetWindow.setIgnoreMouseEvents(true, { forward: true });
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
