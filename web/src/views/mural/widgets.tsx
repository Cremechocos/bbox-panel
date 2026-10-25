// Mode mural : les tuiles. Une tuile = un cadre commun (carte en Bbox Clair, simple filet en Noir Geist
// « Ligne ») et un contenu dimensionné sur la tuile elle-même (unités de conteneur), lisible de loin.
import * as React from 'react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { QR } from '@/components/kit';
import { Icon, KIND_ICON } from '@/components/icon';
import { LiveChart, CountUp, Gauge, Sparkline } from '@/components/charts';
import { internetOk, type LiveState } from '@/lib/live';
import { kbps, bytes, num, duration, displayName, deviceKind, bandLabel, mbps, wifiQrString } from '@/lib/format';
import { eventInfo, evTime } from '@/lib/events';
import { usePrefs, pauseOf, untilLabel } from '@/lib/prefs';
import { cn } from '@/lib/utils';
import { WanIp } from '@/components/private';
import { ServiceGlyph } from '@/components/service-icon';
import { useAppearance } from '@/lib/theme';
import { QUALITY, fmtMs, median, probesOf, qualityOf, seriesOf, statsOf, targetInfo } from '@/lib/services';
import { metaOf, type Widget, type Size } from './config';

const EASE = [0.22, 1, 0.36, 1] as const;
const NB = '\u202f';
const split = (s: string) => { const i = s.lastIndexOf(NB); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)]; };
const isEth = (h: any) => /Ethernet/i.test(h.link || '');
const rateOf = (h: any): number => Number(h.wireless?.estimatedRate) || (isEth(h) && h.ethernet?.speed ? Number(h.ethernet.speed) : 0);
const fmtLat = (v: number) => (v < 10 ? num(v, 1) : num(v));
const avg = (a: (number | null | undefined)[]) => { const v = a.filter((x): x is number => x != null); return v.length ? v.reduce((x, y) => x + y, 0) / v.length : null; };

// Largeur des tuiles : pleine largeur sur iPhone, moitié sur tablette, taille choisie sur grand écran
// (iPhone et tablette en portrait : la page défile ; à partir de 1024 px, tout tient dans l'écran)
const SPAN: Record<Size, string> = {
  3: 'md:col-span-6 lg:col-span-3',
  4: 'md:col-span-6 lg:col-span-4',
  6: 'md:col-span-12 lg:col-span-6',
  8: 'md:col-span-12 lg:col-span-8',
  12: 'md:col-span-12 lg:col-span-12',
};

/** Hauteur et largeur disponibles d'un élément (graphiques, QR code, horloge à aiguilles) */
export function useBox<T extends HTMLElement>(min = 0) {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: min });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e.contentRect.width), h: Math.max(min, Math.floor(e.contentRect.height)) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [min]);
  return [ref, box] as const;
}
function useNow(ms = 1000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    // calé sur le changement de seconde pour que l'horloge ne prenne pas de retard
    let t: ReturnType<typeof setTimeout>;
    const tick = () => { setNow(new Date()); t = setTimeout(tick, ms - (Date.now() % ms) + 15); };
    t = setTimeout(tick, ms - (Date.now() % ms) + 15);
    return () => clearTimeout(t);
  }, [ms]);
  return now;
}

/** Grand chiffre avec son unité (l'unité suit la taille, en plus discret) */
function Big({ value, unit, className }: { value: React.ReactNode; unit?: React.ReactNode; className?: string }) {
  return <div className={cn('wall-num num whitespace-nowrap', className)}>{value}{unit && <span className="wall-unit">{unit}</span>}</div>;
}
function Sub({ children, className, tone }: { children: React.ReactNode; className?: string; tone?: 'ok' | 'bad' }) {
  return <div className={cn('wall-small mt-[0.5em] truncate', tone === 'ok' ? 'text-ok' : tone === 'bad' ? 'text-danger' : 'text-muted-foreground', className)}>{children}</div>;
}
function Empty({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-start justify-center gap-[0.6em] text-muted-foreground">
      <Icon name={icon} className="size-[1.6em] opacity-60" strokeWidth={1.6} />
      <div className="wall-text max-w-[28ch]">{children}</div>
    </div>
  );
}

