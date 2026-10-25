// Coquille de l'application : démarrage, connexion, mise en page (Bbox Clair : barre latérale ;
// Noir Geist « Ligne » : components/shell-ligne ; iPhone : en-tête compact + barre d'onglets).
// Les indicateurs de navigation glissent en CSS (transform) : ils restent fluides pendant le
// chargement de l'écran suivant, contrairement à une animation pilotée par le fil principal.
import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { Tooltip } from 'radix-ui';
import { Toaster } from '@/components/ui/sonner';
import { Bytel, Icon } from '@/components/icon';
import { IconBtn, Skeleton, Tip } from '@/components/kit';
import { OverlayHost, closeAllSheets } from '@/components/overlays';
import { NotifyHost } from '@/components/notify';
import { Palette, openPalette } from '@/components/palette';
import { Bell } from '@/components/alerts';
import { Login } from '@/components/login';
import { Sparkline } from '@/components/charts';
import { LigneSidebar, LigneTopbar, LigneCommandBar, LigneMobileHeader, LigneTabBar, useMiniNav, useNavShift } from '@/components/shell-ligne';
import { panel, onAuthLost } from '@/lib/api';
import { start as startLive, stop as stopLive, useLiveValue, live } from '@/lib/live';
import { ROUTES, GROUPS, TABS, routeOf } from '@/lib/routes';
import { useRoute, go, type Route } from '@/lib/router';
import { useAppearance, toggleTheme } from '@/lib/theme';
import { useMobile } from '@/lib/data';
import { loadPrefs } from '@/lib/prefs';
import { cn } from '@/lib/utils';

const VIEWS: Record<string, ComponentType<{ route: Route; onLogout?: () => void }>> = {
  accueil: lazy(() => import('@/views/home')),
  activite: lazy(() => import('@/views/activity')),
  stats: lazy(() => import('@/views/stats')),
  appareils: lazy(() => import('@/views/devices')),
  wifi: lazy(() => import('@/views/wifi')),
  controle: lazy(() => import('@/views/control')),
  reseau: lazy(() => import('@/views/network')),
  securite: lazy(() => import('@/views/security')),
  telephone: lazy(() => import('@/views/phone')),
  diagnostic: lazy(() => import('@/views/diag')),
  bbox: lazy(() => import('@/views/bbox')),
  apparence: lazy(() => import('@/views/appearance')),
  plus: lazy(() => import('@/views/more')),
  mural: lazy(() => import('@/views/wall')),
  carte: lazy(() => import('@/views/card')),
};
// Noir Geist « Ligne » : accueil dédié (statut, chiffres, trafic, appareils, activité)
const HomeLigne = lazy(() => import('@/views/home-ligne'));
// préchargement discret des écrans les plus utilisés
const prefetch = () => { import('@/views/home'); import('@/views/devices'); import('@/views/wifi'); import('@/views/activity'); import('@/views/stats'); };

const latFmt = (v: number | null) => (v == null ? '—' : v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));

