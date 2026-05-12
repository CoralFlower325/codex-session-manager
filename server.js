const express = require('express');
const http = require('http');
const { WebSocketServer } = require('ws');
const chokidar = require('chokidar');
const fs = require('fs/promises');
const path = require('path');
const os = require('os');
const { createReadStream } = require('fs');
const readline = require('readline');

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------
const SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const ARCHIVED_DIR = path.join(os.homedir(), '.codex', 'archived_sessions');
const INDEX_FILE = path.join(os.homedir(), '.codex', 'session_index.jsonl');

const PORT = 3210;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read the session_index.jsonl into a Map<id, {thread_name, updated_at}> */
async function loadIndex() {
  const map = new Map();
  try {
    const raw = await fs.readFile(INDEX_FILE, 'utf-8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const obj = JSON.parse(trimmed);
        const id = obj.id || obj.session_id;
        if (id) {
          map.set(id, {
            thread_name: obj.thread_name || obj.title || null,
            updated_at: obj.updated_at || null,
          });
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // index file may not exist yet
  }
  return map;
}

/** Extract UUID from filename like rollout-YYYY-MM-DDTHH-MM-SS-{uuid}.jsonl */
function extractUuid(filename) {
  const match = filename.match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?=\.jsonl$)/i
  );
  if (match) return match[0];
  // Fallback: strip the leading rollout-... prefix
  const base = filename.replace(/\.jsonl$/, '');
  const parts = base.split('-');
  if (parts.length >= 6) {
    return parts.slice(-5).join('-');
  }
  return base;
}

/** Count messages (response_item lines with payload.type === 'message') */
async function countMessages(filePath) {
  let count = 0;
  try {
    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type === 'response_item' && obj.payload && obj.payload.type === 'message') {
          count++;
        }
      } catch {
        // skip unparseable lines
      }
    }
  } catch {
    // file may have been removed
  }
  return count;
}

/** Build a session object from a file path and source label */
async function buildSession(filePath, source, indexMap) {
  const filename = path.basename(filePath);
  const id = extractUuid(filename);
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    return null;
  }
  const info = indexMap.get(id) || {};
  const title = info.thread_name || '未命名对话';
  const date = info.updated_at
    ? info.updated_at.slice(0, 10)
    : stat.mtime.toISOString().slice(0, 10);

  const messageCount = await countMessages(filePath);

  return {
    id,
    title,
    date,
    size: stat.size,
    messageCount,
    source,
    filePath,
  };
}

/** Recursively find all .jsonl files in a directory */
async function findJsonlFiles(dir) {
  const results = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        const sub = await findJsonlFiles(fullPath);
        results.push(...sub);
      } else if (entry.name.endsWith('.jsonl')) {
        results.push(fullPath);
      }
    }
  } catch {
    // directory may not exist
  }
  return results;
}

/** Scan a directory for .jsonl session files */
async function scanDir(dir, source, indexMap) {
  const files = await findJsonlFiles(dir);
  const results = await Promise.all(
    files.map((f) => buildSession(f, source, indexMap))
  );
  return results.filter(Boolean);
}

/** Get all sessions (active + archived) */
async function getAllSessions() {
  const indexMap = await loadIndex();
  const [active, archived] = await Promise.all([
    scanDir(SESSIONS_DIR, 'active', indexMap),
    scanDir(ARCHIVED_DIR, 'archived', indexMap),
  ]);
  return [...active, ...archived];
}

/** Find a session file by ID, return {filePath, source} or null */
async function findSessionFile(id) {
  for (const [dir, source] of [
    [SESSIONS_DIR, 'active'],
    [ARCHIVED_DIR, 'archived'],
  ]) {
    const files = await findJsonlFiles(dir);
    for (const f of files) {
      if (extractUuid(path.basename(f)) === id) {
        return { filePath: f, source };
      }
    }
  }
  return null;
}

