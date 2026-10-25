// Apparences (« skins ») et mode clair/sombre. L'état initial est posé par /boot.js.
import { useEffect, useState } from '/vendor/hooks.mjs';

export const SKINS = [
  { id: 'clair', name: 'Bbox Clair', desc: 'Lumineux et doux, aux couleurs de Bouygues Telecom.', layout: 'side', def: 'light', font: 'Bouygues Read' },
  { id: 'geist', name: 'Noir Geist', desc: 'Noir pur et typographie Geist, épuré comme Vercel.', layout: 'top', def: 'dark', font: 'Geist' },
];
const PAPER = { clair: ['#eef2f5', '#0b1620'], geist: ['#fafafa', '#000000'] };
const root = document.documentElement;
const preview = () => root.dataset.preview === '1';
const ls = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { if (preview()) return; try { localStorage.setItem(k, v); } catch { /* */ } } };
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export const skinOf = (id) => SKINS.find((s) => s.id === id) || SKINS[0];
export const getSkin = () => skinOf(root.dataset.skin).id;
export const getThemePref = (skin = getSkin()) => new URLSearchParams(location.search).get('theme') || ls.get('theme.' + skin) || skinOf(skin).def;
export const isDark = () => root.dataset.theme === 'dark';

function apply(skin, pref) {
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  root.dataset.skin = skin;
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[skin][dark ? 1 : 0]);
  window.dispatchEvent(new Event('appearance'));
  window.dispatchEvent(new Event('themechange'));
}
export function setSkin(id) { const s = skinOf(id).id; ls.set('skin', s); apply(s, getThemePref(s)); }
export function setThemePref(pref) { const s = getSkin(); ls.set('theme.' + s, pref); apply(s, pref); }
export function toggleTheme() { setThemePref(isDark() ? 'light' : 'dark'); }
mq.addEventListener?.('change', () => { if (getThemePref() === 'auto') apply(getSkin(), 'auto'); });

/** { skin, theme, pref, layout } — re-rend le composant quand l'apparence change */
export function useAppearance() {
  const read = () => ({ skin: getSkin(), theme: root.dataset.theme, pref: getThemePref(), layout: skinOf(getSkin()).layout });
  const [a, setA] = useState(read);
  useEffect(() => { const f = () => setA(read()); window.addEventListener('appearance', f); return () => window.removeEventListener('appearance', f); }, []);
  return a;
}
