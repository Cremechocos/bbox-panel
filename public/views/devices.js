// Appareils : tableau vivant (bureau) ou liste (mobile), recherche, filtres, fiche détaillée avec actions.
import { html, PageHead, Card, KV, Seg, Toggle, Btn, Chip, Empty, act, openSheet, toast, FormSheet, DataTable, Input, useState, useEffect, useMemo, useRef, load, errMsg } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh, live } from '/lib/live.js';
import { SignalBars } from '/lib/chart.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { deviceKind, displayName, bandLabel, signal, bestRssi, relative, dateTime, mbps, isIPv4 } from '/lib/format.js';
import { usePrefs, isFav, toggleFav, pauseOf, untilLabel, resumeDevice } from '/lib/prefs.js';
import { PauseSheet } from '/lib/sheets.js';

const isEth = (h) => /Ethernet/i.test(h.link || '');
const rateOf = (h) => Number(h.wireless?.estimatedRate) || (isEth(h) && h.ethernet?.speed ? Number(h.ethernet.speed) : 0);
const FILTERS = [{ v: 'all', l: 'Tous' }, { v: 'on', l: 'Connectés' }, { v: 'wifi', l: 'Wi-Fi' }, { v: 'eth', l: 'Ethernet' }, { v: 'off', l: 'Hors ligne' }, { v: 'fav', l: 'Favoris' }];
const lastSeen = (h) => (h.active ? 'maintenant' : h.lastseen > 0 ? relative(new Date(Date.now() - h.lastseen * 1000)) : '—');

