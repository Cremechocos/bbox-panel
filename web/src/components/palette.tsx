// Palette de commandes (⌘K, Ctrl+K ou « / ») : pages, appareils, actions, apparences — recherche floue (cmdk).
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Command } from 'cmdk';
import { Dialog } from 'radix-ui';
import { AnimatePresence, motion } from 'motion/react';
import { Icon, KIND_ICON } from '@/components/icon';
import { ROUTES, EXTRA } from '@/lib/routes';
import { go } from '@/lib/router';
import { live } from '@/lib/live';
import { ACTIONS } from '@/lib/prefs';
import { SKINS, setSkin, toggleTheme } from '@/lib/theme';
import { useWanHidden, toggleWanHidden, usePhoneHidden, togglePhoneHidden } from '@/lib/privacy';
import { displayName, deviceKind } from '@/lib/format';
import { openNotifSettings } from '@/components/notify';
import { useMobile, toast } from '@/lib/data';

let open = false;
const subs = new Set<() => void>();
const set = (v: boolean) => { open = v; subs.forEach((f) => f()); };
export const openPalette = () => set(true);
export const closePalette = () => set(false);

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
/** Recherche : chaque mot tapé doit commencer un mot du libellé (« ip » → iPhone, pas « appareil… apple ») ;
 *  à défaut, sous-chaîne exacte (adresses IP ou MAC partielles). Seuls les mots-clés sont cherchés. */
