# 🐾 CodePet 码宠 · 写代码的陪伴 AI

> 写一行，讲一行。桌面上养一只穿西装的奶蛙，你在 VSCode 里写 C/C++ 时它守在旁边，把你刚写的那行代码用大白话讲出来。

三个部分：

- **VSCode 插件** — 每写一行完整语句，自动在行尾插一条中文教学注释；鼠标悬停任意一行也能看到解释。纯本地规则引擎，不联网。
- **桌面桌宠** — Electron 透明置顶小窗（140×140），会跟着鼠标转头、可以拖动、右键出菜单，收到插件推送后弹气泡讲代码。
- **系统开关** — 三个 AHK 开关：中英文符号、Shift 切中英文、禁用 Insert 改写。

两边靠本机 `127.0.0.1:48672` 通信，数据不出本机。

---

## 环境要求

| 项 | 要求 | 说明 |
|---|---|---|
| 系统 | Windows 10 / 11 | 桌宠用透明置顶窗口 + AHK，macOS / Linux 未验证 |
| Node.js | ≥ 20 | 跑桌宠用 |
| VSCode | 1.80+ | 用插件的话必须 |
| AutoHotkey | v2 | 只有系统开关需要，不装也能用其他功能 |

---

## 跑起来

### 1. 先把桌宠跑起来

```powershell
cd pet
npm install
npm start
```

Electron 下载慢的话，先换镜像再装：

```powershell
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
npm start
```

起来之后屏幕右下角会出现一只奶蛙：

- 按住它能拖动，松手就停
- 鼠标在屏幕上移动，它会侧头看过去
- 右键它出迷你菜单，托盘图标里也有设置入口

### 2. 装 VSCode 插件

仓库里带了打包好的插件，一条命令装上：

```powershell
code --install-extension vscode-extension/code-pet-vscode-0.1.1.vsix
```

装完在 VSCode 里按 `Ctrl+Shift+P`，执行一次 `Reload Window`。

然后新建一个 `.c` 文件，敲一行：

```c
int a = 1;
```

回车之后行尾会自动出现注释：

```c
int a = 1;   // 变量声明：定义一个整型变量 a，并初始化为 1
```

鼠标停在任意一行上，也会弹出这一行的讲解。命令面板里还有 `CodePet：解释当前行` 和 `CodePet：开关自动注释`。

### 3. 开系统开关（可选）

先在设置面板里点，或手动装 AHK v2：

```powershell
winget install AutoHotkey.AutoHotkey
```

装完确认这个文件存在：

```
%LOCALAPPDATA%\Programs\AutoHotkey\v2\AutoHotkey64.exe
```

然后在桌宠的「设置 → 通用」里打开三个开关。首次打开时，桌宠会把脚本落盘到 `%APPDATA%\code-pet\switches\code-switches.ahk` 再调起 AHK 跑它。

也可以单独跑脚本：

```powershell
& "$env:LOCALAPPDATA\Programs\AutoHotkey\v2\AutoHotkey64.exe" pet\switches\code-switches.ahk --symbol
```

---

## 怎么确认它真的在跑

不用猜，按下面五条走一遍：

1. 桌面上有奶蛙，按住能拖，松手立刻停住，不会自己继续飘
2. 鼠标在屏幕上画圈，它的头和眼睛跟着转
3. VSCode 里写 `int a = 1;` 回车，行尾出现中文注释；同时桌宠弹出气泡，7 秒后自己消失
4. 故意删掉一个分号让它编译报错 —— 桌宠捧腹大笑几秒；编译通过时它跑出去又跑回来举一面绿旗
5. 设置面板里点开一个开关，去看 `%APPDATA%\code-pet\switches\ahk-boot.log`，最后一行时间戳是刚才那一刻，说明脚本真的起来了

第 5 条是最容易被忽略的：进程活着、没报错，不代表脚本执行了；要看 boot 日志。

---

## 常见问题

**桌宠双击没反应 / 看不见**
程序是单实例的，已经有一个在跑时再启动会直接退出。检查托盘和任务管理器里有没有 `CodePet` 或 `electron` 进程，先关掉旧的再启动。

**气泡一直不出来**
桌宠和插件是通过本机 `48672` 端口通信的。先把 VSCode 打开并加载了插件、打开一个 `.c` / `.cpp` 文件，再启动桌宠。如果端口被旧进程占着，关掉所有 `CodePet` / `electron` 重新来。

**插件装了但没注释**
确认当前文件类型是 `.c` 或 `.cpp`（MVP 只支持 C / C++），并且执行过 `Reload Window`。

**开关点了没效果**
多半是没装 AutoHotkey v2，或者路径不在默认位置。检查 `ahk-error.log` 有没有新内容；没有 boot 日志就是脚本压根没起来。

**npm install 卡在 Electron 下载**
见上面的镜像设置，换完镜像删掉 `node_modules` 重装。

---

## 想做成安装版

日常开发用 `npm start` 就够了。要做成双击即用的目录版：

1. 把 `pet/node_modules/electron/dist` 整个复制到一个新目录
2. 把里面的 `electron.exe` 改名成 `CodePet.exe`
3. 删掉 `resources/default_app.asar`
4. 用 `@electron/asar` 把 `pet` 里的运行文件打包成 `resources/app.asar`

打包时只需要装这些：`main.js`、`preload.js`、`index.html`、`bubble.html`、`background.html`、`settings.html`、`menu.html`、`package.json`、`LICENSE`、`assets`、`switches`。

注意两点：`switches` 目录必须进去，否则开关功能会失效；打包前先把正在跑的 `CodePet` / `electron` / `AutoHotkey64` 进程停掉，不然文件被占用会写不进去。

---

## 目录结构

```
code-pet/
├── pet/                          # 桌面桌宠（Electron）
│   ├── main.js                   # 主进程：窗口、注视轮询、气泡、设置、AHK 子进程
│   ├── preload.js                # 渲染层与主进程的桥
│   ├── index.html                # 桌宠本体（拖动、歪头、道具动画）
│   ├── bubble.html               # 讲解气泡
│   ├── settings.html             # 设置面板
│   ├── menu.html                 # 右键迷你菜单
│   ├── assets/                   # 奶蛙贴图与图标
│   └── switches/code-switches.ahk # 三个系统开关
├── vscode-extension/             # VSCode 插件
│   ├── extension.js              # 自动注释 / 悬停 / 命令 / 推送
│   ├── lib/analyzer.js           # C 语言规则引擎
│   ├── lib/commentator.js        # 中文教学注释生成
│   ├── lib/bridge.js             # 本机 HTTP 桥接
│   └── code-pet-vscode-0.1.1.vsix # 打包好的插件
└── docs/                         # 图文教程与创作说明
```

---

## 致谢与许可

- 桌宠窗口形态参考了开源项目 [sunwood-ai-labs/desktop-pet-mitarashi](https://github.com/sunwood-ai-labs/desktop-pet-mitarashi)（MIT）
- 系统开关基于 [AutoHotkey v2](https://www.autohotkey.com/)
- 本项目以 MIT License 开源

---

> 写不明白的那一行，让它替你讲。
