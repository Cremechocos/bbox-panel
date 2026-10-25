// Accès au relais local. Toutes les requêtes modifiantes portent X-Panel (protection CSRF).
import { deepFix } from '/lib/format.js';

export class ApiError extends Error {
  constructor(status, body) { super(body?.error || 'HTTP ' + status); this.status = status; this.body = body; }
}

const listeners = new Set();
export const onAuthLost = (fn) => (listeners.add(fn), () => listeners.delete(fn));
export const emitAuthLost = () => listeners.forEach((fn) => fn());

async function request(method, url, data) {
  const opts = { method, headers: { Accept: 'application/json' }, credentials: 'same-origin' };
  if (method !== 'GET') {
    opts.headers['X-Panel'] = '1';
    if (data !== undefined) { opts.headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
  }
  let res;
  try { res = await fetch(url, opts); } catch (e) { throw new ApiError(0, { error: 'network' }); }
  const text = await res.text();
  let body = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (res.status === 401 && url.startsWith('/api/')) listeners.forEach((fn) => fn());
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

// Les réponses de la Bbox sont presque toujours des tableaux à un élément : on déballe,
// et on répare l'UTF-8 doublement encodé.
const unwrap = (b) => deepFix(Array.isArray(b) && b.length === 1 ? b[0] : b);

export const api = {
  get: (p) => request('GET', '/api/v1/' + p).then(unwrap),
  raw: (p) => request('GET', '/api/v1/' + p),
  put: (p, data) => request('PUT', '/api/v1/' + p, data ?? {}),
  post: (p, data) => request('POST', '/api/v1/' + p, data ?? {}),
  del: (p) => request('DELETE', '/api/v1/' + p),
};

export const panel = {
  session: () => request('GET', '/panel/session'),
  login: (password, remember) => request('POST', '/panel/login', { password, remember }),
  logout: () => request('POST', '/panel/logout', {}),
  history: (range = '24h') => request('GET', '/panel/history?range=' + encodeURIComponent(range)),
  usage: (days = 31) => request('GET', '/panel/usage?days=' + days),
  events: (q = {}) => request('GET', '/panel/events?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== '')).toString()),
  prefs: () => request('GET', '/panel/prefs'),
  savePrefs: (p) => request('PUT', '/panel/prefs', p),
  pause: (body) => request('POST', '/panel/pause', body),
  resume: (mac) => request('DELETE', '/panel/pause/' + encodeURIComponent(mac)),
  guestFor: (until) => request('POST', '/panel/guest', { until }),
  guestStop: () => request('DELETE', '/panel/guest'),
};
