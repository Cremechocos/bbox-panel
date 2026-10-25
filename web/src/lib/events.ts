// Libellés des événements (présence, alertes, actions) en français.
import { displayName } from './format';
import type { LiveEvent } from './live';
import { maskText } from './privacy';

export type EvInfo = { icon: string; tone: '' | 'ok' | 'warn' | 'danger'; title: string; sub?: string; cat: 'presence' | 'alert' | 'system' | 'action' };

const dur = (ms: any) => {
  const s = Math.round(Number(ms) / 1000);
  if (!(s > 0)) return '';
  if (s < 60) return `${s} s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min`;
  return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`;
};
const at = (iso: any) => { const d = new Date(iso); return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }); };

/** Nom affichable de l'appareil d'un événement (préférence au nom donné dans la Bbox) */
export function evName(e: LiveEvent, byMac?: Map<string, any>): string {
  const h = e.mac && byMac?.get(String(e.mac).toLowerCase());
  return (h && displayName(h)) || e.name || e.mac || 'Un appareil';
}
/** { icon, tone, title, sub, cat } — cat : presence | alert | system | action. Adresses publiques masquées si l'option est active. */
export function eventInfo(e: LiveEvent, byMac?: Map<string, any>): EvInfo {
  const i = rawInfo(e, byMac);
  return i.sub ? { ...i, sub: maskText(i.sub) } : i;
}
function rawInfo(e: LiveEvent, byMac?: Map<string, any>): EvInfo {
  const n = evName(e, byMac);
  switch (e.type) {
    case 'arrive': return { icon: 'arrowright', tone: 'ok', title: `${n} s’est connecté`, sub: e.ip, cat: 'presence' };
    case 'leave': return { icon: 'logout', tone: '', title: `${n} s’est déconnecté`, sub: e.ip, cat: 'presence' };
    case 'new_device': return { icon: 'userplus', tone: 'warn', title: `Nouvel appareil : ${n}`, sub: 'Première connexion à votre réseau', cat: 'alert' };
    case 'internet_down': return { icon: 'globe', tone: 'danger', title: 'Coupure d’Internet détectée', sub: 'Plus aucune réponse des serveurs de test', cat: 'alert' };
    case 'internet_up': return { icon: 'globe', tone: 'ok', title: 'Internet est revenu', sub: e.detail ? `Coupure de ${dur(e.detail)}` : '', cat: 'alert' };
    case 'wan_down': return { icon: 'fiber', tone: 'danger', title: 'Lien fibre coupé', cat: 'alert' };
    case 'wan_up': return { icon: 'fiber', tone: 'ok', title: 'Connexion Internet établie', sub: e.detail ? `Adresse ${e.detail}` : '', cat: 'system' };
    case 'temp_high': return { icon: 'thermo', tone: 'warn', title: 'Température élevée de la Bbox', sub: e.detail ? `${Math.round(Number(e.detail))} °C` : '', cat: 'alert' };
    case 'reboot': return { icon: 'power', tone: '', title: 'La Bbox a redémarré', cat: 'system' };
    case 'login': return { icon: 'lock', tone: '', title: 'Connexion à l’administration', sub: [e.name, e.ip].filter(Boolean).join(' · '), cat: 'system' };
    case 'login_failed': return { icon: 'lock', tone: 'warn', title: 'Mot de passe d’administration refusé', sub: [e.name, e.ip].filter(Boolean).join(' · '), cat: 'alert' };
    case 'login_locked': return { icon: 'lock', tone: 'danger', title: 'Administration verrouillée après trop d’essais', cat: 'alert' };
    case 'login_remote': return { icon: 'globe', tone: 'warn', title: 'Connexion à distance à l’administration', sub: e.ip, cat: 'alert' };
    case 'login_support': return { icon: 'user', tone: '', title: 'Connexion du service client Bouygues', cat: 'system' };
    case 'voip_up': return { icon: 'phone', tone: 'ok', title: 'Ligne téléphonique enregistrée', cat: 'system' };
    case 'voip_down': return { icon: 'phone', tone: 'warn', title: 'Ligne téléphonique indisponible', cat: 'alert' };
    case 'upgrade_start': return { icon: 'refresh', tone: '', title: 'Mise à jour de la Bbox en cours', cat: 'system' };
    case 'upgrade': return { icon: 'check', tone: 'ok', title: 'Mise à jour de la Bbox terminée', cat: 'system' };
    case 'wifi_restart': return { icon: 'wifi', tone: '', title: 'Redémarrage du Wi-Fi', cat: 'system' };
    case 'wifi_up': return { icon: 'wifi', tone: 'ok', title: 'Wi-Fi activé', cat: 'system' };
    case 'wifi_down': return { icon: 'wifi', tone: 'warn', title: 'Wi-Fi coupé', cat: 'system' };
    case 'port_up': return { icon: 'ethernet', tone: '', title: `Câble branché sur le port ${e.detail || ''}`.trim(), cat: 'system' };
    case 'port_down': return { icon: 'ethernet', tone: '', title: `Câble débranché du port ${e.detail || ''}`.trim(), cat: 'system' };
    case 'pause_start': return { icon: 'pause', tone: 'warn', title: `${n} mis en pause`, sub: e.detail ? `jusqu’à ${at(e.detail)}` : '', cat: 'action' };
    case 'pause_end': return { icon: 'play', tone: 'ok', title: `Fin de la pause de ${n}`, sub: e.detail === 'expired' ? 'Durée écoulée' : 'Reprise manuelle', cat: 'action' };
    case 'guest_on': return { icon: 'link', tone: '', title: 'Wi-Fi invité activé', sub: e.detail ? `jusqu’à ${at(e.detail)}` : '', cat: 'action' };
    case 'guest_off': return { icon: 'link', tone: '', title: 'Wi-Fi invité coupé', sub: e.detail === 'expired' ? 'Durée écoulée' : '', cat: 'action' };
    default: return { icon: 'info', tone: '', title: e.type, cat: 'system' };
  }
}
export const evTime = (t: number) => new Date(t).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
export function evDay(t: number): string {
  const d = new Date(t), now = new Date();
  const y = new Date(now); y.setDate(now.getDate() - 1);
  if (d.toDateString() === now.toDateString()) return 'Aujourd’hui';
  if (d.toDateString() === y.toDateString()) return 'Hier';
  const s = d.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return s.charAt(0).toUpperCase() + s.slice(1);
}
export function ago(t: number): string {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'à l’instant';
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.round(s / 3600)} h`;
  return evDay(t).toLowerCase() + ' à ' + evTime(t);
}
