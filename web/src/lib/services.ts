// Latence par service (YouTube, Netflix…) : identité visuelle des services, statistiques calculées à partir
// des séries temps réel « p:<id> », service affiché dans les graphiques, réglages enregistrés sur le serveur.
// La mesure elle-même est faite par le serveur du panel (voir server/probes.mjs).
import { useSyncExternalStore } from 'react';
import {
  siCloudflare, siGoogle, siQuad9, siYoutube, siNetflix, siApple, siFacebook, siInstagram, siWhatsapp, siDiscord, siTwitch,
  siSteam, siSpotify, siDeezer, siTiktok, siX, siReddit, siWikipedia, siPlaystation, siRiotgames, siEpicgames, siClaude, siGithub,
} from 'simple-icons';
import { panel, errMsg } from './api';
import { toast } from './data';
import type { LiveState, Pt } from './live';

export type Probe = { id: string; name: string; host: string; port: number; group: string; custom?: boolean; ip: string | null; err: string | null; desc?: string };
export type ProbeConf = { every: number; on: string[]; custom: { id: string; name: string; host: string; port: number }[]; fromBbox: boolean };

// ═════════════ Identité visuelle ═════════════
// glyph : tracé Simple Icons (24×24) ; mark : dessin maison quand la marque n'est pas dans Simple Icons
export type Brand = { path?: string; mark?: 'microsoft' | 'bytel' | 'amazon' | 'chatgpt'; color: string };
export const BRANDS: Record<string, Brand> = {
  bouygues: { mark: 'bytel', color: '#00a5dc' },
  cloudflare: { path: siCloudflare.path, color: '#F38020' },
  'google-dns': { path: siGoogle.path, color: '#4285F4' },
  quad9: { path: siQuad9.path, color: '#DC205E' },
  google: { path: siGoogle.path, color: '#4285F4' },
  amazon: { mark: 'amazon', color: '#FF9900' },
  apple: { path: siApple.path, color: '#000000' },
  microsoft: { mark: 'microsoft', color: '#00A4EF' },
  wikipedia: { path: siWikipedia.path, color: '#000000' },
  youtube: { path: siYoutube.path, color: '#FF0000' },
  netflix: { path: siNetflix.path, color: '#E50914' },
  twitch: { path: siTwitch.path, color: '#9146FF' },
  spotify: { path: siSpotify.path, color: '#1ED760' },
  deezer: { path: siDeezer.path, color: '#A238FF' },
  facebook: { path: siFacebook.path, color: '#0866FF' },
  instagram: { path: siInstagram.path, color: '#FF0069' },
  whatsapp: { path: siWhatsapp.path, color: '#25D366' },
  tiktok: { path: siTiktok.path, color: '#000000' },
  x: { path: siX.path, color: '#000000' },
  reddit: { path: siReddit.path, color: '#FF4500' },
  discord: { path: siDiscord.path, color: '#5865F2' },
  steam: { path: siSteam.path, color: '#000000' },
  playstation: { path: siPlaystation.path, color: '#0070D1' },
  riot: { path: siRiotgames.path, color: '#EB0029' },
  epic: { path: siEpicgames.path, color: '#313131' },
  chatgpt: { mark: 'chatgpt', color: '#10A37F' },
  claude: { path: siClaude.path, color: '#D97757' },
  github: { path: siGithub.path, color: '#181717' },
  zoom: { color: '#0B5CFF' },
};
const HUES = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#ef4444', '#84cc16'];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7);
/** Couleur d'affichage : une marque noire ou presque prend la couleur du texte (lisible en clair comme en sombre) */
function shown(hex: string): string {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.22 ? 'var(--foreground)' : hex;
}
export function brandOf(id: string, name = ''): Brand & { fg: string; letter?: string } {
  const b = BRANDS[id];
  if (b) return { ...b, fg: shown(b.color), letter: (name.trim()[0] || '?').toUpperCase() };
  const color = HUES[Math.abs(hash(id + name)) % HUES.length];
  return { color, fg: color, letter: (name.trim()[0] || '?').toUpperCase() };
}
export const GROUPS: { id: string; label: string }[] = [
  { id: 'dns', label: 'Opérateur et DNS' }, { id: 'web', label: 'Web' }, { id: 'video', label: 'Vidéo et musique' },
  { id: 'social', label: 'Réseaux sociaux et messageries' }, { id: 'games', label: 'Jeux' }, { id: 'work', label: 'Travail et IA' },
  { id: 'custom', label: 'Vos services' },
];

// ═════════════ Qualité et statistiques ═════════════
export type Quality = 'good' | 'fair' | 'slow' | 'lost' | 'none';
export const qualityOf = (ms: number | null | undefined, stale = false): Quality =>
  stale || ms === undefined ? 'none' : ms == null ? 'lost' : ms <= 30 ? 'good' : ms <= 80 ? 'fair' : 'slow';
