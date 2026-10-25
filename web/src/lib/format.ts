// Formatage et utilitaires d'affichage.

// La Bbox renvoie l'UTF-8 doublement encodé (« bloquÃ©s ») : on répare récursivement.
export function fixText(s: any): any {
  if (typeof s !== 'string' || !/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s;
  try { return decodeURIComponent((window as any).escape(s)); } catch { return s; }
}
export function deepFix(o: any): any {
  if (typeof o === 'string') return fixText(o);
  if (Array.isArray(o)) return o.map(deepFix);
  if (o && typeof o === 'object') { const r: Record<string, any> = {}; for (const k in o) r[k] = deepFix(o[k]); return r; }
  return o;
}

const nf = (d = 0) => new Intl.NumberFormat('fr-FR', { maximumFractionDigits: d, minimumFractionDigits: d });

export function bytes(n: any): string {
  n = Number(n) || 0;
  const u = ['o', 'Ko', 'Mo', 'Go', 'To'];
  let i = 0;
  while (n >= 1000 && i < u.length - 1) { n /= 1000; i++; }
  return nf(n >= 100 || i === 0 ? 0 : 1).format(n) + '\u202f' + u[i];
}
// La Bbox exprime les débits en kbit/s.
export function kbps(n: any): string {
  n = Number(n) || 0;
  if (n >= 1_000_000) return nf(n >= 10_000_000 ? 0 : 1).format(n / 1_000_000) + '\u202fGb/s';
  if (n >= 1000) return nf(n >= 100_000 ? 0 : 1).format(n / 1000) + '\u202fMb/s';
  return nf(0).format(n) + '\u202fkb/s';
}
export function mbps(n: any): string { // Mbit/s (débits Wi-Fi des appareils)
  n = Number(n) || 0;
  if (n >= 1000) return nf(1).format(n / 1000) + '\u202fGb/s';
  return nf(0).format(n) + '\u202fMb/s';
}
export function duration(sec: any): string {
  sec = Math.max(0, Math.floor(Number(sec) || 0));
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  if (d) return `${d}\u202fj ${h}\u202fh`;
  if (h) return `${h}\u202fh ${String(m).padStart(2, '0')}`;
  if (m) return `${m}\u202fmin`;
  return `${sec}\u202fs`;
}
export function parseDate(s: any): Date | null {
  if (!s || s === '-1' || String(s).startsWith('1970')) return null;
  const d = new Date(String(s).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return isNaN(d.getTime()) ? null : d;
}
export function dateTime(s: any, opts: Intl.DateTimeFormatOptions = {}): string {
  const d = s instanceof Date ? s : parseDate(s);
  if (!d) return '—';
  return d.toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...opts });
}
export function relative(s: any): string {
  const d = s instanceof Date ? s : parseDate(s);
  if (!d) return '—';
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return 'à l’instant';
  if (diff < 3600) return `il y a ${Math.floor(diff / 60)}\u202fmin`;
  if (diff < 86400) return `il y a ${Math.floor(diff / 3600)}\u202fh`;
  if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)}\u202fj`;
  return dateTime(d, { year: 'numeric', hour: undefined, minute: undefined });
}
export const pct = (n: any) => nf(0).format(Number(n) || 0) + '\u202f%';
export const num = (n: any, d = 0) => nf(d).format(Number(n) || 0);
export const celsius = (milli: any) => nf(1).format((Number(milli) || 0) / 1000) + '\u202f°C';
export const dbm = (milli: any) => nf(1).format((Number(milli) || 0) / 1000) + '\u202fdBm';

export function bandLabel(link: any = '', band?: any): string {
  const l = String(link), b = String(band ?? '');
  if (/MLO/i.test(l)) return 'Wi-Fi 7';
  if (/Ethernet/i.test(l)) return 'Ethernet';
  if (/^6/.test(b) || /Wifi 6/i.test(l)) return '6 GHz';
  if (/^5/.test(b) || /Wifi 5/i.test(l)) return '5 GHz';
  if (/^2(\.4|4)?$|^2\.4/.test(b) || /2\.4|24/.test(l)) return '2,4 GHz';
  // la Bbox annonce parfois « Offline » pour un appareil Wi-Fi en veille encore associé
  if (/offline/i.test(l)) return 'Wi-Fi';
  return l || '—';
}
export function signal(rssi: any): { bars: number; label: string } {
  const r = Number(rssi);
  if (!r) return { bars: 0, label: '—' };
  if (r >= -55) return { bars: 4, label: 'Excellent' };
  if (r >= -65) return { bars: 3, label: 'Bon' };
  if (r >= -75) return { bars: 2, label: 'Moyen' };
  return { bars: 1, label: 'Faible' };
}

export type DeviceKind = 'phone' | 'watch' | 'laptop' | 'tablet' | 'tv' | 'speaker' | 'printer' | 'game' | 'home' | 'generic';
export function deviceKind(h: any): DeviceKind {
  const icon = String(h?.informations?.icon || '').toLowerCase();
  const name = String(h?.hostname || '').toLowerCase();
  if (/phone/.test(icon) || /iphone|galaxy|pixel|android|redmi|xiaomi/.test(name)) return 'phone';
  if (/watch/.test(icon) || /watch/.test(name)) return 'watch';
  if (/laptop|computer|desktop|server/.test(icon) || /^mac|macbook|desktop-|laptop|pc-|frbou/.test(name)) return 'laptop';
  if (/tablet/.test(icon) || /ipad|tab/.test(name)) return 'tablet';
  if (/stb|tv|streaming/.test(icon) || /bboxtv|tv|chromecast|appletv/.test(name)) return 'tv';
  if (/audio|voice|speaker/.test(icon) || /nest|echo|sonos|homepod/.test(name)) return 'speaker';
  if (/printer/.test(icon)) return 'printer';
  if (/game/.test(icon) || /playstation|xbox|switch/.test(name)) return 'game';
  if (/home|thermostat|light|outlet|sensor|camera/.test(icon)) return 'home';
  return 'generic';
}
// ═════════════ Noms des appareils ═════════════
/** La Bbox n'accepte comme nom d'appareil que [A-Za-z0-9_-], de 1 à 48 caractères (règle de l'interface
 *  officielle ; sinon « 400 hostname Invalid parameter »). Convertit un nom libre : accents retirés,
 *  espaces et autres signes remplacés par des tirets. « Télé du salon » → « Tele-du-salon ». */
export const BBOX_NAME_MAX = 48;
export function bboxHostname(v: string): string {
  return String(v || '')
    .replace(/œ/g, 'oe').replace(/Œ/g, 'OE').replace(/æ/g, 'ae').replace(/Æ/g, 'AE').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, BBOX_NAME_MAX).replace(/-+$/, '');
}
// Noms d'affichage choisis dans le panel (accents, espaces…), enregistrés côté serveur du panel.
// Un alias ne s'applique que tant que le nom côté Bbox est bien sa conversion : renommé ailleurs
// (application Bouygues, interface officielle), l'appareil reprend le nom de la Bbox.
const aliases = new Map<string, string>();
export function setAliases(names: Record<string, string> | undefined) {
  aliases.clear();
  for (const [k, v] of Object.entries(names || {})) if (v) aliases.set(k.toLowerCase(), v);
}
export function aliasOf(h: any): string | null {
  const a = h?.macaddress ? aliases.get(String(h.macaddress).toLowerCase()) : undefined;
  if (!a) return null;
  const slug = bboxHostname(a);
  return slug && [h?.hostname, h?.userfriendlyname].some((n) => fixText(n || '') === slug) ? a : null;
}
export function displayName(h: any): string {
  const alias = aliasOf(h);
  if (alias) return alias;
  const n = fixText(h?.userfriendlyname || h?.hostname || '');
  if (/^BboxTV/i.test(n)) return 'Décodeur Bbox TV';
  return n || (h?.informations?.manufacturer ? `Appareil ${h.informations.manufacturer}` : '') || h?.macaddress || 'Appareil';
}
// Meilleur RSSI connu (les appareils MLO remontent leurs valeurs par bande)
export function bestRssi(h: any): number {
  const vals = [h?.wireless?.rssi0, ...(h?.wirelessByBand || []).map((b: any) => b.rssi0)].map(Number).filter((v) => v < 0);
  return vals.length ? Math.max(...vals) : 0;
}

export function wifiQrString({ ssid, passphrase, security }: { ssid: string; passphrase?: string; security?: string }): string {
  const esc = (s: any) => String(s ?? '').replace(/([\\;,:"])/g, '\\$1');
  const t = !security || /none/i.test(security) ? 'nopass' : /WEP/i.test(security) ? 'WEP' : 'WPA';
  return `WIFI:T:${t};S:${esc(ssid)};${t === 'nopass' ? '' : `P:${esc(passphrase)};`};`;
}

export const DAYS = [
  { v: '1', s: 'L', l: 'Lundi' }, { v: '2', s: 'M', l: 'Mardi' }, { v: '3', s: 'M', l: 'Mercredi' },
  { v: '4', s: 'J', l: 'Jeudi' }, { v: '5', s: 'V', l: 'Vendredi' }, { v: '6', s: 'S', l: 'Samedi' }, { v: '0', s: 'D', l: 'Dimanche' },
];
export function daysLabel(occ: any): string {
  const set = new Set(String(occ ?? '').split(',').filter(Boolean));
  if (set.size === 7) return 'Tous les jours';
  if (['1', '2', '3', '4', '5'].every((d) => set.has(d)) && set.size === 5) return 'En semaine';
  if (set.size === 2 && set.has('6') && set.has('0')) return 'Le week-end';
  return DAYS.filter((d) => set.has(d.v)).map((d) => d.l.slice(0, 3)).join(', ') || '—';
}

export const isIPv4 = (s: any) => /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(String(s).trim());
export const isMac = (s: any) => /^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(String(s).trim());
export const isPortSpec = (s: any) => /^\d{1,5}([:-]\d{1,5})?(,\d{1,5}([:-]\d{1,5})?)*$/.test(String(s).trim());

// Événements du journal → libellés lisibles
const LOG_LABELS: Record<string, string> = {
  LOGIN_LOCAL: 'Connexion à l’interface', LOGIN_LOCAL_FAILED: 'Échec de connexion', LOGIN_LOCAL_LOCKED: 'Connexion verrouillée',
  LOGIN_REMOTE: 'Connexion à distance', LOGIN_REMOTE_FAILED: 'Échec de connexion à distance',
  DEVICE_UP: 'Appareil connecté', DEVICE_DOWN: 'Appareil déconnecté', DEVICE_NEW: 'Nouvel appareil',
  WAN_UP: 'Internet rétabli', WAN_DOWN: 'Internet coupé', VOIP_UP: 'Téléphonie active', VOIP_DOWN: 'Téléphonie coupée',
  WIFI_UP: 'Wi-Fi activé', WIFI_DOWN: 'Wi-Fi désactivé', REBOOT: 'Redémarrage', BOOT: 'Démarrage',
  USER_CHANGEPWD: 'Mot de passe modifié', DISPLAY_STATE: 'Écran', LAN_UP: 'Port LAN actif', LAN_DOWN: 'Port LAN inactif',
};
export function logLabel(code: any): string {
  if (LOG_LABELS[code]) return LOG_LABELS[code];
  return String(code || '').toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c: string) => c.toUpperCase());
}
export function logTone(code: string = ''): 'warn' | 'ok' | 'neutral' {
  if (/FAILED|LOCKED|DOWN|ERROR|ALARM/.test(code)) return 'warn';
  if (/UP|NEW|LOGIN/.test(code)) return 'ok';
  return 'neutral';
}

/** « 1 appareil », « 3 appareils » (0 et 1 au singulier, comme en français) */
export const plural = (n: number, one: string, many = one + 's') => `${n} ${Math.abs(n) >= 2 ? many : one}`;

/** Salutation selon l'heure */
export const hello = () => { const h = new Date().getHours(); return h < 5 ? 'Bonne nuit' : h < 18 ? 'Bonjour' : 'Bonsoir'; };
