// Pauses & contrôle : plages horaires Internet, Wi-Fi et veille de la Bbox.
import { useState, type ComponentProps, type ReactNode } from 'react';
import { PageHead, Card, Tabs, Toggle, ToggleRow, Btn, Empty, Banner, Skeleton, Avatar, Row, Note, FormSheet } from '@/components/kit';
import { openSheet, type ConfirmOpts } from '@/components/overlays';
import { KIND_ICON } from '@/components/icon';
import { api } from '@/lib/api';
import { act, useApi } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { daysLabel, displayName, deviceKind, parseDate, DAYS } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Route } from '@/lib/router';

/** Type de programmation : chemins de l'API Bbox et libellés (réutilisé par la téléphonie) */
export type SchedKind = { label: string; path: string; enablePath: string; root: string; icon: string; desc: string; verb: string };

export const KINDS: Record<'internet' | 'wifi' | 'hibernate', SchedKind> = {
  internet: { label: 'Internet', path: 'parentalcontrol/scheduler', enablePath: 'parentalcontrol', root: 'parentalcontrol', icon: 'globe',
    desc: 'Coupe l’accès à Internet des appareils choisis pendant les plages définies (devoirs, repas, nuit…).', verb: 'Internet coupé' },
  wifi: { label: 'Wi-Fi', path: 'wireless/scheduler', enablePath: 'wireless/scheduler', root: 'wireless', icon: 'wifi',
    desc: 'Éteint complètement le Wi-Fi de la Bbox pendant les plages définies. Les appareils en Ethernet restent connectés.', verb: 'Wi-Fi éteint' },
  hibernate: { label: 'Veille Bbox', path: 'hibernate/scheduler', enablePath: 'hibernate/scheduler', root: 'hibernate', icon: 'moon',
    desc: 'Met la Bbox en veille (Internet, Wi-Fi et téléphone coupés) pour économiser l’énergie, par exemple la nuit ou pendant les vacances.', verb: 'Bbox en veille' },
};
const TABS = Object.entries(KINDS).map(([v, k]) => ({ v, l: k.label }));
type FormProps = Omit<ComponentProps<typeof FormSheet>, 'close'>;

const hm = (s: any) => String(s || '').slice(0, 5);
/** Heures de début et de fin d'une plage (« HH:MM,HH:MM » ou nombres décimaux selon le firmware) */
export function ruleTimes(r: any): [string, string] {
  if (r.intervals) { const [a, b] = String(r.intervals).split(','); return [hm(a), hm(b)]; }
  const f = (v: any) => (typeof v === 'number' ? `${String(Math.floor(v)).padStart(2, '0')}:${String(Math.round((v % 1) * 60)).padStart(2, '0')}` : hm(v));
  return [f(r.start), f(r.end)];
}

/** Isole un contrôle placé dans une rangée cliquable (le clic ou la touche ne l'ouvrent pas) */
function Stop({ children }: { children: ReactNode }) {
  return <span className="flex shrink-0 items-center gap-2" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>{children}</span>;
}

export default function Control({ route }: { route: Route }) {
  const [tab, setTab] = useState<string>(() => (route?.arg && Object.hasOwn(KINDS, route.arg) ? route.arg : 'internet'));
  return (
    <>
      <PageHead kicker="Plages horaires" title="Pauses & contrôle" sub="Programmez des pauses Internet, l’extinction du Wi-Fi ou la veille de la Bbox." />
      <Tabs tabs={TABS} value={tab} onChange={setTab} label="Type de pause" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:items-start">
        <SchedulerCard key={tab} kind={tab} className={tab === 'internet' ? 'lg:col-span-7' : 'lg:col-span-12'} />
        {tab === 'internet' && <InternetDevices className="lg:col-span-5" />}
      </div>
    </>
  );
}

const HIBERNATE_CONFIRM = (nv: boolean): ConfirmOpts | null => (nv
  ? { title: 'Activer la veille programmée ?', message: 'Pendant les plages, Internet, le Wi-Fi et le téléphone seront coupés, y compris l’accès à ce panel.', confirm: 'Activer', tone: 'warn', icon: 'moon' }
  : null);

