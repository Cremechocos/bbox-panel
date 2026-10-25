// Journal d'événements du panel : présence (arrivées/départs), alertes, actions.
// Sources : le journal de la Bbox (device/log, rattrapé en continu) + ce que le serveur détecte lui-même
// (coupure Internet mesurée, température, redémarrage, pauses, Wi-Fi invité).
import fs from 'node:fs';
import crypto from 'node:crypto';

// Codes du journal Bbox retenus → type, niveau
const BBOX_CODES = {
  DEVICE_UP: ['arrive', 'info'], DEVICE_DOWN: ['leave', 'info'], DEVICE_NEW: ['new_device', 'warn'],
  WAN_UP: ['wan_up', 'info'], WAN_DOWN: ['wan_down', 'alert'],
  LOGIN_LOCAL: ['login', 'info'], LOGIN_LOCAL_FAILED: ['login_failed', 'warn'], LOGIN_LOCAL_LOCKED: ['login_locked', 'alert'],
  LOGIN_REMOTE: ['login_remote', 'warn'], LOGIN_REMOTE_FAILED: ['login_failed', 'warn'], LOGIN_CDC: ['login_support', 'info'],
  VOIP_REGISTERED: ['voip_up', 'info'], VOIP_UNREGISTERED: ['voip_down', 'warn'],
  UPGRADE_START: ['upgrade_start', 'info'], UPGRADE_FINISH: ['upgrade', 'info'],
  WIFI_RESTART: ['wifi_restart', 'info'], WIFI_UP: ['wifi_up', 'info'], WIFI_DOWN: ['wifi_down', 'warn'],
  LAN_PORT_UP: ['port_up', 'info'], LAN_PORT_DOWN: ['port_down', 'info'],
};
const MAX = 5000;
const ALERT_LEVELS = new Set(['warn', 'alert']);

export function createEvents({ file, log = () => {}, emit = () => {} }) {
  let list = [];
  try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* premier lancement */ }
  const keys = new Set(list.map((e) => e.k).filter(Boolean));
  let timer = null;
  const persist = () => { clearTimeout(timer); timer = setTimeout(() => fs.writeFile(file, JSON.stringify(list), { mode: 0o600 }, (e) => e && log('events persist', e.message)), 800); };

  function insert(ev) {
    if (ev.k && keys.has(ev.k)) return null;
    ev.id = ev.id || crypto.randomBytes(6).toString('hex');
    ev.t = ev.t || Date.now();
    if (ev.ack === undefined) ev.ack = !ALERT_LEVELS.has(ev.level);
    if (ev.k) keys.add(ev.k);
    // insertion triée (les événements Bbox arrivent parfois en retard)
    let i = 0; while (i < list.length && list[i].t > ev.t) i++;
    list.splice(i, 0, ev);
    if (list.length > MAX) { const removed = list.splice(MAX); removed.forEach((r) => r.k && keys.delete(r.k)); }
    return ev;
  }

  /** Événement détecté par le panel (poussé tout de suite aux navigateurs) */
  function add(ev) {
    const e = insert({ source: 'panel', level: 'info', ...ev });
    if (e) { persist(); emit([e]); }
    return e;
  }

  /** Rattrapage du journal de la Bbox (idempotent) */
  function ingestBboxLog(entries = []) {
    const fresh = [];
    const recent = Date.now() - 10 * 60_000;
    for (const en of [...entries].reverse()) { // du plus ancien au plus récent
      const map = BBOX_CODES[en.log];
      if (!map) continue;
      const t = Date.parse(en.date) || Date.now();
      const parts = String(en.param || '').split(';');
      const ev = { k: `b|${en.date}|${en.log}|${en.param}`, t, type: map[0], level: map[1], source: 'bbox' };
      if (/^DEVICE_/.test(en.log)) { ev.mac = (parts[0] || '').toLowerCase(); ev.ip = parts[1] || ''; ev.name = parts[2] || ''; }
      else if (/^LOGIN/.test(en.log)) { ev.ip = parts[0] || ''; ev.name = parts[1] || ''; }
      else if (/^LAN_PORT/.test(en.log)) ev.detail = parts[0] || '';
      else if (en.log === 'WAN_UP') ev.detail = parts[0] || '';
      // les anciens événements ne déclenchent pas d'alerte non lue
      if (t < recent) ev.ack = true;
      const e = insert(ev);
      if (e && t >= recent) fresh.push(e);
    }
    if (fresh.length) emit(fresh);
    persist();
    return fresh.length;
  }

  function query({ since = 0, before = Infinity, limit = 300, types = null, mac = null } = {}) {
    const out = [];
    for (const e of list) {
      if (e.t <= since) break;
      if (e.t >= before) continue;
      if (types && !types.includes(e.type)) continue;
      if (mac && e.mac !== mac) continue;
      out.push(e);
      if (out.length >= limit) break;
    }
    return out;
  }
  const unread = () => list.reduce((n, e) => n + (e.ack ? 0 : 1), 0);
  function ack(ids) {
    let n = 0;
    for (const e of list) if (!e.ack && (ids === 'all' || ids.includes(e.id))) { e.ack = true; n++; }
    if (n) persist();
    return n;
  }
  /** Noms d'appareils vus récemment (pour compléter les événements Bbox sans nom) */
  function rename(mac, name) { let n = 0; for (const e of list) if (e.mac === mac && !e.name && name) { e.name = name; n++; } if (n) persist(); }

  return { add, ingestBboxLog, query, unread, ack, rename, get size() { return list.length; } };
}
