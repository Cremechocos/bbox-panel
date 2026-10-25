// Wi-Fi : réseaux (principal, Wi-Fi 7, invité), QR codes, bandes radio et réglages avancés.
import { html, PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Secret, QR, Empty, Seg, Field, Select, act, openSheet, confirmDialog, toast, FormSheet, useApi, load, invalidate, useState, useEffect, errMsg } from '/lib/ui.js';
import { api } from '/lib/api.js';
import { useLive, refresh } from '/lib/live.js';
import { Sparkline, Switch } from '/lib/chart.js';
import { Icon } from '/lib/icons.js';
import { wifiQrString, kbps, isMac, displayName } from '/lib/format.js';
import { GuestSheet } from '/lib/sheets.js';
import { guestTimer, untilLabel } from '/lib/prefs.js';
import { go } from '/lib/router.js';

const BANDS = [{ k: '24', l: '2,4 GHz', bw: [20, 40] }, { k: '5', l: '5 GHz', bw: [20, 40, 80, 160] }, { k: '6', l: '6 GHz', bw: [20, 40, 80, 160, 320] }];
const PROTO = { 'WPA2-WPA3': 'WPA2/WPA3', WPA3: 'WPA3', WPA2: 'WPA2', 'WPA-WPA2': 'WPA/WPA2', None: 'Ouvert' };
const passErr = (v) => (!v ? null : v.length < 8 ? '8 caractères minimum' : v.length > 63 ? '63 caractères maximum' : /[^\x20-\x7e]/.test(v) ? 'Caractères ASCII uniquement' : null);
const ssidErr = (v) => (!v?.trim() ? 'Nom requis' : v.length > 32 ? '32 caractères maximum' : null);
const after = () => { setTimeout(() => { invalidate('wireless'); refresh('statics'); refresh('summary'); }, 600); };

