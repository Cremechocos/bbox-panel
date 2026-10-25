// Minuteurs persistés : pause Internet immédiate d'un appareil (règles de pare-feu retirées
// automatiquement) et Wi-Fi invité temporaire. Survivent au redémarrage du serveur.
import fs from 'node:fs';
import crypto from 'node:crypto';

const MAC_RE = /^([0-9a-f]{2}:){5}[0-9a-f]{2}$/;
const IP_RE = /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/;

export function createTimers({ file, bbox, getCookie, events, onChange = () => {}, log = () => {} }) {
  let timers = [];
  try { timers = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* premier lancement */ }
  const persist = () => fs.writeFile(file, JSON.stringify(timers, null, 1), { mode: 0o600 }, (e) => e && log('timers persist', e.message));
  const changed = () => { persist(); onChange(list()); };

  async function call(method, path, data) {
    const cookie = getCookie();
    if (!cookie) { const e = new Error('no_session'); e.status = 401; throw e; }
    const r = await bbox.call(method, '/api/v1/' + path, { cookie, data });
    if (r.status >= 300) { const e = new Error(`bbox_${r.status}`); e.status = r.status; e.body = r.body.toString('utf8').slice(0, 300); throw e; }
    return r;
  }
  async function getJson(path) {
    const r = await bbox.rawRequest('GET', '/api/v1/' + path, { cookie: getCookie() });
    if (r.status !== 200) throw new Error(`bbox_${r.status}`);
    return JSON.parse(r.body.toString('utf8'));
  }
  // Les règles IPv4 et IPv6 sont listées séparément (firewall/rules, firewallv6/rules) mais partagent la numérotation
  // et se suppriment toutes deux par DELETE firewall/rules/{id}.
  async function findRule(desc, ipprotocol) {
    const lists = ipprotocol === 'IPv4' ? ['firewall/rules'] : ipprotocol === 'IPv6' ? ['firewallv6/rules'] : ['firewall/rules', 'firewallv6/rules'];
    const ids = [];
    for (const l of lists) {
      const j = await getJson(l);
      for (const r of j?.[0]?.firewall?.rules || []) if (r.description === desc && (!ipprotocol || r.ipprotocol === ipprotocol)) ids.push(r.id);
    }
    return ids;
  }

  // ── Pause Internet d'un appareil ──
  // IPv4 : règle « Drop » sur l'adresse de l'appareil. IPv6 : règle « Drop » sur son adresse MAC.
  async function startPause({ mac, ip, name = '', until }) {
    mac = String(mac || '').toLowerCase();
    if (!MAC_RE.test(mac)) throw Object.assign(new Error('bad_mac'), { status: 400 });
    if (ip && !IP_RE.test(ip)) throw Object.assign(new Error('bad_ip'), { status: 400 });
    const end = Number(until);
    if (!end || end <= Date.now() || end > Date.now() + 7 * 86400_000) throw Object.assign(new Error('bad_until'), { status: 400 });
    const existing = timers.find((t) => t.type === 'pause' && t.mac === mac);
    if (existing) { existing.until = end; changed(); return existing; }
    const desc = 'Pause panel ' + mac.replace(/:/g, '');
    const rules = [];
    const base = { description: desc, action: 'Drop', protocols: 'tcp,udp', srcipnot: 0, dstip: '', dstipnot: 0, srcports: '', dstports: '', enable: 1 };
    try {
      if (ip) {
        await call('POST', 'firewall/rules', { ...base, srcip: ip, ipprotocol: 'IPv4' });
        rules.push(...(await findRule(desc, 'IPv4')));
      }
      try {
        await call('POST', 'firewallv6/rules', { ...base, srcip: '', srcmacs: mac, srcmacnot: 0, ipprotocol: 'IPv6' });
        rules.push(...(await findRule(desc, 'IPv6')));
      } catch (e) { log('pause v6 refusée', e.message, e.body || ''); }
      if (!rules.length) throw Object.assign(new Error('rule_not_created'), { status: 502 });
      // le pare-feu doit être actif pour que la règle s'applique
      await call('PUT', 'firewall', { enable: 1 }).catch(() => {});
    } catch (e) {
      for (const id of rules) await call('DELETE', 'firewall/rules/' + id).catch(() => {});
      throw e;
    }
    const t = { id: crypto.randomBytes(5).toString('hex'), type: 'pause', mac, ip: ip || '', name, until: end, started: Date.now(), rules: [...new Set(rules)] };
    timers.push(t);
    events?.add({ type: 'pause_start', mac, ip, name, level: 'info', detail: new Date(end).toISOString() });
    changed();
    return t;
  }
  async function endPause(mac, reason = 'manual') {
    mac = String(mac || '').toLowerCase();
    const t = timers.find((x) => x.type === 'pause' && x.mac === mac);
    if (!t) return false;
    const desc = 'Pause panel ' + mac.replace(/:/g, '');
    let ids = t.rules;
    try { ids = [...new Set([...t.rules, ...(await findRule(desc))])]; } catch { /* hors ligne : on garde les ids connus */ }
    let ok = true;
    for (const id of ids) {
      try { await call('DELETE', 'firewall/rules/' + id); } catch (e) { if (e.status !== 404) ok = false; }
    }
    if (!ok) { t.retry = (t.retry || 0) + 1; persist(); throw Object.assign(new Error('rule_delete_failed'), { status: 502 }); }
    timers = timers.filter((x) => x !== t);
    events?.add({ type: 'pause_end', mac, ip: t.ip, name: t.name, level: 'info', detail: reason });
    changed();
    return true;
  }

  // ── Wi-Fi invité temporaire ──
  async function startGuest({ until }) {
    const end = Number(until);
    if (!end || end <= Date.now() || end > Date.now() + 7 * 86400_000) throw Object.assign(new Error('bad_until'), { status: 400 });
    await call('PUT', 'wireless/guestenable', { enable: 1 });
    timers = timers.filter((x) => x.type !== 'guest');
    const t = { id: crypto.randomBytes(5).toString('hex'), type: 'guest', until: end, started: Date.now() };
    timers.push(t);
    events?.add({ type: 'guest_on', level: 'info', detail: new Date(end).toISOString() });
    changed();
    return t;
  }
  async function endGuest(reason = 'manual', { disable = true } = {}) {
    const had = timers.some((x) => x.type === 'guest');
    if (disable) await call('PUT', 'wireless/guestenable', { enable: 0 });
    timers = timers.filter((x) => x.type !== 'guest');
    if (had || disable) events?.add({ type: 'guest_off', level: 'info', detail: reason });
    changed();
    return true;
  }
  /** Le Wi-Fi invité a été coupé ailleurs (interface officielle, bouton) : on oublie le minuteur */
  function guestObserved(enabled) {
    if (!enabled && timers.some((x) => x.type === 'guest' && Date.now() - x.started > 20_000)) { timers = timers.filter((x) => x.type !== 'guest'); changed(); }
  }

  // ── Échéances ──
  let busy = false;
  async function tick() {
    if (busy) return; busy = true;
    try {
      const now = Date.now();
      for (const t of [...timers]) {
        if (t.until > now) continue;
        if (t.retry > 30) { timers = timers.filter((x) => x !== t); changed(); continue; }
        try { if (t.type === 'pause') await endPause(t.mac, 'expired'); else if (t.type === 'guest') await endGuest('expired'); }
        catch (e) { log('minuteur', t.type, e.message); t.retry = (t.retry || 0) + 1; persist(); }
      }
    } finally { busy = false; }
  }
  setInterval(tick, 10_000).unref();
  setTimeout(tick, 3000).unref();

  const list = () => timers.map(({ id, type, mac, ip, name, until, started }) => ({ id, type, mac, ip, name, until, started }));
  return { startPause, endPause, startGuest, endGuest, guestObserved, list, tick };
}
