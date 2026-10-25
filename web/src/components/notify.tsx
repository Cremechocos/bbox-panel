// Notifications en temps réel : cartes animées empilées (sonner) façon iOS / Vercel, réglages locaux,
// cloche qui sonne, son discret optionnel et notifications du système quand l'onglet est masqué.
import { useEffect, useState, useSyncExternalStore } from 'react';
import { toast as sonner, Toaster } from 'sonner';
import { Icon } from '@/components/icon';
import { Seg, Toggle, Btn, Field } from '@/components/kit';
import { openSheet, SheetBody, SheetFooter } from '@/components/overlays';
import { onLiveEvents, live, type LiveEvent } from '@/lib/live';
import { eventInfo } from '@/lib/events';
import { isFav } from '@/lib/prefs';
import { go } from '@/lib/router';
import { useAppearance } from '@/lib/theme';
import { useMobile } from '@/lib/data';
import { cn } from '@/lib/utils';

// ───────── Réglages (propres à cet appareil) ─────────
const KEY = 'notif.prefs';
export type NotifPrefs = { presence: 'none' | 'favs' | 'all'; newDevice: boolean; internet: boolean; security: boolean; system: boolean; sound: boolean; desktop: boolean };
export const NOTIF_DEF: NotifPrefs = { presence: 'favs', newDevice: true, internet: true, security: true, system: false, sound: false, desktop: false };
let prefs: NotifPrefs = { ...NOTIF_DEF };
try { prefs = { ...NOTIF_DEF, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { /* stockage indisponible */ }
const prefSubs = new Set<() => void>();
export function setNotifPrefs(p: Partial<NotifPrefs>) {
  prefs = { ...prefs, ...p };
  if (!document.documentElement.dataset.preview) try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* */ }
  prefSubs.forEach((f) => f());
}
export const useNotifPrefs = () => useSyncExternalStore((f) => { prefSubs.add(f); return () => { prefSubs.delete(f); }; }, () => prefs);

const NOISE = new Set(['wifi_restart', 'port_up', 'port_down', 'voip_up']);
function wanted(e: LiveEvent) {
  if (NOISE.has(e.type)) return false;
  if (e.type === 'new_device') return prefs.newDevice;
  if (e.type === 'arrive' || e.type === 'leave') return prefs.presence === 'all' || (prefs.presence === 'favs' && !!e.mac && isFav('devices', e.mac));
  if (/^internet_|^wan_/.test(e.type)) return prefs.internet;
  if (e.level === 'alert' || /^login|temp/.test(e.type)) return prefs.security;
  return prefs.system;
}

// ───────── Son discret (deux notes douces), synthétisé : aucun fichier audio ─────────
let ac: AudioContext | null = null;
function chime(tone?: string) {
  try {
    ac = ac || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ac.state === 'suspended') ac.resume();
    const t = ac.currentTime;
    const notes = tone === 'danger' || tone === 'warn' ? [660, 520] : [880, 1320];
    notes.forEach((f, i) => {
      const o = ac!.createOscillator(), g = ac!.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + i * 0.12);
      g.gain.linearRampToValueAtTime(0.05, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.35);
      o.connect(g).connect(ac!.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.4);
    });
  } catch { /* audio indisponible */ }
}
// Notification du système (onglet masqué, autorisation accordée)
async function systemNotify(title: string, body: string, url: string, tag: string) {
  if (!prefs.desktop || !('Notification' in window) || Notification.permission !== 'granted' || !document.hidden) return;
  const opts: NotificationOptions = { body, tag, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url } };
  try { const reg = await navigator.serviceWorker?.getRegistration(); if (reg) return reg.showNotification(title, opts); } catch { /* */ }
  try { const n = new Notification(title, opts); n.onclick = () => { window.focus(); location.hash = url.replace(/^\/?/, ''); n.close(); }; } catch { /* */ }
}

