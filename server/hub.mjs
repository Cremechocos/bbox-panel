// Hub temps réel : UN seul relevé partagé de la Bbox, poussé aux navigateurs en SSE.
// - Cadence « active » quand au moins un écran est ouvert, « veille » sinon (l'historique continue).
// - Sonde de latence (connexion TCP, toutes les 2 s) vers Internet et vers la Bbox.
// - Latence par service (YouTube, Netflix…) : voir probes.mjs ; séries « p:<id> ».
// - Alimente l'historique, le journal d'événements et les minuteurs.
import { tcpPing, CATALOG, DEFAULT_PROBES, SHARED, createResolver } from './probes.mjs';

const toNum = (v) => Number(v) || 0;
const fixText = (s) => { if (typeof s !== 'string' || !/[\u00c2-\u00f4][\u0080-\u00bf]/.test(s)) return s; try { return decodeURIComponent(escape(s)); } catch { return s; } };
const deepFix = (o) => { if (typeof o === 'string') return fixText(o); if (Array.isArray(o)) return o.map(deepFix); if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = deepFix(o[k]); return r; } return o; };
const one = (j) => deepFix(Array.isArray(j) && j.length === 1 ? j[0] : j);

// [cadence active, cadence en veille] en ms (0 = arrêté en veille)
const SCHED = {
  latency: [2000, 10000], wanStats: [3000, 30000], cpu: [4000, 60000], bands: [3000, 0], lan: [6000, 60000],
  hosts: [10000, 30000], summary: [15000, 60000], sessions: [20000, 0], statics: [60000, 300000], slow: [30000, 120000], graphs: [900000, 1800000],
  probes: [5000, 0], // cadence réglable dans l'interface ; arrêtée quand aucun écran n'est ouvert
};
const CAP = { latency: 300, lan: 300, down: 120, up: 120, cpu: 150, temp: 150, mem: 150, b24: 150, b5: 150, b6: 150, sessions: 90, hostsActive: 90, lanDown: 150, lanUp: 150 };
// Écriture via le relais → tâches à rafraîchir
const AFTER_WRITE = [
  [/^\/api\/v1\/(wireless|wps)/, ['statics', 'bands']], [/^\/api\/v1\/(hosts|dhcp|parentalcontrol|lan)/, ['hosts', 'slow', 'statics']],
  [/^\/api\/v1\/(nat|firewall|upnp|dyndns|remote|wan)/, ['slow', 'statics']], [/^\/api\/v1\/(device|voip|services|usb|notification|hibernate)/, ['statics', 'summary', 'slow']],
];