export const QUALITY: Record<Quality, { label: string; color: string }> = {
  good: { label: 'Rapide', color: 'var(--ok)' }, fair: { label: 'Correct', color: 'var(--warn)' },
  slow: { label: 'Lent', color: 'var(--danger)' }, lost: { label: 'Sans réponse', color: 'var(--danger)' },
  none: { label: 'En attente', color: 'var(--faint)' },
};
const EMPTY: Pt[] = [];
/** Série temps réel d'un service (le même tableau que le flux : les graphiques le lisent à chaque image) */
export function seriesOf(s: LiveState, id: string): Pt[] {
  if (id === 'internet') return s.series.latency;
  return s.series['p:' + id] || (s.series['p:' + id] = []);
}
export type ProbeStats = { last: number | null | undefined; avg: number | null; med: number | null; min: number | null; jitter: number; loss: number; stale: boolean };
/** Médiane : insensible aux pics isolés (Wi-Fi, Bbox occupée), contrairement à la moyenne */
export function median(a: number[]): number | null {
  if (!a.length) return null;
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
/** Médiane sur la dernière minute d'une série quelconque (ex. « lan » : trajet jusqu'à la Bbox) */
export const minuteMedian = (pts: Pt[] = EMPTY) => { const t = pts.length ? pts[pts.length - 1].t : 0; return median(pts.filter((p) => p.t >= t - 60000).map((p) => p.v).filter((v): v is number => v != null)); };
/** Dernière mesure, moyenne, médiane et minimum sur la dernière minute, gigue, perte sur les 30 dernières mesures */
export function statsOf(pts: Pt[] = EMPTY, every = 5000, now = Date.now()): ProbeStats {
  const n = pts.length;
  if (!n) return { last: undefined, avg: null, med: null, min: null, jitter: 0, loss: 0, stale: true };
  const lastPt = pts[n - 1];
  const stale = now - lastPt.t > Math.max(every * 3, 12000);
  const minute = pts.filter((p) => p.t >= lastPt.t - 60000).map((p) => p.v).filter((v): v is number => v != null);
  const recent = pts.slice(-30);
  const vals = recent.map((p) => p.v).filter((v): v is number => v != null);
  let j = 0;
  for (let i = 1; i < vals.length; i++) j += Math.abs(vals[i] - vals[i - 1]);
  return {
    last: lastPt.v, stale,
    avg: minute.length ? minute.reduce((a, b) => a + b, 0) / minute.length : null,
    med: median(minute),
    min: minute.length ? Math.min(...minute) : null,
    jitter: vals.length > 1 ? j / (vals.length - 1) : 0,
    loss: Math.round((recent.filter((p) => p.v == null).length / recent.length) * 100),
  };
}
export const fmtMs = (v: number) => (v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
export const everyLabel = (ms: number) => (ms >= 60000 ? 'chaque minute' : `toutes les ${Math.round(ms / 1000)} s`);

/** Services mesurés (dans l'ordre choisi) */
export const probesOf = (s: LiveState): Probe[] => s.probes?.list || [];
export const confOf = (s: LiveState): ProbeConf => ({ every: s.probes?.every || 5000, on: s.probes?.on || [], custom: s.probes?.custom || [], fromBbox: s.probes?.fromBbox !== false });
/** Les valeurs sont-elles ramenées à la Bbox (trajet serveur du panel → Bbox retiré) ? */
export const isFromBbox = (s: LiveState) => s.probes?.fromBbox !== false;
/** Libellé, hôte et cadence d'une cible de graphique (« internet » = meilleure des deux mesures principales) */
export function targetInfo(s: LiveState, id: string): { id: string; name: string; host: string; every: number; probe?: Probe } {
  const p = probesOf(s).find((x) => x.id === id);
  if (!p || id === 'internet') return { id: 'internet', name: 'Internet', host: '1.1.1.1 et 8.8.8.8, meilleure des deux', every: 2000 };
  const shared = id === 'cloudflare' || id === 'google-dns';
  return { id, name: p.name, host: p.host + (p.ip && p.ip !== p.host ? ' · ' + p.ip : '') + (p.port !== 443 ? ` (port ${p.port})` : ''), every: shared ? 2000 : s.probes?.every || 5000, probe: p };
}

// ═════════════ Service affiché dans les graphiques (mémorisé sur l'appareil) ═════════════
let target = (() => { try { return localStorage.getItem('lat.target') || 'internet'; } catch { return 'internet'; } })();
const subs = new Set<() => void>();
export const useLatTarget = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => target);
export function setLatTarget(id: string) {
  target = id;
  try { localStorage.setItem('lat.target', id); } catch { /* navigation privée */ }
  subs.forEach((f) => f());
}

// Graphique de l'accueil (débit ou latence) : un clic sur une tuile de service passe en latence
let chart: 'wan' | 'lat' | null = (() => { try { return (localStorage.getItem('home.chart') as 'wan' | 'lat') || null; } catch { return null; } })();
const chartSubs = new Set<() => void>();
export const useHomeChart = () => useSyncExternalStore((f) => { chartSubs.add(f); return () => { chartSubs.delete(f); }; }, () => chart);
export function setHomeChart(v: 'wan' | 'lat') {
  if (chart === v) return;
  chart = v;
  try { localStorage.setItem('home.chart', v); } catch { /* navigation privée */ }
  chartSubs.forEach((f) => f());
}

// ═════════════ Réglages (partagés : c'est le serveur qui mesure) ═════════════
export async function saveProbes(s: LiveState, next: Partial<ProbeConf>) {
  const probes = { ...confOf(s), ...next };
  try { await panel.savePrefs({ probes }); }
  catch (e) { toast(errMsg(e), 'err'); throw e; }
}