/** Indicateur glissant (CSS transform) sous l'élément actif d'une barre de navigation */
function useSlider(dep: unknown, axis: 'x' | 'y', scale = false) {
  const box = useRef<HTMLDivElement>(null), bar = useRef<HTMLSpanElement>(null);
  const first = useRef(true);
  useLayoutEffect(() => {
    const place = () => {
      const c = box.current, b = bar.current, el = c?.querySelector<HTMLElement>('[aria-current="page"]');
      if (!c || !b) return;
      if (!el) { b.style.opacity = '0'; return; }
      const off = axis === 'x' ? el.offsetLeft : el.offsetTop;
      b.style.transition = first.current ? 'none' : '';
      b.style.opacity = '1';
      b.style.transform = axis === 'x' ? `translateX(${off}px)${scale ? ` scaleX(${el.offsetWidth / 100})` : ''}` : `translateY(${off}px)`;
      first.current = false;
    };
    place();
    const ro = new ResizeObserver(place);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [dep, axis, scale]);
  return { box, bar };
}

/** Pastille « Internet 12 ms » + mini-courbe (en direct) */
function LatencyPill() {
  const lat = useLiveValue((s) => s.latency?.internet ?? null);
  const down = useLiveValue((s) => s.latency?.down || false);
  const ready = useLiveValue((s) => s.ready);
  useLiveValue((s) => s.series.latency[s.series.latency.length - 1]?.t || 0);
  if (!ready) return null;
  return (
    <Tip label="Latence vers Internet, mesurée toutes les 2 s">
      <a href="#/stats" className="hidden h-9 items-center gap-2.5 rounded-[10px] px-3 text-[13px] text-muted-foreground transition-colors hover:bg-accent lg:flex geist:rounded-lg geist:border geist:border-border">
        <span className={cn('live-dot', down && 'bad')} />
        {down ? <span className="font-medium text-danger">Internet coupé</span> : <span>Internet <b className="num inline-block min-w-[4.6ch] text-right font-semibold text-foreground">{latFmt(lat)} ms</b></span>}
        {!down && <span className="h-5 w-14"><Sparkline data={live.series.latency.slice(-40)} color="var(--lat)" height={20} width={56} fill={false} /></span>}
      </a>
    </Tip>
  );
}
function SearchButton() {
  return (
    <button type="button" onClick={openPalette} aria-label="Rechercher (⌘K)"
      className="flex h-9 w-[210px] items-center gap-2.5 rounded-[10px] border border-input bg-card pl-3 pr-1.5 text-[13.5px] text-muted-foreground shadow-[0_1px_2px_rgba(0,0,0,.03)] transition-colors hover:text-foreground max-xl:w-[170px] geist:rounded-lg geist:bg-transparent">
      <Icon name="search" className="size-4" /><span className="flex-1 truncate text-left">Rechercher…</span>
      <kbd className="rounded-md border border-border bg-secondary px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">⌘K</kbd>
    </button>
  );
}
function ThemeBtn({ className }: { className?: string }) {
  const a = useAppearance();
  const label = a.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre';
  return (
    <Tip label={label}>
      <button type="button" onClick={toggleTheme} aria-label={label}
        className={cn('relative grid size-9 place-items-center overflow-hidden rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground geist:rounded-lg max-sm:size-11', className)}>
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={a.theme} className="grid place-items-center" initial={{ rotate: -90, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.5, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            <Icon name={a.theme === 'dark' ? 'sun' : 'moon'} className="size-[18px]" />
          </motion.span>
        </AnimatePresence>
      </button>
    </Tip>
  );
}

// ───────── Bbox Clair : barre latérale ─────────
function Sidebar({ route, onLogout }: { route: Route; onLogout: () => void }) {
  const unread = useLiveValue((s) => s.unread || 0);
  const { box, bar } = useSlider(route.id, 'y');
  const item = 'relative flex h-10 items-center gap-3 rounded-xl px-3 text-[14px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--sidebar-primary)]/60';
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[264px] flex-col bg-sidebar text-sidebar-foreground shadow-[inset_-1px_0_0_var(--sidebar-border)]">
      <a href="#/accueil" className="flex items-center gap-3 px-6 pb-5 pt-6">
        <Bytel className="size-9 text-white" />
        <div className="leading-tight"><b className="block text-[17px] font-semibold tracking-tight text-white">Ma Bbox</b><small className="text-[12px] text-sidebar-muted">Bouygues Telecom</small></div>
      </a>
      <nav className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-4" aria-label="Navigation principale">
        <div ref={box} className="relative">
          <span ref={bar} aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-10 rounded-xl bg-sidebar-accent opacity-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,.05)] transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]" />
          {GROUPS.map((g) => (
            <div key={g} className="mb-2">
              <div className="px-3 pb-1.5 pt-3 text-[11px] font-semibold uppercase tracking-[0.09em] text-sidebar-muted">{g}</div>
              {ROUTES.filter((r) => r.group === g).map((r) => {
                const on = route.id === r.id;
                return (
                  <a key={r.id} href={'#/' + r.id} aria-current={on ? 'page' : undefined} className={cn(item, on ? 'text-white' : 'text-sidebar-foreground hover:bg-white/[.05] hover:text-white')}>
                    <Icon name={r.icon} className={cn('relative size-[18px] transition-colors', on ? 'text-[var(--sidebar-primary)]' : 'text-sidebar-muted')} />
                    <span className="relative flex-1 truncate">{r.label}</span>
                    {r.id === 'activite' && unread > 0 && <span className="num relative grid h-5 min-w-5 place-items-center rounded-full bg-[var(--sidebar-primary)] px-1.5 text-[11px] font-bold text-sidebar">{unread > 99 ? '99+' : unread}</span>}
                  </a>
                );
              })}
            </div>
          ))}
        </div>
      </nav>
      <div className="grid gap-0.5 border-t border-sidebar-border px-3 pb-4 pt-3">
        <a href="#/apparence" aria-current={route.id === 'apparence' ? 'page' : undefined} className={cn(item, route.id === 'apparence' ? 'bg-sidebar-accent text-white' : 'text-sidebar-foreground hover:bg-white/[.05] hover:text-white')}><Icon name="palette" className="size-[18px] text-sidebar-muted" />Apparence</a>
        <a href="#/mural" className={cn(item, 'text-sidebar-foreground hover:bg-white/[.05] hover:text-white')}><Icon name="expand" className="size-[18px] text-sidebar-muted" />Mode mural</a>
        <button type="button" onClick={onLogout} className={cn(item, 'text-sidebar-foreground hover:bg-white/[.05] hover:text-white')}><Icon name="logout" className="size-[18px] text-sidebar-muted" />Se déconnecter</button>
      </div>
    </aside>
  );
}
function useScrolled(px: number) {
  const [s, setS] = useState(false);
  useEffect(() => { const f = () => setS(window.scrollY > px); f(); window.addEventListener('scroll', f, { passive: true }); return () => window.removeEventListener('scroll', f); }, [px]);
  return s;
}
function Topbar({ route }: { route: Route }) {
  const def = routeOf(route.id);
  const scrolled = useScrolled(8);
  return (
    <header data-app-header className={cn('sticky top-0 z-20 flex h-16 items-center gap-2.5 bg-background/80 px-8 backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300 max-lg:px-6', scrolled && 'shadow-[inset_0_-1px_0_var(--border)]')}>
      <nav aria-label="Fil d’Ariane" className="flex min-w-0 flex-1 items-center gap-1.5 text-[14px] text-muted-foreground">
        <span className="truncate">{def?.group || 'Ma Bbox'}</span><Icon name="chevron" className="size-4 shrink-0 opacity-60" /><b className="truncate font-semibold text-foreground">{def?.label}</b>
      </nav>
      <LatencyPill />
      <SearchButton />
      <Bell />
      <ThemeBtn />
    </header>
  );
}

