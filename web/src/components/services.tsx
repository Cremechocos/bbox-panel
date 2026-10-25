// Latence par service : tuiles en direct, choix du service affiché, graphique, réglages.
import * as React from 'react';
import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Select as SelectPrimitive } from 'radix-ui';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LiveChart, Sparkline, CountUp } from '@/components/charts';
import { Btn, IconBtn, Input, Note, Row, SectionTitle, Seg, Switch } from '@/components/kit';
import { SheetBody, SheetFooter, openSheet } from '@/components/overlays';
import { ServiceIcon } from '@/components/service-icon';
import { useLive, type LiveState, type Pt } from '@/lib/live';
import { useApi } from '@/lib/data';
import { useAppearance } from '@/lib/theme';
import { isIPv4 } from '@/lib/format';
import {
  GROUPS, QUALITY, confOf, everyLabel, fmtMs, isFromBbox, median, minuteMedian, probesOf, qualityOf, saveProbes, seriesOf, setHomeChart, setLatTarget, statsOf, targetInfo,
  useLatTarget, type Probe, type ProbeConf,
} from '@/lib/services';
import { cn } from '@/lib/utils';

const msFmt = (v: number) => fmtMs(v);

/** Valeur en ms avec unité, « — » si pas encore mesuré, « perdu » si pas de réponse */
function Ms({ v, className, unitClass }: { v: number | null | undefined; className?: string; unitClass?: string }) {
  if (v === undefined) return <span className={cn('num text-faint', className)}>—</span>;
  if (v === null) return <span className={cn('text-danger', className)}>perdu</span>;
  return <span className={cn('num', className)}><CountUp value={v} format={msFmt} /><span className={cn('ml-0.5 text-[0.55em] font-normal text-muted-foreground', unitClass)}>ms</span></span>;
}

// ═════════════ Tuiles (accueil) ═════════════
function ProbeTile({ p, pts, every, selected, onSelect }: { p: Probe; pts: Pt[]; every: number; selected: boolean; onSelect: () => void }) {
  const st = statsOf(pts, every);
  const q = qualityOf(st.stale ? undefined : st.last, st.stale);
  const geist = useAppearance().skin === 'geist';
  const tip = `${p.name} · ${p.host}${p.ip && p.ip !== p.host ? ' (' + p.ip + ')' : ''} · ${QUALITY[q].label}${st.med != null ? ` · médiane 1 min ${fmtMs(st.med)} ms` : ''}${st.loss ? ` · ${st.loss} % de perte` : ''}`;
  return (
    <button type="button" onClick={onSelect} aria-pressed={selected} title={tip}
      className={cn('group relative flex min-w-0 flex-col rounded-2xl bg-surface p-3.5 text-left outline-none transition-[background-color,box-shadow] duration-200 focus-visible:ring-2 focus-visible:ring-ring/50',
        'hover:bg-[color-mix(in_oklab,var(--surface)_88%,var(--brand)_12%)]', selected && 'shadow-[inset_0_0_0_2px_var(--brand)]',
        'geist:rounded-lg geist:bg-transparent geist:p-2.5 geist:hover:bg-hover', selected && 'geist:bg-selected geist:shadow-none')}>
      <span className="flex min-w-0 items-center gap-2.5 geist:gap-2">
        {geist ? <ServiceIcon id={p.id} name={p.name} size={15} /> : <ServiceIcon id={p.id} name={p.name} size={17} tile />}
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold geist:text-[13px] geist:font-normal geist:text-muted-foreground">{p.name}</span>
        <i className="size-1.5 shrink-0 rounded-full transition-colors" style={{ background: QUALITY[q].color }} aria-hidden />
      </span>
      <span className="mt-2.5 flex items-baseline gap-2 geist:mt-1.5">
        <Ms v={st.stale ? undefined : st.last} className="text-[24px] font-semibold leading-none tracking-[-0.03em] geist:text-[21px] geist:font-medium" />
        {st.med != null && !st.stale && <span className="num ml-auto truncate text-[11.5px] text-faint" title="Médiane sur la dernière minute">méd. {fmtMs(st.med)}</span>}
      </span>
      <span className="mt-2.5 block h-6 geist:mt-2">
        <Sparkline data={pts.slice(-36)} color={selected ? 'var(--lat)' : 'color-mix(in oklab, var(--lat) 75%, transparent)'} height={24} width={140} strokeWidth={1.4} />
      </span>
      <span className="sr-only">{QUALITY[q].label}</span>
    </button>
  );
}

