// Accès & sécurité : redirections de ports, DMZ, UPnP, pare-feu v4/v6, accès distant, DynDNS.
import { html, PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Empty, Seg, act, openSheet, confirmDialog, FormSheet, useApi, useState, Tabs } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { Icon } from '/lib/icons.js';
import { isIPv4, isPortSpec, displayName, dateTime } from '/lib/format.js';

const PROTO_L = { tcp: 'TCP', udp: 'UDP', all: 'TCP + UDP', 'tcp,udp': 'TCP + UDP' };
const descErr = (v) => (!v?.trim() ? 'Description requise' : v.length > 48 ? '48 caractères maximum' : /[?;\\&/>]/.test(v) ? 'Caractères ? ; \\ & / > interdits' : null);
const portErr = (v) => (!v ? null : isPortSpec(v) && String(v).split(/[,:-]/).every((p) => +p >= 1 && +p <= 65535) ? null : 'Port ou plage invalide (ex. 443 ou 8000-8100)');
const TABS = [{ v: 'ports', l: 'Ports & NAT' }, { v: 'firewall', l: 'Pare-feu' }, { v: 'remote', l: 'Accès distant' }];

export default function Security() {
  const [tab, setTab] = useState('ports');
  const s = useLive();
  const wan = s.wanIp?.wan?.ip;
  return html`
    <${PageHead} kicker="Protection" title="Accès & sécurité" sub=${wan ? `IP publique ${wan.address}${wan.cgnatenable ? ' (partagée)' : ''} · ${s.services?.services?.firewall?.enable ? 'pare-feu actif' : 'pare-feu inactif'}` : ''} />
    <${Tabs} tabs=${TABS} value=${tab} onChange=${setTab} label="Section" />
    ${tab === 'ports' && html`<${Ports} />`}
    ${tab === 'firewall' && html`<${Firewall} />`}
    ${tab === 'remote' && html`<${Remote} />`}`;
}

