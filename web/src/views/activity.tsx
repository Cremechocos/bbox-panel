// Activité : présence des appareils (frise 24 h), alertes et journal unifié (Bbox + serveur du panel).
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { PageHead, Card, Tabs, Btn, Empty, Skeleton, Note, SectionTitle, Chip, Avatar, Row } from '@/components/kit';
import { Icon, KIND_ICON } from '@/components/icon';
import { PresenceTimeline } from '@/components/charts';
import { panel } from '@/lib/api';
import { useFetch, useMobile } from '@/lib/data';
import { useLive, ackEvents, type LiveEvent, type LiveState } from '@/lib/live';
import { eventInfo, evDay, evTime, type EvInfo } from '@/lib/events';
import { displayName, deviceKind } from '@/lib/format';
import type { Route } from '@/lib/router';
import { cn } from '@/lib/utils';

const DAY = 86400e3;
const fmtDur = (ms: number) => { const m = Math.round(ms / 60000); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };
const NOISE = new Set(['wifi_restart', 'port_up', 'port_down']);
/** Fiche d'un appareil : définie par la vue Appareils, chargée à la demande */
const openDevice = (h: any) => import('@/views/devices').then((m) => m.openDevice(h));
type Item = { e: LiveEvent; i: EvInfo };

export default function Activity({ route }: { route: Route }) {
  const s = useLive();
  const [tab, setTab] = useState('all');
  const [older, setOlder] = useState<LiveEvent[]>([]);
  const [more, setMore] = useState(true);
  const mobile = useMobile();
  const byMac = useMemo(() => new Map((s.hosts || []).map((h) => [String(h.macaddress).toLowerCase(), h])), [s.hosts]);
  const presence = useFetch(() => panel.events({ since: Date.now() - DAY, types: 'arrive,leave', limit: 2000 }), [], { poll: 60000 });

  const all = useMemo(() => {
    const m = new Map<number, LiveEvent>();
    for (const e of [...(s.events || []), ...older]) if (!m.has(e.id)) m.set(e.id, e);
    return [...m.values()].filter((e) => !NOISE.has(e.type)).sort((a, b) => b.t - a.t);
  }, [s.events, older]);
  const withInfo = useMemo<Item[]>(() => all.map((e) => ({ e, i: eventInfo(e, byMac) })), [all, byMac]);
  const filtered = withInfo.filter(({ e, i }) => tab === 'all' || (tab === 'alerts' && (i.cat === 'alert' || e.level !== 'info')) || (tab === 'presence' && i.cat === 'presence') || (tab === 'system' && (i.cat === 'system' || i.cat === 'action')));
  const counts = { alerts: withInfo.filter(({ e, i }) => i.cat === 'alert' || e.level !== 'info').length, presence: withInfo.filter(({ i }) => i.cat === 'presence').length };
  const loadMore = async () => {
    const oldest = all[all.length - 1];
    const r = await panel.events({ before: oldest ? oldest.t : Date.now(), limit: 200 }).catch(() => null);
    if (!r?.events?.length) { setMore(false); return; }
    setOlder((o) => [...o, ...r.events]);
  };
  // groupement par jour
  const groups: [string, Item[]][] = [];
  for (const it of filtered) { const d = evDay(it.e.t); if (!groups.length || groups[groups.length - 1][0] !== d) groups.push([d, []]); groups[groups.length - 1][1].push(it); }
  // les événements apparus après l'ouverture de la page (direct ou « plus anciens ») glissent en place
  const seen = useRef<Set<number> | null>(null);
  if (seen.current === null && s.ready) seen.current = new Set(all.map((x) => x.id));
  const isFresh = (id: number) => !!seen.current && !seen.current.has(id);

  return (
    <>
      <PageHead kicker="Vue d’ensemble" title="Activité" sub={s.unread ? `${s.unread} notification${s.unread > 1 ? 's' : ''} non lue${s.unread > 1 ? 's' : ''}` : 'Tout est lu'}
        actions={!mobile && s.unread > 0 && <Btn kind="soft" size="sm" icon="check" onClick={() => ackEvents('all')}>Tout marquer comme lu</Btn>} />
      {mobile && s.unread > 0 && <div className="enter -mt-2 mb-4"><Btn kind="soft" size="sm" icon="check" onClick={() => ackEvents('all')}>Tout marquer comme lu</Btn></div>}
      <div className="grid grid-cols-1 gap-4 max-sm:gap-3">
        <Card title="Présence sur 24 heures" icon="user" sub="arrivées et départs des appareils">
          <Presence data={presence.data} loading={presence.loading} s={s} byMac={byMac} />
        </Card>
        <div className="min-w-0">
          <Tabs value={tab} onChange={setTab} label="Filtrer l’activité"
            tabs={[{ v: 'all', l: 'Tout' }, { v: 'alerts', l: 'Alertes', n: counts.alerts || null }, { v: 'presence', l: 'Présence', n: counts.presence || null }, { v: 'system', l: 'Système' }]} />
          {!groups.length ? (
            <div className="enter card-surface"><Empty icon="bell" title="Rien à afficher">Aucun événement dans cette catégorie pour le moment.</Empty></div>
          ) : groups.map(([day, items], gi) => (
            <section key={day} className="min-w-0">
              <SectionTitle className={gi === 0 ? 'mt-0' : 'mt-[22px]'}>{day}</SectionTitle>
              <Card flush>
                {items.map(({ e, i }) => <EventItem key={e.id} e={e} i={i} h={e.mac ? byMac.get(String(e.mac).toLowerCase()) : undefined} fresh={isFresh(e.id)} />)}
              </Card>
            </section>
          ))}
          {groups.length > 0 && more && (
            <div className="mt-5 flex justify-center">
              <Btn kind="ghost" size="sm" icon="clock" onClick={loadMore}>Afficher les événements plus anciens</Btn>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function EventItem({ e, i, h, fresh }: { e: LiveEvent; i: EvInfo; h?: any; fresh?: boolean }) {
  return (
    <Row onClick={h ? () => openDevice(h) : undefined} className={cn('group gap-3 max-sm:gap-2.5', fresh && 'enter')}>
      <span className="num w-11 shrink-0 text-[13px] text-muted-foreground max-sm:w-10">{evTime(e.t)}</span>
      <Avatar icon={i.icon} size="sm" tone={i.tone} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium">{i.title}</div>
        {i.sub && <div className="truncate text-[13px] text-muted-foreground">{i.sub}</div>}
      </div>
      {e.source === 'panel' && <Chip className="max-sm:hidden">panel</Chip>}
      {!e.ack && <span role="img" aria-label="Non lu" className="size-2 shrink-0 rounded-full bg-warn" />}
      {h && <Icon name="chevron" className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,translate] duration-200 group-hover:translate-x-0.5 group-hover:opacity-70 max-sm:hidden" />}
    </Row>
  );
}

function Presence({ data, loading, s, byMac }: { data: any; loading: boolean; s: LiveState; byMac: Map<string, any> }) {
  const to = Date.now(), from = to - DAY;
  const rows = useMemo(() => {
    if (!data) return [];
    const evs: LiveEvent[] = [...(data.events || [])].sort((a, b) => a.t - b.t);
    const per = new Map<string, LiveEvent[]>();
    for (const e of evs) { if (!e.mac) continue; if (!per.has(e.mac)) per.set(e.mac, []); per.get(e.mac)!.push(e); }
    for (const h of s.hosts || []) { const m = String(h.macaddress).toLowerCase(); if (h.active && !per.has(m)) per.set(m, []); }
    const out: { id: string; h: any; name: string; icon: ReactNode; segs: [number, number, boolean?][]; total: number; label: string; title: string }[] = [];
    for (const [mac, list] of per) {
      const h = byMac.get(mac);
      const segs: [number, number, boolean?][] = []; let start: number | null = null;
      if (list.length && list[0].type === 'leave') start = from;
      for (const e of list) {
        if (e.type === 'arrive') { if (start == null) start = e.t; }
        else if (e.type === 'leave') { segs.push([start ?? from, e.t]); start = null; }
      }
      if (h?.active) { if (start != null) segs.push([start, to, true]); else if (!list.length) segs.push([from, to, true]); else segs.push([Math.max(list[list.length - 1].t, to - 60000), to, true]); }
      else if (start != null) segs.push([start, to]);
      const total = segs.reduce((x, [a, b]) => x + (b - a), 0);
      if (!total) continue;
      const name = h ? displayName(h) : list.find((e) => e.name)?.name || mac;
      out.push({ id: mac, h, name, icon: <Icon name={h ? KIND_ICON[deviceKind(h)] : 'devices'} className="size-4 text-muted-foreground" />, segs, total, label: fmtDur(total), title: `${name} : connecté ${fmtDur(total)} sur 24 h` });
    }
    return out.sort((a, b) => (b.h?.active ? 1 : 0) - (a.h?.active ? 1 : 0) || b.total - a.total).slice(0, 14);
  }, [data, s.hosts]);
  if (loading && !data) return <div className="grid gap-3">{[1, 2, 3, 4].map((k) => <Skeleton key={k} h={18} />)}</div>;
  if (!rows.length) return <Empty icon="user" title="Pas encore de données de présence">Les connexions et déconnexions des appareils s’afficheront ici au fil de la journée.</Empty>;
  return (
    <>
      <PresenceTimeline rows={rows} from={from} to={to} right="durée" />
      <Note className="mt-3">D’après le journal de la Bbox et le relevé en direct du serveur du panel. En vert : connecté en ce moment.</Note>
    </>
  );
}
