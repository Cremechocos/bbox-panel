// Préférences partagées (favoris, enregistrés sur le serveur pour le Mac comme l'iPhone),
// minuteurs (pause Internet immédiate, Wi-Fi invité temporaire) et actions rapides.
import { panel, api } from '/lib/api.js';
import { useEffect, useState } from '/vendor/hooks.mjs';
import { live, refresh } from '/lib/live.js';
import { toast, errMsg, confirmDialog } from '/lib/ui.js';
import { displayName } from '/lib/format.js';
import { go } from '/lib/router.js';
import { toggleTheme } from '/lib/theme.js';

// ═════════════ Favoris ═════════════
let prefs = { favorites: { devices: [], actions: [] } };
let loaded = false, loading = null;
const subs = new Set();
const notify = () => subs.forEach((f) => f(prefs));
export function loadPrefs() {
  if (!loading) loading = panel.prefs().then((p) => { prefs = { favorites: { devices: [], actions: [], ...(p?.favorites || {}) } }; }).catch(() => {}).finally(() => { loaded = true; notify(); });
  return loading;
}
export function usePrefs() {
  const [p, setP] = useState(prefs);
  useEffect(() => { const f = (x) => setP({ ...x }); subs.add(f); if (!loaded) loadPrefs(); return () => subs.delete(f); }, []);
  return p;
}
export const isFav = (kind, id) => prefs.favorites[kind]?.includes(String(id).toLowerCase());
export async function toggleFav(kind, id, label) {
  id = String(id).toLowerCase();
  const before = prefs;
  const list = new Set(prefs.favorites[kind] || []);
  const on = !list.has(id);
  on ? list.add(id) : list.delete(id);
  prefs = { favorites: { ...prefs.favorites, [kind]: [...list] } };
  notify();
  try { await panel.savePrefs(prefs); toast(on ? `${label || 'Élément'} ajouté aux favoris` : `${label || 'Élément'} retiré des favoris`); }
  catch (e) { prefs = before; notify(); toast(errMsg(e), 'err'); }
}
export async function setFavs(next) {
  const before = prefs;
  prefs = { favorites: { ...prefs.favorites, ...next } }; notify();
  try { await panel.savePrefs(prefs); } catch (e) { prefs = before; notify(); toast(errMsg(e), 'err'); throw e; }
}

// ═════════════ Pause Internet immédiate ═════════════
export const PAUSES = [
  { v: 30, l: '30 min' }, { v: 60, l: '1 heure' }, { v: 120, l: '2 heures' }, { v: 'morning', l: 'Jusqu’à demain', s: 'reprise à 7 h' },
];
export function untilOf(v) {
  if (v === 'morning') { const d = new Date(); if (d.getHours() >= 7) d.setDate(d.getDate() + 1); d.setHours(7, 0, 0, 0); return d.getTime(); }
  return Date.now() + Number(v) * 60000;
}
export const pauseOf = (mac) => live.timers?.find((t) => t.type === 'pause' && t.mac === String(mac || '').toLowerCase());
export const hhmm = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export function untilLabel(t) {
  const d = new Date(t), now = new Date();
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1);
  const day = d.toDateString() === now.toDateString() ? '' : d.toDateString() === tomorrow.toDateString() ? 'demain ' : d.toLocaleDateString('fr-FR', { weekday: 'long' }) + ' ';
  return `${day}${hhmm(t)}`;
}
export async function pauseDevice(h, v) {
  try {
    await panel.pause({ mac: h.macaddress, ip: h.ipaddress && h.ipaddress !== '0.0.0.0' ? h.ipaddress : '', name: displayName(h), until: untilOf(v) });
    toast(`${displayName(h)} en pause jusqu’à ${untilLabel(untilOf(v))}`);
  } catch (e) { toast(errMsg(e), 'err'); throw e; }
}
export async function resumeDevice(h) {
  try { await panel.resume(h.macaddress); toast(`${displayName(h)} a de nouveau accès à Internet`); }
  catch (e) { toast(errMsg(e), 'err'); throw e; }
}

// ═════════════ Wi-Fi invité ═════════════
export const GUEST_DURATIONS = [{ v: 60, l: '1 heure' }, { v: 240, l: '4 heures' }, { v: 1440, l: '24 heures' }, { v: 0, l: 'Sans limite' }];
export const guestTimer = () => live.timers?.find((t) => t.type === 'guest');
export const WIFI_RESTART = {
  title: 'Le Wi-Fi va redémarrer',
  message: 'Pour activer ou couper le réseau invité, la Bbox redémarre son Wi-Fi : tous les appareils sans fil seront déconnectés environ 40 secondes, puis se reconnecteront seuls.',
  confirm: 'Continuer', tone: 'warn', icon: 'wifi',
};
export async function guestOn(minutes, { ask = true } = {}) {
  if (ask && !(await confirmDialog(WIFI_RESTART))) return false;
  try {
    if (minutes) await panel.guestFor(Date.now() + minutes * 60000);
    else await api.put('wireless/guestenable', { enable: 1 });
    toast(minutes ? `Wi-Fi invité activé jusqu’à ${untilLabel(Date.now() + minutes * 60000)}` : 'Wi-Fi invité activé');
    refresh('statics', 'summary');
    return true;
  } catch (e) { toast(errMsg(e), 'err'); throw e; }
}
export async function guestOff({ ask = true } = {}) {
  if (ask && !(await confirmDialog(WIFI_RESTART))) return false;
  try { await panel.guestStop(); toast('Wi-Fi invité coupé'); refresh('statics', 'summary'); return true; }
  catch (e) { toast(errMsg(e), 'err'); throw e; }
}

// ═════════════ Actions rapides (palette ⌘K, favoris) ═════════════
export const ACTIONS = [
  { id: 'guest1h', label: 'Wi-Fi invité pendant 1 heure', icon: 'link', run: () => guestOn(60) },
  { id: 'guest4h', label: 'Wi-Fi invité pendant 4 heures', icon: 'link', run: () => guestOn(240) },
  { id: 'guestoff', label: 'Couper le Wi-Fi invité', icon: 'link', run: () => guestOff() },
  { id: 'card', label: 'Carte Wi-Fi à imprimer', icon: 'print', run: () => go('carte') },
  { id: 'wall', label: 'Mode écran mural', icon: 'expand', run: () => go('mural') },
  { id: 'speed', label: 'Tester le débit', icon: 'zap', run: () => go('diagnostic') },
  { id: 'hosts', label: 'Actualiser la liste des appareils', icon: 'refresh', run: async () => { await api.put('identification/hosts', { command: 'refresh' }).catch(() => {}); refresh('hosts'); toast('Liste des appareils actualisée'); } },
  { id: 'theme', label: 'Basculer entre clair et sombre', icon: 'moon', run: () => toggleTheme() },
  { id: 'look', label: 'Changer d’apparence', icon: 'palette', run: () => go('apparence') },
];
export const actionOf = (id) => ACTIONS.find((a) => a.id === id);
