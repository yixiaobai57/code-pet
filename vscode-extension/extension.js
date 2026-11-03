'use strict';
/**
 * CodePet · VSCode 插件主逻辑
 * ------------------------------------------------------------
 * “写一行，讲一行”：
 *   1. 监听代码输入，识别刚写完整的一行 C/C++ 语句（本地规则引擎）
 *   2. 自动在行尾插入中文教学注释（可配置开关）
 *   3. 鼠标悬停即可查看整行解释（Hover）
 *   4. 把识别结果通过本地 HTTP 推送给桌面桌宠（气泡讲解）
 * 零外部依赖，纯本地运行，不联网。
 */

const vscode = require('vscode');
const { analyzeLine } = require('./lib/analyzer');
const { buildTrailingComment, shorten } = require('./lib/commentator');
const bridge = require('./lib/bridge');

/** 支持的 C 系语言 */
const C_LANGS = ['c', 'cpp', 'cuda-cpp', 'objective-c', 'objective-cpp'];

/** 每个文件的“已插入注释”标记：uri -> Map<行号, 行内容hash>，防止重复插入 */
const insertedMarks = new Map();

let statusBarItem = null;
let debounceTimer = null;

// ---------------------------------------------------------------- 激活

function activate(context) {
  console.log('[CodePet] activate');

  // 状态栏：最近识别结果
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBarItem.tooltip = 'CodePet：悬停任意 C 代码行查看解释';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  // 1. 监听文本变化（防抖）
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        handleChange(event);
      }, 350);
    })
  );

  // 2. 悬停解释
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(C_LANGS, {
      provideHover(document, position) {
        if (!vscode.workspace.getConfiguration('codePet').get('showHover', true)) return null;
        const line = document.lineAt(position.line).text;
        if (!line.trim()) return null;
        const result = analyzeLine(line);
        if (!result) return null;

        const md = new vscode.MarkdownString();
        md.appendCodeblock(line.trim(), document.languageId);
        md.appendMarkdown(`**${result.type}**｜${result.comment}`);
        md.appendMarkdown(`\n\n> ${result.detail}`);
        return new vscode.Hover(md, document.lineAt(position.line).range);
      }
    })
  );

  // 3. 命令：解释当前行（弹窗）
  context.subscriptions.push(
    vscode.commands.registerCommand('codePet.explainLine', async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      const line = editor.document.lineAt(editor.selection.active.line).text;
      const result = analyzeLine(line);
      if (!result) {
        vscode.window.showInformationMessage('这行代码暂未识别（可能是表达式片段或系统不认识的语法）');
        return;
      }
      const pick = await vscode.window.showInformationMessage(
        `${result.type}：${result.comment}`,
        { modal: false, detail: result.detail },
        '插入注释到行尾'
      );
      if (pick === '插入注释到行尾') {
        await insertComment(editor.document, editor.selection.active.line, result.comment);
      }
    })
  );

  // 4. 命令：开关自动注释
  context.subscriptions.push(
    vscode.commands.registerCommand('codePet.toggleAutoInsert', async () => {
      const cfg = vscode.workspace.getConfiguration('codePet');
      const cur = cfg.get('autoInsert.enabled', true);
      await cfg.update('autoInsert.enabled', !cur, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(`CodePet 自动注释：${!cur ? '已开启' : '已关闭'}`);
    })
  );

  // 5. 启动桥接服务（供桌宠读取状态）
  if (vscode.workspace.getConfiguration('codePet').get('pushToPet.enabled', true)) {
    const port = vscode.workspace.getConfiguration('codePet').get('bridge.port', bridge.DEFAULT_PORT);
    bridge.startBridge(port).then((p) => {
      console.log(`[CodePet] bridge listening on 127.0.0.1:${p}`);
      statusBarItem.text = `$(broadcast) CodePet:${p}`;
      setTimeout(() => {
        statusBarItem.text = '$(pulse) CodePet';
      }, 5000);
    }).catch((err) => {
      console.error('[CodePet] bridge start failed', err);
    });
  }

  // 激活时更新一次状态
  bridge.updateStatus({ state: 'active', language: 'c', lastComment: 'CodePet 已就绪，开始写代码吧', lastDetail: '写一行完整语句（如 int x = 5;），我会自动注释并让桌宠讲解。' });

  context.subscriptions.push({ dispose: () => { bridge.stopBridge(); } });
}

// ---------------------------------------------------------------- 文本变化

async function handleChange(event) {
  const doc = event.document;
  if (!C_LANGS.includes(doc.languageId)) return;
  if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return;

  const changes = event.contentChanges;
  if (!changes || changes.length === 0) return;

  // 只关心“换行/粘贴导致上一行刚完成”的情况
  const change = changes[changes.length - 1];
  if (!change.text.includes('\n')) return;

  // 刚完成的语句行 = 换行发生的行（Enter 的 change 起点就在被换行的行上，
  // 例如在 35 行尾回车，range.start.line === 35，该行即“刚写完的行”）
  const doneLineNo = change.range.start.line;
  if (doneLineNo < 0) return;

  const lineText = doc.lineAt(doneLineNo).text;
  const result = analyzeLine(lineText);
  if (!result) {
    bridge.updateStatus({ state: 'active', language: doc.languageId });
    updateStatusBar('正在写代码…');
    return;
  }

  // 推送状态给桌宠
  if (vscode.workspace.getConfiguration('codePet').get('pushToPet.enabled', true)) {
    bridge.updateStatus({
      state: 'active',
      language: doc.languageId,
      type: result.type,
      comment: result.comment,
      detail: result.detail,
      line: lineText.trim()
    });
  }

  updateStatusBar(`${result.type}：${shorten(result.comment)}`);

  // 自动插入注释
  const cfg = vscode.workspace.getConfiguration('codePet');
  if (cfg.get('autoInsert.enabled', true)) {
    await insertComment(doc, doneLineNo, result.comment);
  }
}

function updateStatusBar(text) {
  if (!statusBarItem) return;
  statusBarItem.text = `$(pulse) ${text}`;
  statusBarItem.show();
}

/** 在指定行尾插入注释（带防重复标记） */
async function insertComment(doc, lineNo, comment) {
  const line = doc.lineAt(lineNo);
  const lineText = line.text;

  // 行尾已有注释则跳过
  if (/\/\/|\/\*/.test(lineText)) return;

  const key = doc.uri.toString();
  let map = insertedMarks.get(key);
  if (!map) {
    map = new Map();
    insertedMarks.set(key, map);
  }
  const hash = lineText.replace(/\s+/g, '');
  if (map.get(lineNo) === hash) return;

  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, line.range.end, buildTrailingComment({ comment }));
  await vscode.workspace.applyEdit(edit);
  map.set(lineNo, hash);

  // 行内容变化后标记失效：同一行被再次编辑（内容 hash 变化）后可重新注释
  const listener = vscode.workspace.onDidChangeTextDocument((e) => {
    if (e.document.uri.toString() === key) {
      const cur = e.document.lineAt(lineNo).text.replace(/\s+/g, '');
      if (cur !== hash) {
        map.delete(lineNo);
        listener.dispose();
      }
    }
  });
}

// ---------------------------------------------------------------- 停用

function deactivate() {
  bridge.stopBridge();
}

module.exports = {
  activate,
  deactivate
};
