const fs = require('fs');
const file = String.raw`C:\Users\docma\Desktop\codex对话记录\codex-session-manager\public\js\render.js`;
let code = fs.readFileSync(file, 'utf-8');

// Update renderMessages to add role labels and handle developer messages
const oldRender = `export function renderMessages(messages, container) {
  if (!messages || messages.length === 0) {
    container.innerHTML = \`
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p class="empty-text">暂无消息</p>
      </div>\`;
    return;
  }

  container.innerHTML = '';

  messages.forEach((msg, i) => {
    const wrapper = document.createElement('div');
    wrapper.className = \\\`message \\\${msg.role}\\\`;
    wrapper.style.animationDelay = \\\`\\\${i * 80}ms\\\`;

    const time = msg.timestamp ? formatDate(msg.timestamp) : '';

    wrapper.innerHTML = \\\`
      <div class="message-bubble glass">
        <div class="message-content">\\\${escapeHtml(msg.content || '')}</div>
        <div class="message-time">\\\${time}</div>
      </div>\\\\`;

    container.appendChild(wrapper);
  });
}`;

const newRender = `export function renderMessages(messages, container) {
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p class="empty-text">暂无消息</p></div>';
    return;
  }

  container.innerHTML = '';

  messages.forEach((msg, i) => {
    // Skip empty developer/system messages that are just context
    if (msg.role === 'developer' && (!msg.content || msg.content.trim().length < 10)) return;

    const wrapper = document.createElement('div');
    const role = msg.role || 'assistant';
    wrapper.className = 'message ' + role;
    wrapper.style.animationDelay = (i * 80) + 'ms';

    const time = msg.timestamp ? formatDate(msg.timestamp) : '';

    let roleLabel = '';
    let content = msg.content || '';
    if (role === 'user') {
      roleLabel = '<div class="message-role">你</div>';
    } else if (role === 'developer') {
      roleLabel = '<div class="message-role">系统</div>';
      // Truncate long developer messages
      if (content.length > 500) {
        content = content.substring(0, 500) + '...';
      }
    } else {
      roleLabel = '<div class="message-role">Codex</div>';
    }

    // Clean up content - remove XML tags for display
    let displayContent = escapeHtml(content);
    displayContent = displayContent.replace(/<image>.*?<\\/image>/g, '[图片]');
    displayContent = displayContent.replace(/<environment_context>[\\s\\S]*?<\\/environment_context>/g, function(match) {
      return '<div class="system-context">' + match + '</div>';
    });

    wrapper.innerHTML = '<div class="message-bubble glass">' +
      roleLabel +
      '<div class="message-content">' + displayContent + '</div>' +
      '<div class="message-time">' + time + '</div>' +
      '</div>';

    container.appendChild(wrapper);
  });
}`;

// Simple approach: just rewrite the function
const fnStart = code.indexOf('export function renderMessages');
const fnEnd = code.indexOf('\n// ─── renderToast', fnStart);
if (fnStart > -1 && fnEnd > -1) {
  const newFn = `export function renderMessages(messages, container) {
  if (!messages || messages.length === 0) {
    container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p class="empty-text">暂无消息</p></div>';
    return;
  }
  container.innerHTML = '';
  messages.forEach((msg, i) => {
    const role = msg.role || 'assistant';
    if (role === 'developer' && (!msg.content || msg.content.trim().length < 10)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'message ' + role;
    wrapper.style.animationDelay = (i * 80) + 'ms';
    const time = msg.timestamp ? formatDate(msg.timestamp) : '';
    let roleLabel = '';
    let content = msg.content || '';
    if (role === 'user') {
      roleLabel = '<div class="message-role">你</div>';
    } else if (role === 'developer') {
      roleLabel = '<div class="message-role">系统</div>';
      if (content.length > 500) content = content.substring(0, 500) + '...';
    } else {
      roleLabel = '<div class="message-role">Codex</div>';
    }
    let dc = escapeHtml(content);
    dc = dc.replace(/<image>.*?<\\/image>/g, '[图片]');
    dc = dc.replace(/<environment_context>[\\s\\S]*?<\\/environment_context>/g, function(m) {
      return '<div class="system-context">' + m + '</div>';
    });
    wrapper.innerHTML = '<div class="message-bubble glass">' + roleLabel +
      '<div class="message-content">' + dc + '</div>' +
      '<div class="message-time">' + time + '</div></div>';
    container.appendChild(wrapper);
  });
}

`;
  code = code.substring(0, fnStart) + newFn + code.substring(fnEnd + 1);
  fs.writeFileSync(file, code, 'utf-8');
  console.log('Rewrote renderMessages with role labels');
} else {
  console.log('Could not find renderMessages boundaries');
}
