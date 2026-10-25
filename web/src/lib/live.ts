// Temps réel : flux SSE poussé par le serveur du panel (UN seul relevé partagé de la Bbox,
// quel que soit le nombre d'écrans ouverts). Reconnexion automatique.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { panel, emitAuthLost } from './api';

export type Pt = { t: number; v: number | null };
export type LiveEvent = { id: number; t: number; type: string; level: 'info' | 'warn' | 'alert'; mac?: string; ip?: string; name?: string; detail?: any; source?: string; ack?: boolean };
const CAP: Record<string, number> = { latency: 300, lan: 300, down: 120, up: 120, cpu: 150, temp: 150, mem: 150, b24: 150, b5: 150, b6: 150, sessions: 90, hostsActive: 90, lanDown: 150, lanUp: 150 };

export type LiveState = {
  ready: boolean; connected: boolean; t: number; auth: string;
  device: any; wanIp: any; lanIp: any; wireless: any; services: any; voip: any; sff: any; summary: any; dns: any;
  hosts: any[]; guestHosts: any[]; stations: any[]; sessions: any; log: any[]; nat: any; firewall: any; upnp: any; dhcp: any;
  graphs: { temp: any[]; cpu: any[]; power: any[] };
  wan: { down: number; up: number; contract: number; link: number; rxBytes: number; txBytes: number; updatedAt: number; interval: number };
  cpu: { usage: number; temp: number }; mem: { used: number; total: number };
  bands: Record<string, { down: number; up: number }>;
  lanPorts: any[]; latency: { internet: number | null; bbox: number | null; jitter: number; loss: number; down: boolean };
  today: { rx: number; tx: number }; timers: any[]; events: LiveEvent[]; unread: number; historySince: string | null;
  series: Record<string, Pt[]>;
  [k: string]: any;
};

let state: LiveState = {
  ready: false, connected: false, t: 0, auth: 'public',
  device: null, wanIp: null, lanIp: null, wireless: null, services: null, voip: null, sff: null, summary: null, dns: null,
  hosts: [], guestHosts: [], stations: [], sessions: null, log: [], nat: null, firewall: null, upnp: null, dhcp: null,
  graphs: { temp: [], cpu: [], power: [] },
  wan: { down: 0, up: 0, contract: 0, link: 0, rxBytes: 0, txBytes: 0, updatedAt: 0, interval: 0 },
  cpu: { usage: 0, temp: 0 }, mem: { used: 0, total: 0 },
  bands: { 24: { down: 0, up: 0 }, 5: { down: 0, up: 0 }, 6: { down: 0, up: 0 } },
  lanPorts: [], latency: { internet: null, bbox: null, jitter: 0, loss: 0, down: false },
  today: { rx: 0, tx: 0 }, timers: [], events: [], unread: 0, historySince: null,
  series: Object.fromEntries(Object.keys(CAP).map((k) => [k, [] as Pt[]])),
};
const subs = new Set<() => void>();
const eventSubs = new Set<(evs: LiveEvent[]) => void>();
let raf = 0;
// regroupe les mises à jour d'une même image
const emit = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; state.t = Date.now(); subs.forEach((f) => f()); }); };

// Aperçus (page Apparence) : les cadres réutilisent le flux de la fenêtre principale
// au lieu d'ouvrir chacun leur propre connexion (le navigateur en limite le nombre).
type Mirror = { state: LiveState; subscribe: (f: () => void) => () => void; onEvents: (f: (e: LiveEvent[]) => void) => () => void };
let mirror: Mirror | null = null;
try { const p = window.parent as any; if (p !== window && p.__bboxLive) mirror = p.__bboxLive; } catch { /* autre origine */ }
if (mirror) state = mirror.state;
else (window as any).__bboxLive = { state, subscribe: (f: () => void) => { subs.add(f); return () => subs.delete(f); }, onEvents: (f: any) => { eventSubs.add(f); return () => eventSubs.delete(f); } } satisfies Mirror;

