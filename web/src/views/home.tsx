// Accueil — vue d'ensemble en direct : indicateurs, Internet (latence & débit), favoris, Wi-Fi, appareils, santé, activité.
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { PageHead, Card, CardLink, KV, Skeleton, Empty, Note, Btn, Toggle, Seg, Tile, Banner, Chip, Avatar, Row } from '@/components/kit';
import { openSheet } from '@/components/overlays';
import { Icon, KIND_ICON } from '@/components/icon';
import { PauseSheet, GuestSheet, FavoritesSheet } from '@/components/sheets';
import { LiveChart, HistoryChart, CountUp, Gauge, SignalBars, Sparkline, Donut, MiniBars, Legend } from '@/components/charts';
import { api, panel } from '@/lib/api';
import { act, useFetch, useMobile } from '@/lib/data';
import { useLive, refresh, internetOk as isInternetOk, type LiveState, type LiveEvent } from '@/lib/live';
import { kbps, bytes, duration, deviceKind, displayName, bandLabel, signal, bestRssi, num, hello } from '@/lib/format';
import { usePrefs, actionOf, pauseOf, untilLabel, guestTimer, resumeDevice, type Action } from '@/lib/prefs';
import { eventInfo, ago } from '@/lib/events';
import type { Route } from '@/lib/router';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import { ServicesGrid, TargetPicker, LatencyChart, openProbesSheet, servicesSummary } from '@/components/services';
import { useHomeChart, setHomeChart, useLatTarget, targetInfo, seriesOf, statsOf, everyLabel, fmtMs, isFromBbox } from '@/lib/services';

const fmtK = (v: number) => kbps(v);
const fmtLat = (v: number) => (v < 10 ? num(v, 1) : num(v));
const avg = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };
const isEth = (h: any) => /Ethernet/i.test(h.link || '');
/** Fiche d'un appareil : définie par la vue Appareils, chargée à la demande */
const openDevice = (h: any) => import('@/views/devices').then((m) => m.openDevice(h));
const openFavorites = () => { openSheet(FavoritesSheet, {}, { title: 'Favoris', description: 'Partagés entre tous vos appareils' }); };
const RECENT_HIDE = new Set(['wifi_restart', 'port_up', 'port_down', 'voip_up', 'login']);
// 5 indicateurs : 2 colonnes (iPhone, tablette ; le dernier sur toute la largeur), 3 + 2 (petit écran), 5 (≥ 1280 px)
const KPI_SPAN = ['lg:col-span-2 xl:col-span-1', 'lg:col-span-2 xl:col-span-1', 'lg:col-span-2 xl:col-span-1', 'lg:col-span-3 xl:col-span-1', 'col-span-2 lg:col-span-3 xl:col-span-1'];
const KPI_GRID = 'mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6 xl:grid-cols-5 max-sm:mb-3';
// grille : 1 colonne (iPhone, tablette), cartes par deux (< 1280 px, la barre latérale prend 264 px), 8 + 4 (bureau)
const W8 = 'lg:col-span-12 xl:col-span-8', W4 = 'lg:col-span-6 xl:col-span-4';