/** Carte de programmation : interrupteur global, plages (ajout, modification, suppression) et frise de la semaine */
export function SchedulerCard({ kind, className }: { kind: string | SchedKind; className?: string }) {
  const K: SchedKind = typeof kind === 'string' ? KINDS[kind as keyof typeof KINDS] : kind;
  const { data, reload } = useApi<any>(K.path, { poll: 30000 });
  const sch = data?.[K.root]?.scheduler;
  const rules: any[] = (sch?.savedRules?.length ? sch.savedRules : sch?.rules) || [];
  const until = parseDate(sch?.statusuntil);
  const on = sch?.enable === 1;

  const edit = (rule: any) => openSheet<typeof FormSheet>(FormSheet, {
    fields: [
      { key: 'name', label: 'Nom de la plage', required: true, placeholder: 'Ex. Nuit, Devoirs…', validate: (v: string) => (v.length > 32 ? '32 caractères maximum' : /[<>;&"]/.test(v) ? 'Caractères interdits' : rules.some((r) => r.name === v && r.id !== rule?.id) ? 'Ce nom existe déjà' : null) },
      { key: 'days', label: 'Jours', type: 'days', required: true },
      { key: 'start', label: 'Début', type: 'time', required: true },
      { key: 'end', label: 'Fin', type: 'time', required: true, validate: (v: string, all: any) => (v === all.start ? 'La fin doit différer du début' : null), help: (all: any) => (all.end && all.start && all.end < all.start ? 'La plage se termine le lendemain.' : '') },
    ],
    initial: rule ? { name: rule.name, days: String(rule.occurency ?? rule.days ?? ''), start: ruleTimes(rule)[0], end: ruleTimes(rule)[1] } : { days: '1,2,3,4,5', start: '22:00', end: '07:00' },
    submitLabel: rule ? 'Enregistrer' : 'Ajouter',
    onDelete: rule ? () => act(() => api.del(`${K.path}/rule/${rule.id}`), { ok: 'Plage supprimée' }).then(reload) : undefined,
    onSubmit: async (v: any) => {
      const body = { name: v.name.trim(), occurency: v.days, intervals: `${v.start},${v.end}` };
      await act(() => (rule ? api.put(`${K.path}/rule/${rule.id}`, body) : api.post(`${K.path}/rule`, { ...body, enable: 1 })), { ok: rule ? 'Plage modifiée' : 'Plage ajoutée' });
      reload();
    },
  }, { title: rule ? 'Modifier la plage' : 'Nouvelle plage · ' + K.label });

  return (
    <Card className={className} title={'Pauses ' + K.label} icon={K.icon}
      action={sch && (
        <Toggle value={on} label={'Pauses ' + K.label} confirm={kind === 'hibernate' ? HIBERNATE_CONFIRM : undefined}
          onChange={(nv) => act(() => api.put(K.enablePath, { enable: nv ? 1 : 0 }), { ok: nv ? 'Programmation activée' : 'Programmation désactivée' }).then(() => { reload(); refresh('statics'); })} />
      )}>
      <Note className="mb-3 max-w-[62ch] text-[13.5px]">{K.desc}</Note>
      {until && sch.statusremaining > 0 && (
        <Banner tone="warn" icon="clock" className="mb-3"><b>{K.verb}</b> jusqu’à {until.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</Banner>
      )}
      {!data ? <Skeleton h={120} /> : (
        <>
          <div className="-mx-5 max-sm:-mx-4">
            {rules.length ? rules.map((r, i) => {
              const [a, b] = ruleTimes(r);
              return (
                <Row key={r.id ?? i} onClick={() => edit(r)}>
                  <Avatar icon="clock" size="sm" tone="brand" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14.5px] font-medium clair:font-semibold">{r.name || 'Plage'}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{daysLabel(r.occurency ?? r.days)} · <span className="num">{a} → {b}</span></div>
                  </div>
                  <Stop>
                    <Toggle value={r.enable !== 0} label={r.name}
                      onChange={(nv) => act(() => api.put(`${K.path}/rule/${r.id}`, { enable: nv ? 1 : 0 }), { ok: nv ? 'Plage activée' : 'Plage désactivée' }).then(reload)} />
                  </Stop>
                </Row>
              );
            }) : <Empty icon="clock" title="Aucune plage programmée">Ajoutez une plage pour automatiser les pauses.</Empty>}
          </div>
          <Week rules={rules} />
          <Btn kind="ghost" size="sm" icon="plus" className="mt-3" onClick={() => { edit(null); }}>Ajouter une plage</Btn>
          {!on && rules.length > 0 && <Note className="mt-2.5">La programmation est désactivée : les plages ne s’appliquent pas.</Note>}
        </>
      )}
    </Card>
  );
}

// Frise hebdomadaire des plages (lecture rapide)
function Week({ rules }: { rules: any[] }) {
  const enabled = rules.filter((r) => r.enable !== 0);
  if (!enabled.length) return null;
  const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const rows = DAYS.map((d) => {
    const segs: [number, number][] = [];
    for (const r of enabled) {
      const days = String(r.occurency ?? r.days ?? '').split(',');
      const [a, b] = ruleTimes(r).map(toMin);
      if (days.includes(d.v)) { if (b > a) segs.push([a, b]); else segs.push([a, 1440]); }
      const prevDay = DAYS[(DAYS.findIndex((x) => x.v === d.v) + 6) % 7].v;
      if (days.includes(prevDay) && b < a) segs.push([0, b]);
    }
    return { d, segs };
  });
  return (
    <div className="mt-4 grid gap-[5px]" role="img" aria-label="Aperçu de la semaine">
      {rows.map(({ d, segs }) => (
        <div key={d.v} className="grid grid-cols-[22px_minmax(0,1fr)] items-center gap-2">
          <span className="text-[12px] font-semibold text-muted-foreground geist:font-medium" title={d.l}>{d.s}</span>
          <div className="relative h-2.5 overflow-hidden rounded-full bg-secondary geist:h-2 geist:rounded-[3px]">
            {segs.map(([a, b], i) => (
              <i key={i} className="absolute inset-y-0 rounded-full bg-brand geist:rounded-[3px] geist:bg-chart-1" style={{ left: `${(a / 1440) * 100}%`, width: `${((b - a) / 1440) * 100}%` }} />
            ))}
          </div>
        </div>
      ))}
      <div className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
        <span />
        <div className="num flex justify-between text-[11px] text-muted-foreground"><span>0 h</span><span>6 h</span><span>12 h</span><span>18 h</span><span>24 h</span></div>
      </div>
    </div>
  );
}

function InternetDevices({ className }: { className?: string }) {
  const s = useLive();
  const { data, reload } = useApi<any>('parentalcontrol');
  const policy = data?.parentalcontrol?.scheduler?.defaultpolicy;
  const hosts = (s.hosts || [])
    .filter((h) => h.devicetype !== 'STB' && !/repeater/i.test(h.devicetype || ''))
    .sort((a, b) => (b.parentalcontrol?.enable || 0) - (a.parentalcontrol?.enable || 0) || b.active - a.active);
  return (
    <Card className={className} flush title="Appareils concernés" icon="devices">
      <div className="px-5 max-sm:px-4">
        <ToggleRow title="Inclure les nouveaux appareils" sub="Tout nouvel appareil est soumis aux pauses Internet" value={policy === 'Forbidden'}
          onChange={(nv) => act(() => api.put('parentalcontrol', { defaultpolicy: nv ? 'Forbidden' : 'Accept' }), { ok: 'Préférence enregistrée' }).then(reload)} />
      </div>
      <div className="scroll-y max-h-[520px] overflow-y-auto overscroll-contain border-t border-border">
        {hosts.map((h) => {
          const paused = h.parentalcontrol?.status === 'Forbidden';
          return (
            <Row key={h.macaddress}>
              <Avatar icon={KIND_ICON[deviceKind(h)]} size="sm" on={!!h.active} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-medium clair:font-semibold">{displayName(h)}</div>
                <div className={cn('truncate text-[12.5px]', paused ? 'text-warn' : 'text-muted-foreground')}>{paused ? 'en pause actuellement' : h.ipaddress}</div>
              </div>
              {paused && (
                <Btn kind="soft" size="sm" onClick={() => act(() => api.post('parentalcontrol/unblock', { macaddress: h.macaddress, hour: 1, minute: 0 }), { ok: 'Débloqué pour 1 heure' }).then(() => refresh('hosts'))}>
                  <span className="num">+1 h</span>
                </Btn>
              )}
              <Toggle value={h.parentalcontrol?.enable === 1} label={displayName(h)}
                onChange={(nv) => act(() => api.put('parentalcontrol/hosts', { enable: nv ? 1 : 0, macaddress: h.macaddress }), { ok: nv ? 'Ajouté aux pauses' : 'Retiré des pauses' }).then(() => refresh('hosts'))} />
            </Row>
          );
        })}
      </div>
    </Card>
  );
}
