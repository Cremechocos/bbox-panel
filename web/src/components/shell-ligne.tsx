// Coquille Noir Geist « Ligne » : barre latérale dense (façon Linear), fil d'Ariane, barre de commande
// flottante en verre dépoli ; sur iPhone, en-tête compact et barre d'onglets flottante.
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { DropdownMenu, Tooltip } from 'radix-ui';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Bytel, Icon } from '@/components/icon';
import { Tip } from '@/components/kit';
import { Bell } from '@/components/alerts';
import { openPalette } from '@/components/palette';
import { openNotifSettings } from '@/components/notify';
import { closeAllSheets } from '@/components/overlays';
import { useLiveValue } from '@/lib/live';
import { usePrefs } from '@/lib/prefs';
import { ROUTES, GROUPS, TABS, routeOf } from '@/lib/routes';
import { go, type Route } from '@/lib/router';
import { useAppearance, toggleTheme } from '@/lib/theme';
import { displayName } from '@/lib/format';
import { cn } from '@/lib/utils';

const openDevice = (h: any) => import('@/views/devices').then((m) => m.openDevice(h));
const latFmt = (v: number | null) => (v == null ? '—' : v < 10 ? v.toFixed(1).replace('.', ',') : String(Math.round(v)));
const ls = { get: (k: string) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* */ } } };

// ───────── Barre latérale réduite (icônes seules), mémorisée sur cet appareil ─────────
export const NAV_W = 240, NAV_MINI = 60;
let mini = ls.get('ligne.nav') === 'mini';
const navSubs = new Set<() => void>();
export const useMiniNav = () => useSyncExternalStore((f) => { navSubs.add(f); return () => { navSubs.delete(f); }; }, () => mini);
export function toggleMiniNav() { mini = !mini; ls.set('ligne.nav', mini ? 'mini' : ''); navSubs.forEach((f) => f()); }
/** Le contenu suit la barre : mise en page finale tout de suite, puis glissement en transform (FLIP),
 *  même durée et même courbe que la largeur de la barre, pour que les deux bords restent collés. */