export default function Home({ route }: { route: Route }) {
  const s = useLive();
  const p = usePrefs();
  const mobile = useMobile();
  const week = useFetch(() => panel.usage(7), [], { poll: 300000 });
  if (!s.ready) return (
    <>
      <PageHead kicker={hello()} title="Accueil" />
      <div className={KPI_GRID}>
        {KPI_SPAN.map((span, i) => <div key={i} className={cn('enter card-surface px-[18px] py-4 max-sm:px-3.5', span)}><Skeleton h={12} w="50%" /><Skeleton h={26} w="70%" className="mt-3" /></div>)}
      </div>
      <div className="grid grid-cols-1 gap-4 max-sm:gap-3 lg:grid-cols-12">
        <div className={cn('enter card-surface p-5 max-sm:p-4', W8)}><Skeleton h={260} /></div>
        <div className={cn('enter card-surface p-5 max-sm:p-4', W4)}><Skeleton h={260} /></div>
      </div>
    </>
  );
  const dev = s.device?.device || {}, wan = s.wanIp?.wan || {}, sum = s.summary || {};
  const internetOk = isInternetOk(s);
  const degraded = internetOk && ((s.latency?.loss || 0) >= 10 || (s.latency?.internet || 0) > 120);
  const active = s.hosts.filter((x) => x.active);
  const guestsOn = (s.guestHosts || []).filter((x) => x.active).length;
  const lat = s.latency?.internet;
  const jitter = s.latency?.jitter || 0;
  const latAvg = avg(s.series.latency.slice(-30).map((x) => x.v));
  const alerts: number = sum.alerts?.count || 0;
  const favDevices = p.favorites.devices.map((m) => s.hosts.find((x) => String(x.macaddress).toLowerCase() === m)).filter(Boolean);
  const favActions = p.favorites.actions.map(actionOf).filter((a): a is Action => !!a);
  const noFavs = !favDevices.length && !favActions.length;
  const title = !internetOk ? 'Internet est coupé' : degraded ? 'Connexion ralentie' : 'Tout fonctionne';
  const todayTotal = (s.today?.rx || 0) + (s.today?.tx || 0);
  const days: any[] = week.data?.days || [];

  return (
    <>
      <PageHead kicker={p.owner ? `${hello()} ${p.owner}` : hello()} title={title}
        sub={`${dev.modelname || 'Bbox'} · firmware ${dev.main?.version || '…'} · allumée depuis ${duration(dev.uptime)}`} />
      {/* sur iPhone, l'état d'Internet (affiché dans la barre du haut sur ordinateur) passe sous le titre */}
      {mobile && <div className="enter -mt-2 mb-5"><StatusPill ok={internetOk} /></div>}

      {alerts > 0 && (
        <a href="#/diagnostic" className="enter group mb-4 block rounded-xl outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 geist:rounded-lg max-sm:mb-3">
          <Banner tone="warn" icon="alert" action={<Icon name="chevron" className="size-4 opacity-70 transition-transform duration-200 group-hover:translate-x-0.5" />}>
            <b>{alerts} alerte{alerts > 1 ? 's' : ''}</b> signalée{alerts > 1 ? 's' : ''} par la Bbox. Voir le diagnostic.
          </Banner>
        </a>
      )}

      <div className={KPI_GRID}>
        <Kpi href="#/stats" icon="globe" label="Latence Internet" className={KPI_SPAN[0]}
          value={lat == null ? '—' : <CountUp value={lat} format={fmtLat} />} unit="ms"
          sub={<span className="num">gigue {num(jitter, jitter < 10 ? 1 : 0)} ms · perte {s.latency?.loss || 0} %</span>}
          spark={<Sparkline data={s.series.latency.slice(-60)} color="var(--lat)" height={42} width={200} />} />
        <Kpi href="#/stats" icon="down" label="Débit descendant" className={KPI_SPAN[1]}
          value={<CountUp value={s.wan.down} format={fmtK} />} sub={`contrat ${kbps(s.wan.contract)}`}
          spark={<Sparkline data={s.series.down.slice(-40)} color="var(--down)" height={42} width={200} />} />
        <Kpi href="#/stats" icon="up" label="Débit montant" className={KPI_SPAN[2]}
          value={<CountUp value={s.wan.up} format={fmtK} />} sub={`contrat ${kbps((s.wan as any).contractUp || 0)}`}
          spark={<Sparkline data={s.series.up.slice(-40)} color="var(--up)" height={42} width={200} />} />
        <Kpi href="#/appareils" icon="devices" label="Appareils connectés" className={KPI_SPAN[3]}
          value={<CountUp value={active.length} />} unit={`/ ${s.hosts.length}`}
          sub={`${active.filter((x) => !isEth(x)).length} en Wi-Fi · ${active.filter(isEth).length} en Ethernet${guestsOn ? ` · ${guestsOn} invité${guestsOn > 1 ? 's' : ''}` : ''}`}
          spark={<Sparkline data={s.series.hostsActive.slice(-60)} color="var(--brand)" height={42} width={200} />} />
        <Kpi href="#/stats" icon="chart" label="Données aujourd’hui" className={KPI_SPAN[4]}
          value={bytes(todayTotal)} sub={<span className="num">↓ {bytes(s.today?.rx || 0)} · ↑ {bytes(s.today?.tx || 0)}</span>}
          spark={days.filter((d) => d.has).length >= 2 && (
            <div className="h-full px-[18px] pb-2.5 pt-1.5 max-sm:px-3.5" title="7 derniers jours">
              <MiniBars values={days.map((d, i, a) => (i === a.length - 1 ? todayTotal : d.rx + d.tx))} color="var(--brand)" height={30} />
            </div>
          )} />
      </div>

      <div className="grid grid-cols-1 gap-4 max-sm:gap-3 lg:grid-cols-12">
        <InternetLive s={s} latAvg={latAvg} />
        <Card className={W4} title="Favoris" icon="star" bodyClass={noFavs ? 'grid place-content-center' : undefined}
          action={<Btn kind="plain" size="xs" className="-mr-1.5" onClick={openFavorites}>Modifier</Btn>}>
          {noFavs ? (
            <Empty icon="star" title="Épinglez l’essentiel" action={<Btn kind="soft" size="sm" icon="plus" onClick={openFavorites}>Choisir des favoris</Btn>}>
              Appareils à mettre en pause d’un geste, Wi-Fi invité, carte Wi-Fi… toujours sous la main.
            </Empty>
          ) : (
            <>
              {favDevices.length > 0 && <div className="-mx-5 -mt-1 max-sm:-mx-4">{favDevices.map((h) => <FavDevice key={h.id} h={h} />)}</div>}
              {favActions.length > 0 && (
                <div className={cn('flex flex-wrap gap-2', favDevices.length > 0 && 'mt-3.5 border-t border-border pt-3.5')}>
                  {favActions.map((a) => <Btn key={a.id} kind="soft" size="sm" icon={a.icon} onClick={a.run}>{a.label}</Btn>)}
                </div>
              )}
            </>
          )}
        </Card>
        <Card className="lg:col-span-12" title="Latence des services" icon="globe" sub={servicesSummary(s) || undefined}
          action={<Btn kind="plain" size="xs" className="-mr-1.5" onClick={openProbesSheet}>Choisir</Btn>}>
          <ServicesGrid s={s} />
        </Card>

        <WifiCard s={s} />
        <DevicesCard active={active} />
        <HealthCard s={s} dev={dev} />

        <Card className="lg:col-span-6 xl:col-span-8" flush title="Activité récente" icon="bell" action={<CardLink href="#/activite">Toute l’activité</CardLink>}>
          <RecentEvents s={s} />
        </Card>
        <FiberCard s={s} wan={wan} />
      </div>
    </>
  );
}

