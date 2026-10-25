// Bbox Panel — serveur relais local.
// Sert la webapp (web/dist une fois construite, sinon l'ancienne public/) et relaie /api/v1/* vers la Bbox avec la session de l'utilisateur.
// Aucune dépendance externe : Node >= 20.
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { createBboxClient, cookieHeader } from './bbox.mjs';
import { createHub } from './hub.mjs';
import { DEFAULT_PROBES, sanitizeProbes } from './probes.mjs';
import { createHistory } from './history.mjs';
import { createEvents } from './events.mjs';
import { createTimers } from './timers.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
// Interface : build React (web/dist) si présent, sinon l'ancienne interface (public/). PUBLIC_DIR force un dossier.
const WEB_DIST = path.join(ROOT, 'web', 'dist');
const PUBLIC = process.env.PUBLIC_DIR ? path.resolve(process.env.PUBLIC_DIR) : fs.existsSync(path.join(WEB_DIST, 'index.html')) ? WEB_DIST : path.join(ROOT, 'public');
const env = process.env;

const CFG = {
  port: Number(env.PORT || 8484),
  host: env.HOST || '0.0.0.0',
  httpsPort: Number(env.HTTPS_PORT || 0),
  bboxHost: env.BBOX_HOST || 'mabbox.bytel.fr',
  bboxIp: env.BBOX_IP || '',
  bboxPort: Number(env.BBOX_PORT || 443),
  bboxFallbackIp: env.BBOX_FALLBACK_IP || '192.168.1.254',
  dataDir: env.DATA_DIR || path.join(os.homedir(), '.bbox-panel'),
  sessionDays: Number(env.SESSION_DAYS || 30),
  verbose: env.VERBOSE === '1',
  trustProxy: env.TRUST_PROXY === '1',
};

fs.mkdirSync(CFG.dataDir, { recursive: true, mode: 0o700 });
const SESSIONS_FILE = path.join(CFG.dataDir, 'sessions.json');

const log = (...a) => console.log(new Date().toISOString(), ...a);
// Bbox jointe par son accès distant (BBOX_IP publique ou nom DynDNS) : elle y refuse certaines fonctions (HTTP 403).
const REMOTE = !!CFG.bboxIp && !/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.)/.test(CFG.bboxIp);
const bbox = createBboxClient({
  host: CFG.bboxHost, ip: CFG.bboxIp, port: CFG.bboxPort, fallbackIp: CFG.bboxFallbackIp,
  log: CFG.verbose ? (m) => log(m) : () => {},
});

// ───────────── Temps réel, historique, événements, minuteurs ─────────────
let hub = null, timers = null;
const events = createEvents({ file: path.join(CFG.dataDir, 'events.json'), log, emit: (evs) => hub?.emitEvents(evs) });
const history = createHistory({ dir: path.join(CFG.dataDir, 'history'), log });
const PREFS_FILE = path.join(CFG.dataDir, 'prefs.json');
let prefs = { favorites: { devices: [], actions: [] } };
try { prefs = { ...prefs, ...JSON.parse(fs.readFileSync(PREFS_FILE, 'utf8')) }; } catch { /* défaut */ }

// ───────────── Sessions (persistées, fichier 0600) ─────────────
/** @type {Map<string, {cookies: Record<string,string>, created: number, lastSeen: number, expires: number, ua: string, ip: string}>} */
const sessions = new Map();
try {
  const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
  for (const [sid, s] of Object.entries(raw)) if (s.expires > Date.now()) sessions.set(sid, s);
} catch { /* premier lancement */ }
let saveTimer = null;
function persistSessions() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const obj = Object.fromEntries(sessions);
    fs.writeFile(SESSIONS_FILE, JSON.stringify(obj, null, 1), { mode: 0o600 }, (e) => e && log('persist error', e.message));
  }, 300);
}
const hashSid = (sid) => crypto.createHash('sha256').update(sid).digest('hex');