let es: EventSource | null = null, started = false, skew = 0, retry: ReturnType<typeof setTimeout> | undefined;
// Le relevé partagé repasse en « public » quand la session Bbox a expiré (connexion depuis un autre
// appareil, Bbox redémarrée…) : les noms et états des appareils disparaissent. On vérifie alors notre
// propre session ; si la Bbox ne la reconnaît plus, retour à l'écran de connexion au lieu d'afficher
// des données vides (« 0 / 20 appareils »).
let lastAuth = '', checking = false, recheck: ReturnType<typeof setTimeout> | undefined;
async function checkAuth() {
  if (checking || mirror) return;
  checking = true;
  try {
    const s = await panel.session().catch(() => null);
    if (s && s.authenticated === false) { stop(); emitAuthLost(); return; }
  } finally { checking = false; }
  // toujours en mode public (Bbox injoignable, session d'un autre écran) : nouvelle vérification dans 1 min
  clearTimeout(recheck);
  if (started && state.auth === 'public') recheck = setTimeout(checkAuth, 60000);
}
function watchAuth() {
  if (state.ready && state.auth === 'public' && lastAuth !== 'public') checkAuth();
  if (state.auth !== 'public') clearTimeout(recheck);
  lastAuth = state.auth;
}
function setSeries(name: string, pts: Pt[]) {
  const arr = state.series[name] || (state.series[name] = []);
  arr.length = 0; // même tableau : les graphiques en cours de rendu le lisent directement
  for (const p of pts) arr.push({ t: p.t + skew, v: p.v });
}
function connect() {
  clearTimeout(retry);
  es?.close();
  es = new EventSource('/panel/live');
  es.addEventListener('snapshot', (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    skew = Date.now() - d.t;
    const { series, ...rest } = d.state;
    Object.assign(state, rest);
    for (const [k, pts] of Object.entries(d.series || {})) setSeries(k, pts as Pt[]);
    state.events = d.events || [];
    state.unread = d.unread || 0;
    state.historySince = d.history?.since || null;
    state.connected = true;
    watchAuth();
    emit();
  });
  es.addEventListener('patch', (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    Object.assign(state, d.s || {});
    if (d.s && 'auth' in d.s) watchAuth();
    for (const [k, pts] of Object.entries(d.p || {})) {
      const arr = state.series[k] || (state.series[k] = []);
      for (const p of pts as Pt[]) arr.push({ t: p.t + skew, v: p.v });
      const cap = CAP[k] || (k.startsWith('p:') ? 300 : 120);
      if (arr.length > cap) arr.splice(0, arr.length - cap);
    }
    emit();
  });
  es.addEventListener('events', (e) => {
    const d = JSON.parse((e as MessageEvent).data);
    if (d.events?.length) {
      const known = new Set(state.events.map((x) => x.id));
      const fresh: LiveEvent[] = d.events.filter((x: LiveEvent) => !known.has(x.id));
      state.events = [...fresh, ...state.events].sort((a, b) => b.t - a.t).slice(0, 120);
      if (fresh.length) eventSubs.forEach((f) => f(fresh));
    }
    if (typeof d.unread === 'number') state.unread = d.unread;
    emit();
  });
  es.onopen = () => { state.connected = true; emit(); };
  es.onerror = async () => {
    state.connected = false; emit();
    if (!es || es.readyState !== EventSource.CLOSED) return; // le navigateur se reconnecte seul
    const s = await panel.session().catch(() => null);
    if (s && s.authenticated === false) { stop(); emitAuthLost(); return; }
    retry = setTimeout(connect, 3000);
  };
}
let visHooked = false;
export function start() {
  if (started) return;
  started = true;
  if (mirror) { mirror.subscribe(() => emit()); mirror.onEvents((evs) => eventSubs.forEach((f) => f(evs))); emit(); return; }
  connect();
  if (!visHooked) {
    visHooked = true;
    // iOS coupe les connexions des webapps en arrière-plan : on se reconnecte au retour
    document.addEventListener('visibilitychange', () => { if (!document.hidden && started && (!es || es.readyState === EventSource.CLOSED)) connect(); });
  }
}
export function stop() { started = false; clearTimeout(retry); es?.close(); es = null; state.connected = false; }

const post = (url: string, body: unknown) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Panel': '1' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
/** Demande au serveur de relever tout de suite une partie des données (après une écriture) */
export const refresh = (...names: (string | string[])[]) => post('/panel/live/refresh', { tasks: names.flat() });
export async function ackEvents(ids: 'all' | number[] = 'all') {
  const r = await post('/panel/events/ack', ids === 'all' ? { all: true } : { ids });
  if (r && typeof r.unread === 'number') { state.unread = r.unread; state.events = state.events.map((e) => (ids === 'all' || ids.includes(e.id) ? { ...e, ack: true } : e)); emit(); }
}
export const onLiveEvents = (fn: (evs: LiveEvent[]) => void) => { eventSubs.add(fn); return () => { eventSubs.delete(fn); }; };
export { state as live };

const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
/** Tout l'état temps réel : re-rend à chaque mise à jour (au plus une fois par image) */
export function useLive(): LiveState {
  useSyncExternalStore(subscribe, () => state.t);
  useEffect(() => { start(); }, []);
  return state;
}
/** Ne re-rend que si la valeur sélectionnée change (évite de redessiner toute l'app à chaque mesure) */
export function useLiveValue<T>(select: (s: LiveState) => T, eq: (a: T, b: T) => boolean = Object.is): T {
  const ref = useRef<{ t: number; v: T } | null>(null);
  const get = () => {
    if (!ref.current || ref.current.t !== state.t) {
      const v = select(state);
      ref.current = { t: state.t, v: ref.current && eq(ref.current.v, v) ? ref.current.v : v };
    }
    return ref.current.v;
  };
  return useSyncExternalStore(subscribe, get);
}

/** Internet joignable ? La Bbox renvoie parfois internet.state = « -1 » (inconnu) : on se fie alors
 *  au lien WAN (« Up ») et à la mesure de latence du relais ; une coupure mesurée l'emporte toujours. */
export function internetOk(s: LiveState): boolean {
  if (s.latency?.down) return false;
  const st = Number(s.summary?.internet?.state ?? s.wanIp?.wan?.internet?.state);
  if (st === 2) return true;
  if (st === 0 || st === 1) return false;
  return /^up$/i.test(String(s.wanIp?.wan?.ip?.state || '')) || s.latency?.internet != null;
}
