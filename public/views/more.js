// « Plus » (mobile) : accès aux autres écrans, apparence, outils, installation sur iPhone, déconnexion.
import { html, PageHead, Card, Seg } from '/lib/ui.js';
import { Icon } from '/lib/icons.js';
import { ROUTES } from '/lib/routes.js';
import { useLiveValue } from '/lib/live.js';
import { useAppearance, setThemePref, skinOf } from '/lib/theme.js';
import { openNotifSettings } from '/lib/notify.js';

const DESC = {
  stats: 'Consommation, débit, latence, historique', controle: 'Plages horaires Internet, Wi-Fi et veille', reseau: 'DHCP, baux fixes, ports Ethernet, IPv6',
  securite: 'Ports, DMZ, UPnP, pare-feu, accès distant', telephone: 'Ligne, appels, ne pas déranger', diagnostic: 'Tests, fibre, sessions, journal', bbox: 'Matériel, écran, sauvegardes, redémarrage',
};
const TOOLS = [
  { href: '#/apparence', icon: 'palette', l: 'Apparence', s: 'Bbox Clair ou Noir Geist' },
  { href: '#/carte', icon: 'print', l: 'Carte Wi-Fi', s: 'QR code et mot de passe à imprimer' },
  { href: '#/mural', icon: 'expand', l: 'Mode écran mural', s: 'Vue plein écran en temps réel' },
];

export default function More({ ctx }) {
  const a = useAppearance();
  const alerts = useLiveValue((s) => s.summary?.alerts?.count || 0);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const items = ROUTES.filter((r) => !['accueil', 'appareils', 'wifi', 'activite'].includes(r.id));
  const row = (href, icon, l, s, extra) => html`<a class="row tap" href=${href}>
    <span class="avatar sm" style="background:var(--brand-soft);color:var(--brand-ink)"><${Icon} name=${icon} size=${18} /></span>
    <div class="grow"><div class="t">${l}</div><div class="s ellipsis">${s}</div></div>${extra}<${Icon} name="chevron" size=${18} class="chev" /></a>`;
  return html`
    <${PageHead} kicker="Ma Bbox" title="Plus" />
    <${Card} flush=${true}>${items.map((r) => row('#/' + r.id, r.icon, r.label, DESC[r.id] || '', r.id === 'diagnostic' && alerts > 0 && html`<span class="chip warn">${alerts}</span>`))}</${Card}>
    <div class="section-title">Outils</div>
    <${Card} flush=${true}>${TOOLS.map((t) => row(t.href, t.icon, t.l, t.href === '#/apparence' ? skinOf(a.skin).name : t.s))}
      <button class="row tap" style="width:100%;text-align:left" onClick=${openNotifSettings}>
        <span class="avatar sm" style="background:var(--brand-soft);color:var(--brand-ink)"><${Icon} name="bell" size=${18} /></span>
        <div class="grow"><div class="t">Notifications</div><div class="s ellipsis">Alertes en temps réel, son, système</div></div><${Icon} name="chevron" size=${18} class="chev" /></button>
    </${Card}>
    <div class="section-title">Mode</div>
    <${Card}>
      <${Seg} block=${true} options=${[{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }]} value=${a.pref} onChange=${setThemePref} label="Clair ou sombre" />
      <p class="note" style="margin-top:10px">Apparence actuelle : ${skinOf(a.skin).name}.</p>
    </${Card}>
    ${!standalone && html`<div class="section-title">Installer sur l’iPhone</div><${Card}>
      <ol style="margin:0;padding-left:20px;display:grid;gap:6px;color:var(--ink-2);font-size:14.5px">
        <li>Ouvrez ce panel dans <b>Safari</b>.</li>
        <li>Touchez <b>Partager</b> <span class="muted">(carré avec une flèche)</span>.</li>
        <li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
      </ol>
      <p class="note" style="margin-top:10px">L’app s’ouvre alors en plein écran, comme une application native.</p>
    </${Card}>`}
    <div style="height:20px"></div>
    <button class="btn btn-danger-ghost btn-block" onClick=${() => ctx.logout()}><${Icon} name="logout" size=${18} />Se déconnecter</button>
    <p class="note" style="text-align:center;margin-top:14px">Panel v2 · serveur local</p>`;
}
