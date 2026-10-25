// Graphiques (SVG, sans bibliothèque de graphiques) : temps réel à 60 i/s, historiques, barres, anneau,
// présence, jauges et compteurs animés (Motion). Les couleurs sont des variables CSS : elles suivent l'apparence.
// Mêmes noms d'export et mêmes props que l'ancienne interface (public/lib/chart.js) ; `class` OU `className`.
//
// Règles de performance : animations en transform/opacity ; la boucle rAF du temps réel écrit directement
// dans le SVG (aucun setState par image), s'arrête hors écran / onglet masqué, tourne à ~4 i/s dans les
// aperçus et à 1 i/s si « mouvement réduit ». Les survols écrivent aussi dans le DOM (pas de re-rendu).
import * as React from 'react';
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { animate, stagger } from 'motion';
import { cn } from '@/lib/utils';
import './charts.css';

// ═════════════ Réglages communs ═════════════
const MIN = 60e3, HOUR = 3600e3, DAY = 86400e3;
const RM = window.matchMedia('(prefers-reduced-motion: reduce)');
/** L'utilisateur a demandé moins d'animations */
export const reducedMotion = (): boolean => RM.matches;
/** Courbe d'accélération commune (sortie douce) — utilisable telle quelle comme `ease` de Motion */
export const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
/** Aperçus de la page Apparence (iframes) : on économise le processeur */
const isPreview = () => !!document.documentElement.dataset.preview;
const canAnimate = () => !reducedMotion() && !isPreview() && !document.hidden;

/** Mise en forme d'une valeur (axes, infobulles) */
export type Fmt = (v: number) => string | number;
const defFmt: Fmt = (v) => String(Math.round(v));
const txt = (v: unknown): string => (v == null || v === false ? '' : String(v));
const f1 = (n: number) => n.toFixed(1);
const f2 = (n: number) => n.toFixed(2);
const clamp01 = (v: number) => (v > 0 ? (v < 1 ? v : 1) : 0);
const toNum = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
/** Ligne de 1 px nette : centrée sur un demi-pixel */
const crisp = (v: number) => Math.floor(v) + 0.5;
const EMPTY: never[] = [];

/** Identifiant utilisable dans url(#…) (useId peut contenir des caractères spéciaux) */
function useSvgId(prefix: string) {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, '');
}
/** Largeur d'un élément, suivie par ResizeObserver (mesurée avant le premier affichage) */
function useWidth(ref: React.RefObject<HTMLElement | null>, initial = 600) {
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setW(Math.max(80, Math.round(el.clientWidth || initial)));
    const ro = new ResizeObserver(([e]) => setW(Math.max(80, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return w;
}
/** Index du point le plus proche de t (tableau trié par t croissant) */
function nearestIdx(arr: ReadonlyArray<{ t: number }>, t: number): number {
  const n = arr.length;
  if (!n) return -1;
  let lo = 0, hi = n - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (arr[mid].t < t) lo = mid + 1; else hi = mid; }
  return lo > 0 && Math.abs(arr[lo - 1].t - t) <= Math.abs(arr[lo].t - t) ? lo - 1 : lo;
}
/** Texte brut d'un nœud React (les infobulles sont écrites directement dans le DOM, sans innerHTML) */
function nodeText(n: React.ReactNode): string {
  if (n == null || typeof n === 'boolean') return '';
  if (typeof n === 'string' || typeof n === 'number' || typeof n === 'bigint') return String(n);
  if (Array.isArray(n)) return n.map(nodeText).join('');
  if (React.isValidElement(n)) return nodeText((n.props as { children?: React.ReactNode }).children);
  return '';
}

// ── Dates (formats Intl créés une seule fois : appelés à chaque image pendant un survol) ──
const DTF = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('fr-FR', o);
const F = {
  hm: DTF({ hour: '2-digit', minute: '2-digit' }),
  hms: DTF({ hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  dm: DTF({ day: 'numeric', month: 'short' }),
  wd: DTF({ weekday: 'short', day: 'numeric' }),
  wdm: DTF({ weekday: 'short', day: 'numeric', month: 'short' }),
  whm: DTF({ weekday: 'short', hour: '2-digit', minute: '2-digit' }),
  w: DTF({ weekday: 'short' }),
};
const isMidnight = (t: number) => { const d = new Date(t); return d.getHours() === 0 && d.getMinutes() === 0; };
/** Libellé d'une graduation (14:00… ; 24 oct.… ; minuit = « sam. 25 » pour repérer le changement de jour) */
/** Libellé de graduation : « 0 » pour zéro, sans « ,0 » superflu (« 40 Go », « 75° », « 20 % ») */
const axisTxt = (v: number, format: Fmt) => {
  if (Math.abs(v) < 1e-9) return '0';
  return txt(format(v)).replace(/,0+(?!\d)/, '');
};
/** Largeur de la marge des graduations (≈ 6,7 px par caractère en 11 px chasse fixe) */
const gutterFor = (labels: string[]) => Math.max(26, Math.ceil(Math.max(...labels.map((l) => l.length)) * 6.7) + 14);
const tickLabel = (t: number, st: number) => (st >= DAY ? F.dm.format(t) : st >= HOUR && isMidnight(t) ? F.wd.format(t) : F.hm.format(t));
const fmtTipTime = (t: number, step: number) => (step >= DAY ? F.wdm.format(t) : F.whm.format(t));

// ═════════════ Échelles et tracés ═════════════
export type XY = readonly [number, number];
type PtN = [number, number | null];

/** Courbe monotone (Fritsch–Carlson) : lisse sans dépasser les valeurs réelles */
export function monotonePath(pts: ReadonlyArray<XY>, move = true): string {
  const n = pts.length;
  if (n === 0) return '';
  const head = `${move ? 'M' : 'L'}${f1(pts[0][0])},${f1(pts[0][1])}`;
  if (n === 1) return head;
  const dx: number[] = [], dy: number[] = [], m: number[] = [], t: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dx[i] ? dy[i] / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = head;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += `C${f1(pts[i][0] + h3)},${f1(pts[i][1] + t[i] * h3)} ${f1(pts[i + 1][0] - h3)},${f1(pts[i + 1][1] - t[i + 1] * h3)} ${f1(pts[i + 1][0])},${f1(pts[i + 1][1])}`;
  }
  return d;
}
/** Découpe en segments continus (valeurs null = trous, ex. perte de paquets) */
function segments(pts: ReadonlyArray<PtN>): [number, number][][] {
  const out: [number, number][][] = [];
  let cur: [number, number][] = [];
  for (const p of pts) {
    if (p[1] == null) { if (cur.length) out.push(cur); cur = []; }
    else cur.push([p[0], p[1]]);
  }
  if (cur.length) out.push(cur);
  return out;
}
/** Maximum « rond » au-dessus de v (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8, 10 × 10ⁿ) */
export const niceMax = (v: number): number => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  return (r <= 1 ? 1 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 4 ? 4 : r <= 5 ? 5 : r <= 6 ? 6 : r <= 8 ? 8 : 10) * p;
};
/** Pas « rond » (1, 1,5, 2, 2,5, 3, 5 × 10ⁿ) pour des graduations lisibles */
export const niceStep = (v: number): number => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  return (r <= 1 ? 1 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 5 ? 5 : 10) * p;
};

const TSTEPS = [MIN, 5 * MIN, 10 * MIN, 15 * MIN, 30 * MIN, HOUR, 2 * HOUR, 3 * HOUR, 4 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 2 * DAY, 7 * DAY];
/** Graduations alignées sur l'heure LOCALE (minutes rondes, heures multiples du pas, minuit), changements d'heure compris */
function alignedTicks(t0: number, t1: number, st: number): number[] {
  const out: number[] = [];
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || !(t1 >= t0) || !(st > 0)) return out;
  const d = new Date(t0);
  let guard = 0;
  if (st >= DAY) {
    const n = Math.max(1, Math.round(st / DAY));
    d.setHours(0, 0, 0, 0);
    if (d.getTime() < t0) d.setDate(d.getDate() + 1);
    for (; d.getTime() <= t1 && guard++ < 2000; d.setDate(d.getDate() + n)) out.push(d.getTime());
  } else if (st >= HOUR) {
    const n = Math.max(1, Math.round(st / HOUR));
    d.setMinutes(0, 0, 0);
    d.setHours(Math.floor(d.getHours() / n) * n);
    while (d.getTime() < t0 && guard++ < 2000) d.setHours(d.getHours() + n);
    while (d.getTime() <= t1 && guard++ < 2000) {
      const t = d.getTime();
      out.push(t);
      d.setHours(d.getHours() + n);
      if (d.getTime() <= t) d.setTime(t + st); // garde-fou autour des changements d'heure
    }
  } else {
    const n = Math.max(1, Math.round(st / MIN));
    d.setSeconds(0, 0);
    d.setMinutes(Math.floor(d.getMinutes() / n) * n);
    let t = d.getTime();
    while (t < t0) t += st;
    for (; t <= t1 && guard++ < 2000; t += st) out.push(t);
  }
  return out;
}
/** Graduations temporelles (14:00, 15:00… ou 24 oct., 25 oct.…) espacées d'au moins minPx pixels */
export function timeTicks(t0: number, t1: number, px: number, minPx = 84): { ticks: number[]; step: number } {
  const maxN = Math.max(2, Math.floor(px / minPx)), span = t1 - t0;
  const step = TSTEPS.find((s) => span / s <= maxN) ?? TSTEPS[TSTEPS.length - 1];
  return { ticks: alignedTicks(t0, t1, step), step };
}

