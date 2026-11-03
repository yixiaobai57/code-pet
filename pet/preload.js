const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  setWindowPosition: (x, y) => {
    const nextX = Number(x);
    const nextY = Number(y);

    if (!Number.isFinite(nextX) || !Number.isFinite(nextY)) {
      return;
    }

    ipcRenderer.send('set-window-position', {
      x: Math.round(nextX),
      y: Math.round(nextY)
    });
  },
  getWindowPosition: () => ipcRenderer.invoke('get-window-position'),
  // 拖动：渲染层通知主进程开始/结束，跟随移动由主进程轮询光标完成
  dragStart: (cx, cy) => {
    const x = Number(cx);
    const y = Number(cy);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ipcRenderer.send('pet:drag-start', Math.round(x), Math.round(y));
  },
  dragEnd: () => ipcRenderer.send('pet:drag-end'),
  getDisplayBounds: () => ipcRenderer.invoke('get-display-bounds'),
  getCodexTaskStatus: () => ipcRenderer.invoke('get-codex-task-status'),
  onSetMode: (callback) => ipcRenderer.on('set-mode', (event, mode) => callback(mode)),
  onSetSpeed: (callback) => ipcRenderer.on('set-speed', (event, speed) => callback(speed)),
  onSetBackgroundOpacity: (callback) => ipcRenderer.on('set-background-opacity', (event, opacity) => callback(opacity)),

  // CodePet 新增
  onBubble: (callback) => ipcRenderer.on('bubble', (event, payload) => callback(payload)),
  getSwitchState: () => ipcRenderer.invoke('switches:get-state'),
  setSwitch: (key, value) => ipcRenderer.send('switches:set', { key, value }),
  onSwitchState: (callback) => ipcRenderer.on('switches:state', (event, state) => callback(state)),
  closeSettings: () => ipcRenderer.send('settings:close'),
  quitPet: () => ipcRenderer.send('settings:quit-pet'),
  restartPet: () => ipcRenderer.send('settings:restart-pet'),
  showContextMenu: (x, y) => ipcRenderer.send('mascot:context-menu', { x, y }),
  menuAction: (action) => ipcRenderer.send('menu:action', action),
  getTimerState: () => ipcRenderer.invoke('timer:get-state'),
  timerAction: (action) => ipcRenderer.send('timer:action', action),
  onTimerTick: (callback) => ipcRenderer.on('timer:tick', (event, view) => callback(view))
});
