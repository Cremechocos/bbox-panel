// Accès au relais local. Toutes les requêtes modifiantes portent X-Panel (protection CSRF).
import { deepFix } from './format';

export class ApiError extends Error {
  status: number;
  body: any;
  constructor(status: number, body: any) { super(body?.error || 'HTTP ' + status); this.status = status; this.body = body; }
}

const listeners = new Set<() => void>();
export const onAuthLost = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const emitAuthLost = () => listeners.forEach((fn) => fn());

async function request(method: string, url: string, data?: unknown): Promise<any> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const opts: RequestInit = { method, headers, credentials: 'same-origin' };
  if (method !== 'GET') {
    headers['X-Panel'] = '1';
    if (data !== undefined) { headers['Content-Type'] = 'application/json'; opts.body = JSON.stringify(data); }
  }
  let res: Response;
  try { res = await fetch(url, opts); } catch { throw new ApiError(0, { error: 'network' }); }
  const text = await res.text();
  let body: any = null;
  if (text) { try { body = JSON.parse(text); } catch { body = text; } }
  if (res.status === 401 && url.startsWith('/api/')) emitAuthLost();
  if (!res.ok) throw new ApiError(res.status, body);
  return body;
}

// Les réponses de la Bbox sont presque toujours des tableaux à un élément : on déballe,
// et on répare l'UTF-8 doublement encodé.
const unwrap = (b: any) => deepFix(Array.isArray(b) && b.length === 1 ? b[0] : b);

export const api = {
  get: (p: string) => request('GET', '/api/v1/' + p).then(unwrap),
  raw: (p: string) => request('GET', '/api/v1/' + p),
  put: (p: string, data?: unknown) => request('PUT', '/api/v1/' + p, data ?? {}),
  post: (p: string, data?: unknown) => request('POST', '/api/v1/' + p, data ?? {}),
  del: (p: string) => request('DELETE', '/api/v1/' + p),
};

export const panel = {
  session: () => request('GET', '/panel/session'),
  login: (password: string, remember: boolean) => request('POST', '/panel/login', { password, remember }),
  logout: () => request('POST', '/panel/logout', {}),
  history: (range = '24h') => request('GET', '/panel/history?range=' + encodeURIComponent(range)),
  usage: (days = 31) => request('GET', '/panel/usage?days=' + days),
  events: (q: Record<string, any> = {}) => request('GET', '/panel/events?' + new URLSearchParams(Object.entries(q).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString()),
  ack: (ids: 'all' | number[]) => request('POST', '/panel/events/ack', { ids }),
  prefs: () => request('GET', '/panel/prefs'),
  savePrefs: (p: unknown) => request('PUT', '/panel/prefs', p),
  pause: (body: unknown) => request('POST', '/panel/pause', body),
  resume: (mac: string) => request('DELETE', '/panel/pause/' + encodeURIComponent(mac)),
  guestFor: (until: number) => request('POST', '/panel/guest', { until }),
  guestStop: () => request('DELETE', '/panel/guest'),
  timers: () => request('GET', '/panel/timers'),
  compat: () => request('GET', '/panel/compat'),
  info: () => request('GET', '/panel/info'),
};

/** Message lisible pour une erreur d'API */
export function errMsg(e: any): string {
  if (!e) return 'Erreur inconnue';
  if (e.status === 0) return 'Serveur du panel injoignable.';
  if (e.status === 401) return 'Session expirée : reconnecte-toi.';
  if (e.status === 403 && e.body?.error === 'blocked_by_panel') return 'Action volontairement bloquée par le panel.';
  if (e.status === 429) return 'La Bbox limite les requêtes : réessaie dans un instant.';
  const ex = e.body?.exception;
  if (ex?.errors?.length) {
    const er = ex.errors[0];
    const reason = String(er.reason || '').replace(/_/g, ' ').toLowerCase();
    // l'objet visé n'existe pas dans le modèle de données du firmware (ex. hosts/prioritize sans preferredAvailable)
    if (reason === 'object does not exist') return 'Fonction absente du firmware de votre Bbox.';
    return `La Bbox a refusé${er.name ? ` le champ « ${er.name} »` : ''}${reason ? ` (${reason})` : ''}.`;
  }
  if (e.body?.error === 'bbox_remote_forbidden') return 'La Bbox refuse cette fonction en accès distant : elle n’est possible que depuis la maison.';
  if (e.body?.error === 'no_session') return 'Le serveur du panel n’a pas de session Bbox valide : reconnecte-toi.';
  if (e.status === 404) return 'Fonction non disponible sur ce modèle de Bbox.';
  if (e.status >= 500) return 'La Bbox ne répond pas correctement.';
  return 'Action impossible (' + (e.body?.error || e.status) + ').';
}