/** Parse messages from a JSONL file */
async function parseMessages(filePath) {
  const messages = [];
  try {
    const rl = readline.createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.type !== 'response_item') continue;
        const payload = obj.payload;
        if (!payload || (payload.role !== 'user' && payload.role !== 'assistant')) continue;

        let content = '';
        if (typeof payload.content === 'string') {
          content = payload.content;
        } else if (Array.isArray(payload.content)) {
          content = payload.content
            .map((part) => {
              if (typeof part === 'string') return part;
              if (part && typeof part.text === 'string') return part.text;
              if (part && typeof part.content === 'string') return part.content;
              return '';
            })
            .join('');
        }

        messages.push({
          role: payload.role,
          content,
          timestamp: obj.timestamp || null,
        });
      } catch {
        // skip unparseable lines
      }
    }
  } catch {
    // file may have been removed
  }
  return messages;
}

/** Export session as Markdown */
function exportMarkdown(session, messages) {
  let md = '# ' + session.title + '\n\n';
  md += '> ID: ' + session.id + '  \n';
  md += '> Date: ' + session.date + '  \n';
  md += '> Messages: ' + messages.length + '\n\n---\n\n';
  for (const msg of messages) {
    const label = msg.role === 'user' ? '**You**' : '**Codex**';
    md += '### ' + label + '\n\n' + msg.content + '\n\n---\n\n';
  }
  return md;
}

// ---------------------------------------------------------------------------
// Express + HTTP server
// ---------------------------------------------------------------------------
const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- REST API ---

// List all sessions
app.get('/api/sessions', async (req, res) => {
  try {
    const sessions = await getAllSessions();
    sessions.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(sessions);
  } catch (err) {
    console.error('GET /api/sessions error:', err);
    res.status(500).json({ error: '获取会话列表失败' });
  }
});

// Get single session detail
app.get('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findSessionFile(id);
    if (!found) {
      return res.status(404).json({ error: '会话不存在' });
    }

    const indexMap = await loadIndex();
    const session = await buildSession(found.filePath, found.source, indexMap);
    if (!session) {
      return res.status(404).json({ error: '会话文件已损坏' });
    }

    const messages = await parseMessages(found.filePath);
    res.json({ ...session, messages });
  } catch (err) {
    console.error('GET /api/sessions/:id error:', err);
    res.status(500).json({ error: '获取会话详情失败' });
  }
});

// Delete single session
app.delete('/api/sessions/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const found = await findSessionFile(id);
    if (!found) {
      return res.status(404).json({ error: '会话不存在' });
    }
    await fs.unlink(found.filePath);
    broadcast({ type: 'session_deleted', data: { id, source: found.source } });
    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE /api/sessions/:id error:', err);
    res.status(500).json({ error: '删除会话失败' });
  }
});

// Batch delete
app.post('/api/sessions/batch-delete', async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: '请提供 ids 数组' });
    }
    const results = [];
    for (const id of ids) {
      const found = await findSessionFile(id);
      if (found) {
        await fs.unlink(found.filePath);
        broadcast({ type: 'session_deleted', data: { id, source: found.source } });
        results.push({ id, ok: true });
      } else {
        results.push({ id, ok: false, error: '未找到' });
      }
    }
    res.json({ results });
  } catch (err) {
    console.error('POST /api/sessions/batch-delete error:', err);
    res.status(500).json({ error: '批量删除失败' });
  }
});

// Export session
app.get('/api/sessions/:id/export', async (req, res) => {
  try {
    const { id } = req.params;
    const format = (req.query.format || 'json').toLowerCase();
    const found = await findSessionFile(id);
    if (!found) {
      return res.status(404).json({ error: '会话不存在' });
    }

    const indexMap = await loadIndex();
    const session = await buildSession(found.filePath, found.source, indexMap);
    const messages = await parseMessages(found.filePath);

    if (format === 'markdown') {
      const md = exportMarkdown(session, messages);
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="' + (session.title || id) + '.md"');
      return res.send(md);
    }

    // Default: JSON
    const payload = { ...session, messages };
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="' + (session.title || id) + '.json"');
    res.json(payload);
  } catch (err) {
    console.error('GET /api/sessions/:id/export error:', err);
    res.status(500).json({ error: '导出会话失败' });
  }
});

