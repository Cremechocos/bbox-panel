// Réseau local : adresse de la Bbox, ports Ethernet en direct, DHCP, baux fixes, IPv6.
import { html, PageHead, Card, KV, Toggle, Btn, Chip, Empty, act, openSheet, confirmDialog, FormSheet, useApi, toast } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { Sparkline } from '/lib/chart.js';
import { Icon } from '/lib/icons.js';
import { kbps, bytes, isIPv4, isMac, displayName } from '/lib/format.js';

const ipNum = (ip) => ip.split('.').reduce((a, b) => a * 256 + Number(b), 0);
const sameSubnet = (ip, base) => ip.split('.').slice(0, 3).join('.') === base.split('.').slice(0, 3).join('.');

export default function Network() {
  const s = useLive();
  const { data, reload } = useApi(['lan/ip', 'dhcp', 'dhcp/clients', 'dhcp/options', 'dhcp6/prefixdelegation', 'device/led', 'lan/stats'], { poll: 20000 });
  const [lan, dhcpR, clientsR, optsR, pdR, led, lanStats] = data;
  const ip = lan?.lan?.ip, dhcp = dhcpR?.dhcp, clients = clientsR?.dhcp?.clients || [], ports = lan?.lan?.switch?.ports || [];
  const ethPorts = led?.ethernetPort || [];
  const lanBase = ip?.ipaddress || '192.168.1.254';
  const hostsByMac = Object.fromEntries((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h]));
  const ethHosts = (s.hosts || []).filter((h) => h.active && /Ethernet/.test(h.link || ''));
  const dhcp6 = s.services?.services?.dhcp6;

  const editDhcp = () => openSheet(FormSheet, {
    intro: 'Plage d’adresses distribuées automatiquement aux appareils. Les baux fixes doivent rester dans le même sous-réseau.',
    fields: [
      { key: 'minaddress', label: 'Première adresse', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Doit être dans ' + lanBase.split('.').slice(0, 3).join('.') + '.x' : v === lanBase ? 'C’est l’adresse de la Bbox' : null) },
      { key: 'maxaddress', label: 'Dernière adresse', required: true, inputmode: 'decimal', validate: (v, a) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Même sous-réseau requis' : isIPv4(a.minaddress) && ipNum(v) < ipNum(a.minaddress) ? 'Doit suivre la première adresse' : v === lanBase ? 'C’est l’adresse de la Bbox' : null) },
      { key: 'lease', label: 'Durée du bail', type: 'select', options: [{ v: '60', l: '1 heure' }, { v: '240', l: '4 heures' }, { v: '720', l: '12 heures' }, { v: '1440', l: '24 heures' }, { v: '2880', l: '2 jours' }, { v: '10080', l: '7 jours' }] },
    ],
    initial: { minaddress: dhcp.minaddress, maxaddress: dhcp.maxaddress, lease: String(Math.round(dhcp.leasetime / 60)) },
    onSubmit: async (v) => { await act(() => api.put('dhcp', { enable: dhcp.enable, minaddress: v.minaddress.trim(), maxaddress: v.maxaddress.trim(), leasetime: Number(v.lease) * 60 }), { ok: 'Serveur DHCP mis à jour' }); reload(); },
  }, { title: 'Serveur DHCP' });

  const editClient = (c) => openSheet(FormSheet, {
    intro: 'L’appareil recevra toujours la même adresse IP. Le nom s’affiche dans la liste des appareils.',
    fields: [
      { key: 'macaddress', label: 'Appareil', type: 'device', mode: 'mac', required: true, validate: (v) => (isMac(v) ? null : 'Adresse MAC invalide') },
      { key: 'hostname', label: 'Nom', required: true, validate: (v) => (/[<>;&"]/.test(v) ? 'Caractères interdits' : null) },
      { key: 'ipaddress', label: 'Adresse IP réservée', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Même sous-réseau que la Bbox requis' : v === lanBase ? 'C’est l’adresse de la Bbox' : clients.some((x) => x.ipaddress === v && x.id !== c?.id) ? 'Adresse déjà réservée' : null) },
    ],
    initial: c ? { macaddress: c.macaddress, hostname: c.hostname, ipaddress: c.ipaddress } : {},
    submitLabel: c ? 'Enregistrer' : 'Réserver',
    onDelete: c ? () => act(() => api.del('dhcp/clients/' + c.id), { ok: 'Réservation supprimée' }).then(reload) : undefined,
    deleteLabel: 'Supprimer',
    onSubmit: async (v) => {
      const body = { enable: c ? c.enable : 1, hostname: v.hostname.trim(), macaddress: v.macaddress.trim().toLowerCase(), ipaddress: v.ipaddress.trim() };
      await act(() => (c ? api.put('dhcp/clients/' + c.id, body) : api.post('dhcp/clients', body)), { ok: c ? 'Réservation modifiée' : 'Adresse réservée' });
      reload(); refresh('hosts');
    },
  }, { title: c ? 'Bail fixe' : 'Réserver une adresse' });

  const changeIp = () => openSheet(FormSheet, {
    intro: 'Opération sensible : la Bbox redémarre son réseau local. Tous les appareils changent d’adresse et les redirections de ports vers l’ancienne plage cessent de fonctionner. Le panel continuera de joindre la Bbox via mabbox.bytel.fr.',
    fields: [{ key: 'ipaddress', label: 'Nouvelle adresse de la Bbox', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v) ? 'Utilisez une adresse privée (192.168.x.x, 10.x.x.x…)' : null) }],
    initial: { ipaddress: lanBase }, danger: true, submitLabel: 'Vérifier puis appliquer',
    onSubmit: async (v) => {
      const r = await act(() => api.put('lan', { ipaddress: v.ipaddress.trim(), validate: 1 }), { silent: true });
      const ok = (Array.isArray(r) ? r[0] : r)?.status;
      if (ok === 0) { toast('La Bbox refuse cette adresse', 'err'); throw new Error('refused'); }
      if (!(await confirmDialog({ title: `Passer la Bbox en ${v.ipaddress} ?`, message: 'Le réseau local va redémarrer : la connexion sera coupée une minute environ.', confirm: 'Changer l’adresse', tone: 'danger' }))) throw new Error('cancel');
      await act(() => api.put('lan', { ipaddress: v.ipaddress.trim() }), { ok: 'Adresse modifiée : le réseau redémarre' });
    },
  }, { title: 'Adresse de la Bbox' });

  return html`
    <${PageHead} kicker="LAN" title="Réseau local" sub=${ip ? `${ip.ipaddress} / ${ip.netmask} · ${clients.length} bail(s) fixe(s)` : '…'} />
    <div class="grid">
      <${Card} class="s7" title="Ports Ethernet" icon="ethernet" action=${html`<span class="note">trafic en direct</span>`}>
        <div class="tiles" style="grid-template-columns:repeat(auto-fit,minmax(130px,1fr))">
          ${(ethPorts.length ? ethPorts : ports).map((p, i) => {
            const sw = ports.find((x) => x.id === p.id) || {};
            const live = s.lanPorts.find((x) => x.index === p.id) || { down: 0, up: 0 };
            const up = (p.state || sw.state) === 'Up';
            const who = ethHosts.filter((h) => h.ethernet?.logicalport === p.id);
            const speed = sw.link_mode ? sw.link_mode.replace(/baseT.*/, '').replace(/^1000$/, '1 Gb/s').replace(/^2500$/, '2,5 Gb/s').replace(/^10000$/, '10 Gb/s').replace(/^(\d+)$/, '$1 Mb/s') : '';
            return html`<div class=${'tile port-tile' + (up ? '' : ' idle')}>
              <div class="hstack" style="flex-wrap:nowrap"><span style=${`width:8px;height:8px;border-radius:50%;flex:none;background:${up ? 'var(--ok)' : 'var(--line-strong)'}`}></span><b>Port ${p.id}</b><span class="spacer"></span><span class="note">${up ? speed || 'actif' : 'libre'}</span></div>
              <div class="v num" style="margin-top:8px">${up ? kbps(live.down + live.up) : '—'}</div>
              <div class="x ellipsis">${who.length ? who.map(displayName).join(', ') : up ? 'appareil non identifié' : 'aucun câble'}</div>
            </div>`;
          })}
        </div>
        ${lanStats && html`<div class="hstack note" style="margin-top:12px;gap:16px"><span>Depuis le démarrage : ↓ ${bytes(lanStats.lan.stats.tx.bytes)} vers le réseau local · ↑ ${bytes(lanStats.lan.stats.rx.bytes)}</span></div>`}
      </${Card}>

      <${Card} class="s5" title="La Bbox sur le réseau" icon="box" action=${html`<button class="link" onClick=${changeIp}>Modifier</button>`}>
        ${ip ? html`<${KV} rows=${[['Adresse IP', html`<span class="mono">${ip.ipaddress}</span>`], ['Masque', html`<span class="mono">${ip.netmask}</span>`], ['Adresse MAC', html`<span class="mono">${ip.mac}</span>`], ['Nom', `${ip.hostname}.${ip.domain}`], ['IPv6', ip.ip6state === 'Up' ? 'Active' : 'Inactive'], ['Préfixe IPv6', html`<span class="mono" style="font-size:12px">${ip.ip6prefix?.[0]?.prefix || '—'}</span>`], ['MTU', ip.mtu]]} />
          <div class="hstack" style="margin-top:12px">${String(ip.aliases || '').split(',').filter(Boolean).map((a) => html`<${Chip}>${a}</${Chip}>`)}</div>` : html`<div class="skel" style="height:200px"></div>`}
      </${Card}>

      <${Card} class="s5" title="Serveur DHCP" icon="network" action=${dhcp && html`<${Toggle} value=${dhcp.enable === 1} label="Serveur DHCP"
          confirm=${(nv) => (nv ? null : { title: 'Désactiver le serveur DHCP ?', message: 'Les appareils ne recevront plus d’adresse automatiquement : seuls ceux configurés à la main resteront connectés. À réserver aux réseaux avec un autre serveur DHCP.', confirm: 'Désactiver', tone: 'danger' })}
          onChange=${(nv) => act(() => api.put('dhcp', { enable: nv ? 1 : 0, minaddress: dhcp.minaddress, maxaddress: dhcp.maxaddress, leasetime: dhcp.leasetime }), { ok: nv ? 'DHCP activé' : 'DHCP désactivé' }).then(reload)} />`}>
        ${dhcp ? html`<${KV} rows=${[['Plage', html`<span class="mono">${dhcp.minaddress} → ${dhcp.maxaddress.split('.').pop()}</span>`], ['Adresses disponibles', ipNum(dhcp.maxaddress) - ipNum(dhcp.minaddress) + 1], ['Durée du bail', dhcp.leasetime >= 86400 ? `${dhcp.leasetime / 86400} jour(s)` : `${Math.round(dhcp.leasetime / 3600)} h`], ['Serveur DNS annoncé', html`<span class="mono">${optsR?.dhcp?.optionsstatic?.find((o) => o.option === 6)?.value || ip?.ipaddress || '—'}</span>`]]} />
          <button class="btn btn-ghost btn-sm" style="margin-top:14px" onClick=${editDhcp}><${Icon} name="edit" size=${16} />Modifier la plage</button>` : html`<div class="skel" style="height:140px"></div>`}
      </${Card}>

      <${Card} class="s7" flush=${true} title=${`Baux fixes · ${clients.length}`} icon="lock" action=${html`<button class="link" onClick=${() => editClient(null)}><${Icon} name="plus" size=${16} />Réserver</button>`}>
        <p class="desc">Réservez une adresse IP pour qu’un appareil la garde toujours (serveur, imprimante, NAS…).</p>
        <div class="list">${clients.length ? clients.map((c) => { const hh = hostsByMac[String(c.macaddress).toLowerCase()]; return html`<div class="row tap" onClick=${(e) => !e.target.closest('.switch') && editClient(c)}>
          <span class="avatar sm"><${Icon} name="lock" size=${16} /><span class=${'dot' + (hh?.active ? ' on' : '')}></span></span>
          <div class="grow"><div class="t ellipsis">${c.hostname || (hh ? displayName(hh) : c.macaddress)}</div><div class="s mono">${c.ipaddress} · ${c.macaddress}</div></div>
          <${Toggle} value=${c.enable === 1} label=${c.hostname} onChange=${(nv) => act(() => api.put('dhcp/clients/' + c.id, { enable: nv ? 1 : 0, hostname: c.hostname, macaddress: c.macaddress, ipaddress: c.ipaddress }), { ok: nv ? 'Réservation activée' : 'Réservation suspendue' }).then(reload)} />
        </div>`; }) : html`<${Empty} icon="lock" title="Aucun bail fixe">Les adresses sont toutes attribuées dynamiquement.</${Empty}>`}</div>
      </${Card}>

      <${Card} class="s6" title="IPv6" icon="globe" action=${dhcp6 && html`<${Toggle} value=${dhcp6.enable === 1} label="DHCPv6" onChange=${(nv) => act(() => api.put('dhcp6', { enable: nv ? 1 : 0 }), { ok: nv ? 'DHCPv6 activé' : 'DHCPv6 désactivé' }).then(() => refresh('statics'))} />`}>
        <p class="desc" style="margin-bottom:10px">L’interrupteur active le serveur DHCPv6 (en plus de l’autoconfiguration SLAAC, toujours active).</p>
        <${KV} rows=${[['État', ip?.ip6state === 'Up' ? 'Actif' : 'Inactif'], ...(ip?.ip6address || []).slice(0, 2).map((a, i) => [i ? 'Adresse secondaire' : 'Adresse de la Bbox', html`<span class="mono" style="font-size:12px">${a.ipaddress}</span>`]), ...(pdR?.dhcp?.prefixdelegation || []).map((p) => ['Délégation de préfixe', html`<span class="mono" style="font-size:12px">${p.prefixstart}… · ${p.securitylevel}</span>`])]} />
      </${Card}>

      <${Card} class="s6" title="Options DHCP" icon="sliders">
        <p class="desc" style="margin-bottom:10px">Options transmises aux appareils avec leur adresse. ${optsR ? `${optsR.dhcp.optionscapabilities?.length || 0} options RFC 2132 prises en charge.` : ''}</p>
        <div class="list">${[...(optsR?.dhcp?.optionsstatic || []).map((o) => ({ ...o, fixed: true })), ...(optsR?.dhcp?.options || [])].map((o) => html`<div class="row" style="min-height:46px"><div class="grow"><div class="t">Option ${o.option}${optsR.dhcp.optionscapabilities?.find((c) => c.id === o.option)?.description ? ' · ' + optsR.dhcp.optionscapabilities.find((c) => c.id === o.option).description : o.option === 6 ? ' · Serveurs DNS' : ''}</div><div class="s mono">${o.value}</div></div>${o.fixed ? html`<${Chip}>système</${Chip}>` : html`<button class="icon-btn" aria-label="Supprimer" onClick=${async () => { if (await confirmDialog({ title: 'Supprimer cette option ?', confirm: 'Supprimer', tone: 'danger' })) { await act(() => api.del('dhcp/options/' + o.id), { ok: 'Option supprimée' }); reload(); } }}><${Icon} name="trash" size=${18} /></button>`}</div>`)}</div>
      </${Card}>
    </div>`;
}