export default function Wifi() {
  const s = useLive();
  const { data: wl, error, reload } = useApi('wireless', { poll: 30000 });
  const w = wl?.wireless;
  if (error && !w) return html`<${PageHead} title="Wi-Fi" /><div class="card"><${Empty} icon="alert" title="Wi-Fi indisponible">${errMsg(error)}</${Empty}></div>`;
  if (!w) return html`<${PageHead} kicker="Sans fil" title="Wi-Fi" /><div class="grid"><div class="card s7" data-enter><div class="skel" style="height:220px"></div></div><div class="card s5" data-enter><div class="skel" style="height:220px"></div></div></div>`;
  const main = w.ssid['24'], mlo = w.ssid.mlo, guest = w.ssid.guest;
  const radioOn = w.radio['24']?.enable === 1;
  const unified = w.unified === 1;
  const active = (s.hosts || []).filter((h) => h.active);
  const count = (re) => active.filter((h) => re.test(h.link || '')).length;
  const eco = w.radio['5']?.ecoMode?.enable === 1 || w.radio['6']?.ecoMode?.enable === 1;

  return html`
    <${PageHead} kicker="Sans fil" title="Wi-Fi" sub=${unified ? 'Un seul nom de réseau pour les bandes 2,4, 5 et 6 GHz' : 'Bandes séparées'}
      actions=${html`<span class=${'pill-status' + (radioOn ? '' : ' bad')}><span class="pulse"></span>${radioOn ? 'Wi-Fi actif' : 'Wi-Fi coupé'}</span>`} />
    <div class="grid">
      <${NetworkCard} class="s7" title="Réseau principal" icon="wifi" ssid=${main.id} pass=${main.security.passphrase} proto=${main.security.protocol}
        chips=${[unified ? '2,4 · 5 · 6 GHz' : '2,4 GHz', `${active.filter((h) => !/Ethernet/.test(h.link || '')).length} appareils sans fil`]}
        hidden=${main.hidden === 1} card="main"
        onEdit=${() => editMain(w)} />
      <${Card} class="s5" title="Interrupteurs" icon="sliders">
        <div class="list">
          <${ToggleRow} title="Wi-Fi" sub="Toutes les bandes du réseau principal" value=${radioOn}
            confirm=${(nv) => (nv ? null : { title: 'Couper tout le Wi-Fi ?', message: 'Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Pour le rallumer, il faudra un appareil en Ethernet ou le bouton Wi-Fi de la Bbox.', confirm: 'Couper le Wi-Fi', tone: 'danger' })}
            onChange=${(nv) => act(() => api.put('wireless', { 'radio.enable': nv ? 1 : 0 }), { ok: nv ? 'Wi-Fi activé' : 'Wi-Fi coupé' }).then(after)} />
          <${ToggleRow} title="Unifier les bandes" sub="Un seul nom et mot de passe pour toutes les bandes" value=${unified}
            confirm=${(nv) => ({ title: nv ? 'Unifier les réseaux Wi-Fi ?' : 'Séparer les bandes ?', message: nv ? 'Les bandes 2,4, 5 et 6 GHz prendront le nom et le mot de passe du réseau 2,4 GHz. Les appareils se reconnecteront.' : 'Chaque bande aura son propre nom de réseau. Les appareils se reconnecteront.', confirm: nv ? 'Unifier' : 'Séparer', tone: 'warn' })}
            onChange=${(nv) => act(() => api.put('wireless/5', { unified: nv ? 1 : 0 }), { ok: nv ? 'Réseaux unifiés' : 'Bandes séparées' }).then(after)} />
          <${ToggleRow} title="Mode éco Wi-Fi" sub="Réduit la puissance 5 et 6 GHz quand le réseau est calme" value=${eco}
            onChange=${(nv) => act(async () => { await api.put('wireless/5', { ecoMode: nv ? 1 : 0 }); if (w.radio['6']) await api.put('wireless/6', { ecoMode: nv ? 1 : 0 }); }, { ok: nv ? 'Mode éco activé' : 'Mode éco désactivé' }).then(after)} />
          <${ToggleRow} title="WPS" sub="Appairage par bouton" value=${main.wps?.enable === 1}
            onChange=${(nv) => act(() => api.put('wireless', { 'wps.enable': nv ? 1 : 0 }), { ok: nv ? 'WPS activé' : 'WPS désactivé' }).then(after)} />
        </div>
        <div class="hstack" style="margin-top:14px">
          <${Btn} kind="soft" size="sm" icon="link" disabled=${main.wps?.enable !== 1} onClick=${() => openSheet(WpsSheet, {}, { title: 'Appairage WPS' })}>Appairer en WPS</${Btn}>
          <${Btn} kind="soft" size="sm" icon="clock" onClick=${() => openSheet(DeactivationSheet, {}, { title: 'Coupure temporaire' })}>Couper 5 / 6 GHz 5 min</${Btn}>
        </div>
      </${Card}>

      ${mlo && html`<${NetworkCard} class="s6" title="Wi-Fi 7" icon="bolt" ssid=${mlo.id} pass=${mlo.security.passphrase} proto=${mlo.security.protocol}
        chips=${['MLO · multi-bandes', `${count(/MLO/)} appareil(s)`]} hidden=${mlo.hidden === 1}
        note="Réseau multi-liens réservé aux appareils Wi-Fi 7 : ils utilisent plusieurs bandes à la fois." card="mlo"
        onEdit=${() => editSimple('wireless/mlo', 'Wi-Fi 7', mlo, true)} />`}

      ${guest && html`<${NetworkCard} class=${mlo ? 's6' : 's12'} title="Wi-Fi invité" icon="link" ssid=${guest.id} pass=${guest.security.passphrase} proto=${guest.security.protocol}
        chips=${guest.enable ? [`${(s.guestHosts || []).filter((h) => h.active).length} invité(s)`, guestTimer() ? `coupure ${untilLabel(guestTimer().until)}` : 'sans limite de durée'] : ['désactivé']}
        toggle=${html`<${Btn} kind=${guest.enable ? 'soft' : 'go'} size="sm" icon=${guest.enable ? 'timer' : 'link'} onClick=${() => openSheet(GuestSheet, { enabled: guest.enable === 1 }, { title: 'Wi-Fi invité', sub: guest.id }).then((ok) => ok && after())}>${guest.enable ? 'Gérer' : 'Activer'}</${Btn}>`}
        note="Isolé de votre réseau : vos invités accèdent à Internet sans voir vos appareils. L’activer ou le couper redémarre le Wi-Fi (≈ 40 s)."
        dim=${guest.enable !== 1} card="guest"
        onEdit=${() => editSimple('wireless/guest', 'Wi-Fi invité', guest, false)} />`}

      <${Card} class="s12" title="Bandes radio" icon="activity" action=${html`<span class="note">débit en direct, hors Wi-Fi 7 (MLO)</span>`}>
        <div class="grid" style="gap:12px">
          ${BANDS.filter((b) => w.radio[b.k]).map((b) => {
            const r = w.radio[b.k], ssid = w.ssid[b.k];
            const n = b.k === '24' ? count(/Wifi 2|2\.4|Wifi 24/) : count(new RegExp('Wifi ' + b.k + '(?!\\d)'));
            return html`<div class="tile s4" style="padding:16px">
              <div class="hstack"><b style="font-size:15px">${b.l}</b><span class="spacer"></span><${Chip} tone=${r.enable && r.state ? 'ok' : 'off'} dot=${true}>${r.enable && r.state ? 'Active' : 'Arrêtée'}</${Chip}></div>
              <div class="hstack" style="align-items:flex-end;justify-content:space-between;margin:10px 0 6px">
                <div><div class="stat sm"><span class="v num">${kbps(s.bands[b.k].down + s.bands[b.k].up)}</span></div><div class="note">${n} appareil(s)</div></div>
                <${Sparkline} data=${s.series['b' + b.k].map((p) => p.v)} color="var(--brand)" width=${120} height=${40} />
              </div>
              <${KV} rows=${[['Canal', `${r.current_channel}${r.channel === 0 ? ' (auto)' : ''}`], ['Largeur', `${r.current_bandwidth} MHz${r.htbw === 0 ? ' (auto)' : ''}`], ['Norme', (w.standard?.[b.k]?.[0]?.value) || r.standard], ['Sécurité', PROTO[ssid?.security?.protocol] || ssid?.security?.protocol]]} />
              <button class="btn btn-ghost btn-sm btn-block" style="margin-top:12px" onClick=${() => openSheet(BandSheet, { band: b, w }, { title: 'Wi-Fi ' + b.l })}>Réglages avancés</button>
            </div>`;
          })}
        </div>
      </${Card}>

      <${AclCard} class="s6" />
      <${NeighborCard} class="s6" bands=${BANDS.filter((b) => w.radio[b.k])} />
    </div>`;
}

