// Calques globaux : feuilles latérales (bureau) / tiroirs glissants (iPhone) et dialogues de confirmation.
// API impérative : openSheet(Composant, props, { title, description, actions }) → Promise ; confirm({...}) → Promise<boolean>.
import * as React from 'react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { AlertDialog, Dialog } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useMobile } from '@/lib/data';

export type SheetProps<P> = P & { close: (value?: unknown) => void };
type SheetOpts = { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; wide?: boolean };
type Layer =
  | { id: number; kind: 'sheet'; Comp: React.ComponentType<any>; props: any; opts: SheetOpts; open: boolean; resolve: (v: unknown) => void }
  | { id: number; kind: 'confirm'; opts: ConfirmOpts; open: boolean; resolve: (v: boolean) => void };

let layers: Layer[] = [];
let seq = 0;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const setLayers = (fn: (l: Layer[]) => Layer[]) => { layers = fn(layers); emit(); };

function closeLayer(id: number, value?: unknown) {
  const l = layers.find((x) => x.id === id);
  if (!l || !l.open) return;
  (l.resolve as (v: unknown) => void)(l.kind === 'confirm' ? !!value : value);
  setLayers((ls) => ls.map((x) => (x.id === id ? { ...x, open: false } : x)));
  // retrait après l'animation de sortie
  setTimeout(() => setLayers((ls) => ls.filter((x) => x.id !== id)), 520);
}

/** Ouvre une feuille ; le composant reçoit `close(valeur)` */
export function openSheet<C extends React.ComponentType<any>>(Comp: C, props: Omit<React.ComponentProps<C>, 'close'>, opts: SheetOpts): Promise<any> {
  return new Promise((resolve) => setLayers((ls) => [...ls, { id: ++seq, kind: 'sheet', Comp, props, opts, open: true, resolve }]));
}
export type ConfirmOpts = { title: string; message?: React.ReactNode; confirm?: string; cancel?: string; tone?: 'danger' | 'warn' | 'default'; icon?: string };
/** Dialogue de confirmation → true si confirmé */
export function confirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => setLayers((ls) => [...ls, { id: ++seq, kind: 'confirm', opts, open: true, resolve }]));
}
export const closeAllSheets = () => layers.forEach((l) => closeLayer(l.id));

// Corps et pied de feuille (le pied reste visible, le corps défile)
export function SheetBody({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('scroll-y min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-6 pt-1 sm:px-6 geist:px-4 geist:pt-2 geist:sm:px-4', className)} {...p} />;
}
export function SheetFooter({ className, ...p }: React.ComponentProps<'div'>) {
  return <div className={cn('flex flex-wrap items-center gap-2 border-t border-border bg-card/80 px-5 py-3.5 backdrop-blur-md sm:px-6 pb-[max(14px,env(safe-area-inset-bottom))] geist:border-t-0 geist:bg-transparent geist:px-4 geist:pt-2 geist:backdrop-blur-none geist:sm:px-4', className)} {...p} />;
}

const SPRING = { type: 'spring' as const, stiffness: 420, damping: 40, mass: 0.9 };

function DesktopSheet({ l, depth }: { l: Extract<Layer, { kind: 'sheet' }>; depth: number }) {
  const { Comp, props, opts } = l;
  return (
    <Dialog.Root open={l.open} onOpenChange={(o) => !o && closeLayer(l.id)}>
      <AnimatePresence>
        {l.open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-50 bg-[var(--overlay)] backdrop-blur-[2px] geist:backdrop-blur-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.25 }} />
            </Dialog.Overlay>
            {/* à l'ouverture, le focus va sur la feuille elle-même (pas sur le 1er bouton : ni anneau ni info-bulle parasites) */}
            <Dialog.Content asChild forceMount aria-describedby={undefined} tabIndex={-1} onOpenAutoFocus={(e) => { e.preventDefault(); (e.target as HTMLElement | null)?.focus?.({ preventScroll: true }); }}>
              <motion.div
                className={cn('fixed inset-y-2 right-2 z-50 flex flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-card text-card-foreground shadow-pop outline-none geist:glass geist:inset-y-3 geist:right-3 geist:rounded-xl geist:border-0',
                  opts.wide ? 'w-[min(640px,calc(100vw-16px))] geist:w-[min(600px,calc(100vw-24px))]' : 'w-[min(500px,calc(100vw-16px))] geist:w-[min(440px,calc(100vw-24px))]')}
                // transform en chaîne : animation accélérée, fluide même si l'écran charge des données à l'ouverture
                initial={{ transform: 'translateX(104%) scale(1)' }} animate={{ transform: depth > 0 ? 'translateX(-4%) scale(0.965)' : 'translateX(0%) scale(1)' }} exit={{ transform: 'translateX(104%) scale(1)' }} transition={SPRING}
              >
                <SheetHead opts={opts} onClose={() => closeLayer(l.id)} />
                <Comp {...props} close={(v?: unknown) => closeLayer(l.id, v)} />
                <div aria-hidden className={cn('pointer-events-none absolute inset-0 rounded-[inherit] bg-black transition-opacity duration-300', depth > 0 ? 'opacity-25' : 'opacity-0')} />
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}

