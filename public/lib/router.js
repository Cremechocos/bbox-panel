// Routage par fragment (#/route/argument), partagé par la coquille, les vues et la palette.
import { useEffect, useState } from '/vendor/hooks.mjs';

export const parseHash = () => {
  const [id = 'accueil', ...rest] = location.hash.replace(/^#\/?/, '').split('?')[0].split('/');
  return { id: id || 'accueil', arg: decodeURIComponent(rest.join('/')) };
};
export const go = (id, arg) => { location.hash = '#/' + id + (arg ? '/' + encodeURIComponent(arg) : ''); };
export function useRoute() {
  const [r, setR] = useState(parseHash());
  useEffect(() => { const f = () => setR(parseHash()); window.addEventListener('hashchange', f); return () => window.removeEventListener('hashchange', f); }, []);
  return r;
}
