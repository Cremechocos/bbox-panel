// Accueil — Noir Geist « Ligne » : pas de cartes. Un titre d'état, une ligne de chiffres en direct,
// le trafic, puis des listes : appareils, activité, favoris, Wi-Fi et santé de la Bbox.
import { useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Banner, Btn, Empty, Skeleton, Seg, Toggle } from '@/components/kit';
import { openSheet } from '@/components/overlays';
import { Icon, KIND_ICON } from '@/components/icon';
import { PauseSheet, GuestSheet, FavoritesSheet } from '@/components/sheets';
import { LiveChart, CountUp, SignalBars } from '@/components/charts';
import { api, panel } from '@/lib/api';
import { act, useFetch } from '@/lib/data';
import { useLive, refresh, internetOk as isInternetOk, type LiveState } from '@/lib/live';
import { kbps, bytes, duration, deviceKind, displayName, bandLabel, signal, bestRssi, num, mbps } from '@/lib/format';
import { usePrefs, actionOf, pauseOf, untilLabel, guestTimer, resumeDevice, type Action } from '@/lib/prefs';
import { eventInfo, ago } from '@/lib/events';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import { ServicesGrid, TargetPicker, TargetCaption, LatencyChart, openProbesSheet, servicesSummary } from '@/components/services';
import { useHomeChart, setHomeChart, useLatTarget, targetInfo, seriesOf, statsOf, fmtMs, minuteMedian } from '@/lib/services';

const EASE = [0.22, 1, 0.36, 1] as const;
const NB = '\u202f';
const isEth = (h: any) => /Ethernet/i.test(h.link || '');
const rateOf = (h: any): number => Number(h.wireless?.estimatedRate) || (isEth(h) && h.ethernet?.speed ? Number(h.ethernet.speed) : 0);
const openDevice = (h: any) => import('@/views/devices').then((m) => m.openDevice(h));
const openFavorites = () => { openSheet(FavoritesSheet, {}, { title: 'Favoris', description: 'Partagés entre tous vos appareils' }); };
const avg = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const fmtLat = (v: number) => (v < 10 ? num(v, 1) : num(v));
const HIDE = new Set(['wifi_restart', 'port_up', 'port_down', 'voip_up', 'login']);
const split = (s: string) => { const i = s.lastIndexOf(NB); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };

/** Une valeur de la ligne de chiffres : libellé, nombre, unité, petite tendance */
function Stat({ label, value, unit, delta, tone, href }: { label: string; value: React.ReactNode; unit?: string; delta?: React.ReactNode; tone?: 'good' | 'bad'; href?: string }) {
  const body = (
    <>
      <div className="text-[12.5px] text-muted-foreground">{label}</div>
      <div className="num mt-1 whitespace-nowrap text-[24px] font-medium leading-tight tracking-[-0.025em]">{value}{unit && <span className="ml-1 text-[14px] font-normal tracking-normal text-muted-foreground">{unit}</span>}</div>
      {delta != null && <div className={cn('mt-0.5 truncate text-[12px]', tone === 'good' ? 'text-ok' : tone === 'bad' ? 'text-danger' : 'text-faint')}>{delta}</div>}
    </>
  );
  return href ? <a href={href} className="group -m-2 block min-w-0 rounded-md p-2 outline-none transition-colors hover:bg-hover focus-visible:bg-selected">{body}</a> : <div className="min-w-0">{body}</div>;
}

/** En-tête de section : titre, compteur, lien à droite */
function Head({ title, count, href, link, children }: { title: string; count?: React.ReactNode; href?: string; link?: string; children?: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center gap-2 text-[13px]">
      <h2 className="font-semibold">{title}</h2>
      {count != null && <span className="num text-faint">{count}</span>}
      <span className="flex-1" />
      {children}
      {href && <a href={href} className="group -my-2 flex items-center gap-0.5 rounded px-1 py-2 text-[12.5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground max-sm:-my-3 max-sm:py-3">{link || 'Tout voir'}<Icon name="chevron" className="size-3.5 transition-transform group-hover:translate-x-0.5" /></a>}
    </div>
  );
}

