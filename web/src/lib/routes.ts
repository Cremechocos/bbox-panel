// Écrans de l'application (navigation latérale, onglets, palette de commandes).
export type RouteDef = { id: string; label: string; short?: string; icon: string; group?: string; bare?: boolean };
export const ROUTES: RouteDef[] = [
  { id: 'accueil', label: 'Accueil', icon: 'home', group: 'Vue d’ensemble' },
  { id: 'activite', label: 'Activité', icon: 'bell', group: 'Vue d’ensemble' },
  { id: 'stats', label: 'Statistiques', icon: 'chart', group: 'Vue d’ensemble' },
  { id: 'appareils', label: 'Appareils', icon: 'devices', group: 'Réseau' },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', group: 'Réseau' },
  { id: 'controle', label: 'Pauses & contrôle', short: 'Pauses', icon: 'clock', group: 'Réseau' },
  { id: 'reseau', label: 'Réseau local', icon: 'network', group: 'Réseau' },
  { id: 'securite', label: 'Accès & sécurité', short: 'Sécurité', icon: 'shield', group: 'Services' },
  { id: 'telephone', label: 'Téléphonie', icon: 'phone', group: 'Services' },
  { id: 'diagnostic', label: 'Diagnostic', icon: 'activity', group: 'Système' },
  { id: 'bbox', label: 'Ma Bbox', icon: 'box', group: 'Système' },
];
export const EXTRA: RouteDef[] = [
  { id: 'apparence', label: 'Apparence', icon: 'palette' },
  { id: 'plus', label: 'Plus', icon: 'more' },
  { id: 'mural', label: 'Mode mural', icon: 'expand', bare: true },
  { id: 'carte', label: 'Carte Wi-Fi', icon: 'print', bare: true },
];
export const routeOf = (id: string) => ROUTES.find((r) => r.id === id) || EXTRA.find((r) => r.id === id);
export const TABS = ['accueil', 'appareils', 'wifi', 'activite', 'plus'];
export const GROUPS = [...new Set(ROUTES.map((r) => r.group!))];
