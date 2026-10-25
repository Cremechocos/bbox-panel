// Client HTTP minimal pour l'API locale de la Bbox (https://mabbox.bytel.fr/api/v1).
// - IPv4 forcé : l'IPv6 de la Bbox répond de façon intermittente (timeouts constatés).
// - File d'attente : la Bbox ralentit/coupe si on l'interroge trop vite.
// - Écritures : corps x-www-form-urlencoded + en-tête ForceData (comme l'IHM officielle)
//   + ?btoken=<jeton> (POST uniquement) obtenu à la volée sur /api/v1/device/token.
import https from 'node:https';
import dns from 'node:dns';
import net from 'node:net';

// Accès distant : ip = IP publique ou nom DynDNS de la Bbox, port = celui de son accès distant. Le SNI et la
// vérification du certificat restent sur `host` (mabbox.bytel.fr), que la Bbox présente aussi côté Internet.
export function createBboxClient({ host = 'mabbox.bytel.fr', ip = '', port = 443, fallbackIp = '192.168.1.254', maxConcurrent = 3, timeoutMs = 15000, log = () => {} } = {}) {
  const fixedIp = net.isIP(ip) ? ip : '';
  const lookupName = ip && !fixedIp ? ip : host;
  let resolvedIp = fixedIp || null;
  let resolvedAt = 0;

  // Toujours asynchrone : un rappel synchrone ferait émettre les erreurs de connexion (ENETUNREACH…)
  // avant que la requête n'écoute le socket, ce qui ferait planter Node.
  function resolveIpv4(cb) {
    if (fixedIp) return process.nextTick(cb, null, fixedIp);
    if (resolvedIp && Date.now() - resolvedAt < 5 * 60_000) return process.nextTick(cb, null, resolvedIp);
    dns.lookup(lookupName, { family: 4 }, (err, address) => {
      if (err || !address) {
        // Le nom n'existe que via le DNS de la Bbox : on retombe sur l'IP LAN par défaut.
        resolvedIp = fallbackIp;
      } else {
        resolvedIp = address;
      }
      resolvedAt = Date.now();
      cb(null, resolvedIp);
    });
  }

  const lookup = (hostname, options, cb) => {
    if (typeof options === 'function') { cb = options; options = {}; }
    resolveIpv4((err, addr) => {
      if (err) return cb(err);
      if (options && options.all) return cb(null, [{ address: addr, family: 4 }]);
      cb(null, addr, 4);
    });
  };

  const agent = new https.Agent({ keepAlive: true, maxSockets: maxConcurrent, keepAliveMsecs: 10_000, lookup });

  // File d'attente simple pour limiter la charge sur la Bbox.
  let active = 0;
  const queue = [];
  function schedule(fn) {
    return new Promise((resolve, reject) => {
      queue.push({ fn, resolve, reject });
      pump();
    });
  }
  function pump() {
    while (active < maxConcurrent && queue.length) {
      const { fn, resolve, reject } = queue.shift();
      active++;
      fn().then(resolve, reject).finally(() => { active--; pump(); });
    }
  }

  function rawRequest(method, path, { cookie = '', body = null, headers = {} } = {}) {
    return schedule(() => new Promise((resolve, reject) => {
      const started = Date.now();
      const h = {
        'User-Agent': 'bbox-panel/1.0',
        Accept: 'application/json, text/plain, */*',
        'X-Requested-With': 'XMLHttpRequest',
        Origin: `https://${host}`,
        Referer: `https://${host}/`,
        ...headers,
      };
      if (cookie) h.Cookie = cookie;
      let payload = null;
      if (body !== null && body !== undefined) {
        payload = Buffer.from(body, 'utf8');
        h['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8';
        h['Content-Length'] = payload.length;
      } else if (method !== 'GET' && method !== 'HEAD') {
        h['Content-Length'] = 0;
      }
      const req = https.request({ host, servername: host, port, method, path, headers: h, agent, timeout: timeoutMs }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          log(`[bbox] ${method} ${path.replace(/btoken=[^&]+/, 'btoken=…')} -> ${res.statusCode} (${Date.now() - started}ms, ${buf.length}B)`);
          resolve({ status: res.statusCode, headers: res.headers, body: buf });
        });
        res.on('error', reject);
      });
      req.on('timeout', () => { req.destroy(new Error('BBOX_TIMEOUT')); });
      req.on('error', (e) => { log(`[bbox] ${method} ${path} !! ${e.message}`); reject(e); });
      if (payload) req.write(payload);
      req.end();
    }));
  }

  function encodeForm(data) {
    if (data === null || data === undefined) return null;
    if (typeof data === 'string') return data;
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(data)) {
      if (v === undefined) continue;
      p.append(k, v === null ? '' : typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
    }
    return p.toString();
  }

  async function getToken(cookie) {
    const r = await rawRequest('GET', '/api/v1/device/token', { cookie });
    if (r.status !== 200) {
      const err = new Error('TOKEN_' + r.status);
      err.status = r.status;
      throw err;
    }
    const j = JSON.parse(r.body.toString('utf8'));
    const tok = j?.[0]?.device?.token;
    if (!tok) throw new Error('TOKEN_MISSING');
    return tok;
  }

  async function call(method, apiPath, { cookie = '', data = null, query = '', withToken } = {}) {
    method = method.toUpperCase();
    const isWrite = method !== 'GET' && method !== 'HEAD';
    let qs = query ? (query.startsWith('?') ? query.slice(1) : query) : '';
    // Comme les deux IHM officielles (React et legacy) : seul POST porte le btoken.
    const needToken = withToken ?? method === 'POST';
    if (needToken) {
      const tok = await getToken(cookie);
      qs = (qs ? qs + '&' : '') + 'btoken=' + encodeURIComponent(tok);
    }
    const form = isWrite ? encodeForm(data) : null;
    const headers = {};
    if (form) headers.ForceData = form; // reproduit l'IHM officielle
    return rawRequest(method, apiPath + (qs ? '?' + qs : ''), { cookie, body: form ?? (isWrite ? '' : null), headers });
  }

  async function login(password, remember = true) {
    const form = encodeForm({ password, remember: remember ? 1 : 0 });
    const r = await rawRequest('POST', '/api/v1/login', { body: form, headers: { ForceData: form } });
    const setCookies = [].concat(r.headers['set-cookie'] || []);
    const cookies = {};
    for (const sc of setCookies) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      if (i > 0) cookies[pair.slice(0, i).trim()] = pair.slice(i + 1).trim();
    }
    return { status: r.status, body: r.body, cookies };
  }

  return { rawRequest, call, login, getToken, encodeForm, get resolvedIp() { return resolvedIp; } };
}

export function cookieHeader(cookies = {}) {
  return Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ');
}