/** Pastille d'état Internet (« pill-status ») */
function StatusPill({ ok, className }: { ok: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex h-9 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold',
      'geist:h-8 geist:rounded-md geist:px-3 geist:font-medium geist:shadow-[inset_0_0_0_1px_color-mix(in_oklab,currentColor_25%,transparent)]',
      ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger', className)}>
      <span className={cn('live-dot', !ok && 'bad')} aria-hidden />
      {ok ? 'Internet connecté' : 'Internet coupé'}
    </span>
  );
}

/** Indicateur cliquable : libellé, grande valeur, détail, mini-courbe collée au bas de la carte */
function Kpi({ href, icon, label, value, unit, sub, spark, className }: {
  href: string; icon: string; label: string; value: React.ReactNode; unit?: React.ReactNode; sub?: React.ReactNode; spark?: React.ReactNode; className?: string;
}) {
  return (
    <a href={href}
      className={cn('enter card-surface group relative block min-w-0 overflow-hidden px-[18px] pt-4 text-card-foreground outline-none [container-type:inline-size]',
        'transition-[box-shadow,border-color,scale] duration-200 ease-[cubic-bezier(.22,1,.36,1)] active:scale-[.985] focus-visible:ring-[3px] focus-visible:ring-ring/40',
        'geist:hover:border-[color-mix(in_oklab,var(--border)_55%,var(--foreground))]',
        'clair:hover:shadow-[0_0_0_1px_color-mix(in_oklab,var(--brand)_30%,transparent),var(--card-shadow)]',
        'max-sm:px-3.5 max-sm:pt-3.5', spark ? 'pb-[52px] max-sm:pb-12' : 'pb-4', className)}>
      <Icon name="chevron" className="absolute right-3 top-[17px] size-3.5 -translate-x-1 text-muted-foreground opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0 group-hover:opacity-70 max-sm:hidden" />
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <Icon name={icon} className="size-[15px] opacity-80" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="num mt-2 truncate text-[clamp(19px,15cqi,27px)] font-semibold leading-[1.12] tracking-[-0.025em] geist:tracking-[-0.04em]">
        {value}{unit != null && <small className="ml-1 text-[13.5px] font-medium tracking-normal text-muted-foreground max-sm:text-[12.5px]">{unit}</small>}
      </div>
      {sub && <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{sub}</div>}
      {spark && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-[42px]">{spark}</div>}
    </a>
  );
}

/** Grande valeur avec libellé (pastille de couleur facultative) */
function Stat({ label, value, unit, dot, small, className }: { label: React.ReactNode; value: React.ReactNode; unit?: string; dot?: string; small?: boolean; className?: string }) {
  return (
    <div className={cn('grid min-w-0 gap-0.5', className)}>
      <span className="flex items-center gap-[7px] text-[12.5px] text-muted-foreground">
        {dot && <i aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: dot }} />}{label}
      </span>
      <span className={cn('num whitespace-nowrap font-semibold leading-[1.05] tracking-[-0.03em]', small ? 'text-[24px]' : 'text-[34px] max-sm:text-[28px]')}>
        {value}{unit && <small className="ml-1 text-[14px] font-medium tracking-normal text-muted-foreground">{unit}</small>}
      </span>
    </div>
  );
}

