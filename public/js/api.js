const BASE_URL = 'http://localhost:3210';

async function request(url, options = {}) {
  const response = await fetch(`${BASE_URL}${url}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`API Error ${response.status}: ${text || response.statusText}`);
  }
  return response.json();
}

export const api = {
  async getSessions() {
    return request('/api/sessions');
  },

  async getSession(id) {
    return request(`/api/sessions/${encodeURIComponent(id)}`);
  },

  async deleteSession(id) {
    return request(`/api/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async batchDelete(ids) {
    return request('/api/sessions/batch-delete', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    });
  },

  async exportSession(id, format = 'markdown') {
    return request(`/api/sessions/${encodeURIComponent(id)}/export?format=${encodeURIComponent(format)}`);
  },

  async search(query) {
    return request(`/api/search?q=${encodeURIComponent(query)}`);
  },
};