/** Liste qui n'affiche que les lignes entières tenant dans la tuile (pas de ligne coupée en bas) */
function FitList({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLUListElement>(null);
  useLayoutEffect(() => {
    const ul = ref.current;
    if (!ul) return;
    const fit = () => {
      const h = ul.clientHeight;
      for (const li of Array.from(ul.children) as HTMLElement[]) li.style.visibility = li.offsetTop + li.offsetHeight > h + 1 ? 'hidden' : '';
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(ul);
    return () => ro.disconnect();
  });
  return <ul ref={ref} className={cn('relative min-h-0 flex-1 overflow-hidden', className)}>{children}</ul>;
}

/** Cadre d'une tuile */
export function Tile({ w, edit, children, aside, label }: { w: Widget; edit?: boolean; children: React.ReactNode; aside?: React.ReactNode; label?: React.ReactNode }) {
  const m = metaOf(w.id);
  return (
    <motion.section layout="position" transition={{ layout: { duration: 0.45, ease: EASE } }} data-tile={w.id} data-tall={w.tall || undefined}
      className={cn('wall-tile card-surface relative col-span-12 flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[26px] p-[var(--wall-pad)]',
        'geist:rounded-none geist:border-t geist:border-[color-mix(in_oklab,var(--foreground)_13%,transparent)] geist:px-0 geist:pb-0 geist:pt-[calc(var(--wall-pad)*0.75)]',
        SPAN[w.size], w.tall && 'lg:row-span-2',
        edit && 'outline-2 outline-offset-4 outline-dashed outline-[color-mix(in_oklab,var(--foreground)_22%,transparent)]')}>
      <header className="wall-label flex min-w-0 items-center gap-[0.6em] text-muted-foreground">
        <span className="grid size-[2.1em] shrink-0 place-items-center rounded-[0.7em] bg-brand-soft text-brand-ink geist:hidden" aria-hidden><Icon name={m.icon} className="size-[1.05em]" strokeWidth={2} /></span>
        <h2 className="flex min-w-0 items-center gap-[0.4em] truncate font-semibold text-foreground geist:font-medium geist:text-muted-foreground">{label ?? m.label}</h2>
        <span className="flex-1" />
        {aside}
      </header>
      <div className="mt-[calc(var(--wall-pad)*0.65)] flex min-h-0 flex-1 flex-col">{children}</div>
    </motion.section>
  );
}

// ═════════════ Les tuiles ═════════════

function ClockW({ w }: { w: Widget }) {
  const now = useNow(1000);
  const hm = now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const ss = String(now.getSeconds()).padStart(2, '0');
  const date = now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  if (w.opts.style === 'analog') return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-[0.5em] max-lg:h-[300px] max-lg:flex-none">
      <AnalogClock now={now} seconds={!!w.opts.seconds} />
      {w.opts.date && <div className="wall-text text-muted-foreground first-letter:uppercase">{date}</div>}
    </div>
  );
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="wall-clock wall-num num whitespace-nowrap" aria-label={`Il est ${hm}`}>
        {hm}{w.opts.seconds && <span className="ml-[0.08em] text-[0.42em] tracking-[-0.02em] text-muted-foreground">{ss}</span>}
      </div>
      {w.opts.date && <div className="wall-md mt-[0.35em] truncate font-normal text-muted-foreground first-letter:uppercase">{date}</div>}
    </div>
  );
}
function AnalogClock({ now, seconds }: { now: Date; seconds: boolean }) {
  const h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  const ha = (h + m / 60) * 30, ma = (m + s / 60) * 6, sa = s * 6;
  return (
    <svg viewBox="0 0 200 200" className="aspect-square h-full max-h-full w-auto max-w-full" role="img" aria-label={now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}>
      <circle cx="100" cy="100" r="97" fill="none" stroke="color-mix(in oklab, var(--foreground) 12%, transparent)" strokeWidth="2" />
      {Array.from({ length: 60 }, (_, i) => {
        const big = i % 5 === 0;
        return <line key={i} x1="100" y1={big ? 9 : 10} x2="100" y2={big ? 22 : 15} transform={`rotate(${i * 6} 100 100)`} stroke="currentColor" strokeOpacity={big ? 0.85 : 0.25} strokeWidth={big ? 3 : 1.4} strokeLinecap="round" />;
      })}
      <line x1="100" y1="112" x2="100" y2="52" transform={`rotate(${ha} 100 100)`} stroke="currentColor" strokeWidth="7" strokeLinecap="round" />
      <line x1="100" y1="116" x2="100" y2="30" transform={`rotate(${ma} 100 100)`} stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" />
      {seconds && <line x1="100" y1="122" x2="100" y2="24" transform={`rotate(${sa} 100 100)`} stroke="var(--wall-accent)" strokeWidth="1.8" strokeLinecap="round" />}
      <circle cx="100" cy="100" r="5" fill={seconds ? 'var(--wall-accent)' : 'currentColor'} />
    </svg>
  );
}

