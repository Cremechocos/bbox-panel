// Mode écran mural : vue plein écran en temps réel, pensée pour une tablette ou une TV (reste allumée).
import { html, Card, useState, useEffect, useRef, useMemo } from '/lib/ui.js';
import { useLive } from '/lib/live.js';
import { LiveChart, CountUp, Gauge } from '/lib/chart.js';
import { Icon, Bytel, KIND_ICON } from '/lib/icons.js';
import { kbps, num, deviceKind, displayName } from '/lib/format.js';
import { eventInfo, evTime } from '/lib/events.js';
import { go } from '/lib/router.js';

// hauteur disponible d'un conteneur (les graphiques remplissent leur carte)
function useBoxHeight(min = 150) {
  const ref = useRef(null);
  const [h, setH] = useState(min);
  useEffect(() => { const ro = new ResizeObserver(([e]) => setH(Math.max(min, Math.floor(e.contentRect.height)))); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, h];
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return html`<div><div class="wall-clock">${now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div><div class="wall-date">${now.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}</div></div>`;
}

export default function Wall() {
  const s = useLive();
  const [ui, setUi] = useState(true);
  const [full, setFull] = useState(!!document.fullscreenElement);
  const hideT = useRef(null);
  // l'écran reste allumé (Wake Lock) tant que la vue est ouverte
  useEffect(() => {
    let lock = null;
    const req = () => navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {});
    req();
    const vis = () => { if (!document.hidden) req(); };
    document.addEventListener('visibilitychange', vis);
    const key = (e) => { if (e.key === 'Escape' && !document.fullscreenElement) go('accueil'); };
    window.addEventListener('keydown', key);
    const fs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    document.title = 'Mode mural · Ma Bbox';
    return () => { lock?.release?.(); document.removeEventListener('visibilitychange', vis); window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs); };
  }, []);
  // les commandes s'effacent après 3 s d'inactivité
  useEffect(() => {
    const wake = () => { setUi(true); clearTimeout(hideT.current); hideT.current = setTimeout(() => setUi(false), 3000); };
    wake();
    window.addEventListener('pointermove', wake); window.addEventListener('pointerdown', wake);
    return () => { clearTimeout(hideT.current); window.removeEventListener('pointermove', wake); window.removeEventListener('pointerdown', wake); };
  }, []);
  const latSeries = useMemo(() => [{ data: s.series.latency, color: 'var(--lat)', label: 'Latence' }], []);
  const wanSeries = useMemo(() => [{ data: s.series.down, color: 'var(--down)', label: '↓' }, { data: s.series.up, color: 'var(--up)', label: '↑' }], []);
  const byMac = useMemo(() => new Map((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const active = (s.hosts || []).filter((h) => h.active);
  const ok = !s.latency?.down && (s.summary?.internet?.state ?? s.wanIp?.wan?.internet?.state) === 2;
  const recent = (s.events || []).filter((e) => ['arrive', 'leave', 'new_device', 'internet_down', 'internet_up', 'pause_start', 'pause_end'].includes(e.type)).slice(0, 6);
  const toggleFull = () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.()).catch?.(() => {});
  const lat = s.latency?.internet;
  const [latBox, latH] = useBoxHeight();
  const [wanBox, wanH] = useBoxHeight();

  return html`<div class="wall">
    <div class=${'wall-exit' + (ui ? '' : ' hide')}>
      ${document.documentElement.requestFullscreen && html`<button class="btn btn-soft btn-sm" onClick=${toggleFull}><${Icon} name=${full ? 'shrink' : 'expand'} size=${16} />${full ? 'Quitter le plein écran' : 'Plein écran'}</button>`}
      <button class="btn btn-soft btn-sm" onClick=${() => go('accueil')}><${Icon} name="x" size=${16} />Fermer</button>
    </div>
    <div class="wall-top"><${Bytel} /><${Clock} /><span class="spacer"></span>
      <span class=${'pill-status' + (ok ? '' : ' bad')} style="height:40px;font-size:15px"><span class="pulse"></span>${ok ? 'Internet connecté' : 'Internet coupé'}</span></div>

    <${Card} class="s7" enter=${false} title="Latence Internet" icon="globe">
      <div class="huge">${lat == null ? '—' : html`<${CountUp} value=${lat} format=${(v) => (v < 10 ? num(v, 1) : num(v))} />`}<small>ms</small></div>
      <div class="wall-fill" ref=${latBox}><${LiveChart} height=${latH} series=${latSeries} windowMs=${300000} lag=${1500} threshold=${100} loss=${true} hold=${false} format=${(v) => Math.round(v) + ' ms'} /></div>
    </${Card}>
    <${Card} class="s5" enter=${false} title="Débit" icon="activity">
      <div class="hstack" style="gap:28px"><div><div class="note">Descendant</div><div class="huge" style="font-size:44px"><${CountUp} value=${s.wan.down} format=${kbps} /></div></div><div><div class="note">Montant</div><div class="huge" style="font-size:44px"><${CountUp} value=${s.wan.up} format=${kbps} /></div></div></div>
      <div class="wall-fill" ref=${wanBox}><${LiveChart} height=${wanH} series=${wanSeries} windowMs=${600000} lag=${800} format=${kbps} /></div>
    </${Card}>
    <${Card} class="s4" enter=${false} title="Appareils connectés" icon="devices">
      <div class="huge"><${CountUp} value=${active.length} /><small>/ ${(s.hosts || []).length}</small></div>
      <div class="list" style="margin-top:10px">${recent.slice(0, 4).map((e) => { const i = eventInfo(e, byMac); return html`<div class="row" style="min-height:44px"><span class=${'avatar sm ev-ico ' + (i.tone || '')}><${Icon} name=${i.icon} size=${15} /></span><div class="grow ellipsis" style="font-size:14px">${i.title}</div><span class="note num">${evTime(e.t)}</span></div>`; })}</div>
    </${Card}>
    <${Card} class="s4" enter=${false} title="Wi-Fi en direct" icon="wifi">
      <div class="stack" style="gap:14px;margin-top:4px">${[['24', '2,4 GHz', 'var(--c-temp)'], ['5', '5 GHz', 'var(--down)'], ['6', '6 GHz', 'var(--c-mem)']].filter(([k]) => s.wireless?.wireless?.radio?.[k]).map(([k, l, c]) => { const v = s.bands[k].down + s.bands[k].up; return html`<div><div class="hstack" style="justify-content:space-between"><span class="note">${l}</span><b class="num">${kbps(v)}</b></div><div class="meter" style="margin-top:6px"><i style=${`background:${c};transform:scaleX(${Math.min(1, v / Math.max(1, ...['24', '5', '6'].map((b) => s.bands[b].down + s.bands[b].up)))})`}></i></div></div>`; })}</div>
    </${Card}>
    <${Card} class="s4" enter=${false} title="La Bbox" icon="box">
      <div class="hstack" style="justify-content:space-around;margin-top:6px">
        <div style="display:grid;justify-items:center;gap:8px"><${Gauge} value=${s.cpu.usage} label=${Math.round(s.cpu.usage) + ' %'} size=${96} stroke=${8} color="var(--c-cpu)" /><span class="note">Processeur</span></div>
        <div style="display:grid;justify-items:center;gap:8px"><${Gauge} value=${s.cpu.temp} max=${90} label=${Math.round(s.cpu.temp) + '°'} size=${96} stroke=${8} color="var(--c-temp)" /><span class="note">Température</span></div>
      </div>
    </${Card}>
  </div>`;
}