function InternetLive({ s }: { s: LiveState; latAvg: number | null }) {
  const mode = useHomeChart() || 'lat';
  const still = useReducedMotion();
  const info = targetInfo(s, useLatTarget());
  const st = statsOf(seriesOf(s, info.id), info.every);
  // mêmes tableaux que le flux temps réel : le graphique les lit à chaque image, sans re-rendu
  const wanSeries = useMemo(() => [{ data: s.series.down, color: 'var(--down)', label: 'Descendant' }, { data: s.series.up, color: 'var(--up)', label: 'Montant' }], []);
  return (
    <Card className={cn(W8, 'scroll-mt-20')} icon="activity"
      title={<span data-lat-chart>Internet en direct{s.connected && <span className="live-dot ml-2.5 mr-2 align-middle max-sm:hidden" aria-hidden />}</span>}
      action={<Seg size="sm" value={mode} onChange={setHomeChart} label="Mesure" options={[{ v: 'lat', l: 'Latence' }, { v: 'wan', l: 'Débit' }]} />}>
      <motion.div key={mode} initial={still ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}>
        {mode === 'lat' ? (
          <>
            <div className="-ml-2.5 mb-2"><TargetPicker s={s} /></div>
            <div className="mb-3 flex flex-wrap items-end gap-x-7 gap-y-3">
              <Stat dot="var(--lat)" label="Maintenant" unit="ms" value={st.stale || st.last === undefined ? '—' : st.last === null ? 'perdu' : <CountUp value={st.last} format={fmtLat} />} />
              <Stat small label="Médiane 1 min" unit="ms" value={st.med == null ? '—' : num(st.med, st.med < 10 ? 1 : 0)} />
              <Stat small label="Gigue" unit="ms" value={st.avg == null ? '—' : num(st.jitter, st.jitter < 10 ? 1 : 0)} className="max-sm:hidden" />
              <Stat small label="Vers la Bbox" unit="ms" value={s.latency?.bbox == null ? '—' : num(s.latency.bbox, 1)} className="max-sm:hidden" />
            </div>
            <LatencyChart s={s} height={210} />
            <Note className="mt-2">{info.host} · {everyLabel(info.every)} · {isFromBbox(s) ? 'depuis la Bbox (trajet entre le serveur du panel et la Bbox retiré)' : 'depuis le serveur du panel'}. Les traits rouges signalent une mesure perdue.</Note>
          </>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-end gap-x-7 gap-y-3">
              <Stat dot="var(--down)" label="Descendant" value={<CountUp value={s.wan.down} format={fmtK} />} />
              <Stat dot="var(--up)" label="Montant" value={<CountUp value={s.wan.up} format={fmtK} />} />
            </div>
            <LiveChart height={210} format={fmtK} series={wanSeries} windowMs={600000} lag={800} />
            <Freshness wan={s.wan} />
          </>
        )}
      </motion.div>
    </Card>
  );
}

