// Accueil — vue d'ensemble en direct : indicateurs, Internet (latence & débit), favoris, Wi-Fi, appareils, santé, activité.
import { html, Card, KV, PageHead, Toggle, Seg, Skeleton, Empty, Btn, act, openSheet, useFetch, useMemo, useState, useEffect } from '/lib/ui.js';
import { api, panel } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { LiveChart, HistoryChart, CountUp, Gauge, SignalBars, Sparkline, Donut, MiniBars } from '/lib/chart.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { kbps, bytes, duration, deviceKind, displayName, bandLabel, signal, bestRssi, num } from '/lib/format.js';
import { usePrefs, actionOf, pauseOf, untilLabel, guestTimer, pauseDevice, resumeDevice } from '/lib/prefs.js';
import { PauseSheet, GuestSheet, FavoritesSheet } from '/lib/sheets.js';
import { EventRow } from '/lib/alerts.js';
import { openDevice } from '/views/devices.js';

const fmtK = (v) => kbps(v);
const fmtMs = (v) => (v == null ? '—' : (v < 10 ? num(v, 1) : num(v)) + ' ms');
const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'; };
const avg = (a) => { const v = a.filter((x) => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const isEth = (h) => /Ethernet/i.test(h.link || '');

export default function Home() {
  const s = useLive();
  const p = usePrefs();
  const week = useFetch(() => panel.usage(7), [], { poll: 300000 });
  if (!s.ready) return html`<${PageHead} kicker=${hello()} title="Accueil" />
    <div class="kpis">${[1, 2, 3, 4, 5].map(() => html`<div class="kpi" data-enter><${Skeleton} h=${12} w="50%" /><${Skeleton} h=${26} w="70%" style="margin-top:12px" /></div>`)}</div>
    <div class="grid"><div class="card s8" data-enter><${Skeleton} h=${260} /></div><div class="card s4" data-enter><${Skeleton} h=${260} /></div></div>`;
  const dev = s.device?.device || {}, wan = s.wanIp?.wan || {}, sum = s.summary || {};
  const internetOk = (sum.internet?.state ?? wan.internet?.state) === 2 && !s.latency?.down;
  const degraded = internetOk && ((s.latency?.loss || 0) >= 10 || (s.latency?.internet || 0) > 120);
  const active = s.hosts.filter((x) => x.active);
  const guestsOn = (s.guestHosts || []).filter((x) => x.active).length;
  const lat = s.latency?.internet;
  const latAvg = avg(s.series.latency.slice(-30).map((x) => x.v));
  const alerts = sum.alerts?.count || 0;
  const favDevices = p.favorites.devices.map((m) => s.hosts.find((x) => String(x.macaddress).toLowerCase() === m)).filter(Boolean);
  const favActions = p.favorites.actions.map(actionOf).filter(Boolean);
  const title = !internetOk ? 'Internet est coupé' : degraded ? 'Connexion ralentie' : 'Tout fonctionne';

  return html`
    <${PageHead} kicker=${hello()} title=${title}
      sub=${`${dev.modelname || 'Bbox'} · firmware ${dev.main?.version || '…'} · allumée depuis ${duration(dev.uptime)}`}
      actions=${html`<span class=${'pill-status show-m' + (internetOk ? '' : ' bad')}><span class="pulse"></span>${internetOk ? 'Internet connecté' : 'Internet coupé'}</span>`} />
    ${alerts > 0 && html`<a class="banner" href="#/diagnostic" data-enter><${Icon} name="alert" size=${18} /><span><b>${alerts} alerte${alerts > 1 ? 's' : ''}</b> signalée${alerts > 1 ? 's' : ''} par la Bbox. Voir le diagnostic.</span></a>`}

    <div class="kpis">
      <a class="kpi" href="#/stats" data-enter>
        <div class="l"><${Icon} name="globe" size=${15} />Latence Internet</div>
        <div class="v">${lat == null ? '—' : html`<${CountUp} value=${lat} format=${(v) => (v < 10 ? num(v, 1) : num(v))} />`}<small>ms</small></div>
        <div class="x num">gigue ${num(s.latency?.jitter || 0, (s.latency?.jitter || 0) < 10 ? 1 : 0)} ms · perte ${s.latency?.loss || 0} %</div>
        <div class="spark"><${Sparkline} data=${s.series.latency.slice(-60)} color="var(--lat)" height=${42} width=${200} /></div>
      </a>
      <a class="kpi" href="#/stats" data-enter>
        <div class="l"><${Icon} name="down" size=${15} />Débit descendant</div>
        <div class="v"><${CountUp} value=${s.wan.down} format=${fmtK} /></div>
        <div class="x">contrat ${kbps(s.wan.contract)}</div>
        <div class="spark"><${Sparkline} data=${s.series.down.slice(-40)} color="var(--down)" height=${42} width=${200} /></div>
      </a>
      <a class="kpi" href="#/stats" data-enter>
        <div class="l"><${Icon} name="up" size=${15} />Débit montant</div>
        <div class="v"><${CountUp} value=${s.wan.up} format=${fmtK} /></div>
        <div class="x">contrat ${kbps(s.wan.contractUp || 0)}</div>
        <div class="spark"><${Sparkline} data=${s.series.up.slice(-40)} color="var(--up)" height=${42} width=${200} /></div>
      </a>
      <a class="kpi" href="#/appareils" data-enter>
        <div class="l"><${Icon} name="devices" size=${15} />Appareils connectés</div>
        <div class="v"><${CountUp} value=${active.length} /><small>/ ${s.hosts.length}</small></div>
        <div class="x">${active.filter((x) => !isEth(x)).length} en Wi-Fi · ${active.filter(isEth).length} en Ethernet${guestsOn ? ` · ${guestsOn} invité${guestsOn > 1 ? 's' : ''}` : ''}</div>
        <div class="spark"><${Sparkline} data=${s.series.hostsActive.slice(-60)} color="var(--brand)" height=${42} width=${200} /></div>
      </a>
      <a class="kpi" href="#/stats" data-enter>
        <div class="l"><${Icon} name="chart" size=${15} />Données aujourd’hui</div>
        <div class="v">${bytes((s.today?.rx || 0) + (s.today?.tx || 0))}</div>
        <div class="x num">↓ ${bytes(s.today?.rx || 0)} · ↑ ${bytes(s.today?.tx || 0)}</div>
        ${(week.data?.days || []).filter((d) => d.has).length >= 2 && html`<div class="spark" style="padding:0 18px 10px" title="7 derniers jours"><${MiniBars} values=${week.data.days.map((d, i, a) => (i === a.length - 1 ? (s.today?.rx || 0) + (s.today?.tx || 0) : d.rx + d.tx))} color="var(--brand)" height=${30} /></div>`}
      </a>
    </div>

    <div class="grid">
      <${InternetLive} s=${s} latAvg=${latAvg} />
      <${Card} class=${'s4' + (!favDevices.length && !favActions.length ? ' center-empty' : '')} title="Favoris" icon="star" action=${html`<button class="link" onClick=${() => openSheet(FavoritesSheet, {}, { title: 'Favoris', sub: 'Partagés entre tous vos appareils' })}>Modifier</button>`}>
        ${!favDevices.length && !favActions.length ? html`<${Empty} icon="star" title="Épinglez l’essentiel" action=${html`<button class="btn btn-soft btn-sm" onClick=${() => openSheet(FavoritesSheet, {}, { title: 'Favoris', sub: 'Partagés entre tous vos appareils' })}><${Icon} name="plus" size=${16} />Choisir des favoris</button>`}>Appareils à mettre en pause d’un geste, Wi-Fi invité, carte Wi-Fi… toujours sous la main.</${Empty}>`
          : html`${favDevices.length > 0 && html`<div class="list">${favDevices.map((h) => html`<${FavDevice} key=${h.id} h=${h} />`)}</div>`}
            ${favActions.length > 0 && html`<div class="hstack" style=${`margin-top:${favDevices.length ? 14 : 0}px;gap:8px`}>${favActions.map((a) => html`<${Btn} kind="soft" size="sm" icon=${a.icon} onClick=${a.run}>${a.label}</${Btn}>`)}</div>`}`}
      </${Card}>

      <${WifiCard} s=${s} />
      <${DevicesCard} s=${s} active=${active} />
      <${HealthCard} s=${s} dev=${dev} />

      <${Card} class="s8" title="Activité récente" icon="bell" action=${html`<a class="link" href="#/activite">Toute l’activité<${Icon} name="chevron" size=${16} /></a>`}>
        <${RecentEvents} s=${s} />
      </${Card}>
      <${FiberCard} s=${s} wan=${wan} />
    </div>`;
}

function InternetLive({ s, latAvg }) {
  const [mode, setMode] = useState('lat');
  const latSeries = useMemo(() => [{ data: s.series.latency, color: 'var(--lat)', label: 'Latence' }], []);
  const wanSeries = useMemo(() => [{ data: s.series.down, color: 'var(--down)', label: 'Descendant' }, { data: s.series.up, color: 'var(--up)', label: 'Montant' }], []);
  return html`<${Card} class="s8" title="Internet en direct" icon="activity" action=${html`<${Seg} size="sm" value=${mode} onChange=${setMode} label="Mesure" options=${[{ v: 'lat', l: 'Latence' }, { v: 'wan', l: 'Débit' }]} />`}>
    ${mode === 'lat' ? html`
      <div class="hstack" style="gap:28px;margin-bottom:8px">
        <div class="stat"><span class="l"><i style="background:var(--lat)"></i>Maintenant</span><span class="v">${s.latency?.internet == null ? '—' : html`<${CountUp} value=${s.latency.internet} format=${(v) => (v < 10 ? num(v, 1) : num(v))} />`}<small>ms</small></span></div>
        <div class="stat sm"><span class="l">Moyenne 1 min</span><span class="v">${latAvg == null ? '—' : num(latAvg, latAvg < 10 ? 1 : 0)}<small>ms</small></span></div>
        <div class="stat sm hide-m"><span class="l">Vers la Bbox</span><span class="v">${s.latency?.bbox == null ? '—' : num(s.latency.bbox, 1)}<small>ms</small></span></div>
      </div>
      <${LiveChart} height=${210} format=${(v) => Math.round(v) + ' ms'} series=${latSeries} windowMs=${300000} lag=${1500} threshold=${100} loss=${true} hold=${false} />
      <p class="note" style="margin-top:8px">Mesurée toutes les 2 secondes par le serveur du panel (connexion vers 1.1.1.1 et 8.8.8.8). Les traits rouges signalent une mesure perdue.</p>`
    : html`
      <div class="hstack" style="gap:28px;margin-bottom:8px">
        <div class="stat"><span class="l"><i style="background:var(--down)"></i>Descendant</span><span class="v"><${CountUp} value=${s.wan.down} format=${fmtK} /></span></div>
        <div class="stat"><span class="l"><i style="background:var(--up)"></i>Montant</span><span class="v"><${CountUp} value=${s.wan.up} format=${fmtK} /></span></div>
      </div>
      <${LiveChart} height=${210} format=${fmtK} series=${wanSeries} windowMs=${600000} lag=${800} />
      <${Freshness} wan=${s.wan} />`}
  </${Card}>`;
}
// « actualisé il y a … » : seul ce petit composant se redessine chaque seconde
function Freshness({ wan }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!wan.updatedAt) return null;
  const ago = Math.max(0, Math.round((Date.now() - wan.updatedAt) / 1000));
  const every = wan.interval ? Math.round(wan.interval / 1000) : 0;
  return html`<p class="note num" style="margin-top:8px">Mesure calculée par la Bbox · actualisée il y a ${ago} s${every ? ` · nouvelle valeur toutes les ~${every} s` : ''}</p>`;
}

function FavDevice({ h }) {
  const pz = pauseOf(h.macaddress);
  const sig = signal(bestRssi(h));
  return html`<div class="row" style="min-height:54px">
    <button class="avatar sm" style="cursor:pointer" onClick=${() => openDevice(h)} aria-label=${'Ouvrir ' + displayName(h)}><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${17} /><span class=${'dot' + (pz ? ' paused' : h.active ? ' on' : '')}></span></button>
    <div class="grow" style="cursor:pointer" onClick=${() => openDevice(h)}><div class="t ellipsis">${displayName(h)}</div><div class="s ellipsis">${pz ? `en pause jusqu’à ${untilLabel(pz.until)}` : h.active ? (isEth(h) ? 'Ethernet' : sig.label) : 'hors ligne'}</div></div>
    ${pz ? html`<${Btn} kind="soft" size="xs" icon="play" onClick=${() => resumeDevice(h)}>Reprendre</${Btn}>`
      : html`<${Btn} kind="soft" size="xs" icon="pause" onClick=${() => openSheet(PauseSheet, { h }, { title: 'Mettre en pause', sub: displayName(h) })}>Pause</${Btn}>`}
  </div>`;
}

function WifiCard({ s }) {
  const w = s.wireless?.wireless || {}, sum = s.summary || {};
  const wifiOn = w.radio?.['24']?.enable === 1 || w.radio?.['5']?.enable === 1;
  const guestOn = (sum.wireless?.guestenable ?? w.ssid?.guest?.enable) === 1;
  const gt = guestTimer();
  const per = { 24: 0, 5: 0, 6: 0, mlo: 0 };
  for (const x of s.hosts.filter((y) => y.active)) { const l = x.link || ''; if (/MLO/.test(l)) per.mlo++; else if (/Ethernet/.test(l)) continue; else if (/Wifi 6/.test(l)) per[6]++; else if (/Wifi 5/.test(l)) per[5]++; else per[24]++; }
  return html`<${Card} class="s4" title="Wi-Fi" icon="wifi" action=${html`<a class="link" href="#/wifi">Gérer<${Icon} name="chevron" size=${16} /></a>`}>
    <div class="hstack" style="flex-wrap:nowrap;margin-bottom:14px;gap:12px">
      <div class="grow"><div style="font-size:18px;font-weight:600;overflow-wrap:anywhere;letter-spacing:-.01em">${w.ssid?.['24']?.id || '…'}</div><div class="note">${w.unified === 1 ? 'Réseau unifié 2,4 · 5 · 6 GHz' : 'Bandes séparées'}${w.driverbusy ? ' · redémarrage en cours…' : ''}</div></div>
      <${Toggle} value=${wifiOn} label="Wi-Fi" confirm=${(nv) => (nv ? null : { title: 'Couper tout le Wi-Fi ?', message: 'Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Il faudra un appareil en Ethernet ou le bouton de la Bbox pour le réactiver.', confirm: 'Couper le Wi-Fi', tone: 'danger' })}
        onChange=${(nv) => act(() => api.put('wireless', { 'radio.enable': nv ? 1 : 0 }), { ok: nv ? 'Wi-Fi activé' : 'Wi-Fi coupé', refresh: ['wireless'] }).then(() => refresh('statics'))} />
    </div>
    <div class="tiles">${[['24', '2,4 GHz'], ['5', '5 GHz'], ['6', '6 GHz']].filter(([k]) => w.radio?.[k]).map(([k, l]) => html`<div class="tile"><div class="l">${l}</div><div class="v num">${kbps(s.bands[k].down + s.bands[k].up)}</div><div class="x">${per[k]} appareil${per[k] > 1 ? 's' : ''}</div></div>`)}</div>
    <div class="list" style="margin-top:8px">
      ${w.ssid?.mlo && html`<div class="row" style="min-height:52px"><div class="grow"><div class="t">Wi-Fi 7</div><div class="s ellipsis">${w.ssid.mlo.id}</div></div><span class="chip ok">${per.mlo} app.</span></div>`}
      <button class="row tap" style="min-height:52px;width:100%;text-align:left" onClick=${() => openSheet(GuestSheet, { enabled: guestOn }, { title: 'Wi-Fi invité', sub: w.ssid?.guest?.id })}>
        <div class="grow"><div class="t">Wi-Fi invité</div><div class="s ellipsis">${guestOn ? (gt ? `actif jusqu’à ${untilLabel(gt.until)}` : 'actif sans limite') : 'désactivé'}</div></div>
        <span class=${'chip ' + (guestOn ? 'ok' : 'off')}><span class="dot"></span>${guestOn ? 'Actif' : 'Inactif'}</span><${Icon} name="chevron" size=${18} class="chev" /></button>
    </div>
  </${Card}>`;
}

function DevicesCard({ s, active }) {
  const kinds = { w24: 0, w5: 0, w6: 0, mlo: 0, eth: 0 };
  for (const x of active) { const l = x.link || ''; if (/MLO/.test(l)) kinds.mlo++; else if (/Ethernet/.test(l)) kinds.eth++; else if (/Wifi 6/.test(l)) kinds.w6++; else if (/Wifi 5/.test(l)) kinds.w5++; else kinds.w24++; }
  const segs = [
    { v: kinds.mlo, color: 'var(--cat1)', label: 'Wi-Fi 7' }, { v: kinds.w6, color: 'var(--cat3)', label: '6 GHz' }, { v: kinds.w5, color: 'var(--cat2)', label: '5 GHz' },
    { v: kinds.w24, color: 'var(--cat4)', label: '2,4 GHz' }, { v: kinds.eth, color: 'var(--cat5)', label: 'Ethernet' },
  ];
  const top = [...active].sort((a, b) => (Number(b.wireless?.estimatedRate) || (isEth(b) ? 1e4 : 0)) - (Number(a.wireless?.estimatedRate) || (isEth(a) ? 1e4 : 0))).slice(0, 4);
  return html`<${Card} class="s4" title="Appareils" icon="devices" action=${html`<a class="link" href="#/appareils">Tout voir<${Icon} name="chevron" size=${16} /></a>`}>
    <div class="hstack" style="gap:18px;flex-wrap:nowrap;margin-bottom:10px">
      <${Donut} segments=${segs} size=${112} thickness=${12} label=${active.length} sub="connectés" />
      <div class="legend" style="display:grid;gap:6px">${segs.filter((x) => x.v).map((x) => html`<span><i style=${`background:${x.color}`}></i>${x.label}<b class="num" style="color:var(--ink);margin-left:4px">${x.v}</b></span>`)}</div>
    </div>
    <div class="list">${top.map((x) => html`<button class="row tap" style="min-height:50px;width:100%;text-align:left" onClick=${() => openDevice(x)}>
      <span class="avatar sm"><${Icon} name=${KIND_ICON[deviceKind(x)]} size=${17} /></span>
      <div class="grow"><div class="t ellipsis">${displayName(x)}</div><div class="s">${x.ipaddress}</div></div>
      <span class="chip">${bandLabel(x.link, x.wireless?.band)}</span>
      ${isEth(x) ? html`<${Icon} name="ethernet" size=${16} />` : html`<${SignalBars} bars=${signal(bestRssi(x)).bars} />`}
    </button>`)}</div>
  </${Card}>`;
}

function HealthCard({ s, dev }) {
  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const cpu24 = s.graphs.cpu.slice(-96);
  return html`<${Card} class="s4" title="Santé de la Bbox" icon="box" action=${html`<a class="link" href="#/bbox">Détails<${Icon} name="chevron" size=${16} /></a>`}>
    <div class="hstack" style="justify-content:space-around;margin:2px 0 14px">
      <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${s.cpu.usage} label=${Math.round(s.cpu.usage) + ' %'} size=${76} color="var(--c-cpu)" /><span class="note">Processeur</span></div>
      <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${s.cpu.temp} max=${90} label=${Math.round(s.cpu.temp) + '°'} size=${76} color=${s.cpu.temp > 72 ? 'var(--warn-fill)' : 'var(--c-temp)'} /><span class="note">Température</span></div>
      <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${memPct} label=${Math.round(memPct) + ' %'} size=${76} color="var(--c-mem)" /><span class="note">Mémoire</span></div>
    </div>
    <${KV} rows=${[['Sessions IP', html`<${CountUp} value=${Number(s.sessions?.currentip) || 0} />`], ['Requêtes DNS', num(s.dns?.dns?.nbqueries)], ['Démarrages', dev.numberofboots]]} />
    <div class="hstack note" style="justify-content:space-between;margin-top:14px"><span>Charge processeur · 24 h</span><span>moy. ${Math.round(avg(cpu24.map((x) => x[1])) || 0)} %</span></div>
    <${HistoryChart} data=${cpu24} color="var(--c-cpu)" height=${46} bars=${true} format=${(v) => v + ' %'} />
  </${Card}>`;
}

function RecentEvents({ s }) {
  const byMac = useMemo(() => new Map(s.hosts.map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = (s.events || []).filter((e) => !['wifi_restart', 'port_up', 'port_down', 'voip_up', 'login'].includes(e.type)).slice(0, 6);
  if (!list.length) return html`<${Empty} icon="bell" title="Pas encore d’activité">Les arrivées et départs d’appareils, les coupures et les alertes apparaîtront ici en direct.</${Empty}>`;
  return html`<div class="list">${list.map((e) => html`<${EventRow} key=${e.id} e=${e} byMac=${byMac} />`)}</div>`;
}

function FiberCard({ s, wan }) {
  const sff = s.sff?.wan || {};
  const rx = sff.receive_power ? Number(sff.receive_power) / 1000 : null;
  return html`<${Card} class="s4" title="Fibre optique" icon="fiber" action=${html`<span class="chip">${sff.pon_mode?.type || ''} ${sff.pon_mode?.moduleclass || ''}</span>`}>
    <${KV} rows=${[['Signal reçu', rx != null ? html`<span class="num">${num(rx, 1)} dBm</span>` : '—'], ['Qualité', rx == null ? '—' : rx > -24 && rx < -8 ? html`<span style="color:var(--ok)">Bonne</span>` : html`<span style="color:var(--warn)">À surveiller</span>`], ['IPv4', html`<span class="mono">${wan.ip?.address || '—'}</span>`], ['Préfixe IPv6', html`<span class="mono">${wan.ip?.ip6prefix?.[0]?.prefix || '—'}</span>`]]} />
    <div class="note" style="margin:14px 0 4px">Température de la Bbox · 24 h</div>
    <${HistoryChart} data=${s.graphs.temp.slice(-96)} color="var(--c-temp)" height=${60} scale=${(v) => v / 1000} />
  </${Card}>`;
}
