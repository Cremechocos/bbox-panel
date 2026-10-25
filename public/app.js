// Ma Bbox — application : démarrage, authentification, coquille (3 mises en page), navigation.
import { h, render } from '/vendor/preact.mjs';
import { useState, useEffect, useRef, useLayoutEffect } from '/vendor/hooks.mjs';
import htm from '/vendor/htm.mjs';
import { panel, onAuthLost } from '/lib/api.js';
import { Icon, Bytel } from '/lib/icons.js';
import { Overlays, toast, PasswordInput, Field, Checkbox, openPopover, IconBtn } from '/lib/ui.js';
import { useEnter, EASE, reducedMotion, Sparkline } from '/lib/chart.js';
import { useLiveValue, start as startLive, stop as stopLive, onLiveEvents, live } from '/lib/live.js';
import { ROUTES, EXTRA, TABS, routeOf } from '/lib/routes.js';
import { useRoute, go } from '/lib/router.js';
import { useAppearance, toggleTheme, isDark } from '/lib/theme.js';
import { openPalette } from '/lib/palette.js';
import { AlertsPanel } from '/lib/alerts.js';
import { NotifyHost } from '/lib/notify.js';
import { eventInfo } from '/lib/events.js';
import { kbps } from '/lib/format.js';

const html = htm.bind(h);
const M = () => window.Motion;
export { ROUTES, go };

// ───────────── Vues chargées à la demande ─────────────
const modCache = {};
function useView(mod) {
  const [V, setV] = useState(() => modCache[mod] || null);
  useEffect(() => {
    if (modCache[mod]) { setV(() => modCache[mod]); return; }
    let alive = true;
    import(`/views/${mod}.js`).then((m) => { modCache[mod] = m.default; if (alive) setV(() => m.default); }).catch((e) => { console.error(e); toast('Écran indisponible', 'err'); });
    return () => { alive = false; };
  }, [mod]);
  return V;
}
const prefetch = () => ['devices', 'wifi', 'activity', 'stats'].forEach((m) => import(`/views/${m}.js`).then((x) => { modCache[m] = x.default; }).catch(() => {}));