export default function HomeLigne() {
  const s = useLive();
  const p = usePrefs();
  const week = useFetch(() => panel.usage(7), [], { poll: 300000 });
  if (!s.ready) return (
    <div className="grid gap-8 pt-1">
      <div className="grid gap-2"><Skeleton h={26} w="32%" /><Skeleton h={14} w="52%" /></div>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-5">{[1, 2, 3, 4, 5].map((i) => <div key={i} className="grid gap-2"><Skeleton h={12} w="60%" /><Skeleton h={24} w="80%" /></div>)}</div>
      <Skeleton h={200} />
    </div>
  );
  const dev = s.device?.device || {}, wan = s.wanIp?.wan || {}, sum = s.summary || {};
  const internetOk = isInternetOk(s);
  const degraded = internetOk && ((s.latency?.loss || 0) >= 10 || (s.latency?.internet || 0) > 120);
  const title = !internetOk ? 'Internet est coupé' : degraded ? 'Connexion ralentie' : 'Tout fonctionne';
  const alerts: number = sum.alerts?.count || 0;
  const active = s.hosts.filter((x) => x.active);
  const guestsOn = (s.guestHosts || []).filter((x) => x.active).length;
  const lat = s.latency?.internet;
  const latAvg = minuteMedian(s.series.latency);
  const today = (s.today?.rx || 0) + (s.today?.tx || 0);
  const days: any[] = week.data?.days || [];
  const y = days.length >= 2 ? days[days.length - 2] : null;
  const yTotal = y && y.has ? (y.rx || 0) + (y.tx || 0) : 0;
  const hour = new Date().getHours() + new Date().getMinutes() / 60;
  // comparaison à la même heure hier (estimation au prorata), seulement si hier est connu
  const delta = yTotal > 0 && hour > 1 ? Math.round(((today / (yTotal * (hour / 24))) - 1) * 100) : null;
  const [dv, du] = split(kbps(s.wan.down));
  const [uv, uu] = split(kbps(s.wan.up));
  const pon = `${s.sff?.wan?.pon_mode?.type || ''}`.trim();
  return (
    <>
      <header className="enter mb-8 max-sm:mb-6">
        <h1 className="text-[22px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-foreground">
          <span className={cn('flex items-center gap-1.5', internetOk ? 'text-foreground' : 'text-danger')}>
            <span className={cn('live-dot', !internetOk && 'bad')} aria-hidden />{internetOk ? 'Internet en ligne' : 'Internet coupé'}
          </span>
          <span aria-hidden className="text-faint">·</span><span>{dev.modelname || 'Bbox'}{pon ? ` · fibre ${pon}` : ''}</span>
          {wan.ip?.address && <><span aria-hidden className="text-faint">·</span><span className="num">IP <WanIp ip={wan.ip.address} /></span></>}
          <span aria-hidden className="text-faint">·</span><span>allumée depuis {duration(dev.uptime)}</span>
        </p>
      </header>

      {alerts > 0 && (
        <a href="#/diagnostic" className="enter group mb-8 block rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring">
          <Banner tone="warn" icon="alert" action={<Icon name="chevron" className="size-4 opacity-70 transition-transform group-hover:translate-x-0.5" />}>
            <b>{alerts} alerte{alerts > 1 ? 's' : ''}</b> signalée{alerts > 1 ? 's' : ''} par la Bbox. Voir le diagnostic.
          </Banner>
        </a>
      )}

      <div className="enter grid grid-cols-5 gap-x-6 gap-y-5 max-lg:grid-cols-3 max-sm:grid-cols-2">
        <Stat href="#/stats" label="Réception" value={<CountUp value={s.wan.down} format={(v: number) => split(kbps(v))[0]} />} unit={du} delta={s.wan.contract ? `contrat ${kbps(s.wan.contract)}` : 'en direct'} />
        <Stat href="#/stats" label="Envoi" value={<CountUp value={s.wan.up} format={(v: number) => split(kbps(v))[0]} />} unit={uu} delta={(s.wan as any).contractUp ? `contrat ${kbps((s.wan as any).contractUp)}` : 'en direct'} />
        <Stat href="#/stats" label="Latence" value={lat == null ? '—' : <CountUp value={lat} format={fmtLat} />} unit="ms"
          delta={s.latency?.loss ? `${s.latency.loss} % de perte` : latAvg != null ? `médiane 1 min : ${fmtLat(latAvg)} ms` : undefined} tone={s.latency?.loss ? 'bad' : undefined} />
        <Stat href="#/appareils" label="Appareils" value={<CountUp value={active.length} />} unit={`/ ${s.hosts.length}`}
          delta={`${active.filter((x) => !isEth(x)).length} Wi-Fi · ${active.filter(isEth).length} Ethernet${guestsOn ? ` · ${guestsOn} invité${guestsOn > 1 ? 's' : ''}` : ''}`} />
        <Stat href="#/stats" label="Aujourd’hui" value={split(bytes(today))[0]} unit={split(bytes(today))[1]}
          delta={delta == null ? `↓ ${bytes(s.today?.rx || 0)} · ↑ ${bytes(s.today?.tx || 0)}` : `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)} % vs hier à cette heure`} />
      </div>

      <Traffic s={s} dv={dv} uv={uv} />
      <Services s={s} />

      <div className="mt-12 grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-12 max-xl:grid-cols-1 max-sm:mt-10 max-sm:gap-10">
        <Devices hosts={s.hosts} />
        <div className="grid content-start gap-10">
          <Recent s={s} />
          <Favorites s={s} p={p} />
          <Wifi s={s} />
          <Health s={s} dev={dev} />
        </div>
      </div>
    </>
  );
}

