// Briques d'interface partagées : cache de données, actions, feuilles, dialogues, popovers, toasts,
// champs (texte, liste, curseur, case à cocher), onglets, tableaux.
import { h, Fragment, render } from '/vendor/preact.mjs';
import { useState, useEffect, useRef, useLayoutEffect, useCallback, useMemo } from '/vendor/hooks.mjs';
import htm from '/vendor/htm.mjs';
import { api } from '/lib/api.js';
import { Icon } from '/lib/icons.js';
import { Switch, EASE, reducedMotion } from '/lib/chart.js';
import { DAYS, displayName } from '/lib/format.js';

export const html = htm.bind(h);
const M = () => window.Motion;
// Onglet masqué : le navigateur suspend les animations, on applique directement l'état final
export const anim = (el, kf, opts) => {
  if (M() && !reducedMotion() && el && !document.hidden) return M().animate(el, kf, opts);
  if (el) for (const [k, v] of Object.entries(kf)) el.style[k] = Array.isArray(v) ? v[v.length - 1] : v;
  return { finished: Promise.resolve(), stop() {} };
};

// ═════════════ Données : cache partagé par chemin, invalidation après écriture ═════════════
const cache = new Map();   // path -> { data, error, t, p }
const watchers = new Map(); // path -> Set(fn)
function notify(path) { (watchers.get(path) || []).forEach((f) => f()); }
export async function load(path, { force = false, raw = false, maxAge = 4000 } = {}) {
  const key = (raw ? 'raw:' : '') + path;
  const c = cache.get(key);
  if (!force && c && c.data !== undefined && Date.now() - c.t < maxAge) return c.data;
  if (c?.p) return c.p;
  const p = (raw ? api.raw(path) : api.get(path)).then(
    (data) => { cache.set(key, { data, t: Date.now() }); notify(key); return data; },
    (error) => { cache.set(key, { ...(cache.get(key) || {}), error, p: null, t: Date.now() }); notify(key); throw error; },
  );
  cache.set(key, { ...(c || {}), p });
  return p;
}
export function invalidate(...prefixes) {
  for (const key of watchers.keys()) {
    const path = key.replace(/^raw:/, '');
    if (!prefixes.length || prefixes.some((p) => path === p || path.startsWith(p))) load(path, { force: true, raw: key.startsWith('raw:') }).catch(() => {});
  }
}
/** useApi('wireless') ou useApi(['wireless','hosts']) → { data, loading, error, reload } */
export function useApi(paths, { poll = 0, raw = false } = {}) {
  const list = Array.isArray(paths) ? paths : [paths];
  const keyStr = list.join('|');
  const [, setTick] = useState(0);
  useEffect(() => {
    const keys = list.map((p) => (raw ? 'raw:' : '') + p);
    const f = () => setTick((t) => t + 1);
    keys.forEach((k) => { if (!watchers.has(k)) watchers.set(k, new Set()); watchers.get(k).add(f); });
    list.forEach((p) => load(p, { raw }).catch(() => {}));
    let timer;
    if (poll) {
      const tick = () => { if (!document.hidden) list.forEach((p) => load(p, { raw, force: true }).catch(() => {})); timer = setTimeout(tick, poll); };
      timer = setTimeout(tick, poll);
    }
    return () => { clearTimeout(timer); keys.forEach((k) => watchers.get(k)?.delete(f)); };
  }, [keyStr, poll]);
  const entries = list.map((p) => cache.get((raw ? 'raw:' : '') + p) || {});
  const data = entries.map((e) => e.data);
  const error = entries.find((e) => e.error && e.data === undefined)?.error;
  const loading = entries.some((e) => e.data === undefined && !e.error);
  const reload = () => list.forEach((p) => load(p, { raw, force: true }).catch(() => {}));
  return { data: Array.isArray(paths) ? data : data[0], loading, error, reload };
}
/** Requête ponctuelle (panel.history…) avec rechargement */
export function useFetch(fn, deps = [], { poll = 0 } = {}) {
  const [st, setSt] = useState({ data: undefined, error: null, loading: true });
  const run = useCallback(() => fn().then((data) => setSt({ data, error: null, loading: false }), (error) => setSt((o) => ({ ...o, error, loading: false }))), deps);
  useEffect(() => {
    setSt((o) => ({ ...o, loading: true }));
    run();
    if (!poll) return;
    const t = setInterval(() => { if (!document.hidden) run(); }, poll);
    return () => clearInterval(t);
  }, deps);
  return { ...st, reload: run };
}
/** Point de rupture (true sous 760 px) */
export function useMobile() {
  const q = '(max-width: 760px)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => { const mq = window.matchMedia(q); const f = () => setM(mq.matches); mq.addEventListener('change', f); return () => mq.removeEventListener('change', f); }, []);
  return m;
}