// Search sessions
app.get('/api/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim();
    if (!q) {
      return res.json([]);
    }
    const query = q.toLowerCase();
    const allSessions = await getAllSessions();

    // First pass: match titles
    const titleMatches = allSessions.filter(
      (s) => s.title && s.title.toLowerCase().includes(query)
    );
    const titleIds = new Set(titleMatches.map((s) => s.id));
    const results = [...titleMatches];

    // Second pass: content search for sessions not already matched by title
    const contentCandidates = allSessions.filter((s) => !titleIds.has(s.id));
    await Promise.all(
      contentCandidates.map(async (session) => {
        try {
          const messages = await parseMessages(session.filePath);
          const matched = messages.some(
            (m) => m.content && m.content.toLowerCase().includes(query)
          );
          if (matched) results.push(session);
        } catch {
          // skip unreadable files
        }
      })
    );

    results.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    res.json(results);
  } catch (err) {
    console.error('GET /api/search error:', err);
    res.status(500).json({ error: '搜索失败' });
  }
});

// ---------------------------------------------------------------------------
// WebSocket
// ---------------------------------------------------------------------------
const wss = new WebSocketServer({ server });
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ type: 'connected' }));
  ws.on('close', () => clients.delete(ws));
  ws.on('error', () => clients.delete(ws));
});

function broadcast(message) {
  const payload = JSON.stringify(message);
  for (const ws of clients) {
    if (ws.readyState === 1) {
      ws.send(payload);
    }
  }
}

// ---------------------------------------------------------------------------
// File watcher (chokidar) with 300ms debounce
// ---------------------------------------------------------------------------
let debounceTimer = null;
const pendingEvents = new Map();

function scheduleFlush() {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => flushEvents(), 300);
}

async function flushEvents() {
  const events = new Map(pendingEvents);
  pendingEvents.clear();

  for (const [filePath, kind] of events) {
    const filename = path.basename(filePath);
    const id = extractUuid(filename);
    const source = filePath.startsWith(ARCHIVED_DIR) ? 'archived' : 'active';

    if (kind === 'created') {
      const indexMap = await loadIndex();
      const session = await buildSession(filePath, source, indexMap);
      if (session) {
        broadcast({ type: 'session_created', data: session });
      }
    } else if (kind === 'deleted') {
      broadcast({ type: 'session_deleted', data: { id, source } });
    }
  }
}

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {
    // already exists
  }
}

async function startWatcher() {
  await ensureDir(SESSIONS_DIR);
  await ensureDir(ARCHIVED_DIR);

  const watcher = chokidar.watch([SESSIONS_DIR, ARCHIVED_DIR], {
    ignored: /(^|[\/\\])\./,
    persistent: true,
    ignoreInitial: true,
    depth: Infinity,
  });

  watcher.on('add', (filePath) => {
    if (filePath.endsWith('.jsonl')) {
      pendingEvents.set(filePath, 'created');
      scheduleFlush();
    }
  });

  watcher.on('unlink', (filePath) => {
    if (filePath.endsWith('.jsonl')) {
      pendingEvents.set(filePath, 'deleted');
      scheduleFlush();
    }
  });

  watcher.on('change', (filePath) => {
    if (filePath.endsWith('.jsonl')) {
      pendingEvents.set(filePath, 'created');
      scheduleFlush();
    }
  });

  console.log('Watching sessions directories for changes...');
}

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------
server.listen(PORT, async () => {
  console.log('Codex Session Manager running at http://localhost:' + PORT);
  await startWatcher();
});


