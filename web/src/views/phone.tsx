// Téléphonie : état de la ligne, appel depuis le navigateur, journal, tests, « ne pas déranger ».
import { useId, useState, type ComponentProps, type ReactNode } from 'react';
import { PageHead, Card, ToggleRow, Btn, Chip, Empty, Skeleton, SkeletonCard, Avatar, Row, Note, IconBtn, Field, Input, FormSheet } from '@/components/kit';
import { openSheet, confirm as confirmDialog } from '@/components/overlays';
import { api } from '@/lib/api';
import { act, useApi } from '@/lib/data';
import { dateTime, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import { PhoneNum } from '@/components/private';
import type { Route } from '@/lib/router';
import { SchedulerCard, type SchedKind } from '@/views/control';

type FormProps = Omit<ComponentProps<typeof FormSheet>, 'close'>;

const fmtNum = (uri: any = '') => { const n = String(uri ?? '').split('@')[0].replace(/^\+33/, '0'); return n.replace(/(.{2})(?=.)/g, '$1 '); };
const cleanNum = (v: any) => String(v || '').replace(/[\s.\-()]/g, '');
const VOIP_KIND: SchedKind = { label: 'Téléphone', path: 'voip/scheduler', enablePath: 'voip/scheduler', root: 'voip', icon: 'phone', desc: 'Le téléphone ne sonne pas pendant les plages définies, sauf pour les numéros autorisés ci-dessous.', verb: 'Ne pas déranger' };
const TEST_L: Record<string, string> = { Idle: 'aucun', Success: 'réussi', Failed: 'échec', Running: 'en cours' };

/** Bouton « + Ajouter » d'en-tête de carte (icône seule sur iPhone) */
function AddBtn({ onClick, children }: { onClick: () => unknown; children: string }) {
  return <Btn kind="plain" size="sm" icon="plus" title={children} onClick={() => { onClick(); }} className="max-sm:w-10 max-sm:px-0"><span className="max-sm:sr-only">{children}</span></Btn>;
}
/** Tuile compacte dont le libellé peut passer à la ligne (étroite sur iPhone) */
function Stat({ l, v, className }: { l: ReactNode; v: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-surface px-3.5 py-3 [container-type:inline-size] geist:rounded-none geist:bg-transparent geist:!px-0 geist:py-0 max-sm:px-3', className)}>
      <div className="text-[12px] leading-snug text-muted-foreground">{l}</div>
      <div className="mt-0.5 truncate text-[clamp(13.5px,15cqi,17px)] font-semibold">{v}</div>
    </div>
  );
}

export default function Phone({ route: _route }: { route: Route }) {
  const { data, reload } = useApi<any[]>(['voip', 'voip/diag', 'voip/scheduler', 'voip/scheduler/number'], { poll: 15000 });
  const [v, diag, sch, nums] = data;
  const lines: any[] = v?.voip || [];
  const allowed: any[] = nums?.voip?.scheduler || [];
  const addNumber = () => openSheet<typeof FormSheet>(FormSheet, {
    fields: [{ key: 'number', label: 'Numéro', required: true, inputmode: 'tel', validate: (x) => (/^\+?\d{4,15}$/.test(cleanNum(x)) ? null : 'Numéro invalide') }],
    onSubmit: async (x) => { await act(() => api.post('voip/scheduler/number', { number: cleanNum(x.number) }), { ok: 'Numéro autorisé' }); reload(); },
  }, { title: 'Autoriser un numéro' });

  return (
    <>
      <PageHead kicker="Ligne fixe" title="Téléphonie" sub={lines.length ? `${plural(lines.length, 'ligne')} · ${plural(lines.filter((l) => l.status === 'Up').length, 'active')}` : '…'} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {lines.map((l) => <LineCard key={l.id} l={l} diag={diag?.phy_interface?.[l.id - 1]} reload={reload} />)}
        {!v && <SkeletonCard lines={6} className="lg:col-span-6" />}
        {lines[0] && <CallCard className="lg:col-span-6" line={lines[0]} />}
        {lines[0] && <CallLog className="lg:col-span-12" line={lines[0].id} />}
        <SchedulerCard kind={VOIP_KIND} className="lg:col-span-7" />
        <Card className="lg:col-span-5" flush title="Numéros autorisés" icon="check" action={<AddBtn onClick={addNumber}>Ajouter</AddBtn>}>
          {sch?.voip?.scheduler && (
            <div className="px-5 max-sm:px-4">
              <ToggleRow title="Laisser passer les appels insistants" sub="3 appels du même numéro en 5 minutes sonnent quand même" value={sch.voip.scheduler.unblock === 1}
                onChange={(nv) => act(() => api.put('voip/scheduler', { unblock: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reload)} />
            </div>
          )}
          <div className={cn(sch?.voip?.scheduler && 'border-t border-border')}>
            {allowed.length ? allowed.map((n, i) => (
              <Row key={n.id ?? i} className="min-h-[52px]">
                <span className="num min-w-0 flex-1 truncate text-[15px] font-medium">{fmtNum(n.number)}</span>
                <IconBtn icon="trash" label="Retirer" onClick={async () => {
                  if (await confirmDialog({ title: 'Retirer ce numéro ?', confirm: 'Retirer', tone: 'danger', icon: 'trash' })) act(() => api.del('voip/scheduler/number/' + n.id), { ok: 'Numéro retiré' }).then(reload, () => {});
                }} />
              </Row>
            )) : nums ? <Empty icon="phone" title="Aucun numéro autorisé" /> : <div className="px-5 py-3 max-sm:px-4"><Skeleton h={60} /></div>}
          </div>
        </Card>
      </div>
    </>
  );
}

function LineCard({ l, diag, reload }: { l: any; diag: any; reload: () => void }) {
  const [test, setTest] = useState<null | 'ring' | 'echo'>(null);
  const run = async (kind: 'ring' | 'echo') => {
    setTest(kind);
    try {
      await act(() => api.post(`voip/${kind}test/${l.id}`, { ring_timeout: 30 }), { ok: kind === 'ring' ? 'Le téléphone va sonner' : 'Décrochez : vous allez entendre votre voix' });
      setTimeout(() => { setTest(null); reload(); }, 20000);
    } catch { setTest(null); }
  };
  const up = l.status === 'Up';
  const state = l.callstate === 'Idle' ? 'Au repos' : l.callstate === 'InCall' || /call/i.test(String(l.callstate ?? '')) ? 'En appel' : l.callstate;
  const domain = l.uri ? String(l.uri).split('@')[1] || '' : '';
  return (
    <Card className="lg:col-span-6" title={'Ligne ' + l.id} icon="phone" action={<Chip tone={up ? 'ok' : 'danger'} dot>{up ? 'En service' : 'Hors service'}</Chip>}>
      <div className="num truncate text-[26px] font-semibold leading-tight tracking-[0.01em] geist:tracking-[-0.01em]"><PhoneNum value={fmtNum(l.uri)} /></div>
      <Note className="mb-3 truncate text-[12.5px]">{domain}</Note>
      <div className="mb-3.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Stat l="État" v={state || '—'} />
        <Stat l="Combiné" v={l.handsetplugged ? 'Branché' : 'Débranché'} />
        <Stat l="Appels manqués" v={<span className="num">{l.notanswered || 0}</span>} className="max-sm:col-span-2" />
      </div>
      <ToggleRow title="Bloquer les appels masqués" sub="Refuse les appelants qui cachent leur numéro" value={l.blockstate === 1}
        onChange={(nv) => act(() => api.put('voip/blockanon/' + l.id, { block: nv ? 1 : 0 }), { ok: nv ? 'Appels masqués bloqués' : 'Appels masqués acceptés' }).then(reload)} />
      <ToggleRow title="Masquer mon numéro" sub="Vos correspondants ne voient pas votre numéro" value={l.anoncallstate === 1}
        onChange={(nv) => act(() => api.put('voip/anoncall', { anoncallenb: nv ? 1 : 0 }), { ok: nv ? 'Numéro masqué' : 'Numéro visible' }).then(reload)} />
      <div className="mt-3.5 flex flex-wrap items-center gap-2">
        <Btn kind="soft" size="sm" icon="bolt" disabled={!!test || !l.handsetplugged} onClick={() => run('ring')}>{test === 'ring' ? 'Sonnerie…' : 'Faire sonner'}</Btn>
        <Btn kind="soft" size="sm" icon="activity" disabled={!!test || !l.handsetplugged} onClick={() => run('echo')}>{test === 'echo' ? 'Test en cours…' : 'Test d’écho'}</Btn>
        {diag && <span className="text-[12.5px] text-muted-foreground">Dernier test : {TEST_L[diag.ring_test?.status] || diag.ring_test?.status || '—'}</span>}
      </div>
    </Card>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'];
function CallCard({ className, line }: { className?: string; line: any }) {
  const id = useId();
  const [num, setNum] = useState('');
  const [calling, setCalling] = useState(false);
  const ok = /^\+?\d{2,15}$/.test(cleanNum(num));
  const call = async () => {
    await act(() => api.put('voip/dial', { line: line.id, number: cleanNum(num) }), { ok: 'Décrochez votre téléphone fixe : l’appel va être composé' });
    setCalling(true); setTimeout(() => setCalling(false), 30000);
  };
  return (
    <Card className={className} title="Appeler depuis le panel" icon="phone">
      <Note className="mb-3 text-[13.5px]">Fonction cachée de la Bbox : votre téléphone fixe sonne, décrochez et l’appel est composé automatiquement.</Note>
      <Field label="Numéro" htmlFor={id}>
        <Input id={id} value={num} onInput={setNum} type="tel" inputMode="tel" autoComplete="tel" placeholder="01 23 45 67 89" className="num tracking-wide" />
      </Field>
      <div className="my-3 grid max-w-[320px] grid-cols-3 gap-2">
        {KEYS.map((k) => (
          <Btn key={k} kind="soft" onClick={() => setNum((n) => n + k)} className="num h-12 text-[18px] max-sm:h-12">{k}</Btn>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Btn kind="go" icon="phone" disabled={!ok || calling || line.status !== 'Up'} onClick={call}>Appeler</Btn>
        {calling && <Btn kind="ghost" onClick={() => act(() => api.del('voip/dial/' + line.id), { ok: 'Appel annulé' }).then(() => setCalling(false))}>Annuler</Btn>}
        <IconBtn icon="back" label="Effacer" onClick={() => setNum((n) => n.slice(0, -1))} />
      </div>
    </Card>
  );
}

function CallLog({ className, line }: { className?: string; line: any }) {
  const { data, reload } = useApi<any>('voip/fullcalllog/' + line, { poll: 30000 });
  const log: any[] = (data?.calllog || []).slice().sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
  const typeOf = (c: any): [string, '' | 'ok' | 'danger', string] => {
    const t = String(c.type || c.direction || '').toLowerCase();
    if (/miss|manq|not/.test(t) || c.answered === 0) return ['Manqué', 'danger', 'down'];
    if (/out|sort|emis/.test(t)) return ['Sortant', '', 'up'];
    return ['Entrant', 'ok', 'down'];
  };
  return (
    <Card className={className} flush title={`Journal d’appels · ${log.length}`} icon="clock">
      <div className="scroll-y max-h-[460px] overflow-y-auto overscroll-contain">
        {log.length ? log.map((c, i) => {
          const [l, tone, ic] = typeOf(c);
          const dur = c.duree || c.duration;
          return (
            <Row key={c.id ?? i}>
              <Avatar icon={ic} size="sm" tone={tone === 'danger' ? 'danger' : undefined} />
              <div className="min-w-0 flex-1">
                <div className={cn('num truncate text-[14.5px] font-medium clair:font-semibold', tone === 'danger' && 'text-danger')}>{fmtNum(c.number) || 'Numéro masqué'}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">{l} · {dateTime(c.date)}{dur ? ' · ' + Math.round(dur / 60) + ' min' : ''}</div>
              </div>
              <IconBtn icon="trash" label="Supprimer" onClick={() => { act(() => api.del('voip/calllog/' + c.id), { ok: 'Appel supprimé' }).then(reload, () => {}); }} />
            </Row>
          );
        }) : data ? <Empty icon="phone" title="Aucun appel">Le journal de la ligne est vide.</Empty> : <div className="px-5 pb-3 max-sm:px-4"><Skeleton h={160} /></div>}
      </div>
    </Card>
  );
}
