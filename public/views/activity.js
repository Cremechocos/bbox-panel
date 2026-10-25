// Activité : présence des appareils (frise 24 h), alertes et journal unifié (Bbox + serveur du panel).
import { html, PageHead, Card, Tabs, Btn, Empty, Skeleton, useFetch, useState, useMemo } from '/lib/ui.js';
import { panel } from '/lib/api.js';
import { useLive, ackEvents } from '/lib/live.js';
import { PresenceTimeline } from '/lib/chart.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { eventInfo, evDay, evTime } from '/lib/events.js';
import { displayName, deviceKind } from '/lib/format.js';
import { openDevice } from '/views/devices.js';

const DAY = 86400e3;
const fmtDur = (ms) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const NOISE = new Set(['wifi_restart', 'port_up', 'port_down']);

export default function Activity() {
  const s = useLive();
  const [tab, setTab] = useState('all');
  const [older, setOlder] = useState([]);
  const [more, setMore] = useState(true);
  const byMac = useMemo(() => new Map((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const presence = useFetch(() => panel.events({ since: Date.now() - DAY, types: 'arrive,leave', limit: 2000 }), [], { poll: 60000 });

  const all = useMemo(() => {
    const m = new Map();
    for (const e of [...(s.events || []), ...older]) if (!m.has(e.id)) m.set(e.id, e);
    return [...m.values()].filter((e) => !NOISE.has(e.type)).sort((a, b) => b.t - a.t);
  }, [s.events, older]);
  const withInfo = useMemo(() => all.map((e) => ({ e, i: eventInfo(e, byMac) })), [all, byMac]);
  const filtered = withInfo.filter(({ e, i }) => tab === 'all' || (tab === 'alerts' && (i.cat === 'alert' || e.level !== 'info')) || (tab === 'presence' && i.cat === 'presence') || (tab === 'system' && (i.cat === 'system' || i.cat === 'action')));
  const counts = { alerts: withInfo.filter(({ e, i }) => i.cat === 'alert' || e.level !== 'info').length, presence: withInfo.filter(({ i }) => i.cat === 'presence').length };
  const loadMore = async () => {
    const oldest = all[all.length - 1];
    const r = await panel.events({ before: oldest ? oldest.t : Date.now(), limit: 200 }).catch(() => null);
    if (!r?.events?.length) { setMore(false); return; }
    setOlder((o) => [...o, ...r.events]);
  };
  // groupement par jour
  const groups = [];
  for (const it of filtered) { const d = evDay(it.e.t); if (!groups.length || groups[groups.length - 1][0] !== d) groups.push([d, []]); groups[groups.length - 1][1].push(it); }

  return html`
    <${PageHead} kicker="Vue d’ensemble" title="Activité" sub=${s.unread ? `${s.unread} notification${s.unread > 1 ? 's' : ''} non lue${s.unread > 1 ? 's' : ''}` : 'Tout est lu'}
      actions=${s.unread > 0 && html`<${Btn} kind="soft" size="sm" icon="check" onClick=${() => ackEvents('all')}>Tout marquer comme lu</${Btn}>`} />
    <div class="grid">
      <${Card} class="s12" title="Présence sur 24 heures" icon="user" sub="arrivées et départs des appareils">
        <${Presence} data=${presence.data} loading=${presence.loading} s=${s} byMac=${byMac} />
      </${Card}>
      <div class="s12" data-enter>
        <${Tabs} value=${tab} onChange=${setTab} label="Filtrer l’activité" tabs=${[{ v: 'all', l: 'Tout' }, { v: 'alerts', l: 'Alertes', n: counts.alerts || null }, { v: 'presence', l: 'Présence', n: counts.presence || null }, { v: 'system', l: 'Système' }]} />
        ${!groups.length ? html`<div class="card"><${Empty} icon="bell" title="Rien à afficher">Aucun événement dans cette catégorie pour le moment.</${Empty}></div>`
          : groups.map(([day, items]) => html`<div class="section-title" style="margin-top:18px">${day}</div>
            <div class="card flush"><div class="list">${items.map(({ e, i }) => html`<div class=${'row' + (e.mac && byMac.get(e.mac) ? ' tap' : '')} onClick=${() => { const h = e.mac && byMac.get(e.mac); if (h) openDevice(h); }}>
              <span class="num note" style="width:44px;flex:none">${evTime(e.t)}</span>
              <span class=${'avatar sm ev-ico ' + (i.tone || '')}><${Icon} name=${i.icon} size=${16} /></span>
              <div class="grow"><div class="t ellipsis" style="font-size:14px">${i.title}</div>${i.sub && html`<div class="s ellipsis">${i.sub}</div>`}</div>
              ${e.source === 'panel' && html`<span class="chip hide-m">panel</span>`}
              ${!e.ack && html`<span class="status-dot warn" aria-label="Non lu"></span>`}
            </div>`)}</div></div>`)}
        ${groups.length > 0 && more && html`<div style="display:flex;justify-content:center;margin-top:16px"><${Btn} kind="ghost" size="sm" onClick=${loadMore}>Afficher les événements plus anciens</${Btn}></div>`}
      </div>
    </div>`;
}

function Presence({ data, loading, s, byMac }) {
  const to = Date.now(), from = to - DAY;
  const rows = useMemo(() => {
    if (!data) return [];
    const evs = [...(data.events || [])].sort((a, b) => a.t - b.t);
    const per = new Map();
    for (const e of evs) { if (!e.mac) continue; if (!per.has(e.mac)) per.set(e.mac, []); per.get(e.mac).push(e); }
    for (const h of s.hosts || []) { const m = String(h.macaddress).toLowerCase(); if (h.active && !per.has(m)) per.set(m, []); }
    const out = [];
    for (const [mac, list] of per) {
      const h = byMac.get(mac);
      const segs = []; let start = null;
      if (list.length && list[0].type === 'leave') start = from;
      for (const e of list) {
        if (e.type === 'arrive') { if (start == null) start = e.t; }
        else if (e.type === 'leave') { segs.push([start ?? from, e.t]); start = null; }
      }
      if (h?.active) { if (start != null) segs.push([start, to, true]); else if (!list.length) segs.push([from, to, true]); else segs.push([Math.max(list[list.length - 1].t, to - 60000), to, true]); }
      else if (start != null) segs.push([start, to]);
      const total = segs.reduce((x, [a, b]) => x + (b - a), 0);
      if (!total) continue;
      const name = h ? displayName(h) : list.find((e) => e.name)?.name || mac;
      out.push({ id: mac, h, name, icon: html`<${Icon} name=${h ? KIND_ICON[deviceKind(h)] : 'devices'} size=${16} />`, segs, total, label: fmtDur(total), title: `${name} : connecté ${fmtDur(total)} sur 24 h` });
    }
    return out.sort((a, b) => (b.h?.active ? 1 : 0) - (a.h?.active ? 1 : 0) || b.total - a.total).slice(0, 14);
  }, [data, s.hosts]);
  if (loading && !data) return html`<div class="stack">${[1, 2, 3, 4].map(() => html`<${Skeleton} h=${18} />`)}</div>`;
  if (!rows.length) return html`<${Empty} icon="user" title="Pas encore de données de présence">Les connexions et déconnexions des appareils s’afficheront ici au fil de la journée.</${Empty}>`;
  return html`<${PresenceTimeline} rows=${rows} from=${from} to=${to} right="durée" />
    <p class="note" style="margin-top:12px">D’après le journal de la Bbox et le relevé en direct du serveur du panel. En vert : connecté en ce moment.</p>`;
}
