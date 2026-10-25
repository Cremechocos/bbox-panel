// Diagnostic : connexion, fibre, tests, débit, sessions IP, DNS, journal, alertes, TV, secours 4G.
import { html, PageHead, Card, KV, Toggle, Btn, Chip, Empty, Seg, act, confirmDialog, useApi, useState, useMemo, toast, Tabs } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { Gauge, HistoryChart, Sparkline, LiveChart } from '/lib/chart.js';
import { Icon } from '/lib/icons.js';
import { num, dateTime, relative, logLabel, logTone, displayName, parseDate } from '/lib/format.js';

const ms = (us) => (us ? num(us / 1000, us < 10000 ? 1 : 0) + ' ms' : '—');
const TABS = [{ v: 'internet', l: 'Internet' }, { v: 'trafic', l: 'Trafic' }, { v: 'journal', l: 'Journal' }];

export default function Diag() {
  const [tab, setTab] = useState('internet');
  return html`
    <${PageHead} kicker="Santé du réseau" title="Diagnostic" sub="Tests de connexion, fibre, sessions et journal de la Bbox." />
    <${Tabs} tabs=${TABS} value=${tab} onChange=${setTab} label="Section" />
    ${tab === 'internet' && html`<${Internet} />`}
    ${tab === 'trafic' && html`<${Traffic} />`}
    ${tab === 'journal' && html`<${Journal} />`}`;
}