/** Colonnes équilibrées : 12 tuiles → 6 + 6 plutôt que 7 + 5 */
function useBalancedCols(n: number, minW: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [cols, setCols] = useState(0);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !n) return;
    const fit = () => {
      const max = Math.max(1, Math.floor((el.clientWidth + gap) / (minW + gap)));
      setCols(Math.min(max, Math.ceil(n / Math.ceil(n / max))));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [n, minW, gap]);
  return [ref, cols] as const;
}

/** Grille des services mesurés ; un clic choisit le service affiché dans le graphique de latence */
export function ServicesGrid({ s, className }: { s: LiveState; className?: string }) {
  const list = probesOf(s);
  const target = useLatTarget();
  const every = s.probes?.every || 5000;
  const geist = useAppearance().skin === 'geist';
  const [ref, cols] = useBalancedCols(list.length, 148, geist ? 4 : 10);
  if (!list.length) return (
    <div className={cn('rounded-2xl bg-surface p-5 text-[13.5px] text-muted-foreground geist:bg-transparent geist:p-0', className)}>
      Aucun service mesuré. <button type="button" className="font-medium text-foreground underline-offset-2 hover:underline" onClick={openProbesSheet}>Choisir des services</button>
    </div>
  );
  return (
    <div ref={ref} className={cn('grid grid-cols-[repeat(auto-fill,minmax(148px,1fr))] gap-2.5 geist:-mx-2.5 geist:gap-1', className)}
      style={cols ? { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` } : undefined}>
      {list.map((p) => (
        <ProbeTile key={p.id} p={p} pts={seriesOf(s, p.id)} every={p.id === 'cloudflare' || p.id === 'google-dns' ? 2000 : every}
          selected={target === p.id} onSelect={() => { const next = target === p.id ? 'internet' : p.id; setLatTarget(next); setHomeChart('lat'); scrollToChart(); }} />
      ))}
    </div>
  );
}
function scrollToChart() {
  const el = document.querySelector('[data-lat-chart]');
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < 64 || r.bottom > innerHeight) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
}
/** Résumé d'une ligne : médiane de tous les services, part du trajet local, le plus rapide, le plus lent */
export function servicesSummary(s: LiveState): string {
  const vals = probesOf(s).map((p) => ({ p, v: statsOf(seriesOf(s, p.id)).med })).filter((x): x is { p: Probe; v: number } => x.v != null).sort((a, b) => a.v - b.v);
  if (vals.length < 2) return '';
  const med = median(vals.map((x) => x.v))!;
  const lan = minuteMedian(s.series.lan);
  const hop = lan != null && lan >= 1 ? (isFromBbox(s) ? `depuis la Bbox (${fmtMs(lan)} ms de trajet local retirés)` : `dont ≈ ${fmtMs(lan)} ms jusqu’à la Bbox`) : '';
  return [`médiane ${fmtMs(med)} ms`, hop, `le plus rapide : ${vals[0].p.name}`, `le plus lent : ${vals[vals.length - 1].p.name}`].filter(Boolean).join(' · ');
}

// ═════════════ Choix du service affiché ═════════════
export function TargetPicker({ s, className }: { s: LiveState; className?: string }) {
  const target = useLatTarget();
  const info = targetInfo(s, target);
  const list = probesOf(s);
  const value = info.id;
  const item = 'relative flex min-h-9 cursor-pointer select-none items-center gap-2.5 rounded-lg py-1.5 pl-2.5 pr-8 text-[14px] outline-none data-[highlighted]:bg-accent max-sm:min-h-11 geist:min-h-8 geist:rounded-md geist:text-[13px] geist:data-[highlighted]:bg-selected';
  return (
    <SelectPrimitive.Root value={value} onValueChange={setLatTarget}>
      <SelectPrimitive.Trigger aria-label="Service affiché"
        className={cn('inline-flex h-8 min-w-0 max-w-[260px] items-center gap-2 rounded-lg px-2.5 text-[13.5px] font-semibold outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent geist:h-7 geist:rounded-md geist:px-2 geist:text-[13px] geist:font-medium geist:hover:bg-hover geist:data-[state=open]:bg-selected', className)}>
        {value === 'internet' ? <Globe className="size-[15px] shrink-0 text-[var(--lat)]" strokeWidth={2} /> : <ServiceIcon id={value} name={info.name} size={15} />}
        <span className="truncate"><SelectPrimitive.Value>{info.name}</SelectPrimitive.Value></span>
        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={8} align="start"
          className="z-[80] max-h-[min(420px,var(--radix-select-content-available-height))] min-w-[250px] overflow-hidden rounded-xl border border-[var(--card-border)] bg-popover text-popover-foreground shadow-pop geist:glass geist:rounded-lg geist:border-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95">
          <SelectPrimitive.Viewport className="scroll-y p-1">
            <SelectPrimitive.Item value="internet" className={item}>
              <Globe className="size-4 shrink-0 text-[var(--lat)]" strokeWidth={2} />
              <span className="min-w-0 flex-1"><SelectPrimitive.ItemText>Internet</SelectPrimitive.ItemText><span className="block text-[11.5px] text-muted-foreground">meilleure de 1.1.1.1 et 8.8.8.8</span></span>
              <span className="num text-[12px] text-muted-foreground">{s.latency?.internet != null ? fmtMs(s.latency.internet) + ' ms' : ''}</span>
              <SelectPrimitive.ItemIndicator className="absolute right-2.5"><Check className="size-4 text-brand geist:text-foreground" /></SelectPrimitive.ItemIndicator>
            </SelectPrimitive.Item>
            {list.length > 0 && <div className="mx-2.5 my-1 h-px bg-border" />}
            {list.map((p) => {
              const st = statsOf(seriesOf(s, p.id));
              return (
                <SelectPrimitive.Item key={p.id} value={p.id} className={item}>
                  <ServiceIcon id={p.id} name={p.name} size={16} />
                  <span className="min-w-0 flex-1 truncate"><SelectPrimitive.ItemText>{p.name}</SelectPrimitive.ItemText></span>
                  <span className="num text-[12px] text-muted-foreground">{st.last != null && !st.stale ? fmtMs(st.last) + ' ms' : ''}</span>
                  <SelectPrimitive.ItemIndicator className="absolute right-2.5"><Check className="size-4 text-brand geist:text-foreground" /></SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              );
            })}
            <div className="mx-2.5 my-1 h-px bg-border" />
            <button type="button" onClick={openProbesSheet} className={cn(item, 'w-full text-muted-foreground hover:bg-accent hover:text-foreground geist:hover:bg-hover')}>
              Choisir les services mesurés…
            </button>
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** Ligne d'explication sous le graphique : cible, adresse, cadence */
export function TargetCaption({ s, className }: { s: LiveState; className?: string }) {
  const info = targetInfo(s, useLatTarget());
  return <span className={cn('min-w-0 truncate text-muted-foreground', className)} title={info.host}>{info.host} · {everyLabel(info.every)}{isFromBbox(s) ? ' · depuis la Bbox' : ''}</span>;
}

// ═════════════ Graphique ═════════════
export function LatencyChart({ s, height, windowMs = 300000, color = 'var(--lat)', strokeWidth, target: forced }: { s: LiveState; height: number; windowMs?: number; color?: string; strokeWidth?: number; target?: string }) {
  const chosen = useLatTarget();
  const info = targetInfo(s, forced ?? chosen);
  const data = seriesOf(s, info.id);
  const series = useMemo(() => [{ data, color, label: info.name }], [data, color, info.name]);
  const slow = info.every > 5000;
  return (
    <LiveChart key={info.id} height={height} format={(v: number) => Math.round(v) + ' ms'} series={series} windowMs={windowMs}
      lag={slow ? 1500 : info.every + 300} threshold={100} loss hold={slow} strokeWidth={strokeWidth} />
  );
}

// ═════════════ Réglages ═════════════
const HOST_RE = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const cleanHost = (v: string) => v.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/[/?#].*$/, '');

export function ProbesSheet({ close }: { close: (v?: unknown) => void }) {
  const s = useLive();
  const conf = confOf(s);
  const catalog: Probe[] = s.probeCatalog || [];
  const [pending, setPending] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ name: '', host: '', port: '443' });
  const [err, setErr] = useState('');
  useEffect(() => { setPending({}); }, [conf.on.join(',')]);
  const isOn = (id: string) => pending[id] ?? conf.on.includes(id);
  const save = (next: Partial<ProbeConf>) => saveProbes(s, next).catch(() => setPending({}));
  const toggle = (id: string, v: boolean) => {
    setPending((p) => ({ ...p, [id]: v }));
    save({ on: catalog.map((c) => c.id).filter((x) => (x === id ? v : isOn(x))) });
  };
  const add = () => {
    const host = cleanHost(form.host), port = Number(form.port) || 443, name = form.name.trim() || host;
    if (!host || !(isIPv4(host) || HOST_RE.test(host))) return setErr('Adresse invalide : un nom de domaine (exemple.fr) ou une adresse IPv4.');
    if (port < 1 || port > 65535) return setErr('Port invalide (1 à 65535).');
    if (conf.custom.length >= 8) return setErr('8 services personnels au plus.');
    setErr('');
    save({ custom: [...conf.custom, { id: '', name: name.slice(0, 32), host, port }] }).then(() => setForm({ name: '', host: '', port: '443' }));
  };
  const last = (id: string) => { const st = statsOf(seriesOf(s, id)); return st.stale ? null : st.last; };
  const n = conf.on.length + conf.custom.length;
  // contrôle : le ping que la Bbox mesure elle-même (autotest horaire vers un serveur Bouygues, en µs)
  const { data: diags } = useApi<any>('wan/diags');
  const selfPing = median(((diags?.diags?.ping || []) as any[]).filter((x) => Number(x.success) > 0 && /ipv4/i.test(x.protocol || 'IPv4')).map((x) => Number(x.average) / 1000));
  const lan = minuteMedian(s.series.lan);
  const cf = statsOf(seriesOf(s, 'cloudflare')).med ?? minuteMedian(s.series.latency);
  return (
    <>
      <SheetBody>
        <Note className="text-[13.5px] leading-relaxed">
          Le serveur du panel ouvre une connexion vers chaque service, à travers la Bbox, et chronomètre la réponse : un aller-retour, comme un ping.
          Les adresses sont trouvées par le DNS, comme le ferait l’application : on mesure le serveur le plus proche de chez vous.
        </Note>
        <SectionTitle>Point de mesure</SectionTitle>
        <div className="-mx-5 sm:-mx-6">
          <Row onClick={() => save({ fromBbox: !conf.fromBbox })} className="min-h-[60px] px-5 sm:px-6">
            <div className="min-w-0 flex-1">
              <div className="font-medium">Latence depuis la Bbox</div>
              <div className="text-[12.5px] leading-snug text-muted-foreground">
                Retire de chaque mesure le trajet entre le serveur du panel et la Bbox{lan != null ? ` (${fmtMs(lan)} ms en ce moment)` : ''}, mesuré au même instant. Désactivé : latence vue depuis le serveur du panel.
              </div>
            </div>
            <span onClick={(e) => e.stopPropagation()}><Switch checked={conf.fromBbox} onChange={(v) => save({ fromBbox: v })} label="Latence depuis la Bbox" /></span>
          </Row>
        </div>
        {selfPing != null && (
          <Note className="mt-1.5">Contrôle : la Bbox mesure elle-même <b className="num font-medium text-foreground">{fmtMs(selfPing)} ms</b> (ping horaire vers un serveur Bouygues){cf != null ? <>, le panel <b className="num font-medium text-foreground">{fmtMs(cf)} ms</b> vers Cloudflare</> : ''}.</Note>
        )}
        <SectionTitle>Fréquence</SectionTitle>
        <Seg block value={conf.every} onChange={(v) => save({ every: Number(v) })} label="Fréquence de mesure"
          options={[{ v: 2000, l: '2 s' }, { v: 5000, l: '5 s' }, { v: 15000, l: '15 s' }, { v: 60000, l: '1 min' }]} />
        <Note className="mt-1.5">Seulement quand un écran du panel est ouvert. Cloudflare et Google DNS suivent toujours la mesure principale (2 s).</Note>
        {GROUPS.filter((g) => g.id !== 'custom').map((g) => (
          <Fragment key={g.id}>
            <SectionTitle>{g.label}</SectionTitle>
            <div className="-mx-5 sm:-mx-6">
              {catalog.filter((c) => c.group === g.id).map((c) => {
                const on = isOn(c.id), v = on ? last(c.id) : null;
                const ip = probesOf(s).find((p) => p.id === c.id)?.ip;
                return (
                  <Row key={c.id} onClick={() => toggle(c.id, !on)} className="min-h-[56px] px-5 sm:px-6">
                    <ServiceIcon id={c.id} name={c.name} size={17} tile />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{c.name}</div>
                      <div className="truncate text-[12.5px] text-muted-foreground">{c.desc ? c.desc + ' · ' : ''}{c.host}{c.port !== 443 ? ':' + c.port : ''}{ip && ip !== c.host ? ' · ' + ip : ''}</div>
                    </div>
                    {on && v != null && <span className="num shrink-0 text-[13px] text-muted-foreground">{fmtMs(v)} ms</span>}
                    <span onClick={(e) => e.stopPropagation()}><Switch checked={on} onChange={(nv) => toggle(c.id, nv)} label={c.name} /></span>
                  </Row>
                );
              })}
            </div>
          </Fragment>
        ))}
        <SectionTitle>Vos services</SectionTitle>
        {conf.custom.length > 0 && (
          <div className="-mx-5 sm:-mx-6">
            {conf.custom.map((c) => {
              const v = last(c.id), ip = probesOf(s).find((p) => p.id === c.id)?.ip;
              return (
                <Row key={c.id} className="min-h-[56px] px-5 sm:px-6">
                  <ServiceIcon id={c.id} name={c.name} size={17} tile />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{c.name}</div>
                    <div className="truncate text-[12.5px] text-muted-foreground">{c.host}{c.port !== 443 ? ':' + c.port : ''}{ip && ip !== c.host ? ' · ' + ip : ''}</div>
                  </div>
                  {v != null && <span className="num shrink-0 text-[13px] text-muted-foreground">{fmtMs(v)} ms</span>}
                  <IconBtn icon="trash" label={'Retirer ' + c.name} onClick={() => { save({ custom: conf.custom.filter((x) => x.id !== c.id) }); }} />
                </Row>
              );
            })}
          </div>
        )}
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)_84px] gap-2">
          <div className="col-span-2"><Input value={form.name} onInput={(v: string) => setForm((f) => ({ ...f, name: v }))} placeholder="Nom (ex. Mon serveur)" aria-label="Nom du service" maxLength={32} /></div>
          <Input value={form.host} onInput={(v: string) => setForm((f) => ({ ...f, host: v }))} placeholder="exemple.fr ou 203.0.113.10" aria-label="Adresse" bad={!!err}
            onKeyDown={(e: React.KeyboardEvent) => { if (e.key === 'Enter') add(); }} />
          <Input value={form.port} onInput={(v: string) => setForm((f) => ({ ...f, port: v.replace(/\D/g, '').slice(0, 5) }))} placeholder="443" aria-label="Port" inputMode="numeric" />
          <div className="col-span-2"><Btn kind="soft" icon="plus" onClick={add} disabled={!form.host.trim()}>Ajouter le service</Btn></div>
        </div>
        {err ? <div className="mt-1.5 text-[12.5px] text-danger">{err}</div> : <Note className="mt-1.5">Port 443 pour un site web ; une adresse du réseau local fonctionne aussi (NAS, serveur).</Note>}
      </SheetBody>
      <SheetFooter>
        <span className="flex-1 text-[13px] text-muted-foreground">{n} service{n > 1 ? 's' : ''} · {everyLabel(conf.every)}</span>
        <Btn kind="go" onClick={() => close(true)}>Terminé</Btn>
      </SheetFooter>
    </>
  );
}
export function openProbesSheet() {
  openSheet(ProbesSheet, {}, { title: 'Services mesurés', description: 'Latence en direct, partagée par tous vos écrans' });
}
