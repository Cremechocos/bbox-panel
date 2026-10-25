// Apparences (« skins ») et mode clair/sombre. L'état initial est posé par le script de index.html.
import { useSyncExternalStore } from 'react';

export type SkinId = 'clair' | 'geist';
export type ThemePref = 'auto' | 'light' | 'dark';
export const SKINS = [
  { id: 'clair' as SkinId, name: 'Bbox Clair', desc: 'Lumineux et doux, aux couleurs de Bouygues Telecom.', layout: 'side' as const, def: 'light' as const, font: 'Bouygues Read' },
  { id: 'geist' as SkinId, name: 'Noir Geist', desc: 'Noir profond, minimal et dense : des listes et des chiffres, sans cartes.', layout: 'ligne' as const, def: 'dark' as const, font: 'Geist' },
];
const PAPER: Record<SkinId, [string, string]> = { clair: ['#eef2f5', '#0b1620'], geist: ['#ffffff', '#08090a'] };
const root = document.documentElement;
const preview = () => root.dataset.preview === '1';
const ls = {
  get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k: string, v: string) => { if (preview()) return; try { localStorage.setItem(k, v); } catch { /* */ } },
};
const mq = window.matchMedia('(prefers-color-scheme: dark)');

export const skinOf = (id?: string) => SKINS.find((s) => s.id === id) || SKINS[0];
export const getSkin = (): SkinId => skinOf(root.dataset.skin).id;
export const getThemePref = (skin: SkinId = getSkin()): ThemePref => (new URLSearchParams(location.search).get('theme') as ThemePref) || (ls.get('theme.' + skin) as ThemePref) || skinOf(skin).def;
export const isDark = () => root.dataset.theme === 'dark';

const subs = new Set<() => void>();
let snap = { skin: getSkin(), theme: (root.dataset.theme as 'light' | 'dark') || 'light', pref: getThemePref() };
function apply(skin: SkinId, pref: ThemePref) {
  const dark = pref === 'dark' || (pref === 'auto' && mq.matches);
  // transition douce des couleurs pendant le changement de thème uniquement
  root.classList.add('theme-switching');
  root.dataset.skin = skin;
  root.dataset.theme = dark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', PAPER[skin][dark ? 1 : 0]);
  snap = { skin, theme: dark ? 'dark' : 'light', pref };
  subs.forEach((f) => f());
  window.setTimeout(() => root.classList.remove('theme-switching'), 320);
}
export function setSkin(id: SkinId) { const s = skinOf(id).id; ls.set('skin', s); apply(s, getThemePref(s)); }
export function setThemePref(pref: ThemePref) { const s = getSkin(); ls.set('theme.' + s, pref); apply(s, pref); }
export function toggleTheme() { setThemePref(isDark() ? 'light' : 'dark'); }
mq.addEventListener?.('change', () => { if (getThemePref() === 'auto') apply(getSkin(), 'auto'); });

/** { skin, theme, pref, layout } — re-rend le composant quand l'apparence change */
export function useAppearance() {
  const s = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => snap);
  return { ...s, layout: skinOf(s.skin).layout };
}
