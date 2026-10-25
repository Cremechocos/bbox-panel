// Latence vers des services Internet, mesurée par le serveur du panel (pas par la Bbox, dont l'API ne
// sait pinguer que les appareils du réseau local ou lancer son autotest horaire).
// Mesure : ouverture d'une connexion TCP (SYN → SYN-ACK, soit un aller-retour) puis fermeture immédiate.
// C'est l'équivalent d'un ping qui passe partout (beaucoup de serveurs ignorent l'ICMP), sans rien envoyer.
// Les noms d'hôte sont résolus par le DNS du système (donc celui de la Bbox), toutes les 10 minutes :
// on mesure le serveur le plus proche, celui que l'application ou le site utiliserait vraiment.
import net from 'node:net';
import dns from 'node:dns/promises';

export function tcpPing(host, port, timeout = 1500) {
  return new Promise((resolve) => {
    const t0 = process.hrtime.bigint();
    const s = net.connect({ host, port, family: 4 });
    let done = false;
    const end = (v) => { if (done) return; done = true; s.destroy(); resolve(v); };
    s.setTimeout(timeout, () => end(null));
    s.once('connect', () => end(Math.round(Number(process.hrtime.bigint() - t0) / 1e4) / 100));
    s.once('error', () => end(null));
  });
}

// host « @isp-dns » : premier serveur DNS annoncé par la Bbox (celui de l'opérateur), port 53
export const CATALOG = [
  { id: 'bouygues', name: 'Bouygues', host: '@isp-dns', port: 53, group: 'dns', desc: 'DNS de Bouygues Telecom, votre opérateur' },
  { id: 'cloudflare', name: 'Cloudflare', host: '1.1.1.1', port: 443, group: 'dns', desc: 'DNS 1.1.1.1' },
  { id: 'google-dns', name: 'Google DNS', host: '8.8.8.8', port: 443, group: 'dns', desc: 'DNS 8.8.8.8' },
  { id: 'quad9', name: 'Quad9', host: '9.9.9.9', port: 443, group: 'dns', desc: 'DNS 9.9.9.9' },
  { id: 'google', name: 'Google', host: 'www.google.com', group: 'web' },
  { id: 'amazon', name: 'Amazon', host: 'www.amazon.fr', group: 'web' },
  { id: 'apple', name: 'Apple', host: 'www.apple.com', group: 'web' },
  { id: 'microsoft', name: 'Microsoft', host: 'www.microsoft.com', group: 'web' },
  { id: 'wikipedia', name: 'Wikipédia', host: 'fr.wikipedia.org', group: 'web' },
  { id: 'youtube', name: 'YouTube', host: 'www.youtube.com', group: 'video' },
  { id: 'netflix', name: 'Netflix', host: 'www.netflix.com', group: 'video' },
  { id: 'twitch', name: 'Twitch', host: 'www.twitch.tv', group: 'video' },
  { id: 'spotify', name: 'Spotify', host: 'open.spotify.com', group: 'video' },
  { id: 'deezer', name: 'Deezer', host: 'www.deezer.com', group: 'video' },
  { id: 'facebook', name: 'Facebook', host: 'www.facebook.com', group: 'social' },
  { id: 'instagram', name: 'Instagram', host: 'www.instagram.com', group: 'social' },
  { id: 'whatsapp', name: 'WhatsApp', host: 'web.whatsapp.com', group: 'social' },
  { id: 'tiktok', name: 'TikTok', host: 'www.tiktok.com', group: 'social' },
  { id: 'x', name: 'X', host: 'x.com', group: 'social' },
  { id: 'reddit', name: 'Reddit', host: 'www.reddit.com', group: 'social' },
  { id: 'discord', name: 'Discord', host: 'discord.com', group: 'games' },
  { id: 'steam', name: 'Steam', host: 'store.steampowered.com', group: 'games' },
  { id: 'playstation', name: 'PlayStation', host: 'www.playstation.com', group: 'games' },
  { id: 'riot', name: 'Riot Games', host: 'www.riotgames.com', group: 'games' },
  { id: 'epic', name: 'Epic Games', host: 'store.epicgames.com', group: 'games' },
  { id: 'chatgpt', name: 'ChatGPT', host: 'chatgpt.com', group: 'work' },
  { id: 'claude', name: 'Claude', host: 'claude.ai', group: 'work' },
  { id: 'github', name: 'GitHub', host: 'github.com', group: 'work' },
  { id: 'zoom', name: 'Zoom', host: 'zoom.us', group: 'work' },
];
export const DEFAULT_PROBES = {
  on: ['bouygues', 'cloudflare', 'google', 'youtube', 'netflix', 'amazon', 'apple', 'microsoft', 'whatsapp', 'discord', 'steam', 'chatgpt'],
  custom: [],
  every: 5000,
  // latence « depuis la Bbox » : on retire de chaque mesure le trajet serveur du panel → Bbox, mesuré au même
  // instant (connexion vers la Bbox lancée en parallèle). Sur une machine en Wi-Fi, ce trajet ajoute plusieurs
  // millisecondes et des pics ; la différence appariée suit de près le ping que la Bbox mesure elle-même.
  fromBbox: true,
};
export const EVERY = [2000, 5000, 15000, 60000];
// déjà mesurés toutes les 2 s par la sonde Internet principale : pas de double connexion
export const SHARED = { cloudflare: '1.1.1.1', 'google-dns': '8.8.8.8' };

const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
/** Configuration reçue de l'interface → configuration sûre (services connus, hôtes valides, bornes) */
export function sanitizeProbes(b, prev = DEFAULT_PROBES) {
  const known = new Set(CATALOG.map((c) => c.id));
  const on = Array.isArray(b?.on) ? [...new Set(b.on.map(String))].filter((id) => known.has(id)) : prev.on;
  const custom = Array.isArray(b?.custom) ? b.custom.map((c) => {
    const host = String(c?.host || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const name = String(c?.name || '').trim().slice(0, 32);
    const port = Math.round(Number(c?.port) || 443);
    const id = /^c-[a-z0-9]{3,16}$/.test(String(c?.id)) ? String(c.id) : 'c-' + Math.random().toString(36).slice(2, 10);
    if (!name || !(net.isIPv4(host) || HOST_RE.test(host)) || port < 1 || port > 65535) return null;
    return { id, name, host, port };
  }).filter(Boolean).slice(0, 8) : prev.custom;
  const every = EVERY.includes(Number(b?.every)) ? Number(b.every) : prev.every;
  const fromBbox = typeof b?.fromBbox === 'boolean' ? b.fromBbox : prev.fromBbox ?? true;
  return { on, custom, every, fromBbox };
}

/** Résolution DNS mise en cache (10 min si succès, 1 min après un échec ; on garde la dernière adresse connue) */
export function createResolver() {
  const cache = new Map();
  return async function resolve(host) {
    if (net.isIP(host)) return { ip: host };
    const c = cache.get(host);
    if (c && Date.now() - c.at < (c.ok ? 600000 : 60000)) return { ip: c.ip, err: c.ok ? null : 'dns' };
    try {
      const { address } = await dns.lookup(host, { family: 4 });
      cache.set(host, { ip: address, at: Date.now(), ok: true });
      return { ip: address };
    } catch {
      cache.set(host, { ip: c?.ip || null, at: Date.now(), ok: false });
      return { ip: c?.ip || null, err: 'dns' };
    }
  };
}
