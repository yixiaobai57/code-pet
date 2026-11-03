'use strict';
/**
 * CodePet · 本地桥接服务
 * VSCode 插件内嵌的迷你 HTTP 服务，把“正在写什么/刚识别了什么”暴露给桌宠。
 * 桌宠轮询两个接口：
 *   GET /api/status  当前状态（是否活跃、最近识别结果）
 *   GET /api/bubble  消费一条“解释气泡”（教学讲解）
 * 零依赖：仅用 Node 内置 http 模块，端口默认 48672（127.0.0.1 本地回环）。
 */

const http = require('http');

const DEFAULT_PORT = 48672;

/** 最近多久没有编辑视为“空闲” */
const IDLE_MS = 8000;

let server = null;
let status = {
  state: 'idle',          // idle | active
  language: null,         // c / cpp ...
  lastType: null,         // 最近识别出的语句类别
  lastComment: null,      // 最近注释
  lastDetail: null,       // 最近详细解释
  lastLine: null,         // 最近分析的代码行
  lastEditAt: 0,          // 最近一次编辑时间戳
  bubbleQueue: []         // 待消费的气泡消息队列
};

function writeJson(res, obj) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.end(JSON.stringify(obj));
}

/** 启动桥接服务 */
function startBridge(port = DEFAULT_PORT) {
  return new Promise((resolve, reject) => {
    if (server) {
      resolve(port);
      return;
    }
    const srv = http.createServer((req, res) => {
      const url = (req.url || '').split('?')[0];
      try {
        if (url === '/api/status' || url === '/api/health') {
          const now = Date.now();
          const active = now - status.lastEditAt < IDLE_MS;
          writeJson(res, {
            ok: true,
            name: 'code-pet-bridge',
            version: '0.1.0',
            active,
            state: active ? 'active' : 'idle',
            language: status.language,
            lastType: status.lastType,
            lastComment: status.lastComment,
            lastDetail: status.lastDetail,
            lastLine: status.lastLine,
            now
          });
        } else if (url === '/api/bubble') {
          const bubble = status.bubbleQueue.length ? status.bubbleQueue.shift() : null;
          writeJson(res, { ok: true, bubble });
        } else {
          res.statusCode = 404;
          writeJson(res, { ok: false, error: 'not found' });
        }
      } catch (e) {
        res.statusCode = 500;
        writeJson(res, { ok: false, error: String(e && e.message || e) });
      }
    });

    srv.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        // 端口被占用：可能已有实例（比如多窗口），直接视为已启动
        resolve(port);
        return;
      }
      reject(err);
    });

    srv.listen(port, '127.0.0.1', () => {
      server = srv;
      resolve(port);
    });
  });
}

/** 更新状态并推送气泡 */
function updateStatus(patch) {
  const now = Date.now();
  // 字段名映射：调用方传 type/comment/detail/line，内部字段为 lastType/lastComment/lastDetail/lastLine
  status = Object.assign({}, status, {
    language: patch && patch.language !== undefined ? patch.language : status.language,
    lastType: patch && patch.type !== undefined ? patch.type : status.lastType,
    lastComment: patch && patch.comment !== undefined ? patch.comment : status.lastComment,
    lastDetail: patch && patch.detail !== undefined ? patch.detail : status.lastDetail,
    lastLine: patch && patch.line !== undefined ? patch.line : status.lastLine,
    lastEditAt: now
  });

  if (patch && (patch.detail || patch.comment)) {
    status.bubbleQueue.push({
      type: patch.type || '',
      comment: patch.comment || '',
      detail: patch.detail || '',
      line: patch.line || '',
      at: now
    });
    // 防止队列无限增长
    if (status.bubbleQueue.length > 10) {
      status.bubbleQueue.shift();
    }
  }
}

/** 停掉桥接服务 */
function stopBridge() {
  if (server) {
    try { server.close(); } catch (e) { /* ignore */ }
    server = null;
  }
}

module.exports = {
  DEFAULT_PORT,
  startBridge,
  updateStatus,
  stopBridge
};