function NetworkCard({ class: cls, title, icon, ssid, pass, proto, chips = [], onEdit, toggle, note, dim, hidden, card }) {
  const qr = wifiQrString({ ssid, passphrase: pass, security: proto });
  return html`<${Card} class=${cls} title=${title} icon=${icon} action=${toggle || html`<button class="link" onClick=${onEdit}>Modifier</button>`}>
    <div class="hstack" style="align-items:flex-start;gap:20px;flex-wrap:wrap">
      <div class="grow" style="min-width:220px">
        <div class="note">Nom du réseau${hidden ? ' · masqué' : ''}</div>
        <div style="font-size:22px;font-weight:600;letter-spacing:-.01em;overflow-wrap:anywhere;margin:2px 0 12px">${ssid}</div>
        <div class="note">Mot de passe · ${PROTO[proto] || proto}</div>
        <${Secret} value=${pass} />
        <div class="hstack" style="margin-top:12px">${chips.map((c) => html`<${Chip}>${c}</${Chip}>`)}</div>
        ${note && html`<p class="note" style="margin-top:12px;max-width:52ch">${note}</p>`}
        ${toggle && html`<button class="btn btn-ghost btn-sm" style="margin-top:14px" onClick=${onEdit}><${Icon} name="edit" size=${16} />Modifier</button>`}
      </div>
      <div class=${'nc-qr' + (dim ? ' off' : '')}><${QR} text=${qr} label=${'QR code du réseau ' + ssid} /><span class="note">${dim ? 'Réseau désactivé' : 'Scannez pour vous connecter'}</span>
        ${card && html`<button class="btn btn-plain btn-xs" onClick=${() => go('carte', card)}><${Icon} name="print" size=${15} />Carte à imprimer</button>`}</div>
    </div>
  </${Card}>`;
}