function InternetW({ w, s }: { w: Widget; s: LiveState }) {
  const ok = internetOk(s);
  const wan = s.wanIp?.wan || {}, dev = s.device?.device || {};
  const pon = `${s.sff?.wan?.pon_mode?.type || ''}`.trim();
  const slow = ok && ((s.latency?.loss || 0) >= 10 || (s.latency?.internet || 0) > 120);
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="flex items-center gap-[0.32em] wall-lg wall-num">
        <span className={cn('live-dot !size-[0.26em]', !ok && 'bad')} aria-hidden />
        <span className={cn(!ok && 'text-danger')}>{ok ? (slow ? 'Ralenti' : 'En ligne') : 'Coupé'}</span>
      </div>
      <Sub>{pon ? `Fibre ${pon}` : 'Fibre'}{w.opts.ip && wan.ip?.address && <> · <WanIp ip={wan.ip.address} /></>}</Sub>
      {w.opts.uptime && dev.uptime ? <Sub className="!mt-[0.2em]">Bbox allumée depuis {duration(dev.uptime)}</Sub> : null}
    </div>
  );
}

function LatencyW({ w, s }: { w: Widget; s: LiveState }) {
  const info = targetInfo(s, w.opts.target || 'internet');
  const pts = seriesOf(s, info.id);
  const st = statsOf(pts, info.every);
  const lat = info.id === 'internet' ? s.latency?.internet : st.stale ? undefined : st.last;
  const series = useMemo(() => [{ data: pts, color: 'var(--wall-accent)', label: info.name }], [pts, info.name]);
  const [box, b] = useBox<HTMLDivElement>(90);
  const loss = info.id === 'internet' ? s.latency?.loss || 0 : st.loss;
  const slow = info.every > 5000;
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-end gap-x-[0.6em]">
        <Big className="wall-lg" value={lat == null ? (lat === null ? 'perdu' : '—') : <CountUp value={lat} format={fmtLat} />} unit={lat == null ? undefined : 'ms'} />
        <Sub className="!mt-0 pb-[0.4em]" tone={loss ? 'bad' : undefined}>{loss ? `${loss} % de perte` : st.med != null ? `médiane 1 min : ${fmtLat(st.med)} ms` : ''}</Sub>
      </div>
      {w.opts.chart && (
        <div ref={box} className="relative mt-[calc(var(--wall-pad)*0.6)] min-h-[110px] flex-1 max-lg:h-[160px] max-lg:flex-none">
          <div className="absolute inset-0"><LiveChart key={info.id} height={b.h} series={series} windowMs={(w.opts.minutes || 5) * 60000} lag={slow ? 1500 : info.every + 300} threshold={100} loss hold={slow} format={(v: number) => Math.round(v) + ' ms'} /></div>
        </div>
      )}
    </>
  );
}

/** Grille qui remplit la tuile : colonnes, disposition des cases (logo au-dessus ou à gauche) et taille du texte
 *  choisies pour que tout tienne, le plus grand possible. Besoins exprimés en « em » de la case. */
type Fit = { cols: number; rows: number; f: number; kind: 'v' | 'h'; spark: boolean };
function fitGrid(n: number, W: number, H: number, gap: number, spark: boolean, geist: boolean): Fit {
  const pad = geist ? 0.85 : 1.4;
  const kinds = [
    { kind: 'v' as const, h: (s: boolean) => pad + 3.9 + (s ? 1.3 : 0), w: geist ? 6.6 : 7.8 },
    { kind: 'h' as const, h: (s: boolean) => pad + 3.55 + (s ? 1.3 : 0), w: geist ? 8.4 : 9.8 },
  ];
  let best: Fit = { cols: 1, rows: n, f: 0, kind: 'v', spark };
  for (const sp of spark ? [true, false] : [false]) {
    for (let cols = 1; cols <= n; cols++) {
      const rows = Math.ceil(n / cols);
      const cw = (W - gap * (cols - 1)) / cols, ch = (H - gap * (rows - 1)) / rows;
      for (const k of kinds) {
        // sans les mini-courbes seulement si cela agrandit nettement le texte
        const f = Math.min(ch / k.h(sp), cw / k.w) * (sp ? 1.22 : 1);
        if (f > best.f * 1.02) best = { cols, rows, f, kind: k.kind, spark: sp };
      }
    }
  }
  if (best.spark) best.f /= 1.22;
  return { ...best, f: Math.max(10, Math.min(64, best.f)) };
}
function useWide() {
  const q = '(min-width: 1024px)';
  const [m, setM] = useState(() => matchMedia(q).matches);
  useEffect(() => { const mq = matchMedia(q); const on = () => setM(mq.matches); mq.addEventListener('change', on); return () => mq.removeEventListener('change', on); }, []);
  return m;
}

