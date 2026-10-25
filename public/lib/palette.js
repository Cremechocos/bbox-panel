// Palette de commandes (⌘K / Ctrl+K / « / ») : pages, appareils, actions rapides, apparences.
import { html, openLayer, anim, useState, useEffect, useRef, useMemo, useLayoutEffect } from '/lib/ui.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { ROUTES, EXTRA } from '/lib/routes.js';
import { live } from '/lib/live.js';
import { ACTIONS } from '/lib/prefs.js';
import { SKINS, setSkin } from '/lib/theme.js';
import { go } from '/lib/router.js';
import { openNotifSettings } from '/lib/notify.js';
import { displayName, deviceKind } from '/lib/format.js';

const norm = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function score(text, q) {
  if (!q) return 1;
  const t = norm(text);
  if (t.startsWith(q)) return 3;
  if (t.includes(' ' + q)) return 2.5;
  if (t.includes(q)) return 2;
  // sous-séquence (ex. « wfi » → « Wi-Fi ») : seulement si la 1re lettre ouvre un mot
  if (!(t.startsWith(q[0]) || t.includes(' ' + q[0]) || t.includes('-' + q[0]))) return 0;
  let i = 0; for (const c of t) if (c === q[i]) i++;
  return i === q.length ? 1 : 0;
}
function mark(text, q) {
  if (!q) return text;
  const i = norm(text).indexOf(q);
  if (i < 0) return text;
  return html`${text.slice(0, i)}<mark>${text.slice(i, i + q.length)}</mark>${text.slice(i + q.length)}`;
}

let open = false;
export function openPalette() {
  if (open) return;
  open = true;
  openLayer(Palette).finally(() => { open = false; });
}

function Palette({ close }) {
  const [q, setQ] = useState('');
  const [i, setI] = useState(0);
  const ov = useRef(null), box = useRef(null), input = useRef(null), list = useRef(null);
  const nq = norm(q.trim());
  const groups = useMemo(() => {
    const pages = [...ROUTES, EXTRA[0], EXTRA[2], EXTRA[3]].map((r) => ({ key: 'p' + r.id, label: r.label, icon: r.icon, hint: 'Page', run: () => go(r.id), s: score(r.label, nq) }));
    const devs = (live.hosts || []).map((h) => ({ key: 'd' + h.id, label: displayName(h), icon: KIND_ICON[deviceKind(h)], hint: h.active ? h.ipaddress : 'hors ligne', run: () => go('appareils', String(h.id)), s: ((b) => (b > 0 ? b + (h.active ? 0.1 : 0) : 0))(Math.max(score(displayName(h), nq), nq.length > 2 ? score(h.ipaddress, nq) * 0.9 : 0, nq.length > 3 ? score(h.macaddress, nq) * 0.8 : 0)) }));
    const acts = [...ACTIONS, { id: 'notifs', label: 'Réglages des notifications', icon: 'bell', run: () => openNotifSettings() }].map((a) => ({ key: 'a' + a.id, label: a.label, icon: a.icon, hint: 'Action', run: a.run, s: score(a.label, nq) }));
    const skins = SKINS.map((s) => ({ key: 's' + s.id, label: `Apparence : ${s.name}`, icon: 'palette', hint: s.desc.split(',')[0], run: () => setSkin(s.id), s: score('apparence ' + s.name, nq) || score(s.name, nq) }));
    const pick = (arr, n) => arr.filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, n);
    return [
      ['Pages', pick(pages, nq ? 6 : 5)],
      ['Appareils', pick(devs, nq ? 6 : 4)],
      ['Actions', pick(acts, nq ? 6 : 5)],
      ['Apparence', nq ? pick(skins, 4) : []],
    ].filter(([, items]) => items.length);
  }, [nq]);
  const flat = groups.flatMap(([, items]) => items);
  useEffect(() => setI(0), [nq]);
  useLayoutEffect(() => {
    anim(ov.current, { opacity: [0, 1] }, { duration: 0.18 });
    anim(box.current, { opacity: [0, 1], transform: ['translateX(-50%) scale(.98) translateY(-6px)', 'translateX(-50%) scale(1) translateY(0)'] }, { type: 'spring', stiffness: 600, damping: 40 });
    input.current?.focus();
  }, []);
  useEffect(() => { list.current?.querySelector('.pal-item.on')?.scrollIntoView({ block: 'nearest' }); }, [i]);
  const run = async (item) => {
    if (!item) return;
    await anim(box.current, { opacity: 0, transform: 'translateX(-50%) scale(.985)' }, { duration: 0.12 }).finished;
    close();
    setTimeout(() => item.run(), 10);
  };
  const key = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setI((x) => Math.min(flat.length - 1, x + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setI((x) => Math.max(0, x - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); run(flat[i]); }
  };
  let n = -1;
  return html`
    <div class="overlay top" ref=${ov} onClick=${() => close()}></div>
    <div class="palette" ref=${box} role="dialog" aria-modal="true" aria-label="Palette de commandes">
      <div class="pal-in"><${Icon} name="search" size=${20} />
        <input ref=${input} value=${q} onInput=${(e) => setQ(e.target.value)} onKeyDown=${key} placeholder="Rechercher une page, un appareil, une action…" aria-label="Rechercher" autocomplete="off" spellcheck="false" />
        <kbd>esc</kbd></div>
      <div class="pal-list" ref=${list} role="listbox">
        ${flat.length ? groups.map(([g, items]) => html`<div class="pal-group">${g}</div>${items.map((it) => { n++; const idx = n; return html`<button type="button" role="option" aria-selected=${idx === i} class=${'pal-item' + (idx === i ? ' on' : '')} onMouseMove=${() => idx !== i && setI(idx)} onClick=${() => run(it)}><${Icon} name=${it.icon} size=${18} /><span class="ellipsis">${mark(it.label, nq)}</span><span class="hint">${it.hint}</span></button>`; })}`)
          : html`<div class="pal-empty">Aucun résultat pour « ${q} »</div>`}
      </div>
      <div class="pal-foot hide-m"><span><kbd>↑</kbd><kbd>↓</kbd> naviguer</span><span><kbd>↵</kbd> ouvrir</span><span><kbd>esc</kbd> fermer</span></div>
    </div>`;
}
