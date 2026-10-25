// Pauses & contrôle : plages horaires Internet, Wi-Fi et veille de la Bbox.
import { html, PageHead, Card, Seg, Toggle, ToggleRow, Btn, Chip, Empty, act, openSheet, confirmDialog, FormSheet, useApi, useState, Tabs } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { daysLabel, displayName, deviceKind, parseDate, DAYS } from '/lib/format.js';

export const KINDS = {
  internet: { label: 'Internet', path: 'parentalcontrol/scheduler', enablePath: 'parentalcontrol', root: 'parentalcontrol', icon: 'globe',
    desc: 'Coupe l’accès à Internet des appareils choisis pendant les plages définies (devoirs, repas, nuit…).', verb: 'Internet coupé' },
  wifi: { label: 'Wi-Fi', path: 'wireless/scheduler', enablePath: 'wireless/scheduler', root: 'wireless', icon: 'wifi',
    desc: 'Éteint complètement le Wi-Fi de la Bbox pendant les plages définies. Les appareils en Ethernet restent connectés.', verb: 'Wi-Fi éteint' },
  hibernate: { label: 'Veille Bbox', path: 'hibernate/scheduler', enablePath: 'hibernate/scheduler', root: 'hibernate', icon: 'moon',
    desc: 'Met la Bbox en veille (Internet, Wi-Fi et téléphone coupés) pour économiser l’énergie, par exemple la nuit ou pendant les vacances.', verb: 'Bbox en veille' },
};
const hm = (s) => String(s || '').slice(0, 5);
export function ruleTimes(r) {
  if (r.intervals) { const [a, b] = String(r.intervals).split(','); return [hm(a), hm(b)]; }
  const f = (v) => (typeof v === 'number' ? `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}` : hm(v));
  return [f(r.start), f(r.end)];
}

export default function Control() {
  const [tab, setTab] = useState('internet');
  return html`
    <${PageHead} kicker="Plages horaires" title="Pauses & contrôle" sub="Programmez des pauses Internet, l’extinction du Wi-Fi ou la veille de la Bbox." />
    <${Tabs} tabs=${Object.entries(KINDS).map(([v, k]) => ({ v, l: k.label }))} value=${tab} onChange=${setTab} label="Type de pause" />
    <div class="grid">
      <${SchedulerCard} key=${tab} kind=${tab} class=${tab === 'internet' ? 's7' : 's12'} />
      ${tab === 'internet' && html`<${InternetDevices} class="s5" />`}
    </div>`;
}

