// Routage par fragment (#/route/argument), partagé par la coquille, les vues et la palette.
import { useSyncExternalStore } from 'react';

export type Route = { id: string; arg: string };
export const parseHash = (): Route => {
  const [id = 'accueil', ...rest] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return { id: id || 'accueil', arg: decodeURIComponent(rest.join('/')) };
};
export const go = (id: string, arg?: string) => { location.hash = '#/' + id + (arg ? '/' + encodeURIComponent(arg) : ''); };
let cur = parseHash();
const subs = new Set<() => void>();
window.addEventListener('hashchange', () => { cur = parseHash(); subs.forEach((f) => f()); });
export function useRoute(): Route {
  return useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => cur);
}