export default function Devices({ route }) {
  const s = useLive();
  usePrefs();
  const [q, setQ] = useState('');
  const [f, setF] = useState('all');
  const opened = useRef(null);
  const all = s.hosts || [];
  const guests = s.guestHosts || [];

  // ouverture directe d'une fiche (#/appareils/<id>) depuis l'accueil ou la palette
  useEffect(() => {
    if (!route.arg || !all.length || opened.current === route.arg) return;
    const h = all.find((x) => String(x.id) === route.arg);
    if (h) { opened.current = route.arg; openDevice(h).then(() => { opened.current = null; history.replaceState(null, '', '#/appareils'); }); }
  }, [route.arg, all.length]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all.filter((h) => {
      if (f === 'on' && !h.active) return false;
      if (f === 'off' && h.active) return false;
      if (f === 'wifi' && (isEth(h) || !h.active)) return false;
      if (f === 'eth' && !isEth(h)) return false;
      if (f === 'fav' && !isFav('devices', h.macaddress)) return false;
      if (!needle) return true;
      return [displayName(h), h.ipaddress, h.macaddress, h.informations?.manufacturer, h.informations?.type].some((v) => String(v || '').toLowerCase().includes(needle));
    }).sort((a, b) => b.active - a.active || rateOf(b) - rateOf(a) || displayName(a).localeCompare(displayName(b), 'fr'));
  }, [all, q, f, s.t]);
  const activeCount = all.filter((h) => h.active).length;

  const columns = [
    { key: 'name', label: 'Appareil', sort: (h) => displayName(h), render: (h) => html`<div class="cell"><span class="avatar sm"><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${17} /><span class=${'dot' + (pauseOf(h.macaddress) ? ' paused' : h.active ? ' on' : '')}></span></span><div style="min-width:0"><div class="t ellipsis">${displayName(h)}${isFav('devices', h.macaddress) && html` <${Icon} name="starfill" size=${12} class="fav-ico" />`}</div><div class="s ellipsis">${h.informations?.manufacturer || h.informations?.type || '—'}</div></div></div>` },
    { key: 'ip', label: 'Adresse IP', sort: (h) => (h.ipaddress || '').split('.').map((x) => x.padStart(3, '0')).join('.'), render: (h) => html`<span class="mono">${h.ipaddress || '—'}</span>` },
    { key: 'link', label: 'Connexion', sort: (h) => h.link || '', render: (h) => (h.active ? html`<div class="hstack" style="gap:8px;flex-wrap:nowrap">${isEth(h) ? html`<${Icon} name="ethernet" size=${16} />` : html`<${SignalBars} bars=${signal(bestRssi(h)).bars} />`}<span>${bandLabel(h.link, h.wireless?.band)}</span></div>` : html`<span class="muted">—</span>`) },
    { key: 'rate', label: 'Débit du lien', align: 'r', sort: (h) => (h.active ? rateOf(h) : -1), render: (h) => html`<span class="num">${h.active && rateOf(h) ? mbps(rateOf(h)) : '—'}</span>` },
    { key: 'state', label: 'État', sort: (h) => (pauseOf(h.macaddress) ? 2 : h.active ? 1 : 0), render: (h) => { const pz = pauseOf(h.macaddress); return pz ? html`<${Chip} tone="warn">En pause · ${untilLabel(pz.until)}</${Chip}>` : h.active ? html`<${Chip} tone="ok" dot=${true}>Connecté</${Chip}>` : html`<span class="muted nowrap">${h.lastseen > 0 ? 'vu ' + lastSeen(h) : 'hors ligne'}</span>`; } },
    { key: 'go', label: '', align: 'r', render: () => html`<${Icon} name="chevron" size=${18} class="chev" />` },
  ];

  return html`
    <${PageHead} kicker="Réseau principal" title="Appareils" sub=${`${activeCount} connectés · ${all.length} connus${guests.length ? ` · ${guests.filter((g) => g.active).length} invité(s)` : ''}`}
      actions=${html`<${Btn} kind="soft" size="sm" icon="refresh" onClick=${async () => { await api.put('identification/hosts', { command: 'refresh' }).catch(() => {}); await refresh('hosts'); toast('Liste actualisée'); }}>Actualiser</${Btn}>`} />
    <div class="hstack" style="margin-bottom:16px;gap:10px" data-enter>
      <div class="grow" style="max-width:420px;min-width:220px"><${Input} type="search" icon="search" placeholder="Nom, IP, MAC, fabricant…" value=${q} onInput=${setQ} aria-label="Rechercher un appareil" /></div>
      <${Seg} options=${FILTERS} value=${f} onChange=${setF} label="Filtrer" />
    </div>
    ${!all.length ? html`<div class="card" data-enter>${[1, 2, 3, 4, 5].map(() => html`<div class="row"><div class="skel" style="width:40px;height:40px;border-radius:12px"></div><div class="grow stack" style="gap:6px"><div class="skel" style="height:13px;width:40%"></div><div class="skel" style="height:11px;width:25%"></div></div></div>`)}</div>`
      : html`<${Card} flush=${true} title=${`${list.length} appareil${list.length > 1 ? 's' : ''}`} icon="devices">
          <${DataTable} rows=${list} columns=${columns} rowKey=${(h) => h.id} onRow=${(h) => openDevice(h)} dim=${(h) => !h.active}
            mobile=${(h) => html`<${DeviceRow} h=${h} />`}
            empty=${html`<${Empty} icon="search" title="Aucun appareil">Aucun appareil ne correspond à cette recherche.</${Empty}>`} />
        </${Card}>`}
    ${guests.length > 0 && html`<div style="height:16px"></div><${Card} flush=${true} title=${`Wi-Fi invité · ${guests.length}`} icon="link">${guests.map((h) => html`<${DeviceRow} key=${'g' + h.id} h=${h} guest=${true} />`)}</${Card}>`}
    <p class="note" style="margin:14px 4px 0">Mise à jour en direct. Ouvrez un appareil pour le mettre en pause, le renommer, le réveiller, l’épingler ou l’analyser.</p>`;
}

function DeviceRow({ h, guest }) {
  const sig = signal(bestRssi(h));
  const r = rateOf(h);
  const pz = pauseOf(h.macaddress);
  const sub = pz ? `en pause jusqu’à ${untilLabel(pz.until)}` : [h.ipaddress, h.active ? bandLabel(h.link, h.wireless?.band) : h.lastseen > 0 ? `vu ${lastSeen(h)}` : 'hors ligne'].filter(Boolean).join(' · ');
  return html`<div class="row tap" role="button" tabindex="0" onClick=${() => openDevice(h, guest)} onKeyDown=${(e) => (e.key === 'Enter' || e.key === ' ') && openDevice(h, guest)}>
    <span class="avatar"><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${20} /><span class=${'dot' + (pz ? ' paused' : h.active ? ' on' : '')}></span></span>
    <div class="grow"><div class="t ellipsis">${displayName(h)}</div><div class="s ellipsis">${sub}</div></div>
    ${!!h.active && r > 0 && html`<span class="chip num hide-m">${mbps(r)}</span>`}
    ${!!h.active && (isEth(h) ? html`<${Icon} name="ethernet" size=${18} />` : html`<span title=${sig.label}><${SignalBars} bars=${sig.bars} /></span>`)}
    <${Icon} name="chevron" size=${18} class="chev" />
  </div>`;
}

