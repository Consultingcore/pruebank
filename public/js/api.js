/* Cliente HTTP mínimo + utilidades compartidas */
const NK = {
  token: () => localStorage.getItem('nk_token'),
  setSession(s) { localStorage.setItem('nk_token', s.token); localStorage.setItem('nk_user', JSON.stringify(s.user)); },
  clearSession() { localStorage.removeItem('nk_token'); localStorage.removeItem('nk_user'); },

  async request(method, url, body, isForm = false) {
    const headers = {};
    if (NK.token()) headers.Authorization = `Bearer ${NK.token()}`;
    if (body && !isForm) headers['Content-Type'] = 'application/json';
    let res;
    try {
      res = await fetch(url, { method, headers, body: body ? (isForm ? body : JSON.stringify(body)) : undefined });
    } catch {
      throw new Error('Sin conexión. Revisa tu internet e intenta de nuevo.');
    }
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && NK.token() && !url.startsWith('/api/auth/login')) {
      NK.clearSession();
      location.href = '/index.html';
    }
    if (!res.ok) throw new Error(data.error || 'Ocurrió un error. Intenta de nuevo.');
    return data;
  },
  get: (u) => NK.request('GET', u),
  post: (u, b) => NK.request('POST', u, b),
  patch: (u, b) => NK.request('PATCH', u, b),
  put: (u, b) => NK.request('PUT', u, b),
  del: (u) => NK.request('DELETE', u),
  upload: (u, formData) => NK.request('POST', u, formData, true),
   // NUEVA LÍNEA ↓
  chat: (msg) => NK.post('/api/chat', msg),
};

/** Crea elementos DOM sin innerHTML (evita XSS con datos del usuario) */
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}
