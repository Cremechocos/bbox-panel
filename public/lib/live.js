// Temps réel : flux SSE poussé par le serveur du panel (UN seul relevé partagé de la Bbox,
// quel que soit le nombre d'écrans ouverts). Reconnexion automatique.
import { panel, emitAuthLost } from '/lib/api.js';
import { useEffect, useState } from '/vendor/hooks.mjs';

const CAP = { latency: 300, down: 120, up: 120, cpu: 150, temp: 150, mem: 150, b24: 150, b5: 150, b6: 150, sessions: 90, hostsActive: 90, lanDown: 150, lanUp: 150 };
let state = {
  ready: false, connected: false, t: 0, auth: 'public',
  device: null, wanIp: null, lanIp: null, wireless: null, services: null, voip: null, sff: null, summary: null, dns: null,
  hosts: [], guestHosts: [], stations: [], sessions: null, log: [], nat: null, firewall: null, upnp: null, dhcp: null,
  graphs: { temp: [], cpu: [], power: [] },
  wan: { down: 0, up: 0, contract: 0, link: 0, rxBytes: 0, txBytes: 0, updatedAt: 0, interval: 0 },
  cpu: { usage: 0, temp: 0 }, mem: { used: 0, total: 0 },
  bands: { 24: { down: 0, up: 0 }, 5: { down: 0, up: 0 }, 6: { down: 0, up: 0 } },
  lanPorts: [], latency: { internet: null, bbox: null, jitter: 0, loss: 0, down: false },
  today: { rx: 0, tx: 0 }, timers: [], events: [], unread: 0, historySince: null,
  series: Object.fromEntries(Object.keys(CAP).map((k) => [k, []])),
};
const subs = new Set();
const eventSubs = new Set();
let raf = 0;
// regroupe les mises à jour d'une même image
const emit = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; if (!mirror) state.t = Date.now(); subs.forEach((f) => f(state)); }); };

// Aperçus (page Apparence) : les cadres réutilisent le flux de la fenêtre principale
// au lieu d'ouvrir chacun leur propre connexion (le navigateur en limite le nombre).
let mirror = null;
try { if (window.parent !== window && window.parent.__bboxLive) mirror = window.parent.__bboxLive; } catch { /* autre origine */ }
if (mirror) state = mirror.state;
else window.__bboxLive = { state, subscribe: (f) => (subs.add(f), () => subs.delete(f)), onEvents: (f) => (eventSubs.add(f), () => eventSubs.delete(f)) };

let es = null, started = false, skew = 0, retry = null;
function setSeries(name, pts) {
  const arr = state.series[name] || (state.series[name] = []);
  arr.length = 0; // on garde le même tableau : les graphiques en cours de rendu le lisent directement
  for (const p of pts) arr.push({ t: p.t + skew, v: p.v });
}
function connect() {
  clearTimeout(retry);
  es?.close();
  es = new EventSource('/panel/live');
  es.addEventListener('snapshot', (e) => {
    const d = JSON.parse(e.data);
    skew = Date.now() - d.t;
    const { series, ...rest } = d.state;
    Object.assign(state, rest);
    for (const [k, pts] of Object.entries(d.series || {})) setSeries(k, pts);
    state.events = d.events || [];
    state.unread = d.unread || 0;
    state.historySince = d.history?.since || null;
    state.connected = true;
    emit();
  });
  es.addEventListener('patch', (e) => {
    const d = JSON.parse(e.data);
    Object.assign(state, d.s || {});
    for (const [k, pts] of Object.entries(d.p || {})) {
      const arr = state.series[k] || (state.series[k] = []);
      for (const p of pts) arr.push({ t: p.t + skew, v: p.v });
      const cap = CAP[k] || 120;
      if (arr.length > cap) arr.splice(0, arr.length - cap);
    }
    emit();
  });
  es.addEventListener('events', (e) => {
    const d = JSON.parse(e.data);
    if (d.events?.length) {
      const known = new Set(state.events.map((x) => x.id));
      const fresh = d.events.filter((x) => !known.has(x.id));
      state.events = [...fresh, ...state.events].sort((a, b) => b.t - a.t).slice(0, 120);
      if (fresh.length) eventSubs.forEach((f) => f(fresh));
    }
    if (typeof d.unread === 'number') state.unread = d.unread;
    emit();
  });
  es.onopen = () => { state.connected = true; emit(); };
  es.onerror = async () => {
    state.connected = false; emit();
    if (es.readyState !== EventSource.CLOSED) return; // le navigateur se reconnecte seul
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

const post = (url, body) => fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Panel': '1' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => null);
/** Demande au serveur de relever tout de suite une partie des données (après une écriture) */
export const refresh = (...names) => post('/panel/live/refresh', { tasks: names.flat() });
export async function ackEvents(ids = 'all') {
  const r = await post('/panel/events/ack', ids === 'all' ? { all: true } : { ids });
  if (r && typeof r.unread === 'number') { state.unread = r.unread; state.events = state.events.map((e) => (ids === 'all' || ids.includes(e.id) ? { ...e, ack: true } : e)); emit(); }
}
export const onLiveEvents = (fn) => (eventSubs.add(fn), () => eventSubs.delete(fn));
export { state as live };

export function useLive() {
  const [, setT] = useState(0);
  useEffect(() => { const f = (s) => setT(s.t); subs.add(f); start(); return () => subs.delete(f); }, []);
  return state;
}
/** Ne re-rend que si la valeur sélectionnée change (évite de redessiner toute l'app à chaque mesure) */
export function useLiveValue(select) {
  const [v, setV] = useState(() => select(state));
  useEffect(() => { const f = (s) => { const n = select(s); setV((o) => (Object.is(o, n) ? o : n)); }; subs.add(f); f(state); return () => subs.delete(f); }, []);
  return v;
}