// « actualisée il y a … » : seul ce petit composant se redessine chaque seconde
function Freshness({ wan }: { wan: LiveState['wan'] }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 1000); return () => clearInterval(t); }, []);
  if (!wan.updatedAt) return null;
  const secs = Math.max(0, Math.round((Date.now() - wan.updatedAt) / 1000));
  const every = wan.interval ? Math.round(wan.interval / 1000) : 0;
  return <Note className="num mt-2">Mesure calculée par la Bbox · actualisée il y a {secs} s{every ? ` · nouvelle valeur toutes les ~${every} s` : ''}</Note>;
}

function FavDevice({ h }: { h: any }) {
  const pz = pauseOf(h.macaddress);
  const sig = signal(bestRssi(h));
  const name = displayName(h);
  return (
    <div className="flex min-h-[54px] min-w-0 items-center gap-3 border-t border-border px-5 py-2 first:border-t-0 max-sm:px-4">
      <button type="button" onClick={() => openDevice(h)} aria-label={'Ouvrir ' + name}
        className="shrink-0 rounded-[11px] outline-none transition-transform active:scale-95 focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <Avatar icon={KIND_ICON[deviceKind(h)]} size="sm" on={!!h.active} paused={!!pz} />
      </button>
      <button type="button" onClick={() => openDevice(h)} className="min-w-0 flex-1 rounded-md text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
        <div className="truncate text-[14.5px] font-medium">{name}</div>
        <div className="truncate text-[13px] text-muted-foreground">{pz ? `en pause jusqu’à ${untilLabel(pz.until)}` : h.active ? (isEth(h) ? 'Ethernet' : sig.label) : 'hors ligne'}</div>
      </button>
      {pz ? <Btn kind="soft" size="xs" icon="play" onClick={() => resumeDevice(h)}>Reprendre</Btn>
        : <Btn kind="soft" size="xs" icon="pause" onClick={() => { openSheet(PauseSheet, { h }, { title: 'Mettre en pause', description: name }); }}>Pause</Btn>}
    </div>
  );
}

function WifiCard({ s }: { s: LiveState }) {
  const w = s.wireless?.wireless || {}, sum = s.summary || {};
  const wifiOn = w.radio?.['24']?.enable === 1 || w.radio?.['5']?.enable === 1;
  const guestOn = (sum.wireless?.guestenable ?? w.ssid?.guest?.enable) === 1;
  const gt = guestTimer();
  const per: Record<string, number> = { 24: 0, 5: 0, 6: 0, mlo: 0 };
  for (const x of s.hosts.filter((y) => y.active)) { const l = x.link || ''; if (/MLO/.test(l)) per.mlo++; else if (/Ethernet/.test(l)) continue; else if (/Wifi 6/.test(l)) per[6]++; else if (/Wifi 5/.test(l)) per[5]++; else per[24]++; }
  const bands = ([['24', '2,4 GHz'], ['5', '5 GHz'], ['6', '6 GHz']] as const).filter(([k]) => w.radio?.[k]);
  const rate = (k: string) => (s.bands[k]?.down || 0) + (s.bands[k]?.up || 0);
  return (
    <Card className={W4} title="Wi-Fi" icon="wifi" action={<CardLink href="#/wifi">Gérer</CardLink>}>
      <div className="mb-3.5 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[18px] font-semibold leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] geist:tracking-[-0.02em]">{w.ssid?.['24']?.id || '…'}</div>
          <Note className="mt-0.5">{w.unified === 1 ? 'Réseau unifié 2,4 · 5 · 6 GHz' : 'Bandes séparées'}{w.driverbusy ? ' · redémarrage en cours…' : ''}</Note>
        </div>
        <Toggle value={wifiOn} label="Wi-Fi"
          confirm={(nv) => (nv ? null : { title: 'Couper tout le Wi-Fi ?', message: 'Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Il faudra un appareil en Ethernet ou le bouton de la Bbox pour le réactiver.', confirm: 'Couper le Wi-Fi', tone: 'danger' })}
          onChange={(nv) => act(() => api.put('wireless', { 'radio.enable': nv ? 1 : 0 }), { ok: nv ? 'Wi-Fi activé' : 'Wi-Fi coupé', refresh: ['wireless'] }).then(() => refresh('statics'))} />
      </div>
      {bands.length > 0 && (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(78px,1fr))] gap-2">
          {bands.map(([k, l]) => <Tile key={k} className="px-3 max-sm:px-2.5" l={l} v={kbps(rate(k))} x={`${per[k]} appareil${per[k] > 1 ? 's' : ''}`} />)}
        </div>
      )}
      <div className="-mx-5 mt-3 border-t border-border max-sm:-mx-4">
        {w.ssid?.mlo && (
          <Row className="min-h-[52px]">
            <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium">Wi-Fi 7</div><div className="truncate text-[13px] text-muted-foreground">{w.ssid.mlo.id}</div></div>
            <Chip tone="ok" className="num">{per.mlo} app.</Chip>
          </Row>
        )}
        <Row className="group min-h-[52px]" onClick={() => { openSheet(GuestSheet, { enabled: guestOn }, { title: 'Wi-Fi invité', description: w.ssid?.guest?.id }); }}>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-medium">Wi-Fi invité</div>
            <div className="truncate text-[13px] text-muted-foreground">{guestOn ? (gt ? `actif jusqu’à ${untilLabel(gt.until)}` : 'actif sans limite') : 'désactivé'}</div>
          </div>
          <Chip tone={guestOn ? 'ok' : 'off'} dot>{guestOn ? 'Actif' : 'Inactif'}</Chip>
          <Icon name="chevron" className="size-[18px] text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        </Row>
      </div>
    </Card>
  );
}

