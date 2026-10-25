// Appareils : tableau vivant (bureau) ou liste (mobile), recherche, filtres, fiche détaillée avec actions.
import * as React from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { PageHead, Card, KV, Seg, Btn, Chip, Empty, FormSheet, DataTable, Input, Avatar, Row, Note, SectionTitle, Skeleton, ToggleRow, IconBtn, Tip, type Col, type Opt, type FieldDef } from '@/components/kit';
import { openSheet, SheetBody } from '@/components/overlays';
import { Icon, KIND_ICON } from '@/components/icon';
import { SignalBars } from '@/components/charts';
import { PauseSheet, nameField } from '@/components/sheets';
import { api } from '@/lib/api';
import { act, load, toast, errMsg } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { deviceKind, displayName, bandLabel, signal, bestRssi, relative, dateTime, mbps, isIPv4, plural, bboxHostname } from '@/lib/format';
import { usePrefs, isFav, toggleFav, pauseOf, untilLabel, resumeDevice, setAlias } from '@/lib/prefs';
import type { Route } from '@/lib/router';
import { cn } from '@/lib/utils';

type Host = any;
type Filter = 'all' | 'on' | 'wifi' | 'eth' | 'off' | 'fav';

const isEth = (h: Host) => /Ethernet/i.test(h.link || '');
const rateOf = (h: Host): number => Number(h.wireless?.estimatedRate) || (isEth(h) && h.ethernet?.speed ? Number(h.ethernet.speed) : 0);
const FILTERS: { v: Filter; l: string }[] = [{ v: 'all', l: 'Tous' }, { v: 'on', l: 'Connectés' }, { v: 'wifi', l: 'Wi-Fi' }, { v: 'eth', l: 'Ethernet' }, { v: 'off', l: 'Hors ligne' }, { v: 'fav', l: 'Favoris' }];
const lastSeen = (h: Host) => (h.active ? 'maintenant' : h.lastseen > 0 ? relative(new Date(Date.now() - h.lastseen * 1000)) : '—');
const passes = (h: Host, f: Filter) => {
  if (f === 'on' && !h.active) return false;
  if (f === 'off' && h.active) return false;
  if (f === 'wifi' && (isEth(h) || !h.active)) return false;
  if (f === 'eth' && !isEth(h)) return false;
  if (f === 'fav' && !isFav('devices', h.macaddress)) return false;
  return true;
};
const EASE = [0.16, 1, 0.3, 1] as const;
const ipKey = (h: Host) => (h.ipaddress || '').split('.').map((x: string) => x.padStart(3, '0')).join('.');
// Panneau bordé (Noir Geist) / tonal (Bbox Clair), partagé par la fiche
const PANEL = 'rounded-xl border border-border clair:border-transparent clair:bg-surface geist:rounded-none geist:border-0 geist:!px-0';

