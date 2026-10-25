// Cloche et centre de notifications : derniers événements, non lus en premier.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { Icon } from '@/components/icon';
import { Empty, Avatar } from '@/components/kit';
import { openSheet, SheetBody, closeAllSheets } from '@/components/overlays';
import { openNotifSettings } from '@/components/notify';
import { useLive, useLiveValue, ackEvents, type LiveEvent } from '@/lib/live';
import { eventInfo, ago } from '@/lib/events';
import { go } from '@/lib/router';
import { useMobile } from '@/lib/data';
import { cn } from '@/lib/utils';

const HIDE = new Set(['wifi_restart', 'port_up', 'port_down', 'voip_up']);

export function EventRow({ e, byMac, onClick, compact }: { e: LiveEvent; byMac: Map<string, any>; onClick?: () => void; compact?: boolean }) {
  const i = eventInfo(e, byMac);
  return (
    <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={onClick ? (k) => k.key === 'Enter' && onClick() : undefined}
      className={cn('flex min-w-0 items-center gap-3 border-t border-border px-4 first:border-t-0 geist:mx-1.5 geist:gap-2.5 geist:rounded-md geist:border-t-0 geist:px-2.5', compact ? 'min-h-[56px] py-2 geist:min-h-12 geist:py-1.5' : 'min-h-[60px] py-2.5 geist:min-h-12', onClick && 'cursor-pointer outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent geist:hover:bg-hover geist:focus-visible:bg-selected')}>
      <Avatar icon={i.icon} size="sm" tone={(i.tone || '') as any} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium geist:text-[13px]">{i.title}</div>
        <div className="truncate text-[12.5px] text-muted-foreground geist:text-[12px]">{[ago(e.t), i.sub].filter(Boolean).join(' · ')}</div>
      </div>
      {!e.ack && <span className="size-2 shrink-0 rounded-full bg-brand" aria-label="Non lu" />}
    </div>
  );
}

function AlertsList({ close }: { close: () => void }) {
  const s = useLive();
  const byMac = useMemo(() => new Map((s.hosts || []).map((h: any) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const list = useMemo(() => {
    const evs = (s.events || []).filter((e) => !HIDE.has(e.type));
    return [...evs.filter((e) => !e.ack), ...evs.filter((e) => e.ack)].slice(0, 25);
  }, [s.events]);
  const openAll = () => { close(); go('activite'); };
  return list.length ? <div>{list.map((e) => <EventRow key={e.id} e={e} byMac={byMac} compact onClick={openAll} />)}</div> : <Empty icon="bell" title="Aucune notification">Les arrivées, alertes et actions apparaîtront ici en temps réel.</Empty>;
}
function Head({ close }: { close: () => void }) {
  const unread = useLiveValue((s) => s.unread || 0);
  return (
    <div className="flex items-center gap-2">
      {unread > 0 && <button type="button" onClick={() => ackEvents('all')} className="h-8 rounded-md px-2.5 text-[12.5px] font-medium text-brand-ink hover:bg-accent geist:text-foreground max-sm:h-10">Tout marquer comme lu</button>}
      <button type="button" aria-label="Réglages des notifications" onClick={() => { close(); openNotifSettings(); }} className="grid size-8 place-items-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground max-sm:size-10"><Icon name="sliders" className="size-4" /></button>
    </div>
  );
}
function AlertsSheet({ close }: { close: () => void }) {
  return <SheetBody className="px-0 pt-0 sm:px-0 geist:pt-0"><AlertsList close={close} /></SheetBody>;
}
const openAlertsSheet = () => openSheet(AlertsSheet, {}, { title: 'Notifications', actions: <Head close={() => closeAllSheets()} /> });

/** Bouton cloche : popover (ordinateur) ou feuille (iPhone) ; oscille à chaque notification */
export function Bell({ className }: { className?: string }) {
  const unread = useLiveValue((s) => s.unread || 0);
  const mobile = useMobile();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const ring = () => { const b = ref.current; if (!b) return; b.classList.remove('bell-ring'); void b.offsetWidth; b.classList.add('bell-ring'); clearTimeout(t); t = setTimeout(() => b.classList.remove('bell-ring'), 1000); };
    window.addEventListener('notif:ring', ring);
    return () => { window.removeEventListener('notif:ring', ring); clearTimeout(t); };
  }, []);
  const btn = (
    <button ref={ref} type="button" aria-label={unread ? `Notifications (${unread} non lues)` : 'Notifications'} onClick={mobile ? openAlertsSheet : undefined}
      className={cn('relative grid size-9 place-items-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 geist:size-8 geist:rounded-md geist:hover:bg-selected max-sm:size-11 geist:max-sm:size-11', className)}>
      <Icon name="bell" className="size-[18px] geist:size-4" strokeWidth={1.8} />
      {unread > 0 && <span className="bell-badge absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-bold leading-none text-white ring-2 ring-background num max-sm:right-1.5 max-sm:top-1.5">{unread > 99 ? '99+' : unread}</span>}
    </button>
  );
  if (mobile) return btn;
  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>{btn}</Popover.Trigger>
      <AnimatePresence>
        {open && (
          <Popover.Portal forceMount>
            <Popover.Content asChild forceMount align="end" sideOffset={10} collisionPadding={12} onOpenAutoFocus={(e) => e.preventDefault()}>
              <motion.div initial={{ opacity: 0, y: -6, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -4, scale: 0.98 }} transition={{ type: 'spring', stiffness: 520, damping: 36 }}
                className="z-[65] flex max-h-[min(560px,calc(100dvh-90px))] w-[min(400px,calc(100vw-24px))] origin-top-right flex-col overflow-hidden rounded-2xl border border-[var(--card-border)] bg-popover text-popover-foreground shadow-pop outline-none geist:glass geist:w-[min(380px,calc(100vw-24px))] geist:rounded-xl geist:border-0">
                <div className="flex items-center gap-2 border-b border-border py-2 pl-4 pr-2 geist:border-b-0 geist:pb-1 geist:pl-4"><b className="flex-1 text-[15px] font-semibold geist:text-[13.5px]">Notifications</b><Head close={() => setOpen(false)} /></div>
                <div className="scroll-y min-h-0 flex-1 overflow-y-auto overscroll-contain"><AlertsList close={() => setOpen(false)} /></div>
                <button type="button" onClick={() => { setOpen(false); go('activite'); }} className="flex h-11 items-center justify-center gap-1.5 border-t border-border text-[13.5px] font-medium text-brand-ink hover:bg-accent geist:h-10 geist:text-[13px] geist:text-muted-foreground geist:hover:bg-hover geist:hover:text-foreground">Toute l’activité<Icon name="arrowright" className="size-4" /></button>
              </motion.div>
            </Popover.Content>
          </Popover.Portal>
        )}
      </AnimatePresence>
    </Popover.Root>
  );
}
