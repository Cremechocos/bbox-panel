// Wi-Fi : réseaux (principal, Wi-Fi 7, invité), QR codes, bandes radio et réglages avancés.
import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Secret, QR, Empty, Seg, Field, Select, Switch, FormSheet, Banner, Note, Skeleton, IconBtn, type FieldDef, type Opt } from '@/components/kit';
import { openSheet, confirm as confirmDialog, SheetBody, SheetFooter } from '@/components/overlays';
import { Icon } from '@/components/icon';
import { Sparkline, SignalBars } from '@/components/charts';
import { GuestSheet } from '@/components/sheets';
import { api } from '@/lib/api';
import { act, useApi, load, invalidate, errMsg } from '@/lib/data';
import { useLive, refresh, type LiveState } from '@/lib/live';
import { wifiQrString, kbps, isMac, signal, plural } from '@/lib/format';
import { guestTimer, untilLabel } from '@/lib/prefs';
import { go, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';

type Band = { k: '24' | '5' | '6'; l: string; bw: number[] };
const BANDS: Band[] = [{ k: '24', l: '2,4 GHz', bw: [20, 40] }, { k: '5', l: '5 GHz', bw: [20, 40, 80, 160] }, { k: '6', l: '6 GHz', bw: [20, 40, 80, 160, 320] }];
const PROTO: Record<string, string> = { 'WPA2-WPA3': 'WPA2/WPA3', WPA3: 'WPA3', WPA2: 'WPA2', 'WPA-WPA2': 'WPA/WPA2', None: 'Ouvert' };
const passErr = (v: string) => (!v ? null : v.length < 8 ? '8 caractères minimum' : v.length > 63 ? '63 caractères maximum' : /[^\x20-\x7e]/.test(v) ? 'Caractères ASCII uniquement' : null);
const ssidErr = (v: string) => (!v?.trim() ? 'Nom requis' : v.length > 32 ? '32 caractères maximum' : null);
const after = () => { setTimeout(() => { invalidate('wireless'); refresh('statics'); refresh('summary'); }, 600); };
// Petit libellé au-dessus d'une valeur (mono en capitales dans Noir Geist, comme les en-têtes du kit)
const LABEL = 'text-[12.5px] text-muted-foreground geist:text-[12px]';

export default function Wifi({ route }: { route: Route }) {
  const s = useLive();
  const { data: wl, error, reload } = useApi('wireless', { poll: 30000 });
  const w = wl?.wireless;
  if (error && !w) return (
    <>
      <PageHead title="Wi-Fi" />
      <div className="card-surface enter"><Empty icon="alert" title="Wi-Fi indisponible" action={<Btn kind="soft" size="sm" icon="refresh" onClick={reload}>Réessayer</Btn>}>{errMsg(error)}</Empty></div>
    </>
  );
  if (!w) return (
    <>
      <PageHead kicker="Sans fil" title="Wi-Fi" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 max-sm:gap-3" aria-busy>
        <div className="card-surface enter p-5 lg:col-span-7"><Skeleton h={220} /></div>
        <div className="card-surface enter p-5 lg:col-span-5"><Skeleton h={220} /></div>
      </div>
    </>
  );
  const main = w.ssid['24'], mlo = w.ssid.mlo, guest = w.ssid.guest;
  const radioOn = w.radio['24']?.enable === 1;
  const unified = w.unified === 1;
  const active = (s.hosts || []).filter((h) => h.active);
  const count = (re: RegExp) => active.filter((h) => re.test(h.link || '')).length;
  const eco = w.radio['5']?.ecoMode?.enable === 1 || w.radio['6']?.ecoMode?.enable === 1;
  const bands = BANDS.filter((b) => w.radio[b.k]);
  const gt = guestTimer();

  return (
    <>
      <PageHead kicker="Sans fil" title="Wi-Fi" sub={unified ? 'Un seul nom de réseau pour les bandes 2,4, 5 et 6 GHz' : 'Bandes séparées'}
        actions={<StatusPill on={radioOn} />} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 max-sm:gap-3">
        <NetworkCard className="lg:col-span-6 xl:col-span-7" title="Réseau principal" icon="wifi" ssid={main.id} pass={main.security?.passphrase} proto={main.security?.protocol}
          chips={[unified ? '2,4 · 5 · 6 GHz' : '2,4 GHz', `${active.filter((h) => !/Ethernet/.test(h.link || '')).length} appareils sans fil`]}
          hidden={main.hidden === 1} card="main" onEdit={() => editMain(w)} />

        <Card className="lg:col-span-6 xl:col-span-5" title="Interrupteurs" icon="sliders">
          <div>
            <ToggleRow title="Wi-Fi" sub="Toutes les bandes du réseau principal" value={radioOn}
              confirm={(nv: boolean) => (nv ? null : { title: 'Couper tout le Wi-Fi ?', message: 'Tous les appareils sans fil seront déconnectés, y compris celui-ci s’il est en Wi-Fi. Pour le rallumer, il faudra un appareil en Ethernet ou le bouton Wi-Fi de la Bbox.', confirm: 'Couper le Wi-Fi', tone: 'danger' })}
              onChange={(nv) => act(() => api.put('wireless', { 'radio.enable': nv ? 1 : 0 }), { ok: nv ? 'Wi-Fi activé' : 'Wi-Fi coupé' }).then(after)} />
            <ToggleRow title="Unifier les bandes" sub="Un seul nom et mot de passe pour toutes les bandes" value={unified}
              confirm={(nv: boolean) => ({ title: nv ? 'Unifier les réseaux Wi-Fi ?' : 'Séparer les bandes ?', message: nv ? 'Les bandes 2,4, 5 et 6 GHz prendront le nom et le mot de passe du réseau 2,4 GHz. Les appareils se reconnecteront.' : 'Chaque bande aura son propre nom de réseau. Les appareils se reconnecteront.', confirm: nv ? 'Unifier' : 'Séparer', tone: 'warn' })}
              onChange={(nv) => act(() => api.put('wireless/5', { unified: nv ? 1 : 0 }), { ok: nv ? 'Réseaux unifiés' : 'Bandes séparées' }).then(after)} />
            <ToggleRow title="Mode éco Wi-Fi" sub="Réduit la puissance 5 et 6 GHz quand le réseau est calme" value={eco}
              onChange={(nv) => act(async () => { await api.put('wireless/5', { ecoMode: nv ? 1 : 0 }); if (w.radio['6']) await api.put('wireless/6', { ecoMode: nv ? 1 : 0 }); }, { ok: nv ? 'Mode éco activé' : 'Mode éco désactivé' }).then(after)} />
            <ToggleRow title="WPS" sub="Appairage par bouton" value={main.wps?.enable === 1}
              onChange={(nv) => act(() => api.put('wireless', { 'wps.enable': nv ? 1 : 0 }), { ok: nv ? 'WPS activé' : 'WPS désactivé' }).then(after)} />
          </div>
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Btn kind="soft" size="sm" icon="link" disabled={main.wps?.enable !== 1} onClick={() => { openSheet(WpsSheet, {}, { title: 'Appairage WPS' }); }}>Appairer en WPS</Btn>
            <Btn kind="soft" size="sm" icon="clock" onClick={() => { openSheet(DeactivationSheet, {}, { title: 'Coupure temporaire' }); }}>Couper 5 / 6 GHz 5 min</Btn>
          </div>
        </Card>

        {mlo && (
          <NetworkCard className="lg:col-span-6" title="Wi-Fi 7" icon="bolt" ssid={mlo.id} pass={mlo.security?.passphrase} proto={mlo.security?.protocol}
            chips={['MLO · multi-bandes', plural(count(/MLO/), 'appareil')]} hidden={mlo.hidden === 1}
            note="Réseau multi-liens réservé aux appareils Wi-Fi 7 : ils utilisent plusieurs bandes à la fois." card="mlo"
            onEdit={() => editSimple('wireless/mlo', 'Wi-Fi 7', mlo, true)} />
        )}

        {guest && (
          <NetworkCard className={mlo ? 'lg:col-span-6' : 'lg:col-span-12'} title="Wi-Fi invité" icon="link" ssid={guest.id} pass={guest.security?.passphrase} proto={guest.security?.protocol}
            chips={guest.enable ? [plural((s.guestHosts || []).filter((h) => h.active).length, 'invité'), gt ? `coupure ${untilLabel(gt.until)}` : 'sans limite de durée'] : ['désactivé']}
            toggle={<Btn kind={guest.enable ? 'soft' : 'go'} size="sm" icon={guest.enable ? 'timer' : 'link'}
              onClick={() => { openSheet(GuestSheet, { enabled: guest.enable === 1 }, { title: 'Wi-Fi invité', description: guest.id }).then((ok) => ok && after()); }}>{guest.enable ? 'Gérer' : 'Activer'}</Btn>}
            note="Isolé de votre réseau : vos invités accèdent à Internet sans voir vos appareils. L’activer ou le couper redémarre le Wi-Fi (≈ 40 s)."
            dim={guest.enable !== 1} card="guest"
            onEdit={() => editSimple('wireless/guest', 'Wi-Fi invité', guest, false)} />
        )}

        <Card className="lg:col-span-12" title="Bandes radio" icon="activity" action={<span className="text-[12.5px] text-muted-foreground max-sm:hidden">débit en direct, hors Wi-Fi 7 (MLO)</span>}>
          <Note className="-mt-2 mb-3 sm:hidden">débit en direct, hors Wi-Fi 7 (MLO)</Note>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,260px),1fr))] gap-3">
            {bands.map((b) => (
              <BandTile key={b.k} b={b} w={w} s={s}
                n={b.k === '24' ? count(/Wifi 2|2\.4|Wifi 24/) : count(new RegExp('Wifi ' + b.k + '(?!\\d)'))} />
            ))}
          </div>
        </Card>

        <AclCard className="lg:col-span-6" />
        <NeighborCard className="lg:col-span-6" bands={bands} />
      </div>
    </>
  );
}

