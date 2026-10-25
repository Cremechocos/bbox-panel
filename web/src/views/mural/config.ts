// Mode mural : configuration personnalisable, enregistrée sur CET appareil (un écran mural n'est pas
// configuré comme le Mac) — tuiles affichées, ordre, tailles, options de chaque tuile, affichage.
import { useSyncExternalStore } from 'react';

export type WidgetId = 'clock' | 'internet' | 'latency' | 'services' | 'traffic' | 'today' | 'devices' | 'activity' | 'wifi' | 'health' | 'favorites' | 'guest' | 'fiber';
/** Largeur sur 12 colonnes : ¼, ⅓, ½, ⅔, pleine largeur */
export type Size = 3 | 4 | 6 | 8 | 12;
export type Widget = { id: WidgetId; on: boolean; size: Size; tall: boolean; opts: Record<string, any> };
export type Accent = 'auto' | 'blue' | 'violet' | 'green' | 'amber' | 'rose' | 'mono';
export type WallCfg = {
  v: 1;
  widgets: Widget[];
  theme: 'app' | 'dark' | 'light';
  scale: number; // taille du texte (0,8 à 1,6)
  density: 'air' | 'compact';
  accent: Accent;
  header: { on: boolean; clock: boolean; title: string };
  dim: { on: boolean; from: string; to: string; level: number }; // atténuation la nuit
  shift: boolean; // anti-marquage (léger décalage régulier)
  hideAfter: number; // secondes avant de masquer les commandes (0 = jamais)
};

type Meta = { id: WidgetId; label: string; icon: string; desc: string; size: Size; tall?: boolean; opts: Record<string, any> };
export const WIDGETS: Meta[] = [
  { id: 'clock', label: 'Horloge', icon: 'clock', desc: 'Heure et date, chiffres ou aiguilles', size: 4, opts: { style: 'digital', seconds: false, date: true } },
  { id: 'internet', label: 'Internet', icon: 'globe', desc: 'État de la connexion, adresse, durée', size: 4, opts: { ip: true, uptime: true } },
  { id: 'latency', label: 'Latence', icon: 'activity', desc: 'Temps de réponse d’Internet ou d’un service, en direct', size: 6, opts: { chart: true, minutes: 5, target: 'internet' } },
  { id: 'services', label: 'Services', icon: 'globe', desc: 'Latence de YouTube, Netflix… avec leurs logos', size: 6, opts: { pick: [], spark: true, sort: 'order' } },
  { id: 'traffic', label: 'Débit', icon: 'chart', desc: 'Réception et envoi en direct', size: 6, opts: { chart: true, minutes: 30 } },
  { id: 'today', label: 'Aujourd’hui', icon: 'calendar', desc: 'Données échangées depuis minuit', size: 4, opts: { split: true } },
  { id: 'devices', label: 'Appareils', icon: 'devices', desc: 'Appareils connectés et les plus actifs', size: 4, opts: { list: 'top', max: 5 } },
  { id: 'activity', label: 'Activité', icon: 'bell', desc: 'Arrivées, départs, nouveaux appareils', size: 4, opts: { max: 5, kinds: 'presence' } },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', desc: 'Trafic et appareils par bande', size: 4, opts: { ssid: true } },
  { id: 'health', label: 'Santé de la Bbox', icon: 'cpu', desc: 'Processeur, température, mémoire', size: 4, opts: { style: 'gauges' } },
  { id: 'favorites', label: 'Favoris', icon: 'star', desc: 'Vos appareils épinglés et leur état', size: 4, opts: {} },
  { id: 'guest', label: 'Wi-Fi invité', icon: 'qr', desc: 'QR code pour rejoindre le réseau invité', size: 4, opts: { qr: true, pass: true } },
  { id: 'fiber', label: 'Fibre', icon: 'fiber', desc: 'Puissances optiques reçue et émise', size: 3, opts: {} },
];
export const metaOf = (id: WidgetId) => WIDGETS.find((w) => w.id === id)!;

const w = (id: WidgetId, on: boolean, size?: Size, tall = false, opts: Record<string, any> = {}): Widget => {
  const m = metaOf(id);
  return { id, on, size: size || m.size, tall, opts: { ...m.opts, ...opts } };
};
/** Complète une liste (tuiles absentes ajoutées, masquées, à la fin) */
const complete = (list: Widget[]): Widget[] => [...list, ...WIDGETS.filter((m) => !list.some((x) => x.id === m.id)).map((m) => w(m.id, false))];