// Session utilisée par le relevé partagé (hub) : la plus récemment active dont la session Bbox est valide.
function pollSession() {
  let best = null;
  for (const [k, s] of sessions) {
    if (s.expires < Date.now() || s.bboxDead) continue;
    if (!best || (s.lastSeen || 0) > (best[1].lastSeen || 0)) best = [k, s];
  }
  return best;
}
function pollCookie() {
  const b = pollSession();
  if (!b) return '';
  const s = b[1];
  const cookie = cookieHeader(s.cookies);
  // maintien de session, comme l'IHM officielle (PUT /api/v1/login)
  if (Date.now() - (s.refreshed || s.created) > 10 * 60_000) {
    s.refreshed = Date.now(); persistSessions();
    bbox.rawRequest('PUT', '/api/v1/login', { cookie, body: '' }).catch(() => {});
  }
  return cookie;
}
// Un 401 isolé (Bbox qui redémarre un service, réponse 500/401 passagère) ne doit pas faire perdre la
// session : on vérifie auprès de la Bbox avant de la déclarer expirée ; injoignable = on réessaiera.
let verifyingPoll = false;
function pollAuthFailed() {
  const b = pollSession();
  if (!b || verifyingPoll) return;
  verifyingPoll = true;
  const s = b[1];
  bbox.rawRequest('GET', '/api/v1/summary', { cookie: cookieHeader(s.cookies) })
    .then((r) => {
      const j = JSON.parse(r.body.toString('utf8'));
      if (j?.[0]?.authenticated === 1) return;
      s.bboxDead = Date.now(); persistSessions();
      log('relevé partagé : session Bbox expirée, passage en mode public');
    })
    .catch(() => { /* Bbox injoignable : nouvelle vérification au prochain 401 */ })
    .finally(() => { verifyingPoll = false; });
}