export function createHub({ bbox, pollCookie, pollAuthFailed, history, events, timersRef, probeConfig = () => DEFAULT_PROBES, log = () => {} }) {
  const state = {
    ready: false, auth: 'public',
    device: null, wanIp: null, lanIp: null, wireless: null, services: null, voip: null, sff: null, summary: null, dns: null,
    hosts: [], guestHosts: [], stations: [], sessions: null, log: [], nat: null, firewall: null, upnp: null, dhcp: null,
    graphs: { temp: [], cpu: [], power: [] },
    wan: { down: 0, up: 0, contract: 0, link: 0, rxBytes: 0, txBytes: 0, updatedAt: 0, interval: 0 },
    cpu: { usage: 0, temp: 0 }, mem: { used: 0, total: 0 },
    bands: { 24: { down: 0, up: 0 }, 5: { down: 0, up: 0 }, 6: { down: 0, up: 0 } },
    lanPorts: [],
    latency: { internet: null, bbox: null, jitter: 0, loss: 0, down: false, downSince: 0, targets: {} },
    today: { rx: 0, tx: 0 }, timers: [],
    probes: { every: DEFAULT_PROBES.every, on: DEFAULT_PROBES.on, custom: [], list: [] }, probeCatalog: [],
  };
  const series = Object.fromEntries(Object.keys(CAP).map((k) => [k, []]));
  const clients = new Set();
  const prev = {};
  let dirty = new Set();
  let pushes = {};

  const capOf = (name) => CAP[name] || (name.startsWith('p:') ? 300 : 120);
  const push = (name, v, t = Date.now()) => { const s = (series[name] ||= []); const p = { t, v }; s.push(p); if (s.length > capOf(name)) s.shift(); (pushes[name] ||= []).push(p); };

  // ── latence par service ──
  let probeConf = probeConfig() || DEFAULT_PROBES;
  SCHED.probes[0] = probeConf.every;
  const resolve = createResolver();
  const probeInfo = new Map(); // id → { ip, err }
  const ispDns = () => String(state.wanIp?.wan?.ip?.dnsservers || '').match(/\d{1,3}(?:\.\d{1,3}){3}/)?.[0] || null;
  function probeTargets() {
    const cat = probeConf.on.map((id) => CATALOG.find((c) => c.id === id)).filter(Boolean);
    return [...cat, ...probeConf.custom.map((c) => ({ ...c, group: 'custom', custom: true }))];
  }
  // trajet serveur du panel → Bbox : mesuré en même temps que chaque sonde, retiré si « fromBbox »
  const lanRef = () => { const v = series.lan.slice(-30).map((p) => p.v).filter((x) => x != null).sort((x, y) => x - y); return v.length ? v[v.length >> 1] : null; };
  const fromBbox = (ms, lan) => {
    if (ms == null || probeConf.fromBbox === false) return ms;
    const hop = lan ?? lanRef();
    return hop == null ? ms : Math.max(0.1, Math.round((ms - hop) * 100) / 100);
  };
  function buildProbes() {
    state.probes = {
      every: probeConf.every, on: probeConf.on, custom: probeConf.custom, fromBbox: probeConf.fromBbox !== false,
      list: probeTargets().map((t) => ({
        id: t.id, name: t.name, host: t.host === '@isp-dns' ? ispDns() || '' : t.host, port: t.port || 443, group: t.group, custom: !!t.custom,
        ip: probeInfo.get(t.id)?.ip || SHARED[t.id] || null, err: probeInfo.get(t.id)?.err || null,
      })),
    };
    state.probeCatalog = CATALOG.map(({ id, name, host, port, group, desc }) => ({ id, name, host: host === '@isp-dns' ? ispDns() || '' : host, port: port || 443, group, desc }));
    mark('probes', 'probeCatalog');
  }
  function probeResult(id, ip, ms, err = ms == null ? 'timeout' : null, t = Date.now()) {
    push('p:' + id, ms, t);
    const was = probeInfo.get(id);
    if (!was || was.ip !== ip || was.err !== err) { probeInfo.set(id, { ip, err }); buildProbes(); }
  }
  function setProbes(cfg) {
    probeConf = cfg || DEFAULT_PROBES;
    SCHED.probes[0] = probeConf.every;
    const keep = new Set(probeTargets().map((t) => 'p:' + t.id));
    for (const k of Object.keys(series)) if (k.startsWith('p:') && !keep.has(k)) delete series[k];
    buildProbes(); flush();
    if (clients.size) schedule('probes', 50);
  }
  const mark = (...keys) => keys.forEach((k) => dirty.add(k));

  async function get(path, { auth = true, raw = false } = {}) {
    const cookie = auth ? pollCookie() : '';
    const r = await bbox.rawRequest('GET', '/api/v1/' + path, { cookie });
    if (r.status === 401) { if (cookie) pollAuthFailed(); throw Object.assign(new Error('401'), { status: 401 }); }
    if (r.status !== 200) throw Object.assign(new Error('HTTP ' + r.status), { status: r.status });
    const j = JSON.parse(r.body.toString('utf8'));
    return raw ? j : one(j);
  }
  const opt = (p) => p.catch(() => null);

  function rate(key, bytes) { // octets → kbit/s, lissé ; null tant qu'on n'a pas 2 mesures
    const now = performance.now();
    const p = prev[key];
    if (!p || bytes < p.b) { prev[key] = { b: bytes, t: now, r: 0 }; return null; }
    if (bytes === p.b) return now - p.t > 9000 ? (p.r = 0) : p.r;
    const inst = ((bytes - p.b) * 8) / 1000 / ((now - p.t) / 1000);
    const r = p.r ? p.r * 0.4 + inst * 0.6 : inst;
    prev[key] = { b: bytes, t: now, r };
    return r;
  }

  const tasks = {
    async latency() {
      const ip = bbox.resolvedIp || '192.168.1.254';
      const [ra, rb, gw] = await Promise.all([tcpPing('1.1.1.1', 443), tcpPing('8.8.8.8', 443), tcpPing(ip, 443)]);
      const a = fromBbox(ra, gw), b = fromBbox(rb, gw);
      const L = state.latency;
      const vals = [a, b].filter((v) => v != null);
      const inet = vals.length ? Math.min(...vals) : null;
      if (inet != null && L.internet != null) L.jitter = Math.round((L.jitter * 0.7 + Math.abs(inet - L.internet) * 0.3) * 100) / 100;
      L.internet = inet; L.bbox = gw; L.targets = { cloudflare: a, google: b };
      // les services « Cloudflare » et « Google DNS » réutilisent cette mesure (même cible, même cadence)
      const now = Date.now();
      if (probeConf.on.includes('cloudflare')) probeResult('cloudflare', SHARED.cloudflare, a, undefined, now);
      if (probeConf.on.includes('google-dns')) probeResult('google-dns', SHARED['google-dns'], b, undefined, now);
      // perte récente (sur les 30 dernières mesures)
      const recent = series.latency.slice(-29).map((p) => p.v).concat([inet]);
      L.loss = Math.round((recent.filter((v) => v == null).length / recent.length) * 100);
      // coupure Internet : 3 échecs d'affilée alors que la Bbox répond (sinon c'est le serveur qui est hors réseau)
      prev.lossStreak = inet == null && gw != null ? (prev.lossStreak || 0) + 1 : 0;
      if (prev.lossStreak >= 3 && !L.down) { L.down = true; L.downSince = Date.now() - 4000; events.add({ type: 'internet_down', level: 'alert', detail: 'Aucune réponse de 1.1.1.1 ni 8.8.8.8' }); }
      if (inet != null && L.down) { const dur = Date.now() - L.downSince; L.down = false; L.downSince = 0; events.add({ type: 'internet_up', level: 'info', detail: String(dur) }); }
      push('latency', inet == null ? null : inet);
      push('lan', gw); // trajet serveur du panel → Bbox, compris dans toutes les mesures
      history.sample({ latency: inet, bboxLatency: gw });
      mark('latency');
    },
    async probes() {
      const todo = probeTargets().filter((t) => !(t.id in SHARED));
      // adresses d'abord (en cache), puis toutes les connexions en même temps, avec une vers la Bbox pour le trajet local
      const targets = await Promise.all(todo.map(async (t) => {
        const host = t.host === '@isp-dns' ? ispDns() : t.host;
        return [t, host ? await resolve(host) : { ip: null, err: 'dns' }];
      }));
      const [gw, ...pings] = await Promise.all([
        probeConf.fromBbox !== false ? tcpPing(bbox.resolvedIp || '192.168.1.254', 443) : null,
        ...targets.map(([t, r]) => (r.ip ? tcpPing(r.ip, t.port || 443) : null)),
      ]);
      const now = Date.now();
      targets.forEach(([t, r], i) => {
        const ms = fromBbox(pings[i], gw);
        probeResult(t.id, r.ip || null, r.ip ? ms : null, !r.ip ? 'dns' : ms == null ? 'timeout' : r.err || null, now);
      });
      mark('probes');
    },
    async wanStats() {
      const r = await get('wan/ip/stats', { auth: false });
      const s = r.wan.ip.stats;
      const W = state.wan;
      const rx = toNum(s.rx.bytes), tx = toNum(s.tx.bytes);
      const changed = rx !== W.rxBytes || tx !== W.txBytes;
      W.down = toNum(s.rx.bandwidth); W.up = toNum(s.tx.bandwidth);
      W.contract = toNum(s.rx.contractualBandwidth); W.link = toNum(s.rx.maxBandwidth);
      W.contractUp = toNum(s.tx.contractualBandwidth); W.linkUp = toNum(s.tx.maxBandwidth);
      W.rxBytes = rx; W.txBytes = tx;
      history.feedCounters(rx, tx);
      history.sample({ down: W.down, up: W.up });
      if (changed || !series.down.length) {
        const now = Date.now();
        if (changed && W.updatedAt) { const dt = now - W.updatedAt; W.interval = W.interval ? Math.round(W.interval * 0.6 + dt * 0.4) : dt; }
        W.updatedAt = now;
        push('down', W.down); push('up', W.up);
        state.today = history.today();
        mark('wan', 'today');
      }
    },
    async cpu() {
      const [c, m] = await Promise.all([get('device/cpu', { auth: false }), get('device/mem', { auth: false })]);
      const t = c.device.cpu.time;
      const busy = toNum(t.user) + toNum(t.nice) + toNum(t.system) + toNum(t.irq) + toNum(t.io);
      const all = busy + toNum(t.idle);
      const p = prev.cpu; prev.cpu = { busy, all };
      if (p && all > p.all) state.cpu.usage = Math.round(Math.max(0, Math.min(100, ((busy - p.busy) / (all - p.all)) * 100)) * 10) / 10;
      state.cpu.temp = toNum(c.device.cpu.temperature?.main) / 1000;
      const mm = m.device.mem;
      state.mem.total = toNum(mm.total);
      state.mem.used = Math.max(0, toNum(mm.total) - toNum(mm.free) - toNum(mm.cached));
      if (p) push('cpu', state.cpu.usage);
      push('temp', state.cpu.temp);
      push('mem', state.mem.total ? Math.round((state.mem.used / state.mem.total) * 1000) / 10 : 0);
      history.sample({ cpu: p ? state.cpu.usage : null, temp: state.cpu.temp });
      // alerte température (avec hystérésis)
      if (state.cpu.temp >= 85 && !prev.hot) { prev.hot = true; events.add({ type: 'temp_high', level: 'warn', detail: String(state.cpu.temp) }); }
      if (state.cpu.temp < 80) prev.hot = false;
      mark('cpu', 'mem');
    },
    async bands() {
      const radios = state.wireless?.wireless?.radio;
      const ids = ['24', '5', '6'].filter((b) => !radios || radios[b]);
      const res = await Promise.all(ids.map((b) => opt(get(`wireless/${b}/stats`))));
      res.forEach((r, i) => {
        if (!r) return;
        const b = ids[i], st = r.wireless.ssid.stats;
        // côté Bbox : tx = vers les appareils (descendant), rx = depuis les appareils (montant)
        const d = rate('w' + b + 'tx', toNum(st.tx.bytes)), u = rate('w' + b + 'rx', toNum(st.rx.bytes));
        if (d !== null) state.bands[b] = { down: Math.round(d * 10) / 10, up: Math.round((u ?? 0) * 10) / 10 };
        push('b' + b, Math.round((state.bands[b].down + state.bands[b].up) * 10) / 10);
      });
      mark('bands');
    },
    async lan() {
      const r = await get('lan/stats', { auth: false });
      state.lanPorts = (r.lan.stats.port || []).map((p) => ({ index: p.index, down: toNum(p.tx?.bandwidth), up: toNum(p.rx?.bandwidth) }));
      push('lanDown', state.lanPorts.reduce((s, p) => s + p.down, 0)); push('lanUp', state.lanPorts.reduce((s, p) => s + p.up, 0));
      mark('lanPorts');
    },
    async hosts() {
      let main, guests;
      try {
        const raw = await get('hosts', { raw: true });
        main = deepFix(raw?.[0] || {}); guests = deepFix(raw?.[1] || {});
      } catch (e) {
        if (e.status !== 401) throw e;
        main = await get('hosts/lite', { auth: false }); guests = {}; // session absente : liste allégée publique
      }
      state.hosts = main.hosts?.list || [];
      state.guestHosts = guests.hosts?.list || [];
      state.stations = main.wirelesshosts || [];
      const active = state.hosts.filter((h) => h.active);
      push('hostsActive', active.length);
      history.sample({ hosts: active.length + state.guestHosts.filter((h) => h.active).length, wifi: active.filter((h) => /wifi/i.test(h.link || '')).length });
      mark('hosts', 'guestHosts', 'stations');
    },
    async summary() { state.summary = await get('summary'); mark('summary'); },
    async sessions() {
      state.sessions = await get('wan/diags/sessions');
      push('sessions', toNum(state.sessions.currentip));
      mark('sessions');
    },
    async statics() {
      const [device, wanIp, lanIp, wireless, services, voip, sff, dns] = await Promise.all([
        get('device'), get('wan/ip'), get('lan/ip'), opt(get('wireless')), get('services'),
        opt(get('voip')), opt(get('wan/sff')), opt(get('dns/stats')),
      ]);
      // redémarrage de la Bbox : l'uptime repart de zéro
      const up = toNum(device?.device?.uptime);
      if (prev.uptime && up && up + 120 < prev.uptime) events.add({ type: 'reboot', level: 'info', detail: String(up) });
      if (up) prev.uptime = up;
      Object.assign(state, { device, wanIp, lanIp, services, sff });
      if (wireless) { state.wireless = wireless; timersRef()?.guestObserved(!!wireless.wireless?.ssid?.guest?.enable); }
      if (voip) state.voip = voip;
      if (dns) state.dns = dns;
      mark('device', 'wanIp', 'lanIp', 'wireless', 'services', 'voip', 'sff', 'dns');
      buildProbes(); // le DNS de l'opérateur est maintenant connu
    },
    async slow() {
      const [lg, nat, firewall, upnp, dhcp] = await Promise.all([
        opt(get('device/log')), opt(get('nat/rules')), opt(get('firewall/rules')), opt(get('upnp/igd/rules')), opt(get('dhcp/clients')),
      ]);
      if (lg) { state.log = lg.log || []; events.ingestBboxLog(state.log); }
      Object.assign(state, { nat, firewall, upnp, dhcp });
      // noms des nouveaux appareils (le journal Bbox ne les donne pas)
      const names = new Map(state.hosts.map((h) => [String(h.macaddress || '').toLowerCase(), fixText(h.userfriendlyname || h.hostname || '')]));
      for (const e of events.query({ types: ['new_device'], limit: 50 })) if (!e.name && names.get(e.mac)) events.rename(e.mac, names.get(e.mac));
      mark('log', 'nat', 'firewall', 'upnp', 'dhcp');
    },
    async graphs() {
      const [temp, cpu, power] = await Promise.all(['graphs/device/temp', 'graphs/device/cpu', 'graphs/device/power/week'].map((p) => opt(get(p, { raw: true, auth: false }))));
      state.graphs = { temp: temp?.data || [], cpu: cpu?.data || [], power: power?.data || [] };
      mark('graphs');
    },
  };

  // ── diffusion ──
  const lastSent = {};
  function sse(res, event, data) { try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client parti */ } }
  function flush() {
    if (!dirty.size && !Object.keys(pushes).length) return;
    const s = {};
    for (const k of dirty) {
      const json = JSON.stringify(state[k]);
      if (lastSent[k] !== json) { lastSent[k] = json; s[k] = state[k]; }
    }
    const p = pushes;
    dirty = new Set(); pushes = {};
    if (!Object.keys(s).length && !Object.keys(p).length) return;
    const msg = { t: Date.now(), s, p };
    for (const c of clients) sse(c, 'patch', msg);
  }
  function broadcast(event, data) { for (const c of clients) sse(c, event, data); }

  // ── ordonnanceur ──
  const running = {};
  async function run(name) {
    if (running[name]) return running[name];
    running[name] = (async () => {
      try {
        await tasks[name]();
        // l'état de la session est diffusé : l'interface peut proposer de se reconnecter
        const auth = pollCookie() ? 'session' : 'public';
        if (auth !== state.auth) { state.auth = auth; mark('auth'); }
      }
      catch (e) { if (e.status !== 401) log(`hub ${name}:`, e.message); }
      finally { running[name] = null; flush(); }
    })();
    return running[name];
  }
  const loops = {};
  function schedule(name, delay) {
    clearTimeout(loops[name]);
    loops[name] = setTimeout(async () => {
      const [act, idle] = SCHED[name];
      const every = clients.size ? act : idle;
      if (every) await run(name);
      schedule(name, every || 5000);
    }, delay);
    loops[name].unref?.();
  }
  async function start() {
    await run('statics');
    await Promise.all(['wanStats', 'cpu', 'summary', 'latency'].map(run));
    state.ready = true; mark('ready'); flush();
    Promise.all(['hosts', 'bands', 'lan', 'sessions', 'slow', 'graphs'].map(run));
    for (const name of Object.keys(SCHED)) schedule(name, SCHED[name][clients.size ? 0 : 1] || 5000);
  }

  function snapshot() {
    return { t: Date.now(), state, series, events: events.query({ limit: 40 }), unread: events.unread(), history: { since: history.since() } };
  }
  function addClient(req, res, headers = {}) {
    res.writeHead(200, { ...headers, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.write('retry: 3000\n\n');
    const wasIdle = clients.size === 0;
    clients.add(res);
    sse(res, 'snapshot', snapshot());
    const hb = setInterval(() => { try { res.write(': ping\n\n'); } catch { /* */ } }, 20000);
    req.on('close', () => { clearInterval(hb); clients.delete(res); });
    // un écran vient de s'ouvrir : on repasse tout de suite en cadence rapide
    if (wasIdle) ['latency', 'probes', 'wanStats', 'cpu', 'bands', 'lan', 'hosts', 'summary', 'sessions'].forEach((n) => schedule(n, 50));
  }
  function refresh(names) { for (const n of names) if (tasks[n]) run(n); }
  function afterWrite(apiPath) {
    const names = new Set();
    for (const [re, ns] of AFTER_WRITE) if (re.test(apiPath)) ns.forEach((n) => names.add(n));
    if (!names.size) return;
    setTimeout(() => refresh(names), 400);
    setTimeout(() => refresh(names), 2500);
  }
  function setTimers(list) { state.timers = list; mark('timers'); flush(); }
  function emitEvents(evs) { broadcast('events', { events: evs, unread: events.unread() }); }

  return { start, addClient, refresh, afterWrite, setTimers, setProbes, emitEvents, state, series, get clients() { return clients.size; } };
}
