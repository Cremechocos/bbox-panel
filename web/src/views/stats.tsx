// Statistiques : historique enregistré par le serveur du panel (consommation, débit, latence, appareils, Bbox).
import * as React from 'react';
import { useState } from 'react';
import { PageHead, Card, Seg, Skeleton, Note } from '@/components/kit';
import { Icon } from '@/components/icon';
import { TimeChart, BarChart, Legend } from '@/components/charts';
import { panel } from '@/lib/api';
import { useFetch, useMobile } from '@/lib/data';
import { kbps, bytes, num } from '@/lib/format';
import type { Route } from '@/lib/router';
import { cn } from '@/lib/utils';

const RANGES = [{ v: '1h', l: '1 h' }, { v: '24h', l: '24 h' }, { v: '7d', l: '7 j' }, { v: '30d', l: '30 j' }];
const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pick = (pts: any[], k: string): number[] => pts.map((p) => p[k]).filter((v) => v != null);
const dayLabel = (d: any) => String(Number(d.date.slice(8, 10)));
const longDay = (d: any) => { const s = new Date(d.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const monthLabel = (m: any) => new Date(m.month + '-15').toLocaleDateString('fr-FR', { month: 'short' });
const longMonth = (m: any) => { const s = new Date(m.month + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const gb = (v: number) => bytes(v);
const ms = (v: number) => Math.round(v) + ' ms';
const USAGE_KEYS = [{ key: 'rx', color: 'var(--down)', label: 'Téléchargé' }, { key: 'tx', color: 'var(--up)', label: 'Envoyé' }];
// 5 indicateurs : 2 colonnes (iPhone, tablette ; le dernier sur toute la largeur), 3 + 2 (petit écran), 5 (≥ 1280 px)
const KPI_SPAN = ['lg:col-span-2 xl:col-span-1', 'lg:col-span-2 xl:col-span-1', 'lg:col-span-2 xl:col-span-1', 'lg:col-span-3 xl:col-span-1', 'col-span-2 lg:col-span-3 xl:col-span-1'];

export default function Stats({ route }: { route: Route }) {
  const [range, setRange] = useState('24h');
  const [uview, setUview] = useState('days');
  const mobile = useMobile();
  const hist = useFetch(() => panel.history(range), [range], { poll: 60000 });
  const usage = useFetch(() => panel.usage(31), [], { poll: 120000 });
  const pts: any[] = hist.data?.points || [];
  const step: number = hist.data?.step || 60000;
  const from: number | undefined = hist.data?.from, to = Date.now();
  const u = usage.data;
  const month = u?.months?.[u.months.length - 1];
  const daysThisMonth = new Date().getDate();
  const lat = avg(pick(pts, 'l')), loss = avg(pick(pts, 'ls'));
  const peak = Math.max(0, ...pick(pts, 'dm'));
  const today = u?.today || { rx: 0, tx: 0 };
  const since = u?.since ? new Date(u.since + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;
  const first = hist.loading && !pts.length; // premier chargement de la période
  const busy = hist.loading && pts.length > 0; // changement de période : on garde l'ancien tracé, estompé
  const chart = (h: number, node: React.ReactNode) => (first ? <Skeleton h={h} /> : <div className={cn('transition-opacity duration-300', busy && 'opacity-50')}>{node}</div>);

  return (
    <>
      <PageHead kicker="Vue d’ensemble" title="Statistiques" sub={since ? `Historique enregistré par le serveur du panel depuis le ${since}` : 'Historique enregistré par le serveur du panel'}
        actions={!mobile && <Seg options={RANGES} value={range} onChange={setRange} label="Période" />} />
      {/* iPhone : sélecteur de période pleine largeur sous le titre */}
      {mobile && <div className="enter -mt-2 mb-4"><Seg block options={RANGES} value={range} onChange={setRange} label="Période" /></div>}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-6 xl:grid-cols-5 max-sm:mb-3">
        <Kpi className={KPI_SPAN[0]} icon="calendar" label="Aujourd’hui" value={u ? gb(today.rx + today.tx) : <Skeleton h={26} w={96} className="my-[3px]" />} sub={u ? <span className="num">↓ {gb(today.rx)} · ↑ {gb(today.tx)}</span> : 'chargement…'} />
        <Kpi className={KPI_SPAN[1]} icon="chart" label="Ce mois-ci" value={!u ? <Skeleton h={26} w={96} className="my-[3px]" /> : month ? gb(month.rx + month.tx) : '—'}
          sub={month ? <span className="num">moy. {gb((month.rx + month.tx) / Math.max(1, Math.min(daysThisMonth, month.days)))} / jour</span> : u ? 'en cours de calcul' : 'chargement…'} />
        <Kpi className={KPI_SPAN[2]} icon="globe" label="Latence moyenne" value={first ? <Skeleton h={26} w={72} className="my-[3px]" /> : lat == null ? '—' : num(lat, lat < 10 ? 1 : 0)} unit={first ? undefined : 'ms'} sub={`sur ${RANGES.find((r) => r.v === range)!.l}`} />
        <Kpi className={KPI_SPAN[3]} icon="check" label="Disponibilité" value={first ? <Skeleton h={26} w={72} className="my-[3px]" /> : loss == null ? '—' : num(Math.max(0, 100 - loss), 2)} unit={first ? undefined : '%'} sub="mesures réussies" />
        <Kpi className={KPI_SPAN[4]} icon="zap" label="Pic de débit" value={first ? <Skeleton h={26} w={96} className="my-[3px]" /> : peak ? kbps(peak) : '—'} sub="descendant, sur la période" />
      </div>

      <div className="grid grid-cols-1 gap-4 max-sm:gap-3 lg:grid-cols-12">
        <Card className="lg:col-span-12" title="Consommation Internet" icon="chart">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <Legend items={USAGE_KEYS} />
            <Seg size="sm" value={uview} onChange={setUview} label="Vue" options={[{ v: 'days', l: '31 jours' }, { v: 'months', l: 'Mois' }]} />
          </div>
          {!u ? <Skeleton h={210} /> : uview === 'days'
            ? <BarChart data={u.days} height={220} keys={USAGE_KEYS} format={gb} label={dayLabel} tipLabel={longDay} highlight={(d: any) => d.has} />
            : <BarChart data={u.months} height={220} keys={USAGE_KEYS} format={gb} label={monthLabel} tipLabel={longMonth} />}
          <Note className="mt-2">Calculée à partir des compteurs de la Bbox. Les jours où le serveur du panel était arrêté peuvent être incomplets.</Note>
        </Card>

        <Card className="lg:col-span-12" title="Débit Internet" icon="activity" sub="moyenne par intervalle">
          <div className="mb-3"><Legend items={[{ color: 'var(--down)', label: 'Descendant' }, { color: 'var(--up)', label: 'Montant' }, { color: 'var(--down)', label: 'Pic descendant', dash: true }]} /></div>
          {chart(220, <TimeChart points={pts} step={step} from={from} to={to} height={230} format={kbps}
            series={[{ key: 'dm', color: 'var(--down)', label: 'Pic ↓', width: 1, dash: '3 3' }, { key: 'd', color: 'var(--down)', label: 'Descendant', area: true }, { key: 'u', color: 'var(--up)', label: 'Montant', area: true }]} />)}
        </Card>

        <Card className="lg:col-span-6" title="Latence Internet" icon="globe" sub="moyenne et 95ᵉ centile">
          {chart(200, <TimeChart points={pts} step={step} from={from} to={to} height={210} format={ms} threshold={100}
            band={{ lo: 'l', hi: 'lp', color: 'var(--lat)', label: '95ᵉ centile' }} series={[{ key: 'l', color: 'var(--lat)', label: 'Moyenne' }]} />)}
        </Card>
        <Card className="lg:col-span-6" title="Appareils connectés" icon="devices">
          {chart(200, <TimeChart points={pts} step={step} from={from} to={to} height={210} format={(v: number) => String(Math.round(v))}
            series={[{ key: 'h', color: 'var(--chart-1)', label: 'Total', area: true }, { key: 'w', color: 'var(--chart-2)', label: 'En Wi-Fi' }]} />)}
        </Card>
        <Card className="lg:col-span-6" title="Température de la Bbox" icon="thermo">
          {chart(180, <TimeChart points={pts} step={step} from={from} to={to} height={190} format={(v: number) => Math.round(v) + ' °C'} yMax={100}
            series={[{ key: 'k', color: 'var(--chart-4)', label: 'Température', area: true }]} />)}
        </Card>
        <Card className="lg:col-span-6" title="Charge du processeur" icon="cpu">
          {chart(180, <TimeChart points={pts} step={step} from={from} to={to} height={190} format={(v: number) => Math.round(v) + ' %'} yMax={100}
            series={[{ key: 'c', color: 'var(--chart-1)', label: 'Processeur', area: true }]} />)}
        </Card>
      </div>
    </>
  );
}

/** Indicateur de synthèse (libellé, grande valeur, détail) */
function Kpi({ icon, label, value, unit, sub, className }: { icon: string; label: string; value: React.ReactNode; unit?: string; sub?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('enter card-surface min-w-0 px-[18px] py-4 [container-type:inline-size] max-sm:px-3.5 max-sm:py-3.5', className)}>
      <div className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground">
        <Icon name={icon} className="size-[15px] opacity-80" />
        <span className="min-w-0 truncate">{label}</span>
      </div>
      <div className="num mt-2 truncate text-[clamp(19px,15cqi,27px)] font-semibold leading-[1.12] tracking-[-0.025em] geist:tracking-[-0.04em]">
        {value}{unit && <small className="ml-1 text-[13.5px] font-medium tracking-normal text-muted-foreground max-sm:text-[12.5px]">{unit}</small>}
      </div>
      {sub && <div className="mt-1 text-[12.5px] leading-snug text-muted-foreground">{sub}</div>}
    </div>
  );
}
