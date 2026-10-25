// Statistiques : historique enregistré par le serveur du panel (consommation, débit, latence, appareils, Bbox).
import { html, PageHead, Card, Seg, Empty, Skeleton, useFetch, useState, useMemo } from '/lib/ui.js';
import { panel } from '/lib/api.js';
import { TimeChart, BarChart } from '/lib/chart.js';
import { Icon } from '/lib/icons.js';
import { kbps, bytes, num } from '/lib/format.js';

const RANGES = [{ v: '1h', l: '1 h' }, { v: '24h', l: '24 h' }, { v: '7d', l: '7 j' }, { v: '30d', l: '30 j' }];
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const pick = (pts, k) => pts.map((p) => p[k]).filter((v) => v != null);
const dayLabel = (d) => String(Number(d.date.slice(8, 10)));
const longDay = (d) => { const s = new Date(d.date + 'T12:00').toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const monthLabel = (m) => new Date(m.month + '-15').toLocaleDateString('fr-FR', { month: 'short' });
const longMonth = (m) => { const s = new Date(m.month + '-15').toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); return s.charAt(0).toUpperCase() + s.slice(1); };
const gb = (v) => bytes(v);

export default function Stats() {
  const [range, setRange] = useState('24h');
  const [uview, setUview] = useState('days');
  const hist = useFetch(() => panel.history(range), [range], { poll: 60000 });
  const usage = useFetch(() => panel.usage(31), [], { poll: 120000 });
  const pts = hist.data?.points || [];
  const step = hist.data?.step || 60000;
  const from = hist.data?.from, to = Date.now();
  const u = usage.data;
  const month = u?.months?.[u.months.length - 1];
  const daysThisMonth = new Date().getDate();
  const lat = avg(pick(pts, 'l')), loss = avg(pick(pts, 'ls'));
  const peak = Math.max(0, ...pick(pts, 'dm'));
  const today = u?.today || { rx: 0, tx: 0 };
  const since = u?.since ? new Date(u.since + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }) : null;

  return html`
    <${PageHead} kicker="Vue d’ensemble" title="Statistiques" sub=${since ? `Historique enregistré par le serveur du panel depuis le ${since}` : 'Historique enregistré par le serveur du panel'}
      actions=${html`<${Seg} options=${RANGES} value=${range} onChange=${setRange} label="Période" />`} />
    <div class="kpis">
      <div class="kpi" data-enter style="padding-bottom:16px"><div class="l"><${Icon} name="calendar" size=${15} />Aujourd’hui</div><div class="v">${gb(today.rx + today.tx)}</div><div class="x num">↓ ${gb(today.rx)} · ↑ ${gb(today.tx)}</div></div>
      <div class="kpi" data-enter style="padding-bottom:16px"><div class="l"><${Icon} name="chart" size=${15} />Ce mois-ci</div><div class="v">${month ? gb(month.rx + month.tx) : '—'}</div><div class="x num">${month ? `moy. ${gb((month.rx + month.tx) / Math.max(1, Math.min(daysThisMonth, month.days)))} / jour` : 'en cours de calcul'}</div></div>
      <div class="kpi" data-enter style="padding-bottom:16px"><div class="l"><${Icon} name="globe" size=${15} />Latence moyenne</div><div class="v">${lat == null ? '—' : num(lat, lat < 10 ? 1 : 0)}<small>ms</small></div><div class="x">sur ${RANGES.find((r) => r.v === range).l}</div></div>
      <div class="kpi" data-enter style="padding-bottom:16px"><div class="l"><${Icon} name="check" size=${15} />Disponibilité</div><div class="v">${loss == null ? '—' : num(Math.max(0, 100 - loss), 2)}<small>%</small></div><div class="x">mesures réussies</div></div>
      <div class="kpi" data-enter style="padding-bottom:16px"><div class="l"><${Icon} name="zap" size=${15} />Pic de débit</div><div class="v">${peak ? kbps(peak) : '—'}</div><div class="x">descendant, sur la période</div></div>
    </div>
    <div class="grid">
      <${Card} class="s12" title="Consommation Internet" icon="chart" action=${html`<${Seg} size="sm" value=${uview} onChange=${setUview} label="Vue" options=${[{ v: 'days', l: '31 jours' }, { v: 'months', l: 'Mois' }]} />`}>
        <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--down)"></i>Téléchargé</span><span><i style="background:var(--up)"></i>Envoyé</span></div>
        ${!u ? html`<${Skeleton} h=${210} />` : uview === 'days'
          ? html`<${BarChart} data=${u.days} height=${220} keys=${[{ key: 'rx', color: 'var(--down)', label: 'Téléchargé' }, { key: 'tx', color: 'var(--up)', label: 'Envoyé' }]} format=${gb} label=${dayLabel} tipLabel=${longDay} highlight=${(d) => d.has} />`
          : html`<${BarChart} data=${u.months} height=${220} keys=${[{ key: 'rx', color: 'var(--down)', label: 'Téléchargé' }, { key: 'tx', color: 'var(--up)', label: 'Envoyé' }]} format=${gb} label=${monthLabel} tipLabel=${longMonth} />`}
        <p class="note" style="margin-top:8px">Calculée à partir des compteurs de la Bbox. Les jours où le serveur du panel était arrêté peuvent être incomplets.</p>
      </${Card}>
      <${Card} class="s12" title="Débit Internet" icon="activity" sub="moyenne par intervalle">
        <div class="legend" style="margin-bottom:10px"><span><i style="background:var(--down)"></i>Descendant</span><span><i style="background:var(--up)"></i>Montant</span><span><i style="background:var(--down);opacity:.45"></i>Pic descendant</span></div>
        ${hist.loading && !pts.length ? html`<${Skeleton} h=${220} />` : html`<${TimeChart} points=${pts} step=${step} from=${from} to=${to} height=${230} format=${kbps}
          series=${[{ key: 'dm', color: 'var(--down)', label: 'Pic ↓', width: 1, dash: '3 3' }, { key: 'd', color: 'var(--down)', label: 'Descendant', area: true }, { key: 'u', color: 'var(--up)', label: 'Montant', area: true }]} />`}
      </${Card}>
      <${Card} class="s6" title="Latence Internet" icon="globe" sub="moyenne et 95ᵉ centile">
        ${hist.loading && !pts.length ? html`<${Skeleton} h=${200} />` : html`<${TimeChart} points=${pts} step=${step} from=${from} to=${to} height=${210} format=${(v) => Math.round(v) + ' ms'} threshold=${100}
          band=${{ lo: 'l', hi: 'lp', color: 'var(--lat)', label: '95ᵉ centile' }} series=${[{ key: 'l', color: 'var(--lat)', label: 'Moyenne' }]} />`}
      </${Card}>
      <${Card} class="s6" title="Appareils connectés" icon="devices">
        ${hist.loading && !pts.length ? html`<${Skeleton} h=${200} />` : html`<${TimeChart} points=${pts} step=${step} from=${from} to=${to} height=${210} format=${(v) => String(Math.round(v))}
          series=${[{ key: 'h', color: 'var(--brand)', label: 'Total', area: true }, { key: 'w', color: 'var(--c-mem)', label: 'En Wi-Fi' }]} />`}
      </${Card}>
      <${Card} class="s6" title="Température de la Bbox" icon="thermo">
        ${hist.loading && !pts.length ? html`<${Skeleton} h=${180} />` : html`<${TimeChart} points=${pts} step=${step} from=${from} to=${to} height=${190} format=${(v) => Math.round(v) + ' °C'} yMax=${100}
          series=${[{ key: 'k', color: 'var(--c-temp)', label: 'Température', area: true }]} />`}
      </${Card}>
      <${Card} class="s6" title="Charge du processeur" icon="cpu">
        ${hist.loading && !pts.length ? html`<${Skeleton} h=${180} />` : html`<${TimeChart} points=${pts} step=${step} from=${from} to=${to} height=${190} format=${(v) => Math.round(v) + ' %'} yMax=${100}
          series=${[{ key: 'c', color: 'var(--c-cpu)', label: 'Processeur', area: true }]} />`}
      </${Card}>
    </div>`;
}