// ═════════════ Erreurs lisibles ═════════════
export function errMsg(e) {
  if (!e) return 'Erreur inconnue';
  if (e.status === 0) return 'Serveur du panel injoignable.';
  if (e.status === 401) return 'Session expirée : reconnecte-toi.';
  if (e.status === 403 && e.body?.error === 'blocked_by_panel') return 'Action volontairement bloquée par le panel.';
  if (e.status === 429) return 'La Bbox limite les requêtes : réessaie dans un instant.';
  const ex = e.body?.exception;
  if (ex?.errors?.length) {
    const er = ex.errors[0];
    const reason = String(er.reason || '').replace(/_/g, ' ').toLowerCase();
    return `La Bbox a refusé${er.name ? ` le champ « ${er.name} »` : ''}${reason ? ` (${reason})` : ''}.`;
  }
  if (e.body?.error === 'no_session') return 'Le serveur du panel n’a pas de session Bbox valide : reconnecte-toi.';
  if (e.status === 404) return 'Fonction non disponible sur ce modèle de Bbox.';
  if (e.status >= 500) return 'La Bbox ne répond pas correctement.';
  return 'Action impossible (' + (e.body?.error || e.status) + ').';
}

// ═════════════ Toasts ═════════════
let toastHost = null;
/** toast('Enregistré') · toast('Erreur', 'err') · toast('Nouvel appareil', 'alert', { label: 'Voir', onClick }) */
export function toast(msg, kind = 'ok', action = null) { toastHost?.push({ msg, kind, action, id: Math.random() }); }
function Toasts() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    toastHost = { push: (t) => { setItems((l) => [...l.slice(-2), t]); setTimeout(() => setItems((l) => l.filter((x) => x.id !== t.id)), t.kind === 'ok' ? 2800 : 6000); } };
  }, []);
  return html`<div class="toasts" role="status" aria-live="polite">${items.map((t) => html`<${ToastItem} key=${t.id} t=${t} dismiss=${() => setItems((l) => l.filter((x) => x.id !== t.id))} />`)}</div>`;
}
function ToastItem({ t, dismiss }) {
  const ref = useRef(null);
  useLayoutEffect(() => { anim(ref.current, { opacity: [0, 1], transform: ['translateY(14px) scale(.97)', 'translateY(0) scale(1)'] }, { type: 'spring', stiffness: 520, damping: 34 }); }, []);
  const icon = t.kind === 'err' ? 'alert' : t.kind === 'alert' ? 'bell' : 'check';
  return html`<div class=${'toast ' + t.kind} ref=${ref}><${Icon} name=${icon} size=${18} /><span class="grow">${t.msg}</span>
    ${t.action && html`<button class="t-act" onClick=${() => { dismiss(); t.action.onClick(); }}>${t.action.label}</button>`}</div>`;
}

/** Exécute une écriture : toast de succès/erreur + rafraîchissement des données concernées */
export async function act(fn, { ok = 'Enregistré', refresh = [], silent = false } = {}) {
  try {
    const r = await fn();
    if (!silent && ok) toast(ok);
    if (refresh.length) setTimeout(() => invalidate(...refresh), 350);
    return r;
  } catch (e) {
    toast(errMsg(e), 'err');
    if (refresh.length) invalidate(...refresh);
    throw e;
  }
}

