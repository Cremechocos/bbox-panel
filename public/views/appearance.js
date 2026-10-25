// Apparence : Bbox Clair ou Noir Geist, en clair ou en sombre. Les aperçus sont l'application elle-même, en direct.
import { html, PageHead, Seg, Btn, useState, useEffect, useRef, useMobile } from '/lib/ui.js';
import { Icon } from '/lib/icons.js';
import { SKINS, useAppearance, setSkin, setThemePref } from '/lib/theme.js';

const MODES = [{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }];
const PAGES = [{ v: 'accueil', l: 'Accueil' }, { v: 'appareils', l: 'Appareils' }, { v: 'stats', l: 'Statistiques' }, { v: 'wifi', l: 'Wi-Fi' }];

function Preview({ skin, theme, path }) {
  const box = useRef(null);
  const [k, setK] = useState(0.4);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 1280));
    ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const src = `/?skin=${skin.id}&theme=${theme}&preview=1#/${path}`;
  const pk = Math.max(0.3, Math.min(0.44, k * 0.86));
  return html`<div class="prop-prev" ref=${box} style=${`height:${Math.round(800 * k)}px`} aria-hidden="true">
    <iframe src=${src} title=${'Aperçu ' + skin.name} loading="lazy" tabindex="-1" style=${`transform:scale(${k})`}></iframe>
    <div class="prop-phone" style=${`--k:${pk}`}><iframe src=${src} title=${'Aperçu mobile ' + skin.name} loading="lazy" tabindex="-1"></iframe></div>
  </div>`;
}

export default function Appearance() {
  const a = useAppearance();
  const mobile = useMobile();
  const [mode, setMode] = useState('def');
  const [path, setPath] = useState('accueil');
  return html`
    <${PageHead} kicker="Réglages" title="Apparence" sub="Deux apparences complètes, chacune en clair et en sombre. Les aperçus sont l’application elle-même, en direct."
      actions=${html`<${Seg} label="Mode clair ou sombre" value=${a.pref} onChange=${setThemePref} options=${MODES} />`} />
    ${!mobile && html`<div class="prop-tools" data-enter>
      <span class="note">Aperçus</span>
      <${Seg} size="sm" label="Thème des aperçus" value=${mode} onChange=${setMode} options=${[{ v: 'def', l: 'Par défaut' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }]} />
      <${Seg} size="sm" label="Page des aperçus" value=${path} onChange=${setPath} options=${PAGES} />
    </div>`}
    <div class="props">${SKINS.map((s) => {
      const on = a.skin === s.id;
      return html`<section class=${'prop card' + (on ? ' on' : '')} data-enter>
        ${mobile ? html`<button class=${'prop-swatch sw-' + s.id} onClick=${() => setSkin(s.id)} aria-label=${'Utiliser ' + s.name}>
            <span class="sw-side"></span><span class="sw-main"><i></i><i></i><i></i></span></button>`
          : html`<${Preview} key=${s.id + mode + path} skin=${s} theme=${mode === 'def' ? s.def : mode} path=${path} />`}
        <div class="prop-meta">
          <div class="grow">
            <div class="prop-name">${s.name}${on && html`<span class="chip brand">Utilisée</span>`}</div>
            <p class="note">${s.desc}</p>
            <p class="note">Police ${s.font} · ${s.layout === 'top' ? 'navigation en onglets' : 'barre latérale'} · ${s.def === 'light' ? 'clair' : 'sombre'} par défaut</p>
          </div>
          ${on ? html`<span class="prop-check"><${Icon} name="check" size=${16} />Sélectionnée</span>` : html`<${Btn} kind="go" size="sm" onClick=${() => setSkin(s.id)}>Utiliser</${Btn}>`}
        </div>
      </section>`;
    })}</div>
    <p class="note" style="margin-top:16px">Le choix est mémorisé sur cet appareil : le Mac et l’iPhone peuvent avoir chacun leur apparence. « Auto » suit le réglage clair/sombre du système.</p>`;
}
