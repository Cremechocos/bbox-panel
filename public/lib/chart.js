// Graphiques (SVG, sans dépendance) : temps réel à 60 i/s, historiques, barres, anneau, présence,
// jauges et compteurs animés (Motion). Les couleurs sont des variables CSS : elles suivent l'apparence.
import { h } from '/vendor/preact.mjs';
import { useEffect, useRef, useState, useLayoutEffect, useMemo } from '/vendor/hooks.mjs';
import htm from '/vendor/htm.mjs';
const html = htm.bind(h);

const M = () => window.Motion;
export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const EASE = [0.22, 1, 0.36, 1];

// ── Courbe monotone (Fritsch–Carlson) : lisse sans dépasser les valeurs réelles ──
export function monotonePath(pts, move = true) {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `${move ? 'M' : 'L'}${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  const dx = [], dy = [], m = [], t = [];
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dx[i] ? dy[i] / dx[i] : 0; }
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i]);
  let d = `${move ? 'M' : 'L'}${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h3 = dx[i] / 3;
    d += `C${(pts[i][0] + h3).toFixed(1)},${(pts[i][1] + t[i] * h3).toFixed(1)} ${(pts[i + 1][0] - h3).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h3).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
  }
  return d;
}
/** Découpe en segments continus (les valeurs null = trous, ex. perte de paquets) */
function segments(pts) {
  const out = []; let cur = [];
  for (const p of pts) { if (p[1] == null) { if (cur.length) out.push(cur); cur = []; } else cur.push(p); }
  if (cur.length) out.push(cur);
  return out;
}
export const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  return (r <= 1 ? 1 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 4 ? 4 : r <= 5 ? 5 : r <= 6 ? 6 : r <= 8 ? 8 : 10) * p;
};
/** Pas « rond » (1, 1,5, 2, 2,5, 3, 5 × 10ⁿ) pour des graduations lisibles */
export const niceStep = (v) => {
  if (!(v > 0)) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const r = v / p;
  return (r <= 1 ? 1 : r <= 1.5 ? 1.5 : r <= 2 ? 2 : r <= 2.5 ? 2.5 : r <= 3 ? 3 : r <= 5 ? 5 : 10) * p;
};
// Graduations temporelles alignées sur l'heure locale (14:00, 15:00… ou 24 oct., 25 oct.…)
const TSTEPS = [60e3, 5 * 60e3, 10 * 60e3, 15 * 60e3, 30 * 60e3, 3600e3, 2 * 3600e3, 3 * 3600e3, 4 * 3600e3, 6 * 3600e3, 12 * 3600e3, 86400e3, 2 * 86400e3, 7 * 86400e3];
export function timeTicks(t0, t1, px, minPx = 84) {
  const maxN = Math.max(2, Math.floor(px / minPx)), span = t1 - t0;
  const st = TSTEPS.find((s) => span / s <= maxN) || TSTEPS[TSTEPS.length - 1];
  let first;
  if (st >= 86400e3) { const d = new Date(t0); d.setHours(0, 0, 0, 0); first = d.getTime(); while (first < t0) first += 86400e3; }
  else { const tz = new Date(t0).getTimezoneOffset() * 60000; first = Math.ceil((t0 - tz) / st) * st + tz; }
  const out = []; for (let t = first; t <= t1; t += st) out.push(t);
  return { ticks: out, step: st };
}
const tickLabel = (t, st) => (st >= 86400e3 ? new Date(t).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) : new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
const hhmmss = (t) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const useWidth = (ref, initial = 600) => {
  const [w, setW] = useState(initial);
  useLayoutEffect(() => {
    if (!ref.current) return;
    setW(Math.max(80, ref.current.clientWidth || initial));
    const ro = new ResizeObserver(([e]) => setW(Math.max(80, Math.round(e.contentRect.width))));
    ro.observe(ref.current); return () => ro.disconnect();
  }, []);
  return w;
};

let uid = 0;
const PREVIEW = !!document.documentElement.dataset.preview;
/**
 * LiveChart : séries défilantes en continu (rAF, écrit directement dans le SVG, sans re-rendu).
 * series: [{ data: [{t,v|null}], color, label, fill, format }]
 * threshold: valeur d'alerte (ligne pointillée) ; loss: marque les trous (null) en bas du graphe.
 */
export function LiveChart({ series, windowMs = 120000, height = 180, format = (v) => String(Math.round(v)), minMax = 1, grid = 3, lag = 1200, class: cls = '', showAxis = true, strokeWidth = 2, threshold, loss = false, hold = true }) {
  const wrap = useRef(null), svg = useRef(null), tip = useRef(null);
  const id = useRef('lc' + ++uid).current;
  const st = useRef({ w: 300, max: minMax, hover: null });
  const seriesRef = useRef(series); seriesRef.current = series;
  const fmtRef = useRef(format); fmtRef.current = format;

  useLayoutEffect(() => {
    const ro = new ResizeObserver(([e]) => { st.current.w = Math.max(50, e.contentRect.width); });
    ro.observe(wrap.current);
    let raf, lastTs = 0, visible = true;
    // hors écran : on ne dessine pas ; aperçus (page Apparence) : 4 images/s suffisent
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; });
    io.observe(wrap.current);
    const frame = (ts = 0) => {
      if (!visible || (PREVIEW && ts - lastTs < 250)) { raf = requestAnimationFrame(frame); return; }
      lastTs = ts;
      const s = st.current, el = svg.current;
      if (!el) return;
      const W = s.w, H = height, padT = showAxis ? 16 : 6, padB = loss ? 8 : showAxis ? 4 : 2;
      const now = Date.now() - lag;
      let first = now;
      for (const se of seriesRef.current) if (se.data.length && se.data[0].t < first) first = se.data[0].t;
      const win = Math.min(windowMs, Math.max(15000, now - first));
      s.win = s.win ? s.win + (win - s.win) * 0.1 : win;
      const x = (t) => W * (1 - (now - t) / s.win);
      let target = minMax;
      for (const se of seriesRef.current) for (const p of se.data) if (p.v != null && now - p.t < windowMs + 4000 && p.v > target) target = p.v;
      if (threshold && target < threshold * 0.6) target = Math.max(target, threshold * 0.3);
      target = niceStep((target * 1.08) / grid) * grid;
      s.max += (target - s.max) * 0.12;
      if (Math.abs(target - s.max) < target * 0.004) s.max = target; // graduations rondes une fois stabilisé
      const y = (v) => padT + (H - padT - padB) * (1 - Math.min(1, v / s.max));
      el.setAttribute('viewBox', `0 0 ${W} ${H}`);
      const clip = el.querySelector('[data-clip]'); if (clip) clip.setAttribute('width', W);
      let lossD = '';
      seriesRef.current.forEach((se, i) => {
        const raw = se.data.filter((p) => now - p.t < windowMs + 6000);
        const pts = raw.map((p) => [x(p.t), p.v == null ? null : y(p.v)]);
        if (loss && i === 0) for (const p of pts) if (p[1] == null && p[0] > -4) lossD += `M${(p[0] - 1.5).toFixed(1)},${H - 4}h3v4h-3z`;
        // valeur maintenue jusqu'au bord droit (les mesures arrivent par paquets)
        if (hold && pts.length && pts[pts.length - 1][1] != null && pts[pts.length - 1][0] < W) pts.push([W + 1, pts[pts.length - 1][1]]);
        const segs = segments(pts);
        let d = '', a = '';
        for (const sg of segs) {
          if (sg.length === 1) sg.unshift([sg[0][0] - 2, sg[0][1]]);
          const p = monotonePath(sg);
          d += p;
          a += `${p}L${sg[sg.length - 1][0].toFixed(1)},${H}L${sg[0][0].toFixed(1)},${H}Z`;
        }
        el.querySelector(`[data-l="${i}"]`)?.setAttribute('d', d);
        el.querySelector(`[data-gl="${i}"]`)?.setAttribute('d', d);
        el.querySelector(`[data-a="${i}"]`)?.setAttribute('d', a);
        const dot = el.querySelector(`[data-d="${i}"]`);
        const last = segs[segs.length - 1];
        if (dot) {
          if (last && last.length && last[last.length - 1][0] >= W - 2) {
            let cx = last[last.length - 1][0], cy = last[last.length - 1][1];
            for (let k = last.length - 1; k > 0; k--) { const A = last[k - 1], B = last[k]; if (A[0] <= W && B[0] >= W) { const f = (W - A[0]) / (B[0] - A[0] || 1); cx = W; cy = A[1] + (B[1] - A[1]) * f; break; } }
            dot.setAttribute('cx', Math.min(W - 2, cx)); dot.setAttribute('cy', cy); dot.style.opacity = 1;
          } else dot.style.opacity = 0;
        }
      });
      el.querySelector('[data-loss]')?.setAttribute('d', lossD);
      const thr = el.querySelector('[data-thr]');
      if (thr) { const ty = y(threshold); thr.setAttribute('y1', ty); thr.setAttribute('y2', ty); thr.setAttribute('x2', W); thr.style.opacity = threshold < s.max ? 0.7 : 0; }
      el.querySelectorAll('[data-g]').forEach((g) => { const k = +g.dataset.g, yy = padT + (H - padT - padB) * (k / grid); g.setAttribute('y1', yy); g.setAttribute('y2', yy); g.setAttribute('x2', W); });
      if (showAxis) el.querySelectorAll('[data-gt]').forEach((t) => { const k = +t.dataset.gt, yy = padT + (H - padT - padB) * (k / grid); t.setAttribute('y', yy - 4); t.textContent = fmtRef.current(s.max * (1 - k / grid)); });
      // survol
      const hv = s.hover, cross = el.querySelector('[data-x]');
      if (hv != null && cross) {
        const t = now - (1 - hv / W) * s.win;
        cross.setAttribute('x1', hv); cross.setAttribute('x2', hv); cross.style.opacity = 1;
        if (tip.current) {
          const rows = seriesRef.current.map((se) => {
            let best = null; for (const p of se.data) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
            if (!best) return '';
            const f = se.format || fmtRef.current;
            return `<span><i style="background:${se.color}"></i>${se.label ?? ''}<b>${best.v == null ? 'perdu' : f(best.v)}</b></span>`;
          }).join('');
          tip.current.innerHTML = `<div class="tt">${hhmmss(t)}</div>${rows}`; tip.current.style.opacity = 1;
          const tw = tip.current.offsetWidth;
          tip.current.style.transform = `translate(${Math.min(W - tw, Math.max(0, hv - tw / 2))}px, -100%)`;
        }
      } else if (cross) { cross.style.opacity = 0; if (tip.current) tip.current.style.opacity = 0; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [height, windowMs, grid, lag, showAxis, threshold, loss]);

  const move = (e) => { const r = wrap.current.getBoundingClientRect(); st.current.hover = Math.max(0, Math.min(r.width, e.clientX - r.left)); };
  const leave = () => { st.current.hover = null; };
  return html`<div class=${'lchart ' + cls} ref=${wrap} style=${`height:${height}px`} onPointerMove=${move} onPointerDown=${move} onPointerLeave=${leave} onPointerCancel=${leave}>
    <svg ref=${svg} width="100%" height=${height} preserveAspectRatio="none" role="img" aria-label="Graphique temps réel">
      <defs><clipPath id=${`${id}c`}><rect data-clip x="0" y="-20" width="300" height=${height + 40} /></clipPath>${series.map((se, i) => html`<linearGradient id=${`${id}g${i}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color=${se.color} stop-opacity="0.26"/><stop offset="100%" stop-color=${se.color} stop-opacity="0"/></linearGradient>`)}</defs>
      ${Array.from({ length: grid }, (_, k) => html`<line data-g=${k} x1="0" class="lc-grid" />`)}
      ${showAxis && Array.from({ length: grid }, (_, k) => html`<text data-gt=${k} x="2" class="lc-axis"></text>`)}
      ${threshold && html`<line data-thr x1="0" class="lc-thr" />`}
      <g clip-path=${`url(#${id}c)`}>
        ${series.map((se, i) => se.fill !== false && html`<path data-a=${i} fill=${`url(#${id}g${i})`} />`)}
        ${series.map((se, i) => html`<path data-gl=${i} class="lc-glow" fill="none" stroke=${se.color} stroke-width=${strokeWidth * 4} stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />`)}
        ${series.map((se, i) => html`<path data-l=${i} fill="none" stroke=${se.color} stroke-width=${strokeWidth} stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />`)}
        ${loss && html`<path data-loss class="lc-loss" />`}
      </g>
      ${series.map((se, i) => html`<circle data-d=${i} r="3.5" fill=${se.color} class="lc-dot" style=${`color:${se.color}`} />`)}
      <line data-x y1="0" y2=${height} class="lc-cross" />
    </svg>
    <div class="lc-tip" ref=${tip}></div>
  </div>`;
}

/** Sparkline (re-rendue à chaque nouvelle donnée) — accepte des trous (null) */
export function Sparkline({ data, color = 'currentColor', height = 36, width = 120, fill = true, min, max, strokeWidth = 1.6 }) {
  const vals = data.map((p) => (typeof p === 'number' || p == null ? p : p.v));
  const ok = vals.filter((v) => v != null);
  if (ok.length < 2) return html`<svg width="100%" height=${height} class="spark"></svg>`;
  let mx = max ?? Math.max(...ok), mn = min === 'auto' || min === undefined ? Math.min(...ok) : Math.min(min, ...ok);
  const flat = mx - mn < 1e-9;
  if (!flat && (min === 'auto' || min === undefined)) { const pad = (mx - mn) * 0.15; mx += pad; mn = Math.max(0, mn - pad); }
  const pts = vals.map((v, i) => [(i / (vals.length - 1)) * width, v == null ? null : flat ? height * 0.6 : 2 + (height - 4) * (1 - (v - mn) / (mx - mn || 1))]);
  const segs = segments(pts);
  const d = segs.map((s) => monotonePath(s)).join('');
  const gid = 'sp' + (++uid);
  const area = segs.map((s) => `${monotonePath(s)}L${s[s.length - 1][0]},${height}L${s[0][0]},${height}Z`).join('');
  return html`<svg width="100%" height=${height} viewBox=${`0 0 ${width} ${height}`} preserveAspectRatio="none" class="spark" aria-hidden="true">
    ${fill && !flat && html`<defs><linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${color} stop-opacity=".24"/><stop offset="1" stop-color=${color} stop-opacity="0"/></linearGradient></defs><path d=${area} fill=${`url(#${gid})`} />`}
    <path d=${d} fill="none" stroke=${color} stroke-width=${strokeWidth} vector-effect="non-scaling-stroke" stroke-linecap="round" stroke-linejoin="round" />
  </svg>`;
}

/** Mini-barres (tendance sur quelques jours) — la dernière barre est accentuée */
export function MiniBars({ values, color = 'var(--brand)', height = 36, width = 200, gap = 3 }) {
  const n = values.length;
  if (!n) return html`<svg width="100%" height=${height} class="spark"></svg>`;
  const mx = Math.max(1, ...values), bw = (width - gap * (n - 1)) / n;
  return html`<svg width="100%" height=${height} viewBox=${`0 0 ${width} ${height}`} preserveAspectRatio="none" class="spark" aria-hidden="true">
    ${values.map((v, i) => { const hh = Math.max(2, (v / mx) * (height - 6)); return html`<rect x=${i * (bw + gap)} y=${height - hh} width=${bw} height=${hh} rx="2" fill=${color} opacity=${i === n - 1 ? 1 : 0.35} />`; })}
  </svg>`;
}

/** Histogramme / aire compacte à partir d'un historique Bbox ([[pas, valeur], …]) */
export function HistoryChart({ data, color = 'currentColor', height = 120, scale = (v) => v, bars = false, format = (v) => v }) {
  const vals = data.map((d) => scale(Array.isArray(d) ? d[1] : d));
  if (!vals.length) return html`<div class="hchart-empty">Pas encore d’historique</div>`;
  const W = 600, hi = Math.max(...vals), lo = Math.min(...vals), pad = (hi - lo) * 0.2 || Math.abs(hi) * 0.05 || 1;
  const mx = bars ? hi * 1.1 || 1 : hi + pad, mn = bars ? 0 : lo - pad;
  const y = (v) => 4 + (height - 8) * (1 - (v - mn) / (mx - mn || 1));
  if (bars) {
    const bw = W / vals.length;
    return html`<svg viewBox=${`0 0 ${W} ${height}`} width="100%" height=${height} preserveAspectRatio="none" class="hchart">
      ${vals.map((v, i) => html`<rect x=${i * bw + bw * 0.15} y=${y(v)} width=${bw * 0.7} height=${Math.max(1, height - y(v))} rx="1.5" fill=${color} opacity=".85"><title>${format(v)}</title></rect>`)}
    </svg>`;
  }
  const pts = vals.map((v, i) => [(i / (vals.length - 1 || 1)) * W, y(v)]);
  const d = monotonePath(pts);
  const gid = 'hc' + (++uid);
  return html`<svg viewBox=${`0 0 ${W} ${height}`} width="100%" height=${height} preserveAspectRatio="none" class="hchart">
    <defs><linearGradient id=${gid} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${color} stop-opacity=".22"/><stop offset="1" stop-color=${color} stop-opacity="0"/></linearGradient></defs>
    <path d=${`${d}L${W},${height}L0,${height}Z`} fill=${`url(#${gid})`} /><path d=${d} fill="none" stroke=${color} stroke-width="1.8" vector-effect="non-scaling-stroke" />
  </svg>`;
}

const fmtTick = (t, span) => {
  const d = new Date(t);
  if (span <= 36 * 3600e3) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
};
const fmtTipTime = (t, step) => {
  const d = new Date(t);
  if (step >= 86400e3) return d.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
  return d.toLocaleString('fr-FR', { weekday: 'short', hour: '2-digit', minute: '2-digit' });
};
/**
 * TimeChart : historique (points [{t, …}]) avec axes, survol et trous.
 * series: [{ key, color, label, area, width, dash, format }] ; band: { lo, hi, color } (zone entre deux clés)
 */
export function TimeChart({ points = [], series, height = 220, format = (v) => String(Math.round(v)), from, to, step = 60000, band, threshold, yMax, empty = 'Pas encore assez de mesures' }) {
  const wrap = useRef(null), tip = useRef(null), cross = useRef(null), dots = useRef(null);
  const W = useWidth(wrap);
  const id = useMemo(() => 'tc' + ++uid, []);
  const padL = 44, padR = 8, padT = 10, padB = 24, H = height;
  const t0 = from ?? points[0]?.t ?? 0, t1 = to ?? (points.length ? points[points.length - 1].t + step : 1);
  const keys = [...series.map((s) => s.key), ...(band ? [band.hi] : [])];
  let max = 0; for (const p of points) for (const k of keys) if (p[k] != null && p[k] > max) max = p[k];
  if (threshold && max < threshold) max = Math.max(max, threshold * 0.5);
  const gridN = 4;
  const top = yMax || niceStep((max * 1.1) / gridN) * gridN;
  const x = (t) => padL + (W - padL - padR) * ((t - t0) / (t1 - t0 || 1));
  const y = (v) => padT + (H - padT - padB) * (1 - Math.min(1, v / top));
  const tt = useMemo(() => timeTicks(t0, t1, W - padL - padR), [W, t0, t1]);
  const ticksX = tt.ticks.filter((t) => x(t) > padL + 18 && x(t) < W - padR - 18);
  // zone hachurée avant la première mesure (collecte commencée récemment)
  const firstT = points.find((p) => keys.some((k) => p[k] != null))?.t;
  const noData = firstT != null && firstT - t0 > (t1 - t0) * 0.06 ? x(firstT) - padL : 0;
  // un trou quand l'écart entre deux points dépasse 2,5 pas (serveur arrêté, Mac en veille…)
  const path = (key) => {
    const segs = []; let cur = [], last = null;
    for (const p of points) {
      if (p[key] == null || (last && p.t - last > step * 2.5)) { if (cur.length) segs.push(cur); cur = []; }
      if (p[key] != null) cur.push([x(p.t + step / 2), y(p[key])]);
      last = p.t;
    }
    if (cur.length) segs.push(cur);
    return segs;
  };
  if (!points.length) return html`<div ref=${wrap} class="lchart" style=${`height:${height}px;display:grid;place-items:center`}><span class="note">${empty}</span></div>`;
  const move = (e) => {
    const r = wrap.current.getBoundingClientRect(), px = e.clientX - r.left;
    const t = t0 + ((px - padL) / (W - padL - padR)) * (t1 - t0) - step / 2;
    let best = null; for (const p of points) if (!best || Math.abs(p.t - t) < Math.abs(best.t - t)) best = p;
    if (!best) return;
    const cx = x(best.t + step / 2);
    cross.current.setAttribute('x1', cx); cross.current.setAttribute('x2', cx); cross.current.style.opacity = 1;
    dots.current.innerHTML = series.map((s) => (best[s.key] == null ? '' : `<circle cx="${cx}" cy="${y(best[s.key])}" r="3.5" fill="${s.color}" stroke="var(--card)" stroke-width="2"/>`)).join('');
    tip.current.innerHTML = `<div class="tt">${fmtTipTime(best.t, step)}</div>` + series.map((s) => `<span><i style="background:${s.color}"></i>${s.label}<b>${best[s.key] == null ? '—' : (s.format || format)(best[s.key])}</b></span>`).join('') + (band && best[band.hi] != null ? `<span><i style="background:${band.color};opacity:.5"></i>${band.label}<b>${(band.format || format)(best[band.hi])}</b></span>` : '');
    tip.current.style.opacity = 1;
    const tw = tip.current.offsetWidth;
    tip.current.style.transform = `translate(${Math.min(W - tw, Math.max(0, cx - tw / 2))}px, -100%)`;
  };
  const leave = () => { cross.current.style.opacity = 0; tip.current.style.opacity = 0; dots.current.innerHTML = ''; };
  let bandD = '';
  if (band) {
    const segs = []; let cur = [], last = null;
    for (const p of points) { if (p[band.hi] == null || p[band.lo] == null || (last && p.t - last > step * 2.5)) { if (cur.length) segs.push(cur); cur = []; } if (p[band.hi] != null && p[band.lo] != null) cur.push(p); last = p.t; }
    if (cur.length) segs.push(cur);
    bandD = segs.map((sg) => 'M' + sg.map((p) => `${x(p.t + step / 2).toFixed(1)},${y(p[band.hi]).toFixed(1)}`).join('L') + 'L' + [...sg].reverse().map((p) => `${x(p.t + step / 2).toFixed(1)},${y(p[band.lo]).toFixed(1)}`).join('L') + 'Z').join('');
  }
  return html`<div class="lchart" ref=${wrap} style=${`height:${height}px`} onPointerMove=${move} onPointerDown=${move} onPointerLeave=${leave}>
    <svg width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Historique">
      <defs>${series.map((s, i) => s.area && html`<linearGradient id=${id + 'g' + i} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color=${s.color} stop-opacity=".22"/><stop offset="1" stop-color=${s.color} stop-opacity="0"/></linearGradient>`)}</defs>
      ${Array.from({ length: gridN + 1 }, (_, k) => { const yy = padT + ((H - padT - padB) * k) / gridN; return html`<line x1=${padL} x2=${W - padR} y1=${yy} y2=${yy} class="lc-grid" /><text x=${padL - 8} y=${yy + 3.5} text-anchor="end" class="lc-axis">${format(top * (1 - k / gridN))}</text>`; })}
      ${ticksX.map((t) => html`<text x=${x(t)} y=${H - 6} text-anchor="middle" class="lc-axis">${tickLabel(t, tt.step)}</text>`)}
      ${noData > 0 && html`<pattern id=${id + 'h'} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="7" stroke="var(--line)" stroke-width="2.5" /></pattern>
        <rect x=${padL} y=${padT} width=${noData} height=${H - padT - padB} fill=${`url(#${id}h)`} rx="6" />
        ${noData > 150 && html`<text x=${padL + noData / 2} y=${padT + (H - padT - padB) / 2 + 4} text-anchor="middle" class="lc-nodata">Collecte depuis ${tickLabel(firstT, (t1 - t0) > 2 * 86400e3 ? 86400e3 : 60e3)}</text>`}`}
      ${threshold && threshold < top && html`<line x1=${padL} x2=${W - padR} y1=${y(threshold)} y2=${y(threshold)} class="lc-thr" />`}
      ${band && html`<path d=${bandD} fill=${band.color} opacity=".14" />`}
      ${series.map((s, i) => path(s.key).map((sg) => { const d = monotonePath(sg.length === 1 ? [[sg[0][0] - 2, sg[0][1]], sg[0]] : sg); return html`${s.area && html`<path d=${`${d}L${sg[sg.length - 1][0]},${H - padB}L${sg[0][0]},${H - padB}Z`} fill=${`url(#${id}g${i})`} />`}<path d=${d} fill="none" stroke=${s.color} stroke-width=${s.width || 1.8} stroke-dasharray=${s.dash} stroke-linejoin="round" stroke-linecap="round" />`; }))}
      <line ref=${cross} y1=${padT} y2=${H - padB} class="lc-cross" />
      <g ref=${dots}></g>
    </svg>
    <div class="lc-tip" ref=${tip}></div>
  </div>`;
}

/** Barres empilées (consommation par jour…) avec survol */
export function BarChart({ data, keys, height = 200, format = (v) => v, label = (d) => d.label, tipLabel, highlight, yFormat }) {
  const wrap = useRef(null), tip = useRef(null), g = useRef(null);
  const W = useWidth(wrap);
  const padL = 44, padR = 4, padT = 8, padB = 22, H = height;
  const totals = data.map((d) => keys.reduce((s, k) => s + (Number(d[k.key]) || 0), 0));
  const top = niceStep((Math.max(1, ...totals) * 1.08) / 4) * 4;
  const n = data.length || 1, slot = (W - padL - padR) / n, bw = Math.max(2, Math.min(28, slot * 0.62)), r = Math.min(4, bw / 2);
  const y = (v) => padT + (H - padT - padB) * (1 - v / top);
  const every = Math.ceil(n / Math.max(2, Math.floor((W - padL) / 46)));
  const roundTop = (x0, y0, w, hh) => (hh <= r ? `M${x0},${y0 + hh}V${y0}H${x0 + w}V${y0 + hh}Z` : `M${x0},${y0 + hh}V${y0 + r}Q${x0},${y0} ${x0 + r},${y0}H${x0 + w - r}Q${x0 + w},${y0} ${x0 + w},${y0 + r}V${y0 + hh}Z`);
  const over = (i) => {
    const d = data[i];
    g.current.querySelectorAll('[data-i]').forEach((el) => el.classList.toggle('hl', +el.dataset.i === i));
    wrap.current.classList.add('hovering');
    tip.current.innerHTML = `<div class="tt">${(tipLabel || label)(d)}</div>` + keys.map((k) => `<span><i style="background:${k.color}"></i>${k.label}<b>${format(Number(d[k.key]) || 0)}</b></span>`).join('') + (keys.length > 1 ? `<span><i style="background:transparent"></i>Total<b>${format(totals[i])}</b></span>` : '');
    tip.current.style.opacity = 1;
    const cx = padL + slot * (i + 0.5), tw = tip.current.offsetWidth;
    tip.current.style.transform = `translate(${Math.min(W - tw, Math.max(0, cx - tw / 2))}px, -100%)`;
  };
  const leave = () => { wrap.current?.classList.remove('hovering'); g.current?.querySelectorAll('.hl').forEach((el) => el.classList.remove('hl')); if (tip.current) tip.current.style.opacity = 0; };
  const move = (e) => { const rr = wrap.current.getBoundingClientRect(); const i = Math.floor((e.clientX - rr.left - padL) / slot); if (i >= 0 && i < n) over(i); };
  return html`<div class="bars lchart" ref=${wrap} style=${`height:${height}px`} onPointerMove=${move} onPointerDown=${move} onPointerLeave=${leave}>
    <svg width=${W} height=${H} viewBox=${`0 0 ${W} ${H}`} role="img" aria-label="Histogramme">
      ${[0, 1, 2, 3, 4].map((k) => { const yy = padT + ((H - padT - padB) * k) / 4; return html`<line x1=${padL} x2=${W - padR} y1=${yy} y2=${yy} class="lc-grid" /><text x=${padL - 8} y=${yy + 3.5} text-anchor="end" class="lc-axis">${(yFormat || format)(top * (1 - k / 4))}</text>`; })}
      <g ref=${g}>${data.map((d, i) => {
        let acc = 0;
        const x0 = padL + slot * i + (slot - bw) / 2;
        const parts = keys.map((k, j) => { const v = Number(d[k.key]) || 0; const y1 = y(acc + v), y0 = y(acc); acc += v; const hh = Math.max(0, y0 - y1); if (!hh) return null; const isTop = keys.slice(j + 1).every((kk) => !(Number(d[kk.key]) > 0)); return html`<path class="b" data-i=${i} d=${isTop ? roundTop(x0, y1, bw, hh) : `M${x0},${y0}V${y1}H${x0 + bw}V${y0}Z`} fill=${k.color} opacity=${highlight && !highlight(d) ? 0.55 : 1} />`; });
        return html`${parts}${(i % every === 0 || i === n - 1) && html`<text x=${x0 + bw / 2} y=${H - 6} text-anchor="middle" class="lc-axis">${label(d)}</text>`}`;
      })}</g>
    </svg>
    <div class="lc-tip" ref=${tip}></div>
  </div>`;
}

/** Anneau de répartition, animé à l'apparition */
export function Donut({ segments, size = 128, thickness = 14, label, sub, gap = 2 }) {
  const ref = useRef(null);
  const r = (size - thickness) / 2, C = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.v, 0) || 1;
  let off = 0;
  const arcs = segments.filter((s) => s.v > 0).map((s) => { const len = (s.v / total) * C; const a = { ...s, len: Math.max(0.01, len - (segments.length > 1 ? gap : 0)), off }; off += len; return a; });
  useEffect(() => {
    if (!ref.current || !M() || reducedMotion()) return;
    M().animate(ref.current, { transform: ['rotate(-90deg) scale(.92)', 'rotate(-90deg) scale(1)'], opacity: [0, 1] }, { duration: 0.6, ease: EASE });
  }, []);
  return html`<div class="donut" style=${`width:${size}px;height:${size}px`}>
    <svg ref=${ref} width=${size} height=${size}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke="var(--line)" stroke-width=${thickness} />
      ${arcs.map((a) => html`<circle class="seg-arc" cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${a.color} stroke-width=${thickness} stroke-dasharray=${`${a.len} ${C}`} stroke-dashoffset=${-a.off} stroke-linecap="butt"><title>${a.label} : ${a.v}</title></circle>`)}
    </svg>
    <div class="dc"><b>${label}</b>${sub && html`<small>${sub}</small>`}</div>
  </div>`;
}

/** Frise de présence : une ligne par appareil, segments [début, fin] sur la fenêtre [from, to] */
export function PresenceTimeline({ rows, from, to, right }) {
  const pct = (t) => Math.max(0, Math.min(100, ((t - from) / (to - from)) * 100));
  const hours = [];
  const step = (to - from) > 2 * 86400e3 ? 86400e3 : 3 * 3600e3;
  for (let t = Math.ceil(from / step) * step; t < to; t += step) hours.push(t);
  const now = Date.now();
  return html`<div class="timeline">
    ${rows.map((r) => html`<div class="tl-row">
      <div class="tl-name">${r.icon}<span class="ellipsis">${r.name}</span></div>
      <div class="tl-track" title=${r.title}>${r.segs.map(([a, b, live]) => html`<span class=${'tl-seg' + (live ? ' now' : '')} style=${`left:${pct(a)}%;width:${Math.max(0.4, pct(b) - pct(a))}%`}></span>`)}${now < to && html`<span class="tl-now" style=${`left:${pct(now)}%`}></span>`}</div>
      <div class="note num" style="min-width:52px;text-align:right">${r.label}</div>
    </div>`)}
    <div class="tl-axis"><span></span><div class="ticks">${hours.map((t) => html`<span style=${`left:${pct(t)}%`}>${step >= 86400e3 ? new Date(t).toLocaleDateString('fr-FR', { weekday: 'short' }) : new Date(t).getHours() + ' h'}</span>`)}</div><span>${right || ''}</span></div>
  </div>`;
}

/** Nombre animé (Motion) */
export function CountUp({ value, format = (v) => Math.round(v), class: cls = '' }) {
  const el = useRef(null), cur = useRef(value ?? 0);
  const fmt = useRef(format); fmt.current = format;
  useEffect(() => {
    const to = Number(value) || 0, from = cur.current;
    if (!el.current) return;
    if (!M() || reducedMotion() || from === to || document.hidden) { cur.current = to; el.current.textContent = fmt.current(to); return; }
    const ctl = M().animate(from, to, { duration: 0.7, ease: EASE, onUpdate: (v) => { cur.current = v; if (el.current) el.current.textContent = fmt.current(v); } });
    return () => ctl.stop();
  }, [value]);
  return html`<span class=${'num ' + cls} ref=${el}>${format(cur.current)}</span>`;
}

/** Jauge circulaire animée */
export function Gauge({ value = 0, max = 100, size = 64, stroke = 6, color = 'var(--brand)', track = 'var(--line)', label, sub, arc = 0.75 }) {
  const ref = useRef(null), cur = useRef(0);
  const r = (size - stroke) / 2, C = 2 * Math.PI * r, L = C * arc;
  useEffect(() => {
    const to = Math.max(0, Math.min(1, value / max));
    const set = (f) => ref.current && ref.current.setAttribute('stroke-dasharray', `${(L * f).toFixed(2)} ${C}`);
    if (!M() || reducedMotion()) { cur.current = to; set(to); return; }
    const ctl = M().animate(cur.current, to, { type: 'spring', stiffness: 120, damping: 20, onUpdate: (v) => { cur.current = v; set(v); } });
    return () => ctl.stop();
  }, [value, max]);
  const rot = 90 + (360 * (1 - arc)) / 2;
  return html`<div class="gauge" style=${`width:${size}px;height:${size}px`}>
    <svg width=${size} height=${size} aria-hidden="true"><g transform=${`rotate(${rot} ${size / 2} ${size / 2})`}>
      <circle cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${track} stroke-width=${stroke} stroke-dasharray=${`${L} ${C}`} stroke-linecap="round" />
      <circle ref=${ref} cx=${size / 2} cy=${size / 2} r=${r} fill="none" stroke=${color} stroke-width=${stroke} stroke-dasharray=${`0 ${C}`} stroke-linecap="round" />
    </g></svg>
    <div class="gauge-c"><b>${label}</b>${sub && html`<small>${sub}</small>`}</div>
  </div>`;
}

/** Barres de signal Wi-Fi */
export function SignalBars({ bars = 0, class: cls = '' }) {
  return html`<span class=${'sigbars ' + cls} role="img" aria-label=${`Signal ${bars} sur 4`}>${[1, 2, 3, 4].map((i) => html`<i class=${i <= bars ? 'on' : ''} style=${`height:${3 + i * 3}px`}></i>`)}</span>`;
}

/** Animation d'entrée en cascade des enfants marqués [data-enter] */
export function useEnter(ref, deps = []) {
  useLayoutEffect(() => {
    const root = ref.current;
    if (!root || !M() || reducedMotion()) return;
    const els = root.querySelectorAll('[data-enter]');
    if (!els.length) return;
    M().animate(els, { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: 0.5, ease: EASE, delay: M().stagger(0.035) });
  }, deps);
}

/** Interrupteur animé (ressort) — la course dépend de la taille du bouton (selon l'apparence) */
export function Switch({ checked, onChange, disabled, label }) {
  const knob = useRef(null), btn = useRef(null), first = useRef(true);
  const place = (animate) => {
    if (!knob.current || !btn.current) return;
    const travel = btn.current.clientWidth - knob.current.offsetWidth - 6;
    const x = checked ? travel : 0;
    if (!animate || first.current || !M() || reducedMotion()) { first.current = false; knob.current.style.transform = `translateX(${x}px)`; return; }
    M().animate(knob.current, { transform: `translateX(${x}px)` }, { type: 'spring', stiffness: 560, damping: 34 });
  };
  useLayoutEffect(() => place(true), [checked]);
  useEffect(() => { const f = () => place(false); window.addEventListener('appearance', f); return () => window.removeEventListener('appearance', f); }, [checked]);
  return html`<button type="button" ref=${btn} role="switch" aria-checked=${!!checked} aria-label=${label} disabled=${disabled} class=${'switch' + (checked ? ' on' : '')} onClick=${() => !disabled && onChange && onChange(!checked)}><span ref=${knob}></span></button>`;
}