function Traffic({ s, dv, uv }: { s: LiveState; dv: string; uv: string }) {
  const mode = useHomeChart() || 'wan';
  const target = useLatTarget();
  const info = targetInfo(s, target);
  const st = statsOf(seriesOf(s, info.id), info.every);
  // mêmes tableaux que le flux temps réel : le graphique les lit à chaque image, sans re-rendu
  const wanSeries = useMemo(() => [{ data: s.series.down, color: 'var(--down)', label: 'Réception' }, { data: s.series.up, color: 'var(--up)', label: 'Envoi' }], []);
  return (
    <section className="enter mt-12 max-sm:mt-10" data-lat-chart>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px]">
        <h2 className="font-semibold">{mode === 'wan' ? 'Trafic Internet' : 'Latence'}</h2>
        {mode === 'wan' ? (
          <>
            <span className="flex items-center gap-1.5 text-muted-foreground"><i className="h-0.5 w-3 rounded-full bg-down" />Réception <b className="num font-medium text-foreground">{dv}</b></span>
            <span className="flex items-center gap-1.5 text-muted-foreground"><i className="h-0.5 w-3 rounded-full bg-up" />Envoi <b className="num font-medium text-foreground">{uv}</b></span>
          </>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-muted-foreground max-sm:order-last max-sm:w-full">
            <TargetPicker s={s} className="-my-1 -ml-2" />
            {st.last != null && !st.stale && <b className="num shrink-0 font-medium text-foreground">{fmtMs(st.last)} ms</b>}
            <TargetCaption s={s} className="text-faint max-md:hidden" />
          </span>
        )}
        <span className="ml-auto"><Seg size="sm" value={mode} onChange={setHomeChart} label="Mesure" options={[{ v: 'wan', l: 'Débit' }, { v: 'lat', l: 'Latence' }]} /></span>
      </div>
      <motion.div key={mode} className="mt-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: EASE }}>
        {mode === 'wan'
          ? <LiveChart height={190} format={(v: number) => kbps(v)} series={wanSeries} windowMs={600000} lag={800} strokeWidth={1.5} />
          : <LatencyChart s={s} height={190} strokeWidth={1.5} />}
      </motion.div>
    </section>
  );
}

function Services({ s }: { s: LiveState }) {
  const n = s.probes?.list?.length || 0;
  const sum = servicesSummary(s);
  return (
    <section className="enter mt-10 max-sm:mt-8">
      <Head title="Latence des services" count={n || undefined}>
        <button type="button" onClick={openProbesSheet} className="-my-2 rounded px-1 py-2 text-[12.5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground max-sm:-my-3 max-sm:py-3">Choisir</button>
      </Head>
      {sum && <p className="num mb-2.5 mt-0.5 truncate text-[12.5px] text-faint">{sum}</p>}
      <ServicesGrid s={s} className={sum ? undefined : 'mt-2'} />
    </section>
  );
}