// ───────────── Ports & NAT ─────────────
function Ports() {
  const { data, reload } = useApi(['nat/rules', 'nat/dmz', 'upnp/igd', 'upnp/igd/rules'], { poll: 30000 });
  const [natR, dmzR, igdR, igdRules] = data;
  const nat = natR?.nat, dmz = dmzR?.nat?.dmz, igd = igdR?.upnp?.igd, upRules = igdRules?.upnp?.igd?.rules || [];
  const rules = nat?.rules || [];
  const s = useLive();
  const nameOf = (ip) => { const h = (s.hosts || []).find((x) => x.ipaddress === ip); return h ? displayName(h) : ip; };

  const editRule = (r) => openSheet(FormSheet, {
    fields: [
      { key: 'description', label: 'Description', required: true, placeholder: 'Ex. Serveur web, Minecraft…', validate: descErr },
      { key: 'protocol', label: 'Protocole', type: 'seg', options: [{ v: 'tcp', l: 'TCP' }, { v: 'udp', l: 'UDP' }, { v: 'all', l: 'Les deux' }] },
      { key: 'externalport', label: 'Port externe', required: true, inputmode: 'numeric', placeholder: '443 ou 8000-8100', validate: portErr, help: 'Port ouvert sur votre IP publique.' },
      { key: 'internalip', label: 'Appareil de destination', type: 'device', required: true, validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') },
      { key: 'internalport', label: 'Port interne', inputmode: 'numeric', placeholder: 'Identique si vide', validate: portErr },
      { key: 'externalip', label: 'Restreindre à une IP source', placeholder: 'Toutes si vide', validate: (v) => (!v || isIPv4(v) ? null : 'Adresse IPv4 invalide') },
    ],
    initial: r ? { description: r.description, protocol: r.protocol, externalport: r.externalport, internalip: r.internalip, internalport: r.internalport, externalip: r.externalip } : { protocol: 'tcp' },
    submitLabel: r ? 'Enregistrer' : 'Créer la redirection',
    onDelete: r ? () => act(() => api.del('nat/rules/' + r.id), { ok: 'Redirection supprimée' }).then(reload) : undefined,
    onSubmit: async (v) => {
      const body = { description: v.description.trim(), protocol: v.protocol, external_port: v.externalport.trim(), ipaddress: v.internalip.trim(), internal_port: (v.internalport || v.externalport).trim(), ipremote: (v.externalip || '').trim(), ipprotocol: 'IPv4', enable: r ? r.enable : 1 };
      await act(() => (r ? api.put('nat/rules/' + r.id, body) : api.post('nat/rules', body)), { ok: r ? 'Redirection modifiée' : 'Redirection créée' });
      reload(); refresh('statics');
    },
  }, { title: r ? 'Redirection de port' : 'Nouvelle redirection' });

  const editDmz = () => openSheet(FormSheet, {
    intro: 'La DMZ envoie vers un seul appareil tout le trafic entrant qui ne correspond à aucune redirection. Cet appareil est alors exposé à Internet : à réserver à une console ou un routeur secondaire bien protégé.',
    fields: [
      { key: 'ipaddress', label: 'Appareil exposé', type: 'device', required: true, validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') },
      { key: 'dnsprotect', label: 'Protection DNS', type: 'toggle', help: 'Bloque les requêtes DNS entrantes vers cet appareil.' },
    ],
    initial: { ipaddress: dmz?.ipaddress || '', dnsprotect: dmz?.dnsprotect ?? 1 }, danger: true, submitLabel: 'Activer la DMZ',
    onSubmit: async (v) => { await act(() => api.put('nat/dmz', { enable: 1, ipaddress: v.ipaddress.trim(), dnsprotect: Number(v.dnsprotect) ? 1 : 0 }), { ok: 'DMZ activée' }); reload(); },
  }, { title: 'DMZ' });

  return html`<div class="grid">
    <${Card} class="s8" flush=${true} title=${`Redirections de ports · ${rules.length}`} icon="network" action=${nat && html`<div class="hstack"><button class="link" onClick=${() => editRule(null)}><${Icon} name="plus" size=${16} />Ajouter</button><${Toggle} value=${nat.enable === 1} label="Redirections" onChange=${(nv) => act(() => api.put('nat/rules', { enable: nv ? 1 : 0 }), { ok: nv ? 'Redirections activées' : 'Redirections suspendues' }).then(reload)} /></div>`}>
      <p class="desc">Rend un service de votre réseau (serveur, caméra, jeu…) accessible depuis Internet.</p>
      <div class="list">${rules.length ? rules.map((r) => html`<div class="row tap" onClick=${(e) => !e.target.closest('.switch') && editRule(r)}>
        <span class="avatar sm" style="background:var(--brand-soft);color:var(--brand-ink)"><${Icon} name="link" size=${16} /></span>
        <div class="grow"><div class="t ellipsis">${r.description}</div><div class="s"><span class="num">${PROTO_L[r.protocol] || r.protocol} ${r.externalport}</span> → ${nameOf(r.internalip)}<span class="num">:${r.internalport || r.externalport}</span>${r.externalip ? ' · depuis ' + r.externalip : ''}</div></div>
        <${Toggle} value=${r.enable === 1} label=${r.description} onChange=${(nv) => act(() => api.put('nat/rules/' + r.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Redirection activée' : 'Redirection désactivée' }).then(reload)} />
      </div>`) : html`<${Empty} icon="network" title="Aucune redirection">Aucun port n’est ouvert vers vos appareils.</${Empty}>`}</div>
    </${Card}>

    <${Card} class="s4" title="DMZ" icon="globe" action=${dmz && html`<${Toggle} value=${dmz.enable === 1} label="DMZ"
        onChange=${async (nv) => { if (nv) { const ok = await editDmz(); if (!ok) throw new Error('cancel'); return; } await act(() => api.put('nat/dmz', { enable: 0, ipaddress: dmz.ipaddress || '' }), { ok: 'DMZ désactivée' }); reload(); }} />`}>
      <p class="desc" style="margin-bottom:10px">Expose entièrement un appareil à Internet.</p>
      ${dmz && html`<${KV} rows=${[['État', dmz.enable ? html`<span style="color:var(--warn)">Active</span>` : 'Inactive'], ['Appareil', dmz.ipaddress ? nameOf(dmz.ipaddress) : '—'], ['Protection DNS', dmz.dnsprotect ? 'Oui' : 'Non']]} />`}
      ${dmz?.enable === 1 && html`<button class="btn btn-ghost btn-sm" style="margin-top:12px" onClick=${editDmz}>Changer d’appareil</button>`}
    </${Card}>

    <${Card} class="s12" flush=${true} title=${`UPnP · ${upRules.length} ouverture(s)`} icon="sliders" action=${igd && html`<${Toggle} value=${igd.enable === 1} label="UPnP" onChange=${(nv) => act(() => api.put('upnp/igd', { enable: nv ? 1 : 0 }), { ok: nv ? 'UPnP activé' : 'UPnP désactivé (règles purgées)' }).then(reload)} />`}>
      <p class="desc">Permet aux consoles et applications d’ouvrir elles-mêmes les ports dont elles ont besoin. Désactiver puis réactiver l’UPnP purge toutes ces ouvertures.</p>
      <div class="list">${upRules.length ? upRules.map((r) => html`<div class="row" style="min-height:48px"><div class="grow"><div class="t ellipsis">${r.description || 'Ouverture automatique'}</div><div class="s"><span class="num">${(r.protocol || '').toUpperCase()} ${r.externalport}</span> → ${nameOf(r.internalip)}<span class="num">:${r.internalport}</span></div></div>${r.expire ? html`<span class="note">${dateTime(r.expire)}</span>` : ''}</div>`)
        : html`<${Empty} icon="sliders" title="Aucune ouverture automatique" />`}</div>
    </${Card}>
  </div>`;
}

// ───────────── Pare-feu ─────────────
function Firewall() {
  const { data, reload } = useApi(['firewall', 'firewall/rules', 'firewallv6/rules', 'firewallv6/level', 'firewall/pingresponder', 'firewall/gamermode'], { poll: 30000 });
  const [fw, r4, r6, lvl, ping, gamer] = data;
  const level = lvl?.firewall?.level;
  return html`<div class="grid">
    <${Card} class="s8" flush=${true} title="Pare-feu IPv4" icon="shield" action=${fw && html`<div class="hstack"><button class="link" onClick=${() => editFw('firewall/rules', 'IPv4', null, reload)}><${Icon} name="plus" size=${16} />Règle</button><${Toggle} value=${fw.firewall.enable === 1} label="Pare-feu"
        confirm=${(nv) => (nv ? null : { title: 'Désactiver le pare-feu ?', message: 'Les règles de filtrage ne s’appliqueront plus (le NAT continue de masquer vos appareils en IPv4).', confirm: 'Désactiver', tone: 'danger' })}
        onChange=${(nv) => act(() => api.put('firewall', { enable: nv ? 1 : 0 }), { ok: nv ? 'Pare-feu activé' : 'Pare-feu désactivé' }).then(() => { reload(); refresh('statics'); })} /></div>`}>
      <${FwRules} rules=${r4?.firewall?.rules} path="firewall/rules" ip="IPv4" reload=${reload} />
    </${Card}>
    <${Card} class="s4" title="Options" icon="sliders">
      <div class="list">
        ${ping && html`<${ToggleRow} title="Répondre au ping" sub="La Bbox répond aux ping venant d’Internet" value=${ping.firewall.pingresponder.enable === 1} onChange=${(nv) => act(() => api.put('firewall/pingresponder', { enable: nv ? 1 : 0, ip: ping.firewall.pingresponder.ip || '', ipv6: ping.firewall.pingresponder.ipv6 || '' }), { ok: 'Préférence enregistrée' }).then(reload)} />`}
        ${gamer && html`<${ToggleRow} title="Mode jeu" sub="Optimise le NAT pour le jeu en ligne (NAT ouvert)" value=${gamer.firewall.gamermode.enable === 1} onChange=${(nv) => act(() => api.put('firewall/gamermode', { enable: nv ? 1 : 0 }), { ok: nv ? 'Mode jeu activé' : 'Mode jeu désactivé' }).then(reload)} />`}
      </div>
    </${Card}>
    <${Card} class="s12" flush=${true} title="Pare-feu IPv6" icon="globe" action=${html`<button class="link" onClick=${() => editFw('firewallv6/rules', 'IPv6', null, reload)}><${Icon} name="plus" size=${16} />Règle</button>`}>
      <div style="padding:4px 20px 12px">
        <p class="desc" style="margin-bottom:10px">En IPv6, chaque appareil a une adresse publique : le niveau de sécurité décide de ce qui peut entrer.</p>
        ${level && html`<${Seg} options=${[{ v: 'Low', l: 'Faible' }, { v: 'Normal', l: 'Normal' }, { v: 'High', l: 'Élevé' }]} value=${level} label="Niveau IPv6"
          onChange=${async (v) => { if (v === level) return; if (await confirmDialog({ title: 'Changer le niveau IPv6 ?', message: v === 'Low' ? 'Faible : toutes les connexions entrantes sont autorisées vers vos appareils.' : v === 'High' ? 'Élevé : seules les connexions sortantes sont permises, ce qui peut gêner certains jeux ou la visio.' : 'Normal : connexions entrantes bloquées sauf règles explicites (recommandé).', confirm: 'Appliquer', tone: v === 'Low' ? 'danger' : 'warn' })) { await act(() => api.put('firewallv6/level', { level: v }), { ok: 'Niveau IPv6 enregistré' }); reload(); } }} />`}
      </div>
      <${FwRules} rules=${r6?.firewall?.rules} path="firewallv6/rules" ip="IPv6" reload=${reload} />
    </${Card}>
  </div>`;
}
function FwRules({ rules, path, ip, reload }) {
  if (!rules) return html`<div style="padding:0 20px 12px"><div class="skel" style="height:80px"></div></div>`;
  if (!rules.length) return html`<${Empty} icon="shield" title="Aucune règle" />`;
  return html`<div class="list">${rules.map((r) => html`<div class="row tap" onClick=${(e) => !e.target.closest('.switch') && editFw(path, ip, r, reload)}>
    <span class="avatar sm" style=${r.action === 'Drop' ? 'background:var(--danger-soft);color:var(--danger)' : 'background:var(--ok-soft);color:var(--ok)'}><${Icon} name=${r.action === 'Drop' ? 'x' : 'check'} size=${16} /></span>
    <div class="grow"><div class="t ellipsis">${r.description || 'Règle ' + r.id}</div><div class="s">${r.action === 'Drop' ? 'Bloque' : 'Autorise'} ${PROTO_L[r.protocols] || r.protocols}${r.dstports ? ' · ports ' + r.dstports : ''}${r.srcip ? ' · depuis ' + (r.srcipnot ? 'tout sauf ' : '') + r.srcip : ''}${r.dstip ? ' · vers ' + (r.dstipnot ? 'tout sauf ' : '') + r.dstip : ''}</div></div>
    ${r.utilisation > 0 && html`<span class="chip num hide-m" title="Utilisation">${r.utilisation} %</span>`}
    <${Toggle} value=${r.enable === 1} label=${r.description} onChange=${(nv) => act(() => api.put(path.replace('firewallv6/rules', 'firewallv6/rules') + '/' + r.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Règle activée' : 'Règle désactivée' }).then(reload)} />
  </div>`)}</div>`;
}
function editFw(path, ip, r, reload) {
  const delPath = path.startsWith('firewallv6') ? 'firewall/rules/' : path + '/'; // même chemin de suppression que l'interface officielle
  return openSheet(FormSheet, {
    fields: [
      { key: 'description', label: 'Description', required: true, validate: descErr },
      { key: 'action', label: 'Action', type: 'seg', options: [{ v: 'Drop', l: 'Bloquer' }, { v: 'Accept', l: 'Autoriser' }] },
      { key: 'protocols', label: 'Protocole', type: 'seg', options: [{ v: 'tcp', l: 'TCP' }, { v: 'udp', l: 'UDP' }, { v: 'tcp,udp', l: 'Les deux' }] },
      { key: 'dstports', label: 'Ports de destination', placeholder: 'Tous si vide (ex. 25,445 ou 6000-6100)', validate: portErr },
      { key: 'srcip', label: `Adresse source (${ip})`, placeholder: 'Toutes si vide' },
      { key: 'srcipnot', label: 'Inverser la source (tout sauf)', type: 'toggle', hidden: (v) => !v.srcip },
      { key: 'dstip', label: `Adresse de destination (${ip})`, placeholder: 'Toutes si vide' },
      { key: 'dstipnot', label: 'Inverser la destination (tout sauf)', type: 'toggle', hidden: (v) => !v.dstip },
      { key: 'srcports', label: 'Ports source', placeholder: 'Tous si vide', validate: portErr },
    ],
    initial: r ? { ...r } : { action: 'Drop', protocols: 'tcp,udp' },
    submitLabel: r ? 'Enregistrer' : 'Créer la règle',
    onDelete: r ? () => act(() => api.del(delPath + r.id), { ok: 'Règle supprimée' }).then(reload) : undefined,
    onSubmit: async (v) => {
      const body = { description: v.description.trim(), action: v.action, protocols: v.protocols, srcip: (v.srcip || '').trim(), srcipnot: v.srcip ? Number(v.srcipnot) || 0 : 0, dstip: (v.dstip || '').trim(), dstipnot: v.dstip ? Number(v.dstipnot) || 0 : 0, srcports: (v.srcports || '').trim(), dstports: (v.dstports || '').trim(), ipprotocol: ip, enable: r ? r.enable : 1 };
      await act(() => (r ? api.put(path + '/' + r.id, body) : api.post(path, body)), { ok: r ? 'Règle modifiée' : 'Règle créée' });
      reload();
    },
  }, { title: r ? 'Règle de pare-feu ' + ip : 'Nouvelle règle ' + ip });
}

// ───────────── Accès distant ─────────────
function Remote() {
  const s = useLive();
  const { data, reload } = useApi(['services', 'dyndns', 'remote/proxywol'], { poll: 30000 });
  const [svc, dd, wol] = data;
  const admin = svc?.services?.remote?.admin;
  const dyn = dd?.dyndns;
  const pub = s.wanIp?.wan?.ip?.address;
  const refreshAll = () => { reload(); refresh('statics'); };

  const editAdmin = (enable) => openSheet(FormSheet, {
    intro: 'Rend l’interface d’administration de la Bbox accessible depuis Internet. Elle n’est protégée que par le mot de passe administrateur : utilisez un mot de passe long et, si possible, limitez l’accès à une adresse IP.',
    fields: [
      { key: 'port', label: 'Port HTTPS', required: true, inputmode: 'numeric', validate: (v) => (/^\d+$/.test(v) && (+v === 443 || (+v >= 1024 && +v <= 65535)) ? null : 'Port 443 ou entre 1024 et 65535') },
      { key: 'ip', label: 'IP autorisée (IPv4)', placeholder: 'Toutes si vide', validate: (v) => (!v || isIPv4(v) ? null : 'Adresse IPv4 invalide') },
    ],
    initial: { port: String(admin.port || 443), ip: admin.ip || '' }, danger: enable, submitLabel: enable ? 'Ouvrir l’accès distant' : 'Enregistrer',
    onSubmit: async (v) => { await act(() => api.put('remote/admin', { enable: enable ? 1 : admin.enable, port: Number(v.port), ip: v.ip.trim() }), { ok: enable ? 'Accès distant ouvert' : 'Accès distant mis à jour' }); refreshAll(); },
  }, { title: 'Accès à distance' });

  const editDyn = (d) => openSheet(FormSheet, {
    fields: [
      { key: 'server', label: 'Fournisseur', type: 'select', options: (dyn?.servercapabilities || []).map((c) => ({ v: c.name, l: c.name })) },
      { key: 'host', label: 'Nom de domaine', required: true, placeholder: 'maison.example.org', validate: (v) => (/\s/.test(v) ? 'Pas d’espace' : v.length > 48 ? '48 caractères maximum' : null) },
      { key: 'username', label: 'Identifiant', required: true },
      { key: 'password', label: 'Mot de passe du compte DynDNS', type: 'password', required: !d, placeholder: d ? 'Inchangé si vide' : '' },
    ],
    initial: d ? { server: d.server, host: d.host, username: d.username } : { server: dyn?.servercapabilities?.[0]?.name },
    submitLabel: d ? 'Enregistrer' : 'Ajouter',
    onDelete: d ? () => act(() => api.del('dyndns/' + d.id), { ok: 'Domaine supprimé' }).then(reload) : undefined,
    onSubmit: async (v) => {
      const body = { server: v.server, host: v.host.trim(), username: v.username.trim(), record: 'A', enable: d ? d.enable : 1 };
      if (v.password) body.password = v.password;
      await act(() => (d ? api.put('dyndns/' + d.id, body) : api.post('dyndns', body)), { ok: d ? 'Domaine modifié' : 'Domaine ajouté' });
      reload();
    },
  }, { title: d ? 'Domaine DynDNS' : 'Nouveau domaine DynDNS' });

  return html`<div class="grid">
    <${Card} class="s6" title="Administration à distance" icon="external" action=${admin && html`<${Toggle} value=${admin.enable === 1} label="Accès distant"
        onChange=${async (nv) => { if (nv) { const ok = await editAdmin(true); if (!ok) throw new Error('cancel'); return; } await act(() => api.put('remote/admin', { enable: 0 }), { ok: 'Accès distant fermé' }); refreshAll(); }} />`}>
      ${admin ? html`
        ${admin.enable === 1 && html`<div class="banner" style="margin-bottom:12px"><${Icon} name="alert" size=${18} /><span>Accessible depuis Internet sur <b class="mono">https://${pub}:${admin.port}</b>${admin.ip ? ' depuis ' + admin.ip + ' uniquement' : ' depuis n’importe quelle adresse'}.</span></div>`}
        <${KV} rows=${[['État', admin.enable ? 'Ouvert' : 'Fermé'], ['Port', admin.port], ['IP autorisée', admin.ip || 'Toutes'], ['Activable', admin.activable ? 'Oui' : 'Non (mot de passe trop faible)']]} />
        ${admin.enable === 1 && html`<button class="btn btn-ghost btn-sm" style="margin-top:12px" onClick=${() => editAdmin(false)}>Modifier</button>`}
        <p class="note" style="margin-top:12px">Ce panel lui-même reste limité à votre réseau local.</p>` : html`<div class="skel" style="height:140px"></div>`}
    </${Card}>
    <${Card} class="s6" title="Réveil à distance (WoL)" icon="power" action=${wol && html`<${Toggle} value=${wol.proxywol.enable === 1} label="Réveil à distance" onChange=${(nv) => act(() => api.put('remote/proxywol', { enable: nv ? 1 : 0 }), { ok: nv ? 'Réveil à distance activé' : 'Réveil à distance désactivé' }).then(reload)} />`}>
      <p class="desc">Relaie les paquets « Wake-on-LAN » reçus d’Internet (port 9) vers un appareil du réseau pour l’allumer à distance.</p>
      ${wol && html`<div style="margin-top:12px"><${KV} rows=${[['État', wol.proxywol.enable ? 'Actif' : 'Inactif'], ['Appareil cible', wol.proxywol.ip || svc?.services?.remote?.proxywol?.ip || '—']]} /></div>
        <button class="btn btn-ghost btn-sm" style="margin-top:12px" onClick=${() => openSheet(FormSheet, { fields: [{ key: 'ip', label: 'Appareil à réveiller', type: 'device', required: true, validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') }], initial: { ip: wol.proxywol.ip || '' }, onSubmit: async (v) => { await act(() => api.put('remote/proxywol', { enable: 1, ip: v.ip.trim() }), { ok: 'Appareil cible enregistré' }); reload(); } }, { title: 'Réveil à distance' })}>Choisir l’appareil</button>`}
    </${Card}>
    <${Card} class="s12" flush=${true} title="DNS dynamique" icon="globe" action=${dyn && html`<div class="hstack"><button class="link" onClick=${() => editDyn(null)}><${Icon} name="plus" size=${16} />Domaine</button><${Toggle} value=${dyn.enable === 1} label="DynDNS" onChange=${(nv) => act(() => api.put('dyndns', { enable: nv ? 1 : 0 }), { ok: nv ? 'DynDNS activé' : 'DynDNS désactivé' }).then(reload)} /></div>`}>
      <p class="desc">Associe un nom de domaine fixe à votre adresse IP publique (${pub || '—'}), mis à jour automatiquement par la Bbox.</p>
      <div class="list">${dyn?.domain?.length ? dyn.domain.map((d) => html`<div class="row tap" onClick=${(e) => !e.target.closest('.switch') && editDyn(d)}><div class="grow"><div class="t">${d.host}</div><div class="s">${d.server} · ${d.status || d.state || ''}</div></div><${Toggle} value=${d.enable === 1} label=${d.host} onChange=${(nv) => act(() => api.put('dyndns/' + d.id, { enable: nv ? 1 : 0 }), { ok: 'Domaine mis à jour' }).then(reload)} /></div>`)
        : html`<${Empty} icon="globe" title="Aucun domaine">Fournisseurs pris en charge : ${(dyn?.servercapabilities || []).map((c) => c.name).join(', ')}.</${Empty}>`}</div>
    </${Card}>
  </div>`;
}