// ═════════════ Infobulle (style popover shadcn, écrite directement dans le DOM) ═════════════
type TipRow = { color: string; label: string; value: string; faded?: boolean };
type TipState = { key: string; w: number; x: number; y: number; on: boolean };
const newTip = (): TipState => ({ key: '', w: 0, x: NaN, y: NaN, on: false });
const TIP_CLS = 'pointer-events-none absolute left-0 top-0 z-20 grid min-w-[148px] gap-1 rounded-lg border border-[var(--card-border)] bg-popover px-2.5 py-2 text-[12.5px] leading-[1.35] text-popover-foreground opacity-0 shadow-pop transition-opacity duration-150 will-change-transform geist:glass geist:rounded-md geist:border-0 geist:text-[12px]';
const TIP_HEAD = 'mb-0.5 whitespace-nowrap font-medium text-foreground num geist:font-mono geist:text-[11.5px] geist:font-normal geist:text-muted-foreground';
const TIP_ROW = 'flex items-center gap-2 whitespace-nowrap';
const TIP_DOT = 'size-2 shrink-0 rounded-full';
const TIP_LABEL = 'text-muted-foreground';
const TIP_VAL = 'ml-auto pl-4 font-medium text-foreground num';

/** Remplit l'infobulle (textContent uniquement) ; ne touche au DOM que si le contenu change */
function writeTip(el: HTMLDivElement, st: TipState, title: string, rows: TipRow[]) {
  let key = title;
  for (const r of rows) key += `\u0001${r.color}\u0002${r.label}\u0002${r.value}${r.faded ? '\u0003' : ''}`;
  if (key === st.key) return;
  st.key = key;
  const head = document.createElement('div');
  head.className = TIP_HEAD;
  head.textContent = title;
  const nodes: HTMLElement[] = [head];
  for (const r of rows) {
    const row = document.createElement('div');
    row.className = TIP_ROW;
    const dot = document.createElement('i');
    dot.className = TIP_DOT;
    dot.style.background = r.color;
    if (r.faded) dot.style.opacity = '0.45';
    const label = document.createElement('span');
    label.className = TIP_LABEL;
    label.textContent = r.label;
    const val = document.createElement('b');
    val.className = TIP_VAL;
    val.textContent = r.value;
    row.append(dot, label, val);
    nodes.push(row);
  }
  el.replaceChildren(...nodes);
  st.w = el.offsetWidth; // mesure uniquement quand le contenu change
}
/** Place l'infobulle à côté du repère (à droite, ou à gauche s'il n'y a pas la place), dans le graphique */
function placeTip(el: HTMLDivElement, st: TipState, ax: number, W: number, top: number, half = 0) {
  const gap = 12;
  let left = ax + half + gap;
  if (left + st.w > W) left = ax - half - gap - st.w;
  left = Math.round(Math.max(0, Math.min(W - st.w, left)));
  const tp = Math.round(top);
  if (left !== st.x || tp !== st.y) { el.style.transform = `translate3d(${left}px,${tp}px,0)`; st.x = left; st.y = tp; }
  if (!st.on) { el.style.opacity = '1'; st.on = true; }
}
function hideTip(el: HTMLDivElement | null, st: TipState) {
  if (el && st.on) { el.style.opacity = '0'; st.on = false; }
}

// ═════════════ Temps réel ═════════════
export type LivePoint = { t: number; v: number | null };
export type LiveSeries = { data: ReadonlyArray<LivePoint>; color: string; label?: string; fill?: boolean; format?: Fmt };
export type LiveChartProps = {
  /** séries ; `data` est le tableau du flux temps réel, modifié sur place (relu à chaque image) */
  series: ReadonlyArray<LiveSeries>;
  windowMs?: number; height?: number; format?: Fmt; minMax?: number; grid?: number; lag?: number;
  showAxis?: boolean; strokeWidth?: number;
  /** valeur d'alerte (ligne pointillée) */
  threshold?: number;
  /** marque les trous (null) de la 1ʳᵉ série en bas du graphique (pertes de paquets) */
  loss?: boolean;
  /** prolonge la dernière valeur jusqu'au bord droit */
  hold?: boolean;
  class?: string; className?: string;
};
type LiveCfg = { series: ReadonlyArray<LiveSeries>; windowMs: number; height: number; format: Fmt; minMax: number; grid: number; lag: number; showAxis: boolean; threshold?: number; loss: boolean; hold: boolean };
type LiveEls = { lines: (SVGPathElement | null)[]; areas: (SVGPathElement | null)[]; live: (SVGGElement | null)[]; hdots: (SVGCircleElement | null)[]; grid: (SVGLineElement | null)[]; labels: (SVGTextElement | null)[] };

/**
 * LiveChart : séries défilantes en continu (rAF, écrit directement dans le SVG, sans re-rendu).
 * series: [{ data: [{t, v|null}], color, label, fill, format }]
 */