function Devices({ hosts }: { hosts: any[] }) {
  const list = useMemo(() => [...hosts].sort((a, b) => b.active - a.active || rateOf(b) - rateOf(a) || displayName(a).localeCompare(displayName(b), 'fr')).slice(0, 12), [hosts]);
  const active = hosts.filter((h) => h.active).length;
  return (
    <section className="enter min-w-0">
      <Head title="Appareils" count={`${active}/${hosts.length}`} href="#/appareils" />
      <ul className="-mx-2 mt-2">
        {list.map((h) => {
          const pz = pauseOf(h.macaddress);
          const eth = isEth(h), sig = signal(bestRssi(h)), r = rateOf(h);
          return (
            <li key={h.id}>
              <button type="button" onClick={() => openDevice(h)}
                className="flex h-9 w-full min-w-0 items-center gap-3 rounded-md px-2 text-left text-[13.5px] outline-none transition-colors hover:bg-hover focus-visible:bg-selected max-sm:h-12">
                <i className={cn('size-1.5 shrink-0 rounded-full', pz ? 'bg-warn' : h.active ? 'bg-ok' : 'bg-[color-mix(in_oklab,var(--faint)_50%,transparent)]')} />
                <Icon name={KIND_ICON[deviceKind(h)]} className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.7} />
                <span className={cn('min-w-0 truncate', !h.active && 'text-muted-foreground')}>{displayName(h)}</span>
                <span className="min-w-0 flex-1 truncate text-[12.5px] text-faint max-md:hidden">{h.informations?.manufacturer || ''}</span>
                <span className="ml-auto shrink-0 text-[12.5px] text-muted-foreground max-md:ml-auto">{pz ? `pause · ${untilLabel(pz.until)}` : h.active ? bandLabel(h.link, h.wireless?.band) : 'hors ligne'}</span>
                <span className="grid w-5 shrink-0 place-items-center">{h.active && (eth ? <Icon name="ethernet" className="size-3.5 text-faint" /> : <SignalBars bars={sig.bars} />)}</span>
                <span className="num w-[70px] shrink-0 text-right text-[12.5px] text-muted-foreground max-sm:hidden">{h.active && r ? mbps(r) : ''}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Recent({ s }: { s: LiveState }) {
  const byMac = useMemo(() => new Map(s.hosts.map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = (s.events || []).filter((e) => !HIDE.has(e.type)).slice(0, 6);
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(list.map((e) => e.id));
  return (
    <section className="enter min-w-0">
      <Head title="Activité" count={s.unread ? `${s.unread} non lu${s.unread > 1 ? 's' : ''}` : undefined} href="#/activite" />
      {!list.length ? <Empty icon="bell" title="Pas encore d’activité">Arrivées, départs, coupures et alertes s’afficheront ici en direct.</Empty> : (
        <ul className="mt-2.5 grid gap-2.5">
          <AnimatePresence initial={false}>
            {list.map((e) => {
              const i = eventInfo(e, byMac);
              const fresh = !seen.current!.has(e.id);
              return (
                <motion.li key={e.id} layout="position" initial={fresh ? { opacity: 0, y: -6 } : false} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
                  className="flex min-w-0 items-baseline gap-3 text-[13px]">
                  <i aria-hidden className={cn('size-1.5 shrink-0 translate-y-[-2px] rounded-full', i.tone === 'ok' ? 'bg-ok' : i.tone === 'warn' ? 'bg-warn' : i.tone === 'danger' ? 'bg-danger' : 'bg-[color-mix(in_oklab,var(--faint)_60%,transparent)]')} />
                  <span className="min-w-0 flex-1 truncate">{i.title}{i.sub && <span className="text-muted-foreground"> · {i.sub}</span>}</span>
                  <span className="num shrink-0 text-[12px] text-faint">{ago(e.t).replace(/^il y a /, '')}</span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
      )}
    </section>
  );
}

function Favorites({ s, p }: { s: LiveState; p: ReturnType<typeof usePrefs> }) {
  const favDevices = p.favorites.devices.map((m) => s.hosts.find((x) => String(x.macaddress).toLowerCase() === m)).filter(Boolean) as any[];
  const favActions = p.favorites.actions.map(actionOf).filter((a): a is Action => !!a);
  return (
    <section className="enter min-w-0">
      <Head title="Favoris"><button type="button" onClick={openFavorites} className="-my-2 rounded px-1 py-2 text-[12.5px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground max-sm:-my-3 max-sm:py-3">Modifier</button></Head>
      {!favDevices.length && !favActions.length ? (
        <p className="mt-2 text-[13px] text-muted-foreground">Épinglez des appareils à mettre en pause d’un geste, le Wi-Fi invité ou la carte Wi-Fi. <button type="button" onClick={openFavorites} className="-my-2.5 inline-block py-2.5 text-foreground underline decoration-[color-mix(in_oklab,var(--foreground)_30%,transparent)] underline-offset-2 hover:decoration-foreground">Choisir</button></p>
      ) : (
        <>
          <ul className="-mx-2 mt-1.5">
            {favDevices.map((h) => {
              const pz = pauseOf(h.macaddress);
              return (
                <li key={h.id} className="flex h-9 min-w-0 items-center gap-3 rounded-md px-2 text-[13.5px] transition-colors hover:bg-hover max-sm:h-12">
                  <i className={cn('size-1.5 shrink-0 rounded-full', pz ? 'bg-warn' : h.active ? 'bg-ok' : 'bg-[color-mix(in_oklab,var(--faint)_50%,transparent)]')} />
                  <button type="button" onClick={() => openDevice(h)} className="min-w-0 flex-1 truncate text-left outline-none focus-visible:underline">{displayName(h)}</button>
                  <span className="shrink-0 text-[12.5px] text-muted-foreground max-sm:hidden">{pz ? `jusqu’à ${untilLabel(pz.until)}` : h.active ? (isEth(h) ? 'Ethernet' : signal(bestRssi(h)).label) : 'hors ligne'}</span>
                  {pz ? <Btn kind="soft" size="xs" icon="play" onClick={() => resumeDevice(h)}>Reprendre</Btn>
                    : <Btn kind="soft" size="xs" icon="pause" onClick={() => { openSheet(PauseSheet, { h }, { title: 'Mettre en pause', description: displayName(h) }); }}>Pause</Btn>}
                </li>
              );
            })}
          </ul>
          {favActions.length > 0 && <div className="mt-2.5 flex flex-wrap gap-1.5">{favActions.map((a) => <Btn key={a.id} kind="soft" size="xs" icon={a.icon} onClick={a.run}>{a.label}</Btn>)}</div>}
        </>
      )}
    </section>
  );
}

function Wifi({ s }: { s: LiveState }) {
  const w = s.wireless?.wireless || {}, sum = s.summary || {};
  const wifiOn = w.radio?.['24']?.enable === 1 || w.radio?.['5']?.enable === 1;
  const guestOn = (sum.wireless?.guestenable ?? w.ssid?.guest?.enable) === 1;
  const gt = guestTimer();
  const per: Record<string, number> = { 24: 0, 5: 0, 6: 0, mlo: 0 };
  for (const x of s.hosts.filter((y) => y.active)) { const l = x.link || ''; if (/MLO/.test(l)) per.mlo++; else if (/Ethernet/.test(l)) continue; else if (/Wifi 6/.test(l)) per[6]++; else if (/Wifi 5/.test(l)) per[5]++; else per[24]++; }
  const bands = ([['24', '2,4 GHz'], ['5', '5 GHz'], ['6', '6 GHz']] as const).filter(([k]) => w.radio?.[k]);
  const rows: [React.ReactNode, React.ReactNode][] = [
    ['Réseau', <span className="truncate">{w.ssid?.['24']?.id || '…'}</span>],
    ...bands.map(([k, l]) => [l, <span className="num">{per[k]} appareil{per[k] > 1 ? 's' : ''}<span className="text-muted-foreground"> · {kbps((s.bands[k]?.down || 0) + (s.bands[k]?.up || 0))}</span></span>] as [string, React.ReactNode]),
    ...(w.ssid?.mlo ? [['Wi-Fi 7', <span className="num">{per.mlo} appareil{per.mlo > 1 ? 's' : ''}</span>] as [string, React.ReactNode]] : []),
  ];
  return (
    <section className="enter min-w-0">
      <Head title="Wi-Fi" href="#/wifi" link="Gérer">
        <Toggle value={wifiOn} label="Wi-Fi"
          confirm={(nv) => (nv ? null : { title: 'Couper tout le Wi-Fi ?', message: 'Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Il faudra un appareil en Ethernet ou le bouton de la Bbox pour le réactiver.', confirm: 'Couper le Wi-Fi', tone: 'danger' })}
          onChange={(nv) => act(() => api.put('wireless', { 'radio.enable': nv ? 1 : 0 }), { ok: nv ? 'Wi-Fi activé' : 'Wi-Fi coupé', refresh: ['wireless'] }).then(() => refresh('statics'))} />
      </Head>
      <dl className="mt-2.5 grid grid-cols-[minmax(96px,40%)_minmax(0,1fr)] gap-y-2 text-[13px]">
        {rows.map(([k, v], i) => <div key={i} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate">{v}</dd></div>)}
      </dl>
      <button type="button" onClick={() => { openSheet(GuestSheet, { enabled: guestOn }, { title: 'Wi-Fi invité', description: w.ssid?.guest?.id }); }}
        className="-mx-2 mt-2.5 flex h-9 w-[calc(100%+16px)] items-center gap-3 rounded-md px-2 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:bg-selected max-sm:h-11">
        <Icon name="link" className="size-4 text-muted-foreground" strokeWidth={1.7} />
        <span className="flex-1">Wi-Fi invité</span>
        <span className={cn('flex items-center gap-1.5 text-[12.5px]', guestOn ? 'text-ok' : 'text-muted-foreground')}>{guestOn && <i className="size-1.5 rounded-full bg-ok" />}{guestOn ? (gt ? `jusqu’à ${untilLabel(gt.until)}` : 'actif') : 'désactivé'}</span>
        <Icon name="chevron" className="size-3.5 text-faint" />
      </button>
    </section>
  );
}

function Health({ s, dev }: { s: LiveState; dev: any }) {
  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const rx = s.sff?.wan?.receive_power ? Number(s.sff.wan.receive_power) / 1000 : null;
  const meter = (v: number, color: string) => (
    <span className="relative ml-2 inline-block h-1 w-14 overflow-hidden rounded-full bg-selected align-middle max-sm:hidden" aria-hidden>
      <motion.i className="absolute inset-y-0 left-0 w-full origin-left rounded-full" style={{ background: color }} animate={{ scaleX: Math.max(0.02, Math.min(1, v / 100)) }} transition={{ duration: 0.8, ease: EASE }} />
    </span>
  );
  const rows: [string, React.ReactNode][] = [
    ['Processeur', <><span className="num">{Math.round(s.cpu.usage)} %</span>{meter(s.cpu.usage, 'var(--chart-1)')}</>],
    ['Température', <><span className="num">{Math.round(s.cpu.temp)} °C</span>{meter((s.cpu.temp / 90) * 100, s.cpu.temp > 72 ? 'var(--warn)' : 'var(--chart-4)')}</>],
    ['Mémoire', <><span className="num">{Math.round(memPct)} %</span>{meter(memPct, 'var(--chart-2)')}</>],
    ['Signal fibre', rx == null ? '—' : <span className={cn('num', rx > -24 && rx < -8 ? '' : 'text-warn')}>{num(rx, 1)} dBm</span>],
    ['Firmware', <span className="num">{dev.main?.version || '—'}</span>],
    ['Allumée depuis', duration(dev.uptime)],
  ];
  return (
    <section className="enter min-w-0">
      <Head title="Ma Bbox" href="#/bbox" link="Détails" />
      <dl className="mt-2.5 grid grid-cols-[minmax(96px,40%)_minmax(0,1fr)] gap-y-2 text-[13px]">
        {rows.map(([k, v]) => <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 truncate">{v}</dd></div>)}
      </dl>
    </section>
  );
}
