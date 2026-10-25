// Confidentialité : flou des adresses IP publiques (WAN) et du numéro de la ligne fixe, pour les captures
// et le partage d'écran. Les adresses du réseau local (192.168.x.x…) restent toujours visibles.
// Réglages propres à chaque appareil (localStorage privacy.wan / privacy.phone), comme l'apparence.
import { useSyncExternalStore } from 'react';

export type PrivacyKey = 'wan' | 'phone';
const read = (k: PrivacyKey) => { try { return localStorage.getItem('privacy.' + k) === '1'; } catch { return false; } };
const flags: Record<PrivacyKey, boolean> = { wan: read('wan'), phone: read('phone') };
const subs = new Set<() => void>();
const subscribe = (f: () => void) => { subs.add(f); return () => { subs.delete(f); }; };
export const isHidden = (k: PrivacyKey) => flags[k];
export const useHidden = (k: PrivacyKey) => useSyncExternalStore(subscribe, () => flags[k]);
export function setHidden(k: PrivacyKey, v: boolean) {
  flags[k] = v;
  try { localStorage.setItem('privacy.' + k, v ? '1' : ''); } catch { /* navigation privée */ }
  subs.forEach((f) => f());
}
export const toggleHidden = (k: PrivacyKey) => setHidden(k, !flags[k]);
export const wanHidden = () => flags.wan;
export const useWanHidden = () => useHidden('wan');
export const setWanHidden = (v: boolean) => setHidden('wan', v);
export const toggleWanHidden = () => toggleHidden('wan');
export const usePhoneHidden = () => useHidden('phone');
export const setPhoneHidden = (v: boolean) => setHidden('phone', v);
export const togglePhoneHidden = () => toggleHidden('phone');

/** Adresse du réseau local, de lien local ou de bouclage : jamais floutée */
export function isPrivateIp(ip: string): boolean {
  const s = String(ip || '').trim().toLowerCase();
  if (s.includes(':')) return /^(fe[89ab][0-9a-f]:|f[cd][0-9a-f]{0,2}:|::1$|::$)/.test(s);
  const p = s.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n))) return false;
  return p[0] === 10 || p[0] === 127 || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 192 && p[1] === 168) || (p[0] === 169 && p[1] === 254);
}

/** Même silhouette que la valeur, sans un seul caractère réel (rien à « déflouter » sur une capture) */
export const shapeOf = (v: string) => String(v).replace(/[0-9a-f*]/gi, '0');
export const MASKED = '•••.•••.•••.•••';
export const PHONE_MASK = '•• •• •• •• ••';
const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
const IPV6 = /\b[23][0-9a-f]{3}:[0-9a-f:]*[0-9a-f:](?:\/\d{1,3})?/gi; // adresses et préfixes globaux
// numéros français, y compris la forme partiellement étoilée que renvoie la Bbox (+339****1234, 09 ** ** 12 34)
const PHONE = /(?<![\w*+])(?:(?:\+|00)33\s?|0)[1-9](?:[\s.-]?[\d*]{2}){4}(?![\w*])/g;

/** Masque les adresses publiques dans un texte libre (journal de la Bbox, notifications) */
export function maskIps(t: string): string {
  if (!flags.wan || !t) return t;
  return String(t).replace(IPV4, (ip) => (isPrivateIp(ip) ? ip : MASKED)).replace(IPV6, (m) => '••••:••••::' + (m.match(/\/\d+$/)?.[0] || ''));
}
/** Masque les numéros de téléphone dans un texte libre */
export function maskPhones(t: string): string {
  if (!flags.phone || !t) return t;
  return String(t).replace(PHONE, PHONE_MASK);
}
/** Tout ce qui doit être masqué dans un texte libre */
export const maskText = (t: string) => maskPhones(maskIps(t));