function DevicesCard({ active }: { active: any[] }) {
  const kinds = { w24: 0, w5: 0, w6: 0, mlo: 0, eth: 0 };
  for (const x of active) { const l = x.link || ''; if (/MLO/.test(l)) kinds.mlo++; else if (/Ethernet/.test(l)) kinds.eth++; else if (/Wifi 6/.test(l)) kinds.w6++; else if (/Wifi 5/.test(l)) kinds.w5++; else kinds.w24++; }
  const segs = [
    { v: kinds.mlo, color: 'var(--chart-1)', label: 'Wi-Fi 7' }, { v: kinds.w6, color: 'var(--chart-3)', label: '6 GHz' }, { v: kinds.w5, color: 'var(--chart-2)', label: '5 GHz' },
    { v: kinds.w24, color: 'var(--chart-4)', label: '2,4 GHz' }, { v: kinds.eth, color: 'var(--chart-5)', label: 'Ethernet' },
  ];
  const rate = (h: any) => Number(h.wireless?.estimatedRate) || (isEth(h) ? 1e4 : 0);
  const top = [...active].sort((a, b) => rate(b) - rate(a)).slice(0, 4);
  return (
    <Card className={W4} title="Appareils" icon="devices" action={<CardLink href="#/appareils">Tout voir</CardLink>}>
      <div className="mb-2.5 flex items-center gap-[18px]">
        <Donut segments={segs} size={112} thickness={12} label={active.length} sub="connectés" />
        <Legend vertical className="min-w-0" items={segs.filter((x) => x.v).map((x) => ({ color: x.color, label: x.label, value: x.v }))} />
      </div>
      <div className="-mx-5 max-sm:-mx-4">
        {top.map((x) => (
          <Row key={x.id} className="min-h-[50px] gap-2.5 py-2" onClick={() => openDevice(x)}>
            <Avatar icon={KIND_ICON[deviceKind(x)]} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14.5px] font-medium">{displayName(x)}</div>
              <div className="num truncate text-[13px] text-muted-foreground">{x.ipaddress}</div>
            </div>
            <Chip>{bandLabel(x.link, x.wireless?.band)}</Chip>
            {isEth(x) ? <Icon name="ethernet" className="size-4 text-muted-foreground" /> : <SignalBars bars={signal(bestRssi(x)).bars} />}
          </Row>
        ))}
      </div>
    </Card>
  );
}