export default function Devices({ route }: { route: Route }) {
  const s = useLive();
  const prefs = usePrefs();
  const [q, setQ] = useState('');
  const [f, setF] = useState<Filter>('all');
  const opened = useRef<string | null>(null);
  const [nav, setNav] = useState(0);
  const all: Host[] = s.hosts || [];
  const guests: Host[] = s.guestHosts || [];

  // Ouverture directe d'une fiche (#/appareils/<id>) depuis l'accueil, l'activité ou la palette.
  // L'URL est ramenée à #/appareils à la fermeture ; seule une nouvelle navigation peut rouvrir la fiche.
  useEffect(() => {
    const onHash = () => { opened.current = null; setNav((n) => n + 1); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    if (!route.arg || !all.length || opened.current === route.arg) return;
    const h = all.find((x) => String(x.id) === route.arg);
    if (!h) return;
    opened.current = route.arg;
    openDevice(h).then(() => { if (location.hash.startsWith('#/appareils/')) history.replaceState(null, '', '#/appareils'); });
  }, [route.arg, all.length, nav]);

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return all
      .filter((h) => passes(h, f) && (!needle || [displayName(h), h.ipaddress, h.macaddress, h.informations?.manufacturer, h.informations?.type].some((v) => String(v || '').toLowerCase().includes(needle))))
      .sort((a, b) => b.active - a.active || rateOf(b) - rateOf(a) || displayName(a).localeCompare(displayName(b), 'fr'));
  }, [all, q, f, s.t, prefs]);
  const activeCount = all.filter((h) => h.active).length;
  const segOpts: Opt[] = FILTERS.map((o) => ({
    v: o.v,
    l: <>{o.l}{all.length > 0 && <span className="num text-[11.5px] font-medium text-muted-foreground">{all.filter((h) => passes(h, o.v)).length}</span>}</>,
  }));

  const columns: Col<Host>[] = [
    {
      key: 'name', label: 'Appareil', sort: (h) => displayName(h),
      render: (h) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className={cn('inline-flex', !h.active && 'opacity-70')}><Avatar icon={KIND_ICON[deviceKind(h)]} size="sm" on={!!h.active} paused={!!pauseOf(h.macaddress)} /></span>
          <div className="min-w-0 max-w-[300px]">
            <div className="flex min-w-0 items-center gap-1.5 font-medium clair:font-semibold">
              <span className="truncate">{displayName(h)}</span>
              {isFav('devices', h.macaddress) && <Icon name="starfill" className="size-3 text-chart-4" role="img" aria-hidden={false} aria-label="Favori" />}
            </div>
            <div className="truncate text-[13px] text-muted-foreground geist:text-[12px]">{h.informations?.manufacturer || h.informations?.type || '—'}</div>
          </div>
        </div>
      ),
    },
    { key: 'ip', label: 'Adresse IP', sort: ipKey, render: (h) => <span className="font-mono text-[13px] geist:font-sans geist:tabular-nums geist:text-muted-foreground">{h.ipaddress || '—'}</span> },
    {
      key: 'link', label: 'Connexion', sort: (h) => h.link || '',
      render: (h) => (h.active ? (
        <div className="flex items-center gap-2 whitespace-nowrap">
          {isEth(h) ? <Icon name="ethernet" className="size-4 text-muted-foreground" /> : <SignalBars bars={signal(bestRssi(h)).bars} />}
          <span>{bandLabel(h.link, h.wireless?.band)}</span>
        </div>
      ) : <span className="text-muted-foreground">—</span>),
    },
    { key: 'rate', label: 'Débit du lien', align: 'r', sort: (h) => (h.active ? rateOf(h) : -1), render: (h) => <span className="num whitespace-nowrap">{h.active && rateOf(h) ? mbps(rateOf(h)) : '—'}</span> },
    {
      key: 'state', label: 'État', className: 'geist:!pl-8', sort: (h) => (pauseOf(h.macaddress) ? 2 : h.active ? 1 : 0),
      render: (h) => {
        const pz = pauseOf(h.macaddress);
        return pz ? <Chip tone="warn">En pause · {untilLabel(pz.until)}</Chip>
          : h.active ? <Chip tone="ok" dot>Connecté</Chip>
            : <span className="whitespace-nowrap text-muted-foreground">{h.lastseen > 0 ? 'vu ' + lastSeen(h) : 'hors ligne'}</span>;
      },
    },
    { key: 'go', label: '', align: 'r', className: 'w-12', render: () => <Icon name="chevron" className="ml-auto size-[18px] text-muted-foreground" /> },
  ];

  return (
    <>
      <PageHead kicker="Réseau principal" title="Appareils"
        sub={`${activeCount} connectés · ${all.length} connus${guests.length ? ` · ${plural(guests.filter((g) => g.active).length, 'invité')}` : ''}`}
        actions={<Btn kind="soft" size="sm" icon="refresh" onClick={async () => { await api.put('identification/hosts', { command: 'refresh' }).catch(() => {}); await refresh('hosts'); toast('Liste actualisée'); }}>Actualiser</Btn>} />

      <div className="enter mb-4 flex min-w-0 flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1 basis-full sm:max-w-[420px] sm:basis-[240px]">
          <Input type="search" icon="search" placeholder="Nom, IP, MAC, fabricant…" value={q} onInput={setQ} aria-label="Rechercher un appareil" autoCapitalize="off" spellCheck={false} />
        </div>
        <Seg options={segOpts} value={f} onChange={setF} label="Filtrer" />
      </div>

      {!all.length ? (
        <div className="card-surface enter py-1.5" aria-busy>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex min-h-[60px] items-center gap-3 border-t border-border px-5 py-2.5 first:border-t-0 max-sm:px-4">
              <Skeleton h={40} w={40} className="rounded-xl" />
              <div className="grid flex-1 gap-1.5"><Skeleton h={13} w="40%" /><Skeleton h={11} w="25%" /></div>
            </div>
          ))}
        </div>
      ) : (
        <Card flush title={`${list.length} appareil${list.length > 1 ? 's' : ''}`} icon="devices">
          <DataTable rows={list} columns={columns} rowKey={(h) => h.id} onRow={(h) => openDevice(h)} dim={(h) => !h.active}
            mobile={(h) => <DeviceRow h={h} />}
            empty={<Empty icon="search" title="Aucun appareil">Aucun appareil ne correspond à cette recherche.</Empty>} />
        </Card>
      )}

      {guests.length > 0 && (
        <Card flush className="mt-4" title={`Wi-Fi invité · ${guests.length}`} icon="link">
          <div className="grid grid-cols-[minmax(0,1fr)]">{guests.map((h) => <DeviceRow key={'g' + h.id} h={h} guest />)}</div>
        </Card>
      )}
      <Note className="mx-1 mt-3.5">Mise à jour en direct. Ouvrez un appareil pour le mettre en pause, le renommer, le réveiller, l’épingler ou l’analyser.</Note>
    </>
  );
}

