// Feuilles partagées : pause Internet d'un appareil, Wi-Fi invité temporaire, choix des favoris.
import { html, Btn, Choices, Checkbox, Field, Input, Empty, useState, useMemo } from '/lib/ui.js';
import { Icon, KIND_ICON } from '/lib/icons.js';
import { live } from '/lib/live.js';
import { PAUSES, pauseDevice, resumeDevice, pauseOf, untilLabel, GUEST_DURATIONS, guestOn, guestOff, guestTimer, ACTIONS, usePrefs, setFavs } from '/lib/prefs.js';
import { displayName, deviceKind } from '/lib/format.js';
import { go } from '/lib/router.js';

/** Pause Internet immédiate (règle de pare-feu retirée automatiquement par le serveur du panel) */
export function PauseSheet({ h, close }) {
  const cur = pauseOf(h.macaddress);
  const [v, setV] = useState(60);
  const [custom, setCustom] = useState('');
  const opts = [...PAUSES, { v: 'custom', l: 'Jusqu’à…', s: 'heure précise' }];
  const until = () => {
    if (v !== 'custom') return v;
    const [hh, mm] = custom.split(':').map(Number);
    const d = new Date(); d.setHours(hh, mm, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
    return Math.round((d - Date.now()) / 60000);
  };
  const valid = v !== 'custom' || /^\d{2}:\d{2}$/.test(custom);
  return html`<div class="sheet-b">
      ${cur && html`<div class="banner" style="margin-top:4px"><${Icon} name="pause" size=${18} /><div class="grow"><b>En pause jusqu’à ${untilLabel(cur.until)}.</b> <span>Choisis une nouvelle durée pour prolonger ou raccourcir.</span></div></div>`}
      <p class="note" style="font-size:13.5px;line-height:1.5;margin:4px 0 16px">${displayName(h)} n’aura plus accès à Internet (le réseau local reste disponible). La pause est levée automatiquement, même si cette page est fermée.</p>
      <${Choices} options=${opts} value=${v} onChange=${setV} label="Durée de la pause" />
      ${v === 'custom' && html`<div style="margin-top:14px"><${Field} label="Reprise à"><${Input} type="time" value=${custom} onInput=${setCustom} /></${Field}></div>`}
    </div>
    <div class="sheet-f">
      ${cur && html`<${Btn} kind="ghost" icon="play" onClick=${async () => { await resumeDevice(h); close(true); }}>Reprendre maintenant</${Btn}>`}
      <span class="spacer"></span>
      <${Btn} kind="go" icon="pause" disabled=${!valid} onClick=${async () => { await pauseDevice(h, until()); close(true); }}>${cur ? 'Modifier la pause' : 'Mettre en pause'}</${Btn}>
    </div>`;
}

/** Wi-Fi invité : durée, avertissement de redémarrage du Wi-Fi, carte imprimable */
export function GuestSheet({ enabled, close }) {
  const t = guestTimer();
  const [v, setV] = useState(240);
  return html`<div class="sheet-b">
      <div class="banner" style="margin-top:4px"><${Icon} name="wifi" size=${18} /><div class="grow"><b>Coupure Wi-Fi d’environ 40 secondes.</b> <span>Pour activer ou couper le réseau invité, la Bbox redémarre son Wi-Fi : tous les appareils sans fil se reconnectent ensuite seuls.</span></div></div>
      ${enabled ? html`<div class="stack" style="gap:6px;margin:8px 0 18px"><div class="hstack"><span class="chip ok lg"><span class="dot"></span>Actif</span>${t ? html`<span class="note">coupure automatique ${untilLabel(t.until)}</span>` : html`<span class="note">sans limite de durée</span>`}</div></div>`
        : html`<p class="note" style="font-size:13.5px;margin:8px 0 14px">Pendant combien de temps ?</p><${Choices} options=${GUEST_DURATIONS} value=${v} onChange=${setV} label="Durée" />`}
      <button class="row tap" style="margin-top:14px;width:100%;text-align:left;box-shadow:inset 0 1px 0 var(--line)" onClick=${() => { close(); go('carte', 'guest'); }}>
        <span class="avatar sm"><${Icon} name="print" size=${17} /></span><div class="grow"><div class="t">Carte Wi-Fi à imprimer</div><div class="s">Nom du réseau, mot de passe et QR code pour vos invités</div></div><${Icon} name="chevron" size=${18} class="chev" /></button>
    </div>
    <div class="sheet-f">
      <span class="spacer"></span>
      <button class="btn btn-ghost" onClick=${() => close(false)}>Annuler</button>
      ${enabled ? html`<${Btn} kind="danger" icon="x" onClick=${async () => { if (await guestOff({ ask: false })) close(true); }}>Couper le Wi-Fi invité</${Btn}>`
        : html`<${Btn} kind="go" icon="link" onClick=${async () => { if (await guestOn(v, { ask: false })) close(true); }}>Activer</${Btn}>`}
    </div>`;
}

/** Choix des favoris (appareils et actions), partagés entre le Mac et l'iPhone */
export function FavoritesSheet({ close }) {
  const p = usePrefs();
  const [devs, setDevs] = useState(() => new Set(p.favorites.devices));
  const [acts, setActs] = useState(() => new Set(p.favorites.actions));
  const [busy, setBusy] = useState(false);
  const hosts = useMemo(() => [...(live.hosts || [])].sort((a, b) => b.active - a.active || displayName(a).localeCompare(displayName(b), 'fr')), []);
  const tog = (set, setter, id) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  return html`<div class="sheet-b">
      <div class="section-title" style="margin-top:6px">Appareils</div>
      ${hosts.length ? html`<div class="list">${hosts.map((h) => { const id = String(h.macaddress).toLowerCase(); return html`<div class="row" style="min-height:52px">
        <span class="avatar sm"><${Icon} name=${KIND_ICON[deviceKind(h)]} size=${17} /><span class=${'dot' + (h.active ? ' on' : '')}></span></span>
        <div class="grow"><div class="t ellipsis">${displayName(h)}</div><div class="s">${h.active ? h.ipaddress : 'hors ligne'}</div></div>
        <${Checkbox} checked=${devs.has(id)} onChange=${() => tog(devs, setDevs, id)} label=${html`<span class="sr-only">${displayName(h)}</span>`} /></div>`; })}</div>` : html`<${Empty} icon="devices" title="Aucun appareil" />`}
      <div class="section-title">Actions rapides</div>
      <div class="list">${ACTIONS.map((a) => html`<div class="row" style="min-height:50px"><span class="avatar sm"><${Icon} name=${a.icon} size=${17} /></span><div class="grow t">${a.label}</div><${Checkbox} checked=${acts.has(a.id)} onChange=${() => tog(acts, setActs, a.id)} label=${html`<span class="sr-only">${a.label}</span>`} /></div>`)}</div>
    </div>
    <div class="sheet-f">
      <span class="note grow">${devs.size + acts.size} favori${devs.size + acts.size > 1 ? 's' : ''}</span>
      <button class="btn btn-ghost" onClick=${() => close(false)}>Annuler</button>
      <button class="btn btn-go" disabled=${busy} onClick=${async () => { setBusy(true); try { await setFavs({ devices: [...devs], actions: [...acts] }); close(true); } catch { /* toast */ } finally { setBusy(false); } }}>${busy && html`<span class="spin"></span>`}Enregistrer</button>
    </div>`;
}