// ───────────── Indicateurs en direct (barre supérieure) ─────────────
const latFmt = (v) => (v == null ? '—' : v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
function TopKpis() {
  const lat = useLiveValue((s) => s.latency?.internet ?? null);
  const down = useLiveValue((s) => s.latency?.down || false);
  const ready = useLiveValue((s) => s.ready);
  useLiveValue((s) => s.series.latency[s.series.latency.length - 1]?.t || 0); // nouveau point → mini-courbe à jour
  if (!ready) return null;
  return html`<div class="tb-kpis" aria-label="Indicateurs en direct">
    <div class=${'tb-kpi' + (down ? ' bad' : '')} data-tip="Latence vers Internet, mesurée toutes les 2 s"><span class="dotl"></span>${down ? 'Internet coupé' : html`Internet <b>${latFmt(lat)} ms</b>`}${!down && html`<span class="spark"><${Sparkline} data=${live.series.latency.slice(-40)} color="var(--lat)" height=${20} width=${56} fill=${false} /></span>`}</div>
  </div>`;
}
function Bell({ size = 20 }) {
  const unread = useLiveValue((s) => s.unread || 0);
  const ref = useRef(null);
  // la cloche oscille à chaque nouvelle notification
  useEffect(() => {
    let t = 0;
    const ring = () => { const b = ref.current; if (!b) return; b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring'); clearTimeout(t); t = setTimeout(() => b.classList.remove('ring'), 1000); };
    window.addEventListener('notif:ring', ring);
    return () => { window.removeEventListener('notif:ring', ring); clearTimeout(t); };
  }, []);
  const open = () => openPopover(AlertsPanel, ref.current, {}, { title: 'Notifications' });
  return html`<button ref=${ref} class="icon-btn bell" onClick=${open} aria-label=${unread ? `Notifications (${unread} non lues)` : 'Notifications'} data-tip="Notifications"><${Icon} name="bell" size=${size} />${unread > 0 && html`<span class="count">${unread > 99 ? '99+' : unread}</span>`}</button>`;
}

function ThemeBtn() {
  const a = useAppearance();
  return html`<${IconBtn} icon=${a.theme === 'dark' ? 'sun' : 'moon'} label=${a.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'} onClick=${toggleTheme} />`;
}

// ───────────── Coquille ─────────────
function Sidebar({ route, unread, onLogout }) {
  const nav = useRef(null), ind = useRef(null), first = useRef(true);
  useLayoutEffect(() => {
    const a = nav.current?.querySelector('a.on');
    if (!a || !ind.current) { if (ind.current) ind.current.style.opacity = 0; return; }
    const y = `translateY(${a.offsetTop}px)`;
    ind.current.style.opacity = 1;
    if (first.current || reducedMotion() || !M()) { ind.current.style.transform = y; first.current = false; return; }
    M().animate(ind.current, { transform: y }, { type: 'spring', stiffness: 480, damping: 38 });
  }, [route.id]);
  const groups = [...new Set(ROUTES.map((r) => r.group))];
  return html`<aside class="side">
    <a class="brand" href="#/accueil" aria-label="Ma Bbox — accueil"><${Bytel} animate=${true} /><div><b>Ma Bbox</b><small>Bouygues Telecom</small></div></a>
    <div class="side-scroll">
      <nav class="nav" ref=${nav} aria-label="Navigation principale">
        <span class="nav-ind" ref=${ind}></span>
        ${groups.map((g) => html`<div class="nav-label">${g}</div>${ROUTES.filter((r) => r.group === g).map((r) => html`<a href=${'#/' + r.id} class=${route.id === r.id ? 'on' : ''} aria-current=${route.id === r.id ? 'page' : undefined} data-tip=${r.label}>
          <${Icon} name=${r.icon} size=${19} /><span>${r.label}</span>${r.id === 'activite' && unread > 0 && html`<i class="badge">${unread}</i><i class="dotb"></i>`}</a>`)}`)}
      </nav>
    </div>
    <div class="side-foot">
      <a href="#/apparence" data-tip="Apparence"><${Icon} name="palette" size=${18} /><span class="lbl">Apparence</span></a>
      <a href="#/mural" data-tip="Mode écran mural"><${Icon} name="expand" size=${18} /><span class="lbl">Mode mural</span></a>
      <button onClick=${onLogout} data-tip="Se déconnecter"><${Icon} name="logout" size=${18} /><span class="lbl">Se déconnecter</span></button>
      <div class="ver">Panel v2 · serveur local</div>
    </div>
  </aside>`;
}
function Topbar({ route, layout }) {
  const ref = useRef(null);
  const model = useLiveValue((s) => s.device?.device?.modelname || '');
  useEffect(() => {
    if (layout !== 'side') return;
    let on = false;
    const f = () => { const sc = window.scrollY > 8; if (sc !== on) { on = sc; ref.current?.classList.toggle('scrolled', sc); } };
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, [layout]);
  const r = routeOf(route.id);
  return html`<header class="topbar" ref=${ref}>
    <a class="tb-brand" href="#/accueil"><${Bytel} /><span>Ma Bbox</span></a>
    <div class="tb-crumb">${layout === 'top' ? html`<span class="slash" aria-hidden="true">/</span><span class="ellipsis">${model || 'Bbox'}</span>` : html`<span>${r?.group || 'Ma Bbox'}</span><span class="slash" aria-hidden="true">/</span><b class="ellipsis">${r?.label || ''}</b>`}</div>
    <div class="tb-actions">
      <${TopKpis} />
      <button class="tb-search" onClick=${openPalette} aria-label="Rechercher (⌘K)"><${Icon} name="search" size=${16} /><span class="t">Rechercher…</span><kbd>⌘K</kbd></button>
      <${Bell} />
      <${ThemeBtn} />
    </div>
  </header>`;
}
function TopTabs({ route, unread }) {
  const wrap = useRef(null), ind = useRef(null), first = useRef(true);
  useLayoutEffect(() => {
    const a = wrap.current?.querySelector('a.on > span');
    if (!a || !ind.current) { if (ind.current) ind.current.style.opacity = 0; return; }
    const link = a.parentElement;
    const x = link.offsetLeft + 12, w = link.offsetWidth - 24;
    ind.current.style.width = '100px'; ind.current.style.opacity = 1;
    const t = `translateX(${x}px) scaleX(${w / 100})`;
    if (first.current || reducedMotion() || !M()) { ind.current.style.transform = t; first.current = false; }
    else M().animate(ind.current, { transform: t }, { type: 'spring', stiffness: 480, damping: 40 });
    link.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [route.id]);
  return html`<nav class="toptabs" aria-label="Navigation principale"><div class="toptabs-in" ref=${wrap}>
    ${ROUTES.map((r) => html`<a href=${'#/' + r.id} class=${route.id === r.id ? 'on' : ''} aria-current=${route.id === r.id ? 'page' : undefined}><span>${r.short || r.label}</span>${r.id === 'activite' && unread > 0 && html`<i class="badge">${unread}</i>`}</a>`)}
    <span class="tt-ind" ref=${ind}></span>
  </div></nav>`;
}
function MobileHeader({ title }) {
  const ref = useRef(null);
  useEffect(() => {
    let on = false;
    const f = () => { const s = window.scrollY > 40; if (s !== on) { on = s; ref.current?.classList.toggle('scrolled', s); } };
    f(); window.addEventListener('scroll', f, { passive: true });
    return () => window.removeEventListener('scroll', f);
  }, []);
  return html`<header class="mhead" ref=${ref}><a href="#/accueil" aria-label="Accueil"><${Bytel} /></a><span class="mt grow ellipsis">${title}</span>
    <button class="icon-btn" onClick=${openPalette} aria-label="Rechercher"><${Icon} name="search" size=${21} /></button><${Bell} size=${21} /></header>`;
}
function TabBar({ route, unread }) {
  const cur = TABS.includes(route.id) ? route.id : 'plus';
  const items = { accueil: ['Accueil', 'home'], appareils: ['Appareils', 'devices'], wifi: ['Wi-Fi', 'wifi'], activite: ['Activité', 'bell'], plus: ['Plus', 'more'] };
  return html`<nav class="tabbar" aria-label="Navigation">${TABS.map((id) => html`<a href=${'#/' + id} class=${cur === id ? 'on' : ''} aria-current=${cur === id ? 'page' : undefined}>
    <${Icon} name=${items[id][1]} size=${24} />${items[id][0]}${id === 'activite' && unread > 0 && html`<i class="badge">${unread > 99 ? '99+' : unread}</i>`}</a>`)}</nav>`;
}

function Page({ route, ctx }) {
  const def = routeOf(route.id);
  const mod = def?.mod || 'home';
  const V = useView(mod);
  const ref = useRef(null);
  useEffect(() => { window.scrollTo(0, 0); }, [route.id]);
  useEnter(ref, [mod, !!V]);
  return html`<main class="page" ref=${ref} id="contenu">${V ? html`<${V} route=${route} ctx=${ctx} />` : html`<div class="phead" data-enter><div><div class="skel" style="width:120px;height:12px"></div><div class="skel" style="width:240px;height:32px;margin-top:10px"></div></div></div>`}</main>`;
}
function Bare({ route, ctx }) {
  const V = useView(routeOf(route.id).mod);
  return V ? html`<${V} route=${route} ctx=${ctx} />` : null;
}

function useGlobalKeys() {
  useEffect(() => {
    const f = (e) => {
      const typing = /input|textarea|select/i.test(document.activeElement?.tagName || '') || document.activeElement?.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === '/' && !typing && !document.querySelector('.overlay')) { e.preventDefault(); openPalette(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
}
// Alertes poussées en direct → notification discrète
function Shell({ onLogout }) {
  const route = useRoute();
  const a = useAppearance();
  const unread = useLiveValue((s) => s.unread || 0);
  const def = routeOf(route.id);
  const title = def?.label || 'Accueil';
  useEffect(() => { document.title = `${title} · Ma Bbox`; }, [title]);
  useEffect(() => { const t = setTimeout(prefetch, 1500); return () => clearTimeout(t); }, []);
  useGlobalKeys();
  const ctx = { logout: onLogout };
  if (def?.bare) return html`<${Bare} key=${route.id} route=${route} ctx=${ctx} /><${NotifyHost} />`;
  return html`<${NotifyHost} /><div class="app" data-layout=${a.layout}>
    <${Sidebar} route=${route} unread=${unread} onLogout=${onLogout} />
    <div class="main">
      <${Topbar} route=${route} layout=${a.layout} />
      <${TopTabs} route=${route} unread=${unread} />
      <${MobileHeader} title=${title} />
      <${Page} key=${route.id} route=${route} ctx=${ctx} />
    </div>
    <${TabBar} route=${route} unread=${unread} />
  </div>`;
}

// ───────────── Connexion ─────────────
function Login({ onDone }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const root = useRef(null), field = useRef(null), input = useRef(null);
  const a = useAppearance();
  useEffect(() => {
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.current?.focus({ preventScroll: true });
    if (!M() || reducedMotion() || document.hidden) return;
    M().animate(root.current.querySelectorAll('[data-enter]'), { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0)'] }, { duration: 0.8, ease: EASE, delay: M().stagger(0.08, { startDelay: 0.35 }) });
  }, []);
  async function submit(e) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr('');
    try { await panel.login(pw, remember); setPw(''); onDone(); }
    catch (e) {
      const b = e.body || {};
      setErr(b.error === 'bad_password' ? 'Mot de passe incorrect'
        : b.error === 'bbox_locked' ? 'Trop d’essais : Bbox verrouillée quelques minutes'
        : b.error === 'local_throttle' ? `Réessayez dans ${b.retryIn} s`
        : b.error === 'bbox_unreachable' ? 'Bbox injoignable'
        : 'Connexion impossible');
      if (field.current && M() && !reducedMotion()) M().animate(field.current, { transform: ['translateX(0)', 'translateX(-8px)', 'translateX(7px)', 'translateX(-4px)', 'translateX(2px)', 'translateX(0)'] }, { duration: 0.42, ease: 'easeOut' });
      input.current?.select();
    } finally { setBusy(false); }
  }
  return html`<main class="lg" ref=${root}>
    <div class="lg-bg" aria-hidden="true">
      <div class="lg-glow"></div>
      <svg class="lg-rings" viewBox="0 0 800 800">${[120, 200, 280, 360].map((r, i) => html`<circle cx="400" cy="400" r=${r} style=${`animation-delay:${i * 0.6}s`} />`)}</svg>
    </div>
    <button type="button" class="icon-btn lg-mode" onClick=${toggleTheme} aria-label=${a.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}><${Icon} name=${a.theme === 'dark' ? 'sun' : 'moon'} size=${19} /></button>
    <form class="lg-form" onSubmit=${submit} novalidate>
      <div class="lg-logo"><${Bytel} animate=${true} /></div>
      <h1 class="lg-title" data-enter>Ma Bbox</h1>
      <input type="text" name="username" value="admin" autocomplete="username" hidden readonly />
      <div class=${'lg-field' + (err ? ' err' : '')} ref=${field} data-enter>
        <${Icon} name="lock" size=${18} class="lg-lock" />
        <input ref=${input} type=${show ? 'text' : 'password'} value=${pw} onInput=${(e) => { setPw(e.currentTarget.value); if (err) setErr(''); }}
          placeholder="Mot de passe" aria-label="Mot de passe de la Bbox" aria-invalid=${!!err} aria-describedby="lg-msg"
          autocomplete="current-password" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="go" />
        <button type="button" class="lg-eye" onClick=${() => setShow(!show)} aria-label=${show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed=${show}><${Icon} name=${show ? 'eyeoff' : 'eye'} size=${18} /></button>
        <button type="submit" class="lg-go" disabled=${!pw || busy} aria-label="Se connecter">${busy ? html`<span class="spin"></span>` : html`<${Icon} name="arrowright" size=${18} />`}</button>
      </div>
      <p class="lg-msg" id="lg-msg" role="alert">${err}</p>
      <label class="lg-remember" data-enter><input type="checkbox" checked=${remember} onChange=${(e) => setRemember(e.currentTarget.checked)} /><span class="lg-box"><${Icon} name="check" size=${12} /></span>Rester connecté</label>
    </form>
  </main>`;
}

// ───────────── Racine ─────────────
function App() {
  const [state, setState] = useState('boot');
  const splash = useRef(null);
  useEffect(() => {
    const t0 = Date.now();
    panel.session().then((s) => s.authenticated, () => false).then(async (ok) => {
      if (ok) startLive();
      await new Promise((r) => setTimeout(r, Math.max(0, 650 - (Date.now() - t0))));
      if (splash.current && M() && !reducedMotion() && !document.hidden) await M().animate(splash.current, { opacity: 0 }, { duration: 0.28 }).finished;
      setState(ok ? 'in' : 'out');
    });
    return onAuthLost(() => { stopLive(); setState('out'); });
  }, []);
  const logout = async () => { try { await panel.logout(); } catch { /* */ } stopLive(); setState('out'); };
  if (state === 'boot') return html`<div class="splash" ref=${splash}><${Bytel} animate=${true} loop=${true} /></div>`;
  if (state === 'out') return html`<${Login} onDone=${() => { startLive(); setState('in'); }} /><${Overlays} />`;
  return html`<${Shell} onLogout=${logout} /><${Overlays} />`;
}

render(html`<${App} />`, document.getElementById('app'));

// Webapp iOS : service worker (uniquement en HTTPS ou localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost') && !document.documentElement.dataset.preview) navigator.serviceWorker.register('/sw.js').catch(() => {});