function DeviceRow({ h, guest = false }: { h: Host; guest?: boolean }) {
  const sig = signal(bestRssi(h));
  const r = rateOf(h);
  const pz = pauseOf(h.macaddress);
  const sub = pz ? `en pause jusqu’à ${untilLabel(pz.until)}` : [h.ipaddress, h.active ? bandLabel(h.link, h.wireless?.band) : h.lastseen > 0 ? `vu ${lastSeen(h)}` : 'hors ligne'].filter(Boolean).join(' · ');
  return (
    <Row onClick={() => openDevice(h, guest)}>
      <Avatar icon={KIND_ICON[deviceKind(h)]} on={!!h.active} paused={!!pz} />
      <div className="min-w-0 flex-1">
        <div className={cn('flex min-w-0 items-center gap-1.5 text-[15px] font-medium clair:font-semibold geist:text-[13.5px]', !h.active && 'text-muted-foreground')}>
          <span className="truncate">{displayName(h)}</span>
          {!guest && isFav('devices', h.macaddress) && <Icon name="starfill" className="size-3 text-chart-4" role="img" aria-hidden={false} aria-label="Favori" />}
        </div>
        <div className={cn('truncate text-[13px] geist:text-[12.5px]', pz ? 'text-warn' : 'text-muted-foreground')}>{sub}</div>
      </div>
      {!!h.active && r > 0 && <Chip className="num max-sm:hidden">{mbps(r)}</Chip>}
      {!!h.active && (isEth(h)
        ? <Icon name="ethernet" className="size-[18px] text-muted-foreground" />
        : <span title={sig.label} className="inline-flex"><SignalBars bars={sig.bars} /></span>)}
      <Icon name="chevron" className="size-[18px] text-muted-foreground" />
    </Row>
  );
}

