// Diagnostic : connexion, fibre, tests, débit, sessions IP, DNS, journal, alertes, TV, secours 4G.
import { Fragment, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { PageHead, Card, KV, Btn, Chip, Empty, Seg, Tabs, Skeleton, Avatar, Row, Note, IconBtn, SectionTitle } from '@/components/kit';
import { Gauge, Sparkline, LiveChart } from '@/components/charts';
import { api } from '@/lib/api';
import { act, useApi } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { num, dateTime, relative, logLabel, logTone, displayName, parseDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import { maskText } from '@/lib/privacy';
import type { Route } from '@/lib/router';

const ms = (us: any) => (us ? num(us / 1000, us < 10000 ? 1 : 0) + ' ms' : '—');
const TABS = [{ v: 'internet', l: 'Internet' }, { v: 'trafic', l: 'Trafic' }, { v: 'journal', l: 'Journal' }];
const GRID = 'grid grid-cols-1 gap-4 lg:grid-cols-12';
const sleep = (t: number) => new Promise((r) => setTimeout(r, t));

/** Valeur technique (adresses, préfixes) en chasse fixe */
function Mono({ children, sm }: { children: ReactNode; sm?: boolean }) {
  return <span className={cn('font-mono tracking-normal', sm ? 'text-[12px]' : 'text-[0.92em]')}>{children}</span>;
}
/** Liste clé → valeur dont les valeurs longues (IPv6…) passent à la ligne au lieu de déborder */
function Facts({ rows }: { rows: ComponentProps<typeof KV>['rows'] }) {
  return <div className="min-w-0 [&_dd]:shrink"><KV rows={rows} /></div>;
}
/** Tuile compacte (fond doux en Bbox Clair, filet en Noir Geist) */
const tile = 'min-w-0 rounded-xl bg-surface px-3.5 py-3 [container-type:inline-size] geist:rounded-none geist:bg-transparent geist:!px-0 geist:py-0 max-sm:px-3';

export default function Diag({ route }: { route: Route }) {
  const [tab, setTab] = useState<string>(() => (TABS.some((t) => t.v === route?.arg) ? route.arg : 'internet'));
  return (
    <>
      <PageHead kicker="Santé du réseau" title="Diagnostic" sub="Tests de connexion, fibre, sessions et journal de la Bbox." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Section" />
      {tab === 'internet' && <Internet />}
      {tab === 'trafic' && <Traffic />}
      {tab === 'journal' && <Journal />}
    </>
  );
}

// ───────────── Internet ─────────────
const TESTS: [string, string][] = [['dns', 'DNS'], ['ping', 'Ping'], ['http', 'Web (HTTP)']];
function Internet() {
  const s = useLive();
  const { data, reload } = useApi<any[]>(['wan/diags', 'wan/ftth/stats', 'speedtest/info', 'wan/backup', 'iptv/diags', 'alerts'], { poll: 30000 });
  const [diags, ftth, sp, backup, iptv, alerts] = data;
  const wan = s.wanIp?.wan, sff = s.sff?.wan;
  const rx: number | null = sff?.receive_power ? Number(sff.receive_power) / 1000 : null;
  const d = diags?.diags;
  const [running, setRunning] = useState(false);
  const startDiag = async () => {
    setRunning(true);
    try { await act(() => api.post('wan/diags', { action: 'start' }), { ok: 'Tests lancés' }); await sleep(8000); reload(); }
    catch { /* toast déjà affiché */ } finally { setRunning(false); }
  };
  const last = (arr: any[]) => (arr || []).find((x) => x.tries > 0) || (arr || [])[0];
  const series = (arr: any[]) => (arr || []).slice().reverse().map((x, i) => [i, x.average ? x.average / 1000 : 0] as [number, number]);
  const alertList: any[] = alerts?.alerts?.list || [];
  const rxOk = rx != null && rx > -27 && rx < -8;
  const quality = rx == null ? '—' : rx > -24 && rx < -8 ? <span className="text-ok">Excellente</span> : rx > -27 ? <span className="text-warn">Correcte</span> : <span className="text-danger">Faible</span>;
  const lastSwitch = (backup?.backup?.history || []).find((x: any) => x.beginning)?.beginning;

  return (
    <div className={GRID}>
      {alertList.length > 0 && (
        <Card className="lg:col-span-12" title={`Alertes · ${alertList.length}`} icon="alert">
          <div className="-mx-5 max-sm:-mx-4">
            {alertList.map((a, i) => (
              <Row key={a.id ?? i}>
                <Avatar icon="alert" size="sm" tone="warn" />
                <div className="min-w-0 flex-1">
                  <div className="text-[14.5px] font-medium [overflow-wrap:anywhere] clair:font-semibold">{a.ident || a.name || a.type || 'Alerte'}</div>
                  <div className="text-[12.5px] text-muted-foreground [overflow-wrap:anywhere]">{maskText(a.param || '')} {a.first_date ? '· depuis ' + relative(a.first_date) : ''}</div>
                </div>
                <IconBtn icon="check" label="Acquitter" onClick={() => { act(() => api.del('alerts/' + a.id), { ok: 'Alerte acquittée' }).then(() => { reload(); refresh('summary'); }, () => {}); }} />
              </Row>
            ))}
          </div>
        </Card>
      )}

      <Card className="lg:col-span-7" title="Connexion Internet" icon="globe"
        action={(() => { const st = Number(wan?.internet?.state); const up = st === 2 || (st !== 0 && st !== 1 && /^up$/i.test(String(wan?.ip?.state || ''))); return <Chip tone={up ? 'ok' : 'danger'} dot>{up ? 'Connectée' : 'Coupée'}</Chip>; })()}>
        {wan?.ip ? (
          <Facts rows={[
            ['Adresse IPv4 publique', <Mono><WanIp ip={wan.ip.address} /></Mono>],
            ['Type d’IPv4', wan.ip.cgnatenable ? 'Partagée (CGNAT)' : wan.ip.maptenable ? 'MAP-T' : 'Dédiée'],
            ['Passerelle', <Mono><WanIp ip={wan.ip.gateway} /></Mono>],
            ['DNS IPv4', <Mono>{String(wan.ip.dnsservers).replace(',', ' · ')}</Mono>],
            ['Adresse IPv6', <Mono sm><WanIp ip={wan.ip.ip6address?.[0]?.ipaddress} /></Mono>],
            ['Préfixe délégué', <Mono sm><WanIp ip={wan.ip.ip6prefix?.[0]?.prefix} /></Mono>],
            ['DNS IPv6', <Mono sm>{String(wan.ip.dnsserversv6 || '—').replace(',', ' · ')}</Mono>],
            ['MTU', <span className="num">{wan.ip.mtu}</span>],
          ]} />
        ) : <Skeleton h={220} />}
      </Card>

      <Card className="lg:col-span-5" title="Fibre optique" icon="fiber"
        action={sff && <Chip className="max-w-[46vw] sm:max-w-none"><span className="truncate">{sff.pon_mode?.type} · classe {sff.pon_mode?.moduleclass}</span></Chip>}>
        {sff ? (
          <>
            <div className="mb-3.5 flex flex-wrap justify-around gap-4">
              <div className="grid justify-items-center gap-1.5">
                <Gauge value={rx == null ? 0 : Math.max(0, Math.min(100, ((rx + 30) / 22) * 100))} label={rx == null ? '—' : num(rx, 1)} sub="dBm" size={92} color={rxOk ? 'var(--ok)' : 'var(--chart-4)'} />
                <span className="text-[12.5px] text-muted-foreground">Puissance reçue</span>
              </div>
              <div className="grid justify-items-center gap-1.5">
                <Gauge value={(sff.transmit_power / 1000 / 7) * 100} label={num(sff.transmit_power / 1000, 1)} sub="dBm" size={92} color="var(--up)" />
                <span className="text-[12.5px] text-muted-foreground">Puissance émise</span>
              </div>
            </div>
            <Facts rows={[
              ['Qualité du signal', quality],
              ['État du module', sff.pon_mode?.internalstatus === 'Up' ? 'Synchronisé' : sff.pon_mode?.internalstatus],
              ['Lien interne', ftth?.wan?.ftth?.mode || '—'],
              ['Température module', sff.temperature ? num(sff.temperature / 10, 0) + ' °C' : '—'],
            ]} />
            <Note className="mt-2.5 text-[12.5px]">Plage normale en GPON : de −8 à −27 dBm en réception.</Note>
          </>
        ) : <Skeleton h={200} />}
      </Card>

      <Card className="lg:col-span-7" title="Tests de connectivité" icon="activity"
        action={<Btn kind="soft" size="sm" icon="play" onClick={startDiag} disabled={running}>{running ? 'Tests en cours…' : 'Relancer'}</Btn>}>
        <Note className="mb-3 text-[13.5px]">La Bbox teste elle-même la résolution DNS, le ping et l’accès web, toutes les heures.</Note>
        {d ? (
          <div className="grid grid-cols-3 gap-2">
            {TESTS.map(([k, l]) => {
              const x = last(d[k]);
              const ok = x && x.success > 0;
              return (
                <div key={k} className={tile}>
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="min-w-0 flex-1 truncate text-[12px] text-muted-foreground">{l}</span>
                    {x?.tries ? (
                      <span role="img" aria-label={ok ? 'Réussi' : 'Échec'} className={cn('grid size-5 shrink-0 place-items-center rounded-full', ok ? 'bg-ok-soft' : 'bg-danger-soft')}>
                        <span className={cn('size-1.5 rounded-full', ok ? 'bg-ok' : 'bg-danger')} />
                      </span>
                    ) : null}
                  </div>
                  <div className="num mt-0.5 truncate text-[clamp(14px,15cqi,17px)] font-semibold">{x?.tries ? ms(x.average) : '—'}</div>
                  <div className="mt-1.5 min-w-0"><Sparkline data={series(d[k]).map((p) => p[1])} color="var(--chart-1)" width={120} height={28} /></div>
                </div>
              );
            })}
          </div>
        ) : <Skeleton h={110} />}
      </Card>

      <SpeedCard className="lg:col-span-5" info={sp?.speedtest} reload={reload} />

      <Card className="lg:col-span-6" title="Télévision" icon="tv"
        foot={(
          <div className="flex flex-wrap gap-2">
            <Btn kind="soft" size="sm" onClick={() => act(() => api.put('iptv/diags', { check: 'igmp' }), { ok: 'Test IGMP lancé' }).then(() => { setTimeout(reload, 4000); })}>Tester IGMP</Btn>
            <Btn kind="soft" size="sm" onClick={() => act(() => api.put('iptv/diags', { check: 'server' }), { ok: 'Test plateforme lancé' }).then(() => { setTimeout(reload, 4000); })}>Tester la plateforme</Btn>
          </div>
        )}>
        {iptv ? (
          <Facts rows={[
            ['IGMP', iptv.igmp?.enable ? (iptv.igmp.state === 2 ? 'Actif' : 'Activé') : 'Désactivé'],
            ['Multicast', iptv.iptv?.multicast?.state || 'Non testé'],
            ['Plateforme TV', iptv.iptv?.platform?.state === 'Disable' ? 'Non testée' : iptv.iptv?.platform?.state || '—'],
          ]} />
        ) : <Skeleton h={90} />}
      </Card>

      <Card className="lg:col-span-6" title="Internet de secours 4G" icon="mobile">
        {backup ? (
          <>
            <Facts rows={[
              ['État', backup.backup?.state?.stateName === 'Stopped' ? 'En veille (fibre active)' : backup.backup?.state?.stateName],
              ['Clé ou box 4G', backup.backup?.usb?.running ? 'Branchée' : 'Non détectée'],
              ['Dernière bascule', lastSwitch ? dateTime(lastSwitch) : 'Jamais'],
            ]} />
            {backup.backup?.usb?.running ? <Btn kind="ghost" size="sm" className="mt-3" onClick={() => act(() => api.put('wan/backup', { action: 'eject' }), { ok: 'Clé 4G éjectée' }).then(reload)}>Éjecter la clé 4G</Btn> : null}
          </>
        ) : <Skeleton h={90} />}
      </Card>
    </div>
  );
}

function SpeedCard({ className, info, reload }: { className?: string; info: any; reload: () => void }) {
  const [st, setSt] = useState<any>(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  const run = async (mode: 'downlink' | 'uplink') => {
    setSt({ mode, state: 'running' });
    try {
      await act(() => api.post('speedtest', { mode }), { silent: true });
      for (let i = 0; i < 60 && alive.current; i++) {
        await sleep(1500);
        if (!alive.current) return;
        const d = (await api.get('speedtest')).speedtest;
        setSt({ mode, ...d });
        if (!/run|progress|start/i.test(d.state)) break;
      }
      reload();
    } catch { setSt(null); }
  };
  const m = info?.latestmeasurements;
  const fmt = (v: any) => (/^\d+(\.\d+)?$/.test(String(v)) ? (Number(v) >= 1000 ? num(Number(v) / 1000, 1) + ' Mb/s' : num(v) + ' kb/s') : v === 'OK' ? 'Réussi' : v === 'KO' ? 'Échec' : v);
  const busy = st?.state === 'running' || /run/i.test(st?.state || '');
  const rows = m ? [...(m.download || []).map((x: any) => ({ ...x, k: '↓' })), ...(m.upload || []).map((x: any) => ({ ...x, k: '↑' }))].sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 5) : [];
  return (
    <Card className={className} title="Test de débit de la Bbox" icon="bolt">
      <Note className="mb-3 text-[13.5px]">Mesuré par la Bbox elle-même, sans dépendre du Wi-Fi ni de votre appareil.</Note>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Btn kind="go" size="sm" icon="down" disabled={busy} onClick={() => run('downlink')}>Descendant</Btn>
        <Btn kind="soft" size="sm" icon="up" disabled={busy} onClick={() => run('uplink')}>Montant</Btn>
        {st && <span className="text-[12.5px] text-muted-foreground">{/run|start/i.test(st.state) ? 'Mesure en cours…' : <>Résultat : <span className="num">{fmt(st.speed)}</span></>}</span>}
      </div>
      {m ? (
        <div className="-mx-5 max-sm:-mx-4">
          {rows.map((x, i) => (
            <Row key={i} className="min-h-[42px] py-1.5">
              <span className="num w-[18px] shrink-0 text-center font-semibold" aria-label={x.k === '↓' ? 'Descendant' : 'Montant'}>{x.k}</span>
              <span className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">{dateTime(x.date)}</span>
              <Chip tone={x.speed === 'KO' ? 'danger' : x.speed === 'OK' ? 'ok' : ''}><span className="num">{fmt(x.speed)}</span></Chip>
            </Row>
          ))}
        </div>
      ) : <Skeleton h={120} />}
    </Card>
  );
}

// ───────────── Trafic ─────────────
function Traffic() {
  const s = useLive();
  const { data } = useApi<any>('dns/stats', { poll: 20000 });
  const sess = s.sessions;
  const ipToName = useMemo(() => {
    const m: Record<string, string> = {};
    for (const h of s.hosts || []) { if (h.ipaddress) m[h.ipaddress] = displayName(h); for (const a of h.ip6address || []) m[a.ipaddress] = displayName(h); }
    return m;
  }, [s.hosts]);
  const grouped = useMemo(() => {
    const g: Record<string, { n: string; ip: number; tcp: number; udp: number }> = {};
    for (const x of sess?.hosts || []) { const n = ipToName[x.ip] || x.ip; g[n] = g[n] || { n, ip: 0, tcp: 0, udp: 0 }; g[n].ip += x.currentip; g[n].tcp += x.currenttcp; g[n].udp += x.currentudp; }
    return Object.values(g).sort((a, b) => b.ip - a.ip);
  }, [sess, ipToName]);
  const max = grouped[0]?.ip || 1;
  const dns = data?.dns;
  const series = useMemo(() => [{ data: s.series.sessions, color: 'var(--chart-1)', label: 'sessions' }], []);
  return (
    <div className={GRID}>
      <Card className="lg:col-span-8" title="Sessions IP en direct" icon="activity"
        action={sess && <span className="text-[12.5px] text-muted-foreground">seuil d’alerte <span className="num">{num(sess.highthreshold)}</span></span>}>
        <div className="mb-2 flex flex-wrap items-end gap-x-6 gap-y-2">
          <div className="grid gap-1">
            <span className="text-[12.5px] text-muted-foreground">Sessions ouvertes</span>
            <span className="num text-[34px] font-semibold leading-none tracking-[-0.02em] max-sm:text-[28px]">{num(sess?.currentip)}</span>
          </div>
          <div className="grid gap-1">
            <span className="text-[12.5px] text-muted-foreground">Appareils actifs</span>
            <span className="num text-[24px] font-semibold leading-none tracking-[-0.02em]">{grouped.length}</span>
          </div>
        </div>
        <LiveChart height={150} series={series} windowMs={600000} format={(v: number) => num(v)} />
        <Note className="mt-2 text-[12.5px]">Chaque connexion ouverte (onglet, appli, appel…) compte pour une session. Une valeur proche du seuil ralentit tout le réseau.</Note>
      </Card>

      <Card className="lg:col-span-4" title="Résolution DNS" icon="globe">
        {dns ? (
          <>
            <div className="num mb-0.5 mt-1 text-[42px] font-semibold leading-none tracking-[-0.03em] max-sm:text-[36px]">{ms(dns.avg)}</div>
            <Note className="mb-3 text-[12.5px]">temps moyen de réponse</Note>
            <Facts rows={[
              ['Requêtes traitées', <span className="num">{num(dns.nbqueries)}</span>],
              ['Plus rapide', <span className="num">{ms(dns.min)}</span>],
              ['Plus lente', <span className="num">{ms(dns.max)}</span>],
            ]} />
          </>
        ) : <Skeleton h={140} />}
      </Card>

      <Card className="lg:col-span-12" title="Sessions par appareil" icon="devices">
        {grouped.length ? (
          <div className="grid">
            {grouped.map((g) => (
              <div key={g.n} className="grid min-h-[52px] grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 border-t border-border py-2.5 first:border-t-0 sm:grid-cols-[minmax(120px,1.2fr)_2fr_auto]">
                <span className="truncate text-[14.5px] font-medium clair:font-semibold">{g.n}</span>
                <div title={`${g.tcp} TCP · ${g.udp} UDP`} className="col-span-2 row-start-2 h-1.5 overflow-hidden rounded-full bg-secondary sm:col-span-1 sm:col-start-2 sm:row-start-1">
                  <i className="block h-full w-full origin-left rounded-full bg-brand transition-transform duration-500 ease-[cubic-bezier(.22,1,.36,1)] geist:bg-chart-1" style={{ transform: `scaleX(${g.ip / max})` }} />
                </div>
                <span className="num whitespace-nowrap text-right text-[12.5px] text-muted-foreground sm:min-w-[110px]">{num(g.ip)} · <span title="TCP / UDP">{g.tcp}/{g.udp}</span></span>
              </div>
            ))}
          </div>
        ) : <Empty icon="activity" title="Chargement des sessions…" />}
      </Card>
    </div>
  );
}

// ───────────── Journal ─────────────
const FILTERS = [{ v: 'all', l: 'Tout' }, { v: 'devices', l: 'Appareils' }, { v: 'login', l: 'Connexions' }, { v: 'net', l: 'Réseau' }];
function Journal() {
  const { data, reload } = useApi<any>('device/log', { poll: 30000 });
  const [f, setF] = useState('all');
  const [n, setN] = useState(60);
  const all: any[] = data?.log || [];
  const list = all.filter((e) => f === 'all' || (f === 'devices' && /DEVICE/.test(e.log)) || (f === 'login' && /LOGIN/.test(e.log)) || (f === 'net' && /WAN|VOIP|WIFI|LAN|BOOT|REBOOT/.test(e.log)));
  let lastDay = '';
  return (
    <Card flush title={`Journal de la Bbox · ${all.length} événements`} icon="clock"
      action={(
        <Btn kind="danger-ghost" size="sm" icon="trash" confirm={{ title: 'Vider le journal ?', message: 'Tous les événements enregistrés par la Bbox seront effacés.', confirm: 'Vider', tone: 'danger', icon: 'trash' }}
          onClick={async () => { await act(() => api.del('device/log'), { ok: 'Journal vidé' }); reload(); }}>Vider</Btn>
      )}>
      <div className="px-5 pb-2 max-sm:px-4">
        <Seg options={FILTERS} value={f} onChange={(v) => { setF(v); setN(60); }} label="Filtre" />
      </div>
      <div>
        {list.slice(0, n).map((e, i) => {
          const d = parseDate(e.date);
          const day = d ? d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
          const head = day !== lastDay ? ((lastDay = day), <SectionTitle className="mb-1 mt-3.5 px-5 max-sm:px-4">{day}</SectionTitle>) : null;
          const tone = logTone(e.log);
          const params = maskText(String(e.param || '').split(';').filter(Boolean).reverse().join(' · '));
          return (
            <Fragment key={(e.id ?? '') + '-' + i}>
              {head}
              <Row className="min-h-[44px] gap-2.5 py-2">
                <span className="num w-11 shrink-0 text-[12.5px] text-muted-foreground">{d ? d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : ''}</span>
                <span className={cn('size-2 shrink-0 rounded-full', tone === 'warn' ? 'bg-chart-4' : tone === 'ok' ? 'bg-ok' : 'bg-muted-foreground/40')} />
                <div className="min-w-0 flex-1 text-[14px] max-sm:line-clamp-2 max-sm:[overflow-wrap:anywhere] sm:truncate">
                  <span className="font-medium">{logLabel(e.log)}</span> <span className="text-muted-foreground">{params}</span>
                </div>
              </Row>
            </Fragment>
          );
        })}
        {!data && <div className="px-5 pb-3 max-sm:px-4"><Skeleton h={200} /></div>}
        {data && !list.length && <Empty icon="clock" title="Aucun événement" />}
      </div>
      {list.length > n && (
        <div className="px-5 py-3 max-sm:px-4">
          <Btn kind="soft" size="sm" onClick={() => setN(n + 100)}>Afficher plus (<span className="num">{list.length - n}</span> restants)</Btn>
        </div>
      )}
    </Card>
  );
}