export const PRESETS: { id: string; label: string; desc: string; widgets: () => Widget[] }[] = [
  { id: 'essentiel', label: 'Essentiel', desc: 'Heure, Internet, débit, appareils', widgets: () => complete([w('clock', true, 4), w('internet', true, 4), w('today', true, 4), w('latency', true, 6), w('traffic', true, 6), w('devices', true, 4), w('activity', true, 4), w('wifi', true, 4)]) },
  { id: 'complet', label: 'Complet', desc: 'Toutes les mesures', widgets: () => complete([w('clock', true, 3), w('internet', true, 3), w('today', true, 3), w('fiber', true, 3), w('latency', true, 6), w('traffic', true, 6), w('devices', true, 3), w('activity', true, 3), w('wifi', true, 3), w('health', true, 3)]) },
  { id: 'reseau', label: 'Réseau', desc: 'Pour surveiller la connexion', widgets: () => complete([w('latency', true, 8), w('internet', true, 4), w('services', true, 8), w('today', true, 4), w('traffic', true, 8), w('health', true, 4)]) },
  { id: 'salon', label: 'Salon', desc: 'Heure, Wi-Fi invité, présence', widgets: () => complete([w('clock', true, 8, true), w('guest', true, 4, true), w('internet', true, 4), w('favorites', true, 4), w('activity', true, 4)]) },
  { id: 'horloge', label: 'Horloge', desc: 'Une grande horloge, l’essentiel autour', widgets: () => complete([w('clock', true, 12, true, { seconds: true }), w('internet', true, 4), w('latency', true, 4, false, { chart: false }), w('devices', true, 4, false, { list: 'none' })]) },
];

export const DEFAULT: WallCfg = {
  v: 1,
  widgets: PRESETS[0].widgets(),
  theme: 'app', scale: 1, density: 'air', accent: 'auto',
  header: { on: true, clock: true, title: 'Ma Bbox' },
  dim: { on: false, from: '23:00', to: '07:00', level: 0.55 },
  shift: false, hideAfter: 4,
};

// ───────── Magasin (localStorage) ─────────
const KEY = 'wall.cfg';
const clampScale = (v: any) => Math.min(1.6, Math.max(0.8, Number(v) || 1));
function sanitize(raw: any): WallCfg {
  if (!raw || raw.v !== 1 || !Array.isArray(raw.widgets)) return DEFAULT;
  const seen = new Set<string>();
  const widgets: Widget[] = [];
  for (const x of raw.widgets) {
    const m = WIDGETS.find((k) => k.id === x?.id);
    if (!m || seen.has(m.id)) continue;
    seen.add(m.id);
    const size = ([3, 4, 6, 8, 12] as Size[]).includes(x.size) ? x.size : m.size;
    widgets.push({ id: m.id, on: !!x.on, size, tall: !!x.tall, opts: { ...m.opts, ...(x.opts || {}) } });
  }
  return {
    ...DEFAULT, ...raw,
    widgets: complete(widgets),
    scale: clampScale(raw.scale),
    header: { ...DEFAULT.header, ...(raw.header || {}) },
    dim: { ...DEFAULT.dim, ...(raw.dim || {}) },
  };
}
let cfg: WallCfg = (() => { try { return sanitize(JSON.parse(localStorage.getItem(KEY) || 'null')); } catch { return DEFAULT; } })();
const subs = new Set<() => void>();
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* stockage plein ou privé */ } subs.forEach((f) => f()); }
export const useWallCfg = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cfg);
export function setWall(patch: Partial<WallCfg> | ((c: WallCfg) => Partial<WallCfg>)) {
  cfg = { ...cfg, ...(typeof patch === 'function' ? patch(cfg) : patch) };
  save();
}
export function setWidget(id: WidgetId, patch: Partial<Omit<Widget, 'opts'>> & { opts?: Record<string, any> }) {
  setWall((c) => ({ widgets: c.widgets.map((x) => (x.id === id ? { ...x, ...patch, opts: { ...x.opts, ...(patch.opts || {}) } } : x)) }));
}
export const applyPreset = (id: string) => { const p = PRESETS.find((x) => x.id === id); if (p) setWall({ widgets: p.widgets() }); };
export const resetWall = () => { cfg = DEFAULT; save(); };
/** Le modèle qui correspond exactement à la disposition actuelle (pour le surligner) */
export function presetOf(c: WallCfg): string | null {
  const sig = (l: Widget[]) => JSON.stringify(l.filter((x) => x.on).map((x) => [x.id, x.size, x.tall]));
  const cur = sig(c.widgets);
  return PRESETS.find((p) => sig(p.widgets()) === cur)?.id || null;
}

/** Couleurs d'accent (graphiques, barres, jauges) — « auto » garde celles de l'apparence */
export const ACCENTS: { id: Accent; label: string; color: string }[] = [
  { id: 'auto', label: 'Apparence', color: 'var(--chart-1)' },
  { id: 'blue', label: 'Bleu', color: '#3b8cff' },
  { id: 'violet', label: 'Violet', color: '#9b6bff' },
  { id: 'green', label: 'Vert', color: '#22b07d' },
  { id: 'amber', label: 'Ambre', color: '#f0a020' },
  { id: 'rose', label: 'Rose', color: '#f0508a' },
  { id: 'mono', label: 'Monochrome', color: 'var(--foreground)' },
];