function StarBtn({ h }: { h: Host }) {
  usePrefs();
  const on = isFav('devices', h.macaddress);
  const label = on ? 'Retirer des favoris' : 'Ajouter aux favoris';
  return (
    <Tip label={label}>
      <button type="button" aria-pressed={on} aria-label={label} onClick={() => toggleFav('devices', h.macaddress, displayName(h))}
        className={cn('inline-grid size-9 shrink-0 place-items-center rounded-full outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 geist:size-8 geist:rounded-md geist:hover:bg-selected',
          on ? 'text-chart-4' : 'text-muted-foreground hover:text-foreground')}>
        <motion.span key={String(on)} className="grid place-items-center" initial={{ scale: on ? 0.55 : 0.9 }} animate={{ scale: 1 }} transition={{ type: 'spring', stiffness: 640, damping: 17 }}>
          <Icon name={on ? 'starfill' : 'star'} className="size-[19px]" />
        </motion.span>
      </button>
    </Tip>
  );
}

/** Ouvre la fiche d'un appareil (aussi utilisée par l'accueil, l'activité et la palette) */
export function openDevice(h: Host, guest = false): Promise<any> {
  return openSheet(DeviceSheet, { id: h.id, guest }, {
    title: displayName(h),
    description: [h.informations?.type, h.informations?.manufacturer].filter(Boolean).join(' · ') || 'Appareil',
    actions: guest ? undefined : <StarBtn h={h} />,
  });
}

// ───── Fiche appareil ─────
type DiagKind = 'ping' | 'scan';
type Diag = { kind: DiagKind; data: any };
type QuickAction = { id: string; icon: string; label: string; run: () => unknown; disabled?: boolean; tone?: 'warn' };
const msOf = (us: any) => (us ? (us / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) + ' ms' : '—');

