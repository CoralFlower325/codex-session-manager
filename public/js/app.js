import { api } from './api.js';
import { WebSocketClient } from './ws.js';
import {
  renderSessionList,
  renderMessages,
  renderToast,
  updateWsStatus,
  updateBatchToolbar,
  showConfirmDialog,
} from './render.js';
import {
  animateCardDelete,
  animateCardInsert,
  staggerCards,
  animateViewTransition,
  createParticleBurst,
} from './animations.js';

// ─── Application State ──────────────────────────────────────────────────────

const state = {
  sessions: [],
  filteredSessions: [],
  selectedIds: new Set(),
  currentView: 'list',
  currentSession: null,
  searchQuery: '',
  scrollPosition: 0,
};

let ws;

// ─── DOM References ─────────────────────────────────────────────────────────

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const els = {
  get listView() { return $('#list-view'); },
  get detailView() { return $('#detail-view'); },
  get sessionList() { return $('#session-list'); },
  get messageList() { return $('#message-list'); },
  get searchInput() { return $('#search-input'); },
  get backBtn() { return $('#btn-back'); },
  get exportBtn() { return $('#btn-export-md'); },
  get deleteBtn() { return $('#btn-delete-single'); },
  get batchDeleteBtn() { return $('#btn-batch-delete'); },
  get batchSelectAllBtn() { return $('#btn-select-all'); },
  get batchToolbar() { return $('#batch-toolbar'); },
  get wsStatus() { return $('#ws-status'); },
  get detailTitle() { return $('#detail-title'); },
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function getVisibleSessions() {
  return state.searchQuery ? state.filteredSessions : state.sessions;
}

function findSessionById(id) {
  return state.sessions.find((s) => s.id === id);
}

// ─── Render Helpers ─────────────────────────────────────────────────────────

function renderCurrentList() {
  const container = els.sessionList;
  if (!container) return;

  renderSessionList(getVisibleSessions(), container, {
    selectedIds: state.selectedIds,
    onSelect: handleSelect,
    onDetail: handleDetail,
  });
}

// ─── Handlers ───────────────────────────────────────────────────────────────

function handleSelect(id, checked) {
  if (checked) {
    state.selectedIds.add(id);
  } else {
    state.selectedIds.delete(id);
  }
  updateBatchToolbar(state.selectedIds.size);
}

async function handleDetail(session) {
  state.scrollPosition = window.scrollY;
  try {
    const detail = await api.getSession(session.id);
    state.currentSession = detail;
    state.currentView = 'detail';

    if (els.detailTitle) {
      els.detailTitle.textContent = detail.title || '无标题';
    }

    renderMessages(detail.messages || [], els.messageList);

    await animateViewTransition(els.listView, els.detailView);
    window.scrollTo(0, 0);
  } catch (err) {
    renderToast('加载会话详情失败: ' + err.message, 'error');
  }
}

async function handleDelete(session) {
  const confirmed = await showConfirmDialog(`确认删除对话「${session.title || '无标题'}」？`);
  if (!confirmed) return;

  try {
    await api.deleteSession(session.id);
    renderToast('对话已删除', 'success');
    state.sessions = state.sessions.filter((s) => s.id !== session.id);
    filterSessions();
  } catch (err) {
    renderToast('删除失败: ' + err.message, 'error');
  }
}

async function handleBatchDelete() {
  if (state.selectedIds.size === 0) return;

  const confirmed = await showConfirmDialog(`确认删除选中的 ${state.selectedIds.size} 个对话？`);
  if (!confirmed) return;

  try {
    await api.batchDelete([...state.selectedIds]);
    renderToast(`已删除 ${state.selectedIds.size} 个对话`, 'success');
    state.sessions = state.sessions.filter((s) => !state.selectedIds.has(s.id));
    state.selectedIds.clear();
    updateBatchToolbar(0);
    filterSessions();
  } catch (err) {
    renderToast('批量删除失败: ' + err.message, 'error');
  }
}

function handleBack() {
  state.currentView = 'list';
  state.currentSession = null;
  animateViewTransition(els.detailView, els.listView).then(() => {
    window.scrollTo(0, state.scrollPosition);
  });
  renderCurrentList();
}

async function handleExport(format) {
  if (!state.currentSession) return;
  try {
    const result = await api.exportSession(state.currentSession.id, format);
    // Create downloadable blob
    let content, filename, mime;
    if (format === 'json') {
      content = JSON.stringify(result, null, 2);
      filename = `${state.currentSession.title || 'session'}.json`;
      mime = 'application/json';
    } else {
      content = typeof result === 'string' ? result : result.content || JSON.stringify(result);
      filename = `${state.currentSession.title || 'session'}.md`;
      mime = 'text/markdown';
    }
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    renderToast('导出成功', 'success');
  } catch (err) {
    renderToast('导出失败: ' + err.message, 'error');
  }
}


// ─── Rename ──────────────────────────────────────────────────────────────────

async function handleRename(session) {
  const currentTitle = session.title || '';
  const newTitle = prompt('输入新标题:', currentTitle);
  if (newTitle === null || newTitle.trim() === '' || newTitle.trim() === currentTitle) return;

  try {
    await api.renameSession(session.id, newTitle.trim());
    session.title = newTitle.trim();
    // Update in state
    const idx = state.sessions.findIndex(s => s.id === session.id);
    if (idx !== -1) state.sessions[idx].title = newTitle.trim();
    renderCurrentList();
    if (state.currentView === 'detail' && state.currentSession && state.currentSession.id === session.id) {
      state.currentSession.title = newTitle.trim();
      if (els.detailTitle) els.detailTitle.textContent = newTitle.trim();
    }
    renderToast('已重命名', 'success');
  } catch (err) {
    renderToast('重命名失败: ' + err.message, 'error');
  }
}
// ─── Search / Filter ────────────────────────────────────────────────────────

function filterSessions() {
  const query = state.searchQuery.toLowerCase().trim();

  if (!query) {
    state.filteredSessions = [];
    renderCurrentList();
    return;
  }

  state.filteredSessions = state.sessions.filter((s) => {
    return (s.title && s.title.toLowerCase().includes(query));
  });

  renderCurrentList();
}

let searchDebounceTimer = null;
function onSearchInput(e) {
  state.searchQuery = e.target.value;
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    filterSessions();
  }, 250);
}

// ─── WebSocket Events ──────────────────────────────────────────────────────

function handleWsEvent(event) {
  switch (event.type) {
    case 'ws_connected':
      updateWsStatus(true);
      break;

    case 'ws_disconnected':
      updateWsStatus(false);
      break;

    case 'session_created': {
      const newSession = event.data;
      if (!newSession) break;

      // Avoid duplicates
      if (!state.sessions.find((s) => s.id === newSession.id)) {
        state.sessions.unshift(newSession);
        filterSessions();
      }
      renderToast(`新对话: ${newSession.title || '无标题'}`, 'info');
      break;
    }

    case 'session_deleted': {
      const deletedId = event.data?.id || event.data;
      state.sessions = state.sessions.filter((s) => s.id !== deletedId);
      state.selectedIds.delete(deletedId);
      updateBatchToolbar(state.selectedIds.size);
      filterSessions();
      renderToast('对话已被删除', 'warning');
      break;
    }

    case 'session_updated': {
      const updated = event.data;
      if (!updated) break;
      // Polling detected changes - refetch full list
      if (updated._pollRefresh) {
        try {
          const freshSessions = await api.getSessions();
          state.sessions = Array.isArray(freshSessions) ? freshSessions : [];
          filterSessions();
        } catch {}
        break;
      }
      const idx = state.sessions.findIndex((s) => s.id === updated.id);
      if (idx !== -1) {
        state.sessions[idx] = { ...state.sessions[idx], ...updated };
        filterSessions();
      }
      break;
    }
  }
}

// ─── Batch Select All ──────────────────────────────────────────────────────

function handleBatchSelectAll() {
  const visible = getVisibleSessions();
  const allSelected = visible.length > 0 && visible.every((s) => state.selectedIds.has(s.id));

  if (allSelected) {
    visible.forEach((s) => state.selectedIds.delete(s.id));
  } else {
    visible.forEach((s) => state.selectedIds.add(s.id));
  }

  updateBatchToolbar(state.selectedIds.size);
  renderCurrentList();
}

// ─── Event Binding ──────────────────────────────────────────────────────────

function bindEvents() {
  // Search
  if (els.searchInput) {
    els.searchInput.addEventListener('input', onSearchInput);
  }

  // Back from detail
  if (els.backBtn) {
    els.backBtn.addEventListener('click', handleBack);
  }

  // Export Markdown
  const exportMdBtn = document.querySelector('#btn-export-md');
  if (exportMdBtn) {
    exportMdBtn.addEventListener('click', () => handleExport('markdown'));
  }

  // Export JSON
  const exportJsonBtn = document.querySelector('#btn-export-json');
  if (exportJsonBtn) {
    exportJsonBtn.addEventListener('click', () => handleExport('json'));
  }

  // Rename from detail view
  const renameBtn = document.querySelector('#btn-rename');
  if (renameBtn) {
    renameBtn.addEventListener('click', () => {
      if (state.currentSession) handleRename(state.currentSession);
    });
  }

  // Single delete on detail view
  if (els.deleteBtn) {
    els.deleteBtn.addEventListener('click', async () => {
      if (!state.currentSession) return;
      const confirmed = await showConfirmDialog('确认删除当前对话？');
      if (!confirmed) return;
      try {
        await api.deleteSession(state.currentSession.id);
        state.sessions = state.sessions.filter((s) => s.id !== state.currentSession.id);
        state.selectedIds.delete(state.currentSession.id);
        updateBatchToolbar(state.selectedIds.size);
        renderToast('对话已删除', 'success');
        handleBack();
      } catch (err) {
        renderToast('删除失败: ' + err.message, 'error');
      }
    });
  }

  // Batch operations
  if (els.batchDeleteBtn) {
    els.batchDeleteBtn.addEventListener('click', handleBatchDelete);
  }

  if (els.batchSelectAllBtn) {
    els.batchSelectAllBtn.addEventListener('click', handleBatchSelectAll);
  }

  // Event delegation on session list container
  if (els.sessionList) {
    els.sessionList.addEventListener('click', (e) => {
      const card = e.target.closest('.session-card');
      if (!card) return;
      if (e.target.classList.contains('card-checkbox')) return;
      const id = card.dataset.id;
      const session = findSessionById(id);
      if (!session) return;
      if (e.target.closest('.card-rename-btn')) {
        handleRename(session);
        return;
      }
      handleDetail(session);
    });

    els.sessionList.addEventListener('change', (e) => {
      if (!e.target.classList.contains('card-checkbox')) return;
      const card = e.target.closest('.session-card');
      if (!card) return;
      handleSelect(card.dataset.id, e.target.checked);
    });

    els.sessionList.addEventListener('contextmenu', (e) => {
      const card = e.target.closest('.session-card');
      if (!card) return;
      e.preventDefault();
      const id = card.dataset.id;
      const session = findSessionById(id);
      if (session) handleDelete(session);
    });
  }
}

// ─── Initialization ─────────────────────────────────────────────────────────

async function init() {
  bindEvents();

  // Load sessions
  try {
    const sessions = await api.getSessions();
    state.sessions = Array.isArray(sessions) ? sessions : [];
    renderCurrentList();
  } catch (err) {
    renderToast('加载会话列表失败: ' + err.message, 'error');
    state.sessions = [];
    renderCurrentList();
  }

  // Connect WebSocket
  ws = new WebSocketClient(handleWsEvent);
  ws.connect();
}

// Start the app
document.addEventListener('DOMContentLoaded', init);