async function editMain(w) {
  const unified = w.unified === 1, hasMlo = !!w.ssid.mlo;
  if (!unified) {
    const fields = [];
    for (const b of BANDS.filter((x) => w.ssid[x.k])) {
      fields.push({ key: 'ssid' + b.k, label: `Nom ${b.l}`, required: true, validate: ssidErr });
      fields.push({ key: 'pass' + b.k, label: `Mot de passe ${b.l}`, type: 'password', placeholder: 'Inchangé si vide', validate: passErr });
    }
    const initial = Object.fromEntries(BANDS.filter((x) => w.ssid[x.k]).map((b) => ['ssid' + b.k, w.ssid[b.k].id]));
    return openSheet(FormSheet, { fields, initial, intro: 'Les appareils connectés devront saisir le nouveau mot de passe.', onSubmit: async (v) => {
      await act(async () => { for (const b of BANDS.filter((x) => w.ssid[x.k])) { const body = { ssid: v['ssid' + b.k].trim() }; if (v['pass' + b.k]) body.passphrase = v['pass' + b.k]; await api.put('wireless/' + b.k, body); } }, { ok: 'Wi-Fi mis à jour' });
      after();
    } }, { title: 'Réseau principal' });
  }
  return openSheet(FormSheet, {
    intro: 'Tous les appareils sans fil seront déconnectés et devront se reconnecter avec les nouveaux identifiants.',
    fields: [
      { key: 'ssid', label: 'Nom du réseau', required: true, validate: ssidErr },
      { key: 'passphrase', label: 'Nouveau mot de passe', type: 'password', placeholder: 'Inchangé si vide', validate: passErr, help: '8 à 63 caractères. Une phrase longue est plus sûre qu’un mot compliqué.' },
      hasMlo && { key: 'mlo', label: 'Appliquer aussi au Wi-Fi 7', type: 'toggle', default: 1, help: `Le réseau Wi-Fi 7 s’appellera « <nom>-Plus », comme le fait la Bbox.` },
    ].filter(Boolean),
    initial: { ssid: w.ssid['24'].id },
    onSubmit: async (v) => {
      if (!(await confirmDialog({ title: 'Changer les identifiants Wi-Fi ?', message: 'Les appareils connectés en Wi-Fi seront coupés, y compris celui-ci s’il est en Wi-Fi.', confirm: 'Appliquer', tone: 'warn' }))) throw new Error('cancel');
      const body = { ssid: v.ssid.trim() }; if (v.passphrase) body.passphrase = v.passphrase;
      await act(async () => { await api.put('wireless/24', body); if (hasMlo && v.mlo) await api.put('wireless/mlo', { ...body, ssid: body.ssid.slice(0, 27) + '-Plus' }); }, { ok: 'Wi-Fi mis à jour' });
      after();
    },
  }, { title: 'Réseau principal' });
}
function editSimple(path, title, ssid, canHide) {
  return openSheet(FormSheet, {
    fields: [
      { key: 'ssid', label: 'Nom du réseau', required: true, validate: ssidErr },
      { key: 'passphrase', label: 'Nouveau mot de passe', type: 'password', placeholder: 'Inchangé si vide', validate: passErr },
      canHide && { key: 'hidden', label: 'Masquer le nom du réseau', type: 'toggle', help: 'Le réseau n’apparaît plus dans les listes ; il faut saisir son nom pour s’y connecter.' },
    ].filter(Boolean),
    initial: { ssid: ssid.id, hidden: ssid.hidden },
    onSubmit: async (v) => {
      const body = { ssid: v.ssid.trim() }; if (v.passphrase) body.passphrase = v.passphrase; if (canHide) body.hidden = Number(v.hidden) ? 1 : 0;
      await act(() => api.put(path, body), { ok: title + ' mis à jour' });
      after();
    },
  }, { title });
}

