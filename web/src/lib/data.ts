// Données : cache partagé par chemin, invalidation après écriture, retours visuels (toasts).
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { toast as sonner } from 'sonner';
import { api, errMsg } from './api';
export { errMsg } from './api';

type Entry = { data?: any; error?: any; t: number; p?: Promise<any> | null };
const cache = new Map<string, Entry>();
const watchers = new Map<string, Set<() => void>>();
const notifyKey = (key: string) => (watchers.get(key) || new Set()).forEach((f) => f());

export async function load(path: string, { force = false, raw = false, maxAge = 4000 } = {}): Promise<any> {
  const key = (raw ? 'raw:' : '') + path;
  const c = cache.get(key);
  if (!force && c && c.data !== undefined && Date.now() - c.t < maxAge) return c.data;
  if (c?.p) return c.p;
  const p = (raw ? api.raw(path) : api.get(path)).then(
    (data) => { cache.set(key, { data, t: Date.now() }); notifyKey(key); return data; },
    (error) => { cache.set(key, { ...(cache.get(key) || { t: 0 }), error, p: null, t: Date.now() }); notifyKey(key); throw error; },
  );
  cache.set(key, { ...(c || { t: 0 }), p });
  return p;
}
export function invalidate(...prefixes: string[]) {
  for (const key of watchers.keys()) {
    const path = key.replace(/^raw:/, '');
    if (!prefixes.length || prefixes.some((p) => path === p || path.startsWith(p))) load(path, { force: true, raw: key.startsWith('raw:') }).catch(() => {});
  }
}
/** useApi('wireless') ou useApi(['wireless','hosts']) → { data, loading, error, reload } */
export function useApi<T = any>(paths: string | string[], { poll = 0, raw = false } = {}): { data: T; loading: boolean; error: any; reload: () => void } {
  const list = Array.isArray(paths) ? paths : [paths];
  const keyStr = list.join('|');
  const [, setTick] = useState(0);
  useEffect(() => {
    const keys = list.map((p) => (raw ? 'raw:' : '') + p);
    const f = () => setTick((t) => t + 1);
    keys.forEach((k) => { if (!watchers.has(k)) watchers.set(k, new Set()); watchers.get(k)!.add(f); });
    list.forEach((p) => load(p, { raw }).catch(() => {}));
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (poll) {
      const tick = () => { if (!document.hidden) list.forEach((p) => load(p, { raw, force: true }).catch(() => {})); timer = setTimeout(tick, poll); };
      timer = setTimeout(tick, poll);
    }
    return () => { clearTimeout(timer); keys.forEach((k) => watchers.get(k)?.delete(f)); };
  }, [keyStr, poll]);
  const entries = list.map((p) => cache.get((raw ? 'raw:' : '') + p) || ({ t: 0 } as Entry));
  const data = entries.map((e) => e.data);
  const error = entries.find((e) => e.error && e.data === undefined)?.error;
  const loading = entries.some((e) => e.data === undefined && !e.error);
  const reload = () => list.forEach((p) => load(p, { raw, force: true }).catch(() => {}));
  return { data: (Array.isArray(paths) ? data : data[0]) as T, loading, error, reload };
}
/** Requête ponctuelle (panel.history…) avec rechargement */
export function useFetch<T = any>(fn: () => Promise<T>, deps: unknown[] = [], { poll = 0 } = {}) {
  const [st, setSt] = useState<{ data: T | undefined; error: any; loading: boolean }>({ data: undefined, error: null, loading: true });
  const run = useCallback(() => fn().then((data) => setSt({ data, error: null, loading: false }), (error) => setSt((o) => ({ ...o, error, loading: false }))), deps);
  useEffect(() => {
    setSt((o) => ({ ...o, loading: true }));
    run();
    if (!poll) return;
    const t = setInterval(() => { if (!document.hidden) run(); }, poll);
    return () => clearInterval(t);
  }, deps);
  return { ...st, reload: run };
}

// Point de rupture mobile (≤ 760 px), partagé
const MQ = '(max-width: 760px)';
const mql = window.matchMedia(MQ);
export function useMobile(): boolean {
  return useSyncExternalStore((f) => { mql.addEventListener('change', f); return () => mql.removeEventListener('change', f); }, () => mql.matches);
}

/** Retour visuel bref (en bas de l'écran) : toast('Enregistré') · toast('Erreur', 'err') · toast('…', 'alert', { label, onClick }) */
export function toast(msg: string, kind: 'ok' | 'err' | 'alert' | 'info' = 'ok', action?: { label: string; onClick: () => void }) {
  const opts = { action: action ? { label: action.label, onClick: action.onClick } : undefined };
  if (kind === 'err') return sonner.error(msg, { ...opts, duration: 6000 });
  if (kind === 'alert') return sonner.warning(msg, { ...opts, duration: 6000 });
  if (kind === 'info') return sonner(msg, opts);
  return sonner.success(msg, { ...opts, duration: 2800 });
}

/** Exécute une écriture : toast de succès/erreur + rafraîchissement des données concernées */
export async function act<T>(fn: () => Promise<T>, { ok = 'Enregistré', refresh = [] as string[], silent = false } = {}): Promise<T> {
  try {
    const r = await fn();
    if (!silent && ok) toast(ok);
    if (refresh.length) setTimeout(() => invalidate(...refresh), 350);
    return r;
  } catch (e) {
    toast(errMsg(e), 'err');
    if (refresh.length) invalidate(...refresh);
    throw e;
  }
}
