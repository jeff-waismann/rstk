/**
 * Central API Service wrapper for RSTK Agile Admin
 * Communicates with Cloudflare Pages Functions (D1 + R2) via HttpOnly session cookies.
 */

async function requestJson(url, options = {}) {
  const res = await fetch(url, {
    credentials: 'same-origin',
    ...options
  });
  const data = await res.json().catch(() => ({
    success: false,
    error: `Erro HTTP ${res.status}`
  }));
  return data;
}

export const apiService = {
  // Auth
  async getMe() {
    return requestJson('/api/auth/me', { cache: 'no-store' });
  },

  async login(email, password, turnstileToken = '') {
    return requestJson('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, turnstileToken })
    });
  },

  async logout() {
    return requestJson('/api/auth/logout', { method: 'POST' });
  },

  // Catalog (Vinyls + Settings)
  async getCatalog(includeInactive = true) {
    const suffix = includeInactive ? '?includeInactive=1' : '';
    return requestJson(`/api/catalog${suffix}`, { cache: 'no-store' });
  },

  async createProduct(product) {
    return requestJson('/api/catalog', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
  },

  async updateProduct(product) {
    return requestJson('/api/catalog', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(product)
    });
  },

  async deleteProduct(id) {
    return requestJson(`/api/catalog?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // Site Content Settings
  async getContent(section) {
    return requestJson(`/api/content/${encodeURIComponent(section)}`, { cache: 'no-store' });
  },

  async saveContent(section, data) {
    return requestJson(`/api/content/${encodeURIComponent(section)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  },

  // Media (Cloudflare R2 + D1)
  async getMediaList({ search = '', mimeType = '' } = {}) {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (mimeType) params.set('mimeType', mimeType);
    return requestJson(`/api/media?${params.toString()}`, { cache: 'no-store' });
  },

  async uploadFile(file) {
    const formData = new FormData();
    formData.append('file', file);
    return requestJson('/api/media/upload', {
      method: 'POST',
      body: formData
    });
  },

  async deleteMedia(id) {
    return requestJson(`/api/media?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // Users
  async getUsers() {
    return requestJson('/api/users', { cache: 'no-store' });
  },

  async createUser(userData) {
    return requestJson('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  },

  async updateUser(id, userData) {
    return requestJson(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });
  },

  async deleteUser(id) {
    return requestJson(`/api/users/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  },

  // Orders & Stock
  async getOrders({ status = '', search = '', limit = 100 } = {}) {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (search) params.set('search', search);
    if (limit) params.set('limit', String(limit));
    return requestJson(`/api/orders?${params.toString()}`, { cache: 'no-store' });
  },

  async createOrder(orderData) {
    return requestJson('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData)
    });
  },

  async updateOrder(id, { status, notes, restoreStock = false } = {}) {
    return requestJson('/api/orders', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, status, notes, restoreStock })
    });
  },

  async deleteOrder(id) {
    return requestJson(`/api/orders?id=${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });
  }
};