// ═════════════ Calques : feuilles, dialogues, popovers (hôte global, hors des pages animées) ═════════════
let layerHost = null;
const isMobile = () => window.matchMedia('(max-width: 760px)').matches;
/** openSheet(Composant, props, { title, sub, actions }) → Promise (valeur passée à close) */
export function openSheet(Comp, props = {}, opts = {}) {
  return new Promise((resolve) => layerHost?.add({ type: 'sheet', Comp, props, opts, resolve, id: Math.random() }));
}
/** confirmDialog({ title, message, confirm, tone }) → Promise<boolean> */
export function confirmDialog(o) {
  return new Promise((resolve) => layerHost?.add({ type: 'dialog', opts: o, resolve, id: Math.random() }));
}
/** openPopover(Composant, élément d'ancrage, props) → Promise ; sur mobile, ouvre une feuille */
export function openPopover(Comp, anchor, props = {}, opts = {}) {
  if (isMobile()) return openSheet(Comp, props, opts);
  return new Promise((resolve) => layerHost?.add({ type: 'popover', Comp, props, opts, anchor, resolve, id: Math.random() }));
}
/** openLayer(Composant, props) : calque libre (palette de commandes…) */
export function openLayer(Comp, props = {}) {
  return new Promise((resolve) => layerHost?.add({ type: 'free', Comp, props, opts: {}, resolve, id: Math.random() }));
}
function Layers() {
  const [layers, setLayers] = useState([]);
  useEffect(() => { layerHost = { add: (l) => setLayers((x) => [...x, l]) }; }, []);
  const remove = (id) => setLayers((x) => x.filter((l) => l.id !== id));
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && layers.length) { e.preventDefault(); document.dispatchEvent(new CustomEvent('layer-close', { detail: layers[layers.length - 1].id })); } };
    window.addEventListener('keydown', onKey);
    const lock = layers.some((l) => l.type !== 'popover');
    document.documentElement.style.overflow = lock ? 'hidden' : '';
    return () => window.removeEventListener('keydown', onKey);
  }, [layers]);
  return html`${layers.map((l) => {
    const C = l.type === 'sheet' ? SheetLayer : l.type === 'dialog' ? DialogLayer : l.type === 'popover' ? PopoverLayer : FreeLayer;
    return html`<${C} key=${l.id} l=${l} remove=${remove} />`;
  })}`;
}
function useLayerClose(l, close) {
  useEffect(() => {
    const f = (e) => e.detail === l.id && close();
    document.addEventListener('layer-close', f);
    return () => document.removeEventListener('layer-close', f);
  }, []);
}
function SheetLayer({ l, remove }) {
  const ov = useRef(null), panel = useRef(null), head = useRef(null), drag = useRef(null), prevFocus = useRef(document.activeElement);
  const mobile = useMemo(isMobile, []);
  const hidden = mobile ? 'translateY(100%)' : 'translateX(calc(100% + 16px))';
  const closing = useRef(false);
  const close = useCallback(async (value) => {
    if (closing.current) return; closing.current = true;
    anim(ov.current, { opacity: 0 }, { duration: 0.2 });
    await anim(panel.current, { transform: hidden }, { duration: 0.24, ease: [0.4, 0, 1, 1] }).finished;
    remove(l.id); l.resolve(value);
    prevFocus.current?.focus?.({ preventScroll: true });
  }, []);
  useLayoutEffect(() => {
    anim(ov.current, { opacity: [0, 1] }, { duration: 0.24 });
    anim(panel.current, { transform: [hidden, mobile ? 'translateY(0%)' : 'translateX(0%)'] }, { type: 'spring', stiffness: 420, damping: 40, mass: 0.9 });
    if (!mobile) setTimeout(() => panel.current?.querySelector('input:not([type=hidden]),select,textarea')?.focus({ preventScroll: true }), 260);
    // filet sous l'en-tête dès que le contenu défile
    const body = panel.current?.querySelector('.sheet-b');
    const f = () => head.current?.classList.toggle('scrolled', (body?.scrollTop || 0) > 2);
    body?.addEventListener('scroll', f, { passive: true });
    return () => body?.removeEventListener('scroll', f);
  }, []);
  useLayerClose(l, close);
  // glisser vers le bas pour fermer (mobile) — transform écrit directement, sans re-rendu
  const down = (e) => { if (!mobile || e.target.closest('button')) return; drag.current = { y: e.clientY, t: performance.now(), dy: 0 }; e.currentTarget.setPointerCapture(e.pointerId); };
  const move = (e) => { if (!drag.current) return; const dy = Math.max(0, e.clientY - drag.current.y); drag.current.dy = dy; panel.current.style.transform = `translateY(${dy}px)`; };
  const up = () => {
    if (!drag.current) return;
    const { dy, t } = drag.current; drag.current = null;
    const v = dy / Math.max(1, performance.now() - t);
    if (dy > 120 || v > 0.6) close(); else anim(panel.current, { transform: 'translateY(0px)' }, { type: 'spring', stiffness: 500, damping: 38 });
  };
  const { Comp, props, opts } = l;
  return html`
    <div class="overlay" ref=${ov} onClick=${() => close()}></div>
    <section class=${'sheet ' + (mobile ? 'bottom' : 'at-side')} ref=${panel} role="dialog" aria-modal="true" aria-label=${opts.title} style=${`transform:${hidden}`}>
      <div class="sheet-grab" onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}></div>
      <header class="sheet-h" ref=${head} onPointerDown=${down} onPointerMove=${move} onPointerUp=${up} onPointerCancel=${up}>
        <div class="ht"><h2>${opts.title}</h2>${opts.sub && html`<div class="hs ellipsis">${opts.sub}</div>`}</div>
        ${opts.actions}
        <button class="icon-btn" onClick=${() => close()} aria-label="Fermer"><${Icon} name="x" /></button>
      </header>
      <${Comp} ...${props} close=${close} />
    </section>`;
}
function DialogLayer({ l, remove }) {
  const ov = useRef(null), box = useRef(null);
  const o = l.opts;
  const done = async (v) => {
    anim(ov.current, { opacity: 0 }, { duration: 0.18 });
    await anim(box.current, { opacity: 0, transform: 'translate(-50%, -50%) scale(.97)' }, { duration: 0.15 }).finished;
    remove(l.id); l.resolve(v);
  };
  useLayoutEffect(() => {
    anim(ov.current, { opacity: [0, 1] }, { duration: 0.2 });
    anim(box.current, { opacity: [0, 1], transform: ['translate(-50%, -47%) scale(.96)', 'translate(-50%, -50%) scale(1)'] }, { type: 'spring', stiffness: 520, damping: 36 });
    box.current?.querySelector('[data-autofocus]')?.focus();
  }, []);
  useLayerClose(l, () => done(false));
  const tone = o.tone || 'warn';
  return html`
    <div class="overlay top" ref=${ov} onClick=${() => done(false)}></div>
    <div class="dialog" ref=${box} role="alertdialog" aria-modal="true" aria-label=${o.title}>
      <div class=${'dico ' + tone}><${Icon} name=${o.icon || (tone === 'info' ? 'info' : 'alert')} size=${22} /></div>
      <h2>${o.title}</h2>
      ${o.message && html`<p>${o.message}</p>`}
      <div class="acts">
        <button class="btn btn-ghost" onClick=${() => done(false)}>${o.cancel || 'Annuler'}</button>
        <button class=${'btn ' + (tone === 'danger' ? 'btn-danger' : 'btn-go')} data-autofocus onClick=${() => done(true)}>${o.confirm || 'Confirmer'}</button>
      </div>
    </div>`;
}
function PopoverLayer({ l, remove }) {
  const box = useRef(null);
  const r = l.anchor.getBoundingClientRect();
  const close = useCallback(async (v) => {
    await anim(box.current, { opacity: 0, transform: 'translateY(-4px) scale(.98)' }, { duration: 0.12 }).finished;
    remove(l.id); l.resolve(v);
  }, []);
  useLayoutEffect(() => {
    anim(box.current, { opacity: [0, 1], transform: ['translateY(-6px) scale(.97)', 'translateY(0) scale(1)'] }, { type: 'spring', stiffness: 600, damping: 38 });
    const out = (e) => { if (!box.current?.contains(e.target) && !l.anchor.contains(e.target)) close(); };
    setTimeout(() => document.addEventListener('pointerdown', out), 0);
    return () => document.removeEventListener('pointerdown', out);
  }, []);
  useLayerClose(l, close);
  const { Comp, props } = l;
  const right = Math.max(12, window.innerWidth - r.right);
  return html`<div class="popover" ref=${box} role="dialog" style=${`top:${r.bottom + 8}px;right:${right}px`}><${Comp} ...${props} close=${close} /></div>`;
}
function FreeLayer({ l, remove }) {
  const close = useCallback((v) => { remove(l.id); l.resolve(v); }, []);
  useLayerClose(l, close);
  const { Comp, props } = l;
  return html`<${Comp} ...${props} close=${close} />`;
}
export function Overlays() { return html`<${Layers} /><${Toasts} />`; }