function parseCookies(req) {
  const out = {};
  for (const part of (req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
function getSession(req) {
  const sid = parseCookies(req).bp_sid;
  if (!sid) return null;
  const key = hashSid(sid);
  const s = sessions.get(key);
  if (!s) return null;
  if (s.expires < Date.now()) { sessions.delete(key); persistSessions(); return null; }
  s.lastSeen = Date.now();
  return { key, s };
}
function isSecure(req) {
  return req.socket.encrypted || (CFG.trustProxy && req.headers['x-forwarded-proto'] === 'https');
}
function clientIp(req) {
  if (CFG.trustProxy && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || '';
}

// ───────────── Anti-bruteforce local (la Bbox verrouille aussi après échecs) ─────────────
const loginGuard = new Map(); // ip -> {fails, until}
function guardCheck(ip) {
  const g = loginGuard.get(ip);
  if (g && g.until > Date.now()) return Math.ceil((g.until - Date.now()) / 1000);
  return 0;
}
function guardFail(ip) {
  const g = loginGuard.get(ip) || { fails: 0, until: 0 };
  g.fails++;
  g.until = Date.now() + Math.min(300_000, 2000 * 2 ** (g.fails - 1));
  loginGuard.set(ip, g);
}
const guardOk = (ip) => loginGuard.delete(ip);

// ───────────── Cache GET court (protège la Bbox quand plusieurs écrans sont ouverts) ─────────────
const getCache = new Map(); // path -> {t, status, body, type}
const CACHE_MS = 1500;
function cacheGet(p) { const c = getCache.get(p); return c && Date.now() - c.t < CACHE_MS ? c : null; }
function cacheClear() { getCache.clear(); }

// ───────────── Helpers HTTP ─────────────
const SEC_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self' data:; manifest-src 'self'; worker-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'",
};
function send(res, status, body, headers = {}) {
  const isBuf = Buffer.isBuffer(body);
  const payload = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { ...SEC_HEADERS, 'Cache-Control': 'no-store', ...(isBuf || typeof body === 'string' ? {} : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
  res.end(payload);
}
function readBody(req, limit = 64 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > limit) { reject(new Error('BODY_TOO_LARGE')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
function parseBody(raw, type = '') {
  if (!raw) return null;
  if (type.includes('application/json')) return JSON.parse(raw);
  return raw; // déjà urlencoded
}
// CSRF : toute requête modifiante doit porter X-Panel (impossible cross-origin sans CORS, que l'on n'autorise pas).
function csrfOk(req) { return req.method === 'GET' || req.method === 'HEAD' || req.headers['x-panel'] === '1'; }

// ───────────── Endpoints refusés par le relais ─────────────
// Remise à zéro usine : volontairement hors du panel (risque de perdre la config FTTH/VoIP).
const BLOCKED = [/^\/api\/v1\/device\/factory/i, /^\/api\/v1\/reset-password/i];

// ───────────── Rapport de compatibilité (autres modèles de Bbox) ─────────────
// Adresses du relais sur le réseau local (QR de jumelage quand le panel est ouvert en localhost)
const lanUrls = () => Object.values(os.networkInterfaces()).flat()
  .filter((a) => a && a.family === 'IPv4' && !a.internal && /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))
  .map((a) => `http://${a.address}:${CFG.port}`);
const VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '?'; } })();
// Routes lues par le panel : celles qui ne répondent pas 200 désignent les écrans à adapter pour ce modèle.
const COMPAT_ROUTES = ['summary', 'device', 'device/cpu', 'device/mem', 'device/log', 'device/led', 'device/summary', 'device/usb', 'hosts', 'hosts/lite', 'hosts/me',
  'wireless', 'wireless/acl', 'wireless/wps', 'wireless/deactivation', 'wireless/24', 'wan/ip', 'wan/ip/stats', 'wan/sff', 'wan/ftth/stats', 'wan/diags', 'wan/diags/sessions',
  'wan/backup', 'lan/ip', 'lan/stats', 'dhcp', 'dhcp/clients', 'dhcp/options', 'dhcp6/prefixdelegation', 'dns/stats', 'services', 'firewall', 'firewall/rules',
  'firewall/gamermode', 'firewall/pingresponder', 'firewallv6/level', 'firewallv6/rules', 'nat/rules', 'nat/dmz', 'upnp/igd', 'upnp/igd/rules', 'dyndns', 'remote/proxywol',
  'parentalcontrol', 'voip', 'voip/scheduler', 'iptv/diags', 'notification', 'alerts', 'configs', 'usersave', 'speedtest/info'];
/** Modèle, firmware, drapeaux feat-* de l'IHM officielle et routes indisponibles. Rien d'identifiant (ni série, ni MAC, ni IP). */
async function compatReport(cookie) {
  const json = async (p) => { const r = await bbox.rawRequest('GET', p, { cookie }); return JSON.parse(r.body.toString('utf8'))?.[0]; };
  const [dev, sum] = await Promise.all([json('/api/v1/device'), json('/api/v1/summary')]);
  let features = [];
  try { // la page de connexion officielle porte les drapeaux du modèle en classes de <body> (servie compressée)
    const r = await bbox.rawRequest('GET', '/login');
    const html = (r.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(r.body) : r.body).toString('utf8');
    features = (/<body[^>]*class="([^"]*)"/.exec(html)?.[1] || '').split(/\s+/).filter((c) => /^(no-)?feat-/.test(c));
  } catch { /* drapeaux facultatifs */ }
  const status = await Promise.all(COMPAT_ROUTES.map((p) => bbox.rawRequest('GET', '/api/v1/' + p, { cookie }).then((r) => r.status, () => 0)));
  return {
    panel: VERSION, model: dev?.device?.modelname || null, modelclass: dev?.device?.modelclass || null, firmware: dev?.device?.main?.version || null,
    preferredAvailable: sum?.preferredAvailable ?? null, features,
    unavailable: Object.fromEntries(COMPAT_ROUTES.map((p, i) => [p, status[i]]).filter(([, s]) => s !== 200)), checked: COMPAT_ROUTES.length,
  };
}

// ───────────── Routes /panel/* ─────────────
async function handlePanel(req, res, url) {
  const p = url.pathname;
  if (p === '/panel/health') return send(res, 200, { ok: true, bboxIp: bbox.resolvedIp, sessions: sessions.size, uptime: process.uptime(), live: hub ? { clients: hub.clients, auth: hub.state.auth, ready: hub.state.ready } : null });

  // Détection du relais par les apps mobiles (public : aucune donnée de la Bbox)
  if (p === '/panel/info') return send(res, 200, { app: 'bbox-panel', version: VERSION, api: 1, remote: REMOTE, lan: lanUrls(), features: ['live', 'history', 'events', 'timers', 'prefs', 'compat'] });

  if (p === '/panel/session' && req.method === 'GET') {
    const sess = getSession(req);
    if (!sess) return send(res, 200, { authenticated: false });
    // Vérifie auprès de la Bbox que la session est toujours valide.
    try {
      const r = await bbox.rawRequest('GET', '/api/v1/summary', { cookie: cookieHeader(sess.s.cookies) });
      const j = JSON.parse(r.body.toString('utf8'));
      const ok = j?.[0]?.authenticated === 1;
      if (!ok) { sessions.delete(sess.key); persistSessions(); }
      return send(res, 200, { authenticated: ok, since: sess.s.created });
    } catch (e) {
      return send(res, 502, { authenticated: false, error: 'bbox_unreachable', detail: e.message });
    }
  }

  if (p === '/panel/login' && req.method === 'POST') {
    const ip = clientIp(req);
    const wait = guardCheck(ip);
    if (wait) return send(res, 429, { error: 'local_throttle', retryIn: wait });
    let body;
    try { body = JSON.parse(await readBody(req, 4096) || '{}'); } catch { return send(res, 400, { error: 'bad_request' }); }
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) return send(res, 400, { error: 'password_required' });
    let r;
    try { r = await bbox.login(password, true); } catch (e) { return send(res, 502, { error: 'bbox_unreachable', detail: e.message }); }
    if (r.status === 200 && Object.keys(r.cookies).length) {
      guardOk(ip);
      const sid = crypto.randomBytes(32).toString('base64url');
      const days = body.remember === false ? 1 : CFG.sessionDays;
      sessions.set(hashSid(sid), { cookies: r.cookies, created: Date.now(), lastSeen: Date.now(), expires: Date.now() + days * 86400_000, ua: String(req.headers['user-agent'] || '').slice(0, 160), ip });
      persistSessions();
      const cookie = [`bp_sid=${sid}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${days * 86400}`];
      if (isSecure(req)) cookie.push('Secure');
      return send(res, 200, { ok: true }, { 'Set-Cookie': cookie.join('; ') });
    }
    guardFail(ip);
    let detail = null;
    try { detail = JSON.parse(r.body.toString('utf8')); } catch { /* vide */ }
    if (r.status === 429) return send(res, 429, { error: 'bbox_locked', detail });
    if (r.status === 401) return send(res, 401, { error: 'bad_password', detail });
    return send(res, 502, { error: 'login_failed', status: r.status, detail });
  }

  if (p === '/panel/logout' && req.method === 'POST') {
    const sess = getSession(req);
    if (sess) {
      bbox.rawRequest('POST', '/api/v1/logout', { cookie: cookieHeader(sess.s.cookies), body: '' }).catch(() => {});
      sessions.delete(sess.key); persistSessions();
    }
    return send(res, 200, { ok: true }, { 'Set-Cookie': 'bp_sid=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0' });
  }

  // ── Routes réservées aux sessions ouvertes ──
  if (/^\/panel\/(live|history|usage|events|timers|pause|guest|prefs|compat)/.test(p)) {
    const sess = getSession(req);
    if (!sess) return send(res, 401, { error: 'panel_auth_required' });
    const q = url.searchParams;
    const body = async () => { try { return JSON.parse(await readBody(req, 16 * 1024) || '{}'); } catch { return null; } };
    const fail = (e) => send(res, e.status && e.status < 600 ? e.status : 502, { error: e.message, detail: e.body });
    try {
      if (p === '/panel/live' && req.method === 'GET') return hub.addClient(req, res, SEC_HEADERS);
      if (p === '/panel/live/refresh' && req.method === 'POST') { const b = await body(); hub.refresh(Array.isArray(b?.tasks) ? b.tasks.slice(0, 12).map(String) : []); return send(res, 200, { ok: true }); }
      if (p === '/panel/history' && req.method === 'GET') return send(res, 200, history.query(q.get('range') || '24h'));
      if (p === '/panel/usage' && req.method === 'GET') return send(res, 200, { days: history.daysList(Math.min(400, Number(q.get('days')) || 31)), months: history.months(13), today: history.today(), since: history.since() });
      if (p === '/panel/events' && req.method === 'GET') {
        const types = q.get('types') ? q.get('types').split(',') : null;
        return send(res, 200, { events: events.query({ since: Number(q.get('since')) || 0, before: Number(q.get('before')) || Infinity, limit: Math.min(2000, Number(q.get('limit')) || 300), types, mac: q.get('mac') || null }), unread: events.unread() });
      }
      if (p === '/panel/events/ack' && req.method === 'POST') { const b = await body(); const n = events.ack(b?.all ? 'all' : Array.isArray(b?.ids) ? b.ids.map(String) : []); hub.emitEvents([]); return send(res, 200, { ok: true, acked: n, unread: events.unread() }); }
      if (p === '/panel/timers' && req.method === 'GET') return send(res, 200, { timers: timers.list() });
      if (p === '/panel/pause' && req.method === 'POST') { const b = await body(); if (!b) return send(res, 400, { error: 'bad_json' }); return send(res, 200, { ok: true, timer: await timers.startPause(b) }); }
      if (p.startsWith('/panel/pause/') && req.method === 'DELETE') return send(res, 200, { ok: await timers.endPause(decodeURIComponent(p.slice(13))) });
      if (p === '/panel/guest' && req.method === 'POST') { const b = await body(); if (!b) return send(res, 400, { error: 'bad_json' }); const t = await timers.startGuest(b); hub.afterWrite('/api/v1/wireless'); return send(res, 200, { ok: true, timer: t }); }
      if (p === '/panel/guest' && req.method === 'DELETE') { await timers.endGuest('manual', { disable: q.get('keep') !== '1' }); hub.afterWrite('/api/v1/wireless'); return send(res, 200, { ok: true }); }
      if (p === '/panel/compat' && req.method === 'GET') return send(res, 200, await compatReport(cookieHeader(sess.s.cookies)));
      if (p === '/panel/prefs' && req.method === 'GET') return send(res, 200, prefs);
      if (p === '/panel/prefs' && req.method === 'PUT') {
        const b = await body();
        const clean = (a) => (Array.isArray(a) ? [...new Set(a.map(String).filter((x) => x.length <= 64))].slice(0, 60) : []);
        if (!b || typeof b !== 'object') return send(res, 400, { error: 'bad_json' });
        const next = { ...prefs };
        // chaque partie est facultative : l'interface n'envoie que ce qu'elle modifie
        if (b.favorites) next.favorites = { devices: clean(b.favorites?.devices), actions: clean(b.favorites?.actions) };
        // services dont la latence est mesurée (voir probes.mjs)
        if (b.probes && typeof b.probes === 'object') next.probes = sanitizeProbes(b.probes, prefs.probes || DEFAULT_PROBES);
        // prénom affiché sur l'accueil (« Bonsoir Alexandre »), vide = salutation seule
        if (typeof b.owner === 'string') next.owner = b.owner.replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 32);
        if (b.names && typeof b.names === 'object') {
          // noms d'affichage choisis dans le panel : adresse MAC → nom libre (64 caractères au plus)
          next.names = Object.fromEntries(Object.entries(b.names)
            .filter(([k, v]) => /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/.test(k) && typeof v === 'string' && v.trim() && v.length <= 64)
            .slice(0, 300).map(([k, v]) => [k, v.trim()]));
        }
        prefs = next;
        fs.writeFile(PREFS_FILE, JSON.stringify(prefs, null, 1), { mode: 0o600 }, () => {});
        if (b.probes) hub.setProbes(prefs.probes);
        return send(res, 200, prefs);
      }
    } catch (e) { log('panel', p, e.message); return fail(e); }
  }

  return send(res, 404, { error: 'not_found' });
}

