// Notifications en temps réel : bannières animées empilées (façon iOS / Sonner), réglages locaux,
// cloche qui sonne, son discret optionnel et notifications du système quand l'onglet est masqué.
import { html, Seg, Toggle, Btn, openSheet, useState, useEffect, useRef, useLayoutEffect } from '/lib/ui.js';
import { Icon } from '/lib/icons.js';
import { onLiveEvents, live } from '/lib/live.js';
import { eventInfo } from '/lib/events.js';
import { isFav } from '/lib/prefs.js';
import { go } from '/lib/router.js';

// ───────── Réglages (propres à cet appareil) ─────────
const KEY = 'notif.prefs';
export const NOTIF_DEF = { presence: 'favs', newDevice: true, internet: true, security: true, system: false, sound: false, desktop: false };
let prefs = { ...NOTIF_DEF };
try { prefs = { ...NOTIF_DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* stockage indisponible */ }
const prefSubs = new Set();
export const notifPrefs = () => prefs;
export function setNotifPrefs(p) {
  prefs = { ...prefs, ...p };
  if (!document.documentElement.dataset.preview) try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ }
  prefSubs.forEach((f) => f(prefs));
}
export function useNotifPrefs() {
  const [p, setP] = useState(prefs);
  useEffect(() => { prefSubs.add(setP); return () => prefSubs.delete(setP); }, []);
  return p;
}

const NOISE = new Set(['wifi_restart', 'port_up', 'port_down', 'voip_up']);
function wanted(e) {
  if (NOISE.has(e.type)) return false;
  if (e.type === 'new_device') return prefs.newDevice;
  if (e.type === 'arrive' || e.type === 'leave') return prefs.presence === 'all' || (prefs.presence === 'favs' && !!e.mac && isFav('devices', e.mac));
  if (/^internet_|^wan_/.test(e.type)) return prefs.internet;
  if (e.level === 'alert' || /^login|temp/.test(e.type)) return prefs.security;
  return prefs.system;
}

// ───────── File des bannières ─────────
let items = [];
let seq = 0;
const subs = new Set();
const emit = () => subs.forEach((f) => f(items));
/** Affiche une bannière : { icon, tone: ok|warn|danger|'', title, sub, onClick, life } */
export function notify(n) {
  const id = ++seq;
  items = [{ id, at: Date.now(), life: 6500, ...n }, ...items].slice(0, 5);
  emit();
  window.dispatchEvent(new CustomEvent('notif:ring', { detail: n }));
  if (prefs.sound) chime(n.tone);
  return id;
}
function remove(id) { items = items.filter((x) => x.id !== id); emit(); }

// Son discret (deux notes douces), synthétisé : aucun fichier audio.
let ac = null;
function chime(tone) {
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const notes = tone === 'danger' || tone === 'warn' ? [660, 520] : [880, 1320];
    notes.forEach((f, i) => {
      const o = ac.createOscillator(), g = ac.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
      o.connect(g).connect(ac.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
    });
  } catch { /* audio indisponible */ }
}

// Notification du système (onglet masqué, autorisation accordée)
async function systemNotify(title, body, url, tag) {
  if (!prefs.desktop || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const opts = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, opts); } catch { /* */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); location.hash = url.replace(/^\/?/, ''); n.close(); }; } catch { /* */ }
}

// Événements temps réel → bannières (regroupées en cas de rafale)
function handle(evs) {
  const list = evs.filter(wanted);
  if (!list.length) return;
  const byMac = new Map((live.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h]));
  const show = (e) => {
    const i = eventInfo(e, byMac);
    const h = e.mac && byMac.get(String(e.mac).toLowerCase());
    const url = h ? `#/appareils/${h.id}` : '#/activite';
    notify({ icon: i.icon, tone: i.tone, title: i.title, sub: i.sub, life: e.level === 'alert' ? 10000 : 6500, onClick: () => (h ? go('appareils', String(h.id)) : go('activite')) });
    systemNotify(i.title, i.sub || 'Ma Bbox', url, 'bbox-' + e.id);
  };
  if (list.length > 3) {
    const t0 = eventInfo(list[0], byMac).title, t1 = eventInfo(list[1], byMac).title;
    notify({ icon: 'bell', tone: '', title: `${list.length} nouveaux événements`, sub: `${t0} · ${t1}…`, onClick: () => go('activite') });
    systemNotify(`${list.length} nouveaux événements`, t0, '#/activite', 'bbox-burst');
  } else list.slice().reverse().forEach(show);
}

