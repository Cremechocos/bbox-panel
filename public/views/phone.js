// Téléphonie : état de la ligne, appel depuis le navigateur, journal, tests, « ne pas déranger ».
import { html, PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Empty, act, openSheet, confirmDialog, FormSheet, useApi, useState, Field, Input, toast } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { Icon } from '/lib/icons.js';
import { dateTime, relative } from '/lib/format.js';
import { SchedulerCard } from '/views/control.js';

const fmtNum = (uri = '') => { const n = String(uri).split('@')[0].replace(/^\+33/, '0'); return n.replace(/(.{2})(?=.)/g, '$1 '); };
const cleanNum = (v) => String(v || '').replace(/[\s.\-()]/g, '');
const VOIP_KIND = { label: 'Téléphone', path: 'voip/scheduler', enablePath: 'voip/scheduler', root: 'voip', icon: 'phone', desc: 'Le téléphone ne sonne pas pendant les plages définies, sauf pour les numéros autorisés ci-dessous.', verb: 'Ne pas déranger' };

export default function Phone() {
  const { data, reload } = useApi(['voip', 'voip/diag', 'voip/scheduler', 'voip/scheduler/number'], { poll: 15000 });
  const [v, diag, sch, nums] = data;
  const lines = v?.voip || [];
  return html`
    <${PageHead} kicker="Ligne fixe" title="Téléphonie" sub=${lines.length ? `${lines.length} ligne(s) · ${lines.filter((l) => l.status === 'Up').length} active(s)` : '…'} />
    <div class="grid">
      ${lines.map((l) => html`<${LineCard} key=${l.id} l=${l} diag=${diag?.phy_interface?.[l.id - 1]} reload=${reload} />`)}
      ${!v && html`<div class="card s6" data-enter><div class="skel" style="height:220px"></div></div>`}
      ${lines[0] && html`<${CallCard} class="s6" line=${lines[0]} />`}
      ${lines[0] && html`<${CallLog} class="s12" line=${lines[0].id} />`}
      <${SchedulerCard} kind=${VOIP_KIND} class="s7" />
      <${Card} class="s5" flush=${true} title="Numéros autorisés" icon="check" action=${html`<button class="link" onClick=${() => openSheet(FormSheet, { fields: [{ key: 'number', label: 'Numéro', required: true, inputmode: 'tel', validate: (x) => (/^\+?\d{4,15}$/.test(cleanNum(x)) ? null : 'Numéro invalide') }], onSubmit: async (x) => { await act(() => api.post('voip/scheduler/number', { number: cleanNum(x.number) }), { ok: 'Numéro autorisé' }); reload(); } }, { title: 'Autoriser un numéro' })}><${Icon} name="plus" size=${16} />Ajouter</button>`}>
        <div style="padding:0 20px">${sch?.voip?.scheduler && html`<${ToggleRow} title="Laisser passer les appels insistants" sub="3 appels du même numéro en 5 minutes sonnent quand même" value=${sch.voip.scheduler.unblock === 1} onChange=${(nv) => act(() => api.put('voip/scheduler', { unblock: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reload)} />`}</div>
        <div class="list">${(nums?.voip?.scheduler || []).length ? nums.voip.scheduler.map((n) => html`<div class="row"><span class="grow num">${fmtNum(n.number)}</span><button class="icon-btn" aria-label="Retirer" onClick=${async () => { if (await confirmDialog({ title: 'Retirer ce numéro ?', confirm: 'Retirer', tone: 'danger' })) { await act(() => api.del('voip/scheduler/number/' + n.id), { ok: 'Numéro retiré' }); reload(); } }}><${Icon} name="trash" size=${18} /></button></div>`)
          : html`<${Empty} icon="phone" title="Aucun numéro autorisé" />`}</div>
      </${Card}>
    </div>`;
}

function LineCard({ l, diag, reload }) {
  const [test, setTest] = useState(null);
  const run = async (kind) => {
    setTest(kind);
    try {
      await act(() => api.post(`voip/${kind}test/${l.id}`, { ring_timeout: 30 }), { ok: kind === 'ring' ? 'Le téléphone va sonner' : 'Décrochez : vous allez entendre votre voix' });
      setTimeout(() => { setTest(null); reload(); }, 20000);
    } catch { setTest(null); }
  };
  return html`<${Card} class="s6" title=${'Ligne ' + l.id} icon="phone" action=${html`<${Chip} tone=${l.status === 'Up' ? 'ok' : 'danger'} dot=${true}>${l.status === 'Up' ? 'En service' : 'Hors service'}</${Chip}>`}>
    <div style="font-size:26px;font-weight:600;letter-spacing:.01em" class="num">${fmtNum(l.uri)}</div>
    <p class="note" style="margin-bottom:12px">${l.uri ? String(l.uri).split('@')[1] || '' : ''}</p>
    <div class="tiles" style="margin-bottom:14px">
      <div class="tile"><div class="l">État</div><div class="v">${l.callstate === 'Idle' ? 'Au repos' : l.callstate === 'InCall' || /call/i.test(l.callstate) ? 'En appel' : l.callstate}</div></div>
      <div class="tile"><div class="l">Combiné</div><div class="v">${l.handsetplugged ? 'Branché' : 'Débranché'}</div></div>
      <div class="tile"><div class="l">Appels manqués</div><div class="v num">${l.notanswered || 0}</div></div>
    </div>
    <div class="list">
      <${ToggleRow} title="Bloquer les appels masqués" sub="Refuse les appelants qui cachent leur numéro" value=${l.blockstate === 1} onChange=${(nv) => act(() => api.put('voip/blockanon/' + l.id, { block: nv ? 1 : 0 }), { ok: nv ? 'Appels masqués bloqués' : 'Appels masqués acceptés' }).then(reload)} />
      <${ToggleRow} title="Masquer mon numéro" sub="Vos correspondants ne voient pas votre numéro" value=${l.anoncallstate === 1} onChange=${(nv) => act(() => api.put('voip/anoncall', { anoncallenb: nv ? 1 : 0 }), { ok: nv ? 'Numéro masqué' : 'Numéro visible' }).then(reload)} />
    </div>
    <div class="hstack" style="margin-top:14px">
      <${Btn} kind="soft" size="sm" icon="bolt" disabled=${!!test || !l.handsetplugged} onClick=${() => run('ring')}>${test === 'ring' ? 'Sonnerie…' : 'Faire sonner'}</${Btn}>
      <${Btn} kind="soft" size="sm" icon="activity" disabled=${!!test || !l.handsetplugged} onClick=${() => run('echo')}>${test === 'echo' ? 'Test en cours…' : 'Test d’écho'}</${Btn}>
      ${diag && html`<span class="note">Dernier test : ${({ Idle: 'aucun', Success: 'réussi', Failed: 'échec', Running: 'en cours' })[diag.ring_test?.status] || diag.ring_test?.status || '—'}</span>`}
    </div>
  </${Card}>`;
}

function CallCard({ class: cls, line }) {
  const [num, setNum] = useState('');
  const [calling, setCalling] = useState(false);
  const ok = /^\+?\d{2,15}$/.test(cleanNum(num));
  const call = async () => {
    await act(() => api.put('voip/dial', { line: line.id, number: cleanNum(num) }), { ok: 'Décrochez votre téléphone fixe : l’appel va être composé' });
    setCalling(true); setTimeout(() => setCalling(false), 30000);
  };
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
  return html`<${Card} class=${cls} title="Appeler depuis le panel" icon="phone">
    <p class="desc" style="margin-bottom:12px">Fonction cachée de la Bbox : votre téléphone fixe sonne, décrochez et l’appel est composé automatiquement.</p>
    <${Field} label="Numéro"><${Input} value=${num} onInput=${setNum} type="tel" inputmode="tel" placeholder="01 23 45 67 89" /></${Field}>
    <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:12px 0;max-width:320px">${keys.map((k) => html`<button class="btn btn-soft" style="min-height:48px;font-size:18px" onClick=${() => setNum((n) => n + k)}>${k}</button>`)}</div>
    <div class="hstack">
      <${Btn} kind="go" icon="phone" disabled=${!ok || calling || line.status !== 'Up'} onClick=${call}>Appeler</${Btn}>
      ${calling && html`<${Btn} kind="ghost" onClick=${() => act(() => api.del('voip/dial/' + line.id), { ok: 'Appel annulé' }).then(() => setCalling(false))}>Annuler</${Btn}>`}
      <button class="icon-btn" aria-label="Effacer" onClick=${() => setNum((n) => n.slice(0, -1))}><${Icon} name="back" size=${18} /></button>
    </div>
  </${Card}>`;
}

function CallLog({ class: cls, line }) {
  const { data, reload } = useApi('voip/fullcalllog/' + line, { poll: 30000 });
  const log = (data?.calllog || []).slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const typeOf = (c) => { const t = String(c.type || c.direction || '').toLowerCase(); if (/miss|manq|not/.test(t) || c.answered === 0) return ['Manqué', 'danger', 'down']; if (/out|sort|emis/.test(t)) return ['Sortant', '', 'up']; return ['Entrant', 'ok', 'down']; };
  return html`<${Card} class=${cls} flush=${true} title=${`Journal d’appels · ${log.length}`} icon="clock">
    <div class="list" style="max-height:460px;overflow:auto">${log.length ? log.map((c) => { const [l, tone, ic] = typeOf(c); return html`<div class="row">
      <span class=${'avatar sm'} style=${tone === 'danger' ? 'background:var(--danger-soft);color:var(--danger)' : ''}><${Icon} name=${ic} size=${16} /></span>
      <div class="grow"><div class="t num">${fmtNum(c.number) || 'Numéro masqué'}</div><div class="s">${l} · ${dateTime(c.date)}${c.duree || c.duration ? ' · ' + Math.round((c.duree || c.duration) / 60) + ' min' : ''}</div></div>
      <button class="icon-btn" aria-label="Supprimer" onClick=${() => act(() => api.del('voip/calllog/' + c.id), { ok: 'Appel supprimé' }).then(reload)}><${Icon} name="trash" size=${18} /></button>
    </div>`; }) : html`<${Empty} icon="phone" title="Aucun appel">Le journal de la ligne est vide.</${Empty}>`}</div>
  </${Card}>`;
}