// ═════════════ Mise en page ═════════════
export function PageHead({ kicker, title, sub, actions }) {
  return html`<header class="phead" data-enter>
    <div class="grow">${kicker && html`<div class="kicker">${kicker}</div>`}<h1>${title}</h1>${sub && html`<p class="sub">${sub}</p>`}</div>
    ${actions && html`<div class="actions">${actions}</div>`}
  </header>`;
}
export function Card({ title, icon, sub, action, children, class: cls = '', flush = false, enter = true, style, foot }) {
  return html`<section class=${`card ${flush ? 'flush ' : ''}${cls}`} data-enter=${enter ? '' : undefined} style=${style}>
    ${(title || action) && html`<div class="card-h">${title && html`<h2>${icon && html`<${Icon} name=${icon} size=${18} />`}<span class="ellipsis">${title}</span>${sub && html`<span class="sub">${sub}</span>`}</h2>`}${action}</div>`}
    ${children}
    ${foot && html`<div class="card-foot">${foot}</div>`}
  </section>`;
}
export function KV({ rows }) {
  return html`<div class="kv">${rows.filter(Boolean).map(([k, v]) => html`<div class="kv-r"><span class="k">${k}</span><span class="d"></span><span class="v">${v ?? '—'}</span></div>`)}</div>`;
}
export function Skeleton({ h: height = 16, w = '100%', r, style = '' }) {
  return html`<div class="skel" style=${`height:${height}px;width:${typeof w === 'number' ? w + 'px' : w};${r ? `border-radius:${r}px;` : ''}${style}`}></div>`;
}
export function SkeletonCard({ lines = 3, cls = '' }) {
  return html`<div class=${'card ' + cls} data-enter><div class="stack"><${Skeleton} h=${18} w="40%" />${Array.from({ length: lines }, (_, i) => html`<${Skeleton} h=${14} w=${i === lines - 1 ? '70%' : '100%'} />`)}</div></div>`;
}
export function Empty({ icon = 'info', title, children, action }) {
  return html`<div class="empty"><span class="ico-tile"><${Icon} name=${icon} size=${22} /></span><b>${title}</b>${children && html`<span>${children}</span>`}${action && html`<div style="margin-top:10px">${action}</div>`}</div>`;
}
export function ErrorCard({ error, onRetry }) {
  return html`<div class="card" data-enter><${Empty} icon="alert" title="Impossible de charger ces données" action=${onRetry && html`<button class="btn btn-soft btn-sm" onClick=${onRetry}>Réessayer</button>`}>${errMsg(error)}</${Empty}></div>`;
}