// ───────── Affichage ─────────
const H = 68, GAP = 10, PEEK = 10;
function Banner({ n, i, count, expanded, mobile }) {
  const [entered, setEntered] = useState(false);
  const [out, setOut] = useState(null); // direction de sortie
  const [held, setHeld] = useState(false);
  const card = useRef(null), drag = useRef(null);
  useLayoutEffect(() => { const r = requestAnimationFrame(() => requestAnimationFrame(() => setEntered(true))); return () => cancelAnimationFrame(r); }, []);
  const leave = (dir = mobile ? 'up' : 'right') => { if (out) return; setOut(dir); setTimeout(() => remove(n.id), 380); };
  const open = () => { n.onClick?.(); leave(); };
  // glisser pour fermer (souris ou doigt)
  const down = (e) => {
    if (e.button > 0 || e.target.closest('.notif-x')) return;
    drag.current = { x: e.clientX, y: e.clientY, dx: 0, dy: 0, moved: false, id: e.pointerId };
    card.current.setPointerCapture?.(e.pointerId); setHeld(true);
  };
  const move = (e) => {
    const d = drag.current; if (!d) return;
    d.dx = e.clientX - d.x; d.dy = e.clientY - d.y;
    if (Math.abs(d.dx) > 5 || Math.abs(d.dy) > 5) d.moved = true;
    const tx = mobile ? d.dx * 0.9 : Math.max(-20, d.dx), ty = mobile ? Math.min(6, d.dy) : 0;
    card.current.style.transition = 'none';
    card.current.style.transform = `translate(${tx}px, ${ty}px)`;
    card.current.style.opacity = String(Math.max(0.25, 1 - Math.abs(tx) / 260 - Math.max(0, -ty) / 90));
  };
  const up = () => {
    const d = drag.current; drag.current = null; setHeld(false);
    if (!card.current) return;
    card.current.style.transition = ''; card.current.style.opacity = '';
    if (d && (Math.abs(d.dx) > 90 || d.dy < -34)) { card.current.style.transform = ''; leave(d.dy < -34 && Math.abs(d.dy) > Math.abs(d.dx) ? 'up' : d.dx < 0 ? 'left' : 'right'); }
    else { card.current.style.transform = ''; if (d && !d.moved) open(); }
  };
  // position dans la pile
  const y = expanded ? i * (H + GAP) : i * PEEK;
  const sc = expanded ? 1 : Math.max(0.85, 1 - i * 0.05);
  let tf = `translateY(${y}px) scale(${sc})`, op = !expanded && i > 2 ? 0 : 1;
  if (!entered) { tf = mobile ? 'translateY(-130%) scale(.98)' : 'translateY(-18px) scale(.96)'; op = 0; }
  if (out) { tf = out === 'up' ? `translateY(${y - 90}px) scale(${sc})` : `translateY(${y}px) translateX(${out === 'left' ? -112 : 112}%) scale(${sc})`; op = 0; }
  const paused = expanded || held || document.hidden;
  return html`<div class=${'notif' + (out ? ' out' : '')} style=${`transform:${tf};opacity:${op};z-index:${count - i}`} aria-hidden=${i > 0 && !expanded ? 'true' : undefined}>
    <div class=${'notif-card ' + (n.tone || '')} ref=${card} role="status" tabindex=${i === 0 || expanded ? 0 : -1}
      onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}
      onKeyDown=${(e) => { if (e.key === 'Enter') open(); if (e.key === 'Escape' || e.key === 'Delete') leave(); }}>
      <span class=${'notif-ico ' + (n.tone || '')}><${Icon} name=${n.icon || 'bell'} size=${18} /></span>
      <div class="notif-txt"><div class="notif-t">${n.title}</div>${n.sub && html`<div class="notif-s">${n.sub}</div>`}</div>
      <span class="notif-time">maintenant</span>
      <button type="button" class="notif-x" aria-label="Fermer la notification" onClick=${(e) => { e.stopPropagation(); leave(); }}><${Icon} name="x" size=${14} /></button>
      <i class="notif-life" style=${`animation-duration:${n.life}ms;animation-play-state:${paused || i > 0 ? 'paused' : 'running'}`} onAnimationEnd=${() => leave()}></i>
    </div>
  </div>`;
}