export function useNavShift(ref: React.RefObject<HTMLElement | null>, isMini: boolean, enabled: boolean) {
  const prev = useRef(isMini);
  useLayoutEffect(() => {
    if (prev.current === isMini) return;
    prev.current = isMini;
    const el = ref.current;
    if (!el || !enabled || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.style.transition = 'none';
    el.style.transform = `translateX(${isMini ? NAV_W - NAV_MINI : NAV_MINI - NAV_W}px)`;
    void el.offsetWidth;
    el.style.transition = 'transform 420ms cubic-bezier(.22,1,.36,1)';
    el.style.transform = '';
    const end = () => { el.style.transition = ''; el.removeEventListener('transitionend', end); };
    el.addEventListener('transitionend', end);
  }, [isMini, enabled]);
}
/** Info-bulle à droite des icônes (barre réduite) */
function NavTip({ label, children, off }: { label: React.ReactNode; children: React.ReactElement; off?: boolean }) {
  if (off) return children;
  return (
    <Tooltip.Root delayDuration={60}>
      <Tooltip.Trigger asChild>{children}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content side="right" sideOffset={12} className="glass z-[70] flex items-center gap-2 rounded-md px-2 py-1 text-[12.5px] text-foreground data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:slide-in-from-left-1 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">{label}</Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

/** Logo dans sa pastille (blanc sur noir en sombre, noir sur blanc en clair) */
export function LogoTile({ className }: { className?: string }) {
  return <span className={cn('grid size-6 shrink-0 place-items-center rounded-[6px] bg-foreground', className)}><Bytel className="size-4 text-background" /></span>;
}

function WorkspaceMenu({ onLogout, isMini }: { onLogout: () => void; isMini: boolean }) {
  const model = useLiveValue((s) => s.device?.device?.modelname || '');
  const item = 'flex h-8 cursor-pointer select-none items-center gap-2.5 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-selected';
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button type="button" aria-label={isMini ? 'Ma Bbox : menu' : undefined} className="flex h-9 w-full items-center gap-2 whitespace-nowrap rounded-md px-2 text-left outline-none transition-colors hover:bg-hover focus-visible:bg-selected">
          <LogoTile />
          <span className="nav-label min-w-0 flex-1 truncate text-[13.5px] font-semibold">Ma Bbox</span>
          <Icon name="chevron" className="nav-label size-3.5 rotate-90 text-faint" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" sideOffset={6} collisionPadding={10}
          className="glass z-[65] w-60 origin-[var(--radix-dropdown-menu-content-transform-origin)] rounded-lg p-1 text-foreground data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <div className="px-2 pb-1.5 pt-1"><div className="text-[13px] font-medium">{model || 'Bbox'}</div><div className="text-[12px] text-muted-foreground">Administrateur · session sur cet appareil</div></div>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item className={item} onSelect={() => go('apparence')}><Icon name="palette" className="size-4 text-muted-foreground" strokeWidth={1.7} />Apparence</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => openNotifSettings()}><Icon name="bell" className="size-4 text-muted-foreground" strokeWidth={1.7} />Notifications</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => go('carte')}><Icon name="print" className="size-4 text-muted-foreground" strokeWidth={1.7} />Carte Wi-Fi</DropdownMenu.Item>
          <DropdownMenu.Item className={item} onSelect={() => go('mural')}><Icon name="expand" className="size-4 text-muted-foreground" strokeWidth={1.7} />Mode mural</DropdownMenu.Item>
          <DropdownMenu.Separator className="-mx-1 my-1 h-px bg-border" />
          <DropdownMenu.Item className={cn(item, 'text-danger')} onSelect={onLogout}><Icon name="logout" className="size-4" strokeWidth={1.7} />Se déconnecter</DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function NavItem({ id, label, icon, on, extra, dot, isMini }: { id: string; label: string; icon: string; on: boolean; extra?: React.ReactNode; dot?: boolean; isMini: boolean }) {
  return (
    <NavTip label={<>{label}{extra && <span className="text-muted-foreground">{extra}</span>}</>} off={!isMini}>
      <a href={'#/' + id} aria-current={on ? 'page' : undefined} aria-label={isMini ? label : undefined}
        className={cn('relative flex h-8 items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-[13.5px] font-medium outline-none transition-colors focus-visible:bg-selected', on ? 'bg-selected text-foreground' : 'text-sidebar-foreground hover:bg-hover')}>
        <Icon name={icon} className={cn('size-4 shrink-0', on ? 'text-foreground' : 'text-muted-foreground')} strokeWidth={1.7} />
        {dot && <i aria-hidden className="nav-dot absolute left-[25px] top-[6px] size-[7px] rounded-full bg-danger ring-2 ring-sidebar" />}
        <span className="nav-label min-w-0 flex-1 truncate">{label}</span>
        {extra && <span className="nav-label">{extra}</span>}
      </a>
    </NavTip>
  );
}

export function LigneSidebar({ route, onLogout }: { route: Route; onLogout: () => void }) {
  const isMini = useMiniNav();
  const unread = useLiveValue((s) => s.unread || 0);
  // « [ » réduit ou agrandit la barre (comme dans Linear)
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== '[' || e.metaKey || e.ctrlKey || e.altKey || (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable))) return;
      e.preventDefault(); toggleMiniNav();
    };
    window.addEventListener('keydown', f);
    return () => window.removeEventListener('keydown', f);
  }, []);
  const hosts = useLiveValue((s) => s.hosts);
  const p = usePrefs();
  const [closed, setClosed] = useState<Record<string, boolean>>(() => { try { return JSON.parse(ls.get('ligne.groups') || '{}'); } catch { return {}; } });
  const flip = (g: string) => { const n = { ...closed, [g]: !closed[g] }; setClosed(n); ls.set('ligne.groups', JSON.stringify(n)); };
  const favs = p.favorites.devices.map((m) => hosts.find((h: any) => String(h.macaddress).toLowerCase() === m)).filter(Boolean) as any[];
  const active = hosts.filter((h: any) => h.active).length;
  const extra = (id: string) => (id === 'activite' && unread > 0 ? <span className="num text-[12px] text-muted-foreground">{unread > 99 ? '99+' : unread}</span>
    : id === 'appareils' && active ? <span className="num text-[12px] text-muted-foreground">{active}</span> : undefined);
  return (
    <aside data-mini={isMini} aria-label="Barre latérale"
      className={cn('group/nav fixed inset-y-0 left-0 z-30 flex flex-col overflow-hidden bg-sidebar px-2.5 pb-2.5 pt-2.5 text-sidebar-foreground transition-[width] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)]', isMini ? 'w-[60px]' : 'w-[240px]')}>
      <WorkspaceMenu onLogout={onLogout} isMini={isMini} />
      <NavTip label={<>Rechercher <span className="flex gap-0.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span></>} off={!isMini}>
        <button type="button" onClick={openPalette} aria-label="Rechercher" className="mt-2 flex h-8 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap rounded-md bg-field px-[13px] text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring">
          <Icon name="search" className="size-3.5 shrink-0" strokeWidth={1.8} /><span className="nav-label">Rechercher</span><span className="nav-label ml-auto flex gap-0.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
        </button>
      </NavTip>
      <nav className="sidebar-scroll -mx-1 mt-3 min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1" aria-label="Navigation principale">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-px">{ROUTES.filter((r) => r.group === GROUPS[0]).map((r) => <NavItem key={r.id} id={r.id} label={r.label} icon={r.icon} on={route.id === r.id} extra={extra(r.id)} dot={r.id === 'activite' && unread > 0} isMini={isMini} />)}</div>
        {GROUPS.slice(1).map((g) => {
          const open = isMini || !closed[g];
          return (
            <div key={g} className="mt-5">
              <button type="button" onClick={() => !isMini && flip(g)} aria-expanded={open} tabIndex={isMini ? -1 : undefined}
                className="relative flex h-6 w-full items-center gap-1 whitespace-nowrap rounded px-2 text-[12px] font-medium text-faint outline-none transition-colors hover:text-muted-foreground focus-visible:text-foreground">
                <span className="nav-label flex items-center gap-1">{g}<Icon name="chevron" className={cn('size-3 transition-transform duration-200', open && 'rotate-90')} strokeWidth={2} /></span>
                <i aria-hidden className="nav-rule absolute left-[12px] top-1/2 h-px w-4 bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)]" />
              </button>
              {open && <div className="mt-0.5 grid grid-cols-[minmax(0,1fr)] gap-px">{ROUTES.filter((r) => r.group === g).map((r) => <NavItem key={r.id} id={r.id} label={r.label} icon={r.icon} on={route.id === r.id} extra={extra(r.id)} isMini={isMini} />)}</div>}
            </div>
          );
        })}
        {favs.length > 0 && (
          <div className="mt-5">
            <div className="relative h-6 whitespace-nowrap px-2 pt-1 text-[12px] font-medium text-faint"><span className="nav-label">Favoris</span><i aria-hidden className="nav-rule absolute left-[12px] top-1/2 h-px w-4 bg-[color-mix(in_oklab,var(--foreground)_14%,transparent)]" /></div>
            {favs.map((h) => (
              <NavTip key={h.id} label={<>{displayName(h)}<span className={h.active ? 'text-ok' : 'text-muted-foreground'}>{h.active ? 'en ligne' : 'hors ligne'}</span></>} off={!isMini}>
                <button type="button" onClick={() => openDevice(h)} aria-label={isMini ? displayName(h) : undefined} className="flex h-8 w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-left text-[13px] outline-none transition-colors hover:bg-hover focus-visible:bg-selected">
                  <i className={cn('mx-[5px] size-1.5 shrink-0 rounded-full', h.active ? 'bg-ok' : 'bg-[color-mix(in_oklab,var(--faint)_55%,transparent)]')} />
                  <span className="nav-label min-w-0 truncate">{displayName(h)}</span>
                </button>
              </NavTip>
            ))}
          </div>
        )}
      </nav>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-px pt-2">
        <NavItem id="apparence" label="Apparence" icon="palette" on={route.id === 'apparence'} isMini={isMini} />
        <NavItem id="plus" label="Plus d’outils" icon="more" on={route.id === 'plus'} isMini={isMini} />
        <NavTip label={<>Agrandir la barre <kbd className="kbd">[</kbd></>} off={!isMini}>
          <button type="button" onClick={toggleMiniNav} aria-label={isMini ? 'Agrandir la barre latérale' : 'Réduire la barre latérale'} aria-expanded={!isMini}
            className="group/t relative flex h-8 w-full items-center gap-2.5 whitespace-nowrap rounded-md px-3 text-[13.5px] font-medium text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:bg-selected">
            <span className="relative grid size-4 shrink-0 place-items-center">
              <AnimatePresence initial={false} mode="popLayout">
                <motion.span key={String(isMini)} className="grid place-items-center" initial={{ opacity: 0, rotate: isMini ? -90 : 90, scale: 0.6 }} animate={{ opacity: 1, rotate: 0, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ type: 'spring', stiffness: 420, damping: 30 }}>
                  {isMini ? <PanelLeftOpen className="size-4" strokeWidth={1.7} /> : <PanelLeftClose className="size-4" strokeWidth={1.7} />}
                </motion.span>
              </AnimatePresence>
            </span>
            <span className="nav-label min-w-0 flex-1 truncate text-left">Réduire la barre</span>
            <kbd className="kbd nav-label">[</kbd>
          </button>
        </NavTip>
      </div>
    </aside>
  );
}

function LatencyMini() {
  const lat = useLiveValue((s) => s.latency?.internet ?? null);
  const down = useLiveValue((s) => s.latency?.down || false);
  const ready = useLiveValue((s) => s.ready);
  if (!ready) return null;
  return (
    <Tip label="Latence vers Internet, mesurée toutes les 2 s">
      <a href="#/stats" className="flex h-8 items-center gap-2 rounded-md px-2 text-[12.5px] text-muted-foreground outline-none transition-colors hover:bg-hover hover:text-foreground focus-visible:bg-selected">
        <span className={cn('live-dot', down && 'bad')} />
        {down ? <span className="font-medium text-danger">Internet coupé</span> : <span>Internet <b className="num inline-block min-w-[4.4ch] text-right font-medium text-foreground">{latFmt(lat)} ms</b></span>}
      </a>
    </Tip>
  );
}
export function ThemeToggle() {
  const a = useAppearance();
  const label = a.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre';
  return (
    <Tip label={label}>
      <button type="button" onClick={toggleTheme} aria-label={label} className="relative grid size-8 place-items-center overflow-hidden rounded-md text-muted-foreground outline-none transition-colors hover:bg-selected hover:text-foreground focus-visible:bg-selected max-sm:size-11">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span key={a.theme} className="grid place-items-center" initial={{ rotate: -90, scale: 0.5, opacity: 0 }} animate={{ rotate: 0, scale: 1, opacity: 1 }} exit={{ rotate: 90, scale: 0.5, opacity: 0 }} transition={{ type: 'spring', stiffness: 420, damping: 28 }}>
            <Icon name={a.theme === 'dark' ? 'sun' : 'moon'} className="size-4" strokeWidth={1.8} />
          </motion.span>
        </AnimatePresence>
      </button>
    </Tip>
  );
}

export function LigneTopbar({ route }: { route: Route }) {
  const def = routeOf(route.id);
  return (
    <header data-app-header className="sticky top-0 z-20 flex h-12 items-center gap-1.5 bg-[color-mix(in_oklab,var(--background)_86%,transparent)] px-10 text-[13px] backdrop-blur-xl backdrop-saturate-150 max-lg:px-6">
      <nav aria-label="Fil d’Ariane" className="flex min-w-0 flex-1 items-center gap-1.5">
        <span className="truncate text-muted-foreground">{def?.group || 'Ma Bbox'}</span>
        <Icon name="chevron" className="size-3.5 shrink-0 text-faint" />
        <b className="truncate font-medium">{def?.label}</b>
      </nav>
      <LatencyMini />
      <Bell />
      <ThemeToggle />
    </header>
  );
}

/** Barre de commande flottante (bureau) : s'efface quand on fait défiler vers le bas, revient vers le haut */
export function LigneCommandBar() {
  const isMini = useMiniNav();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let last = window.scrollY, hidden = false, raf = 0;
    const set = (h: boolean) => { if (h === hidden || !ref.current) return; hidden = h; ref.current.dataset.hidden = h ? '1' : ''; };
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const y = window.scrollY, dy = y - last;
        if (innerHeight + y >= document.documentElement.scrollHeight - 8) set(false);
        else if (dy > 6) set(true);
        else if (dy < -6) set(false);
        last = y;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(raf); };
  }, []);
  return (
    <div ref={ref} className={cn('pointer-events-none fixed inset-x-0 bottom-4 z-20 flex justify-center transition-[transform,opacity,padding-left] duration-[420ms] ease-[cubic-bezier(.22,1,.36,1)] data-[hidden=1]:translate-y-[72px] data-[hidden=1]:opacity-0', isMini ? 'pl-[60px]' : 'pl-[240px]')}>
      <button type="button" onClick={openPalette}
        className="glass pointer-events-auto flex h-10 w-[440px] max-w-[calc(100vw-280px)] items-center gap-3 rounded-xl px-3 text-[13px] text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:text-foreground">
        <Icon name="command" className="size-4" strokeWidth={1.8} />
        <span className="min-w-0 flex-1 truncate text-left">Rechercher une page, un appareil, une action…</span>
        <span className="flex gap-0.5"><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
      </button>
    </div>
  );
}