function GaugeBlock({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="grid min-w-0 justify-items-center gap-1.5">{children}<span className="text-[13px] text-muted-foreground">{label}</span></div>;
}

function HealthCard({ s, dev }: { s: LiveState; dev: any }) {
  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const cpu24 = s.graphs.cpu.slice(-96);
  return (
    <Card className={W4} title="Santé de la Bbox" icon="box" action={<CardLink href="#/bbox">Détails</CardLink>}>
      <div className="mb-3.5 mt-0.5 flex justify-around gap-2">
        <GaugeBlock label="Processeur"><Gauge value={s.cpu.usage} label={Math.round(s.cpu.usage) + ' %'} size={76} color="var(--chart-1)" /></GaugeBlock>
        <GaugeBlock label="Température"><Gauge value={s.cpu.temp} max={90} label={Math.round(s.cpu.temp) + '°'} size={76} color={s.cpu.temp > 72 ? 'var(--warn)' : 'var(--chart-4)'} /></GaugeBlock>
        <GaugeBlock label="Mémoire"><Gauge value={memPct} label={Math.round(memPct) + ' %'} size={76} color="var(--chart-2)" /></GaugeBlock>
      </div>
      <KV rows={[['Sessions IP', <CountUp value={Number(s.sessions?.currentip) || 0} />], ['Requêtes DNS', <span className="num">{num(s.dns?.dns?.nbqueries)}</span>], ['Démarrages', dev.numberofboots]]} />
      <div className="mb-1.5 mt-3.5 flex justify-between gap-3 text-[13px] text-muted-foreground">
        <span className="truncate">Charge processeur · 24 h</span>
        <span className="num shrink-0">moy. {Math.round(avg(cpu24.map((x: any) => x[1])) || 0)} %</span>
      </div>
      <HistoryChart data={cpu24} color="var(--chart-1)" height={46} bars format={(v: number) => v + ' %'} />
    </Card>
  );
}

/** Événement récent (arrivées, départs, coupures, alertes) */
function EventRow({ e, byMac, fresh }: { e: LiveEvent; byMac: Map<string, any>; fresh?: boolean }) {
  const info = eventInfo(e, byMac);
  return (
    <Row className={cn('min-h-[58px]', fresh && 'enter')}>
      <Avatar icon={info.icon} size="sm" tone={info.tone} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{info.title}</div>
        <div className="truncate text-[13px] text-muted-foreground">{[ago(e.t), info.sub].filter(Boolean).join(' · ')}</div>
      </div>
      {!e.ack && <span role="img" aria-label="Non lu" className="size-2 shrink-0 rounded-full bg-warn" />}
    </Row>
  );
}

function RecentEvents({ s }: { s: LiveState }) {
  const byMac = useMemo(() => new Map(s.hosts.map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = (s.events || []).filter((e) => !RECENT_HIDE.has(e.type)).slice(0, 6);
  // les événements arrivés après l'ouverture de la page glissent en place
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null) seen.current = new Set(list.map((e) => e.id));
  if (!list.length) return <Empty icon="bell" title="Pas encore d’activité">Les arrivées et départs d’appareils, les coupures et les alertes apparaîtront ici en direct.</Empty>;
  return <div className="pb-1">{list.map((e) => <EventRow key={e.id} e={e} byMac={byMac} fresh={!!seen.current && !seen.current.has(e.id)} />)}</div>;
}

function FiberCard({ s, wan }: { s: LiveState; wan: any }) {
  const sff = s.sff?.wan || {};
  const rx = sff.receive_power ? Number(sff.receive_power) / 1000 : null;
  const pon = `${sff.pon_mode?.type || ''} ${sff.pon_mode?.moduleclass || ''}`.trim();
  return (
    <Card className={W4} title="Fibre optique" icon="fiber" action={pon ? <Chip>{pon}</Chip> : undefined}>
      <KV rows={[
        ['Signal reçu', rx != null ? <span className="num">{num(rx, 1)} dBm</span> : '—'],
        ['Qualité', rx == null ? '—' : rx > -24 && rx < -8 ? <span className="text-ok">Bonne</span> : <span className="text-warn">À surveiller</span>],
        ['IPv4', <WanIp className="font-mono text-[0.92em]" ip={wan.ip?.address} />],
        ['Préfixe IPv6', <WanIp className="font-mono text-[0.92em]" ip={wan.ip?.ip6prefix?.[0]?.prefix} />],
      ]} />
      <Note className="mb-1 mt-3.5">Température de la Bbox · 24 h</Note>
      <HistoryChart data={s.graphs.temp.slice(-96)} color="var(--chart-4)" height={60} scale={(v: number) => v / 1000} />
    </Card>
  );
}