// ───────── Carte de notification ─────────
type N = { icon: string; tone?: string; title: string; sub?: string; onClick?: () => void; life?: number };
function NotifCard({ id, n }: { id: string | number; n: N }) {
  const tone = n.tone || '';
  return (
    <div role="status" onClick={() => { n.onClick?.(); sonner.dismiss(id); }}
      className={cn('notif-card group relative flex w-[min(380px,calc(100vw-16px))] cursor-pointer items-center gap-3 overflow-hidden rounded-[18px] py-3 pl-3 pr-4',
        'border border-[var(--card-border)] bg-[color-mix(in_oklab,var(--popover)_86%,transparent)] text-popover-foreground shadow-pop backdrop-blur-xl backdrop-saturate-150',
        'geist:glass geist:gap-2.5 geist:rounded-xl geist:border-0 geist:py-2.5 geist:pl-2.5 geist:pr-3.5')}>
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl geist:size-8 geist:rounded-lg',
        tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'danger' ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand-ink geist:bg-selected geist:text-foreground')}>
        <Icon name={n.icon || 'bell'} className="size-[18px] geist:size-4" strokeWidth={1.8} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold tracking-[-0.005em] geist:text-[13px] geist:font-medium">{n.title}</div>
        {n.sub && <div className="mt-0.5 truncate text-[12.5px] text-muted-foreground geist:text-[12px]">{n.sub}</div>}
      </div>
      <span className="self-start pt-0.5 text-[11.5px] text-muted-foreground">maintenant</span>
      <i aria-hidden className={cn('notif-life absolute inset-x-0 bottom-0 h-[2px] origin-left opacity-60',
        tone === 'ok' ? 'bg-ok' : tone === 'warn' ? 'bg-warn' : tone === 'danger' ? 'bg-danger' : 'bg-brand geist:bg-foreground geist:opacity-30')}
        style={{ animationDuration: `${n.life || 6500}ms` }} />
    </div>
  );
}

/** Affiche une notification (bannière animée en haut) */
export function notify(n: N) {
  const life = n.life || 6500;
  sonner.custom((id) => <NotifCard id={id} n={{ ...n, life }} />, { toasterId: 'live', duration: life, unstyled: true });
  window.dispatchEvent(new CustomEvent('notif:ring'));
  if (prefs.sound) chime(n.tone);
}

function handle(evs: LiveEvent[]) {
  const list = evs.filter(wanted);
  if (!list.length) return;
  const byMac = new Map((live.hosts || []).map((h: any) => [String(h.macaddress).toLowerCase(), h]));
  const show = (e: LiveEvent) => {
    const i = eventInfo(e, byMac);
    const h: any = e.mac && byMac.get(String(e.mac).toLowerCase());
    notify({ icon: i.icon, tone: i.tone, title: i.title, sub: i.sub, life: e.level === 'alert' ? 10000 : 6500, onClick: () => (h ? go('appareils', String(h.id)) : go('activite')) });
    systemNotify(i.title, i.sub || 'Ma Bbox', h ? `#/appareils/${h.id}` : '#/activite', 'bbox-' + e.id);
  };
  if (list.length > 3) {
    const t0 = eventInfo(list[0], byMac).title, t1 = eventInfo(list[1], byMac).title;
    notify({ icon: 'bell', title: `${list.length} nouveaux événements`, sub: `${t0} · ${t1}…`, onClick: () => go('activite') });
    systemNotify(`${list.length} nouveaux événements`, t0, '#/activite', 'bbox-burst');
  } else list.slice().reverse().forEach(show);
}