// ═════════════ Boutons & interrupteurs ═════════════
/** Bouton qui gère seul son état « en cours » quand onClick renvoie une promesse */
export function Btn({ kind = 'go', size, onClick, children, disabled, icon, type = 'button', class: cls = '', title, confirm, tip }) {
  const [busy, setBusy] = useState(false);
  const run = async (e) => {
    if (!onClick || busy) return;
    if (confirm && !(await confirmDialog(typeof confirm === 'function' ? confirm() : confirm))) return; // le spinner n'apparaît qu'après confirmation
    const r = onClick(e);
    if (r && typeof r.then === 'function') { setBusy(true); try { await r; } catch { /* toast déjà affiché */ } finally { setBusy(false); } }
  };
  return html`<button type=${type} title=${title} data-tip=${tip} class=${`btn btn-${kind}${size ? ' btn-' + size : ''} ${cls}`} disabled=${disabled || busy} aria-busy=${busy || undefined} onClick=${run}>
    ${busy ? html`<span class="spin"></span>` : icon && html`<${Icon} name=${icon} size=${size === 'xs' ? 15 : size === 'sm' ? 16 : 18} />`}${children}</button>`;
}
export function IconBtn({ icon, label, onClick, class: cls = '', size = 20, disabled, tip = true }) {
  return html`<button type="button" class=${'icon-btn ' + cls} aria-label=${label} data-tip=${tip ? label : undefined} onClick=${onClick} disabled=${disabled}><${Icon} name=${icon} size=${size} /></button>`;
}
/** Interrupteur relié à une écriture : optimiste, revient en arrière si la Bbox refuse */
export function Toggle({ value, onChange, label, disabled, confirm }) {
  const [v, setV] = useState(!!value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!busy) setV(!!value); }, [value]);
  const flip = async (nv) => {
    if (busy) return;
    if (confirm) { const c = typeof confirm === 'function' ? confirm(nv) : confirm; if (c && !(await confirmDialog(c))) return; }
    setV(nv); setBusy(true);
    try { await onChange(nv); } catch { setV(!nv); } finally { setBusy(false); }
  };
  return html`<span class=${busy ? 'busy-wrap' : ''} style="display:inline-flex"><${Switch} checked=${v} onChange=${flip} disabled=${disabled || busy} label=${label} /></span>`;
}
export function ToggleRow({ title, sub, value, onChange, disabled, confirm, children }) {
  return html`<div class="check-row"><div class="grow"><div class="t">${title}</div>${sub && html`<div class="s">${sub}</div>`}${children}</div><${Toggle} value=${value} onChange=${onChange} label=${title} disabled=${disabled} confirm=${confirm} /></div>`;
}

/** Contrôle segmenté à pastille glissante (transform uniquement), flèches clavier */
export function Seg({ options, value, onChange, block = false, label, size }) {
  const wrap = useRef(null), ind = useRef(null), first = useRef(true);
  useLayoutEffect(() => {
    const btn = wrap.current?.querySelector(`[data-v="${CSS.escape(String(value))}"]`);
    if (!btn || !ind.current) return;
    ind.current.style.width = btn.offsetWidth + 'px';
    ind.current.style.opacity = 1;
    const x = `translateX(${btn.offsetLeft - 3}px)`;
    if (first.current || reducedMotion()) { ind.current.style.transform = x; first.current = false; }
    else anim(ind.current, { transform: x }, { type: 'spring', stiffness: 520, damping: 40 });
  }, [value, options.length, options.map((o) => o.l).join()]);
  // contrôle plus large que l'écran : défilement horizontal avec fondu sur le bord masqué
  useEffect(() => {
    const el = wrap.current;
    const ov = () => { const st = el.scrollLeft > 2, en = el.scrollLeft + el.clientWidth < el.scrollWidth - 2; el.dataset.ov = (st ? 's' : '') + (en ? 'e' : ''); };
    ov(); el.addEventListener('scroll', ov, { passive: true });
    const ro = new ResizeObserver(ov); ro.observe(el);
    return () => { el.removeEventListener('scroll', ov); ro.disconnect(); };
  }, []);
  useEffect(() => {
    const el = wrap.current, btn = el?.querySelector('button.on');
    if (btn && el.scrollWidth > el.clientWidth) el.scrollTo({ left: Math.max(0, btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2), behavior: first.current ? 'auto' : 'smooth' });
  }, [value]);
  useEffect(() => {
    const ro = new ResizeObserver(() => { const btn = wrap.current?.querySelector('button.on'); if (btn && ind.current) { ind.current.style.width = btn.offsetWidth + 'px'; ind.current.style.transform = `translateX(${btn.offsetLeft - 3}px)`; } });
    ro.observe(wrap.current); return () => ro.disconnect();
  }, []);
  const key = (e) => {
    const i = options.findIndex((o) => String(o.v) === String(value));
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const o = options[(n + options.length) % options.length];
    onChange(o.v);
    requestAnimationFrame(() => wrap.current?.querySelector(`[data-v="${CSS.escape(String(o.v))}"]`)?.focus());
  };
  return html`<div class=${'seg' + (block ? ' block' : '') + (size ? ' ' + size : '')} ref=${wrap} role="radiogroup" aria-label=${label} onKeyDown=${key}>
    <span class="seg-ind" ref=${ind}></span>
    ${options.map((o) => { const on = String(o.v) === String(value); return html`<button type="button" role="radio" aria-checked=${on} tabindex=${on ? 0 : -1} data-v=${o.v} class=${on ? 'on' : ''} onClick=${() => onChange(o.v)}>${o.l}</button>`; })}
  </div>`;
}
/** Onglets de page à soulignement animé */
export function Tabs({ tabs, value, onChange, label }) {
  const wrap = useRef(null), ind = useRef(null), first = useRef(true);
  const place = (animate) => {
    const btn = wrap.current?.querySelector('button.on');
    if (!btn || !ind.current) return;
    const x = btn.offsetLeft + 12, w = btn.offsetWidth - 24;
    ind.current.style.opacity = 1;
    ind.current.style.width = '100px';
    const t = `translateX(${x}px) scaleX(${w / 100})`;
    if (!animate || first.current || reducedMotion()) { ind.current.style.transform = t; first.current = false; }
    else anim(ind.current, { transform: t }, { type: 'spring', stiffness: 480, damping: 40 });
  };
  useLayoutEffect(() => place(true), [value, tabs.map((t) => t.l + (t.n ?? '')).join()]);
  useEffect(() => { const ro = new ResizeObserver(() => place(false)); ro.observe(wrap.current); return () => ro.disconnect(); }, []);
  return html`<div class="tabs" ref=${wrap} role="tablist" aria-label=${label} data-enter>
    ${tabs.map((t) => html`<button type="button" role="tab" aria-selected=${t.v === value} class=${t.v === value ? 'on' : ''} onClick=${() => onChange(t.v)}>${t.icon && html`<${Icon} name=${t.icon} size=${16} />`}${t.l}${t.n != null && html`<span class="n">${t.n}</span>`}</button>`)}
    <span class="tabs-ind" ref=${ind}></span>
  </div>`;
}