function SheetHead({ opts, onClose, drawer }: { opts: SheetOpts; onClose: () => void; drawer?: boolean }) {
  const T = drawer ? Drawer.Title : Dialog.Title;
  const D = drawer ? Drawer.Description : Dialog.Description;
  return (
    <div className={cn('flex items-start gap-3 px-5 pb-3 sm:px-6 geist:px-4 geist:pb-2 geist:sm:px-4', drawer ? 'pt-2' : 'pt-5 geist:pt-4')}>
      <div className="min-w-0 flex-1">
        <T className="truncate text-[19px] font-semibold leading-tight tracking-tight geist:text-[15px] geist:tracking-[-0.01em]">{opts.title}</T>
        {opts.description ? <D className="mt-1 line-clamp-2 text-sm text-muted-foreground geist:mt-0.5 geist:text-[12.5px]">{opts.description}</D> : <D className="sr-only">{typeof opts.title === 'string' ? opts.title : 'Détails'}</D>}
      </div>
      <div className="-mr-1.5 -mt-1 flex items-center gap-1">
        {opts.actions}
        <Button variant="ghost" size="icon" className="size-9 rounded-full text-muted-foreground hover:text-foreground geist:size-8 geist:rounded-md geist:hover:bg-selected max-sm:size-11 geist:max-sm:size-11" onClick={onClose} aria-label="Fermer"><X className="size-5 geist:size-[18px]" /></Button>
      </div>
    </div>
  );
}

function MobileSheet({ l }: { l: Extract<Layer, { kind: 'sheet' }> }) {
  const { Comp, props, opts } = l;
  return (
    <Drawer.Root open={l.open} onOpenChange={(o) => !o && closeLayer(l.id)} repositionInputs={false}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-[var(--overlay)]" />
        <Drawer.Content aria-describedby={undefined} tabIndex={-1} onOpenAutoFocus={(e) => { e.preventDefault(); (e.target as HTMLElement | null)?.focus?.({ preventScroll: true }); }} className="fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[22px] border-t border-[var(--card-border)] bg-card text-card-foreground shadow-pop outline-none geist:glass geist:rounded-t-2xl geist:border-t-0">
          <div className="mx-auto mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/25" aria-hidden />
          <SheetHead opts={opts} onClose={() => closeLayer(l.id)} drawer />
          <Comp {...props} close={(v?: unknown) => closeLayer(l.id, v)} />
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

function ConfirmLayer({ l }: { l: Extract<Layer, { kind: 'confirm' }> }) {
  const o = l.opts;
  const tone = o.tone || 'default';
  return (
    <AlertDialog.Root open={l.open} onOpenChange={(op) => !op && closeLayer(l.id, false)}>
      <AnimatePresence>
        {l.open && (
          <AlertDialog.Portal forceMount>
            <AlertDialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[60] bg-[var(--overlay)] backdrop-blur-[2px] geist:backdrop-blur-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} />
            </AlertDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-[61] grid place-items-center p-4">
              <AlertDialog.Content asChild forceMount>
                <motion.div className="pointer-events-auto w-full max-w-[420px] rounded-2xl border border-[var(--card-border)] bg-popover p-6 text-popover-foreground shadow-pop outline-none geist:glass geist:max-w-[400px] geist:rounded-xl geist:border-0 geist:p-5"
                  initial={{ opacity: 0, scale: 0.94, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.96, y: 4 }} transition={{ type: 'spring', stiffness: 520, damping: 36 }}>
                  {o.icon && (
                    <div className={cn('mb-4 grid size-11 place-items-center rounded-xl geist:mb-3 geist:size-9 geist:rounded-lg', tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'warn' ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-ink')}>
                      <Icon name={o.icon} className="size-5" />
                    </div>
                  )}
                  <AlertDialog.Title className="text-lg font-semibold tracking-tight geist:text-[15px]">{o.title}</AlertDialog.Title>
                  {o.message ? <AlertDialog.Description className="mt-2 text-[14.5px] leading-relaxed text-muted-foreground geist:mt-1.5 geist:text-[13px]">{o.message}</AlertDialog.Description> : <AlertDialog.Description className="sr-only">{o.title}</AlertDialog.Description>}
                  <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end geist:mt-5">
                    <AlertDialog.Cancel asChild><Button variant="outline" className="h-10 sm:h-9 geist:rounded-md geist:border-0 geist:bg-selected geist:text-[13px] geist:shadow-none geist:sm:h-8">{o.cancel || 'Annuler'}</Button></AlertDialog.Cancel>
                    <AlertDialog.Action asChild>
                      <Button variant={tone === 'danger' ? 'destructive' : 'default'} className="h-10 sm:h-9 geist:rounded-md geist:text-[13px] geist:shadow-none geist:sm:h-8" onClick={(e) => { e.preventDefault(); closeLayer(l.id, true); }}>{o.confirm || 'Confirmer'}</Button>
                    </AlertDialog.Action>
                  </div>
                </motion.div>
              </AlertDialog.Content>
            </div>
          </AlertDialog.Portal>
        )}
      </AnimatePresence>
    </AlertDialog.Root>
  );
}

export function OverlayHost() {
  const ls = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => layers);
  const mobile = useMobile();
  // Échap ferme la feuille du dessus (Radix le gère déjà pour la couche active)
  const [, force] = useState(0);
  useEffect(() => { const f = () => force((x) => x + 1); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const sheets = ls.filter((l) => l.kind === 'sheet') as Extract<Layer, { kind: 'sheet' }>[];
  return (
    <>
      {sheets.map((l, i) => (mobile ? <MobileSheet key={l.id} l={l} /> : <DesktopSheet key={l.id} l={l} depth={sheets.filter((x) => x.open).length - 1 - i} />))}
      {ls.filter((l) => l.kind === 'confirm').map((l) => <ConfirmLayer key={l.id} l={l as Extract<Layer, { kind: 'confirm' }>} />)}
    </>
  );
}