/** Hôte des notifications temps réel (en haut à droite sur ordinateur, en haut sur iPhone) */
export function NotifyHost() {
  const a = useAppearance();
  const mobile = useMobile();
  const [top, setTop] = useState(72);
  useEffect(() => (document.documentElement.dataset.preview ? undefined : onLiveEvents(handle)), []);
  useEffect(() => {
    const place = () => { const hd = document.querySelector('[data-app-header]'); setTop(Math.round((hd?.getBoundingClientRect().bottom || 56) + 12)); };
    place(); window.addEventListener('resize', place);
    const t = setTimeout(place, 600);
    return () => { window.removeEventListener('resize', place); clearTimeout(t); };
  }, [a.layout, mobile]);
  return (
    <Toaster id="live" theme={a.theme} position={mobile ? 'top-center' : 'top-right'} offset={{ top, right: 16 }} mobileOffset={{ top: 'calc(env(safe-area-inset-top) + 8px)', left: 8, right: 8 }}
      visibleToasts={4} gap={10} swipeDirections={mobile ? ['top', 'left', 'right'] : ['right']} toastOptions={{ unstyled: true }} />
  );
}

// ───────── Réglages (feuille) ─────────
function NotifRow({ title, sub, value, onChange, disabled }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-t border-border py-3 first:border-t-0 geist:min-h-12 geist:border-t-0 geist:py-2">
      <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium clair:font-semibold geist:text-[13.5px]">{title}</div>{sub && <div className="mt-0.5 text-[13px] text-muted-foreground geist:text-[12.5px]">{sub}</div>}</div>
      <Toggle value={value} onChange={onChange} label={title} disabled={disabled} />
    </div>
  );
}
function NotifSheet() {
  const p = useNotifPrefs();
  const [perm, setPerm] = useState<string>(() => ('Notification' in window ? Notification.permission : 'unsupported'));
  const setDesktop = async (v: boolean) => {
    if (v && perm !== 'granted' && 'Notification' in window) { const r = await Notification.requestPermission(); setPerm(r); if (r !== 'granted') throw new Error('refusé'); }
    setNotifPrefs({ desktop: v });
  };
  return (
    <>
      <SheetBody className="grid content-start gap-5">
        <Field label="Arrivées et départs des appareils" help="« Favoris » : seulement les appareils épinglés sur l’accueil.">
          <Seg block label="Arrivées et départs" value={p.presence} onChange={(v) => setNotifPrefs({ presence: v })} options={[{ v: 'none', l: 'Aucun' }, { v: 'favs', l: 'Favoris' }, { v: 'all', l: 'Tous' }]} />
        </Field>
        <div className="rounded-xl border border-border px-4 geist:rounded-none geist:border-0 geist:px-0">
          <NotifRow title="Nouvel appareil" sub="Un appareil jamais vu rejoint le réseau" value={p.newDevice} onChange={(v) => setNotifPrefs({ newDevice: v })} />
          <NotifRow title="Coupure d’Internet" sub="Perte et retour de la connexion" value={p.internet} onChange={(v) => setNotifPrefs({ internet: v })} />
          <NotifRow title="Sécurité" sub="Connexions à l’administration, essais refusés" value={p.security} onChange={(v) => setNotifPrefs({ security: v })} />
          <NotifRow title="Activité de la Bbox" sub="Wi-Fi, mises à jour, pauses, Wi-Fi invité" value={p.system} onChange={(v) => setNotifPrefs({ system: v })} />
          <NotifRow title="Son discret" sub="Deux notes douces à chaque notification" value={p.sound} onChange={(v) => { setNotifPrefs({ sound: v }); if (v) chime('ok'); }} />
          {perm !== 'unsupported' && <NotifRow title="Notifications du système" sub={perm === 'denied' ? 'Bloquées dans les réglages du navigateur' : 'Quand le panel est en arrière-plan'} value={p.desktop && perm === 'granted'} disabled={perm === 'denied'} onChange={setDesktop} />}
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="flex-1 text-[13px] text-muted-foreground">Réglages propres à cet appareil</span>
        <Btn kind="soft" size="sm" icon="bell" onClick={() => notify({ icon: 'bell', tone: 'ok', title: 'Notification d’essai', sub: 'Voici à quoi ressemblent les alertes', onClick: () => go('activite') })}>Essayer</Btn>
      </SheetFooter>
    </>
  );
}
export const openNotifSettings = () => openSheet(NotifSheet, {}, { title: 'Notifications', description: 'Alertes en temps réel sur cet appareil' });