function Internet() {
  const s = useLive();
  const { data, reload } = useApi(['wan/diags', 'wan/ftth/stats', 'speedtest/info', 'wan/backup', 'iptv/diags', 'alerts'], { poll: 30000 });
  const [diags, ftth, sp, backup, iptv, alerts] = data;
  const wan = s.wanIp?.wan, sff = s.sff?.wan;
  const rx = sff?.receive_power ? Number(sff.receive_power) / 1000 : null;
  const d = diags?.diags;
  const [running, setRunning] = useState(false);
  const startDiag = async () => {
    setRunning(true);
    try { await act(() => api.post('wan/diags', { action: 'start' }), { ok: 'Tests lancés' }); await new Promise((r) => setTimeout(r, 8000)); reload(); }
    catch { /* */ } finally { setRunning(false); }
  };
  const last = (arr) => (arr || []).find((x) => x.tries > 0) || (arr || [])[0];
  const series = (arr) => (arr || []).slice().reverse().map((x, i) => [i, x.average ? x.average / 1000 : 0]);
  const alertList = alerts?.alerts?.list || [];

  return html`<div class="grid">
    ${alertList.length > 0 && html`<${Card} class="s12" title=${`Alertes · ${alertList.length}`} icon="alert">
      <div class="list">${alertList.map((a) => html`<div class="row"><span class="avatar sm" style="background:var(--warn-soft);color:var(--warn)"><${Icon} name="alert" size=${16} /></span><div class="grow"><div class="t">${a.ident || a.name || a.type || 'Alerte'}</div><div class="s">${a.param || ''} ${a.first_date ? '· depuis ' + relative(a.first_date) : ''}</div></div>
        <button class="icon-btn" aria-label="Acquitter" onClick=${() => act(() => api.del('alerts/' + a.id), { ok: 'Alerte acquittée' }).then(() => { reload(); refresh('summary'); })}><${Icon} name="check" size=${18} /></button></div>`)}</div>
    </${Card}>`}

    <${Card} class="s7" title="Connexion Internet" icon="globe" action=${html`<${Chip} tone=${wan?.internet?.state === 2 ? 'ok' : 'danger'} dot=${true}>${wan?.internet?.state === 2 ? 'Connectée' : 'Coupée'}</${Chip}>`}>
      ${wan ? html`<${KV} rows=${[
        ['Adresse IPv4 publique', html`<span class="mono">${wan.ip.address}</span>`],
        ['Type d’IPv4', wan.ip.cgnatenable ? 'Partagée (CGNAT)' : wan.ip.maptenable ? 'MAP-T' : 'Dédiée'],
        ['Passerelle', html`<span class="mono">${wan.ip.gateway}</span>`],
        ['DNS IPv4', html`<span class="mono">${String(wan.ip.dnsservers).replace(',', ' · ')}</span>`],
        ['Adresse IPv6', html`<span class="mono" style="font-size:12px">${wan.ip.ip6address?.[0]?.ipaddress || '—'}</span>`],
        ['Préfixe délégué', html`<span class="mono" style="font-size:12px">${wan.ip.ip6prefix?.[0]?.prefix || '—'}</span>`],
        ['DNS IPv6', html`<span class="mono" style="font-size:12px">${String(wan.ip.dnsserversv6 || '—').replace(',', ' · ')}</span>`],
        ['MTU', wan.ip.mtu],
      ]} />` : html`<div class="skel" style="height:220px"></div>`}
    </${Card}>

    <${Card} class="s5" title="Fibre optique" icon="fiber" action=${sff && html`<${Chip}>${sff.pon_mode?.type} · classe ${sff.pon_mode?.moduleclass}</${Chip}>`}>
      ${sff ? html`
        <div class="hstack" style="justify-content:space-around;margin-bottom:14px">
          <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${rx == null ? 0 : Math.max(0, Math.min(100, ((rx + 30) / 22) * 100))} label=${rx == null ? '—' : num(rx, 1)} sub="dBm" size=${92} color=${rx > -27 && rx < -8 ? 'var(--ok)' : 'var(--warn-fill)'} /><span class="note">Puissance reçue</span></div>
          <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${(sff.transmit_power / 1000 / 7) * 100} label=${num(sff.transmit_power / 1000, 1)} sub="dBm" size=${92} color="var(--up)" /><span class="note">Puissance émise</span></div>
        </div>
        <${KV} rows=${[['Qualité du signal', rx == null ? '—' : rx > -24 && rx < -8 ? html`<span style="color:var(--ok)">Excellente</span>` : rx > -27 ? html`<span style="color:var(--warn)">Correcte</span>` : html`<span style="color:var(--danger)">Faible</span>`], ['État du module', sff.pon_mode?.internalstatus === 'Up' ? 'Synchronisé' : sff.pon_mode?.internalstatus], ['Lien interne', ftth?.wan?.ftth?.mode || '—'], ['Température module', sff.temperature ? num(sff.temperature / 10, 0) + ' °C' : '—']]} />
        <p class="note" style="margin-top:10px">Plage normale en GPON : de −8 à −27 dBm en réception.</p>` : html`<div class="skel" style="height:200px"></div>`}
    </${Card}>

    <${Card} class="s7" title="Tests de connectivité" icon="activity" action=${html`<${Btn} kind="soft" size="sm" icon="play" onClick=${startDiag} disabled=${running}>${running ? 'Tests en cours…' : 'Relancer'}</${Btn}>`}>
      <p class="desc" style="margin-bottom:12px">La Bbox teste elle-même la résolution DNS, le ping et l’accès web, toutes les heures.</p>
      ${d ? html`<div class="tiles" style="grid-template-columns:repeat(3,1fr)">${[['dns', 'DNS'], ['ping', 'Ping'], ['http', 'Web (HTTP)']].map(([k, l]) => { const x = last(d[k]); const ok = x && x.success > 0; return html`<div class="tile">
          <div class="hstack"><span class="l">${l}</span><span class="spacer"></span>${x?.tries ? html`<span class=${'chip ' + (ok ? 'ok' : 'danger')} style="min-height:20px;padding:0 7px"><span class="dot"></span></span>` : ''}</div>
          <div class="v num">${x?.tries ? ms(x.average) : '—'}</div>
          <${Sparkline} data=${series(d[k]).map((p) => p[1])} color="var(--brand)" width=${120} height=${28} />
        </div>`; })}</div>` : html`<div class="skel" style="height:110px"></div>`}
    </${Card}>

    <${SpeedCard} class="s5" info=${sp?.speedtest} reload=${reload} />

    <${Card} class="s6" title="Télévision" icon="tv" action=${html`<div class="hstack"><${Btn} kind="soft" size="sm" onClick=${() => act(() => api.put('iptv/diags', { check: 'igmp' }), { ok: 'Test IGMP lancé' }).then(() => setTimeout(reload, 4000))}>Tester IGMP</${Btn}><${Btn} kind="soft" size="sm" onClick=${() => act(() => api.put('iptv/diags', { check: 'server' }), { ok: 'Test plateforme lancé' }).then(() => setTimeout(reload, 4000))}>Tester la plateforme</${Btn}></div>`}>
      ${iptv ? html`<${KV} rows=${[['IGMP', iptv.igmp?.enable ? (iptv.igmp.state === 2 ? 'Actif' : 'Activé') : 'Désactivé'], ['Multicast', iptv.iptv?.multicast?.state || 'Non testé'], ['Plateforme TV', iptv.iptv?.platform?.state === 'Disable' ? 'Non testée' : iptv.iptv?.platform?.state || '—']]} />` : html`<div class="skel" style="height:90px"></div>`}
    </${Card}>

    <${Card} class="s6" title="Internet de secours 4G" icon="mobile">
      ${backup ? html`<${KV} rows=${[['État', backup.backup?.state?.stateName === 'Stopped' ? 'En veille (fibre active)' : backup.backup?.state?.stateName], ['Clé ou box 4G', backup.backup?.usb?.running ? 'Branchée' : 'Non détectée'], ['Dernière bascule', (backup.backup?.history || []).find((x) => x.beginning)?.beginning ? dateTime(backup.backup.history.find((x) => x.beginning).beginning) : 'Jamais']]} />
        ${backup.backup?.usb?.running ? html`<${Btn} kind="ghost" size="sm" class="" onClick=${() => act(() => api.put('wan/backup', { action: 'eject' }), { ok: 'Clé 4G éjectée' }).then(reload)}>Éjecter la clé 4G</${Btn}>` : ''}` : html`<div class="skel" style="height:90px"></div>`}
    </${Card}>
  </div>`;
}