// ═════════════ Champs ═════════════
export function Field({ label, help, error, children }) {
  return html`<div class="field">${label && html`<label>${label}</label>`}${children}${error ? html`<div class="err" role="alert"><${Icon} name="alert" size=${14} />${error}</div>` : help && html`<div class="help">${help}</div>`}</div>`;
}
export function Input({ value, onInput, type = 'text', placeholder, bad, icon, suffix, ...rest }) {
  const el = html`<input class=${'input' + (bad ? ' bad' : '')} type=${type} value=${value ?? ''} placeholder=${placeholder} aria-invalid=${bad || undefined} onInput=${(e) => onInput(e.target.value)} ...${rest} />`;
  if (!icon && !suffix) return el;
  return html`<div class=${'input-wrap' + (icon ? ' has-pre' : '') + (suffix ? ' has-suffix' : '')}>${icon && html`<span class="pre"><${Icon} name=${icon} size=${18} /></span>`}${el}${suffix && html`<span class="suffix">${suffix}</span>`}</div>`;
}
export function Select({ value, onChange, options, ...rest }) {
  return html`<span class="select-wrap"><select class="select" value=${value} onChange=${(e) => onChange(e.target.value)} ...${rest}>${options.map((o) => html`<option value=${o.v} selected=${String(o.v) === String(value)} disabled=${o.disabled}>${o.l}</option>`)}</select><${Icon} name="chevron" size=${16} class="rot90" /></span>`;
}
export function PasswordInput({ value, onInput, placeholder, autocomplete = 'new-password', bad }) {
  const [show, setShow] = useState(false);
  return html`<div class="input-wrap"><input class=${'input mono' + (bad ? ' bad' : '')} type=${show ? 'text' : 'password'} value=${value ?? ''} placeholder=${placeholder} autocomplete=${autocomplete} autocapitalize="off" spellcheck="false" onInput=${(e) => onInput(e.target.value)} />
    <span class="adorn"><button type="button" class="icon-btn" onClick=${() => setShow(!show)} aria-label=${show ? 'Masquer' : 'Afficher'}><${Icon} name=${show ? 'eyeoff' : 'eye'} size=${18} /></button></span></div>`;
}
/** Curseur : remplissage via --p (posé sur l'élément lui-même, sans cascade), graduations optionnelles */
export function Range({ value, onChange, min = 0, max = 100, step = 1, label, format = (v) => v, ticks, disabled, onCommit }) {
  const p = ((Number(value) - min) / (max - min || 1)) * 100;
  return html`<div class="range-wrap">
    ${label && html`<div class="range-head"><span>${label}</span><b>${format(Number(value))}</b></div>`}
    <input class="range" type="range" min=${min} max=${max} step=${step} value=${value} disabled=${disabled} aria-label=${label} aria-valuetext=${format(Number(value))} style=${`--p:${p}%`}
      onInput=${(e) => { e.target.style.setProperty('--p', ((e.target.value - min) / (max - min || 1)) * 100 + '%'); onChange(Number(e.target.value)); }}
      onChange=${(e) => onCommit?.(Number(e.target.value))} />
    ${ticks && html`<div class="range-ticks" aria-hidden="true">${ticks.map((t, i) => html`<span class=${[Number(t.v) === Number(value) ? 'on' : '', i === 0 ? 'first' : '', i === ticks.length - 1 ? 'last' : ''].join(' ')} style=${`left:${((t.v - min) / (max - min || 1)) * 100}%`}>${t.l}</span>`)}</div>`}
  </div>`;
}
export function Checkbox({ checked, onChange, label, disabled }) {
  return html`<label class="check"><input type="checkbox" checked=${!!checked} disabled=${disabled} onChange=${(e) => onChange(e.target.checked)} /><span class="box"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>${label && html`<span>${label}</span>`}</label>`;
}
/** Cartes de choix (durées, options) */
export function Choices({ options, value, onChange, label }) {
  return html`<div class="choices" role="radiogroup" aria-label=${label}>${options.map((o) => html`<button type="button" role="radio" aria-checked=${o.v === value} class=${'choice' + (o.v === value ? ' on' : '')} onClick=${() => onChange(o.v)}><b>${o.l}</b>${o.s && html`<small>${o.s}</small>`}</button>`)}</div>`;
}
export function Secret({ value, mask = true }) {
  const [show, setShow] = useState(!mask);
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value || ''); setCopied(true); toast('Copié dans le presse-papiers'); setTimeout(() => setCopied(false), 1500); } catch { toast('Copie impossible', 'err'); } };
  return html`<div class="secret"><span class="val num">${show ? value || '—' : '•'.repeat(Math.min(16, String(value || '').length || 10))}</span>
    <button class="icon-btn" onClick=${() => setShow(!show)} aria-label=${show ? 'Masquer' : 'Afficher'}><${Icon} name=${show ? 'eyeoff' : 'eye'} size=${18} /></button>
    <button class="icon-btn" onClick=${copy} aria-label="Copier"><${Icon} name=${copied ? 'check' : 'copy'} size=${18} /></button></div>`;
}
export function QR({ text, label = 'QR code', cell = 4 }) {
  const svg = useMemo(() => {
    if (!window.qrcode || !text) return '';
    window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs['UTF-8'];
    const q = window.qrcode(0, 'M'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: cell, margin: 0, scalable: true });
  }, [text]);
  return html`<div class="qr" role="img" aria-label=${label} dangerouslySetInnerHTML=${{ __html: svg }}></div>`;
}
export function Chip({ tone = '', dot, children, class: cls = '' }) { return html`<span class=${'chip ' + tone + ' ' + cls}>${dot && html`<span class="dot"></span>`}${children}</span>`; }
export function StatusChip({ on, onLabel = 'Actif', offLabel = 'Inactif' }) { return html`<${Chip} tone=${on ? 'ok' : 'off'} dot=${true}>${on ? onLabel : offLabel}</${Chip}>`; }