function StarBtn({ h }) {
  usePrefs();
  const on = isFav('devices', h.macaddress);
  return html`<button class=${'icon-btn star' + (on ? ' on' : '')} aria-pressed=${on} aria-label=${on ? 'Retirer des favoris' : 'Ajouter aux favoris'} data-tip=${on ? 'Retirer des favoris' : 'Ajouter aux favoris'} onClick=${() => toggleFav('devices', h.macaddress, displayName(h))}><${Icon} name=${on ? 'starfill' : 'star'} size=${20} /></button>`;
}

export function openDevice(h, guest = false) {
  return openSheet(DeviceSheet, { id: h.id, guest }, { title: displayName(h), sub: [h.informations?.type, h.informations?.manufacturer].filter(Boolean).join(' · ') || 'Appareil', actions: !guest && html`<${StarBtn} h=${h} />` });
}

function DeviceSheet({ id, guest, close }) {
  const s = useLive();
  const h = (guest ? s.guestHosts : s.hosts)?.find((x) => x.id === id);
  const [diag, setDiag] = useState(null); // { kind:'ping'|'scan', data }
  if (!h) return html`<div class="sheet-b"><${Empty} title="Appareil introuvable" /></div>`;
  const sig = signal(bestRssi(h));
  const eth = isEth(h);
  const base = guest ? `guests/${h.id}` : `hosts/${h.id}`;
  const inSchedules = h.parentalcontrol?.enable === 1;
  const pz = pauseOf(h.macaddress);
  const reserved = (s.dhcp?.dhcp?.clients || []).find((c) => c.macaddress?.toLowerCase() === h.macaddress?.toLowerCase());

  const runDiag = async (kind) => {
    setDiag({ kind, data: { status: 'Running' } });
    try {
      // La Bbox coupe parfois la connexion en réponse à l'action (le test tourne quand même) : on continue.
      try { await api.post(base, { action: kind }); } catch (e) { if (e.status !== 502) throw e; }
      let seenRunning = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const raw = await api.get(base);
        const o = raw?.host || raw?.hosts?.list?.[0] || raw;
        const d = o?.[kind];
        if (d?.status === 'Running') seenRunning = true;
        const finished = d && d.status && d.status !== 'Running' && (seenRunning || i >= 2);
        setDiag({ kind, data: finished ? d : { ...(d || {}), status: 'Running' } });
        if (finished) break;
      }
    } catch (e) { setDiag(null); toast(errMsg(e), 'err'); }
  };
  const msOf = (us) => (us ? (us / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' ms' : '—');

  return html`
    <div class="sheet-b">
      <div class="hstack" style="gap:14px;flex-wrap:nowrap;margin:2px 0 16px">
        <span class="avatar lg"><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${28} /><span class=${'dot' + (pz ? ' paused' : h.active ? ' on' : '')}></span></span>
        <div class="hstack grow" style="gap:6px">${h.active ? html`<${Chip} tone="ok" dot=${true}>Connecté</${Chip}>` : html`<${Chip} tone="off" dot=${true}>Hors ligne</${Chip}>`}
          ${pz && html`<${Chip} tone="warn">En pause jusqu’à ${untilLabel(pz.until)}</${Chip}>`}${inSchedules ? html`<${Chip}>Plages de pause</${Chip}>` : ''}${h.preferred ? html`<${Chip} tone="brand">Prioritaire</${Chip}>` : ''}${guest ? html`<${Chip}>Invité</${Chip}>` : ''}</div>
      </div>
      ${!guest && html`<div class=${'banner ' + (pz ? '' : 'info')} style="align-items:center">
        <${Icon} name=${pz ? 'pause' : 'globe'} size=${18} />
        <div class="grow">${pz ? html`<b>Internet en pause</b> <span>jusqu’à ${untilLabel(pz.until)}</span>` : html`<b>Accès à Internet autorisé</b>`}</div>
        ${pz ? html`<${Btn} kind="go" size="sm" icon="play" onClick=${() => resumeDevice(h)}>Reprendre</${Btn}>`
          : html`<${Btn} kind="go" size="sm" icon="pause" onClick=${() => openSheet(PauseSheet, { h }, { title: 'Mettre en pause', sub: displayName(h) })}>Pause</${Btn}>`}
      </div>`}
      <div class="tiles" style="margin-bottom:16px">
        <div class="tile"><div class="l">Connexion</div><div class="v">${h.active ? bandLabel(h.link, h.wireless?.band) : '—'}</div><div class="x">${eth && h.ethernet?.logicalport ? 'port ' + h.ethernet.logicalport : h.active && !eth ? sig.label : ''}</div></div>
        <div class="tile"><div class="l">${eth ? 'Vitesse du lien' : 'Débit estimé'}</div><div class="v num">${!!h.active && rateOf(h) ? mbps(rateOf(h)) : '—'}</div><div class="x">${!eth && bestRssi(h) ? bestRssi(h) + ' dBm' : ''}</div></div>
      </div>
      <${KV} rows=${[
        ['Adresse IP', html`<span class="mono">${h.ipaddress || '—'}</span>`],
        ['Adresse MAC', html`<span class="mono">${h.macaddress}</span>`],
        ['Attribution', h.type === 'Static' || reserved ? 'IP réservée' : 'DHCP'],
        h.ip6address?.length ? ['IPv6', html`<span class="mono" style="font-size:12px">${h.ip6address[0].ipaddress}</span>`] : null,
        ['Vu pour la première fois', dateTime(h.firstseen)],
        !h.active && h.lastseen > 0 ? ['Dernière connexion', relative(new Date(Date.now() - h.lastseen * 1000))] : null,
        h.informations?.operatingSystem ? ['Système', h.informations.operatingSystem] : null,
      ]} />

      ${diag && html`<div class="card inset" style="margin-top:16px;padding:14px 16px">
        <div class="hstack" style="margin-bottom:6px"><b>${diag.kind === 'ping' ? 'Ping' : 'Analyse des ports'}</b><span class="spacer"></span>${diag.data.status === 'Running' ? html`<span class="spin" style="color:var(--brand)"></span>` : html`<button class="icon-btn sm" onClick=${() => setDiag(null)} aria-label="Fermer"><${Icon} name="x" size=${16} /></button>`}</div>
        ${diag.kind === 'ping' ? html`<${KV} rows=${[['État', diag.data.status === 'Running' ? 'En cours…' : diag.data.success > 0 ? 'Répond' : 'Ne répond pas'], ['Temps moyen', msOf(diag.data.average)], diag.data.min != null && diag.data.status !== 'Running' ? ['Min / max', `${msOf(diag.data.min)} / ${msOf(diag.data.max)}`] : null, diag.data.tries != null && diag.data.status !== 'Running' ? ['Réponses', `${diag.data.success ?? 0} sur ${diag.data.tries}`] : null]} />`
          : html`${diag.data.status === 'Running' && !(diag.data.services || []).length ? html`<p class="note">Analyse des ports courants…</p>` : (diag.data.services || []).filter((x) => /open/i.test(x.state)).length ? html`<div class="hstack">${diag.data.services.filter((x) => /open/i.test(x.state)).map((x) => html`<${Chip} tone="warn">${x.port}/${x.protocol}</${Chip}>`)}</div>` : html`<p class="note">Aucun port ouvert parmi les ${(diag.data.services || []).length} ports courants testés.</p>`}`}
      </div>`}

      ${!guest && html`<div class="section-title" style="margin-top:22px">Réglages</div>
      <div class="list">
        <${ToggleRowLocal} title="Soumis aux plages de pause" sub="Applique les plages horaires définies dans « Pauses & contrôle »" value=${inSchedules}
          onChange=${(nv) => act(() => api.put('parentalcontrol/hosts', { enable: nv ? 1 : 0, macaddress: h.macaddress }), { ok: nv ? 'Ajouté aux plages de pause' : 'Retiré des plages de pause' }).then(() => refresh('hosts'))} />
        ${Number(s.summary?.preferredAvailable) === 1 && String(h.link || '').toLowerCase().includes('wifi') && String(h.devicetype).toLowerCase() !== 'repeater' && html`<${ToggleRowLocal} title="Appareil prioritaire" sub="La Bbox lui donne la priorité sur le Wi-Fi" value=${!!h.preferred}
          onChange=${(nv) => act(() => api.post('hosts/prioritize/' + h.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Appareil prioritaire' : 'Priorité retirée' }).then(() => refresh('hosts'))} />`}
        ${!eth && html`<${ToggleRowLocal} title="Figer sur sa bande Wi-Fi" sub="Empêche la Bbox de le basculer entre 2,4 / 5 / 6 GHz" value=${h.wireless?.static === 1}
          onChange=${(nv) => act(() => api.put('untouchable/hosts/' + h.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Bande figée' : 'Bande automatique' }).then(() => refresh('hosts'))} />`}
      </div>`}
    </div>
    <div class="sheet-f" style="justify-content:flex-start">
      ${!guest && html`<${Btn} kind="soft" size="sm" icon="edit" onClick=${() => renameDevice(h, reserved)}>Renommer</${Btn}>`}
      ${!!h.active && html`<${Btn} kind="soft" size="sm" icon="activity" onClick=${() => runDiag('ping')}>Ping</${Btn}>`}
      ${!!h.active && html`<${Btn} kind="soft" size="sm" icon="search" onClick=${() => runDiag('scan')}>Ports</${Btn}>`}
      ${!h.active && !guest && html`<${Btn} kind="soft" size="sm" icon="power" onClick=${() => act(() => api.post(base, { action: 'wakeup' }), { ok: 'Signal de réveil envoyé' })}>Réveiller</${Btn}>`}
      ${!h.active && html`<${Btn} kind="danger-ghost" size="sm" icon="trash" confirm=${{ title: 'Retirer cet appareil ?', message: 'Il disparaîtra de la liste jusqu’à sa prochaine connexion.', confirm: 'Retirer', tone: 'danger' }} onClick=${async () => { await act(() => api.del(base), { ok: 'Appareil retiré' }); refresh('hosts'); close(); }}>Retirer</${Btn}>`}
    </div>`;
}
function ToggleRowLocal({ title, sub, value, onChange }) {
  return html`<div class="check-row"><div class="grow"><div class="t">${title}</div><div class="s">${sub}</div></div><${Toggle} value=${value} onChange=${onChange} label=${title} /></div>`;
}