// ───────────── Relais /api/v1/* ─────────────
async function handleApi(req, res, url) {
  const sess = getSession(req);
  if (!sess) return send(res, 401, { error: 'panel_auth_required' });
  const apiPath = url.pathname;
  if (BLOCKED.some((re) => re.test(apiPath))) return send(res, 403, { error: 'blocked_by_panel' });
  const method = req.method.toUpperCase();
  if (!['GET', 'PUT', 'POST', 'DELETE'].includes(method)) return send(res, 405, { error: 'method_not_allowed' });
  const cookie = cookieHeader(sess.s.cookies);
  const query = url.search ? url.search.slice(1) : '';
  // Maintien de session : l'IHM officielle fait un PUT /api/v1/login (refreshLogin) avant d'agir.
  if (Date.now() - (sess.s.refreshed || sess.s.created) > 10 * 60_000) {
    sess.s.refreshed = Date.now();
    persistSessions();
    bbox.rawRequest('PUT', '/api/v1/login', { cookie, body: '' }).catch(() => {});
  }

  try {
    if (method === 'GET') {
      const key = apiPath + (query ? '?' + query : '');
      const cached = cacheGet(key);
      if (cached) return send(res, cached.status, cached.body, { 'Content-Type': cached.type, 'X-Cache': 'HIT' });
      const r = await bbox.rawRequest('GET', key, { cookie });
      const type = r.headers['content-type'] || 'application/json; charset=utf-8';
      if (r.status === 200) getCache.set(key, { t: Date.now(), status: r.status, body: r.body, type });
      if (r.status === 401) return send(res, 401, { error: 'bbox_auth_required' });
      if (r.status === 403 && REMOTE) return send(res, 403, { error: 'bbox_remote_forbidden' });
      return send(res, r.status, r.body, { 'Content-Type': type });
    }
    const raw = await readBody(req);
    let data;
    try { data = parseBody(raw, req.headers['content-type'] || ''); } catch { return send(res, 400, { error: 'bad_json' }); }
    // Le client peut préciser ?_notoken=1 pour les rares appels sans btoken.
    const params = new URLSearchParams(query);
    const noToken = params.get('_notoken') === '1';
    params.delete('_notoken');
    const r = await bbox.call(method, apiPath, { cookie, data, query: params.toString(), withToken: noToken ? false : undefined });
    cacheClear();
    if (r.status < 300) hub.afterWrite(apiPath);
    if (r.status === 401) return send(res, 401, { error: 'bbox_auth_required' });
    if (r.status === 403 && REMOTE) return send(res, 403, { error: 'bbox_remote_forbidden' });
    const type = r.headers['content-type'] || 'application/json; charset=utf-8';
    return send(res, r.status, r.body.length ? r.body : JSON.stringify({ ok: r.status < 300 }), { 'Content-Type': r.body.length ? type : 'application/json; charset=utf-8' });
  } catch (e) {
    if (e.status === 401) return send(res, 401, { error: 'bbox_auth_required' });
    return send(res, 502, { error: 'bbox_unreachable', detail: e.message });
  }
}

