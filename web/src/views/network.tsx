// Réseau local : adresse de la Bbox, ports Ethernet en direct, DHCP, baux fixes, IPv6.
import type { ComponentProps, ReactNode } from 'react';
import { PageHead, Card, KV, Toggle, Btn, Chip, Empty, Skeleton, Avatar, Row, Note, IconBtn, FormSheet, toast } from '@/components/kit';
import { openSheet, confirm as confirmDialog } from '@/components/overlays';
import { api } from '@/lib/api';
import { act, useApi } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { kbps, bytes, isIPv4, isMac, displayName, plural, bboxHostname } from '@/lib/format';
import { setAlias } from '@/lib/prefs';
import { nameField } from '@/components/sheets';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import type { Route } from '@/lib/router';

type FormProps = Omit<ComponentProps<typeof FormSheet>, 'close'>;
type KVRow = [ReactNode, ReactNode];

const ipNum = (ip: string) => String(ip).split('.').reduce((a, b) => a * 256 + Number(b), 0);
const sameSubnet = (ip: string, base: string) => ip.split('.').slice(0, 3).join('.') === base.split('.').slice(0, 3).join('.');
const LEASES = [{ v: '60', l: '1 heure' }, { v: '240', l: '4 heures' }, { v: '720', l: '12 heures' }, { v: '1440', l: '24 heures' }, { v: '2880', l: '2 jours' }, { v: '10080', l: '7 jours' }];