// Le renommage passe par la réservation DHCP, exactement comme l'interface officielle.
async function renameDevice(h, reserved) {
  return openSheet(FormSheet, {
    intro: 'Le nom est enregistré dans une réservation d’adresse (bail DHCP fixe), comme le fait l’interface officielle : l’appareil gardera aussi son adresse IP.',
    fields: [
      { key: 'hostname', label: 'Nom de l’appareil', required: true, validate: (v) => (/[<>;&"]/.test(v) ? 'Caractères < > ; & " interdits' : v.length > 63 ? '63 caractères maximum' : null) },
      { key: 'ipaddress', label: 'Adresse IP réservée', required: true, inputmode: 'decimal', validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') },
    ],
    initial: { hostname: displayName(h), ipaddress: reserved?.ipaddress || h.ipaddress },
    submitLabel: 'Enregistrer',
    onSubmit: async (v) => {
      const body = { enable: 1, hostname: v.hostname.trim(), ipaddress: v.ipaddress.trim(), macaddress: h.macaddress };
      const clients = (await load('dhcp/clients', { force: true }))?.dhcp?.clients || [];
      const ex = clients.find((c) => c.macaddress?.toLowerCase() === h.macaddress.toLowerCase() || c.ipaddress === h.ipaddress);
      await act(() => (ex ? api.put('dhcp/clients/' + ex.id, body) : api.post('dhcp/clients', body)), { ok: 'Appareil renommé', refresh: ['dhcp'] });
      refresh('hosts', 'slow');
    },
  }, { title: 'Renommer', sub: displayName(h) });
}
