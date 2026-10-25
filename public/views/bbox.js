// Ma Bbox : matériel, santé en direct, historiques, écran, sauvegardes, notifications, système.
import { html, PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Empty, Seg, Secret, Range, act, openSheet, confirmDialog, FormSheet, useApi, useState, useEffect, useMemo, toast } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { LiveChart, HistoryChart, Gauge, CountUp } from '/lib/chart.js';
import { Icon } from '/lib/icons.js';
import { duration, dateTime, relative, num, bytes } from '/lib/format.js';

const MODEL = { 'f@st5696b': 'Bbox Wi-Fi 7', fast5696b: 'Bbox Wi-Fi 7', 'f@st5688b': 'Bbox Wi-Fi 6E', 'f@st5686b': 'Bbox Ultym' };
const LUM = [{ v: '0', l: 'Éteint' }, { v: '1', l: '25 %' }, { v: '2', l: '50 %' }, { v: '3', l: '75 %' }, { v: '4', l: '100 %' }];

export default function BboxView() {
  const s = useLive();
  const { data, reload } = useApi(['device/summary', 'device/led', 'usersave', 'configs', 'notification', 'device/usb'], { poll: 30000 });
  const [summ, led, us, cfg, notif, usb] = data;
  const dev = s.device?.device;
  const svc = s.services?.services;
  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const cpuSeries = useMemo(() => [{ data: s.series.cpu, color: 'var(--brand)', label: 'CPU' }], []);
  const tempSeries = useMemo(() => [{ data: s.series.temp, color: 'var(--warn-fill)', label: 'Temp.' }], []);
  const reloadAll = () => { reload(); refresh('statics'); };

  const REBOOT_CONFIRM = { title: 'Redémarrer la Bbox ?', message: 'Internet, le Wi-Fi, la TV et le téléphone seront coupés pendant 2 à 3 minutes. Le panel se reconnectera tout seul.', confirm: 'Redémarrer', tone: 'danger', icon: 'power' };
  const reboot = () => act(() => api.post('device/reboot'), { ok: 'Redémarrage en cours…' });
  const saveConfig = () => openSheet(FormSheet, {
    intro: 'Enregistre l’ensemble des réglages actuels dans la Bbox, pour pouvoir y revenir plus tard.',
    fields: [{ key: 'name', label: 'Nom de la sauvegarde', required: true, placeholder: 'Ex. Avant vacances', validate: (v) => (v.length > 32 ? '32 caractères maximum' : /[<>;&"]/.test(v) ? 'Caractères interdits' : null) }],
    initial: { name: 'Sauvegarde du ' + new Date().toLocaleDateString('fr-FR') },
    submitLabel: 'Sauvegarder',
    onSubmit: async (v) => { await act(() => api.post('configs', { name: v.name.trim() }), { ok: 'Configuration sauvegardée' }); reload(); },
  }, { title: 'Nouvelle sauvegarde' });

  return html`
    <${PageHead} kicker=${dev ? MODEL[String(dev.modelname).toLowerCase()] || 'Bbox' : 'Bbox'} title="Ma Bbox" sub=${dev ? `${dev.modelname} · allumée depuis ${duration(dev.uptime)} · ${dev.numberofboots} démarrages` : '…'}
      actions=${html`<${Btn} kind="danger-ghost" size="sm" icon="power" confirm=${REBOOT_CONFIRM} onClick=${reboot}>Redémarrer</${Btn}>`} />
    <div class="grid">
      <${Card} class="s4" title="Matériel" icon="box">
        ${dev ? html`<${KV} rows=${[
          ['Modèle', `${MODEL[String(dev.modelname).toLowerCase()] || 'Bbox'} (${dev.modelname})`],
          ['Firmware', html`<span class="mono">${dev.main?.version}</span>`],
          ['Publié le', dateTime(dev.main?.date, { hour: undefined, minute: undefined })],
          ['Secours', html`<span class="mono">${dev.reco?.version}</span>`],
          ['Mise en service', dateTime(dev.firstusedate, { hour: undefined, minute: undefined })],
          ['Accès', [dev.using?.ftth && 'Fibre', dev.using?.ipv6 && 'IPv6', dev.isCellularEnable && 'Secours 4G'].filter(Boolean).join(' · ')],
        ]} />
        <div class="note" style="margin-top:12px">Numéro de série</div>
        <${Secret} value=${summ?.device?.serialnumber || dev.serialnumber} />` : html`<div class="skel" style="height:220px"></div>`}
      </${Card}>

      <${Card} class="s8" title="Santé en direct" icon="cpu">
        <div class="hstack" style="justify-content:space-around;margin-bottom:16px;gap:16px">
          <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${s.cpu.usage} label=${Math.round(s.cpu.usage) + ' %'} size=${96} color="var(--brand)" /><span class="note">Processeur</span></div>
          <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${s.cpu.temp} max=${90} label=${num(s.cpu.temp, 1) + '°'} size=${96} color=${s.cpu.temp > 72 ? 'var(--warn-fill)' : 'var(--up)'} /><span class="note">Température</span></div>
          <div style="display:grid;justify-items:center;gap:6px"><${Gauge} value=${memPct} label=${Math.round(memPct) + ' %'} sub=${bytes(s.mem.total * 1024)} size=${96} color="var(--navy-600)" /><span class="note">Mémoire</span></div>
        </div>
        <div class="grid" style="gap:16px">
          <div class="s6"><div class="note" style="margin-bottom:4px">Processeur · 6 dernières minutes</div><${LiveChart} height=${110} series=${cpuSeries} windowMs=${360000} format=${(v) => Math.round(v) + ' %'} minMax=${20} /></div>
          <div class="s6"><div class="note" style="margin-bottom:4px">Température · 6 dernières minutes</div><${LiveChart} height=${110} series=${tempSeries} windowMs=${360000} format=${(v) => num(v, 1) + '°'} minMax=${60} /></div>
        </div>
      </${Card}>

      <${Card} class="s6" title="Historique 24 h" icon="activity">
        <div class="note" style="margin-bottom:4px">Température</div>
        <${HistoryChart} data=${s.graphs.temp.slice(-96)} color="var(--warn-fill)" height=${80} scale=${(v) => v / 1000} format=${(v) => num(v, 1) + '°'} />
        <div class="note" style="margin:14px 0 4px">Processeur</div>
        <${HistoryChart} data=${s.graphs.cpu.slice(-96)} color="var(--brand)" height=${60} bars=${true} format=${(v) => v + ' %'} />
      </${Card}>

      <${Card} class="s6" title="Consommation électrique · 7 jours" icon="bolt">
        ${s.graphs.power.length ? html`<div class="hstack" style="align-items:baseline;margin-bottom:8px"><span class="big num">${num(s.graphs.power[s.graphs.power.length - 1]?.[1] / 1000, 1)}</span><span class="note">W actuellement · moyenne ${num(s.graphs.power.reduce((a, x) => a + Number(x[1] || 0), 0) / s.graphs.power.length / 1000, 1)} W · ≈ ${num((s.graphs.power.reduce((a, x) => a + Number(x[1] || 0), 0) / s.graphs.power.length / 1000) * 24 * 365 / 1000, 0)} kWh/an</span></div>
          <${HistoryChart} data=${s.graphs.power} color="var(--ok)" height=${120} scale=${(v) => v / 1000} format=${(v) => num(v, 1) + ' W'} />` : html`<${Empty} icon="bolt" title="Historique indisponible" />`}
      </${Card}>

      <${Card} class="s6" title="Écran et voyants" icon="sun">
        ${dev && html`<div style="margin-bottom:10px"><${LumSlider} value=${dev.display?.luminosity ?? 2} /></div>`}
        ${led && html`<${KV} rows=${[['Écran', led.screen?.state === 'on' ? 'Allumé' : 'Éteint'], ['Voyant', ['red', 'green', 'blue', 'white'].filter((c) => led.led?.['status_' + c] && led.led['status_' + c] !== 'off').map((c) => ({ red: 'rouge', green: 'vert', blue: 'bleu', white: 'blanc' })[c]).join(', ') || 'Éteint (mode discret)'], ['Ports Ethernet actifs', `${(led.ethernetPort || []).filter((p) => p.state === 'Up').length} / ${(led.ethernetPort || []).length}`]]} />`}
        ${dev && html`<div class="list" style="margin-top:6px"><${ToggleRow} title="Optimisation automatique" sub="La Bbox ajuste seule ses réglages Wi-Fi" value=${dev.optimisation === 1} onChange=${(nv) => act(() => api.put('device/optimization', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(() => refresh('statics'))} /></div>`}
      </${Card}>

      <${Card} class="s6" title="Sauvegardes" icon="save" action=${html`<button class="link" onClick=${saveConfig}><${Icon} name="plus" size=${16} />Sauvegarder</button>`}>
        ${us && html`<div class="list"><${ToggleRow} title="Sauvegarde automatique Bouygues" sub=${`Toutes les ${Math.round(us.usersave.delay / 60)} min sur les serveurs Bouygues · dernière ${relative(us.usersave.datelastsave)}`} value=${us.usersave.authorized === 1}
          onChange=${(nv) => act(() => api.post('usersave', { authorized: nv ? 1 : 0 }), { ok: nv ? 'Sauvegarde automatique activée' : 'Sauvegarde automatique désactivée' }).then(reload)} /></div>`}
        <div class="section-title" style="margin-top:12px">Sauvegardes locales</div>
        <div class="list">${(cfg?.configs || []).length ? cfg.configs.map((c) => html`<div class="row"><div class="grow"><div class="t">${c.name}</div><div class="s">${dateTime(c.date)}</div></div>
          <${Btn} kind="soft" size="sm" onClick=${async () => { if (await confirmDialog({ title: `Restaurer « ${c.name} » ?`, message: 'Tous les réglages actuels seront remplacés et la Bbox redémarrera.', confirm: 'Restaurer', tone: 'danger' })) await act(() => api.post('configs/' + c.id, { restore: 1 }), { ok: 'Restauration lancée' }); }}>Restaurer</${Btn}>
          <button class="icon-btn" aria-label="Supprimer" onClick=${async () => { if (await confirmDialog({ title: 'Supprimer cette sauvegarde ?', confirm: 'Supprimer', tone: 'danger' })) { await act(() => api.del('configs/' + c.id), { ok: 'Sauvegarde supprimée' }); reload(); } }}><${Icon} name="trash" size=${18} /></button></div>`)
          : html`<${Empty} icon="save" title="Aucune sauvegarde locale">Fonction cachée de la Bbox : créez un point de restauration avant de gros changements.</${Empty}>`}</div>
      </${Card}>

      <${Card} class="s6" title="Alertes par e-mail" icon="mail" action=${notif && html`<${Toggle} value=${notif.notification.enable === 1} label="Alertes e-mail" onChange=${(nv) => act(() => api.put('notification', { enable: nv ? 1 : 0 }), { ok: nv ? 'Alertes activées' : 'Alertes désactivées' }).then(reload)} />`}>
        ${notif ? html`<p class="desc" style="margin-bottom:10px">La Bbox peut vous écrire lors d’événements (${notif.notification.events?.length || 0} disponibles : connexion à l’interface, Internet coupé, nouvel appareil…).</p>
          <div class="list">${(notif.notification.alerts || []).map((a) => html`<div class="row" style="min-height:48px"><div class="grow"><div class="t ellipsis">${a.name}</div><div class="s">${String(a.events || '').split(',').filter(Boolean).length} événement(s) · ${a.action?.type === 'Mail' ? 'par e-mail' : a.action?.type}</div></div><${Chip} tone=${a.enable ? 'ok' : 'off'}>${a.enable ? 'Active' : 'Inactive'}</${Chip}></div>`)}</div>
          <div class="note" style="margin-top:10px">Destinataire : ${(notif.notification.contacts || []).map((c) => c.mail || c.name).join(', ') || '—'}</div>
          <${Btn} kind="ghost" size="sm" class="" icon="mail" onClick=${() => act(() => api.post('notification/test'), { ok: 'E-mail de test envoyé' })}>Envoyer un e-mail de test</${Btn}>` : html`<div class="skel" style="height:140px"></div>`}
      </${Card}>

      <${Card} class="s6" title="USB et partage" icon="usb">
        <p class="desc" style="margin-bottom:8px">${(usb?.usb?.parent || []).length ? `${usb.usb.parent.length} périphérique(s) USB branché(s).` : 'Aucun périphérique USB branché.'}</p>
        ${svc?.usb && html`<div class="list">
          <${ToggleRow} title="Partage de fichiers (SMB)" sub="Accès à la clé ou au disque depuis le réseau" value=${svc.usb.samba?.enable === 1} onChange=${(nv) => act(() => api.put('device/usb/samba', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
          <${ToggleRow} title="Serveur multimédia (DLNA)" sub="Photos, vidéos et musique sur la TV" value=${svc.usb.dlna?.enable === 1} onChange=${(nv) => act(() => api.put('device/usb/dlna', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
          <${ToggleRow} title="Imprimante partagée" sub="Imprimante USB accessible depuis le réseau" value=${svc.usb.printer?.enable === 1} onChange=${(nv) => act(() => api.put('device/usb/printer', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
        </div>`}
      </${Card}>
    </div>`;
}

/** Luminosité de l'écran : curseur à 5 crans, enregistré au relâchement */
function LumSlider({ value }) {
  const [v, setV] = useState(Number(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!busy) setV(Number(value)); }, [value]);
  const commit = async (nv) => {
    if (nv === Number(value)) return;
    setBusy(true);
    try { await act(() => api.put('device/display', { luminosity: nv }), { ok: `Luminosité : ${LUM[nv].l.toLowerCase()}` }); refresh('statics'); }
    catch { setV(Number(value)); } finally { setBusy(false); }
  };
  return html`<${Range} label="Luminosité de l’écran" value=${v} min=${0} max=${4} step=${1} onChange=${setV} onCommit=${commit} format=${(x) => LUM[x]?.l} ticks=${LUM.map((x) => ({ v: Number(x.v), l: x.l }))} />`;
}