/** Pastille d'état du Wi-Fi (en-tête de page) */
function StatusPill({ on }: { on: boolean }) {
  return (
    <span className={cn('inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-semibold',
      'geist:h-7 geist:rounded-full geist:px-2.5 geist:text-[12.5px] geist:font-medium',
      on ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger')}>
      <span className={cn('live-dot', !on && 'bad')} />{on ? 'Wi-Fi actif' : 'Wi-Fi coupé'}
    </span>
  );
}

function NetworkCard({ className, title, icon, ssid, pass, proto, chips = [], onEdit, toggle, note, dim, hidden, card }: {
  className?: string; title: string; icon: string; ssid: string; pass?: string; proto?: string; chips?: string[]; onEdit: () => unknown;
  toggle?: React.ReactNode; note?: string; dim?: boolean; hidden?: boolean; card?: 'main' | 'mlo' | 'guest';
}) {
  const qr = wifiQrString({ ssid, passphrase: pass, security: proto });
  return (
    <Card className={className} title={title} icon={icon} action={toggle || <Btn kind="plain" size="sm" icon="edit" onClick={() => { onEdit(); }}>Modifier</Btn>}>
      <div className="flex min-w-0 flex-wrap items-start gap-x-6 gap-y-5">
        <div className="min-w-0 flex-1 basis-[220px]">
          <div className={LABEL}>Nom du réseau{hidden ? ' · masqué' : ''}</div>
          <div className="mb-3 mt-1 text-[22px] font-semibold leading-tight tracking-[-0.015em] [overflow-wrap:anywhere] geist:font-medium geist:tracking-[-0.035em]">{ssid}</div>
          <div className={LABEL}>Mot de passe · {(proto && PROTO[proto]) || proto}</div>
          <Secret value={pass} />
          {chips.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5">{chips.map((c, i) => <Chip key={i}>{c}</Chip>)}</div>}
          {note && <Note className="mt-3 max-w-[52ch]">{note}</Note>}
          {toggle && <Btn kind="ghost" size="sm" icon="edit" className="mt-3.5" onClick={() => { onEdit(); }}>Modifier</Btn>}
        </div>
        <div className="flex shrink-0 flex-col items-center gap-2 max-sm:w-full">
          <div className={cn('transition-[opacity,filter] duration-300', dim && 'opacity-20 blur-[1px] grayscale')}>
            <QR text={qr} label={'QR code du réseau ' + ssid} className="ring-1 ring-border geist:rounded-lg" />
          </div>
          <span className="text-[12.5px] text-muted-foreground">{dim ? 'Réseau désactivé' : 'Scannez pour vous connecter'}</span>
          {card && <Btn kind="plain" size="xs" icon="print" onClick={() => go('carte', card)}>Carte à imprimer</Btn>}
        </div>
      </div>
    </Card>
  );
}

function BandTile({ b, w, s, n }: { b: Band; w: any; s: LiveState; n: number }) {
  const r = w.radio[b.k], ssid = w.ssid[b.k];
  const on = !!(r.enable && r.state);
  const bw = s.bands?.[b.k];
  const proto = ssid?.security?.protocol;
  return (
    <div className="flex min-w-0 flex-col rounded-xl bg-surface p-4 geist:rounded-none geist:bg-transparent geist:p-0">
      <div className="flex items-center gap-2">
        <b className="text-[15px] font-semibold geist:font-medium">{b.l}</b>
        <span className="flex-1" />
        <Chip tone={on ? 'ok' : 'off'} dot>{on ? 'Active' : 'Arrêtée'}</Chip>
      </div>
      <div className="mb-1.5 mt-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="num truncate text-[24px] font-semibold leading-tight tracking-[-0.02em] geist:font-medium">{kbps((bw?.down || 0) + (bw?.up || 0))}</div>
          <div className="text-[12.5px] text-muted-foreground">{plural(n, 'appareil')}</div>
        </div>
        <div className="h-10 w-[120px] shrink-0" aria-hidden>
          <Sparkline data={(s.series['b' + b.k] || []).map((p) => p.v)} color="var(--chart-1)" width={120} height={40} />
        </div>
      </div>
      <KV rows={[
        ['Canal', <span className="num">{r.current_channel}{r.channel === 0 ? ' (auto)' : ''}</span>],
        ['Largeur', <span className="num">{r.current_bandwidth} MHz{r.htbw === 0 ? ' (auto)' : ''}</span>],
        ['Norme', w.standard?.[b.k]?.[0]?.value || r.standard],
        ['Sécurité', (proto && PROTO[proto]) || proto],
      ]} />
      <Btn kind="ghost" size="sm" block className="mt-3" onClick={() => { openSheet(BandSheet, { band: b, w }, { title: 'Wi-Fi ' + b.l }); }}>Réglages avancés</Btn>
    </div>
  );
}

function editMain(w: any) {
  const unified = w.unified === 1, hasMlo = !!w.ssid.mlo;
  if (!unified) {
    const present = BANDS.filter((x) => w.ssid[x.k]);
    const fields: FieldDef[] = [];
    for (const b of present) {
      fields.push({ key: 'ssid' + b.k, label: `Nom ${b.l}`, required: true, validate: ssidErr });
      fields.push({ key: 'pass' + b.k, label: `Mot de passe ${b.l}`, type: 'password', placeholder: 'Inchangé si vide', validate: passErr });
    }
    const initial = Object.fromEntries(present.map((b) => ['ssid' + b.k, w.ssid[b.k].id]));
    return openSheet(FormSheet, {
      fields, initial, intro: 'Les appareils connectés devront saisir le nouveau mot de passe.',
      onSubmit: async (v: any) => {
        await act(async () => {
          for (const b of present) {
            const body: Record<string, string> = { ssid: v['ssid' + b.k].trim() };
            if (v['pass' + b.k]) body.passphrase = v['pass' + b.k];
            await api.put('wireless/' + b.k, body);
          }
        }, { ok: 'Wi-Fi mis à jour' });
        after();
      },
    }, { title: 'Réseau principal' });
  }
  const fields = ([
    { key: 'ssid', label: 'Nom du réseau', required: true, validate: ssidErr },
    { key: 'passphrase', label: 'Nouveau mot de passe', type: 'password', placeholder: 'Inchangé si vide', validate: passErr, help: '8 à 63 caractères. Une phrase longue est plus sûre qu’un mot compliqué.' },
    hasMlo && { key: 'mlo', label: 'Appliquer aussi au Wi-Fi 7', type: 'toggle', default: 1, help: 'Le réseau Wi-Fi 7 s’appellera « <nom>-Plus », comme le fait la Bbox.' },
  ] as (FieldDef | false)[]).filter(Boolean) as FieldDef[];
  return openSheet(FormSheet, {
    intro: 'Tous les appareils sans fil seront déconnectés et devront se reconnecter avec les nouveaux identifiants.',
    fields,
    initial: { ssid: w.ssid['24'].id },
    onSubmit: async (v: any) => {
      if (!(await confirmDialog({ title: 'Changer les identifiants Wi-Fi ?', message: 'Les appareils connectés en Wi-Fi seront coupés, y compris celui-ci s’il est en Wi-Fi.', confirm: 'Appliquer', tone: 'warn' }))) throw new Error('cancel');
      const body: Record<string, string> = { ssid: v.ssid.trim() };
      if (v.passphrase) body.passphrase = v.passphrase;
      await act(async () => { await api.put('wireless/24', body); if (hasMlo && v.mlo) await api.put('wireless/mlo', { ...body, ssid: body.ssid.slice(0, 27) + '-Plus' }); }, { ok: 'Wi-Fi mis à jour' });
      after();
    },
  }, { title: 'Réseau principal' });
}

function editSimple(path: string, title: string, ssid: any, canHide: boolean) {
  const fields = ([
    { key: 'ssid', label: 'Nom du réseau', required: true, validate: ssidErr },
    { key: 'passphrase', label: 'Nouveau mot de passe', type: 'password', placeholder: 'Inchangé si vide', validate: passErr },
    canHide && { key: 'hidden', label: 'Masquer le nom du réseau', type: 'toggle', help: 'Le réseau n’apparaît plus dans les listes ; il faut saisir son nom pour s’y connecter.' },
  ] as (FieldDef | false)[]).filter(Boolean) as FieldDef[];
  return openSheet(FormSheet, {
    fields,
    initial: { ssid: ssid.id, hidden: ssid.hidden },
    onSubmit: async (v: any) => {
      const body: Record<string, string | number> = { ssid: v.ssid.trim() };
      if (v.passphrase) body.passphrase = v.passphrase;
      if (canHide) body.hidden = Number(v.hidden) ? 1 : 0;
      await act(() => api.put(path, body), { ok: title + ' mis à jour' });
      after();
    },
  }, { title });
}

// ───── Réglages avancés d'une bande ─────
function BandSheet({ band, w, close }: { band: Band; w: any; close: (v?: unknown) => void }) {
  const [caps, setCaps] = useState<any[] | null>(band.k === '24' ? null : w.capabilities?.[band.k] ?? []);
  const r = w.radio[band.k], ssid = w.ssid[band.k];
  const [auto, setAuto] = useState(r.htbw === 0 && r.channel === 0 ? 'auto' : 'manual');
  const [bw, setBw] = useState(String(r.htbw || r.current_bandwidth || band.bw[band.bw.length - 1]));
  const [ch, setCh] = useState(String(r.channel || 0));
  const [sec, setSec] = useState<string>(ssid.security.protocol);
  const [hidden, setHidden] = useState(ssid.hidden === 1);
  useEffect(() => { if (band.k === '24') load('wireless/24').then((d) => setCaps(d.wireless.capabilities['24'])).catch(() => setCaps([])); }, []);
  const cac = (c: any) => c[`cactime${bw === '20' ? '' : bw}`];
  const chOpts: Opt[] = [{ v: '0', l: 'Automatique' }, ...(caps || []).filter((c) => band.k === '24' || (c.ht && c.ht[bw])).map((c) => ({ v: String(c.channel), l: band.k === '5' ? `${c.ht[bw]}${cac(c) > 0 ? ' · DFS ' + cac(c) + ' min' : ''}` : String(c.channel) }))];
  useEffect(() => { if (!chOpts.some((o) => o.v === ch)) setCh('0'); }, [bw, caps]);
  const secOpts: Opt[] = band.k === '6' ? [{ v: 'WPA3', l: 'WPA3 (obligatoire en 6 GHz)' }] : [{ v: 'WPA2-WPA3', l: 'WPA2/WPA3 · recommandé' }, { v: 'WPA3', l: 'WPA3 · le plus sûr' }, { v: 'WPA2', l: 'WPA2 · compatibilité' }];
  const save = async () => {
    try {
      const body = { security: sec, encryption: 'AES', hidden: hidden ? 1 : 0, channel: auto === 'auto' ? 0 : Number(ch), htbw: auto === 'auto' ? 0 : Number(bw) };
      await act(() => api.put('wireless/' + band.k, body), { ok: `Wi-Fi ${band.l} mis à jour` });
      after(); close(true);
    } catch { /* toast */ }
  };
  return (
    <>
      <SheetBody className="grid content-start gap-5">
        <Banner tone="info" icon="info" className="items-start [&>svg]:mt-0.5">
          <span>Actuellement : canal <b className="num">{r.current_channel}</b>, <b className="num">{r.current_bandwidth} MHz</b>. Les appareils sur cette bande seront brièvement déconnectés à l’enregistrement.</span>
        </Banner>
        <Field label="Canal et largeur"><Seg block options={[{ v: 'auto', l: 'Automatique' }, { v: 'manual', l: 'Manuel' }]} value={auto} onChange={setAuto} label="Mode" /></Field>
        <AnimatePresence initial={false}>
          {auto === 'manual' && (
            <motion.div key="manual" className="grid gap-5" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
              <Field label="Largeur de canal"><Seg block options={band.bw.map((x) => ({ v: String(x), l: x + ' MHz' }))} value={bw} onChange={setBw} label="Largeur" /></Field>
              <Field label="Canal" help={band.k === '5' ? 'Les canaux DFS imposent une écoute radar avant émission.' : ''}>
                {caps ? <Select value={ch} onChange={setCh} options={chOpts} label="Canal" /> : <Skeleton h={44} className="rounded-[11px]" />}
              </Field>
            </motion.div>
          )}
        </AnimatePresence>
        <Field label="Sécurité"><Select value={sec} onChange={setSec} options={secOpts} label="Sécurité" /></Field>
        <div className="flex min-h-12 items-center gap-4">
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-medium clair:font-semibold">Masquer le nom du réseau</div>
            <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground">Le réseau n’apparaît plus dans la liste des Wi-Fi disponibles</div>
          </div>
          <Switch checked={hidden} onChange={setHidden} label="Masquer" />
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="flex-1" />
        <Btn kind="ghost" onClick={() => close(false)}>Annuler</Btn>
        <Btn kind="go" onClick={save}>Enregistrer</Btn>
      </SheetFooter>
    </>
  );
}

// ───── WPS ─────
function WpsSheet({ close }: { close: (v?: unknown) => void }) {
  const [st, setSt] = useState<any>({ state: 'Starting' });
  // une seule demande d'appairage par feuille, même si l'effet est rejoué (mode strict de React)
  const started = useRef<Promise<unknown> | null>(null);
  useEffect(() => {
    let alive = true;
    let t: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const d = await api.get('wireless/wps');
        if (!alive) return;
        setSt(d.wps);
        if (/progress|running|start/i.test(d.wps.state) || d.wps.timeout > 0) t = setTimeout(poll, 1500);
      } catch { /* on réessaiera au prochain appairage */ }
    };
    started.current ||= act(() => api.post('wireless/wps'), { silent: true });
    started.current.then(() => { if (alive) t = setTimeout(poll, 800); }).catch(() => { if (alive) close(); });
    return () => { alive = false; clearTimeout(t); };
  }, []);
  const ok = /success/i.test(st.state), fail = /fail|error|timeout|overlap/i.test(st.state);
  const phase = ok ? 'ok' : fail ? 'fail' : 'run';
  return (
    <>
      <SheetBody className="pt-5 text-center">
        <div className={cn('mx-auto mb-4 grid size-[84px] place-items-center rounded-full transition-colors duration-300 geist:bg-selected',
          ok ? 'bg-ok-soft text-ok' : fail ? 'bg-danger-soft text-danger' : 'bg-brand-soft text-brand')}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={phase} className="grid place-items-center" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.8 }} transition={{ type: 'spring', stiffness: 520, damping: 30 }}>
              {ok ? <Icon name="check" className="size-9" /> : fail ? <Icon name="alert" className="size-9" />
                : <span className="relative flex size-4"><span className="absolute inline-flex size-full animate-ping rounded-full bg-brand opacity-60" /><span className="relative inline-flex size-4 rounded-full bg-brand" /></span>}
            </motion.span>
          </AnimatePresence>
        </div>
        <h3 className="text-[19px] font-semibold tracking-tight">{ok ? 'Appareil connecté' : fail ? 'Appairage échoué' : 'Appairage en cours…'}</h3>
        <p className="mx-auto mt-2 max-w-[36ch] text-[14px] leading-relaxed text-muted-foreground">
          {ok ? 'L’appareil a rejoint votre Wi-Fi.' : fail ? 'Relancez l’appairage et appuyez sur le bouton WPS de l’appareil dans les 2 minutes.' : 'Appuyez maintenant sur le bouton WPS de l’appareil à connecter (2 minutes maximum).'}
        </p>
        {st.timeout > 0 && !ok && <p className="num mt-3 text-[13px] text-muted-foreground">{st.timeout} s restantes</p>}
      </SheetBody>
      <SheetFooter>
        <span className="flex-1" />
        {!ok && !fail && <Btn kind="ghost" onClick={async () => { await api.del('wireless/wps').catch(() => {}); close(); }}>Arrêter</Btn>}
        <Btn kind="go" onClick={() => close()}>Fermer</Btn>
      </SheetFooter>
    </>
  );
}