// ───────────── Polices servies depuis la Bbox (pas de copie dans le dépôt) ─────────────
const fontCache = new Map();
async function handleFont(req, res, url) {
  const name = path.basename(url.pathname);
  if (!/^BouyguesRead-[A-Za-z]+\.woff2$/.test(name)) return send(res, 404, 'not found');
  if (!fontCache.has(name)) {
    try {
      const r = await bbox.rawRequest('GET', '/fonts/' + name);
      if (r.status !== 200) return send(res, 404, 'not found');
      fontCache.set(name, r.body);
    } catch { return send(res, 404, 'not found'); }
  }
  return send(res, 200, fontCache.get(name), { 'Content-Type': 'font/woff2', 'Cache-Control': 'public, max-age=604800' });
}

// ───────────── Fichiers statiques ─────────────
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.map': 'application/json; charset=utf-8' };
async function handleStatic(req, res, url) {
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'forbidden');
  let stat;
  try { stat = await fsp.stat(file); } catch { stat = null; }
  if (!stat || !stat.isFile()) {
    // SPA : renvoie index.html pour les routes inconnues sans extension
    if (!path.extname(rel)) return handleStatic(req, res, new URL('/index.html', url));
    return send(res, 404, 'not found', { 'Content-Type': 'text/plain' });
  }
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || 'application/octet-stream';
  // Code applicatif : toujours revalidé (ETag) pour que les mises à jour arrivent immédiatement, y compris dans la webapp iOS.
  // Fichiers de build à empreinte (/assets/…-hash.js) : cache d'un an ; polices et icônes : quelques jours.
  const cache = rel.startsWith('/assets/') ? 'public, max-age=31536000, immutable'
    : rel.startsWith('/fonts/') ? 'public, max-age=604800'
    : rel.startsWith('/vendor/') || rel.startsWith('/icons/') ? 'public, max-age=86400' : 'no-cache';
  const headers = { 'Content-Type': type, 'Cache-Control': cache, ETag: `"${stat.size}-${stat.mtimeMs | 0}"` };
  if (rel === '/sw.js') headers['Service-Worker-Allowed'] = '/';
  if (req.headers['if-none-match'] === headers.ETag) { res.writeHead(304, { ...SEC_HEADERS, ...headers }); return res.end(); }
  let body = await fsp.readFile(file);
  if (/text|javascript|json|svg|manifest/.test(type) && /\bgzip\b/.test(req.headers['accept-encoding'] || '') && body.length > 1024) {
    body = zlib.gzipSync(body);
    headers['Content-Encoding'] = 'gzip';
    headers.Vary = 'Accept-Encoding';
  }
  res.writeHead(200, { ...SEC_HEADERS, ...headers });
  res.end(body);
}