function DeviceSheet({ id, guest, close }: { id: any; guest: boolean; close: (v?: unknown) => void }) {
  const s = useLive();
  const h: Host | undefined = (guest ? s.guestHosts : s.hosts)?.find((x: Host) => x.id === id);
  const [diag, setDiag] = useState<Diag | null>(null);
  const alive = useRef(true);
  const runId = useRef(0);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  if (!h) return <SheetBody><Empty title="Appareil introuvable" /></SheetBody>;

  const sig = signal(bestRssi(h));
  const eth = isEth(h);
  const base = guest ? `guests/${h.id}` : `hosts/${h.id}`;
  const inSchedules = h.parentalcontrol?.enable === 1;
  const pz = pauseOf(h.macaddress);
  const reserved = (s.dhcp?.dhcp?.clients || []).find((c: any) => c.macaddress?.toLowerCase() === h.macaddress?.toLowerCase());
  const running = diag?.data?.status === 'Running';
  const rate = rateOf(h);
  const rssi = bestRssi(h);

  const runDiag = async (kind: DiagKind) => {
    const my = ++runId.current;
    const current = () => alive.current && runId.current === my;
    setDiag({ kind, data: { status: 'Running' } });
    try {
      // La Bbox coupe parfois la connexion en réponse à l'action (le test tourne quand même) : on continue.
      try { await api.post(base, { action: kind }); } catch (e: any) { if (e?.status !== 502) throw e; }
      let seenRunning = false;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        if (!current()) return; // fiche fermée : on arrête d'interroger la Bbox
        const raw = await api.get(base);
        const o = raw?.host || raw?.hosts?.list?.[0] || raw;
        const d = o?.[kind];
        if (d?.status === 'Running') seenRunning = true;
        const finished = d && d.status && d.status !== 'Running' && (seenRunning || i >= 2);
        if (!current()) return;
        setDiag({ kind, data: finished ? d : { ...(d || {}), status: 'Running' } });
        if (finished) return;
      }
      // toujours « en cours » après 40 s : on referme le panneau pour pouvoir relancer le test
      if (current()) { setDiag(null); toast('Le test n’a pas abouti : réessayez dans un instant.', 'err'); }
    } catch (e) {
      if (current()) { setDiag(null); toast(errMsg(e), 'err'); }
    }
  };

  const actions = ([
    !guest && (pz
      ? { id: 'resume', icon: 'play', label: 'Reprendre', tone: 'warn', run: () => resumeDevice(h) }
      : { id: 'pause', icon: 'pause', label: 'Pause', run: () => { openSheet(PauseSheet, { h }, { title: 'Mettre en pause', description: displayName(h) }); } }),
    !!h.active && { id: 'ping', icon: 'activity', label: 'Ping', disabled: running, run: () => { void runDiag('ping'); } },
    !!h.active && { id: 'scan', icon: 'search', label: 'Ports', disabled: running, run: () => { void runDiag('scan'); } },
    !guest && { id: 'rename', icon: 'edit', label: 'Renommer', run: () => { renameDevice(h, reserved); } },
    !h.active && !guest && { id: 'wake', icon: 'power', label: 'Réveiller', run: () => act(() => api.post(base, { action: 'wakeup' }), { ok: 'Signal de réveil envoyé' }) },
  ] as (QuickAction | false)[]).filter(Boolean) as QuickAction[];

  return (
    <SheetBody className="pt-1">
      {/* Identité + actions rapides */}
      <section className="overflow-hidden rounded-2xl border border-border bg-card clair:border-transparent clair:bg-surface geist:overflow-visible geist:rounded-none geist:border-0 geist:bg-transparent">
        <div className="flex items-center gap-4 p-4 geist:gap-3 geist:px-0 geist:pb-3 geist:pt-1">
          <HeroAvatar h={h} paused={!!pz} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap gap-1.5">
              {h.active ? <Chip tone="ok" dot>Connecté</Chip> : <Chip tone="off" dot>Hors ligne</Chip>}
              {pz && <Chip tone="warn" className="min-w-0 max-w-full shrink"><span className="truncate">En pause jusqu’à {untilLabel(pz.until)}</span></Chip>}
              {inSchedules && <Chip>Plages de pause</Chip>}
              {!!h.preferred && <Chip tone="brand">Prioritaire</Chip>}
              {guest && <Chip>Invité</Chip>}
            </div>
            {!guest && !pz && (
              <div className="mt-2 flex min-w-0 items-center gap-1.5 text-[13px] text-muted-foreground">
                <Icon name="globe" className="size-3.5" /><span className="truncate">Accès à Internet autorisé</span>
              </div>
            )}
          </div>
        </div>
        {actions.length > 0 && (
          <div role="group" aria-label="Actions rapides" className="grid auto-cols-fr grid-flow-col divide-x divide-border border-t border-border geist:flex geist:flex-wrap geist:gap-1.5 geist:divide-x-0 geist:border-t-0">
            {actions.map((a) => <ActionBtn key={a.id} a={a} />)}
          </div>
        )}
      </section>

      {/* Diagnostic : apparaît sous les actions (opacité + translation, sans animer la hauteur) */}
      <AnimatePresence mode="wait" initial={false}>
        {diag && (
          <motion.section key={diag.kind} aria-live="polite"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.24, ease: EASE }}
            className={cn(PANEL, 'mt-3 p-4')}>
            <DiagPanel diag={diag} onClose={() => setDiag(null)} />
          </motion.section>
        )}
      </AnimatePresence>

      {/* Mesures en direct */}
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {h.active ? (
          <>
            <LiveTile icon={eth ? 'ethernet' : 'wifi'} label="Connexion" value={bandLabel(h.link, h.wireless?.band)}
              extra={eth && h.ethernet?.logicalport ? <span className="truncate">port {h.ethernet.logicalport}</span>
                : !eth ? <><SignalBars bars={sig.bars} /><span className="truncate">{sig.label}</span></> : null} />
            <LiveTile icon="zap" label={eth ? 'Vitesse du lien' : 'Débit estimé'} value={rate ? mbps(rate) : '—'}
              extra={!eth && rssi ? <span className="num truncate">{rssi} dBm</span> : null} />
          </>
        ) : (
          <>
            {/* hors ligne : ce qui est utile, c'est quand et comment il était connecté */}
            <LiveTile icon="clock" label="Dernière connexion" value={h.lastseen > 0 ? relative(new Date(Date.now() - h.lastseen * 1000)) : 'inconnue'}
              extra={<span className="truncate">{eth ? 'en Ethernet' : h.wireless?.band ? `en ${bandLabel(h.link, h.wireless?.band)}` : 'hors ligne'}</span>} />
            <LiveTile icon={eth ? 'ethernet' : 'wifi'} label={eth ? 'Lien' : 'Dernier signal'} value={!eth && rssi ? `${rssi} dBm` : '—'}
              extra={!eth && rssi ? <><SignalBars bars={sig.bars} /><span className="truncate">{sig.label}</span></> : null} />
          </>
        )}
      </div>

      <SectionTitle>Détails</SectionTitle>
      <div className={cn(PANEL, 'px-4 py-0.5 clair:py-1.5')}>
        <KV rows={[
          ['Adresse IP', <span className="select-all font-mono text-[13.5px]">{h.ipaddress || '—'}</span>],
          ['Adresse MAC', <span className="select-all font-mono text-[13.5px]">{h.macaddress}</span>],
          ['Attribution', h.type === 'Static' || reserved ? 'IP réservée' : 'DHCP'],
          h.ip6address?.length ? ['IPv6', <span className="select-all font-mono text-[12px]">{h.ip6address[0].ipaddress}</span>] : null,
          ['Vu pour la première fois', dateTime(h.firstseen)],
          !h.active && h.lastseen > 0 ? ['Dernière connexion', relative(new Date(Date.now() - h.lastseen * 1000))] : null,
          h.informations?.operatingSystem ? ['Système', h.informations.operatingSystem] : null,
        ]} />
      </div>

      {!guest && (
        <>
          <SectionTitle>Réglages</SectionTitle>
          <div className={cn(PANEL, 'px-4')}>
            <ToggleRow title="Soumis aux plages de pause" sub="Applique les plages horaires définies dans « Pauses & contrôle »" value={inSchedules}
              onChange={(nv) => act(() => api.put('parentalcontrol/hosts', { enable: nv ? 1 : 0, macaddress: h.macaddress }), { ok: nv ? 'Ajouté aux plages de pause' : 'Retiré des plages de pause' }).then(() => refresh('hosts'))} />
            {/* mêmes conditions que l'interface officielle : appareil Wi-Fi, pas un répéteur. Sans summary.preferredAvailable,
                le firmware n'a pas l'objet de priorisation (POST → 404 « enable: Object does not exist ») : on l'explique. */}
            {String(h.link || '').toLowerCase().includes('wifi') && String(h.devicetype).toLowerCase() !== 'repeater' && (
              Number(s.summary?.preferredAvailable) === 1
                ? <ToggleRow title="Appareil prioritaire" sub="La Bbox lui donne la priorité sur le Wi-Fi" value={!!h.preferred}
                    onChange={(nv) => act(() => api.post('hosts/prioritize/' + h.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Appareil prioritaire' : 'Priorité retirée' }).then(() => refresh('hosts'))} />
                : <ToggleRow title="Appareil prioritaire" sub="Non proposé par votre Bbox : son firmware n’inclut pas la priorisation (l’interface officielle la masque aussi)." value={false} disabled onChange={() => {}} />
            )}
            {!eth && (
              <ToggleRow title="Figer sur sa bande Wi-Fi" sub="Empêche la Bbox de le basculer entre 2,4 / 5 / 6 GHz" value={h.wireless?.static === 1}
                onChange={(nv) => act(() => api.put('untouchable/hosts/' + h.id, { enable: nv ? 1 : 0 }), { ok: nv ? 'Bande figée' : 'Bande automatique' }).then(() => refresh('hosts'))} />
            )}
          </div>
        </>
      )}

      {!h.active && (
        <div className={cn(PANEL, 'mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5 px-4 py-3.5 geist:border-[color-mix(in_oklab,var(--danger)_32%,var(--border))]')}>
          <div className="min-w-0 flex-1 basis-[200px]">
            <div className="text-[14.5px] font-medium clair:font-semibold">Retirer cet appareil</div>
            <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">Il disparaîtra de la liste jusqu’à sa prochaine connexion.</div>
          </div>
          <Btn kind="danger-ghost" size="sm" icon="trash"
            confirm={{ title: 'Retirer cet appareil ?', message: 'Il disparaîtra de la liste jusqu’à sa prochaine connexion.', confirm: 'Retirer', tone: 'danger', icon: 'trash' }}
            onClick={async () => { await act(() => api.del(base), { ok: 'Appareil retiré' }); refresh('hosts'); close(); }}>Retirer</Btn>
        </div>
      )}
    </SheetBody>
  );
}

/** Grand avatar de la fiche : pastille d'état découpée, pulsation quand l'appareil est en ligne */
function HeroAvatar({ h, paused }: { h: Host; paused: boolean }) {
  const on = !!h.active;
  return (
    <span className="relative grid size-16 shrink-0 place-items-center rounded-[18px] border border-border bg-card text-foreground shadow-card clair:border-transparent clair:text-[color-mix(in_oklab,var(--foreground)_78%,var(--brand))] geist:size-11 geist:rounded-lg geist:border-0 geist:bg-selected geist:shadow-none">
      <Icon name={KIND_ICON[deviceKind(h)]} className="size-7 geist:size-[21px]" strokeWidth={1.7} />
      <span aria-hidden className="absolute -bottom-1 -right-1 grid size-[18px] place-items-center rounded-full bg-card geist:bg-[var(--glass)]">
        {on && !paused ? <span className="live-dot" /> : <span className={cn('size-2 rounded-full', paused ? 'bg-warn' : 'bg-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--card))]')} />}
      </span>
    </span>
  );
}

/** Cellule de la barre d'actions : icône + libellé, roue d'attente si l'action renvoie une promesse */
function ActionBtn({ a }: { a: QuickAction }) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    if (busy) return;
    const r = a.run() as any;
    if (r && typeof r.then === 'function') { setBusy(true); try { await r; } catch { /* toast déjà affiché */ } finally { setBusy(false); } }
  };
  return (
    <button type="button" onClick={run} disabled={a.disabled || busy} aria-busy={busy || undefined}
      className={cn('flex h-16 min-w-0 flex-col items-center justify-center gap-1.5 px-1 text-[12.5px] font-medium outline-none transition-colors max-sm:h-[66px] geist:h-8 geist:flex-row geist:rounded-md geist:bg-selected geist:px-2.5 geist:text-[13px] geist:hover:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)] geist:max-sm:h-10',
        'text-[color-mix(in_oklab,var(--foreground)_84%,var(--muted-foreground))] hover:bg-accent hover:text-foreground focus-visible:bg-accent active:bg-accent',
        'disabled:pointer-events-none disabled:opacity-40 clair:font-semibold clair:[&_svg]:text-brand',
        a.tone === 'warn' && 'text-warn hover:text-warn clair:[&_svg]:text-warn')}>
      {busy ? <Loader2 className="size-[18px] animate-spin geist:size-[15px]" /> : <Icon name={a.icon} className="size-[18px] geist:size-[15px]" strokeWidth={1.8} />}
      <span className="max-w-full truncate">{a.label}</span>
    </button>
  );
}