// ───── Coupure temporaire 5/6 GHz ─────
function DeactivationSheet({ close }: { close: (v?: unknown) => void }) {
  const { data, reload } = useApi('wireless/deactivation', { poll: 2000 });
  const d = data?.wireless?.deactivation;
  const running = d && !/idle/i.test(d.status);
  return (
    <>
      <SheetBody className="grid content-start gap-4">
        <p className="text-[14.5px] leading-relaxed text-foreground/80">Coupe les bandes 5 et 6 GHz pendant {Math.round((d?.duration || 300) / 60)} minutes pour forcer les appareils récalcitrants à se connecter en 2,4 GHz (utile pour installer un objet connecté). Elles se rallument seules.</p>
        {running
          ? <Banner tone="warn" icon="clock"><span>Coupure en cours · <b className="num">{Math.floor(d.timeout / 60)}:{String(d.timeout % 60).padStart(2, '0')}</b> restantes</span></Banner>
          : <Banner tone="info" icon="info"><span>Les appareils en 5 / 6 GHz seront déconnectés le temps de la coupure.</span></Banner>}
      </SheetBody>
      <SheetFooter>
        <span className="flex-1" />
        {running
          ? <Btn kind="go" onClick={() => act(() => api.put('wireless/deactivation', { duration: 0 }), { ok: 'Bandes 5 / 6 GHz rallumées' }).then(reload)}>Rallumer maintenant</Btn>
          : <><Btn kind="ghost" onClick={() => close()}>Annuler</Btn><Btn kind="go" onClick={() => act(() => api.put('wireless/deactivation'), { ok: 'Coupure lancée' }).then(reload)}>Lancer la coupure</Btn></>}
      </SheetFooter>
    </>
  );
}

