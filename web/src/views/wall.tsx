// Mode écran mural : plein écran en temps réel pour une tablette ou une TV (l'écran reste allumé).
// Entièrement personnalisable (tuiles, ordre, tailles, options, thème, taille du texte, couleurs,
// atténuation la nuit, anti-marquage), enregistré sur l'appareil. Cadre propre à chaque apparence :
// cartes Bouygues en Bbox Clair, chiffres et filets sur fond noir en Noir Geist « Ligne ».
import * as React from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import { Btn } from '@/components/kit';
import { Bytel, Icon } from '@/components/icon';
import { useLive, internetOk } from '@/lib/live';
import { useAppearance } from '@/lib/theme';
import { go, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';
import { useWallCfg, ACCENTS } from './mural/config';
import { WidgetView } from './mural/widgets';
import { WallEditor } from './mural/editor';

const EASE = [0.22, 1, 0.36, 1] as const;
const toMin = (hhmm: string) => { const [h, m] = String(hhmm || '0:0').split(':').map(Number); return (h || 0) * 60 + (m || 0); };
/** Dans la plage [de, à[ (qui peut passer minuit) */
const inRange = (d: Date, from: string, to: string) => {
  const n = d.getHours() * 60 + d.getMinutes(), a = toMin(from), b = toMin(to);
  return a === b ? false : a < b ? n >= a && n < b : n >= a || n < b;
};

function HeaderClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 5000); return () => clearInterval(t); }, []);
  return <span className="wall-md wall-num num">{now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</span>;
}

