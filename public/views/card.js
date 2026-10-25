// Carte Wi-Fi à imprimer (ou à montrer) : nom du réseau, mot de passe et QR code.
import { html, Seg, QR, useState, useEffect } from '/lib/ui.js';
import { useLive } from '/lib/live.js';
import { Icon, Bytel } from '/lib/icons.js';
import { wifiQrString } from '/lib/format.js';
import { go } from '/lib/router.js';

export default function WifiCard({ route }) {
  const s = useLive();
  const [net, setNet] = useState(route.arg === 'guest' ? 'guest' : route.arg === 'mlo' ? 'mlo' : 'main');
  useEffect(() => { document.title = 'Carte Wi-Fi · Ma Bbox'; }, []);
  const w = s.wireless?.wireless || {};
  const src = net === 'guest' ? w.ssid?.guest : net === 'mlo' ? w.ssid?.mlo : w.ssid?.['24'];
  const ssid = src?.id || '…';
  const pass = src?.security?.passphrase || '';
  const security = src?.security?.protocol || 'WPA2';
  const opts = [{ v: 'main', l: 'Principal' }, w.ssid?.mlo && { v: 'mlo', l: 'Wi-Fi 7' }, { v: 'guest', l: 'Invité' }].filter(Boolean);
  const guestOff = net === 'guest' && w.ssid?.guest?.enable !== 1;
  return html`<main class="print-page">
    <div class="print-tools"><${Seg} options=${opts} value=${net} onChange=${setNet} label="Réseau" /></div>
    ${guestOff && html`<div class="banner" style="max-width:420px;margin:0"><${Icon} name="info" size=${18} /><span>Le Wi-Fi invité est actuellement désactivé : pensez à l’activer avant de donner la carte.</span></div>`}
    <article class="print-card">
      <${Bytel} />
      <h1>Wi-Fi</h1>
      ${s.wireless ? html`<${QR} text=${wifiQrString({ ssid, passphrase: pass, security })} label=${'QR code du réseau ' + ssid} cell=${6} />` : html`<div class="skel" style="width:220px;height:220px"></div>`}
      <dl><div><dt>Réseau</dt><dd>${ssid}</dd></div><div><dt>Mot de passe</dt><dd>${pass || '—'}</dd></div></dl>
      <p class="foot">Scannez le QR code avec l’appareil photo pour vous connecter.</p>
    </article>
    <div class="print-tools">
      <button class="btn btn-go" onClick=${() => window.print()}><${Icon} name="print" size=${18} />Imprimer</button>
      <button class="btn btn-ghost" onClick=${() => (history.length > 1 ? history.back() : go('wifi'))}>Retour</button>
    </div>
  </main>`;
}
