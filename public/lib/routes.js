// Écrans de l'application (navigation latérale, onglets, palette de commandes).
export const ROUTES = [
  { id: 'accueil', label: 'Accueil', icon: 'home', mod: 'home', group: 'Vue d’ensemble' },
  { id: 'activite', label: 'Activité', icon: 'bell', mod: 'activity', group: 'Vue d’ensemble' },
  { id: 'stats', label: 'Statistiques', icon: 'chart', mod: 'stats', group: 'Vue d’ensemble' },
  { id: 'appareils', label: 'Appareils', icon: 'devices', mod: 'devices', group: 'Réseau' },
  { id: 'wifi', label: 'Wi-Fi', icon: 'wifi', mod: 'wifi', group: 'Réseau' },
  { id: 'controle', label: 'Pauses & contrôle', short: 'Pauses', icon: 'clock', mod: 'control', group: 'Réseau' },
  { id: 'reseau', label: 'Réseau local', icon: 'network', mod: 'network', group: 'Réseau' },
  { id: 'securite', label: 'Accès & sécurité', short: 'Sécurité', icon: 'shield', mod: 'security', group: 'Services' },
  { id: 'telephone', label: 'Téléphonie', icon: 'phone', mod: 'phone', group: 'Services' },
  { id: 'diagnostic', label: 'Diagnostic', icon: 'activity', mod: 'diag', group: 'Système' },
  { id: 'bbox', label: 'Ma Bbox', icon: 'box', mod: 'bbox', group: 'Système' },
];
export const EXTRA = [
  { id: 'apparence', label: 'Apparence', icon: 'palette', mod: 'appearance' },
  { id: 'plus', label: 'Plus', icon: 'more', mod: 'more' },
  { id: 'mural', label: 'Mode mural', icon: 'expand', mod: 'wall', bare: true },
  { id: 'carte', label: 'Carte Wi-Fi', icon: 'print', mod: 'card', bare: true },
];
export const routeOf = (id) => ROUTES.find((r) => r.id === id) || EXTRA.find((r) => r.id === id);
export const TABS = ['accueil', 'appareils', 'wifi', 'activite', 'plus'];
