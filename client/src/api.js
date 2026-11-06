const TOKEN_KEY = 'firstmeds.token';
const PH_KEY = 'firstmeds.pharmacy';

export const tokenStore = {
  get: () => { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set: (t) => { try { t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY); } catch { /* ignore */ } },
};

/** HQ admins can "act as" a pharmacy; staff are pinned server-side. */
export const pharmacyStore = {
  get: () => { try { return localStorage.getItem(PH_KEY) || ''; } catch { return ''; } },
  set: (id) => { try { id ? localStorage.setItem(PH_KEY, String(id)) : localStorage.removeItem(PH_KEY); } catch { /* ignore */ } },
};

export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn; };

function withPharmacy(path) {
  const ph = pharmacyStore.get();
  if (!ph || path.startsWith('/public') || path.startsWith('/auth')) return path;
  return path + (path.includes('?') ? '&' : '?') + `pharmacy_id=${encodeURIComponent(ph)}`;
}

export async function api(path, { method = 'GET', body, raw = false, scoped = true } = {}) {
  const token = tokenStore.get();
  const res = await fetch(`/api${scoped ? withPharmacy(path) : path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (raw && res.ok) return res;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && token) onUnauthorized();
    throw new ApiError(res.status, data.error || `Request failed (${res.status})`);
  }
  return data;
}

api.get = (p, o) => api(p, o);
api.post = (p, body, o) => api(p, { ...o, method: 'POST', body: body ?? {} });
api.put = (p, body, o) => api(p, { ...o, method: 'PUT', body: body ?? {} });
api.del = (p, o) => api(p, { ...o, method: 'DELETE' });

/** Download a file from an authenticated endpoint. */
export async function download(path, filename) {
  const res = await api(path, { raw: true });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