// ───────── iPhone ─────────
export function LigneMobileHeader({ title }: { title: string }) {
  return (
    <header data-app-header className="sticky top-0 z-20 flex items-center gap-1 bg-[color-mix(in_oklab,var(--background)_86%,transparent)] pl-4 pr-1 pt-[env(safe-area-inset-top)] backdrop-blur-xl backdrop-saturate-150">
      <a href="#/accueil" aria-label="Accueil" className="-ml-2 grid size-11 shrink-0 place-items-center"><LogoTile className="size-7 rounded-[7px] [&>svg]:size-[18px]" /></a>
      <span className="ml-0.5 min-w-0 flex-1 truncate py-3.5 text-[15px] font-semibold">{title}</span>
      <button type="button" aria-label="Rechercher" onClick={openPalette} className="grid size-11 place-items-center rounded-md text-muted-foreground"><Icon name="search" className="size-[19px]" strokeWidth={1.8} /></button>
      <Bell />
    </header>
  );
}
export function LigneTabBar({ route }: { route: Route }) {
  const unread = useLiveValue((s) => s.unread || 0);
  const cur = TABS.includes(route.id) ? route.id : 'plus';
  return (
    <nav aria-label="Navigation" className="glass fixed inset-x-3 bottom-[calc(10px+env(safe-area-inset-bottom))] z-30 rounded-2xl">
      <div className="grid h-[58px] grid-cols-5">
        {TABS.map((id) => {
          const r = routeOf(id)!;
          const on = cur === id;
          return (
            <a key={id} href={'#/' + id} aria-current={on ? 'page' : undefined} onClick={() => closeAllSheets()}
              className={cn('relative grid place-items-center content-center gap-1 text-[10.5px] font-medium outline-none transition-colors', on ? 'text-foreground' : 'text-muted-foreground')}>
              <span className="relative grid h-7 w-12 place-items-center">
                {on && <motion.i layoutId="ligne-tab" className="absolute inset-0 rounded-full bg-selected" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
                <Icon name={r.icon} className="relative size-[20px]" strokeWidth={on ? 2 : 1.7} />
                {id === 'activite' && unread > 0 && <span className="num absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold text-white">{unread > 99 ? '99+' : unread}</span>}
              </span>
              <span className="leading-none">{r.short || r.label}</span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
