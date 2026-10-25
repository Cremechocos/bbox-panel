// Historique enregistré par le serveur : agrégats minute (7 j), heure (120 j) et jour (illimité).
// Consommation Internet calculée à partir des compteurs d'octets WAN de la Bbox (gère les remises à zéro).
import fs from 'node:fs';
import path from 'node:path';

const MIN = 60_000, HOUR = 3_600_000, DAY = 86_400_000;
const KEEP_MIN = 7 * DAY, KEEP_HOUR = 120 * DAY;
const dayKey = (t) => new Date(t).toLocaleDateString('sv'); // AAAA-MM-JJ, heure locale
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const max = (a) => (a.length ? Math.max(...a) : null);
const p95 = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]; };
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

export function createHistory({ dir, log = () => {} }) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const minutes = [], hours = [];
  let days = {};
  let counters = { rx: null, tx: null, t: 0 };
  const now0 = Date.now();

  // ── chargement ──
  try {
    for (const f of fs.readdirSync(dir).filter((f) => /^minutes-\d{4}-\d{2}-\d{2}\.jsonl$/.test(f)).sort()) {
      if (Date.parse(f.slice(8, 18)) < now0 - KEEP_MIN - DAY) { fs.rmSync(path.join(dir, f), { force: true }); continue; }
      for (const line of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) if (line) { try { const b = JSON.parse(line); if (b.t > now0 - KEEP_MIN) minutes.push(b); } catch { /* ligne tronquée */ } }
    }
  } catch (e) { log('history load minutes', e.message); }
  try { for (const line of fs.readFileSync(path.join(dir, 'hours.jsonl'), 'utf8').split('\n')) if (line) { try { const b = JSON.parse(line); if (b.t > now0 - KEEP_HOUR) hours.push(b); } catch { /* */ } } } catch { /* */ }
  try { days = JSON.parse(fs.readFileSync(path.join(dir, 'days.json'), 'utf8')); } catch { /* */ }
  try { counters = JSON.parse(fs.readFileSync(path.join(dir, 'counters.json'), 'utf8')); } catch { /* */ }
  minutes.sort((a, b) => a.t - b.t); hours.sort((a, b) => a.t - b.t);

  let saveT = null;
  const saveSmall = () => {
    clearTimeout(saveT);
    saveT = setTimeout(() => {
      fs.writeFile(path.join(dir, 'days.json'), JSON.stringify(days), { mode: 0o600 }, () => {});
      fs.writeFile(path.join(dir, 'counters.json'), JSON.stringify(counters), { mode: 0o600 }, () => {});
    }, 1000);
  };

  // ── accumulateur de la minute en cours ──
  const fresh = (t) => ({ t, lat: [], lb: [], loss: 0, n: 0, d: [], u: [], c: [], k: [], h: null, w: null, rx: 0, tx: 0 });
  let cur = fresh(Math.floor(Date.now() / MIN) * MIN);
  let curHour = Math.floor(Date.now() / HOUR) * HOUR;

  function dayAdd(t, rx, tx) {
    const k = dayKey(t);
    const d = days[k] || (days[k] = { rx: 0, tx: 0, dm: 0, um: 0, hm: 0, lsum: 0, ln: 0, loss: 0 });
    d.rx += rx; d.tx += tx;
    return d;
  }

  /** Échantillons temps réel (n'importe quel sous-ensemble) */
  function sample(s) {
    roll();
    if ('latency' in s) { cur.n++; if (s.latency == null) cur.loss++; else cur.lat.push(s.latency); }
    if (s.bboxLatency != null) cur.lb.push(s.bboxLatency);
    if (s.down != null) cur.d.push(s.down);
    if (s.up != null) cur.u.push(s.up);
    if (s.cpu != null) cur.c.push(s.cpu);
    if (s.temp != null) cur.k.push(s.temp);
    if (s.hosts != null) cur.h = s.hosts;
    if (s.wifi != null) cur.w = s.wifi;
  }

  /** Compteurs WAN cumulés depuis le démarrage de la Bbox (octets) */
  function feedCounters(rx, tx) {
    roll();
    const now = Date.now();
    if (counters.rx == null) { counters = { rx, tx, t: now }; saveSmall(); return; }
    // remise à zéro (redémarrage de la Bbox) : le compteur repart de 0
    const drx = rx >= counters.rx ? rx - counters.rx : rx;
    const dtx = tx >= counters.tx ? tx - counters.tx : tx;
    const gap = now - counters.t;
    counters = { rx, tx, t: now };
    if (drx === 0 && dtx === 0) return;
    dayAdd(now, drx, dtx);
    // après une longue interruption du panel, on n'impute pas tout à la minute courante (pic artificiel)
    if (gap < 3 * MIN) { cur.rx += drx; cur.tx += dtx; }
    saveSmall();
  }

  function finalize(b) {
    const out = {
      t: b.t, d: r1(avg(b.d)), u: r1(avg(b.u)), dm: r1(max(b.d)), um: r1(max(b.u)), rx: b.rx, tx: b.tx,
      l: r1(avg(b.lat)), lp: r1(p95(b.lat)), lm: r1(max(b.lat)), ls: b.n ? Math.round((b.loss / b.n) * 1000) / 10 : null,
      lb: r1(avg(b.lb)), h: b.h, w: b.w, c: r1(avg(b.c)), k: r1(avg(b.k)),
    };
    return out;
  }
  function roll() {
    const now = Date.now();
    const m = Math.floor(now / MIN) * MIN;
    if (m === cur.t) return;
    const b = finalize(cur);
    const hasData = cur.n || cur.d.length || cur.rx || cur.tx || cur.c.length || cur.h != null;
    if (hasData) {
      minutes.push(b);
      fs.appendFile(path.join(dir, `minutes-${dayKey(b.t)}.jsonl`), JSON.stringify(b) + '\n', { mode: 0o600 }, () => {});
      // pics et latence du jour
      const d = dayAdd(b.t, 0, 0);
      if (b.dm != null) d.dm = Math.max(d.dm, b.dm);
      if (b.um != null) d.um = Math.max(d.um, b.um);
      if (b.h != null) d.hm = Math.max(d.hm, b.h);
      if (b.l != null) { d.lsum += b.l; d.ln++; }
      if (b.ls) d.loss = Math.max(d.loss, b.ls);
      saveSmall();
    }
    while (minutes.length && minutes[0].t < now - KEEP_MIN) minutes.shift();
    cur = fresh(m);
    const h = Math.floor(now / HOUR) * HOUR;
    if (h !== curHour) { const hb = aggregate(minutes.filter((x) => x.t >= curHour && x.t < h), curHour); if (hb) { hours.push(hb); fs.appendFile(path.join(dir, 'hours.jsonl'), JSON.stringify(hb) + '\n', { mode: 0o600 }, () => {}); } curHour = h; while (hours.length && hours[0].t < now - KEEP_HOUR) hours.shift(); }
  }

  function aggregate(arr, t) {
    if (!arr.length) return null;
    const pick = (k) => arr.map((x) => x[k]).filter((v) => v != null);
    const sum = (k) => arr.reduce((s, x) => s + (x[k] || 0), 0);
    return { t, d: r1(avg(pick('d'))), u: r1(avg(pick('u'))), dm: r1(max(pick('dm'))), um: r1(max(pick('um'))), rx: sum('rx'), tx: sum('tx'),
      l: r1(avg(pick('l'))), lp: r1(avg(pick('lp'))), lm: r1(max(pick('lm'))), ls: r1(avg(pick('ls'))), lb: r1(avg(pick('lb'))),
      h: max(pick('h')), w: max(pick('w')), c: r1(avg(pick('c'))), k: r1(avg(pick('k'))) };
  }
  function bucketize(src, from, step) {
    const out = [];
    let i = 0;
    while (i < src.length && src[i].t < from) i++;
    let start = Math.floor(from / step) * step, acc = [];
    for (; i < src.length; i++) {
      const b = src[i];
      while (b.t >= start + step) { if (acc.length) out.push(aggregate(acc, start)); acc = []; start += step; }
      acc.push(b);
    }
    if (acc.length) out.push(aggregate(acc, start));
    return out;
  }
  const RANGES = { '1h': [HOUR, MIN, 'm'], '6h': [6 * HOUR, 2 * MIN, 'm'], '24h': [DAY, 5 * MIN, 'm'], '7d': [7 * DAY, HOUR, 'h'], '30d': [30 * DAY, 4 * HOUR, 'h'], '90d': [90 * DAY, 12 * HOUR, 'h'] };
  function query(range = '24h') {
    roll();
    const [span, step, tier] = RANGES[range] || RANGES['24h'];
    const from = Date.now() - span;
    const src = tier === 'm' ? minutes : [...hours, ...(minutes.length ? [aggregate(minutes.filter((x) => x.t >= curHour), curHour)].filter(Boolean) : [])];
    const points = step === MIN ? src.filter((b) => b.t >= from) : bucketize(src, from, step);
    return { range, step, from, points };
  }
  function daysList(n = 31) {
    roll();
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const k = dayKey(Date.now() - i * DAY);
      const d = days[k];
      out.push({ date: k, rx: d?.rx || 0, tx: d?.tx || 0, dm: d?.dm || 0, um: d?.um || 0, hm: d?.hm || 0, l: d?.ln ? r1(d.lsum / d.ln) : null, loss: d?.loss || 0, has: !!d });
    }
    return out;
  }
  function months(n = 12) {
    const m = {};
    for (const [k, d] of Object.entries(days)) { const mk = k.slice(0, 7); const x = m[mk] || (m[mk] = { month: mk, rx: 0, tx: 0, days: 0 }); x.rx += d.rx; x.tx += d.tx; x.days++; }
    return Object.values(m).sort((a, b) => a.month.localeCompare(b.month)).slice(-n);
  }
  function today() { const d = days[dayKey(Date.now())]; return { rx: d?.rx || 0, tx: d?.tx || 0 }; }
  function since() { const ks = Object.keys(days).sort(); return ks[0] || null; }

  return { sample, feedCounters, query, daysList, months, today, since, roll, get size() { return minutes.length; } };
}