export function NotifyHost() {
  const [list, setList] = useState(items);
  const [hover, setHover] = useState(false);
  const [mobile, setMobile] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const [top, setTop] = useState(72);
  const [, force] = useState(0);
  useEffect(() => { subs.add(setList); return () => subs.delete(setList); }, []);
  useEffect(() => (document.documentElement.dataset.preview ? undefined : onLiveEvents(handle)), []);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)');
    const place = () => { setMobile(mq.matches); const hd = document.querySelector('.app > .main > .topbar, .topbar'); setTop(Math.round((hd?.getBoundingClientRect().bottom || 56) + 12)); };
    place(); mq.addEventListener?.('change', place); window.addEventListener('resize', place);
    const vis = () => force((x) => x + 1);
    document.addEventListener('visibilitychange', vis);
    return () => { mq.removeEventListener?.('change', place); window.removeEventListener('resize', place); document.removeEventListener('visibilitychange', vis); };
  }, []);
  useEffect(() => { if (!list.length) setHover(false); }, [list.length]);
  const h = !list.length ? 0 : hover ? list.length * (H + GAP) : H + Math.min(2, list.length - 1) * PEEK;
  return html`<section class=${'notifs' + (mobile ? ' m' : '') + (hover ? ' open' : '')} aria-live="polite" aria-label="Notifications"
    style=${mobile ? `height:${h}px` : `top:${top}px;height:${h}px`}
    onMouseEnter=${() => setHover(true)} onMouseLeave=${() => setHover(false)} onFocusIn=${() => setHover(true)} onFocusOut=${(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setHover(false); }}>
    ${list.map((n, i) => html`<${Banner} key=${n.id} n=${n} i=${i} count=${list.length} expanded=${hover && !mobile} mobile=${mobile} />`)}
  </section>`;
}

// ───────── Réglages (feuille) ─────────
function Row({ title, sub, value, onChange, disabled }) {
  return html`<div class="check-row"><div class="grow"><div class="t">${title}</div>${sub && html`<div class="s">${sub}</div>`}</div><${Toggle} value=${value} onChange=${onChange} label=${title} disabled=${disabled} /></div>`;
}
function NotifSheet() {
  const p = useNotifPrefs();
  const [perm, setPerm] = useState(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const setDesktop = async (v) => {
    if (v && perm !== 'granted' && 'Notification' in window) { const r = await Notification.requestPermission(); setPerm(r); if (r !== 'granted') return; }
    setNotifPrefs({ desktop: v });
  };
  return html`<div class="sheet-b">
    <div class="field" style="margin-bottom:18px"><span class="label">Arrivées et départs des appareils</span>
      <${Seg} block=${true} label="Arrivées et départs" value=${p.presence} onChange=${(v) => setNotifPrefs({ presence: v })} options=${[{ v: 'none', l: 'Aucun' }, { v: 'favs', l: 'Favoris' }, { v: 'all', l: 'Tous' }]} />
      <span class="help">« Favoris » : seulement les appareils épinglés sur l’accueil.</span></div>
    <div class="list">
      <${Row} title="Nouvel appareil" sub="Un appareil jamais vu rejoint le réseau" value=${p.newDevice} onChange=${(v) => setNotifPrefs({ newDevice: v })} />
      <${Row} title="Coupure d’Internet" sub="Perte et retour de la connexion" value=${p.internet} onChange=${(v) => setNotifPrefs({ internet: v })} />
      <${Row} title="Sécurité" sub="Connexions à l’administration, essais refusés" value=${p.security} onChange=${(v) => setNotifPrefs({ security: v })} />
      <${Row} title="Activité de la Bbox" sub="Wi-Fi, mises à jour, pauses, Wi-Fi invité" value=${p.system} onChange=${(v) => setNotifPrefs({ system: v })} />
      <${Row} title="Son discret" sub="Deux notes douces à chaque notification" value=${p.sound} onChange=${(v) => { setNotifPrefs({ sound: v }); if (v) chime('ok'); }} />
      ${perm !== 'unsupported' && html`<${Row} title="Notifications du système" sub=${perm === 'denied' ? 'Bloquées dans les réglages du navigateur' : 'Quand le panel est en arrière-plan'} value=${p.desktop && perm === 'granted'} disabled=${perm === 'denied'} onChange=${setDesktop} />`}
    </div>
  </div>
  <div class="sheet-f"><${Btn} kind="soft" size="sm" icon="bell" onClick=${() => notify({ icon: 'bell', tone: 'ok', title: 'Notification d’essai', sub: 'Voici à quoi ressemblent les alertes', onClick: () => go('activite') })}>Essayer</${Btn}></div>`;
}
export const openNotifSettings = () => openSheet(NotifSheet, {}, { title: 'Notifications', sub: 'Sur cet appareil' });