// ───── Filtrage MAC ─────
function AclCard({ className }: { className?: string }) {
  const { data, reload } = useApi<any[]>(['wireless/acl', 'hosts/me']);
  const acl = data[0]?.acl, me = data[1]?.hosts || data[1]?.host || data[1];
  const myMac = String(me?.macaddress || me?.list?.[0]?.macaddress || '').toLowerCase();
  const rules: any[] = acl?.rules || [];
  const meAllowed = rules.some((r) => (r.macaddress || '').toLowerCase() === myMac);
  const addFields: FieldDef[] = [{ key: 'macaddress', label: 'Appareil', type: 'device', mode: 'mac', required: true, validate: (v) => (isMac(v) ? null : 'Adresse MAC invalide') }];
  const add = () => openSheet(FormSheet, {
    intro: 'Seuls les appareils de cette liste pourront se connecter au Wi-Fi quand le filtrage est actif.',
    fields: addFields,
    onSubmit: async (v: any) => { await act(() => api.post('wireless/acl/rules', { macaddress: v.macaddress.toLowerCase(), enable: 1 }), { ok: 'Appareil autorisé' }); reload(); },
  }, { title: 'Autoriser un appareil' });
  const remove = async (r: any) => {
    if (!(await confirmDialog({ title: 'Retirer cette adresse ?', confirm: 'Retirer', tone: 'danger' }))) return;
    try { await act(() => api.del('wireless/acl/rules/' + r.id), { ok: 'Adresse retirée' }); reload(); } catch { /* toast */ }
  };
  return (
    <Card className={className} title="Filtrage MAC" icon="lock" action={acl && (
      <Toggle value={acl.enable === 1} label="Filtrage MAC"
        confirm={(nv: boolean) => (nv ? (!rules.length
          ? { title: 'Liste vide', message: 'Ajoutez d’abord les appareils autorisés : avec une liste vide, plus aucun appareil ne pourrait se connecter en Wi-Fi.', confirm: 'Compris', tone: 'danger' }
          : myMac && !meAllowed
            ? { title: 'Cet appareil n’est pas autorisé', message: 'Activer le filtrage couperait l’appareil que vous utilisez. Ajoutez-le d’abord à la liste.', confirm: 'Compris', tone: 'danger' }
            : { title: 'Activer le filtrage MAC ?', message: rules.length > 1 ? `Seuls les ${rules.length} appareils de la liste pourront se connecter au Wi-Fi.` : 'Seul l’appareil de la liste pourra se connecter au Wi-Fi.', confirm: 'Activer', tone: 'warn' }) : null)}
        onChange={async (nv) => { if (nv && (!rules.length || (myMac && !meAllowed))) throw new Error('blocked'); await act(() => api.put('wireless/acl', { enable: nv ? 1 : 0 }), { ok: nv ? 'Filtrage activé' : 'Filtrage désactivé' }); reload(); }} />
    )}>
      <p className="mb-2 text-[13.5px] leading-relaxed text-muted-foreground">N’autorise au Wi-Fi que les appareils choisis. Protection d’appoint : une adresse MAC peut être usurpée.</p>
      <div className="grid grid-cols-[minmax(0,1fr)]">
        {rules.length ? rules.map((r) => (
          <div key={r.id ?? r.macaddress} className="flex min-h-12 min-w-0 items-center gap-2 border-t border-border py-1.5 first:border-t-0">
            <span className="min-w-0 flex-1 truncate font-mono text-[13.5px]">{r.macaddress}</span>
            {(r.macaddress || '').toLowerCase() === myMac && <Chip tone="brand">cet appareil</Chip>}
            <IconBtn icon="trash" label="Retirer" size="sm" className="hover:bg-danger-soft hover:text-danger" onClick={() => { remove(r); }} />
          </div>
        )) : <Empty icon="lock" title="Aucun appareil dans la liste" className="py-7" />}
      </div>
      <Btn kind="ghost" size="sm" icon="plus" className="mt-2" onClick={() => { add(); }}>Ajouter un appareil</Btn>
    </Card>
  );
}

