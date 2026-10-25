// Accès & sécurité : redirections de ports, DMZ, UPnP, pare-feu v4/v6, accès distant, DynDNS.
import { useState, type ComponentProps, type ReactNode } from 'react';
import { PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Empty, Seg, Tabs, Skeleton, Avatar, Row, Note, Banner, FormSheet } from '@/components/kit';
import { openSheet, confirm as confirmDialog } from '@/components/overlays';
import { api } from '@/lib/api';
import { act, useApi } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { isIPv4, isPortSpec, displayName, dateTime, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import type { Route } from '@/lib/router';

type FormProps = Omit<ComponentProps<typeof FormSheet>, 'close'>;

const PROTO_L: Record<string, string> = { tcp: 'TCP', udp: 'UDP', all: 'TCP + UDP', 'tcp,udp': 'TCP + UDP' };
const descErr = (v: string) => (!v?.trim() ? 'Description requise' : v.length > 48 ? '48 caractères maximum' : /[?;\\&/>]/.test(v) ? 'Caractères ? ; \\ & / > interdits' : null);
const portErr = (v: string) => (!v ? null : isPortSpec(v) && String(v).split(/[,:-]/).every((p) => +p >= 1 && +p <= 65535) ? null : 'Port ou plage invalide (ex. 443 ou 8000-8100)');
const TABS = [{ v: 'ports', l: 'Ports & NAT' }, { v: 'firewall', l: 'Pare-feu' }, { v: 'remote', l: 'Accès distant' }];
const GRID = 'grid grid-cols-1 gap-4 lg:grid-cols-12';

/** Isole un contrôle placé dans une rangée cliquable */
function Stop({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{children}</span>;
}
/** Bouton « + Ajouter » d'en-tête de carte (icône seule sur iPhone) */
function AddBtn({ onClick, children }: { onClick: () => unknown; children: string }) {
  return <Btn kind="plain" size="sm" icon="plus" title={children} onClick={() => { onClick(); }} className="max-sm:w-10 max-sm:px-0"><span className="max-sm:sr-only">{children}</span></Btn>;
}
/** Description sous l'en-tête d'une carte « flush » */
function Desc({ children, className }: { children: ReactNode; className?: string }) {
  return <Note className={cn('px-5 pb-2 text-[13.5px] max-sm:px-4', className)}>{children}</Note>;
}
/** Liste clé → valeur dont les valeurs longues passent à la ligne au lieu de déborder */
function Facts({ rows }: { rows: ComponentProps<typeof KV>['rows'] }) {
  return <div className="min-w-0 [&_dd]:shrink"><KV rows={rows} /></div>;
}
const rowT = 'truncate text-[14.5px] font-medium clair:font-semibold';
const rowS = 'truncate text-[12.5px] text-muted-foreground';

export default function Security({ route }: { route: Route }) {
  const [tab, setTab] = useState<string>(() => (TABS.some((t) => t.v === route?.arg) ? route.arg : 'ports'));
  const s = useLive();
  const wan = s.wanIp?.wan?.ip;
  return (
    <>
      <PageHead kicker="Protection" title="Accès & sécurité"
        sub={wan ? <>IP publique <WanIp className="num" ip={wan.address} />{wan.cgnatenable ? ' (partagée)' : ''} · {s.services?.services?.firewall?.enable ? 'pare-feu actif' : 'pare-feu inactif'}</> : ''} />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Section" />
      {tab === 'ports' && <Ports />}
      {tab === 'firewall' && <Firewall />}
      {tab === 'remote' && <Remote />}
    </>
  );
}

// ───────────── Ports & NAT ─────────────
function Ports() {
  const { data, reload } = useApi<any[]>(['nat/rules', 'nat/dmz', 'upnp/igd', 'upnp/igd/rules'], { poll: 30000 });
  const [natR, dmzR, igdR, igdRules] = data;
  const nat = natR?.nat, dmz = dmzR?.nat?.dmz, igd = igdR?.upnp?.igd, upRules: any[] = igdRules?.upnp?.igd?.rules || [];
  const rules: any[] = nat?.rules || [];
  const s = useLive();
  const nameOf = (ip: string) => { const h = (s.hosts || []).find((x) => x.ipaddress === ip); return h ? displayName(h) : ip; };

  const editRule = (r: any) => openSheet<typeof FormSheet>(FormSheet, {
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

  const editDmz = () => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'La DMZ envoie vers un seul appareil tout le trafic entrant qui ne correspond à aucune redirection. Cet appareil est alors exposé à Internet : à réserver à une console ou un routeur secondaire bien protégé.',
    fields: [
      { key: 'ipaddress', label: 'Appareil exposé', type: 'device', required: true, validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') },
      { key: 'dnsprotect', label: 'Protection DNS', type: 'toggle', help: 'Bloque les requêtes DNS entrantes vers cet appareil.' },
    ],
    initial: { ipaddress: dmz?.ipaddress || '', dnsprotect: dmz?.dnsprotect ?? 1 }, danger: true, submitLabel: 'Activer la DMZ',
    onSubmit: async (v) => { await act(() => api.put('nat/dmz', { enable: 1, ipaddress: v.ipaddress.trim(), dnsprotect: Number(v.dnsprotect) ? 1 : 0 }), { ok: 'DMZ activée' }); reload(); },
  }, { title: 'DMZ' });

  return (
    <div className={GRID}>
      <Card className="lg:col-span-8" flush title={`Redirections de ports · ${rules.length}`} icon="network"
        action={nat && (
          <>
            <AddBtn onClick={() => editRule(null)}>Ajouter</AddBtn>
            <Toggle value={nat.enable === 1} label="Redirections" onChange={(nv) => act(() => api.put('nat/rules', { enable: nv ? 1 : 0 }), { ok: nv ? 'Redirections activées' : 'Redirections suspendues' }).then(reload)} />
          </>
        )}>
        <Desc>Rend un service de votre réseau (serveur, caméra, jeu…) accessible depuis Internet.</Desc>
        <div>
          {rules.length ? rules.map((r) => (
            <Row key={r.id} onClick={() => editRule(r)}>
              <Avatar icon="link" size="sm" tone="brand" />
              <div className="min-w-0 flex-1">
                <div className={rowT}>{r.description}</div>
                <div className={rowS}><span className="num">{PROTO_L[r.protocol] || r.protocol} {r.externalport}</span> → {nameOf(r.internalip)}<span className="num">:{r.internalport || r.externalport}</span>{r.externalip ? ' · depuis ' + r.externalip : ''}</div>
              </div>
              <Stop>
                <Toggle value={r.enable === 1} label={r.description} onChange={(nv) => act(() => api.put('nat/rules/' + r.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Redirection activée' : 'Redirection désactivée' }).then(reload)} />
              </Stop>
            </Row>
          )) : natR ? <Empty icon="network" title="Aucune redirection">Aucun port n’est ouvert vers vos appareils.</Empty> : <div className="px-5 pb-3 max-sm:px-4"><Skeleton h={110} /></div>}
        </div>
      </Card>

      <Card className="lg:col-span-4" title="DMZ" icon="globe"
        action={dmz && (
          <Toggle value={dmz.enable === 1} label="DMZ"
            onChange={async (nv) => {
              if (nv) { const ok = await editDmz(); if (!ok) throw new Error('cancel'); return; }
              await act(() => api.put('nat/dmz', { enable: 0, ipaddress: dmz.ipaddress || '' }), { ok: 'DMZ désactivée' }); reload();
            }} />
        )}>
        <Note className="mb-2.5 text-[13.5px]">Expose entièrement un appareil à Internet.</Note>
        {dmz ? (
          <Facts rows={[
            ['État', dmz.enable ? <span className="text-warn">Active</span> : 'Inactive'],
            ['Appareil', dmz.ipaddress ? nameOf(dmz.ipaddress) : '—'],
            ['Protection DNS', dmz.dnsprotect ? 'Oui' : 'Non'],
          ]} />
        ) : !dmzR && <Skeleton h={96} />}
        {dmz?.enable === 1 && <Btn kind="ghost" size="sm" className="mt-3" onClick={() => { editDmz(); }}>Changer d’appareil</Btn>}
      </Card>

      <Card className="lg:col-span-12" flush title={`UPnP · ${plural(upRules.length, 'ouverture')}`} icon="sliders"
        action={igd && <Toggle value={igd.enable === 1} label="UPnP" onChange={(nv) => act(() => api.put('upnp/igd', { enable: nv ? 1 : 0 }), { ok: nv ? 'UPnP activé' : 'UPnP désactivé (règles purgées)' }).then(reload)} />}>
        <Desc>Permet aux consoles et applications d’ouvrir elles-mêmes les ports dont elles ont besoin. Désactiver puis réactiver l’UPnP purge toutes ces ouvertures.</Desc>
        <div>
          {upRules.length ? upRules.map((r, i) => (
            <Row key={r.id ?? i} className="min-h-[48px]">
              <div className="min-w-0 flex-1">
                <div className={rowT}>{r.description || 'Ouverture automatique'}</div>
                <div className={rowS}><span className="num">{String(r.protocol || '').toUpperCase()} {r.externalport}</span> → {nameOf(r.internalip)}<span className="num">:{r.internalport}</span></div>
              </div>
              {r.expire ? <span className="num shrink-0 text-[12.5px] text-muted-foreground">{dateTime(r.expire)}</span> : null}
            </Row>
          )) : <Empty icon="sliders" title="Aucune ouverture automatique" />}
        </div>
      </Card>
    </div>
  );
}

// ───────────── Pare-feu ─────────────
const LEVELS = [{ v: 'Low', l: 'Faible' }, { v: 'Normal', l: 'Normal' }, { v: 'High', l: 'Élevé' }];
function Firewall() {
  const { data, reload } = useApi<any[]>(['firewall', 'firewall/rules', 'firewallv6/rules', 'firewallv6/level', 'firewall/pingresponder', 'firewall/gamermode'], { poll: 30000 });
  const [fw, r4, r6, lvl, ping, gamer] = data;
  const level = lvl?.firewall?.level;
  const setLevel = async (v: string) => {
    if (v === level) return;
    const ok = await confirmDialog({
      title: 'Changer le niveau IPv6 ?',
      message: v === 'Low' ? 'Faible : toutes les connexions entrantes sont autorisées vers vos appareils.' : v === 'High' ? 'Élevé : seules les connexions sortantes sont permises, ce qui peut gêner certains jeux ou la visio.' : 'Normal : connexions entrantes bloquées sauf règles explicites (recommandé).',
      confirm: 'Appliquer', tone: v === 'Low' ? 'danger' : 'warn', icon: 'shield',
    });
    if (ok) await act(() => api.put('firewallv6/level', { level: v }), { ok: 'Niveau IPv6 enregistré' }).then(reload, () => {});
  };
  return (
    <div className={GRID}>
      <Card className="lg:col-span-8" flush title="Pare-feu IPv4" icon="shield"
        action={fw && (
          <>
            <AddBtn onClick={() => editFw('firewall/rules', 'IPv4', null, reload)}>Règle</AddBtn>
            <Toggle value={fw.firewall?.enable === 1} label="Pare-feu"
              confirm={(nv) => (nv ? null : { title: 'Désactiver le pare-feu ?', message: 'Les règles de filtrage ne s’appliqueront plus (le NAT continue de masquer vos appareils en IPv4).', confirm: 'Désactiver', tone: 'danger', icon: 'shield' })}
              onChange={(nv) => act(() => api.put('firewall', { enable: nv ? 1 : 0 }), { ok: nv ? 'Pare-feu activé' : 'Pare-feu désactivé' }).then(() => { reload(); refresh('statics'); })} />
          </>
        )}>
        <FwRules rules={r4?.firewall?.rules} path="firewall/rules" ip="IPv4" reload={reload} />
      </Card>

      <Card className="lg:col-span-4" title="Options" icon="sliders">
        {ping && (
          <ToggleRow title="Répondre au ping" sub="La Bbox répond aux ping venant d’Internet" value={ping.firewall?.pingresponder?.enable === 1}
            onChange={(nv) => act(() => api.put('firewall/pingresponder', { enable: nv ? 1 : 0, ip: ping.firewall.pingresponder.ip || '', ipv6: ping.firewall.pingresponder.ipv6 || '' }), { ok: 'Préférence enregistrée' }).then(reload)} />
        )}
        {gamer && (
          <ToggleRow title="Mode jeu" sub="Optimise le NAT pour le jeu en ligne (NAT ouvert)" value={gamer.firewall?.gamermode?.enable === 1}
            onChange={(nv) => act(() => api.put('firewall/gamermode', { enable: nv ? 1 : 0 }), { ok: nv ? 'Mode jeu activé' : 'Mode jeu désactivé' }).then(reload)} />
        )}
        {!ping && !gamer && <Skeleton h={110} />}
      </Card>

      <Card className="lg:col-span-12" flush title="Pare-feu IPv6" icon="globe" action={<AddBtn onClick={() => editFw('firewallv6/rules', 'IPv6', null, reload)}>Règle</AddBtn>}>
        <div className="grid gap-3 px-5 pb-3 pt-1 max-sm:px-4">
          <Note className="text-[13.5px]">En IPv6, chaque appareil a une adresse publique : le niveau de sécurité décide de ce qui peut entrer.</Note>
          {level && <div><Seg options={LEVELS} value={level} label="Niveau IPv6" onChange={setLevel} /></div>}
        </div>
        <div className="border-t border-border">
          <FwRules rules={r6?.firewall?.rules} path="firewallv6/rules" ip="IPv6" reload={reload} />
        </div>
      </Card>
    </div>
  );
}

function FwRules({ rules, path, ip, reload }: { rules?: any[]; path: string; ip: 'IPv4' | 'IPv6'; reload: () => void }) {
  if (!rules) return <div className="px-5 pb-3 pt-2 max-sm:px-4"><Skeleton h={80} /></div>;
  if (!rules.length) return <Empty icon="shield" title="Aucune règle" />;
  return (
    <div>
      {rules.map((r) => {
        const drop = r.action === 'Drop';
        return (
          <Row key={r.id} onClick={() => editFw(path, ip, r, reload)}>
            <Avatar icon={drop ? 'x' : 'check'} size="sm" tone={drop ? 'danger' : 'ok'} />
            <div className="min-w-0 flex-1">
              <div className={rowT}>{r.description || 'Règle ' + r.id}</div>
              <div className={rowS}>
                {drop ? 'Bloque' : 'Autorise'} {PROTO_L[r.protocols] || r.protocols}{r.dstports ? ' · ports ' + r.dstports : ''}{r.srcip ? ' · depuis ' + (r.srcipnot ? 'tout sauf ' : '') + r.srcip : ''}{r.dstip ? ' · vers ' + (r.dstipnot ? 'tout sauf ' : '') + r.dstip : ''}
              </div>
            </div>
            {r.utilisation > 0 && <span title="Utilisation" className="max-sm:hidden"><Chip><span className="num">{r.utilisation} %</span></Chip></span>}
            <Stop>
              <Toggle value={r.enable === 1} label={r.description}
                onChange={(nv) => act(() => api.put(path + '/' + r.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Règle activée' : 'Règle désactivée' }).then(reload)} />
            </Stop>
          </Row>
        );
      })}
    </div>
  );
}

function editFw(path: string, ip: 'IPv4' | 'IPv6', r: any, reload: () => void) {
  const delPath = path.startsWith('firewallv6') ? 'firewall/rules/' : path + '/'; // même chemin de suppression que l'interface officielle
  return openSheet<typeof FormSheet>(FormSheet, {
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
  const { data, reload } = useApi<any[]>(['services', 'dyndns', 'remote/proxywol'], { poll: 30000 });
  const [svc, dd, wol] = data;
  const admin = svc?.services?.remote?.admin;
  const dyn = dd?.dyndns;
  const pub = s.wanIp?.wan?.ip?.address;
  const refreshAll = () => { reload(); refresh('statics'); };

  const editAdmin = (enable: boolean) => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'Rend l’interface d’administration de la Bbox accessible depuis Internet. Elle n’est protégée que par le mot de passe administrateur : utilisez un mot de passe long et, si possible, limitez l’accès à une adresse IP.',
    fields: [
      { key: 'port', label: 'Port HTTPS', required: true, inputmode: 'numeric', validate: (v) => (/^\d+$/.test(v) && (+v === 443 || (+v >= 1024 && +v <= 65535)) ? null : 'Port 443 ou entre 1024 et 65535') },
      { key: 'ip', label: 'IP autorisée (IPv4)', placeholder: 'Toutes si vide', validate: (v) => (!v || isIPv4(v) ? null : 'Adresse IPv4 invalide') },
    ],
    initial: { port: String(admin.port || 443), ip: admin.ip || '' }, danger: enable, submitLabel: enable ? 'Ouvrir l’accès distant' : 'Enregistrer',
    onSubmit: async (v) => { await act(() => api.put('remote/admin', { enable: enable ? 1 : admin.enable, port: Number(v.port), ip: v.ip.trim() }), { ok: enable ? 'Accès distant ouvert' : 'Accès distant mis à jour' }); refreshAll(); },
  }, { title: 'Accès à distance' });

  const editDyn = (d: any) => openSheet<typeof FormSheet>(FormSheet, {
    fields: [
      { key: 'server', label: 'Fournisseur', type: 'select', options: (dyn?.servercapabilities || []).map((c: any) => ({ v: c.name, l: c.name })) },
      { key: 'host', label: 'Nom de domaine', required: true, placeholder: 'maison.example.org', validate: (v) => (/\s/.test(v) ? 'Pas d’espace' : v.length > 48 ? '48 caractères maximum' : null) },
      { key: 'username', label: 'Identifiant', required: true },
      { key: 'password', label: 'Mot de passe du compte DynDNS', type: 'password', required: !d, placeholder: d ? 'Inchangé si vide' : '' },
    ],
    initial: d ? { server: d.server, host: d.host, username: d.username } : { server: dyn?.servercapabilities?.[0]?.name },
    submitLabel: d ? 'Enregistrer' : 'Ajouter',
    onDelete: d ? () => act(() => api.del('dyndns/' + d.id), { ok: 'Domaine supprimé' }).then(reload) : undefined,
    onSubmit: async (v) => {
      const body: Record<string, any> = { server: v.server, host: v.host.trim(), username: v.username.trim(), record: 'A', enable: d ? d.enable : 1 };
      if (v.password) body.password = v.password;
      await act(() => (d ? api.put('dyndns/' + d.id, body) : api.post('dyndns', body)), { ok: d ? 'Domaine modifié' : 'Domaine ajouté' });
      reload();
    },
  }, { title: d ? 'Domaine DynDNS' : 'Nouveau domaine DynDNS' });

  const pickWol = () => openSheet<typeof FormSheet>(FormSheet, {
    fields: [{ key: 'ip', label: 'Appareil à réveiller', type: 'device', required: true, validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') }],
    initial: { ip: wol?.proxywol?.ip || '' },
    onSubmit: async (v) => { await act(() => api.put('remote/proxywol', { enable: 1, ip: v.ip.trim() }), { ok: 'Appareil cible enregistré' }); reload(); },
  }, { title: 'Réveil à distance' });

  return (
    <div className={GRID}>
      <Card className="lg:col-span-6" title="Administration à distance" icon="external"
        action={admin && (
          <Toggle value={admin.enable === 1} label="Accès distant"
            onChange={async (nv) => {
              if (nv) { const ok = await editAdmin(true); if (!ok) throw new Error('cancel'); return; }
              await act(() => api.put('remote/admin', { enable: 0 }), { ok: 'Accès distant fermé' }); refreshAll();
            }} />
        )}>
        {admin ? (
          <>
            {admin.enable === 1 && (
              <Banner tone="warn" icon="alert" className="mb-3 items-start [&>svg]:mt-0.5">
                Accessible depuis Internet sur <b className="font-mono [overflow-wrap:anywhere]">https://<WanIp ip={pub} />:{admin.port}</b>{admin.ip ? <> depuis <WanIp ip={admin.ip} /> uniquement</> : ' depuis n’importe quelle adresse'}.
              </Banner>
            )}
            <Facts rows={[
              ['État', admin.enable ? 'Ouvert' : 'Fermé'],
              ['Port', <span className="num">{admin.port}</span>],
              ['IP autorisée', admin.ip ? <WanIp className="num" ip={admin.ip} /> : 'Toutes'],
              ['Activable', admin.activable ? 'Oui' : 'Non (mot de passe trop faible)'],
            ]} />
            {admin.enable === 1 && <Btn kind="ghost" size="sm" className="mt-3" onClick={() => { editAdmin(false); }}>Modifier</Btn>}
            <Note className="mt-3">Ce panel lui-même reste limité à votre réseau local.</Note>
          </>
        ) : <Skeleton h={140} />}
      </Card>

      <Card className="lg:col-span-6" title="Réveil à distance (WoL)" icon="power"
        action={wol && <Toggle value={wol.proxywol?.enable === 1} label="Réveil à distance" onChange={(nv) => act(() => api.put('remote/proxywol', { enable: nv ? 1 : 0 }), { ok: nv ? 'Réveil à distance activé' : 'Réveil à distance désactivé' }).then(reload)} />}>
        <Note className="text-[13.5px]">Relaie les paquets « Wake-on-LAN » reçus d’Internet (port 9) vers un appareil du réseau pour l’allumer à distance.</Note>
        {wol ? (
          <>
            <div className="mt-3">
              <Facts rows={[
                ['État', wol.proxywol?.enable ? 'Actif' : 'Inactif'],
                ['Appareil cible', <span className="num">{wol.proxywol?.ip || svc?.services?.remote?.proxywol?.ip || '—'}</span>],
              ]} />
            </div>
            <Btn kind="ghost" size="sm" className="mt-3" onClick={() => { pickWol(); }}>Choisir l’appareil</Btn>
          </>
        ) : <Skeleton h={80} className="mt-3" />}
      </Card>

      <Card className="lg:col-span-12" flush title="DNS dynamique" icon="globe"
        action={dyn && (
          <>
            <AddBtn onClick={() => editDyn(null)}>Domaine</AddBtn>
            <Toggle value={dyn.enable === 1} label="DynDNS" onChange={(nv) => act(() => api.put('dyndns', { enable: nv ? 1 : 0 }), { ok: nv ? 'DynDNS activé' : 'DynDNS désactivé' }).then(reload)} />
          </>
        )}>
        <Desc>Associe un nom de domaine fixe à votre adresse IP publique (<WanIp className="num" ip={pub} />), mis à jour automatiquement par la Bbox.</Desc>
        <div>
          {dyn?.domain?.length ? dyn.domain.map((d: any, i: number) => (
            <Row key={d.id ?? i} onClick={() => editDyn(d)}>
              <div className="min-w-0 flex-1">
                <div className={rowT}>{d.host}</div>
                <div className={rowS}>{d.server} · {d.status || d.state || ''}</div>
              </div>
              <Stop>
                <Toggle value={d.enable === 1} label={d.host} onChange={(nv) => act(() => api.put('dyndns/' + d.id, { enable: nv ? 1 : 0 }), { ok: 'Domaine mis à jour' }).then(reload)} />
              </Stop>
            </Row>
          )) : dd ? (
            <Empty icon="globe" title="Aucun domaine">Fournisseurs pris en charge : {(dyn?.servercapabilities || []).map((c: any) => c.name).join(', ')}.</Empty>
          ) : <div className="px-5 pb-3 max-sm:px-4"><Skeleton h={90} /></div>}
        </div>
      </Card>
    </div>
  );
}