// ═════════════ Tableau de données ═════════════
/**
 * DataTable : <table> sur bureau (tri, survol, rangées cliquables), liste sur mobile.
 * columns: [{ key, label, render(row), sort(row) → valeur, align: 'r'|'c', class, hideM }]
 */
export function DataTable({ rows, columns, rowKey = (r, i) => i, onRow, mobile, initialSort, dim, empty }) {
  const isM = useMobile();
  const [sort, setSort] = useState(initialSort || null); // { key, dir }
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? x.localeCompare(y, 'fr', { numeric: true }) : (x ?? -Infinity) - (y ?? -Infinity); return sort.dir === 'asc' ? r : -r; });
  }, [rows, sort?.key, sort?.dir]);
  if (!rows.length) return empty || null;
  if (isM && mobile) return html`<div class="list">${sorted.map((r, i) => html`<${Fragment} key=${rowKey(r, i)}>${mobile(r)}</${Fragment}>`)}</div>`;
  const toggle = (c) => { if (!c.sort) return; setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.align === 'r' ? 'desc' : 'asc' })); };
  return html`<div class="table-wrap"><table class="table">
    <thead><tr>${columns.map((c) => html`<th class=${[c.align, c.sort ? 'sort' : '', sort?.key === c.key ? 'on' : '', c.class].filter(Boolean).join(' ')} onClick=${() => toggle(c)} aria-sort=${sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined} scope="col"><span>${c.label}${c.sort && sort?.key === c.key && html`<${Icon} name="down" size=${13} class=${'arr' + (sort.dir === 'asc' ? ' up' : '')} />`}</span></th>`)}</tr></thead>
    <tbody>${sorted.map((r, i) => html`<tr key=${rowKey(r, i)} class=${[onRow ? 'tap' : '', dim?.(r) ? 'dim' : ''].join(' ')} onClick=${onRow ? () => onRow(r) : undefined} tabindex=${onRow ? 0 : undefined} onKeyDown=${onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}>
      ${columns.map((c) => html`<td class=${[c.align, c.class].filter(Boolean).join(' ')}>${c.render ? c.render(r) : r[c.key]}</td>`)}</tr>`)}</tbody>
  </table></div>`;
}