// ───── Réglages avancés d'une bande ─────
function BandSheet({ band, w, close }) {
  const [caps, setCaps] = useState(band.k === '24' ? null : w.capabilities?.[band.k]);
  const r = w.radio[band.k], ssid = w.ssid[band.k];
  const [auto, setAuto] = useState(r.htbw === 0 && r.channel === 0 ? 'auto' : 'manual');
  const [bw, setBw] = useState(String(r.htbw || r.current_bandwidth || band.bw[band.bw.length - 1]));
  const [ch, setCh] = useState(String(r.channel || 0));
  const [sec, setSec] = useState(ssid.security.protocol);
  const [hidden, setHidden] = useState(ssid.hidden === 1);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (band.k === '24') load('wireless/24').then((d) => setCaps(d.wireless.capabilities['24'])).catch(() => setCaps([])); }, []);
  const chOpts = [{ v: '0', l: 'Automatique' }, ...((caps || []).filter((c) => band.k === '24' || (c.ht && c.ht[bw])).map((c) => ({ v: String(c.channel), l: band.k === '5' ? `${c.ht[bw]}${c[`cactime${bw === '20' ? '' : bw}`] > 0 ? ' · DFS ' + c[`cactime${bw === '20' ? '' : bw}`] + ' min' : ''}` : String(c.channel) })))];
  useEffect(() => { if (!chOpts.some((o) => o.v === ch)) setCh('0'); }, [bw, caps]);
  const secOpts = band.k === '6' ? [{ v: 'WPA3', l: 'WPA3 (obligatoire en 6 GHz)' }] : [{ v: 'WPA2-WPA3', l: 'WPA2/WPA3 · recommandé' }, { v: 'WPA3', l: 'WPA3 · le plus sûr' }, { v: 'WPA2', l: 'WPA2 · compatibilité' }];
  const save = async () => {
    setBusy(true);
    try {
      const body = { security: sec, encryption: 'AES', hidden: hidden ? 1 : 0, channel: auto === 'auto' ? 0 : Number(ch), htbw: auto === 'auto' ? 0 : Number(bw) };
      await act(() => api.put('wireless/' + band.k, body), { ok: `Wi-Fi ${band.l} mis à jour` });
      after(); close(true);
    } catch { /* toast */ } finally { setBusy(false); }
  };
  return html`<div class="sheet-b form">
      <div class="banner info" style="margin:0"><${Icon} name="info" size=${18} /><span>Actuellement : canal <b>${r.current_channel}</b>, <b>${r.current_bandwidth} MHz</b>. Les appareils sur cette bande seront brièvement déconnectés à l’enregistrement.</span></div>
      <${Field} label="Canal et largeur"><${Seg} block=${true} options=${[{ v: 'auto', l: 'Automatique' }, { v: 'manual', l: 'Manuel' }]} value=${auto} onChange=${setAuto} label="Mode" /></${Field}>
      ${auto === 'manual' && html`
        <${Field} label="Largeur de canal"><${Seg} block=${true} options=${band.bw.map((x) => ({ v: String(x), l: x + ' MHz' }))} value=${bw} onChange=${setBw} label="Largeur" /></${Field}>
        <${Field} label="Canal" help=${band.k === '5' ? 'Les canaux DFS imposent une écoute radar avant émission.' : ''}>${caps ? html`<${Select} value=${ch} onChange=${setCh} options=${chOpts} />` : html`<div class="skel" style="height:46px"></div>`}</${Field}>`}
      <${Field} label="Sécurité"><${Select} value=${sec} onChange=${setSec} options=${secOpts} /></${Field}>
      <div class="check-row" style="box-shadow:none;padding:0"><div class="grow"><div class="t">Masquer le nom du réseau</div><div class="s">Le réseau n’apparaît plus dans la liste des Wi-Fi disponibles</div></div><${Switch} checked=${hidden} onChange=${setHidden} label="Masquer" /></div>
    </div>
    <div class="sheet-f"><button class="btn btn-ghost" onClick=${() => close(false)}>Annuler</button><button class="btn btn-go" disabled=${busy} onClick=${save}>${busy && html`<span class="spin"></span>`}Enregistrer</button></div>`;
}