function ServiceValue({ v, className }: { v: number | null | undefined; className?: string }) {
  return (
    <div className={cn('num whitespace-nowrap font-semibold tracking-[-0.035em] geist:font-medium', v != null && v >= 1000 ? 'text-[1.6em]' : 'text-[2.1em]', '!leading-none', className)}>
      {v === undefined ? <span className="text-faint">—</span> : v === null ? <span className="text-[0.62em] text-danger">perdu</span> : <><CountUp value={v} format={fmtMs} /><span className="wall-unit">ms</span></>}
    </div>
  );
}
function ServicesW({ w, s }: { w: Widget; s: LiveState }) {
  const geist = useAppearance().skin === 'geist';
  const wide = useWide();
  const [box, b] = useBox<HTMLDivElement>(0);
  const pick: string[] = w.opts.pick || [];
  const every = s.probes?.every || 5000;
  const rows = probesOf(s).filter((p) => !pick.length || pick.includes(p.id)).map((p) => {
    const pts = seriesOf(s, p.id);
    return { p, pts, st: statsOf(pts, p.id === 'cloudflare' || p.id === 'google-dns' ? 2000 : every) };
  });
  if (w.opts.sort === 'fast') rows.sort((a, c) => (a.st.med ?? 1e9) - (c.st.med ?? 1e9));
  if (!rows.length) return <Empty icon="globe">Aucun service mesuré : choisissez-en sur l’accueil (« Latence des services »).</Empty>;
  const gap = geist ? 18 : 12;
  // petite tuile : on n'affiche que les services qui tiennent avec un texte lisible (≥ 14 px)
  let L: Fit | null = null, shown = rows.length;
  if (wide && b.w > 0 && b.h > 0) {
    for (; shown >= 1; shown--) { L = fitGrid(shown, b.w, b.h, gap, w.opts.spark !== false, geist); if (L.f >= 14) break; }
    shown = Math.max(1, shown);
  }
  const kind = L?.kind || 'h';
  const spark = L ? L.spark : w.opts.spark !== false;
  // correction après rendu : si une case déborde (police, valeur à 4 chiffres), on réduit un peu le texte
  const grid = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(1);
  const key = L ? `${L.cols}x${L.rows}:${Math.round(L.f)}:${L.kind}:${L.spark}` : '';
  useLayoutEffect(() => { setK(1); }, [key]);
  useLayoutEffect(() => {
    const g = grid.current;
    if (!g || !L) return;
    const over = [...g.children].some((c) => c.scrollHeight > c.clientHeight + 1 || c.scrollWidth > c.clientWidth + 1);
    if (over && L.f * k * 0.94 >= 10) setK((x) => x * 0.94);
  });
  return (
    <div ref={box} className="relative min-h-0 flex-1">
      <div ref={grid} className={cn('grid gap-3 text-[15px] max-lg:grid-cols-2 sm:max-lg:grid-cols-3 lg:absolute lg:inset-0', geist && 'gap-x-5')}
        style={L ? { gridTemplateColumns: `repeat(${L.cols}, minmax(0, 1fr))`, gridTemplateRows: `repeat(${L.rows}, minmax(0, 1fr))`, fontSize: L.f * k, gap } : undefined}>
        {rows.slice(0, shown).map(({ p, pts, st }) => {
          const v = st.stale ? undefined : st.last;
          const q = qualityOf(v, st.stale);
          const dot = <i className="size-[0.5em] shrink-0 rounded-full transition-colors duration-500" style={{ background: QUALITY[q].color }} aria-label={QUALITY[q].label} />;
          const line = spark && (
            <div className="mt-auto h-[1em] shrink-0 pt-[0.15em]">
              <Sparkline data={pts.slice(-30)} color="color-mix(in oklab, var(--wall-accent) 80%, transparent)" height={20} width={120} strokeWidth={1.5} fill={!geist} className="h-full" />
            </div>
          );
          return (
            <div key={p.id} title={`${p.name} · ${p.host}`}
              className={cn('flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[0.8em] bg-surface px-[0.8em] py-[0.7em]',
                'geist:rounded-none geist:border-t geist:border-[color-mix(in_oklab,var(--foreground)_10%,transparent)] geist:bg-transparent geist:px-0 geist:pb-[0.25em] geist:pt-[0.6em]')}>
              {kind === 'v' ? (
                <>
                  <div className="mb-[0.3em] flex min-w-0 items-center gap-[0.5em]">
                    <ServiceGlyph id={p.id} name={p.name} className="size-[1.3em]" />
                    <span className="min-w-0 flex-1 truncate text-[0.8em] font-medium leading-tight text-muted-foreground geist:font-normal">{p.name}</span>
                    {dot}
                  </div>
                  <ServiceValue v={v} className="mt-auto" />
                  {line}
                </>
              ) : (
                <>
                  <div className="my-auto flex min-w-0 items-center gap-[0.6em]">
                    <ServiceGlyph id={p.id} name={p.name} className="size-[2.1em]" />
                    <div className="min-w-0 flex-1">
                      <div className="flex min-w-0 items-center gap-[0.45em]"><ServiceValue v={v} />{dot}</div>
                      <div className="mt-[0.3em] truncate text-[0.8em] font-medium leading-tight text-muted-foreground geist:font-normal">{p.name}</div>
                    </div>
                  </div>
                  {line}
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
function ServicesAside({ w, s }: { w: Widget; s: LiveState }) {
  const pick: string[] = w.opts.pick || [];
  const meds = probesOf(s).filter((p) => !pick.length || pick.includes(p.id)).map((p) => statsOf(seriesOf(s, p.id)).med).filter((v): v is number => v != null);
  const m = median(meds);
  return m == null ? null : <span className="wall-small num text-muted-foreground">médiane {fmtMs(m)} ms</span>;
}

function TrafficW({ w, s }: { w: Widget; s: LiveState }) {
  const series = useMemo(() => [{ data: s.series.down, color: 'var(--wall-accent)', label: 'Réception' }, { data: s.series.up, color: 'var(--wall-accent-2)', label: 'Envoi' }], []);
  const [box, b] = useBox<HTMLDivElement>(90);
  const [dv, du] = split(kbps(s.wan.down));
  const [uv, uu] = split(kbps(s.wan.up));
  return (
    <>
      <div className="flex min-w-0 flex-wrap items-end gap-x-[1.1em] gap-y-[0.3em]">
        <div className="min-w-0">
          <div className="wall-small flex items-center gap-[0.35em] text-muted-foreground"><i className="h-[3px] w-[1.1em] rounded-full bg-[var(--wall-accent)]" aria-hidden />Réception</div>
          <Big className="wall-lg mt-[0.15em]" value={<CountUp value={s.wan.down} format={(v: number) => split(kbps(v))[0]} />} unit={du} />
        </div>
        <div className="min-w-0">
          <div className="wall-small flex items-center gap-[0.35em] text-muted-foreground"><i className="h-[3px] w-[1.1em] rounded-full bg-[var(--wall-accent-2)]" aria-hidden />Envoi</div>
          <Big className="wall-md mt-[0.15em] pb-[0.08em]" value={<CountUp value={s.wan.up} format={(v: number) => split(kbps(v))[0]} />} unit={uu} />
        </div>
        <span className="sr-only">{dv} {du} en réception, {uv} {uu} en envoi</span>
      </div>
      {w.opts.chart && (
        <div ref={box} className="relative mt-[calc(var(--wall-pad)*0.6)] min-h-[110px] flex-1 max-lg:h-[160px] max-lg:flex-none">
          <div className="absolute inset-0"><LiveChart height={b.h} series={series} windowMs={(w.opts.minutes || 30) * 60000} lag={800} format={kbps} /></div>
        </div>
      )}
    </>
  );
}

function TodayW({ w, s }: { w: Widget; s: LiveState }) {
  const rx = s.today?.rx || 0, tx = s.today?.tx || 0;
  const [v, u] = split(bytes(rx + tx));
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <Big className="wall-xl" value={v} unit={u} />
      {w.opts.split && <Sub>↓ {bytes(rx)}  ·  ↑ {bytes(tx)}</Sub>}
    </div>
  );
}

function DevicesW({ w, s }: { w: Widget; s: LiveState }) {
  const active = s.hosts.filter((h) => h.active);
  const wifi = active.filter((h) => !isEth(h)).length;
  const byMac = useMemo(() => new Map(s.hosts.map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const max = Number(w.opts.max) || 5;
  const list: any[] = w.opts.list === 'none' ? []
    : w.opts.list === 'recent'
      ? [...new Set((s.events || []).filter((e) => e.type === 'arrive' && e.mac).map((e) => String(e.mac).toLowerCase()))].map((m) => byMac.get(m)).filter((h) => h?.active).slice(0, max)
      : [...active].sort((a, b) => rateOf(b) - rateOf(a)).slice(0, max);
  return (
    <>
      <div className="flex min-w-0 items-end gap-x-[0.6em]">
        <Big className={list.length ? 'wall-lg' : 'wall-xl'} value={<CountUp value={active.length} />} unit={`/ ${s.hosts.length}`} />
      </div>
      <Sub>{wifi} en Wi-Fi · {active.length - wifi} en Ethernet</Sub>
      {list.length > 0 && (
        <FitList className="wall-text mt-[calc(var(--wall-pad)*0.6)]">
          {list.map((h) => (
            <li key={h.macaddress} className="flex min-w-0 items-center gap-[0.6em] border-t border-[color-mix(in_oklab,var(--foreground)_8%,transparent)] py-[0.45em] first:border-t-0">
              <Icon name={KIND_ICON[deviceKind(h)]} className="size-[1.05em] shrink-0 text-muted-foreground" strokeWidth={1.8} />
              <span className="min-w-0 flex-1 truncate">{displayName(h)}</span>
              <span className="wall-small shrink-0 text-muted-foreground">{bandLabel(h.link, h.wireless?.band)}</span>
              {rateOf(h) > 0 && <span className="wall-small num w-[5.2em] shrink-0 text-right text-muted-foreground max-sm:hidden">{mbps(rateOf(h))}</span>}
            </li>
          ))}
        </FitList>
      )}
    </>
  );
}

const PRESENCE = new Set(['arrive', 'leave', 'new_device']);
const ALL = new Set(['arrive', 'leave', 'new_device', 'internet_down', 'internet_up', 'pause_start', 'pause_end', 'guest_on', 'guest_off']);
function ActivityW({ w, s }: { w: Widget; s: LiveState }) {
  const kinds = w.opts.kinds === 'all' ? ALL : PRESENCE;
  const max = Number(w.opts.max) || 5;
  const byMac = useMemo(() => new Map(s.hosts.map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = (s.events || []).filter((e) => kinds.has(e.type)).slice(0, max);
  if (!list.length) return <Empty icon="bell">Rien de nouveau pour le moment.</Empty>;
  return (
    <FitList className="wall-text">
      <AnimatePresence initial={false}>
        {list.map((e) => {
          const i = eventInfo(e, byMac);
          return (
            <motion.li key={e.id} layout initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: EASE }}
              className="flex min-w-0 items-center gap-[0.65em] border-t border-[color-mix(in_oklab,var(--foreground)_8%,transparent)] py-[0.45em] first:border-t-0">
              <span className={cn('grid size-[1.9em] shrink-0 place-items-center rounded-[0.6em] geist:size-[1.6em] geist:rounded-[0.45em]',
                i.tone === 'ok' ? 'bg-ok-soft text-ok' : i.tone === 'warn' ? 'bg-warn-soft text-warn' : i.tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-secondary text-muted-foreground geist:bg-selected')}>
                <Icon name={i.icon} className="size-[0.95em]" strokeWidth={2} />
              </span>
              <span className="min-w-0 flex-1 truncate">{i.title}</span>
              <span className="wall-small num shrink-0 text-muted-foreground">{evTime(e.t)}</span>
            </motion.li>
          );
        })}
      </AnimatePresence>
    </FitList>
  );
}

const BANDS = [['24', '2,4 GHz'], ['5', '5 GHz'], ['6', '6 GHz']] as const;
function WifiW({ w, s }: { w: Widget; s: LiveState }) {
  const radio = s.wireless?.wireless?.radio || {};
  const ssid = s.wireless?.wireless?.ssid?.['24']?.id;
  const bands = BANDS.filter(([k]) => radio[k]);
  const rate = (k: string) => (s.bands[k]?.down || 0) + (s.bands[k]?.up || 0);
  const max = Math.max(1, ...bands.map(([k]) => rate(k)));
  const count = (l: string) => s.hosts.filter((h) => h.active && !isEth(h) && bandLabel(h.link, h.wireless?.band) === l).length;
  return (
    <>
      {w.opts.ssid && ssid && <div className="wall-md truncate font-medium">{ssid}</div>}
      <div className={cn('grid min-h-0 flex-1 content-center gap-[0.9em]', w.opts.ssid && ssid && 'mt-[calc(var(--wall-pad)*0.6)]')}>
        {bands.map(([k, l]) => {
          const v = rate(k), on = radio[k]?.enable !== 0 && radio[k]?.state !== 0;
          return (
            <div key={k} className={cn('wall-text min-w-0', !on && 'opacity-45')}>
              <div className="flex items-baseline gap-[0.5em]">
                <span className="font-medium">{l}</span>
                <span className="wall-small text-muted-foreground">{on ? `${count(l)} appareil${count(l) > 1 ? 's' : ''}` : 'éteint'}</span>
                <span className="flex-1" />
                <span className="num wall-small text-muted-foreground">{kbps(v)}</span>
              </div>
              <div className="mt-[0.4em] h-[0.42em] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_9%,transparent)]">
                <i className="block h-full w-full origin-left rounded-full bg-[var(--wall-accent)] transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" style={{ transform: `scaleX(${Math.min(1, v / max)})` }} />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

function HealthW({ w, s }: { w: Widget; s: LiveState }) {
  const mem = s.mem?.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const items = [
    { l: 'Processeur', v: s.cpu.usage, max: 100, t: Math.round(s.cpu.usage) + NB + '%', c: 'var(--wall-accent)' },
    { l: 'Température', v: s.cpu.temp, max: 90, t: Math.round(s.cpu.temp) + '°', c: 'var(--chart-4)' },
    { l: 'Mémoire', v: mem, max: 100, t: Math.round(mem) + NB + '%', c: 'var(--wall-accent-2)' },
  ];
  const [box, b] = useBox<HTMLDivElement>(60);
  if (w.opts.style === 'bars') return (
    <div className="grid min-h-0 flex-1 content-center gap-[0.9em]">
      {items.map((x) => (
        <div key={x.l} className="wall-text">
          <div className="flex items-baseline justify-between gap-3"><span className="text-muted-foreground">{x.l}</span><b className="num wall-md font-medium">{x.t}</b></div>
          <div className="mt-[0.4em] h-[0.42em] overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_9%,transparent)]">
            <i className="block h-full w-full origin-left rounded-full transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)]" style={{ background: x.c, transform: `scaleX(${Math.min(1, x.v / x.max)})` }} />
          </div>
        </div>
      ))}
    </div>
  );
  const size = Math.max(64, Math.min(180, Math.floor(Math.min(b.w / 3 - 12, b.h - 34))));
  return (
    <div ref={box} className="flex min-h-0 flex-1 items-center justify-around gap-2 max-lg:min-h-[170px]">
      {items.map((x) => (
        <div key={x.l} className="grid justify-items-center gap-[0.4em]">
          <Gauge value={x.v} max={x.max} label={x.t} size={size} stroke={Math.max(6, Math.round(size / 13))} color={x.c} track="color-mix(in oklab, var(--foreground) 9%, transparent)" />
          <span className="wall-small text-muted-foreground">{x.l}</span>
        </div>
      ))}
    </div>
  );
}

function FavoritesW({ s }: { w: Widget; s: LiveState }) {
  const p = usePrefs();
  const macs = p.favorites.devices || [];
  const list = macs.map((m) => s.hosts.find((h) => String(h.macaddress).toLowerCase() === m)).filter(Boolean) as any[];
  if (!list.length) return <Empty icon="star">Épinglez des appareils depuis leur fiche pour suivre leur état ici.</Empty>;
  return (
    <FitList className="wall-text">
      {list.map((h) => {
        const pz = pauseOf(h.macaddress);
        return (
          <li key={h.macaddress} className="flex min-w-0 items-center gap-[0.6em] border-t border-[color-mix(in_oklab,var(--foreground)_8%,transparent)] py-[0.5em] first:border-t-0">
            <i className={cn('size-[0.5em] shrink-0 rounded-full', pz ? 'bg-warn' : h.active ? 'bg-ok' : 'bg-[color-mix(in_oklab,var(--foreground)_25%,transparent)]')} />
            <span className={cn('min-w-0 flex-1 truncate', !h.active && !pz && 'text-muted-foreground')}>{displayName(h)}</span>
            <span className="wall-small shrink-0 text-muted-foreground">{pz ? `pause · ${untilLabel(pz.until)}` : h.active ? bandLabel(h.link, h.wireless?.band) : 'hors ligne'}</span>
          </li>
        );
      })}
    </FitList>
  );
}

function GuestW({ w, s }: { w: Widget; s: LiveState }) {
  const g = s.wireless?.wireless?.ssid?.guest;
  const [box, b] = useBox<HTMLDivElement>(0);
  if (!g || g.enable !== 1) return <Empty icon="link">Le Wi-Fi invité est désactivé. Activez-le depuis la page Wi-Fi pour afficher son QR code ici.</Empty>;
  const pass = g.security?.passphrase || '';
  const qr = wifiQrString({ ssid: g.id, passphrase: pass, security: g.security?.protocol });
  const guests = (s.guestHosts || []).filter((h) => h.active).length;
  const qrSize = Math.max(96, Math.min(b.h, b.w * (w.size >= 6 ? 0.5 : 1)) - 4);
  const wide = w.size >= 6 || (b.w > 0 && b.w > b.h * 1.6);
  return (
    <div ref={box} className={cn('flex min-h-0 flex-1 gap-[calc(var(--wall-pad)*0.8)] max-lg:min-h-[260px]', wide ? 'flex-row items-center' : 'flex-col')}>
      {w.opts.qr && <QR text={qr} label={`QR code du Wi-Fi invité ${g.id}`} size={wide ? qrSize : Math.max(96, Math.min(b.w, b.h * 0.62))} className="shrink-0 rounded-2xl p-[4%] geist:rounded-lg" />}
      <div className="min-w-0">
        <div className="wall-small text-muted-foreground">Réseau</div>
        <div className="wall-md truncate font-medium">{g.id}</div>
        {w.opts.pass && pass && <><div className="wall-small mt-[0.6em] text-muted-foreground">Mot de passe</div><div className="wall-md break-all font-mono text-[0.92em]">{pass}</div></>}
        <Sub>{guests ? `${guests} invité${guests > 1 ? 's' : ''} connecté${guests > 1 ? 's' : ''}` : 'Scannez pour vous connecter'}</Sub>
      </div>
    </div>
  );
}

function FiberW({ s }: { w: Widget; s: LiveState }) {
  const f = s.sff?.wan;
  if (!f) return <Empty icon="fiber">Mesures optiques indisponibles.</Empty>;
  const rx = Number(f.receive_power) / 1000, tx = Number(f.transmit_power) / 1000;
  const q = rx > -20 ? ['Excellente', 'ok'] : rx > -25 ? ['Bonne', 'ok'] : ['Faible', 'bad'];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <Big className="wall-lg" value={num(rx, 1)} unit="dBm" />
      <Sub tone={q[1] as 'ok' | 'bad'}>Réception {q[0].toLowerCase()}</Sub>
      <Sub className="!mt-[0.2em]">Émission {num(tx, 1)} dBm · {f.pon_mode?.type || 'GPON'}</Sub>
    </div>
  );
}

const RENDER: Record<Widget['id'], (p: { w: Widget; s: LiveState }) => React.ReactNode> = {
  clock: ClockW, internet: InternetW, latency: LatencyW, services: ServicesW, traffic: TrafficW, today: TodayW, devices: DevicesW,
  activity: ActivityW, wifi: WifiW, health: HealthW, favorites: FavoritesW, guest: GuestW, fiber: FiberW,
};
export function WidgetView({ w, s, edit }: { w: Widget; s: LiveState; edit?: boolean }) {
  const Comp = RENDER[w.id] as React.ComponentType<{ w: Widget; s: LiveState }>;
  const aside = w.id === 'latency' && s.latency?.down ? <span className="wall-small font-medium text-danger">coupure</span>
    : w.id === 'services' ? <ServicesAside w={w} s={s} /> : null;
  // tuile Latence réglée sur un service : « Latence · [logo] YouTube »
  const info = w.id === 'latency' && w.opts.target && w.opts.target !== 'internet' ? targetInfo(s, w.opts.target) : null;
  const label = info && info.id !== 'internet' ? <>Latence <span aria-hidden className="text-faint">·</span><ServiceGlyph id={info.id} name={info.name} className="size-[1em]" />{info.name}</> : undefined;
  return <Tile w={w} edit={edit} aside={aside} label={label}><Comp w={w} s={s} /></Tile>;
}