function SpeedCard({ class: cls, info, reload }) {
  const [st, setSt] = useState(null);
  const run = async (mode) => {
    setSt({ mode, state: 'running' });
    try {
      await act(() => api.post('speedtest', { mode }), { silent: true });
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        const d = (await api.get('speedtest')).speedtest;
        setSt({ mode, ...d });
        if (!/run|progress|start/i.test(d.state)) break;
      }
      reload();
    } catch { setSt(null); }
  };
  const m = info?.latestmeasurements;
  const fmt = (v) => (/^\d+(\.\d+)?$/.test(String(v)) ? (Number(v) >= 1000 ? num(Number(v) / 1000, 1) + ' Mb/s' : num(v) + ' kb/s') : v === 'OK' ? 'Réussi' : v === 'KO' ? 'Échec' : v);
  return html`<${Card} class=${cls} title="Test de débit de la Bbox" icon="bolt">
    <p class="desc" style="margin-bottom:12px">Mesuré par la Bbox elle-même, sans dépendre du Wi-Fi ni de votre appareil.</p>
    <div class="hstack" style="margin-bottom:12px">
      <${Btn} kind="go" size="sm" icon="down" disabled=${st?.state === 'running' || /run/i.test(st?.state || '')} onClick=${() => run('downlink')}>Descendant</${Btn}>
      <${Btn} kind="soft" size="sm" icon="up" disabled=${st?.state === 'running' || /run/i.test(st?.state || '')} onClick=${() => run('uplink')}>Montant</${Btn}>
      ${st && html`<span class="note">${/run|start/i.test(st.state) ? 'Mesure en cours…' : 'Résultat : ' + fmt(st.speed)}</span>`}
    </div>
    ${m ? html`<div class="list">${[...(m.download || []).map((x) => ({ ...x, k: '↓' })), ...(m.upload || []).map((x) => ({ ...x, k: '↑' }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5).map((x) => html`<div class="row" style="min-height:42px"><span class="num" style="width:18px">${x.k}</span><span class="grow note">${dateTime(x.date)}</span><span class=${'chip ' + (x.speed === 'KO' ? 'danger' : x.speed === 'OK' ? 'ok' : '')}>${fmt(x.speed)}</span></div>`)}</div>` : html`<div class="skel" style="height:120px"></div>`}
  </${Card}>`;
}

function Traffic() {
  const s = useLive();
  const { data } = useApi('dns/stats', { poll: 20000 });
  const sess = s.sessions;
  const ipToName = useMemo(() => {
    const m = {};
    for (const h of s.hosts || []) { if (h.ipaddress) m[h.ipaddress] = displayName(h); for (const a of h.ip6address || []) m[a.ipaddress] = displayName(h); }
    return m;
  }, [s.hosts]);
  const grouped = useMemo(() => {
    const g = {};
    for (const x of sess?.hosts || []) { const n = ipToName[x.ip] || x.ip; g[n] = g[n] || { n, ip: 0, tcp: 0, udp: 0 }; g[n].ip += x.currentip; g[n].tcp += x.currenttcp; g[n].udp += x.currentudp; }
    return Object.values(g).sort((a, b) => b.ip - a.ip);
  }, [sess, ipToName]);
  const max = grouped[0]?.ip || 1;
  const dns = data?.dns;
  const series = useMemo(() => [{ data: s.series.sessions, color: 'var(--brand)', label: 'sessions' }], []);
  return html`<div class="grid">
    <${Card} class="s8" title="Sessions IP en direct" icon="activity" action=${sess && html`<span class="note">seuil d’alerte ${num(sess.highthreshold)}</span>`}>
      <div class="hstack" style="gap:24px;margin-bottom:8px"><div class="stat"><span class="l">Sessions ouvertes</span><span class="v num">${num(sess?.currentip)}</span></div><div class="stat sm"><span class="l">Appareils actifs</span><span class="v num">${grouped.length}</span></div></div>
      <${LiveChart} height=${150} series=${series} windowMs=${600000} format=${(v) => num(v)} />
      <p class="note" style="margin-top:8px">Chaque connexion ouverte (onglet, appli, appel…) compte pour une session. Une valeur proche du seuil ralentit tout le réseau.</p>
    </${Card}>
    <${Card} class="s4" title="Résolution DNS" icon="globe">
      ${dns ? html`<div class="big num" style="margin:4px 0 2px">${ms(dns.avg)}</div><p class="note" style="margin-bottom:12px">temps moyen de réponse</p>
        <${KV} rows=${[['Requêtes traitées', num(dns.nbqueries)], ['Plus rapide', ms(dns.min)], ['Plus lente', ms(dns.max)]]} />` : html`<div class="skel" style="height:140px"></div>`}
    </${Card}>
    <${Card} class="s12" title="Sessions par appareil" icon="devices">
      <div class="list">${grouped.length ? grouped.map((g) => html`<div class="row" style="min-height:52px;display:grid;grid-template-columns:minmax(120px,1.2fr) 2fr auto;gap:12px">
        <span class="t ellipsis">${g.n}</span>
        <div class="meter" title=${`${g.tcp} TCP · ${g.udp} UDP`}><i style=${`transform:scaleX(${g.ip / max})`}></i></div>
        <span class="num note" style="min-width:110px;text-align:right">${num(g.ip)} · <span title="TCP / UDP">${g.tcp}/${g.udp}</span></span>
      </div>`) : html`<${Empty} icon="activity" title="Chargement des sessions…" />`}</div>
    </${Card}>
  </div>`;
}

function Journal() {
  const { data, reload } = useApi('device/log', { poll: 30000 });
  const [f, setF] = useState('all');
  const [n, setN] = useState(60);
  const all = data?.log || [];
  const list = all.filter((e) => f === 'all' || (f === 'devices' && /DEVICE/.test(e.log)) || (f === 'login' && /LOGIN/.test(e.log)) || (f === 'net' && /WAN|VOIP|WIFI|LAN|BOOT|REBOOT/.test(e.log)));
  let lastDay = '';
  return html`<${Card} flush=${true} title=${`Journal de la Bbox · ${all.length} événements`} icon="clock" action=${html`<${Btn} kind="danger-ghost" size="sm" icon="trash" confirm=${{ title: 'Vider le journal ?', message: 'Tous les événements enregistrés par la Bbox seront effacés.', confirm: 'Vider', tone: 'danger' }} onClick=${async () => { await act(() => api.del('device/log'), { ok: 'Journal vidé' }); reload(); }}>Vider</${Btn}>`}>
    <div style="padding:0 20px 8px"><${Seg} options=${[{ v: 'all', l: 'Tout' }, { v: 'devices', l: 'Appareils' }, { v: 'login', l: 'Connexions' }, { v: 'net', l: 'Réseau' }]} value=${f} onChange=${(v) => { setF(v); setN(60); }} label="Filtre" /></div>
    <div class="list">${list.slice(0, n).map((e) => {
      const d = parseDate(e.date); const day = d ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
      const head = day !== lastDay ? ((lastDay = day), html`<div class="section-title" style="margin:14px 20px 4px">${day}</div>`) : null;
      const tone = logTone(e.log);
      return html`${head}<div class="row" style="min-height:44px"><span class="num note" style="width:44px">${d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
        <span style=${`width:8px;height:8px;border-radius:50%;flex:none;background:${tone === 'warn' ? 'var(--warn-fill)' : tone === 'ok' ? 'var(--ok)' : 'var(--line-strong)'}`}></span>
        <div class="grow ellipsis"><span class="t">${logLabel(e.log)}</span> <span class="muted">${String(e.param || '').split(';').filter(Boolean).reverse().join(' · ')}</span></div></div>`;
    })}${!data && html`<div style="padding:0 20px"><div class="skel" style="height:200px"></div></div>`}</div>
    ${list.length > n && html`<div style="padding:12px 20px"><button class="btn btn-soft btn-sm" onClick=${() => setN(n + 100)}>Afficher plus (${list.length - n} restants)</button></div>`}
  </${Card}>`;
}