// ───────────── Routeur ─────────────
async function handler(req, res) {
  const started = Date.now();
  const url = new URL(req.url, 'http://local');
  res.on('finish', () => { if (CFG.verbose || res.statusCode >= 500) log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`); });
  try {
    if (!csrfOk(req)) return send(res, 403, { error: 'csrf' });
    if (url.pathname.startsWith('/panel/')) return await handlePanel(req, res, url);
    if (url.pathname.startsWith('/api/v1/')) return await handleApi(req, res, url);
    if (url.pathname.startsWith('/fonts/BouyguesRead-')) return await handleFont(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    return await handleStatic(req, res, url);
  } catch (e) {
    log('handler error', e);
    if (!res.headersSent) send(res, 500, { error: 'internal' });
  }
}

http.createServer(handler).listen(CFG.port, CFG.host, () => log(`Bbox Panel → http://${CFG.host}:${CFG.port} (Bbox ${CFG.bboxIp ? `${CFG.bboxIp}:${CFG.bboxPort}${REMOTE ? ' en accès distant' : ''}` : CFG.bboxHost}, data ${CFG.dataDir})`));

hub = createHub({ bbox, pollCookie, pollAuthFailed, history, events, timersRef: () => timers, probeConfig: () => prefs.probes || DEFAULT_PROBES, log });
timers = createTimers({ file: path.join(CFG.dataDir, 'timers.json'), bbox, getCookie: pollCookie, events, onChange: (l) => hub.setTimers(l), log });
hub.setTimers(timers.list());
hub.start().catch((e) => log('hub start', e.message));

// HTTPS optionnel (accès distant) : DATA_DIR/tls/cert.pem + key.pem
if (CFG.httpsPort) {
  try {
    const cert = fs.readFileSync(path.join(CFG.dataDir, 'tls', 'cert.pem'));
    const key = fs.readFileSync(path.join(CFG.dataDir, 'tls', 'key.pem'));
    https.createServer({ cert, key }, handler).listen(CFG.httpsPort, CFG.host, () => log(`Bbox Panel (TLS) → https://${CFG.host}:${CFG.httpsPort}`));
  } catch (e) { log('HTTPS désactivé :', e.message); }
}

// Purge des sessions expirées
setInterval(() => {
  let changed = false;
  for (const [k, s] of sessions) if (s.expires < Date.now()) { sessions.delete(k); changed = true; }
  if (changed) persistSessions();
}, 3600_000).unref();

// Filet de sécurité : une coupure réseau passagère (Wi-Fi qui se reconnecte…) ne doit pas arrêter le serveur.
const NET_ERRORS = new Set(['ECONNRESET', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', 'ENETDOWN', 'EADDRNOTAVAIL', 'ECONNABORTED']);
process.on('uncaughtException', (e) => {
  if (NET_ERRORS.has(e?.code)) { log('erreur réseau ignorée :', e.code, e.address || ''); return; }
  log('erreur fatale', e); process.exit(1);
});

// SIGHUP : relit sessions.json (outil dev-session, maintenance) sans redémarrer
process.on('SIGHUP', () => {
  try {
    const raw = JSON.parse(fs.readFileSync(SESSIONS_FILE, 'utf8'));
    for (const k of [...sessions.keys()]) if (!raw[k]) sessions.delete(k);
    for (const [k, s] of Object.entries(raw)) if (s.expires > Date.now()) sessions.set(k, { ...s, lastSeen: Math.max(s.lastSeen || 0, sessions.get(k)?.lastSeen || 0) });
    log(`sessions rechargées : ${sessions.size}`);
  } catch (e) { log('rechargement des sessions', e.message); }
});

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { clearTimeout(saveTimer); fs.writeFileSync(SESSIONS_FILE, JSON.stringify(Object.fromEntries(sessions), null, 1), { mode: 0o600 }); process.exit(0); });