// ───── WPS ─────
function WpsSheet({ close }) {
  const [st, setSt] = useState({ state: 'Starting' });
  useEffect(() => {
    let alive = true, t;
    const poll = async () => { try { const d = await api.get('wireless/wps'); if (!alive) return; setSt(d.wps); if (/progress|running|start/i.test(d.wps.state) || d.wps.timeout > 0) t = setTimeout(poll, 1500); } catch { /* */ } };
    act(() => api.post('wireless/wps'), { silent: true }).then(() => { t = setTimeout(poll, 800); }).catch(() => close());
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const ok = /success/i.test(st.state), fail = /fail|error|timeout|overlap/i.test(st.state);
  return html`<div class="sheet-b" style="text-align:center;padding-top:20px">
      <div style="width:84px;height:84px;margin:0 auto 16px;border-radius:50%;display:grid;place-items:center;background:${ok ? 'var(--ok-soft)' : fail ? 'var(--danger-soft)' : 'var(--brand-soft)'};color:${ok ? 'var(--ok)' : fail ? 'var(--danger)' : 'var(--brand)'}">
        ${ok ? html`<${Icon} name="check" size=${36} />` : fail ? html`<${Icon} name="alert" size=${36} />` : html`<span class="pulse" style="width:16px;height:16px"></span>`}</div>
      <h3 style="font-size:19px">${ok ? 'Appareil connecté' : fail ? 'Appairage échoué' : 'Appairage en cours…'}</h3>
      <p class="note" style="font-size:14px;margin:8px auto 0;max-width:36ch">${ok ? 'L’appareil a rejoint votre Wi-Fi.' : fail ? 'Relancez l’appairage et appuyez sur le bouton WPS de l’appareil dans les 2 minutes.' : 'Appuyez maintenant sur le bouton WPS de l’appareil à connecter (2 minutes maximum).'}</p>
      ${st.timeout > 0 && !ok && html`<p class="note num" style="margin-top:12px">${st.timeout} s restantes</p>`}
    </div>
    <div class="sheet-f">${!ok && !fail && html`<${Btn} kind="ghost" onClick=${async () => { await api.del('wireless/wps').catch(() => {}); close(); }}>Arrêter</${Btn}>`}<button class="btn btn-go" onClick=${() => close()}>Fermer</button></div>`;
}

// ───── Coupure temporaire 5/6 GHz ─────
function DeactivationSheet({ close }) {
  const { data, reload } = useApi('wireless/deactivation', { poll: 2000 });
  const d = data?.wireless?.deactivation;
  const running = d && !/idle/i.test(d.status);
  return html`<div class="sheet-b form">
      <p style="color:var(--ink-2)">Coupe les bandes 5 et 6 GHz pendant ${Math.round((d?.duration || 300) / 60)} minutes pour forcer les appareils récalcitrants à se connecter en 2,4 GHz (utile pour installer un objet connecté). Elles se rallument seules.</p>
      ${running ? html`<div class="banner"><${Icon} name="clock" size=${18} /><span>Coupure en cours · <b class="num">${Math.floor(d.timeout / 60)}:${String(d.timeout % 60).padStart(2, '0')}</b> restantes</span></div>` : html`<div class="banner info"><${Icon} name="info" size=${18} /><span>Les appareils en 5 / 6 GHz seront déconnectés le temps de la coupure.</span></div>`}
    </div>
    <div class="sheet-f">${running ? html`<${Btn} kind="go" onClick=${() => act(() => api.put('wireless/deactivation', { duration: 0 }), { ok: 'Bandes 5 / 6 GHz rallumées' }).then(reload)}>Rallumer maintenant</${Btn}>`
      : html`<button class="btn btn-ghost" onClick=${() => close()}>Annuler</button><${Btn} kind="go" onClick=${() => act(() => api.put('wireless/deactivation'), { ok: 'Coupure lancée' }).then(reload)}>Lancer la coupure</${Btn}>`}</div>`;
}

// ───── Filtrage MAC ─────
function AclCard({ class: cls }) {
  const { data, reload } = useApi(['wireless/acl', 'hosts/me']);
  const acl = data[0]?.acl, me = data[1]?.hosts || data[1]?.host || data[1];
  const myMac = (me?.macaddress || me?.list?.[0]?.macaddress || '').toLowerCase();
  const rules = acl?.rules || [];
  const meAllowed = rules.some((r) => (r.macaddress || '').toLowerCase() === myMac);
  const add = () => openSheet(FormSheet, {
    intro: 'Seuls les appareils de cette liste pourront se connecter au Wi-Fi quand le filtrage est actif.',
    fields: [{ key: 'macaddress', label: 'Appareil', type: 'device', mode: 'mac', required: true, validate: (v) => (isMac(v) ? null : 'Adresse MAC invalide') }],
    onSubmit: async (v) => { await act(() => api.post('wireless/acl/rules', { macaddress: v.macaddress.toLowerCase(), enable: 1 }), { ok: 'Appareil autorisé' }); reload(); },
  }, { title: 'Autoriser un appareil' });
  return html`<${Card} class=${cls} title="Filtrage MAC" icon="lock" action=${acl && html`<${Toggle} value=${acl.enable === 1} label="Filtrage MAC"
      confirm=${(nv) => (nv ? (!rules.length ? { title: 'Liste vide', message: 'Ajoutez d’abord les appareils autorisés : avec une liste vide, plus aucun appareil ne pourrait se connecter en Wi-Fi.', confirm: 'Compris', tone: 'danger' } : myMac && !meAllowed ? { title: 'Cet appareil n’est pas autorisé', message: 'Activer le filtrage couperait l’appareil que vous utilisez. Ajoutez-le d’abord à la liste.', confirm: 'Compris', tone: 'danger' } : { title: 'Activer le filtrage MAC ?', message: `Seuls les ${rules.length} appareil(s) de la liste pourront se connecter au Wi-Fi.`, confirm: 'Activer', tone: 'warn' }) : null)}
      onChange=${async (nv) => { if (nv && (!rules.length || (myMac && !meAllowed))) throw new Error('blocked'); await act(() => api.put('wireless/acl', { enable: nv ? 1 : 0 }), { ok: nv ? 'Filtrage activé' : 'Filtrage désactivé' }); reload(); }} />`}>
    <p class="desc" style="margin-bottom:8px">N’autorise au Wi-Fi que les appareils choisis. Protection d’appoint : une adresse MAC peut être usurpée.</p>
    <div class="list">${rules.length ? rules.map((r) => html`<div class="row"><span class="mono grow">${r.macaddress}</span>${(r.macaddress || '').toLowerCase() === myMac && html`<${Chip} tone="brand">cet appareil</${Chip}>`}
      <button class="icon-btn" aria-label="Retirer" onClick=${async () => { if (await confirmDialog({ title: 'Retirer cette adresse ?', confirm: 'Retirer', tone: 'danger' })) { await act(() => api.del('wireless/acl/rules/' + r.id), { ok: 'Adresse retirée' }); reload(); } }}><${Icon} name="trash" size=${18} /></button></div>`)
      : html`<${Empty} icon="lock" title="Aucun appareil dans la liste" />`}</div>
    <button class="btn btn-ghost btn-sm" style="margin-top:8px" onClick=${add}><${Icon} name="plus" size=${16} />Ajouter un appareil</button>
  </${Card}>`;
}

// ───── Voisinage Wi-Fi ─────
function NeighborCard({ class: cls, bands }) {
  const [band, setBand] = useState(bands[1]?.k || bands[0].k);
  const [scanning, setScanning] = useState(false);
  const { data, reload } = useApi('wireless/' + band + '/neighborhood');
  const list = (data?.scan || []).slice().sort((a, b) => (Number(b.rssi) || -999) - (Number(a.rssi) || -999));
  const scan = async () => {
    setScanning(true);
    try { await act(() => api.put(`wireless/${band}/neighborhood`), { silent: true }); await new Promise((r) => setTimeout(r, 6000)); reload(); }
    catch { /* */ } finally { setScanning(false); }
  };
  return html`<${Card} class=${cls} title="Réseaux voisins" icon="globe" action=${html`<${Btn} kind="soft" size="sm" icon="refresh" onClick=${scan} disabled=${scanning}>${scanning ? 'Analyse…' : 'Analyser'}</${Btn}>`}>
    <${Seg} options=${bands.map((b) => ({ v: b.k, l: b.l }))} value=${band} onChange=${setBand} label="Bande" />
    <div class="list" style="margin-top:8px;max-height:320px;overflow:auto">${list.length ? list.map((n) => html`<div class="row" style="min-height:48px"><div class="grow"><div class="t ellipsis">${n.ssid || n.SSID || '(réseau masqué)'}</div><div class="s">canal ${n.channel ?? '—'}${n.bandwidth ? ' · ' + n.bandwidth + ' MHz' : ''}${n.security ? ' · ' + n.security : ''}</div></div><span class="num note">${n.rssi ?? n.signal ?? '—'} dBm</span></div>`)
      : html`<${Empty} icon="globe" title=${scanning ? 'Analyse en cours…' : 'Aucune analyse récente'}>${scanning ? 'La Bbox écoute les réseaux alentour.' : 'Lancez une analyse pour voir les réseaux voisins et choisir un canal moins encombré.'}</${Empty}>`}</div>
  </${Card}>`;
}