function LiveTile({ icon, label, value, extra }: { icon: string; label: string; value: string; extra?: React.ReactNode }) {
  return (
    <div className={cn(PANEL, 'min-w-0 px-3.5 py-3')}>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-muted-foreground">
        <Icon name={icon} className="size-3.5" /><span className="truncate">{label}</span>
      </div>
      <div className="num mt-1 truncate text-[19px] font-semibold tracking-[-0.02em] geist:text-[18px] geist:font-medium">
        <motion.span key={value} className="inline-block" initial={{ opacity: 0.3, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}>{value}</motion.span>
      </div>
      <div className="mt-0.5 flex h-[18px] min-w-0 items-center gap-1.5 text-[12.5px] text-muted-foreground">{extra}</div>
    </div>
  );
}

function DiagPanel({ diag, onClose }: { diag: Diag; onClose: () => void }) {
  const d = diag.data;
  const running = d.status === 'Running';
  const services: any[] = d.services || [];
  const open = services.filter((x) => /open/i.test(x.state));
  return (
    <>
      <div className="mb-3 flex min-h-8 items-center gap-2">
        <Icon name={diag.kind === 'ping' ? 'activity' : 'search'} className="size-4 text-muted-foreground" />
        <b className="text-[14px] font-semibold geist:font-medium">{diag.kind === 'ping' ? 'Ping' : 'Analyse des ports'}</b>
        <span className="flex-1" />
        {running ? <Loader2 className="mr-1.5 size-4 animate-spin text-brand" aria-label="En cours" /> : <IconBtn icon="x" label="Fermer" size="sm" tip={false} onClick={onClose} />}
      </div>
      <motion.div key={running ? 'run' : 'done'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
        {diag.kind === 'ping' ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
              <div className="min-w-0">
                {running && !d.average ? <Skeleton h={26} w={92} /> : <div className="num text-[26px] font-semibold leading-none tracking-[-0.03em] geist:font-medium">{msOf(d.average)}</div>}
                <div className="mt-1.5 text-[12.5px] text-muted-foreground">Temps moyen</div>
              </div>
              <Chip tone={running ? 'brand' : d.success > 0 ? 'ok' : 'danger'} dot>{running ? 'En cours…' : d.success > 0 ? 'Répond' : 'Ne répond pas'}</Chip>
            </div>
            {!running && (d.min != null || d.tries != null) && (
              <div className="mt-3 border-t border-border geist:border-t-0">
                <KV rows={[
                  d.min != null ? ['Min / max', <span className="num">{msOf(d.min)} / {msOf(d.max)}</span>] : null,
                  d.tries != null ? ['Réponses', <span className="num">{d.success ?? 0} sur {d.tries}</span>] : null,
                ]} />
              </div>
            )}
          </>
        ) : running && !services.length ? (
          <Note>Analyse des ports courants…</Note>
        ) : open.length ? (
          <div className="flex flex-wrap gap-1.5">{open.map((x, i) => <Chip key={i} tone="warn" className="num">{x.port}/{x.protocol}</Chip>)}</div>
        ) : (
          <Note>Aucun port ouvert parmi les {services.length} ports courants testés.</Note>
        )}
      </motion.div>
    </>
  );
}

// Le renommage passe par la réservation DHCP, exactement comme l'interface officielle.
// La Bbox refuse les espaces, accents et signes (400 « hostname Invalid parameter ») : le nom saisi
// est converti pour elle, et le panel garde le nom tel qu'écrit pour l'afficher.
function renameDevice(h: Host, reserved: any) {
  const fields: FieldDef[] = [
    nameField(),
    { key: 'ipaddress', label: 'Adresse IP réservée', required: true, inputmode: 'decimal', validate: (v) => (isIPv4(v) ? null : 'Adresse IPv4 invalide') },
  ];
  return openSheet(FormSheet, {
    intro: 'Le nom est enregistré dans une réservation d’adresse (bail DHCP fixe), comme le fait l’interface officielle : l’appareil gardera aussi son adresse IP.',
    fields,
    initial: { hostname: displayName(h), ipaddress: reserved?.ipaddress || h.ipaddress },
    submitLabel: 'Enregistrer',
    onSubmit: async (v: any) => {
      const pretty = String(v.hostname).trim(), hostname = bboxHostname(pretty);
      const body = { enable: 1, hostname, ipaddress: v.ipaddress.trim(), macaddress: h.macaddress };
      const clients: any[] = (await load('dhcp/clients', { force: true }))?.dhcp?.clients || [];
      const ex = clients.find((c) => c.macaddress?.toLowerCase() === h.macaddress.toLowerCase() || c.ipaddress === h.ipaddress);
      await act(() => (ex ? api.put('dhcp/clients/' + ex.id, body) : api.post('dhcp/clients', body)), { ok: 'Appareil renommé', refresh: ['dhcp'] });
      await setAlias(h.macaddress, pretty !== hostname ? pretty : null).catch(() => {});
      refresh('hosts', 'slow');
    },
  }, { title: 'Renommer', description: displayName(h) });
}