// ───── Voisinage Wi-Fi ─────
function NeighborCard({ className, bands }: { className?: string; bands: Band[] }) {
  const [band, setBand] = useState<string>(bands[1]?.k || bands[0]?.k || '24');
  const [scanning, setScanning] = useState(false);
  const { data, reload } = useApi('wireless/' + band + '/neighborhood');
  const list: any[] = (data?.scan || []).slice().sort((a: any, b: any) => (Number(b.rssi) || -999) - (Number(a.rssi) || -999));
  const scan = async () => {
    setScanning(true);
    try { await act(() => api.put(`wireless/${band}/neighborhood`), { silent: true }); await new Promise((r) => setTimeout(r, 6000)); reload(); }
    catch { /* toast */ } finally { setScanning(false); }
  };
  return (
    <Card className={className} title="Réseaux voisins" icon="globe" action={<Btn kind="soft" size="sm" icon="refresh" onClick={scan} disabled={scanning}>{scanning ? 'Analyse…' : 'Analyser'}</Btn>}>
      <Seg options={bands.map((b) => ({ v: b.k, l: b.l }))} value={band} onChange={setBand} label="Bande" />
      <div className="scroll-y mt-2 grid max-h-[320px] grid-cols-[minmax(0,1fr)] overflow-y-auto overscroll-contain">
        {list.length ? list.map((n, i) => {
          const rssi = n.rssi ?? n.signal;
          return (
            <div key={i} className="flex min-h-12 min-w-0 items-center gap-3 border-t border-border py-2 first:border-t-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14.5px] font-medium clair:font-semibold">{n.ssid || n.SSID || '(réseau masqué)'}</div>
                <div className="truncate text-[12.5px] text-muted-foreground">canal {n.channel ?? '—'}{n.bandwidth ? ' · ' + n.bandwidth + ' MHz' : ''}{n.security ? ' · ' + n.security : ''}</div>
              </div>
              {Number(rssi) < 0 && <SignalBars bars={signal(rssi).bars} className="text-muted-foreground" />}
              <span className="num shrink-0 text-[13px] text-muted-foreground">{rssi ?? '—'} dBm</span>
            </div>
          );
        }) : (
          <Empty icon="globe" title={scanning ? 'Analyse en cours…' : 'Aucune analyse récente'}>
            {scanning ? 'La Bbox écoute les réseaux alentour.' : 'Lancez une analyse pour voir les réseaux voisins et choisir un canal moins encombré.'}
          </Empty>
        )}
      </div>
    </Card>
  );
}