/** Formulaire générique (feuille) à partir d'un schéma de champs */
export function FormSheet({ fields, initial = {}, onSubmit, submitLabel = 'Enregistrer', close, danger, onDelete, deleteLabel = 'Supprimer', intro }) {
  const [vals, setVals] = useState(() => {
    const v = {};
    for (const f of fields) {
      v[f.key] = initial[f.key] ?? f.default ?? (f.type === 'toggle' ? 0 : '');
      // la Bbox renvoie parfois des nombres (ports, ids) : les champs texte travaillent en chaînes
      if (typeof v[f.key] === 'number' && f.type !== 'toggle' && f.type !== 'range') v[f.key] = String(v[f.key]);
    }
    return v;
  });
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const set = (k, x) => { setVals((o) => ({ ...o, [k]: x })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const submit = async (e) => {
    e?.preventDefault();
    const errs = {};
    for (const f of fields) {
      if (f.hidden?.(vals)) continue;
      const x = vals[f.key];
      if (f.required && (x === '' || x === undefined || x === null)) errs[f.key] = 'Champ requis';
      else if (f.validate) { const m = f.validate(x, vals); if (m) errs[f.key] = m; }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await onSubmit(vals); close(true); } catch { /* toast affiché */ } finally { setBusy(false); }
  };
  return html`<form class="sheet-b form" onSubmit=${submit} style="padding-top:6px">
      ${intro && html`<p class="note" style="font-size:13.5px;line-height:1.5">${intro}</p>`}
      ${fields.filter((f) => !f.hidden?.(vals)).map((f) => html`<${FormField} key=${f.key} f=${f} value=${vals[f.key]} set=${(x) => set(f.key, x)} error=${errors[f.key]} vals=${vals} />`)}
      <button type="submit" hidden></button>
    </form>
    <div class="sheet-f">
      ${onDelete && html`<${Btn} kind="danger-ghost" icon="trash" confirm=${{ title: deleteLabel + ' ?', message: 'Cette action est immédiate.', confirm: deleteLabel, tone: 'danger' }} onClick=${async () => { await onDelete(); close(true); }}>${deleteLabel}</${Btn}>`}
      <span class="spacer"></span>
      <button class="btn btn-ghost" type="button" onClick=${() => close(false)}>Annuler</button>
      <button class=${'btn ' + (danger ? 'btn-danger' : 'btn-go')} type="button" disabled=${busy} onClick=${submit}>${busy && html`<span class="spin"></span>`}${submitLabel}</button>
    </div>`;
}
function FormField({ f, value, set, error, vals }) {
  const common = { label: f.label, help: typeof f.help === 'function' ? f.help(vals) : f.help, error };
  switch (f.type) {
    case 'toggle': return html`<div class="check-row" style="box-shadow:none;padding:0;min-height:48px"><div class="grow"><div class="t">${f.label}</div>${f.help && html`<div class="s">${common.help}</div>`}</div><${Switch} checked=${!!Number(value)} onChange=${(x) => set(x ? 1 : 0)} label=${f.label} /></div>`;
    case 'select': return html`<${Field} ...${common}><${Select} value=${value} onChange=${set} options=${typeof f.options === 'function' ? f.options(vals) : f.options} /></${Field}>`;
    case 'seg': return html`<${Field} ...${common}><${Seg} block=${true} value=${value} onChange=${set} options=${f.options} label=${f.label} /></${Field}>`;
    case 'password': return html`<${Field} ...${common}><${PasswordInput} value=${value} onInput=${set} placeholder=${f.placeholder} bad=${!!error} /></${Field}>`;
    case 'days': return html`<${Field} ...${common}><${DaysPicker} value=${value} onChange=${set} /></${Field}>`;
    case 'time': return html`<${Field} ...${common}><${Input} type="time" value=${value} onInput=${set} bad=${!!error} /></${Field}>`;
    case 'range': return html`<${Field} help=${common.help} error=${error}><${Range} label=${f.label} value=${value} onChange=${set} min=${f.min} max=${f.max} step=${f.step} ticks=${f.ticks} format=${f.format} /></${Field}>`;
    case 'device': return html`<${Field} ...${common}><${DevicePicker} value=${value} onChange=${set} mode=${f.mode || 'ip'} /></${Field}>`;
    default: return html`<${Field} ...${common}><${Input} value=${value} onInput=${set} placeholder=${f.placeholder} bad=${!!error} inputmode=${f.inputmode} suffix=${f.suffix} type=${f.type === 'number' ? 'text' : f.type || 'text'} autocapitalize="off" spellcheck="false" /></${Field}>`;
  }
}
export function DaysPicker({ value = '', onChange }) {
  const set = new Set(String(value).split(',').filter(Boolean));
  const tog = (d) => { set.has(d) ? set.delete(d) : set.add(d); onChange(DAYS.map((x) => x.v).filter((x) => set.has(x)).join(',')); };
  return html`<div class="days" role="group">${DAYS.map((d) => html`<button type="button" class=${set.has(d.v) ? 'on' : ''} aria-pressed=${set.has(d.v)} aria-label=${d.l} onClick=${() => tog(d.v)}>${d.s}</button>`)}
    <button type="button" class="wide" onClick=${() => onChange('1,2,3,4,5')}>Semaine</button>
    <button type="button" class="wide" onClick=${() => onChange('1,2,3,4,5,6,0')}>Tous</button></div>`;
}
/** Sélection d'un appareil connu (remplit l'IP ou la MAC) + saisie libre */
export function DevicePicker({ value, onChange, mode = 'ip' }) {
  const { data } = useApi('hosts', { raw: true });
  const hosts = (data?.[0]?.hosts?.list || []).filter((x) => x.ipaddress && x.ipaddress !== '0.0.0.0');
  const opts = [{ v: '', l: 'Choisir un appareil…' }, ...hosts.sort((a, b) => b.active - a.active).map((x) => ({ v: mode === 'mac' ? x.macaddress : x.ipaddress, l: `${displayName(x)} · ${mode === 'mac' ? x.macaddress : x.ipaddress}${x.active ? '' : ' (hors ligne)'}` }))];
  return html`<div class="stack" style="gap:8px"><${Select} value=${opts.some((o) => o.v === value) ? value : ''} onChange=${(v) => v && onChange(v)} options=${opts} /><${Input} value=${value} onInput=${onChange} placeholder=${mode === 'mac' ? 'aa:bb:cc:dd:ee:ff' : '192.168.1.x'} autocapitalize="off" spellcheck="false" /></div>`;
}

export { Fragment, render, useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect };
