function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  const pad = (n) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  return `${year}-${month}-${day} ${hours}:${minutes}`;
}

function formatSize(bytes) {
  if (bytes == null || bytes === 0) return '0B';
  if (bytes < 1024) return bytes + 'B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + 'KB';
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── renderSessionList ───────────────────────────────────────────────────────

export function renderSessionList(sessions, container, options = {}) {
  const { onSelect, onDelete, onDetail, selectedIds = new Set() } = options;

  if (!sessions || sessions.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">💬</div>
        <p class="empty-text">${sessions && sessions.length === 0 && options._searchActive
          ? '未找到匹配的对话'
          : '暂无对话记录'}</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  sessions.forEach((session, index) => {
    const card = document.createElement('div');
    card.className = 'session-card glass';
    card.dataset.id = session.id;
    card.style.animationDelay = `${index * 50}ms`;

    const isSelected = selectedIds.has(session.id);
    const badgeLabel = session.source === 'archived' ? '已归档' : '活跃';

    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" ${isSelected ? 'checked' : ''}>
      <button class="card-rename-btn" title="重命名">✎</button>
      <button class="card-expand-btn" title="展开子对话">▸</button>
      <div class="card-content">
        <h3 class="card-title">${escapeHtml(session.title || '无标题')}</h3>
        <div class="card-meta">
          <span class="card-date">${formatDate(session.date)}</span>
          <span class="card-size">${formatSize(session.size)}</span>
          <span class="card-badge ${session.source === 'archived' ? 'archived' : ''}">${badgeLabel}</span>
        </div>
      </div>`;




    container.appendChild(card);
  });

  // Stagger animation
  const cards = container.querySelectorAll('.session-card');
  cards.forEach((card, i) => {
    card.style.animationDelay = `${i * 50}ms`;
  });
}

// ─── renderMessages ──────────────────────────────────────────────────────────

export function renderMessages(messages, container) {
  if (!messages || messages.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p class="empty-text">暂无消息</p>
      </div>`;
    return;
  }

  container.innerHTML = '';

  messages.forEach((msg, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = `message ${msg.role}`;
    wrapper.style.animationDelay = `${i * 80}ms`;

    const time = msg.timestamp ? formatDate(msg.timestamp) : '';

    wrapper.innerHTML = `
      <div class="message-bubble glass">
        <div class="message-content">${escapeHtml(msg.content || '')}</div>
        <div class="message-time">${time}</div>
      </div>`;

    container.appendChild(wrapper);
  });
}

// ─── renderToast ─────────────────────────────────────────────────────────────

export function renderToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  // Trigger enter animation
  requestAnimationFrame(() => {
    toast.classList.add('toast-enter');
  });

  setTimeout(() => {
    toast.classList.add('toast-exit');
    toast.addEventListener('animationend', () => {
      toast.remove();
    });
    // Fallback removal
    setTimeout(() => toast.remove(), 500);
  }, 3000);
}

// ─── updateWsStatus ──────────────────────────────────────────────────────────

export function updateWsStatus(connected) {
  const indicator = document.getElementById('ws-status');
  if (!indicator) return;

  const dot = indicator.querySelector('.ws-dot') || document.createElement('span');
  dot.className = `ws-dot ${connected ? 'ws-connected' : 'ws-disconnected'}`;

  const label = indicator.querySelector('.ws-label') || document.createElement('span');
  label.className = 'ws-label';
  label.textContent = connected ? 'WebSocket 已连接 · 实时监听中' : 'WebSocket 未连接';

  if (!indicator.contains(dot)) indicator.appendChild(dot);
  if (!indicator.contains(label)) indicator.appendChild(label);
}

// ─── updateBatchToolbar ──────────────────────────────────────────────────────

export function updateBatchToolbar(count) {
  const toolbar = document.getElementById('batch-toolbar');
  if (!toolbar) return;

  if (count > 0) {
    toolbar.classList.add('visible');
    const countEl = toolbar.querySelector('.batch-count');
    if (countEl) countEl.textContent = count;
  } else {
    toolbar.classList.remove('visible');
  }
}

// ─── showConfirmDialog ───────────────────────────────────────────────────────

export function showConfirmDialog(message) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'confirm-overlay';

    overlay.innerHTML = `
      <div class="confirm-dialog glass">
        <p class="confirm-message">${escapeHtml(message)}</p>
        <div class="confirm-actions">
          <button class="btn btn-cancel">取消</button>
          <button class="btn btn-confirm">确认</button>
        </div>
      </div>`;

    const btnCancel = overlay.querySelector('.btn-cancel');
    const btnConfirm = overlay.querySelector('.btn-confirm');

    const cleanup = (result) => {
      overlay.classList.add('confirm-exit');
      overlay.addEventListener('animationend', () => overlay.remove());
      setTimeout(() => overlay.remove(), 300);
      resolve(result);
    };

    btnCancel.addEventListener('click', () => cleanup(false));
    btnConfirm.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) cleanup(false);
    });

    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('confirm-enter'));
  });
}