export function LiveChart({ series, windowMs = 120000, height = 180, format = defFmt, minMax = 1, grid = 3, lag = 1200, class: cls, className, showAxis = true, strokeWidth = 2, threshold, loss = false, hold = true }: LiveChartProps) {
  const id = useSvgId('lc');
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), tip = useRef<HTMLDivElement>(null);
  const clip = useRef<SVGRectElement>(null), thr = useRef<SVGLineElement>(null), lossEl = useRef<SVGPathElement>(null), cross = useRef<SVGLineElement>(null);
  const E = useRef<LiveEls>({ lines: [], areas: [], live: [], hdots: [], grid: [], labels: [] });
  const cfg: LiveCfg = { series, windowMs, height, format, minMax, grid: Math.max(1, grid), lag, showAxis, threshold, loss, hold };
  const P = useRef(cfg);
  const S = useRef({ w: 300, max: minMax, win: 0, hover: null as number | null, dirty: true, vw: 0, vh: 0, gridKey: '', labels: [] as string[], liveOn: [] as boolean[], hoverOn: false, tip: newTip(), gut: 0 });

  // Nouvelles props : lues dès l'image suivante ; caches d'écriture invalidés (des nœuds ont pu changer)
  useLayoutEffect(() => {
    P.current = cfg;
    const s = S.current;
    s.dirty = true; s.vw = 0; s.gridKey = ''; s.labels = []; s.liveOn = [];
  });

  useLayoutEffect(() => {
    const root = wrap.current;
    if (!root) return;
    const s = S.current;
    s.w = Math.max(50, root.clientWidth || 300);
    const preview = isPreview();
    let raf = 0, visible = true, last = 0, lastDraw = 0, fresh = true;

    const draw = (dt: number, snap: boolean) => {
      const p = P.current, el = svg.current, els = E.current;
      if (!el) return;
      const list = p.series, G = p.grid;
      const W = s.w, H = p.height, padT = p.showAxis ? 16 : 6, padB = p.loss ? 8 : p.showAxis ? 4 : 2, ih = H - padT - padB;
      const now = Date.now() - p.lag;
      // lissage indépendant de la fréquence d'affichage (même rendu à 60, 120 ou 4 i/s)
      const k = (base: number) => (snap ? 1 : 1 - Math.pow(1 - base, dt / 16.667));
      // fenêtre : s'élargit avec l'historique disponible, jusqu'à windowMs
      let first = now;
      for (const se of list) if (se.data.length && se.data[0].t < first) first = se.data[0].t;
      const win = Math.min(p.windowMs, Math.max(15000, now - first));
      s.win = s.win > 0 ? s.win + (win - s.win) * k(0.1) : win;
      // échelle : maximum rond, transition douce, graduations rondes une fois stabilisé
      let target = p.minMax;
      for (const se of list) for (const q of se.data) if (q.v != null && now - q.t < p.windowMs + 4000 && q.v > target) target = q.v;
      if (p.threshold && target < p.threshold * 0.6) target = Math.max(target, p.threshold * 0.3);
      target = niceStep((target * 1.08) / G) * G;
      s.max = s.max > 0 ? s.max + (target - s.max) * k(0.12) : target;
      if (Math.abs(target - s.max) < target * 0.004) s.max = target;
      // marge gauche réservée aux graduations (mesurée sur les libellés) : la courbe ne passe jamais dessous
      const L = p.showAxis ? s.gut : 0, PW = Math.max(10, W - L);
      const x = (t: number) => L + PW * (1 - (now - t) / s.win);
      const y = (v: number) => padT + ih * (1 - Math.min(1, v / s.max));

      if (s.vw !== W || s.vh !== H) {
        el.setAttribute('viewBox', `0 0 ${W} ${H}`);
        s.vw = W; s.vh = H; s.gridKey = '';
      }
      // graduations : valeurs rondes de l'échelle visée (pas de « 43 ms » pendant une transition)
      if (p.showAxis) {
        let changed = false;
        for (let i = 0; i < G; i++) {
          const t = els.labels[i];
          if (!t) continue;
          const v = axisTxt(target * (1 - i / G), p.format);
          if (s.labels[i] !== v) { s.labels[i] = v; t.textContent = v; changed = true; }
        }
        if (changed) {
          let lw = 0;
          for (let i = 0; i < G; i++) { const t = els.labels[i]; if (t) try { lw = Math.max(lw, t.getComputedTextLength()); } catch { /* pas encore mis en page */ } }
          const gut = lw ? Math.ceil(lw) + 12 : 0;
          if (Math.abs(gut - s.gut) > 1) { s.gut = gut; s.gridKey = ''; }
        }
      }
      const gk = `${W}|${H}|${padT}|${padB}|${G}|${s.gut}`;
      if (s.gridKey !== gk) {
        s.gridKey = gk;
        const L2 = p.showAxis ? s.gut : 0;
        clip.current?.setAttribute('x', String(L2));
        clip.current?.setAttribute('width', String(Math.max(10, W - L2)));
        for (let i = 0; i < G; i++) {
          const yy = padT + ih * (i / G);
          const g = els.grid[i];
          if (g) { const c = String(crisp(yy)); g.setAttribute('y1', c); g.setAttribute('y2', c); g.setAttribute('x1', String(L2)); g.setAttribute('x2', String(W)); }
          const lb = els.labels[i];
          if (lb) { lb.setAttribute('y', f1(yy + 3.5)); lb.setAttribute('x', String(Math.max(0, L2 - 8))); }
        }
      }

      // courbes, aires, point « en direct »
      let lossD = '';
      const cut = now - p.windowMs - 6000;
      for (let i = 0; i < list.length; i++) {
        const se = list[i];
        const pts: PtN[] = [];
        for (const q of se.data) if (q.t > cut) pts.push([x(q.t), q.v == null ? null : y(q.v)]);
        if (p.loss && i === 0) for (const q of pts) if (q[1] == null && q[0] > L - 4) lossD += `M${f1(q[0] - 1.5)},${H - 4}h3v4h-3z`;
        // valeur maintenue jusqu'au bord droit (les mesures arrivent par paquets)
        const end = pts[pts.length - 1];
        if (p.hold && end && end[1] != null && end[0] < W) pts.push([W + 1, end[1]]);
        const segs = segments(pts);
        let d = '', a = '';
        for (const sg of segs) {
          if (sg.length === 1) sg.unshift([sg[0][0] - 2, sg[0][1]]);
          const path = monotonePath(sg);
          d += path;
          a += `${path}L${f1(sg[sg.length - 1][0])},${H}L${f1(sg[0][0])},${H}Z`;
        }
        els.lines[i]?.setAttribute('d', d);
        els.areas[i]?.setAttribute('d', a);
        const live = els.live[i];
        if (live) {
          const lastSeg = segs[segs.length - 1];
          const tail = lastSeg ? lastSeg[lastSeg.length - 1] : undefined;
          if (lastSeg && tail && tail[0] >= W - 2) {
            let cx = tail[0], cy = tail[1];
            for (let j = lastSeg.length - 1; j > 0; j--) {
              const A = lastSeg[j - 1], B = lastSeg[j];
              if (A[0] <= W && B[0] >= W) { const f = (W - A[0]) / (B[0] - A[0] || 1); cx = W; cy = A[1] + (B[1] - A[1]) * f; break; }
            }
            live.setAttribute('transform', `translate(${f1(Math.min(W - 2, cx))},${f1(cy)})`);
            if (s.liveOn[i] !== true) { s.liveOn[i] = true; live.style.opacity = '1'; live.setAttribute('data-on', ''); }
          } else if (s.liveOn[i] !== false) { s.liveOn[i] = false; live.style.opacity = '0'; live.removeAttribute('data-on'); }
        }
      }
      lossEl.current?.setAttribute('d', lossD);
      const th = thr.current;
      if (th && p.threshold) {
        const ty = String(crisp(y(p.threshold)));
        th.setAttribute('y1', ty); th.setAttribute('y2', ty); th.setAttribute('x1', String(L)); th.setAttribute('x2', String(W));
        th.style.opacity = p.threshold < s.max ? '' : '0';
      }

      // survol : le réticule se cale sur la mesure visible la plus proche du pointeur
      const tipEl = tip.current, cr = cross.current;
      let shown = false;
      if (s.hover != null && tipEl && cr) {
        const tq = now - (1 - Math.max(0, s.hover - L) / PW) * s.win;
        let ref: LivePoint | null = null;
        for (const se of list) {
          let j = nearestIdx(se.data, tq);
          if (j < 0) continue;
          while (j > 0 && x(se.data[j].t) > W + 0.5) j--;
          while (j < se.data.length - 1 && x(se.data[j].t) < L - 0.5) j++;
          const qx = x(se.data[j].t);
          if (qx >= L - 0.5 && qx <= W + 0.5) { ref = se.data[j]; break; }
        }
        if (ref) {
          shown = true;
          const cx = Math.max(L, Math.min(W, x(ref.t)));
          const c = String(crisp(cx));
          cr.setAttribute('x1', c); cr.setAttribute('x2', c);
          const rows: TipRow[] = [];
          for (let i = 0; i < list.length; i++) {
            const se = list[i], dot = els.hdots[i];
            const j = nearestIdx(se.data, ref.t);
            const q = j < 0 ? null : se.data[j];
            if (q) rows.push({ color: se.color, label: se.label ?? '', value: q.v == null ? 'perdu' : txt((se.format || p.format)(q.v)) });
            if (dot) {
              const qx = q ? x(q.t) : NaN;
              if (q && q.v != null && Math.abs(qx - cx) < 8) { dot.setAttribute('cx', f1(qx)); dot.setAttribute('cy', f1(y(q.v))); dot.style.opacity = '1'; }
              else dot.style.opacity = '0';
            }
          }
          if (!s.hoverOn) { s.hoverOn = true; cr.style.opacity = '1'; }
          writeTip(tipEl, s.tip, F.hms.format(ref.t), rows);
          placeTip(tipEl, s.tip, cx, W, 4);
        }
      }
      if (!shown && s.hoverOn) {
        s.hoverOn = false;
        if (cr) cr.style.opacity = '0';
        hideTip(tipEl, s.tip);
        for (const dot of els.hdots) if (dot) dot.style.opacity = '0';
      }
    };

    const frame = (ts: number) => {
      raf = requestAnimationFrame(frame);
      const reduce = reducedMotion();
      // aperçus : ~4 i/s ; mouvement réduit : 1 i/s (sauf interaction, redessinée tout de suite)
      const minGap = preview ? 250 : reduce ? 1000 : 0;
      if (minGap && !s.dirty && ts - last < minGap) return;
      last = ts;
      s.dirty = false;
      const dt = lastDraw ? Math.min(250, ts - lastDraw) : 16.667;
      lastDraw = ts;
      draw(dt, fresh || reduce);
      fresh = false;
    };
    // la boucle ne tourne que si le graphique est visible à l'écran ET l'onglet affiché
    const sync = () => {
      const run = visible && !document.hidden;
      if (run && !raf) { fresh = true; lastDraw = 0; raf = requestAnimationFrame(frame); root.removeAttribute('data-paused'); }
      else if (!run && raf) { cancelAnimationFrame(raf); raf = 0; root.setAttribute('data-paused', ''); }
    };
    const ro = new ResizeObserver(([e]) => { s.w = Math.max(50, e.contentRect.width); s.dirty = true; });
    ro.observe(root);
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; sync(); });
    io.observe(root);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(raf); raf = 0;
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect(), s = S.current;
    s.hover = Math.max(0, Math.min(r.width, e.clientX - r.left));
    s.dirty = true;
  };
  const leave = () => { const s = S.current; s.hover = null; s.dirty = true; };

  return (
    <div ref={wrap} className={cn('lc-root', cls, className)} style={{ height }} onPointerMove={move} onPointerDown={move} onPointerLeave={leave} onPointerCancel={leave}>
      <svg ref={svg} width="100%" height={height} preserveAspectRatio="none" role="img" aria-label="Graphique temps réel">
        <defs>
          <clipPath id={`${id}c`}><rect ref={clip} x={0} y={-20} width={300} height={height + 40} /></clipPath>
          {series.map((se, i) => (
            <linearGradient key={i} id={`${id}g${i}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={se.color} stopOpacity={0.24} />
              <stop offset="100%" stopColor={se.color} stopOpacity={0} />
            </linearGradient>
          ))}
        </defs>
        {Array.from({ length: cfg.grid }, (_, i) => <line key={i} ref={(n) => { E.current.grid[i] = n; }} x1={0} className="chart-grid" />)}
        {showAxis && Array.from({ length: cfg.grid }, (_, i) => <text key={i} ref={(n) => { E.current.labels[i] = n; }} x={2} textAnchor="end" className="chart-axis" />)}
        {threshold ? <line ref={thr} x1={0} className="chart-thr" /> : null}
        <g clipPath={`url(#${id}c)`}>
          {series.map((se, i) => (se.fill !== false ? <path key={i} ref={(n) => { E.current.areas[i] = n; }} fill={`url(#${id}g${i})`} /> : null))}
          {series.map((se, i) => (
            <path key={i} ref={(n) => { E.current.lines[i] = n; }} fill="none" stroke={se.color} strokeWidth={strokeWidth} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          ))}
          {loss ? <path ref={lossEl} className="lc-loss" /> : null}
        </g>
        <line ref={cross} y1={0} y2={height} className="chart-cross" />
        {series.map((se, i) => (
          <g key={i} ref={(n) => { E.current.live[i] = n; }} className="lc-live" style={{ color: se.color, opacity: 0 }}>
            <circle r={3.5} fill="currentColor" className="lc-halo" />
            <circle r={3.5} fill="currentColor" className="lc-dot" />
          </g>
        ))}
        {series.map((se, i) => <circle key={i} ref={(n) => { E.current.hdots[i] = n; }} r={3.5} fill={se.color} className="lc-hdot" style={{ opacity: 0 }} />)}
      </svg>
      <div ref={tip} className={TIP_CLS} aria-hidden="true" />
    </div>
  );
}

// ═════════════ Historique avec axes ═════════════
export type TimePoint = { t: number; [key: string]: any };
export type TimeSeries = { key: string; color: string; label?: string; area?: boolean; width?: number; dash?: string; format?: Fmt };
export type TimeBand = { lo: string; hi: string; color: string; label?: string; format?: Fmt };
export type TimeChartProps = {
  points?: ReadonlyArray<TimePoint>; series: ReadonlyArray<TimeSeries>; height?: number; format?: Fmt;
  from?: number; to?: number; step?: number;
  /** zone entre deux clés (ex. moyenne → 95ᵉ centile) */
  band?: TimeBand;
  threshold?: number; yMax?: number; empty?: React.ReactNode;
  class?: string; className?: string;
};

/**
 * TimeChart : historique (points [{t, …}]) avec axes, survol et trous.
 * series: [{ key, color, label, area, width, dash, format }] ; band: { lo, hi, color, label }
 */
export function TimeChart({ points = EMPTY, series, height = 220, format = defFmt, from, to, step = 60000, band, threshold, yMax, empty = 'Pas encore assez de mesures', class: cls, className }: TimeChartProps) {
  const wrap = useRef<HTMLDivElement>(null), tip = useRef<HTMLDivElement>(null), cross = useRef<SVGLineElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const hv = useRef({ px: null as number | null, idx: -1, tip: newTip() });
  const W = useWidth(wrap);
  const id = useSvgId('tc');
  const padR = 8, padT = 10, padB = 24, H = height, gridN = 4;
  const t0 = from ?? points[0]?.t ?? 0;
  const t1 = to ?? (points.length ? points[points.length - 1].t + step : 1);
  const keys = band ? [...series.map((s) => s.key), band.hi] : series.map((s) => s.key);
  let max = 0;
  for (const p of points) for (const k of keys) { const v = p[k]; if (v != null && v > max) max = v; }
  if (threshold && max < threshold) max = Math.max(max, threshold * 0.5);
  const top = yMax || niceStep((max * 1.1) / gridN) * gridN;
  // marge gauche à la taille du plus long libellé (police chasse fixe)
  const padL = gutterFor(Array.from({ length: gridN + 1 }, (_, k) => axisTxt(top * (1 - k / gridN), format)));
  const iw = Math.max(1, W - padL - padR), ih = H - padT - padB;
  const x = (t: number) => padL + iw * ((t - t0) / (t1 - t0 || 1));
  const y = (v: number) => padT + ih * (1 - Math.min(1, v / top));
  const tt = useMemo(() => timeTicks(t0, t1, iw), [t0, t1, iw]);
  const ticksX = tt.ticks.filter((t) => x(t) > padL + 18 && x(t) < W - padR - 18);
  // zone hachurée avant la première mesure (collecte commencée récemment)
  const firstT: number | undefined = points.find((p) => keys.some((k) => p[k] != null))?.t;
  const noData = firstT != null && firstT - t0 > (t1 - t0) * 0.06 ? Math.min(iw, x(firstT) - padL) : 0;
  // un trou quand l'écart entre deux points dépasse 2,5 pas (serveur arrêté, Mac en veille…)
  const segsOf = (key: string) => {
    const segs: [number, number][][] = [];
    let cur: [number, number][] = [], last: number | null = null;
    for (const p of points) {
      const v = p[key];
      if (v == null || (last != null && p.t - last > step * 2.5)) { if (cur.length) segs.push(cur); cur = []; }
      if (v != null) cur.push([x(p.t + step / 2), y(v)]);
      last = p.t;
    }
    if (cur.length) segs.push(cur);
    return segs;
  };
  let bandD = '';
  if (band) {
    const segs: TimePoint[][] = [];
    let cur: TimePoint[] = [], last: number | null = null;
    for (const p of points) {
      const ok = p[band.hi] != null && p[band.lo] != null;
      if (!ok || (last != null && p.t - last > step * 2.5)) { if (cur.length) segs.push(cur); cur = []; }
      if (ok) cur.push(p);
      last = p.t;
    }
    if (cur.length) segs.push(cur);
    // bords en courbe monotone : le bord bas épouse exactement la courbe de la série correspondante
    bandD = segs.map((sg) => {
      const hi = sg.map((p): XY => [x(p.t + step / 2), y(p[band.hi])]);
      const lo = sg.map((p): XY => [x(p.t + step / 2), y(p[band.lo])]).reverse();
      return `${monotonePath(hi)}${monotonePath(lo, false)}Z`;
    }).join('');
  }

  const hide = () => {
    const h = hv.current;
    h.idx = -1;
    if (cross.current) cross.current.style.opacity = '0';
    for (const d of dots.current) if (d) d.style.opacity = '0';
    hideTip(tip.current, h.tip);
  };
  const update = (px: number | null) => {
    const h = hv.current;
    h.px = px;
    const tipEl = tip.current, cr = cross.current;
    if (px == null || !points.length || !tipEl || !cr) return hide();
    const i = nearestIdx(points, t0 + ((px - padL) / iw) * (t1 - t0) - step / 2);
    if (i < 0) return hide();
    if (i === h.idx) return;
    h.idx = i;
    const best = points[i];
    const cx = x(best.t + step / 2);
    const c = String(crisp(cx));
    cr.setAttribute('x1', c); cr.setAttribute('x2', c); cr.style.opacity = '1';
    series.forEach((s, k) => {
      const d = dots.current[k], v = best[s.key];
      if (!d) return;
      if (v == null) { d.style.opacity = '0'; return; }
      d.setAttribute('cx', f1(cx)); d.setAttribute('cy', f1(y(v))); d.style.opacity = '1';
    });
    const rows: TipRow[] = series.map((s) => ({ color: s.color, label: s.label ?? '', value: best[s.key] == null ? '—' : txt((s.format || format)(best[s.key])) }));
    if (band && best[band.hi] != null) rows.push({ color: band.color, label: band.label ?? '', value: txt((band.format || format)(best[band.hi])), faded: true });
    writeTip(tipEl, h.tip, fmtTipTime(best.t, step), rows);
    placeTip(tipEl, h.tip, cx, W, padT);
  };
  // après un nouveau rendu (données, largeur…) : l'infobulle se recale sous le pointeur
  useLayoutEffect(() => {
    const h = hv.current;
    h.idx = -1; h.tip.key = '';
    if (h.px != null) update(h.px);
  });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { const r = e.currentTarget.getBoundingClientRect(); update(e.clientX - r.left); };
  const onLeave = () => update(null);

  return (
    <div ref={wrap} className={cn('lc-root', cls, className)} style={{ height }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
      {!points.length ? (
        <div className="grid h-full place-items-center px-4 text-center text-[12.5px] text-muted-foreground">{empty}</div>
      ) : (
        <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Historique">
          <defs>
            {series.map((s, i) => (s.area ? (
              <linearGradient key={i} id={`${id}g${i}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={s.color} stopOpacity={0.22} />
                <stop offset="1" stopColor={s.color} stopOpacity={0} />
              </linearGradient>
            ) : null))}
            {noData > 0 ? (
              <pattern id={`${id}h`} width={6} height={6} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1={0} y1={0} x2={0} y2={6} className="lc-hatch" />
              </pattern>
            ) : null}
          </defs>
          {Array.from({ length: gridN + 1 }, (_, k) => {
            const yy = padT + (ih * k) / gridN;
            return (
              <g key={k}>
                <line x1={padL} x2={W - padR} y1={crisp(yy)} y2={crisp(yy)} className={cn('chart-grid', k === gridN && 'lc-base')} />
                <text x={padL - 8} y={yy + 3.5} textAnchor="end" className="chart-axis">{axisTxt(top * (1 - k / gridN), format)}</text>
              </g>
            );
          })}
          {ticksX.map((t) => (
            <text key={t} x={x(t)} y={H - 6} textAnchor="middle" className={cn('chart-axis', tt.step < DAY && tt.step >= HOUR && isMidnight(t) && 'is-strong')}>{tickLabel(t, tt.step)}</text>
          ))}
          {noData > 0 ? (
            <g className="lc-fade-in">
              <rect x={padL} y={padT} width={noData} height={ih} fill={`url(#${id}h)`} rx={6} />
              {noData > 150 && firstT != null ? (
                <text x={padL + noData / 2} y={padT + ih / 2 + 4} textAnchor="middle" className="lc-nodata">{`Collecte depuis ${tickLabel(firstT, t1 - t0 > 2 * DAY ? DAY : MIN)}`}</text>
              ) : null}
            </g>
          ) : null}
          {threshold && threshold < top ? <line x1={padL} x2={W - padR} y1={crisp(y(threshold))} y2={crisp(y(threshold))} className="chart-thr" /> : null}
          <g className="lc-rise" style={{ transformBox: 'view-box', transformOrigin: `0px ${H - padB}px` }}>
            {band && bandD ? <path d={bandD} fill={band.color} opacity={0.14} /> : null}
            {series.map((s, i) => segsOf(s.key).map((sg, j) => {
              const d = monotonePath(sg.length === 1 ? [[sg[0][0] - 2, sg[0][1]], sg[0]] : sg);
              return (
                <React.Fragment key={`${i}-${j}`}>
                  {s.area ? <path d={`${d}L${f1(sg[sg.length - 1][0])},${H - padB}L${f1(sg[0][0])},${H - padB}Z`} fill={`url(#${id}g${i})`} /> : null}
                  <path d={d} fill="none" stroke={s.color} strokeWidth={s.width || 1.8} strokeDasharray={s.dash} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </React.Fragment>
              );
            }))}
          </g>
          <line ref={cross} y1={padT} y2={H - padB} className="chart-cross" />
          {series.map((s, i) => <circle key={i} ref={(n) => { dots.current[i] = n; }} r={3.5} fill={s.color} className="lc-hdot" style={{ opacity: 0 }} />)}
        </svg>
      )}
      <div ref={tip} className={TIP_CLS} aria-hidden="true" />
    </div>
  );
}

// ═════════════ Barres empilées ═════════════
export type BarKey = { key: string; color: string; label?: string };
export type BarChartProps = {
  data: ReadonlyArray<any>; keys: ReadonlyArray<BarKey>; height?: number; format?: Fmt;
  /** libellé sous chaque barre (et titre de l'infobulle sans tipLabel) */
  label?: (d: any) => React.ReactNode;
  tipLabel?: (d: any) => React.ReactNode;
  /** false = barre estompée (ex. journée incomplète) */
  highlight?: (d: any) => boolean;
  yFormat?: Fmt;
  class?: string; className?: string;
};
/** Barre à coins supérieurs arrondis (rayon limité à la hauteur : les petits sommets restent arrondis) */
const roundTop = (x0: number, y0: number, w: number, hh: number, radius: number) => {
  const r = Math.min(radius, hh, w / 2);
  return r < 0.5
    ? `M${f2(x0)},${f2(y0 + hh)}V${f2(y0)}H${f2(x0 + w)}V${f2(y0 + hh)}Z`
    : `M${f2(x0)},${f2(y0 + hh)}V${f2(y0 + r)}Q${f2(x0)},${f2(y0)} ${f2(x0 + r)},${f2(y0)}H${f2(x0 + w - r)}Q${f2(x0 + w)},${f2(y0)} ${f2(x0 + w)},${f2(y0 + r)}V${f2(y0 + hh)}Z`;
};

/** Barres empilées (consommation par jour…) avec survol */
export function BarChart({ data, keys, height = 200, format = (v) => v, label = (d) => d?.label, tipLabel, highlight, yFormat, class: cls, className }: BarChartProps) {
  const wrap = useRef<HTMLDivElement>(null), svg = useRef<SVGSVGElement>(null), tip = useRef<HTMLDivElement>(null), slotEl = useRef<SVGRectElement>(null);
  const bars = useRef<(SVGGElement | null)[]>([]);
  const hv = useRef({ px: null as number | null, idx: -1, tip: newTip() });
  const W = useWidth(wrap);
  const padR = 4, padT = 8, padB = 22, H = height, ih = H - padT - padB;
  const totals = data.map((d) => keys.reduce((s, k) => s + (Number(d?.[k.key]) || 0), 0));
  const top = niceStep((Math.max(1, ...totals) * 1.08) / 4) * 4;
  const padL = gutterFor(Array.from({ length: 5 }, (_, k) => axisTxt(top * (1 - k / 4), yFormat || format)));
  const n = data.length || 1, slot = (W - padL - padR) / n, bw = Math.max(2, Math.min(28, slot * 0.62)), r = Math.min(4, bw / 2);
  const y = (v: number) => padT + ih * (1 - v / top);
  const every = Math.ceil(n / Math.max(2, Math.floor((W - padL) / 46)));
  const hw = Math.min(slot, bw + 12); // colonne teintée au survol

  const hide = () => {
    const h = hv.current;
    if (h.idx >= 0) bars.current[h.idx]?.removeAttribute('data-hl');
    h.idx = -1;
    svg.current?.removeAttribute('data-hover');
    hideTip(tip.current, h.tip);
  };
  const over = (i: number) => {
    const h = hv.current;
    if (h.idx >= 0) bars.current[h.idx]?.removeAttribute('data-hl');
    h.idx = i;
    bars.current[i]?.setAttribute('data-hl', '');
    svg.current?.setAttribute('data-hover', '');
    const cx = padL + slot * (i + 0.5);
    slotEl.current?.setAttribute('x', f1(cx - hw / 2));
    const d = data[i];
    const rows: TipRow[] = keys.map((k) => ({ color: k.color, label: k.label ?? k.key, value: txt(format(Number(d?.[k.key]) || 0)) }));
    if (keys.length > 1) rows.push({ color: 'transparent', label: 'Total', value: txt(format(totals[i])) });
    const tipEl = tip.current;
    if (tipEl) { writeTip(tipEl, h.tip, nodeText((tipLabel || label)(d)), rows); placeTip(tipEl, h.tip, cx, W, padT, bw / 2); }
  };
  // comme avant : dans la marge de l'axe, la dernière barre survolée reste sélectionnée
  const update = (px: number | null) => {
    const h = hv.current;
    h.px = px;
    if (px == null) return hide();
    const i = Math.floor((px - padL) / slot);
    if (i >= 0 && i < data.length && i !== h.idx) over(i);
  };
  // après un nouveau rendu (données, largeur…) : sélection et infobulle recalées
  useLayoutEffect(() => {
    const h = hv.current, prev = h.idx;
    if (prev >= 0) bars.current[prev]?.removeAttribute('data-hl');
    h.idx = -1; h.tip.key = '';
    if (h.px == null) return;
    const i = Math.floor((h.px - padL) / slot);
    if (i >= 0 && i < data.length) over(i);
    else if (prev >= 0 && prev < data.length) over(prev);
    else hide();
  });
  const onMove = (e: React.PointerEvent<HTMLDivElement>) => { const rr = e.currentTarget.getBoundingClientRect(); update(e.clientX - rr.left); };
  const onLeave = () => update(null);

  return (
    <div ref={wrap} className={cn('lc-root', cls, className)} style={{ height }} onPointerMove={onMove} onPointerDown={onMove} onPointerLeave={onLeave} onPointerCancel={onLeave}>
      <svg ref={svg} width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Histogramme">
        {[0, 1, 2, 3, 4].map((k) => {
          const yy = padT + (ih * k) / 4;
          return (
            <g key={k}>
              <line x1={padL} x2={W - padR} y1={crisp(yy)} y2={crisp(yy)} className={cn('chart-grid', k === 4 && 'lc-base')} />
              <text x={padL - 8} y={yy + 3.5} textAnchor="end" className="chart-axis">{axisTxt(top * (1 - k / 4), yFormat || format)}</text>
            </g>
          );
        })}
        <rect ref={slotEl} className="lc-slot" x={0} y={padT - 4} width={hw} height={ih + 4} rx={Math.min(6, hw / 4)} />
        {data.map((d, i) => {
          let acc = 0;
          const x0 = padL + slot * i + (slot - bw) / 2;
          const dim = !!highlight && !highlight(d);
          const parts = keys.map((k, j) => {
            const v = Number(d?.[k.key]) || 0;
            const below = acc > 0;
            const y1 = y(acc + v);
            let y0 = y(acc);
            acc += v;
            if (below && y0 - y1 > 2.5) y0 -= 1; // fin liseré entre deux couches empilées
            const hh = Math.max(0, y0 - y1);
            if (!hh) return null;
            const isTop = keys.slice(j + 1).every((kk) => !(Number(d?.[kk.key]) > 0));
            return <path key={k.key} d={isTop ? roundTop(x0, y1, bw, hh, r) : `M${f2(x0)},${f2(y0)}V${f2(y1)}H${f2(x0 + bw)}V${f2(y0)}Z`} fill={k.color} opacity={dim ? 0.55 : undefined} />;
          });
          return <g key={i} ref={(nd) => { bars.current[i] = nd; }} className="lc-bar lc-grow-y" style={{ animationDelay: `${Math.min(i * 16, 400)}ms` }}>{parts}</g>;
        })}
        {data.map((d, i) => (i === n - 1 || (i % every === 0 && n - 1 - i >= every * 0.75) ? (
          <text key={i} x={padL + slot * (i + 0.5)} y={H - 6} textAnchor="middle" className="chart-axis">{label(d)}</text>
        ) : null))}
      </svg>
      <div ref={tip} className={TIP_CLS} aria-hidden="true" />
    </div>
  );
}

// ═════════════ Petits graphiques ═════════════
export type SparkDatum = number | null | undefined | { v?: number | null };
export type SparklineProps = { data: ReadonlyArray<SparkDatum>; color?: string; height?: number; width?: number; fill?: boolean; min?: number | 'auto'; max?: number; strokeWidth?: number; className?: string };

/** Sparkline (re-rendue à chaque nouvelle donnée) — accepte des trous (null) */
export function Sparkline({ data, color = 'currentColor', height = 36, width = 120, fill = true, min, max, strokeWidth = 1.6, className }: SparklineProps) {
  const gid = useSvgId('sp');
  const vals = data.map((p) => (typeof p === 'number' || p == null ? p : p.v));
  const ok = vals.filter((v): v is number => v != null && Number.isFinite(v));
  const svgCls = cn('block overflow-visible', className);
  if (ok.length < 2) return <svg width="100%" height={height} className={svgCls} aria-hidden="true" />;
  const autoMin = min === 'auto' || min === undefined;
  let mx = max ?? Math.max(...ok);
  let mn = autoMin ? Math.min(...ok) : Math.min(min, ...ok);
  const flat = mx - mn < 1e-9;
  if (!flat && autoMin) { const pad = (mx - mn) * 0.15; mx += pad; mn = mn >= 0 ? Math.max(0, mn - pad) : mn - pad; }
  const pts = vals.map((v, i): PtN => [(i / (vals.length - 1)) * width, v == null || !Number.isFinite(v) ? null : flat ? height * 0.6 : 2 + (height - 4) * (1 - (v - mn) / (mx - mn || 1))]);
  const segs = segments(pts);
  const d = segs.map((s) => monotonePath(s.length === 1 ? [[s[0][0] - 1, s[0][1]], s[0]] : s)).join('');
  const area = segs.map((s) => `${monotonePath(s)}L${f1(s[s.length - 1][0])},${height}L${f1(s[0][0])},${height}Z`).join('');
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={svgCls} aria-hidden="true">
      {fill && !flat ? (
        <>
          <defs>
            <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.24} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill={`url(#${gid})`} />
        </>
      ) : null}
      <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} vectorEffect="non-scaling-stroke" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Mini-barres (tendance sur quelques jours) — la dernière barre est accentuée */
export function MiniBars({ values, color = 'var(--chart-1)', height = 36, width = 200, gap = 3, className }: { values: ReadonlyArray<number>; color?: string; height?: number; width?: number; gap?: number; className?: string }) {
  const n = values.length;
  const svgCls = cn('block overflow-visible', className);
  if (!n) return <svg width="100%" height={height} className={svgCls} aria-hidden="true" />;
  const mx = Math.max(1, ...values.map(toNum)), bw = Math.max(0.5, (width - gap * (n - 1)) / n);
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className={svgCls} aria-hidden="true">
      {values.map((v, i) => {
        const hh = Math.max(2, (toNum(v) / mx) * (height - 6));
        return <rect key={i} x={i * (bw + gap)} y={height - hh} width={bw} height={hh} rx={2} fill={color} opacity={i === n - 1 ? 1 : 0.35} className="lc-grow-y" style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }} />;
      })}
    </svg>
  );
}

export type HistoryChartProps = { data: ReadonlyArray<any>; color?: string; height?: number; scale?: (v: number) => number; bars?: boolean; format?: Fmt; className?: string };

/** Histogramme / aire compacte à partir d'un historique Bbox ([[pas, valeur], …] ou [valeur, …]) */
export function HistoryChart({ data, color = 'currentColor', height = 120, scale = (v) => v, bars = false, format = (v) => v, className }: HistoryChartProps) {
  const gid = useSvgId('hc');
  const vals = data.map((d) => scale(Number(Array.isArray(d) ? d[1] : d))).filter((v) => Number.isFinite(v));
  if (!vals.length) return <div className={cn('py-4 text-[13px] text-muted-foreground', className)}>Pas encore d’historique</div>;
  const W = 600, hi = Math.max(...vals), lo = Math.min(...vals), pad = (hi - lo) * 0.2 || Math.abs(hi) * 0.05 || 1;
  const mx = bars ? hi * 1.1 || 1 : hi + pad, mn = bars ? 0 : lo - pad;
  const y = (v: number) => 4 + (height - 8) * (1 - (v - mn) / (mx - mn || 1));
  const svgCls = cn('block overflow-visible', className);
  if (bars) {
    const bw = W / vals.length;
    return (
      <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={svgCls} role="img" aria-label="Historique">
        {vals.map((v, i) => (
          <rect key={i} x={i * bw + bw * 0.15} y={y(v)} width={bw * 0.7} height={Math.max(1, height - y(v))} rx={1.5} fill={color} opacity={0.85} className="lc-grow-y" style={{ animationDelay: `${Math.min(i * 6, 360)}ms` }}>
            <title>{txt(format(v))}</title>
          </rect>
        ))}
      </svg>
    );
  }
  const pts = (vals.length === 1 ? [vals[0], vals[0]] : vals).map((v, i, a): XY => [(i / (a.length - 1)) * W, y(v)]);
  const d = monotonePath(pts);
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} preserveAspectRatio="none" className={svgCls} role="img" aria-label="Historique">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.22} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <g className="lc-rise" style={{ transformBox: 'view-box', transformOrigin: `0px ${height}px` }}>
        <path d={`${d}L${W},${height}L0,${height}Z`} fill={`url(#${gid})`} />
        <path d={d} fill="none" stroke={color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
      </g>
    </svg>
  );
}

// ═════════════ Anneau de répartition ═════════════
export type DonutSegment = { v: number; color: string; label?: string };
export type DonutProps = { segments: ReadonlyArray<DonutSegment>; size?: number; thickness?: number; label?: React.ReactNode; sub?: React.ReactNode; gap?: number; className?: string };
type Geo = { off: number; len: number };
type Arc = Geo & { key: string; color: string; label?: string; v: number };

/** Arc de cercle (fractions de tour, 0 = midi, sens horaire) — tracé exact, survol précis */
function arcD(c: number, r: number, off: number, len: number): string {
  if (!(len > 0.0005)) return '';
  if (len >= 0.9995) return `M${f2(c)},${f2(c - r)}A${f2(r)},${f2(r)} 0 1 1 ${f2(c)},${f2(c + r)}A${f2(r)},${f2(r)} 0 1 1 ${f2(c)},${f2(c - r)}`;
  const a0 = off * 2 * Math.PI, a1 = (off + len) * 2 * Math.PI;
  return `M${f2(c + r * Math.sin(a0))},${f2(c - r * Math.cos(a0))}A${f2(r)},${f2(r)} 0 ${len > 0.5 ? 1 : 0} 1 ${f2(c + r * Math.sin(a1))},${f2(c - r * Math.cos(a1))}`;
}

/** Anneau de répartition : segments tracés en balayage à l'apparition, puis animés d'une valeur à l'autre */
export function Donut({ segments, size = 128, thickness = 14, label, sub, gap = 2, className }: DonutProps) {
  const els = useRef(new Map<string, SVGPathElement>());
  const geo = useRef(new Map<string, Geo>());
  const swept = useRef(false);
  const r = (size - thickness) / 2, c = size / 2, C = 2 * Math.PI * r;
  const shown = segments.map((s, i) => ({ s, i })).filter(({ s }) => toNum(s.v) > 0);
  const total = shown.reduce((a, { s }) => a + toNum(s.v), 0) || 1;
  const gapF = shown.length > 1 && C > 0 ? gap / C : 0;
  let acc = 0;
  const arcs: Arc[] = shown.map(({ s, i }) => {
    const f = toNum(s.v) / total;
    const a: Arc = { key: `${i}:${s.label ?? ''}`, color: s.color, label: s.label, v: toNum(s.v), off: acc, len: Math.max(0.0005, f - gapF) };
    acc += f;
    return a;
  });
  const sig = `${f2(c)}:${f2(r)}|${arcs.map((a) => `${a.key}=${a.off.toFixed(4)}+${a.len.toFixed(4)}`).join('|')}`;

  useLayoutEffect(() => {
    const write = (key: string, off: number, len: number) => { els.current.get(key)?.setAttribute('d', arcD(c, r, off, len)); geo.current.set(key, { off, len }); };
    const keep = new Set(arcs.map((a) => a.key));
    for (const k of [...geo.current.keys()]) if (!keep.has(k)) geo.current.delete(k);
    if (!canAnimate()) { swept.current = true; for (const a of arcs) write(a.key, a.off, a.len); return; }
    let progressed = false;
    if (!swept.current) {
      // apparition : balayage depuis midi (état de départ posé avant l'affichage)
      for (const a of arcs) write(a.key, a.off, 0);
      const ctl = animate(0, 1, {
        duration: 0.9, ease: EASE,
        onUpdate: (p) => { progressed = p > 0; if (p >= 1) swept.current = true; for (const a of arcs) write(a.key, a.off, Math.min(a.len, Math.max(0, p - a.off))); },
      });
      return () => { ctl.stop(); if (progressed) swept.current = true; };
    }
    // mise à jour : chaque segment glisse de son ancienne position à la nouvelle (les nouveaux poussent sur place)
    const from = new Map<string, Geo>(arcs.map((a): [string, Geo] => [a.key, geo.current.get(a.key) ?? { off: a.off, len: 0 }]));
    for (const a of arcs) { const g = from.get(a.key)!; write(a.key, g.off, g.len); }
    const ctl = animate(0, 1, {
      duration: 0.6, ease: EASE,
      onUpdate: (p) => { for (const a of arcs) { const g = from.get(a.key)!; write(a.key, g.off + (a.off - g.off) * p, g.len + (a.len - g.len) * p); } },
    });
    return () => ctl.stop();
  }, [sig]);

  const fs = Math.round(Math.max(14, Math.min(26, size * 0.19)));
  const summary = arcs.map((a) => `${a.label ?? ''} : ${a.v}`).join(', ');
  return (
    <div className={cn('lc-donut relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg className="lc-pop absolute inset-0 overflow-visible" width={size} height={size} role="img" aria-label={summary || undefined}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--border)" strokeWidth={thickness} />
        {arcs.map((a) => (
          <path key={a.key} ref={(nd) => { if (nd) els.current.set(a.key, nd); else els.current.delete(a.key); }} className="lc-arc" fill="none" stroke={a.color} strokeWidth={thickness} strokeLinecap="butt">
            <title>{`${a.label ?? ''} : ${a.v}`}</title>
          </path>
        ))}
      </svg>
      <div className="relative grid text-center leading-[1.1]">
        <b className="num font-semibold leading-none tracking-[-0.025em]" style={{ fontSize: fs }}>{label}</b>
        {sub ? <small className="mt-1 text-[11.5px] text-muted-foreground">{sub}</small> : null}
      </div>
    </div>
  );
}

// ═════════════ Frise de présence ═════════════
export type PresenceRow = {
  id?: string | number; name: React.ReactNode; icon?: React.ReactNode;
  /** [début, fin, enCours?] en ms */
  segs: ReadonlyArray<ReadonlyArray<number | boolean | null | undefined>>;
  label?: React.ReactNode; title?: string;
};
export type PresenceTimelineProps = { rows: ReadonlyArray<PresenceRow>; from: number; to: number; right?: React.ReactNode; className?: string };
const TL_COLS = 'grid grid-cols-[minmax(110px,180px)_minmax(0,1fr)_auto] items-center gap-3.5 max-[760px]:grid-cols-[96px_minmax(0,1fr)]';

/** Frise de présence : une ligne par appareil, segments [début, fin] sur la fenêtre [from, to] */
export function PresenceTimeline({ rows, from, to, right, className }: PresenceTimelineProps) {
  const span = to - from || 1;
  const pct = (t: number) => Math.max(0, Math.min(100, ((t - from) / span) * 100));
  const step = span > 2 * DAY ? DAY : 3 * HOUR;
  const ticks = alignedTicks(from, to, step).filter((t) => t < to); // heures locales rondes (0 h, 3 h, 6 h…)
  const now = Date.now();
  return (
    <div className={cn('grid grid-cols-[minmax(0,1fr)] gap-2.5', className)}>
      {rows.map((row, ri) => (
        <div key={row.id ?? ri} className={cn(TL_COLS, 'text-[13.5px]')}>
          <div className="flex min-w-0 items-center gap-2">{row.icon}<span className="truncate">{row.name}</span></div>
          <div className="relative h-[18px] overflow-hidden rounded-[5px] bg-muted geist:h-4 geist:rounded-[4px] geist:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)]" title={row.title}>
            {row.segs.map((sg, si) => {
              const a = toNum(sg[0]), b = toNum(sg[1]), live = !!sg[2];
              const l = pct(a), w = Math.max(0.4, pct(b) - l);
              return (
                <span key={si} className={cn('lc-grow-x absolute bottom-[3px] top-[3px] min-w-[2px] rounded-[3px]', live ? 'bg-ok' : 'bg-brand geist:bg-chart-1')}
                  style={{ left: `${l}%`, width: `${w}%`, animationDelay: `${Math.min(ri * 35, 420)}ms` }}
                  title={`${F.hm.format(a)} – ${live ? 'maintenant' : F.hm.format(b)}`} />
              );
            })}
            {now < to ? <span className="absolute inset-y-0 w-[1.5px] bg-danger opacity-70" style={{ left: `${pct(now)}%` }} /> : null}
          </div>
          <div className="num min-w-[52px] text-right text-[12.5px] text-muted-foreground max-[760px]:hidden">{row.label}</div>
        </div>
      ))}
      <div className={cn(TL_COLS, 'num text-[11px] text-muted-foreground')}>
        <span />
        <div className="relative h-3.5">
          {ticks.map((t) => {
            const p = pct(t);
            return (
              <span key={t} className="absolute whitespace-nowrap" style={{ left: `${p}%`, transform: `translateX(${p < 4 ? 0 : p > 96 ? -100 : -50}%)` }}>
                {step >= DAY ? F.w.format(t) : `${new Date(t).getHours()} h`}
              </span>
            );
          })}
        </div>
        <span className="max-[760px]:hidden">{right || ''}</span>
      </div>
    </div>
  );
}

// ═════════════ Nombres, jauges, signal, légende ═════════════
export type CountUpProps = { value?: number | string | null; format?: Fmt; class?: string; className?: string };
const defCount: Fmt = (v) => Math.round(v);

/** Nombre animé (Motion) — le texte est écrit directement à chaque image, sans re-rendu */
export function CountUp({ value, format = defCount, class: cls, className }: CountUpProps) {
  const el = useRef<HTMLSpanElement>(null);
  const cur = useRef(toNum(value));
  const fmt = useRef(format);
  useLayoutEffect(() => { fmt.current = format; });
  useEffect(() => {
    const node = el.current, to = toNum(value), from = cur.current;
    if (!node) return;
    if (from === to || !canAnimate()) { cur.current = to; node.textContent = txt(fmt.current(to)); return; }
    const ctl = animate(from, to, { duration: 0.7, ease: EASE, onUpdate: (v) => { cur.current = v; node.textContent = txt(fmt.current(v)); } });
    return () => ctl.stop();
  }, [value]);
  return <span ref={el} className={cn('num', cls, className)}>{txt(format(cur.current))}</span>;
}

export type GaugeProps = { value?: number; max?: number; size?: number; stroke?: number; color?: string; track?: string; label?: React.ReactNode; sub?: React.ReactNode; arc?: number; className?: string };

/** Jauge circulaire animée (ressort) — arc orienté par un <g transform> interne */
export function Gauge({ value = 0, max = 100, size = 64, stroke = 6, color = 'var(--chart-1)', track = 'var(--border)', label, sub, arc = 0.75, className }: GaugeProps) {
  const ref = useRef<SVGCircleElement>(null), cur = useRef(0);
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, L = C * arc, c = size / 2;
  useLayoutEffect(() => {
    const to = clamp01(toNum(value) / (max || 1));
    const set = (f: number) => { ref.current?.setAttribute('stroke-dasharray', `${f2(L * clamp01(f))} ${f2(C)}`); };
    if (!canAnimate()) { cur.current = to; set(to); return; }
    set(cur.current);
    const ctl = animate(cur.current, to, { type: 'spring', stiffness: 120, damping: 20, onUpdate: (v) => { cur.current = v; set(v); } });
    return () => ctl.stop();
  }, [value, max, L, C]);
  const rot = 90 + (360 * (1 - arc)) / 2;
  const fs = Math.round(Math.max(14, Math.min(22, size * 0.21)));
  return (
    <div className={cn('relative inline-grid shrink-0 place-items-center', className)} style={{ width: size, height: size }}>
      <svg className="absolute inset-0 overflow-visible" width={size} height={size} aria-hidden="true">
        <g transform={`rotate(${rot} ${c} ${c})`}>
          <circle cx={c} cy={c} r={r} fill="none" stroke={track} strokeWidth={stroke} strokeDasharray={`${f2(L)} ${f2(C)}`} strokeLinecap="round" />
          <circle ref={ref} cx={c} cy={c} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" style={{ transition: 'stroke 0.3s ease' }} />
        </g>
      </svg>
      <div className="relative grid text-center leading-[1.05]">
        <b className="num font-semibold" style={{ fontSize: fs }}>{label}</b>
        {sub ? <small className="mt-0.5 text-[11px] text-muted-foreground">{sub}</small> : null}
      </div>
    </div>
  );
}

/** Barres de signal Wi-Fi (0 à 4) */
export function SignalBars({ bars = 0, class: cls, className }: { bars?: number; class?: string; className?: string }) {
  return (
    <span className={cn('inline-flex h-[15px] shrink-0 items-end gap-[2px] text-foreground', cls, className)} role="img" aria-label={`Signal ${bars} sur 4`}>
      {[1, 2, 3, 4].map((i) => (
        <i key={i} className={cn('w-[3px] rounded-[1px] bg-current transition-opacity duration-200', i <= bars ? 'opacity-100' : 'opacity-20')} style={{ height: 3 + i * 3 }} />
      ))}
    </span>
  );
}

export type LegendItem = { color: string; label: React.ReactNode; value?: React.ReactNode; dim?: boolean; dash?: boolean };

/** Légende : pastilles de couleur + libellés (valeur optionnelle, trait pointillé pour une courbe en tirets) */
export function Legend({ items, className, vertical = false }: { items: ReadonlyArray<LegendItem>; className?: string; vertical?: boolean }) {
  return (
    <div className={cn('flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12.5px] text-muted-foreground', vertical && 'grid justify-items-start gap-1.5', className)}>
      {items.map((it, i) => (
        <span key={i} className="inline-flex min-w-0 items-center gap-1.5">
          {it.dash
            ? <i aria-hidden className="h-0 w-3 shrink-0 border-t-[1.5px] border-dashed" style={{ borderColor: it.color, opacity: it.dim ? 0.5 : undefined }} />
            : <i aria-hidden className="size-2 shrink-0 rounded-full" style={{ background: it.color, opacity: it.dim ? 0.45 : undefined }} />}
          <span className="truncate">{it.label}</span>
          {it.value != null ? <b className="num ml-0.5 font-semibold text-foreground">{it.value}</b> : null}
        </span>
      ))}
    </div>
  );
}

/** Entrée en cascade des enfants marqués [data-enter] (compatibilité ; la nouvelle interface utilise .enter en CSS) */
export function useEnter(ref: React.RefObject<HTMLElement | null>, deps: React.DependencyList = []) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !canAnimate()) return;
    const els = root.querySelectorAll<HTMLElement>('[data-enter]');
    if (!els.length) return;
    const ctl = animate(els, { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: 0.5, ease: EASE, delay: stagger(0.035) });
    return () => ctl.complete();
  }, deps);
}