export default function Wall({ route: _route }: { route: Route }) {
  const s = useLive();
  const c = useWallCfg();
  const a = useAppearance();
  const [edit, setEdit] = useState(false);
  const [ui, setUi] = useState(true);
  const [full, setFull] = useState(() => !!document.fullscreenElement);
  const [night, setNight] = useState(false);
  const [shift, setShift] = useState({ x: 0, y: 0 });
  const hideT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editRef = useRef(edit);
  editRef.current = edit;

  // L'écran reste allumé (Wake Lock) ; Échap ferme le panneau, puis le mode mural
  useEffect(() => {
    let lock: WakeLockSentinel | null = null, alive = true;
    const req = () => navigator.wakeLock?.request('screen').then((l) => { if (alive) lock = l; else l.release().catch(() => {}); }).catch(() => {});
    req();
    const vis = () => { if (!document.hidden) req(); };
    document.addEventListener('visibilitychange', vis);
    const key = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key === 'Escape') {
        if (document.querySelector('[role=alertdialog]')) return;
        (t as HTMLInputElement | null)?.blur?.();
        if (editRef.current) setEdit(false); else if (!document.fullscreenElement) go('accueil');
        return;
      }
      if (t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return; // raccourcis inactifs pendant la saisie
      if ((e.key === 'p' || e.key === ',') && !e.metaKey && !e.ctrlKey) setEdit((v) => !v);
      else if (e.key === 'f' && !e.metaKey && !e.ctrlKey) toggleFull();
    };
    window.addEventListener('keydown', key);
    const fs = () => setFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', fs);
    document.title = 'Mode mural · Ma Bbox';
    return () => {
      alive = false;
      lock?.release().catch(() => {});
      document.removeEventListener('visibilitychange', vis); window.removeEventListener('keydown', key); document.removeEventListener('fullscreenchange', fs);
    };
  }, []);

  // Les commandes et le curseur s'effacent après quelques secondes sans activité
  useEffect(() => {
    const wake = () => {
      setUi(true); clearTimeout(hideT.current);
      if (c.hideAfter > 0 && !editRef.current) hideT.current = setTimeout(() => setUi(false), c.hideAfter * 1000);
    };
    wake();
    const evs = ['pointermove', 'pointerdown', 'keydown', 'touchstart'] as const;
    evs.forEach((e) => window.addEventListener(e, wake, { passive: true }));
    return () => { clearTimeout(hideT.current); evs.forEach((e) => window.removeEventListener(e, wake)); };
  }, [c.hideAfter, edit]);

  // Atténuation la nuit (vérifiée chaque minute)
  useEffect(() => {
    const check = () => setNight(c.dim.on && inRange(new Date(), c.dim.from, c.dim.to));
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, [c.dim.on, c.dim.from, c.dim.to]);

  // Anti-marquage : décalage de quelques pixels toutes les 2 minutes
  useEffect(() => {
    if (!c.shift) { setShift({ x: 0, y: 0 }); return; }
    const t = setInterval(() => setShift({ x: Math.round(Math.random() * 12 - 6), y: Math.round(Math.random() * 10 - 5) }), 120000);
    return () => clearInterval(t);
  }, [c.shift]);

  // Thème propre à l'écran mural (sans toucher au réglage de l'application)
  useLayoutEffect(() => {
    if (c.theme === 'app') return;
    const root = document.documentElement, meta = document.querySelector('meta[name="theme-color"]');
    const prevMeta = meta?.getAttribute('content');
    root.dataset.theme = c.theme;
    meta?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
    window.dispatchEvent(new Event('bp:retint'));
    return () => {
      root.dataset.theme = a.theme;
      if (prevMeta) meta?.setAttribute('content', prevMeta);
      window.dispatchEvent(new Event('bp:retint'));
    };
  }, [c.theme, a.theme, a.skin]);

  const canFull = typeof document.documentElement.requestFullscreen === 'function';
  function toggleFull() { (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen())?.catch(() => {}); }

  const accent = ACCENTS.find((x) => x.id === c.accent) || ACCENTS[0];
  const style = {
    '--wall-scale': c.scale,
    '--wall-accent': accent.color,
    '--wall-accent-2': c.accent === 'auto' ? 'var(--up)' : c.accent === 'mono' ? 'var(--muted-foreground)' : `color-mix(in oklab, ${accent.color} 45%, var(--muted-foreground))`,
  } as React.CSSProperties;
  const visible = c.widgets.filter((w) => w.on);
  const ok = internetOk(s);
  const clockTile = visible.some((w) => w.id === 'clock');

  return (
    <div data-density={c.density} style={style}
      className={cn('wall relative flex min-h-dvh flex-col bg-background text-foreground lg:h-dvh lg:overflow-hidden',
        'px-[var(--wall-edge)] pb-[calc(var(--wall-edge)+env(safe-area-inset-bottom))] pt-[calc(var(--wall-edge)*0.8+env(safe-area-inset-top))]',
        edit && 'xl:pr-[calc(400px+var(--wall-edge))]', !ui && !edit && 'cursor-none')}>
      <div className="flex min-h-0 flex-1 flex-col transition-transform duration-[2000ms] ease-in-out" style={{ transform: `translate(${shift.x}px, ${shift.y}px)` }}>
        {c.header.on && (
          <header className="wall-text enter mb-[var(--wall-gap)] flex min-w-0 items-center gap-[0.8em]">
            <Bytel className="size-[2.6em] shrink-0 geist:hidden" />
            <span className="hidden size-[2em] shrink-0 place-items-center rounded-[0.5em] bg-foreground text-background geist:grid" aria-hidden><Bytel className="size-[1.3em] [--logo:var(--background)]" /></span>
            <div className="min-w-0">
              <div className="truncate font-semibold geist:font-medium">{c.header.title?.trim() || 'Ma Bbox'}</div>
              <div className="wall-small truncate text-muted-foreground geist:hidden">Bouygues Telecom</div>
            </div>
            <span className="flex-1" />
            {c.header.clock && !clockTile && <HeaderClock />}
            <span className={cn('wall-small inline-flex h-[2.4em] shrink-0 items-center gap-[0.55em] whitespace-nowrap rounded-full px-[1em] font-semibold',
              ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger', 'geist:h-auto geist:bg-transparent geist:px-0 geist:font-medium geist:text-muted-foreground')}>
              <span className={cn('live-dot', !ok && 'bad')} aria-hidden />{ok ? 'Internet connecté' : 'Internet coupé'}
            </span>
          </header>
        )}

        {visible.length ? (
          <LayoutGroup>
            <div className="grid min-h-0 grid-cols-12 gap-[var(--wall-gap)] md:grid-flow-row-dense lg:flex-1 lg:auto-rows-[minmax(var(--wall-row),1fr)]">
              {visible.map((w) => <WidgetView key={w.id} w={w} s={s} edit={edit} />)}
            </div>
          </LayoutGroup>
        ) : (
          <div className="grid flex-1 place-items-center text-center">
            <div className="grid justify-items-center gap-3">
              <Icon name="layout" className="size-10 text-muted-foreground" strokeWidth={1.5} />
              <div className="wall-text text-muted-foreground">Aucune tuile n’est affichée.</div>
              <Btn icon="sliders" onClick={() => setEdit(true)}>Personnaliser</Btn>
            </div>
          </div>
        )}
      </div>

      {/* atténuation la nuit : un voile noir, jamais pendant les réglages */}
      <div aria-hidden className="pointer-events-none fixed inset-0 z-40 bg-black transition-opacity duration-[2000ms]" style={{ opacity: night && !edit ? c.dim.level : 0 }} />

      <AnimatePresence>
        {(ui || edit) && !edit && (
          <motion.div role="toolbar" aria-label="Commandes du mode mural" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.3, ease: EASE }}
            className={cn('fixed bottom-[calc(18px+env(safe-area-inset-bottom))] left-1/2 z-50 flex max-w-[calc(100vw-24px)] -translate-x-1/2 gap-1.5 rounded-full p-1.5',
              'border border-[var(--card-border)] bg-[color-mix(in_oklab,var(--card)_86%,transparent)] shadow-pop backdrop-blur-[14px] backdrop-saturate-150',
              'geist:glass geist:border-0')}>
            <Btn kind="soft" size="sm" icon="sliders" onClick={() => setEdit(true)} className="rounded-full clair:rounded-full geist:rounded-full">Personnaliser</Btn>
            {canFull && <Btn kind="soft" size="sm" icon={full ? 'shrink' : 'expand'} onClick={toggleFull} className="rounded-full clair:rounded-full geist:rounded-full max-sm:hidden">{full ? 'Quitter le plein écran' : 'Plein écran'}</Btn>}
            <Btn kind="soft" size="sm" icon="x" onClick={() => go('accueil')} className="rounded-full clair:rounded-full geist:rounded-full">Fermer</Btn>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{edit && <WallEditor onClose={() => setEdit(false)} />}</AnimatePresence>
    </div>
  );
}