export function SchedulerCard({ kind, class: cls }) {
  const K = KINDS[kind] || kind;
  const { data, reload } = useApi(K.path, { poll: 30000 });
  const sch = data?.[K.root]?.scheduler;
  const rules = (sch?.savedRules?.length ? sch.savedRules : sch?.rules) || [];
  const until = parseDate(sch?.statusuntil);
  const on = sch?.enable === 1;
  const edit = (rule) => openSheet(FormSheet, {
    fields: [
      { key: 'name', label: 'Nom de la plage', required: true, placeholder: 'Ex. Nuit, Devoirs…', validate: (v) => (v.length > 32 ? '32 caractères maximum' : /[<>;&"]/.test(v) ? 'Caractères interdits' : rules.some((r) => r.name === v && r.id !== rule?.id) ? 'Ce nom existe déjà' : null) },
      { key: 'days', label: 'Jours', type: 'days', required: true },
      { key: 'start', label: 'Début', type: 'time', required: true },
      { key: 'end', label: 'Fin', type: 'time', required: true, validate: (v, all) => (v === all.start ? 'La fin doit différer du début' : null), help: (all) => (all.end && all.start && all.end < all.start ? 'La plage se termine le lendemain.' : '') },
    ],
    initial: rule ? { name: rule.name, days: String(rule.occurency ?? rule.days ?? ''), start: ruleTimes(rule)[0], end: ruleTimes(rule)[1] } : { days: '1,2,3,4,5', start: '22:00', end: '07:00' },
    submitLabel: rule ? 'Enregistrer' : 'Ajouter',
    onDelete: rule ? () => act(() => api.del(`${K.path}/rule/${rule.id}`), { ok: 'Plage supprimée' }).then(reload) : undefined,
    onSubmit: async (v) => {
      const body = { name: v.name.trim(), occurency: v.days, intervals: `${v.start},${v.end}` };
      await act(() => (rule ? api.put(`${K.path}/rule/${rule.id}`, body) : api.post(`${K.path}/rule`, { ...body, enable: 1 })), { ok: rule ? 'Plage modifiée' : 'Plage ajoutée' });
      reload();
    },
  }, { title: rule ? 'Modifier la plage' : 'Nouvelle plage · ' + K.label });

  return html`<${Card} class=${cls} title=${'Pauses ' + K.label} icon=${K.icon} action=${sch && html`<${Toggle} value=${on} label=${'Pauses ' + K.label}
      confirm=${kind === 'hibernate' ? (nv) => (nv ? { title: 'Activer la veille programmée ?', message: 'Pendant les plages, Internet, le Wi-Fi et le téléphone seront coupés, y compris l’accès à ce panel.', confirm: 'Activer', tone: 'warn' } : null) : undefined}
      onChange=${(nv) => act(() => api.put(K.enablePath, { enable: nv ? 1 : 0 }), { ok: nv ? 'Programmation activée' : 'Programmation désactivée' }).then(() => { reload(); refresh('statics'); })} />`}>
    <p class="desc" style="margin-bottom:12px;max-width:62ch">${K.desc}</p>
    ${until && sch.statusremaining > 0 && html`<div class="banner" style="margin-bottom:12px"><${Icon} name="clock" size=${18} /><span><b>${K.verb}</b> jusqu’à ${until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span></div>`}
    ${!data ? html`<div class="skel" style="height:120px"></div>` : html`
      <div class="list">${rules.length ? rules.map((r) => { const [a, b] = ruleTimes(r); return html`<div class="row tap" onClick=${(e) => !e.target.closest('.switch') && edit(r)}>
        <span class="avatar sm" style="background:var(--brand-soft);color:var(--brand-ink)"><${Icon} name="clock" size=${18} /></span>
        <div class="grow"><div class="t ellipsis">${r.name || 'Plage'}</div><div class="s">${daysLabel(r.occurency ?? r.days)} · <span class="num">${a} → ${b}</span></div></div>
        <${Toggle} value=${r.enable !== 0} label=${r.name} onChange=${(nv) => act(() => api.put(`${K.path}/rule/${r.id}`, { enable: nv ? 1 : 0 }), { ok: nv ? 'Plage activée' : 'Plage désactivée' }).then(reload)} />
      </div>`; }) : html`<${Empty} icon="clock" title="Aucune plage programmée">Ajoutez une plage pour automatiser les pauses.</${Empty}>`}</div>
      <${Week} rules=${rules} />
      <button class="btn btn-ghost btn-sm" style="margin-top:12px" onClick=${() => edit(null)}><${Icon} name="plus" size=${16} />Ajouter une plage</button>
      ${!on && rules.length > 0 && html`<p class="note" style="margin-top:10px">La programmation est désactivée : les plages ne s’appliquent pas.</p>`}`}
  </${Card}>`;
}

// Frise hebdomadaire des plages (lecture rapide)
function Week({ rules }) {
  const enabled = rules.filter((r) => r.enable !== 0);
  if (!enabled.length) return null;
  const toMin = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const rows = DAYS.map((d) => {
    const segs = [];
    for (const r of enabled) {
      const days = String(r.occurency ?? r.days ?? '').split(',');
      const [a, b] = ruleTimes(r).map(toMin);
      if (days.includes(d.v)) { if (b > a) segs.push([a, b]); else { segs.push([a, 1440]); } }
      const prevDay = DAYS[(DAYS.findIndex((x) => x.v === d.v) + 6) % 7].v;
      if (days.includes(prevDay) && b < a) segs.push([0, b]);
    }
    return { d, segs };
  });
  return html`<div style="margin-top:14px;display:grid;gap:5px" aria-label="Aperçu de la semaine">
    ${rows.map(({ d, segs }) => html`<div style="display:grid;grid-template-columns:22px 1fr;align-items:center;gap:8px"><span class="note" style="font-weight:600">${d.s}</span>
      <div style="position:relative;height:10px;border-radius:99px;background:var(--well);overflow:hidden">${segs.map(([a, b]) => html`<i style=${`position:absolute;top:0;bottom:0;left:${(a / 1440) * 100}%;width:${((b - a) / 1440) * 100}%;background:var(--brand);border-radius:99px`}></i>`)}</div></div>`)}
    <div style="display:grid;grid-template-columns:22px 1fr;gap:8px"><span></span><div class="hstack note num" style="justify-content:space-between;font-size:11px"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div></div>
  </div>`;
}

function InternetDevices({ class: cls }) {
  const s = useLive();
  const { data, reload } = useApi('parentalcontrol');
  const policy = data?.parentalcontrol?.scheduler?.defaultpolicy;
  const hosts = (s.hosts || []).filter((h) => h.devicetype !== 'STB' && !/repeater/i.test(h.devicetype || '')).sort((a, b) => (b.parentalcontrol?.enable || 0) - (a.parentalcontrol?.enable || 0) || b.active - a.active);
  return html`<${Card} class=${cls} flush=${true} title="Appareils concernés" icon="devices">
    <div style="padding:0 20px"><${ToggleRow} title="Inclure les nouveaux appareils" sub="Tout nouvel appareil est soumis aux pauses Internet" value=${policy === 'Forbidden'}
      onChange=${(nv) => act(() => api.put('parentalcontrol', { defaultpolicy: nv ? 'Forbidden' : 'Accept' }), { ok: 'Préférence enregistrée' }).then(reload)} /></div>
    <div class="list" style="max-height:520px;overflow:auto">${hosts.map((h) => html`<div class="row">
      <span class="avatar sm"><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${18} /><span class=${'dot' + (h.active ? ' on' : '')}></span></span>
      <div class="grow"><div class="t ellipsis">${displayName(h)}</div><div class="s">${h.parentalcontrol?.status === 'Forbidden' ? 'en pause actuellement' : h.ipaddress}</div></div>
      ${h.parentalcontrol?.status === 'Forbidden' && html`<${Btn} kind="soft" size="sm" onClick=${() => act(() => api.post('parentalcontrol/unblock', { macaddress: h.macaddress, hour: 1, minute: 0 }), { ok: 'Débloqué pour 1 heure' }).then(() => refresh('hosts'))}>+1 h</${Btn}>`}
      <${Toggle} value=${h.parentalcontrol?.enable === 1} label=${displayName(h)} onChange=${(nv) => act(() => api.put('parentalcontrol/hosts', { enable: nv ? 1 : 0, macaddress: h.macaddress }), { ok: nv ? 'Ajouté aux pauses' : 'Retiré des pauses' }).then(() => refresh('hosts'))} />
    </div>`)}</div>
  </${Card}>`;
}
