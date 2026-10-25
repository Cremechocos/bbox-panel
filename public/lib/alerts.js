// Centre de notifications (cloche) : derniers événements, non lus en premier.
import { html, Empty, useMemo } from '/lib/ui.js';
import { Icon } from '/lib/icons.js';
import { useLive, ackEvents } from '/lib/live.js';
import { eventInfo, ago } from '/lib/events.js';
import { go } from '/lib/router.js';
import { openNotifSettings } from '/lib/notify.js';

export function EventRow({ e, byMac, compact = false, onClick }) {
  const info = eventInfo(e, byMac);
  return html`<div class=${'row' + (onClick ? ' tap' : '')} style=${compact ? 'min-height:52px;padding:8px 16px' : ''} onClick=${onClick}>
    <span class=${'avatar sm ev-ico ' + (info.tone || '')}><${Icon} name=${info.icon} size=${16} /></span>
    <div class="grow"><div class="t ellipsis" style="font-size:14px">${info.title}</div><div class="s ellipsis">${[ago(e.t), info.sub].filter(Boolean).join(' · ')}</div></div>
    ${!e.ack && html`<span class="status-dot warn" aria-label="Non lu"></span>`}
  </div>`;
}

export function AlertsPanel({ close }) {
  const s = useLive();
  const byMac = useMemo(() => new Map((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = useMemo(() => {
    const evs = (s.events || []).filter((e) => !['wifi_restart', 'port_up', 'port_down', 'voip_up'].includes(e.type));
    return [...evs.filter((e) => !e.ack), ...evs.filter((e) => e.ack)].slice(0, 25);
  }, [s.events]);
  const openAll = () => { close(); go('activite'); };
  return html`
    <div class="pop-h"><b>Notifications</b><span class="spacer"></span>${s.unread > 0 && html`<button class="btn btn-plain btn-xs" onClick=${() => ackEvents('all')}>Tout marquer comme lu</button>`}<button class="icon-btn sm" aria-label="Réglages des notifications" data-tip="Réglages" onClick=${() => { close(); openNotifSettings(); }}><${Icon} name="sliders" size=${17} /></button></div>
    <div class="pop-b sheet-b" style="padding:4px 0">${list.length ? html`<div class="list">${list.map((e) => html`<${EventRow} key=${e.id} e=${e} byMac=${byMac} compact=${true} onClick=${openAll} />`)}</div>` : html`<${Empty} icon="bell" title="Rien de nouveau">Les arrivées d’appareils, les coupures et les alertes de la Bbox apparaîtront ici.</${Empty}>`}</div>
    <div class="pop-f"><button class="btn btn-plain btn-sm" onClick=${openAll}>Toute l’activité<${Icon} name="arrowright" size=${16} /></button></div>`;
}