/** Valeur technique (adresses, préfixes) en chasse fixe */
function Mono({ children, sm }: { children: ReactNode; sm?: boolean }) {
  return <span className={cn('font-mono tracking-normal', sm ? 'text-[12px]' : 'text-[0.92em]')}>{children}</span>;
}
/** Liste clé → valeur dont les valeurs longues (IPv6…) passent à la ligne au lieu de déborder */
function Facts({ rows }: { rows: ComponentProps<typeof KV>['rows'] }) {
  return <div className="min-w-0 [&_dd]:shrink"><KV rows={rows} /></div>;
}
/** Isole un contrôle placé dans une rangée cliquable */
function Stop({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{children}</span>;
}
/** Bouton « + Ajouter » d'en-tête de carte (icône seule sur iPhone) */
function AddBtn({ onClick, children }: { onClick: () => unknown; children: string }) {
  return <Btn kind="plain" size="sm" icon="plus" title={children} onClick={() => { onClick(); }} className="max-sm:w-10 max-sm:px-0"><span className="max-sm:sr-only">{children}</span></Btn>;
}

export default function Network({ route: _route }: { route: Route }) {
  const s = useLive();
  const { data, reload } = useApi<any[]>(['lan/ip', 'dhcp', 'dhcp/clients', 'dhcp/options', 'dhcp6/prefixdelegation', 'device/led', 'lan/stats'], { poll: 20000 });
  const [lan, dhcpR, clientsR, optsR, pdR, led, lanStats] = data;
  const ip = lan?.lan?.ip, dhcp = dhcpR?.dhcp, clients: any[] = clientsR?.dhcp?.clients || [], ports: any[] = lan?.lan?.switch?.ports || [];
  const ethPorts: any[] = led?.ethernetPort || [];
  const lanBase: string = ip?.ipaddress || '192.168.1.254';
  const hostsByMac: Record<string, any> = Object.fromEntries((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h]));
  const ethHosts = (s.hosts || []).filter((h) => h.active && /Ethernet/.test(h.link || ''));
  const dhcp6 = s.services?.services?.dhcp6;
  const caps: any[] | undefined = optsR?.dhcp?.optionscapabilities;
  const options: any[] = [...(optsR?.dhcp?.optionsstatic || []).map((o: any) => ({ ...o, fixed: true })), ...(optsR?.dhcp?.options || [])];
  const aliases = String(ip?.aliases || '').split(',').filter(Boolean);

  const editDhcp = () => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'Plage d’adresses distribuées automatiquement aux appareils. Les baux fixes doivent rester dans le même sous-réseau.',
    fields: [
      { key: 'minaddress', label: 'Première adresse', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Doit être dans ' + lanBase.split('.').slice(0, 3).join('.') + '.x' : v === lanBase ? 'C’est l’adresse de la Bbox' : null) },
      { key: 'maxaddress', label: 'Dernière adresse', required: true, inputmode: 'decimal', validate: (v, a) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Même sous-réseau requis' : isIPv4(a.minaddress) && ipNum(v) < ipNum(a.minaddress) ? 'Doit suivre la première adresse' : v === lanBase ? 'C’est l’adresse de la Bbox' : null) },
      { key: 'lease', label: 'Durée du bail', type: 'select', options: LEASES },
    ],
    initial: { minaddress: dhcp.minaddress, maxaddress: dhcp.maxaddress, lease: String(Math.round(dhcp.leasetime / 60)) },
    onSubmit: async (v) => { await act(() => api.put('dhcp', { enable: dhcp.enable, minaddress: v.minaddress.trim(), maxaddress: v.maxaddress.trim(), leasetime: Number(v.lease) * 60 }), { ok: 'Serveur DHCP mis à jour' }); reload(); },
  }, { title: 'Serveur DHCP' });

  const editClient = (c: any) => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'L’appareil recevra toujours la même adresse IP. Le nom s’affiche dans la liste des appareils.',
    fields: [
      { key: 'macaddress', label: 'Appareil', type: 'device', mode: 'mac', required: true, validate: (v) => (isMac(v) ? null : 'Adresse MAC invalide') },
      nameField('Nom'),
      { key: 'ipaddress', label: 'Adresse IP réservée', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !sameSubnet(v, lanBase) ? 'Même sous-réseau que la Bbox requis' : v === lanBase ? 'C’est l’adresse de la Bbox' : clients.some((x) => x.ipaddress === v && x.id !== c?.id) ? 'Adresse déjà réservée' : null) },
    ],
    initial: c ? { macaddress: c.macaddress, hostname: displayName({ ...(hostsByMac[String(c.macaddress).toLowerCase()] || {}), macaddress: c.macaddress, hostname: c.hostname }), ipaddress: c.ipaddress } : {},
    submitLabel: c ? 'Enregistrer' : 'Réserver',
    onDelete: c ? () => act(() => api.del('dhcp/clients/' + c.id), { ok: 'Réservation supprimée' }).then(reload) : undefined,
    deleteLabel: 'Supprimer',
    onSubmit: async (v) => {
      const pretty = String(v.hostname).trim(), hostname = bboxHostname(pretty), mac = v.macaddress.trim().toLowerCase();
      const body = { enable: c ? c.enable : 1, hostname, macaddress: mac, ipaddress: v.ipaddress.trim() };
      await act(() => (c ? api.put('dhcp/clients/' + c.id, body) : api.post('dhcp/clients', body)), { ok: c ? 'Réservation modifiée' : 'Adresse réservée' });
      await setAlias(mac, pretty !== hostname ? pretty : null).catch(() => {});
      reload(); refresh('hosts');
    },
  }, { title: c ? 'Bail fixe' : 'Réserver une adresse' });

  const changeIp = () => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'Opération sensible : la Bbox redémarre son réseau local. Tous les appareils changent d’adresse et les redirections de ports vers l’ancienne plage cessent de fonctionner. Le panel continuera de joindre la Bbox via mabbox.bytel.fr.',
    fields: [{ key: 'ipaddress', label: 'Nouvelle adresse de la Bbox', required: true, inputmode: 'decimal', validate: (v) => (!isIPv4(v) ? 'Adresse invalide' : !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(v) ? 'Utilisez une adresse privée (192.168.x.x, 10.x.x.x…)' : null) }],
    initial: { ipaddress: lanBase }, danger: true, submitLabel: 'Vérifier puis appliquer',
    onSubmit: async (v) => {
      const r = await act(() => api.put('lan', { ipaddress: v.ipaddress.trim(), validate: 1 }), { silent: true });
      const ok = (Array.isArray(r) ? r[0] : r)?.status;
      if (ok === 0) { toast('La Bbox refuse cette adresse', 'err'); throw new Error('refused'); }
      if (!(await confirmDialog({ title: `Passer la Bbox en ${v.ipaddress} ?`, message: 'Le réseau local va redémarrer : la connexion sera coupée une minute environ.', confirm: 'Changer l’adresse', tone: 'danger', icon: 'alert' }))) throw new Error('cancel');
      await act(() => api.put('lan', { ipaddress: v.ipaddress.trim() }), { ok: 'Adresse modifiée : le réseau redémarre' });
    },
  }, { title: 'Adresse de la Bbox' });

  return (
    <>
      <PageHead kicker="LAN" title="Réseau local" sub={ip ? <><span className="num">{ip.ipaddress} / {ip.netmask}</span> · {clients.length ? plural(clients.length, 'bail fixe', 'baux fixes') : 'aucun bail fixe'}</> : '…'} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7" title="Ports Ethernet" icon="ethernet"
          action={<span className="flex items-center gap-2 text-[12.5px] text-muted-foreground"><span className="live-dot" />trafic en direct</span>}>
          {!lan && !led ? <Skeleton h={150} /> : (
            <div className="grid grid-cols-[repeat(auto-fit,minmax(110px,1fr))] gap-2 geist:-mx-2 geist:grid-cols-1 geist:gap-0">
              {(ethPorts.length ? ethPorts : ports).map((p: any) => {
                const sw = ports.find((x) => x.id === p.id) || {};
                const lp = (s.lanPorts || []).find((x: any) => x.index === p.id) || { down: 0, up: 0 };
                const up = (p.state || sw.state) === 'Up';
                const who = ethHosts.filter((h) => h.ethernet?.logicalport === p.id);
                const speed = sw.link_mode ? String(sw.link_mode).replace(/baseT.*/, '').replace(/^1000$/, '1 Gb/s').replace(/^2500$/, '2,5 Gb/s').replace(/^10000$/, '10 Gb/s').replace(/^(\d+)$/, '$1 Mb/s') : '';
                return (
                  <div key={p.id} className="min-w-0 rounded-xl bg-surface px-3.5 py-3 [container-type:inline-size] geist:flex geist:h-9 geist:items-center geist:gap-4 geist:rounded-md geist:bg-transparent geist:px-2 geist:py-0 geist:transition-colors geist:hover:bg-hover">
                    <div className="flex min-w-0 items-center gap-2 geist:order-1 geist:w-[140px] geist:shrink-0">
                      <span className={cn('size-2 shrink-0 rounded-full', up ? 'bg-ok' : 'bg-muted-foreground/40')} />
                      <b className={cn('shrink-0 text-[13.5px]', up ? 'font-semibold geist:font-medium' : 'font-medium text-foreground/75')}>Port {p.id}</b>
                      <span className="ml-auto min-w-0 truncate text-[12px] text-muted-foreground geist:ml-0">{up ? speed || 'actif' : 'libre'}</span>
                    </div>
                    <div className={cn('num mt-2 truncate text-[clamp(14px,15cqi,17px)] font-semibold geist:order-3 geist:mt-0 geist:w-[84px] geist:shrink-0 geist:text-right geist:text-[13px] geist:font-normal', !up && 'text-muted-foreground')}>{up ? kbps(lp.down + lp.up) : '—'}</div>
                    <div className="mt-0.5 truncate text-[12px] text-muted-foreground geist:order-2 geist:mt-0 geist:min-w-0 geist:flex-1 geist:text-[13px]">{who.length ? who.map((h) => displayName(h)).join(', ') : up ? 'appareil non identifié' : 'aucun câble'}</div>
                  </div>
                );
              })}
            </div>
          )}
          {lanStats?.lan?.stats && (
            <Note className="mt-3 text-[12.5px]">Depuis le démarrage : ↓ <span className="num">{bytes(lanStats.lan.stats.tx?.bytes)}</span> vers le réseau local · ↑ <span className="num">{bytes(lanStats.lan.stats.rx?.bytes)}</span></Note>
          )}
        </Card>

        <Card className="lg:col-span-5" title="La Bbox sur le réseau" icon="box" action={<Btn kind="plain" size="sm" icon="edit" onClick={() => { changeIp(); }}>Modifier</Btn>}>
          {ip ? (
            <>
              <Facts rows={[
                ['Adresse IP', <Mono>{ip.ipaddress}</Mono>],
                ['Masque', <Mono>{ip.netmask}</Mono>],
                ['Adresse MAC', <Mono>{ip.mac}</Mono>],
                ['Nom', `${ip.hostname}.${ip.domain}`],
                ['IPv6', ip.ip6state === 'Up' ? 'Active' : 'Inactive'],
                ['Préfixe IPv6', <Mono sm><WanIp ip={ip.ip6prefix?.[0]?.prefix} /></Mono>],
                ['MTU', <span className="num">{ip.mtu}</span>],
              ]} />
              {aliases.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">{aliases.map((a) => <Chip key={a} className="max-w-full"><span className="truncate">{a}</span></Chip>)}</div>
              )}
            </>
          ) : <Skeleton h={200} />}
        </Card>

        <Card className="lg:col-span-5" title="Serveur DHCP" icon="network"
          action={dhcp && (
            <Toggle value={dhcp.enable === 1} label="Serveur DHCP"
              confirm={(nv) => (nv ? null : { title: 'Désactiver le serveur DHCP ?', message: 'Les appareils ne recevront plus d’adresse automatiquement : seuls ceux configurés à la main resteront connectés. À réserver aux réseaux avec un autre serveur DHCP.', confirm: 'Désactiver', tone: 'danger', icon: 'alert' })}
              onChange={(nv) => act(() => api.put('dhcp', { enable: nv ? 1 : 0, minaddress: dhcp.minaddress, maxaddress: dhcp.maxaddress, leasetime: dhcp.leasetime }), { ok: nv ? 'DHCP activé' : 'DHCP désactivé' }).then(reload)} />
          )}>
          {dhcp ? (
            <>
              <Facts rows={[
                ['Plage', <Mono>{dhcp.minaddress} → {String(dhcp.maxaddress).split('.').pop()}</Mono>],
                ['Adresses disponibles', <span className="num">{ipNum(dhcp.maxaddress) - ipNum(dhcp.minaddress) + 1}</span>],
                ['Durée du bail', dhcp.leasetime >= 86400 ? plural(dhcp.leasetime / 86400, 'jour') : `${Math.round(dhcp.leasetime / 3600)} h`],
                ['Serveur DNS annoncé', <Mono>{optsR?.dhcp?.optionsstatic?.find((o: any) => o.option === 6)?.value || ip?.ipaddress || '—'}</Mono>],
              ]} />
              <Btn kind="ghost" size="sm" icon="edit" className="mt-3.5" onClick={() => { editDhcp(); }}>Modifier la plage</Btn>
            </>
          ) : <Skeleton h={140} />}
        </Card>

        <Card className="lg:col-span-7" flush title={`Baux fixes · ${clients.length}`} icon="lock" action={<AddBtn onClick={() => editClient(null)}>Réserver</AddBtn>}>
          <Note className="px-5 pb-2 text-[13.5px] max-sm:px-4">Réservez une adresse IP pour qu’un appareil la garde toujours (serveur, imprimante, NAS…).</Note>
          <div>
            {clients.length ? clients.map((c) => {
              const hh = hostsByMac[String(c.macaddress).toLowerCase()];
              return (
                <Row key={c.id} onClick={() => editClient(c)}>
                  <Avatar icon="lock" size="sm" on={!!hh?.active} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-medium clair:font-semibold">{c.hostname || (hh ? displayName(hh) : c.macaddress)}</div>
                    <div className="font-mono text-[12px] text-muted-foreground sm:truncate">
                      <span className="max-sm:block">{c.ipaddress}</span><span className="max-sm:hidden"> · </span><span className="max-sm:block max-sm:truncate">{c.macaddress}</span>
                    </div>
                  </div>
                  <Stop>
                    <Toggle value={c.enable === 1} label={c.hostname}
                      onChange={(nv) => act(() => api.put('dhcp/clients/' + c.id, { enable: nv ? 1 : 0, hostname: c.hostname, macaddress: c.macaddress, ipaddress: c.ipaddress }), { ok: nv ? 'Réservation activée' : 'Réservation suspendue' }).then(reload)} />
                  </Stop>
                </Row>
              );
            }) : clientsR ? <Empty icon="lock" title="Aucun bail fixe">Les adresses sont toutes attribuées dynamiquement.</Empty> : <div className="px-5 pb-3 max-sm:px-4"><Skeleton h={120} /></div>}
          </div>
        </Card>

        <Card className="lg:col-span-6" title="IPv6" icon="globe"
          action={dhcp6 && <Toggle value={dhcp6.enable === 1} label="DHCPv6" onChange={(nv) => act(() => api.put('dhcp6', { enable: nv ? 1 : 0 }), { ok: nv ? 'DHCPv6 activé' : 'DHCPv6 désactivé' }).then(() => refresh('statics'))} />}>
          <Note className="mb-2.5 text-[13.5px]">L’interrupteur active le serveur DHCPv6 (en plus de l’autoconfiguration SLAAC, toujours active).</Note>
          <Facts rows={[
            ['État', ip?.ip6state === 'Up' ? 'Actif' : 'Inactif'],
            ...(ip?.ip6address || []).slice(0, 2).map((a: any, i: number): KVRow => [i ? 'Adresse secondaire' : 'Adresse de la Bbox', <Mono sm>{a.ipaddress}</Mono>]),
            ...(pdR?.dhcp?.prefixdelegation || []).map((p: any): KVRow => ['Délégation de préfixe', <Mono sm><WanIp ip={p.prefixstart} />… · {p.securitylevel}</Mono>]),
          ]} />
        </Card>

        <Card className="lg:col-span-6" title="Options DHCP" icon="sliders">
          <Note className="mb-2.5 text-[13.5px]">Options transmises aux appareils avec leur adresse. {optsR ? `${caps?.length || 0} options RFC 2132 prises en charge.` : ''}</Note>
          <div className="-mx-5 max-sm:-mx-4">
            {options.map((o, i) => {
              const d = caps?.find((c) => c.id === o.option)?.description;
              return (
                <Row key={(o.fixed ? 's' : 'o') + (o.id ?? i)} className="min-h-[46px]">
                  <div className="min-w-0 flex-1">
                    <div className="text-[14.5px] font-medium [overflow-wrap:anywhere] clair:font-semibold">Option <span className="num">{o.option}</span>{d ? ' · ' + d : o.option === 6 ? ' · Serveurs DNS' : ''}</div>
                    <div className="font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{o.value}</div>
                  </div>
                  {o.fixed ? <Chip>système</Chip> : (
                    <IconBtn icon="trash" label="Supprimer" onClick={async () => {
                      if (await confirmDialog({ title: 'Supprimer cette option ?', confirm: 'Supprimer', tone: 'danger', icon: 'trash' })) act(() => api.del('dhcp/options/' + o.id), { ok: 'Option supprimée' }).then(reload, () => {});
                    }} />
                  )}
                </Row>
              );
            })}
            {!optsR && <div className="px-5 max-sm:px-4"><Skeleton h={90} /></div>}
          </div>
        </Card>
      </div>
    </>
  );
}