function match(_value: string, search: string, keywords?: string[]) {
  const q = norm(search).trim();
  if (!q) return 1;
  const hay = norm((keywords || []).join(' '));
  const words = hay.split(/[\s.:·,/()'’-]+/).filter(Boolean);
  if (q.split(/\s+/).every((w) => words.some((x) => x.startsWith(w)))) return 1;
  return hay.includes(q) ? 0.5 : 0;
}

function Item({ value, keywords, icon, label, hint, onSelect }: { value: string; keywords?: string[]; icon: string; label: string; hint?: string; onSelect: () => void }) {
  return (
    <Command.Item value={value} keywords={keywords} onSelect={onSelect}
      className="group flex h-11 cursor-pointer select-none items-center gap-3 rounded-lg px-3 text-[14px] outline-none data-[selected=true]:bg-accent data-[selected=true]:text-foreground max-sm:h-12 geist:h-9 geist:gap-2.5 geist:rounded-md geist:px-2.5 geist:text-[13.5px] geist:data-[selected=true]:bg-selected geist:max-sm:h-11">
      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-border bg-card text-muted-foreground group-data-[selected=true]:text-foreground geist:size-5 geist:border-0 geist:bg-transparent"><Icon name={icon} className="size-4" strokeWidth={1.8} /></span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {hint && <span className="shrink-0 truncate text-[12.5px] text-muted-foreground max-sm:max-w-[40%] geist:text-[12px]">{hint}</span>}
      <Icon name="arrowright" className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-data-[selected=true]:opacity-100" />
    </Command.Item>
  );
}
const Group = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
  <Command.Group heading={heading} className="px-1.5 pb-1.5 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11.5px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-[0.06em] [&_[cmdk-group-heading]]:text-muted-foreground geist:[&_[cmdk-group-heading]]:px-2.5 geist:[&_[cmdk-group-heading]]:pt-2.5 geist:[&_[cmdk-group-heading]]:text-[12px] geist:[&_[cmdk-group-heading]]:font-medium geist:[&_[cmdk-group-heading]]:normal-case geist:[&_[cmdk-group-heading]]:tracking-normal">
    {children}
  </Command.Group>
);

export function Palette() {
  const isOpen = useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => open);
  const mobile = useMobile();
  const wanHidden = useWanHidden();
  const phoneHidden = usePhoneHidden();
  const [q, setQ] = useState('');
  useEffect(() => { if (!isOpen) setQ(''); }, [isOpen]);
  const run = (fn: () => unknown) => { set(false); setTimeout(() => fn(), 60); };
  const hosts = [...(live.hosts || [])].sort((a: any, b: any) => b.active - a.active);
  return (
    <Dialog.Root open={isOpen} onOpenChange={set}>
      <AnimatePresence>
        {isOpen && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild forceMount>
              <motion.div className="fixed inset-0 z-[70] bg-[var(--overlay)] backdrop-blur-[2px] geist:backdrop-blur-none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} />
            </Dialog.Overlay>
            <Dialog.Content asChild forceMount aria-describedby={undefined}>
              <motion.div className="fixed left-1/2 top-[max(10vh,calc(env(safe-area-inset-top)+12px))] z-[71] w-[min(640px,calc(100vw-24px))] -translate-x-1/2 overflow-hidden rounded-2xl border border-[var(--card-border)] bg-popover text-popover-foreground shadow-pop outline-none geist:glass geist:w-[min(620px,calc(100vw-24px))] geist:rounded-xl geist:border-0"
                initial={{ opacity: 0, scale: 0.97, y: -8 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: -4 }} transition={{ type: 'spring', stiffness: 520, damping: 38 }}>
                <Dialog.Title className="sr-only">Rechercher</Dialog.Title>
                <Command loop filter={match}>
                  <div className="flex items-center gap-3 border-b border-border px-4">
                    <Icon name="search" className="size-[18px] text-muted-foreground" />
                    <Command.Input value={q} onValueChange={setQ} placeholder={mobile ? 'Rechercher…' : 'Rechercher une page, un appareil, une action…'} className="h-14 min-w-0 flex-1 bg-transparent text-[16px] outline-none placeholder:text-muted-foreground geist:h-12 geist:text-[15px] geist:max-sm:text-base" />
                    <kbd className="hidden rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground sm:inline geist:border-0 geist:bg-selected geist:font-sans">Échap</kbd>
                  </div>
                  <Command.List className="scroll-y max-h-[min(440px,60dvh)] overflow-y-auto overscroll-contain pb-1.5">
                    <Command.Empty className="grid justify-items-center gap-1.5 py-10 text-center text-sm text-muted-foreground"><Icon name="search" className="size-6" />Aucun résultat pour « {q} »</Command.Empty>
                    <Group heading="Pages">
                      {[...ROUTES, ...EXTRA.filter((r) => r.id !== 'plus')].map((r) => <Item key={r.id} value={'page-' + r.id} keywords={[r.label, r.short || '', r.group || '']} icon={r.icon} label={r.label} hint="Page" onSelect={() => run(() => go(r.id))} />)}
                    </Group>
                    {hosts.length > 0 && (
                      <Group heading="Appareils">
                        {hosts.map((h: any) => <Item key={h.id} value={'dev-' + h.id} keywords={[displayName(h), h.hostname, h.ipaddress, h.macaddress, h.informations?.manufacturer].filter(Boolean)} icon={KIND_ICON[deviceKind(h)]} label={displayName(h)} hint={h.active ? h.ipaddress : 'hors ligne'} onSelect={() => run(() => go('appareils', String(h.id)))} />)}
                      </Group>
                    )}
                    <Group heading="Actions">
                      {[...ACTIONS, { id: 'notifs', label: 'Réglages des notifications', icon: 'bell', run: () => openNotifSettings() }].map((a) => <Item key={a.id} value={'act-' + a.id} keywords={[a.label]} icon={a.icon} label={a.label} onSelect={() => run(a.run)} />)}
                    </Group>
                    <Group heading="Apparence">
                      {SKINS.map((s) => <Item key={s.id} value={'skin-' + s.id} keywords={['Apparence', 'thème', s.name]} icon="palette" label={`Apparence : ${s.name}`} onSelect={() => run(() => setSkin(s.id))} />)}
                      <Item value="mode" keywords={['Basculer clair sombre', 'mode', 'thème', 'nuit']} icon="moon" label="Basculer entre clair et sombre" onSelect={() => run(toggleTheme)} />
                      <Item value="wan-blur" keywords={['Flouter les adresses IP publiques', 'Afficher les adresses IP publiques', 'masquer', 'WAN', 'confidentialité', 'capture d’écran', 'partage d’écran']} icon={wanHidden ? 'eye' : 'eyeoff'} label={wanHidden ? 'Afficher les adresses IP publiques' : 'Flouter les adresses IP publiques'} onSelect={() => run(() => { toggleWanHidden(); toast(wanHidden ? 'Adresses IP publiques visibles' : 'Adresses IP publiques floutées', 'info'); })} />
                      <Item value="phone-blur" keywords={['Flouter le numéro de téléphone', 'Afficher le numéro de téléphone', 'masquer', 'ligne fixe', 'confidentialité', 'capture d’écran', 'partage d’écran']} icon={phoneHidden ? 'eye' : 'eyeoff'} label={phoneHidden ? 'Afficher le numéro de téléphone' : 'Flouter le numéro de téléphone'} onSelect={() => run(() => { togglePhoneHidden(); toast(phoneHidden ? 'Numéro de téléphone visible' : 'Numéro de téléphone flouté', 'info'); })} />
                    </Group>
                  </Command.List>
                  <div className="hidden items-center gap-4 border-t border-border px-4 py-2.5 text-[12px] text-muted-foreground sm:flex geist:py-2">
                    <span className="flex items-center gap-1.5"><kbd className="rounded border border-border px-1 font-mono geist:kbd geist:border-0">↑↓</kbd>naviguer</span>
                    <span className="flex items-center gap-1.5"><kbd className="rounded border border-border px-1 font-mono geist:kbd geist:border-0">↵</kbd>ouvrir</span>
                    <span className="ml-auto flex items-center gap-1.5"><Icon name="command" className="size-3.5" />K partout</span>
                  </div>
                </Command>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  );
}