// ───────── iPhone : en-tête compact + barre d'onglets ─────────
function MobileHeader({ title }: { title: string }) {
  const scrolled = useScrolled(44);
  return (
    <header data-app-header className={cn('sticky top-0 z-20 flex items-center gap-0.5 bg-background/80 pl-2 pr-1 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150 transition-shadow duration-300', scrolled && 'shadow-[inset_0_-1px_0_var(--border)]')}>
      <a href="#/accueil" aria-label="Accueil" className="grid size-11 shrink-0 place-items-center"><Bytel className="size-7" /></a>
      <div className="relative h-14 min-w-0 flex-1 overflow-hidden">
        <span className={cn('absolute inset-0 flex items-center truncate text-[16px] font-semibold tracking-[-0.01em] transition-[opacity,transform] duration-300', scrolled ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0')}>{title}</span>
        <span className={cn('absolute inset-0 flex items-center text-[16px] font-semibold tracking-[-0.01em] transition-[opacity,transform] duration-300', scrolled ? '-translate-y-2 opacity-0' : 'translate-y-0 opacity-100')}>Ma Bbox</span>
      </div>
      <IconBtn icon="search" label="Rechercher" tip={false} onClick={openPalette} />
      <Bell />
    </header>
  );
}
function TabBar({ route }: { route: Route }) {
  const unread = useLiveValue((s) => s.unread || 0);
  const cur = TABS.includes(route.id) ? route.id : 'plus';
  const { box, bar } = useSlider(cur, 'x');
  return (
    <nav aria-label="Navigation" className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150">
      <div ref={box} className="relative mx-auto grid h-[58px] max-w-lg grid-cols-5">
        <span ref={bar} aria-hidden className="pointer-events-none absolute left-0 top-[7px] flex h-8 w-[20%] justify-center opacity-0 transition-[transform,opacity] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]"><i className="h-8 w-14 rounded-full bg-brand-soft geist:bg-accent" /></span>
        {TABS.map((id) => {
          const r = routeOf(id)!;
          const on = cur === id;
          return (
            <a key={id} href={'#/' + id} aria-current={on ? 'page' : undefined} onClick={() => closeAllSheets()}
              className={cn('relative grid place-items-center content-center gap-1 text-[10.5px] font-medium outline-none transition-colors', on ? 'text-brand-ink geist:text-foreground' : 'text-muted-foreground')}>
              <span className="relative grid h-8 place-items-center">
                <Icon name={r.icon} className="size-[22px]" strokeWidth={on ? 2.1 : 1.8} />
                {id === 'activite' && unread > 0 && <span className="num absolute -right-2.5 top-0 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white ring-2 ring-card">{unread > 99 ? '99+' : unread}</span>}
              </span>
              <span className="-mt-1 leading-none">{r.short || r.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}

function PageFallback() {
  return <div className="grid gap-4 pt-2"><Skeleton h={34} w="40%" /><Skeleton h={16} w="60%" /><div className="grid grid-cols-1 gap-4 pt-4 lg:grid-cols-3"><Skeleton h={160} /><Skeleton h={160} /><Skeleton h={160} /></div></div>;
}
function useGlobalKeys() {
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openPalette(); }
      else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey) { e.preventDefault(); openPalette(); }
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
}

function Shell({ onLogout }: { onLogout: () => void }) {
  const route = useRoute();
  const a = useAppearance();
  const mobile = useMobile();
  const def = routeOf(route.id) || ROUTES[0];
  const ligne = a.layout === 'ligne';
  const View = ligne && def.id === 'accueil' ? HomeLigne : VIEWS[def.id] || VIEWS.accueil;
  useEffect(() => { document.title = `${def.label} · Ma Bbox`; }, [def.label]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [def.id]);
  useEffect(() => { const t = setTimeout(prefetch, 1500); return () => clearTimeout(t); }, []);
  useGlobalKeys();
  // préférences du panel (favoris, noms d'affichage des appareils) dès l'ouverture
  useEffect(() => { loadPrefs(); }, []);
  const isMini = useMiniNav();
  const shiftRef = useRef<HTMLDivElement>(null);
  useNavShift(shiftRef, isMini, ligne && !mobile);
  if (def.bare) return <><Suspense fallback={null}><View key={def.id} route={route} /></Suspense><NotifyHost /><Palette /></>;
  const side = a.layout === 'side' && !mobile;
  const lside = ligne && !mobile;
  return (
    <div className="min-h-dvh">
      {side && <Sidebar route={route} onLogout={onLogout} />}
      {lside && <LigneSidebar route={route} onLogout={onLogout} />}
      <div ref={shiftRef} className={cn('min-w-0', side && 'pl-[264px]', lside && (isMini ? 'pl-[60px]' : 'pl-[240px]'))}>
        {mobile ? (ligne ? <LigneMobileHeader title={def.label} /> : <MobileHeader title={def.label} />) : ligne ? <LigneTopbar route={route} /> : <Topbar route={route} />}
        <main className={cn('mx-auto w-full min-w-0 px-8 pb-20 max-lg:px-6 max-sm:px-4 max-sm:pb-[calc(84px+env(safe-area-inset-bottom))] max-sm:pt-2', ligne ? 'max-w-[1160px] px-10 pb-28 pt-6 min-[1900px]:max-w-[1320px] min-[2400px]:max-w-[1480px] max-lg:px-6 max-sm:px-4 max-sm:pb-[calc(96px+env(safe-area-inset-bottom))]' : 'max-w-[1240px] pt-5')}>
          <Suspense fallback={<PageFallback />}>
            <div key={def.id} className="min-w-0"><View route={route} onLogout={onLogout} /></div>
          </Suspense>
        </main>
      </div>
      {mobile && (ligne ? <LigneTabBar route={route} /> : <TabBar route={route} />)}
      {lside && <LigneCommandBar />}
      <NotifyHost />
      <Palette />
    </div>
  );
}

function Splash() {
  return <div className="grid min-h-dvh place-items-center bg-background"><Bytel animated className="size-14" /></div>;
}

/** Safari 26 et suivants ignorent <meta name="theme-color"> : la barre d'onglets prend la couleur de
 *  l'élément fixe qui touche le haut de la fenêtre sur toute sa largeur, sinon celle relevée en haut de
 *  la page au chargement. WebKit ne relit cette couleur que lorsque l'élément apparaît : la bande (couleur
 *  du fond, cachée sous la barre latérale) est donc masquée puis réaffichée après chaque changement
 *  d'apparence, une fois la transition des couleurs terminée. Sans elle, passer de Bbox Clair à Noir Geist
 *  laissait l'onglet clair jusqu'au rechargement. */
function SafariTint() {
  const { skin, theme } = useAppearance();
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);
  const [nudge, setNudge] = useState(0);
  // le mode mural peut imposer son propre thème : il le signale par l'événement « bp:retint »
  useEffect(() => { const f = () => setNudge((n) => n + 1); window.addEventListener('bp:retint', f); return () => window.removeEventListener('bp:retint', f); }, []);
  useEffect(() => {
    if (first.current) { first.current = false; return; }
    const el = ref.current;
    if (!el) return;
    el.style.display = 'none';
    const t = setTimeout(() => { el.style.display = ''; }, 420);
    return () => { clearTimeout(t); el.style.display = ''; };
  }, [skin, theme, nudge]);
  return <div ref={ref} aria-hidden data-safari-tint className="pointer-events-none fixed inset-x-0 top-0 z-[25] h-1.5 bg-background print:hidden" />;
}

export default function App() {
  const [state, setState] = useState<'boot' | 'in' | 'out'>('boot');
  const mobile = useMobile();
  const look = useAppearance();
  useEffect(() => {
    const t0 = Date.now();
    panel.session().then((s: any) => !!s?.authenticated, () => false).then(async (ok) => {
      if (ok) startLive();
      const wait = document.hidden || document.documentElement.dataset.preview ? 0 : Math.max(0, 650 - (Date.now() - t0));
      await new Promise((r) => setTimeout(r, wait));
      setState(ok ? 'in' : 'out');
    });
    return onAuthLost(() => { stopLive(); closeAllSheets(); setState('out'); });
  }, []);
  const logout = async () => { try { await panel.logout(); } catch { /* déjà déconnecté */ } stopLive(); closeAllSheets(); setState('out'); };
  return (
    <Tooltip.Provider delayDuration={400}>
      <MotionConfig reducedMotion="user">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={state} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            {state === 'boot' ? <Splash /> : state === 'out' ? <Login onDone={() => { startLive(); setState('in'); }} /> : <Shell onLogout={logout} />}
          </motion.div>
        </AnimatePresence>
        <SafariTint />
        <OverlayHost />
        <Toaster position={mobile ? 'top-center' : 'bottom-center'} offset={{ bottom: look.layout === 'ligne' && state === 'in' ? 76 : 24 }} mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 8px)' }} />
      </MotionConfig>
    </Tooltip.Provider>
  );
}
