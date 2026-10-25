// Ma Bbox : matériel, santé en direct, historiques, écran, sauvegardes, notifications, système.
import { useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { PageHead, Card, KV, Toggle, ToggleRow, Btn, Chip, Empty, Secret, Range, Skeleton, Row, Note, IconBtn, SectionTitle, FormSheet, QR } from '@/components/kit';
import { openSheet, confirm as confirmDialog, type ConfirmOpts } from '@/components/overlays';
import { LiveChart, HistoryChart, Gauge } from '@/components/charts';
import { api, panel } from '@/lib/api';
import { act, useApi, useMobile } from '@/lib/data';
import { useLive, refresh } from '@/lib/live';
import { duration, dateTime, relative, num, bytes, plural } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { Route } from '@/lib/router';

type FormProps = Omit<ComponentProps<typeof FormSheet>, 'close'>;

const MODEL: Record<string, string> = { 'f@st5696b': 'Bbox Wi-Fi 7', fast5696b: 'Bbox Wi-Fi 7', 'f@st5688b': 'Bbox Wi-Fi 6E', 'f@st5686b': 'Bbox Ultym' };
const LUM = [{ v: '0', l: 'Éteint' }, { v: '1', l: '25 %' }, { v: '2', l: '50 %' }, { v: '3', l: '75 %' }, { v: '4', l: '100 %' }];
const LUM_TICKS = LUM.map((x) => ({ v: Number(x.v), l: x.l }));
const COLORS: Record<string, string> = { red: 'rouge', green: 'vert', blue: 'bleu', white: 'blanc' };
const REBOOT_CONFIRM: ConfirmOpts = { title: 'Redémarrer la Bbox ?', message: 'Internet, le Wi-Fi, la TV et le téléphone seront coupés pendant 2 à 3 minutes. Le panel se reconnectera tout seul.', confirm: 'Redémarrer', tone: 'danger', icon: 'power' };
const rowT = 'truncate text-[14.5px] font-medium clair:font-semibold';
const rowS = 'truncate text-[12.5px] text-muted-foreground';

/** Valeur technique (versions, adresses) en chasse fixe */
function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[0.92em] tracking-normal">{children}</span>;
}
/** Liste clé → valeur dont les valeurs longues passent à la ligne au lieu de déborder */
function Facts({ rows }: { rows: ComponentProps<typeof KV>['rows'] }) {
  return <div className="min-w-0 [&_dd]:shrink"><KV rows={rows} /></div>;
}
/** Bouton « + Ajouter » d'en-tête de carte (icône seule sur iPhone) */
function AddBtn({ onClick, children }: { onClick: () => unknown; children: string }) {
  return <Btn kind="plain" size="sm" icon="plus" title={children} onClick={() => { onClick(); }} className="max-sm:w-10 max-sm:px-0"><span className="max-sm:sr-only">{children}</span></Btn>;
}
/** Jauge et sa légende */
function GaugeCell({ caption, ...g }: { caption: string } & ComponentProps<typeof Gauge>) {
  return (
    <div className="grid min-w-0 justify-items-center gap-1.5">
      <Gauge {...g} />
      <span className="max-w-full truncate text-[12.5px] text-muted-foreground">{caption}</span>
    </div>
  );
}

export default function BboxView({ route: _route }: { route: Route }) {
  const s = useLive();
  const isM = useMobile();
  const { data, reload } = useApi<any[]>(['device/summary', 'device/led', 'usersave', 'configs', 'notification', 'device/usb'], { poll: 30000 });
  const [summ, led, us, cfg, notif, usb] = data;
  const dev = s.device?.device;
  const svc = s.services?.services;
  const memPct = s.mem.total ? (s.mem.used / s.mem.total) * 100 : 0;
  const cpuSeries = useMemo(() => [{ data: s.series.cpu, color: 'var(--chart-1)', label: 'CPU' }], []);
  const tempSeries = useMemo(() => [{ data: s.series.temp, color: 'var(--chart-4)', label: 'Temp.' }], []);
  const reloadAll = () => { reload(); refresh('statics'); };
  const model = dev ? MODEL[String(dev.modelname).toLowerCase()] || 'Bbox' : 'Bbox';
  const power: any[] = s.graphs?.power || [];
  const avgW = power.length ? power.reduce((a, x) => a + Number(x[1] || 0), 0) / power.length / 1000 : 0;
  const configs: any[] = cfg?.configs || [];
  const usbCount = (usb?.usb?.parent || []).length;
  const ports: any[] = led?.ethernetPort || [];
  const gs = isM ? 84 : 96;

  const reboot = () => act(() => api.post('device/reboot'), { ok: 'Redémarrage en cours…' });
  const saveConfig = () => openSheet<typeof FormSheet>(FormSheet, {
    intro: 'Enregistre l’ensemble des réglages actuels dans la Bbox, pour pouvoir y revenir plus tard.',
    fields: [{ key: 'name', label: 'Nom de la sauvegarde', required: true, placeholder: 'Ex. Avant vacances', validate: (v) => (v.length > 32 ? '32 caractères maximum' : /[<>;&"]/.test(v) ? 'Caractères interdits' : null) }],
    initial: { name: 'Sauvegarde du ' + new Date().toLocaleDateString('fr-FR') },
    submitLabel: 'Sauvegarder',
    onSubmit: async (v) => { await act(() => api.post('configs', { name: v.name.trim() }), { ok: 'Configuration sauvegardée' }); reload(); },
  }, { title: 'Nouvelle sauvegarde' });

  return (
    <>
      <PageHead kicker={model} title="Ma Bbox"
        sub={dev ? <>{dev.modelname} · allumée depuis <span className="num">{duration(dev.uptime)}</span> · <span className="num">{dev.numberofboots}</span> démarrages</> : '…'}
        actions={<Btn kind="danger-ghost" size="sm" icon="power" confirm={REBOOT_CONFIRM} onClick={reboot}>Redémarrer</Btn>} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4" title="Matériel" icon="box">
          {dev ? (
            <>
              <Facts rows={[
                ['Modèle', `${model} (${dev.modelname})`],
                ['Firmware', <Mono>{dev.main?.version}</Mono>],
                ['Publié le', dateTime(dev.main?.date, { hour: undefined, minute: undefined })],
                ['Secours', <Mono>{dev.reco?.version}</Mono>],
                ['Mise en service', dateTime(dev.firstusedate, { hour: undefined, minute: undefined })],
                ['Accès', [dev.using?.ftth && 'Fibre', dev.using?.ipv6 && 'IPv6', dev.isCellularEnable && 'Secours 4G'].filter(Boolean).join(' · ')],
              ]} />
              <Note className="mt-3 text-[12.5px]">Numéro de série</Note>
              <Secret value={summ?.device?.serialnumber || dev.serialnumber} />
            </>
          ) : <Skeleton h={220} />}
        </Card>

        <Card className="lg:col-span-8" title="Santé en direct" icon="cpu">
          <div className="mb-4 grid grid-cols-3 justify-items-center gap-3 sm:flex sm:justify-around sm:gap-4">
            <GaugeCell caption="Processeur" value={s.cpu.usage} label={Math.round(s.cpu.usage) + ' %'} size={gs} color="var(--chart-1)" />
            <GaugeCell caption="Température" value={s.cpu.temp} max={90} label={num(s.cpu.temp, 1) + '°'} size={gs} color={s.cpu.temp > 72 ? 'var(--warn)' : 'var(--chart-4)'} />
            <GaugeCell caption="Mémoire" value={memPct} label={Math.round(memPct) + ' %'} sub={bytes(s.mem.total * 1024)} size={gs} color="var(--chart-2)" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="min-w-0">
              <Note className="mb-1 text-[12.5px]">Processeur · 6 dernières minutes</Note>
              <LiveChart height={110} series={cpuSeries} windowMs={360000} format={(v: number) => Math.round(v) + ' %'} minMax={20} />
            </div>
            <div className="min-w-0">
              <Note className="mb-1 text-[12.5px]">Température · 6 dernières minutes</Note>
              <LiveChart height={110} series={tempSeries} windowMs={360000} format={(v: number) => num(v, 1) + '°'} minMax={60} />
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-6" title="Historique 24 h" icon="activity">
          <Note className="mb-1 text-[12.5px]">Température</Note>
          <HistoryChart data={(s.graphs?.temp || []).slice(-96)} color="var(--chart-4)" height={80} scale={(v: number) => v / 1000} format={(v: number) => num(v, 1) + '°'} />
          <Note className="mb-1 mt-3.5 text-[12.5px]">Processeur</Note>
          <HistoryChart data={(s.graphs?.cpu || []).slice(-96)} color="var(--chart-1)" height={60} bars format={(v: number) => v + ' %'} />
        </Card>

        <Card className="lg:col-span-6" title="Consommation électrique · 7 jours" icon="bolt">
          {power.length ? (
            <>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="num text-[42px] font-semibold leading-none tracking-[-0.03em] max-sm:text-[36px]">{num(power[power.length - 1]?.[1] / 1000, 1)}</span>
                <span className="text-[12.5px] text-muted-foreground">W actuellement · moyenne <span className="num">{num(avgW, 1)}</span> W · ≈ <span className="num">{num(avgW * 24 * 365 / 1000, 0)}</span> kWh/an</span>
              </div>
              <HistoryChart data={power} color="var(--ok)" height={120} scale={(v: number) => v / 1000} format={(v: number) => num(v, 1) + ' W'} />
            </>
          ) : <Empty icon="bolt" title="Historique indisponible" />}
        </Card>

        <Card className="lg:col-span-6" title="Écran et voyants" icon="sun">
          {dev && <div className="mb-2.5"><LumSlider value={dev.display?.luminosity ?? 2} /></div>}
          {led && (
            <Facts rows={[
              ['Écran', led.screen?.state === 'on' ? 'Allumé' : 'Éteint'],
              ['Voyant', ['red', 'green', 'blue', 'white'].filter((c) => led.led?.['status_' + c] && led.led['status_' + c] !== 'off').map((c) => COLORS[c]).join(', ') || 'Éteint (mode discret)'],
              ['Ports Ethernet actifs', <span className="num">{ports.filter((p) => p.state === 'Up').length} / {ports.length}</span>],
            ]} />
          )}
          {dev && (
            <div className={cn(led && 'mt-1.5 border-t border-border')}>
              <ToggleRow title="Optimisation automatique" sub="La Bbox ajuste seule ses réglages Wi-Fi" value={dev.optimisation === 1}
                onChange={(nv) => act(() => api.put('device/optimization', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(() => refresh('statics'))} />
            </div>
          )}
          {!dev && !led && <Skeleton h={160} />}
        </Card>

        <Card className="lg:col-span-6" title="Sauvegardes" icon="save" action={<AddBtn onClick={saveConfig}>Sauvegarder</AddBtn>}>
          {us?.usersave && (
            <ToggleRow title="Sauvegarde automatique Bouygues" sub={<>Toutes les <span className="num">{Math.round(us.usersave.delay / 60)}</span> min sur les serveurs Bouygues · dernière {relative(us.usersave.datelastsave)}</>}
              value={us.usersave.authorized === 1}
              onChange={(nv) => act(() => api.post('usersave', { authorized: nv ? 1 : 0 }), { ok: nv ? 'Sauvegarde automatique activée' : 'Sauvegarde automatique désactivée' }).then(reload)} />
          )}
          <SectionTitle className="mb-1 mt-3">Sauvegardes locales</SectionTitle>
          <div className="-mx-5 max-sm:-mx-4">
            {configs.length ? configs.map((c, i) => (
              <Row key={c.id ?? i}>
                <div className="min-w-0 flex-1">
                  <div className={rowT}>{c.name}</div>
                  <div className={rowS}>{dateTime(c.date)}</div>
                </div>
                <Btn kind="soft" size="sm" confirm={{ title: `Restaurer « ${c.name} » ?`, message: 'Tous les réglages actuels seront remplacés et la Bbox redémarrera.', confirm: 'Restaurer', tone: 'danger', icon: 'refresh' }}
                  onClick={() => act(() => api.post('configs/' + c.id, { restore: 1 }), { ok: 'Restauration lancée' })}>Restaurer</Btn>
                <IconBtn icon="trash" label="Supprimer" onClick={async () => {
                  if (await confirmDialog({ title: 'Supprimer cette sauvegarde ?', confirm: 'Supprimer', tone: 'danger', icon: 'trash' })) act(() => api.del('configs/' + c.id), { ok: 'Sauvegarde supprimée' }).then(reload, () => {});
                }} />
              </Row>
            )) : cfg ? (
              <Empty icon="save" title="Aucune sauvegarde locale">Fonction cachée de la Bbox : créez un point de restauration avant de gros changements.</Empty>
            ) : <div className="px-5 max-sm:px-4"><Skeleton h={80} /></div>}
          </div>
        </Card>

        <Card className="lg:col-span-6" title="Alertes par e-mail" icon="mail"
          action={notif && <Toggle value={notif.notification?.enable === 1} label="Alertes e-mail" onChange={(nv) => act(() => api.put('notification', { enable: nv ? 1 : 0 }), { ok: nv ? 'Alertes activées' : 'Alertes désactivées' }).then(reload)} />}>
          {notif ? (
            <>
              <Note className="mb-2.5 text-[13.5px]">La Bbox peut vous écrire lors d’événements ({notif.notification?.events?.length || 0} disponibles : connexion à l’interface, Internet coupé, nouvel appareil…).</Note>
              <div className="-mx-5 max-sm:-mx-4">
                {(notif.notification?.alerts || []).map((a: any, i: number) => (
                  <Row key={a.id ?? i} className="min-h-[48px]">
                    <div className="min-w-0 flex-1">
                      <div className={rowT}>{a.name}</div>
                      <div className={rowS}>{plural(String(a.events || '').split(',').filter(Boolean).length, 'événement')} · {a.action?.type === 'Mail' ? 'par e-mail' : a.action?.type}</div>
                    </div>
                    <Chip tone={a.enable ? 'ok' : 'off'}>{a.enable ? 'Active' : 'Inactive'}</Chip>
                  </Row>
                ))}
              </div>
              <Note className="mt-2.5 text-[12.5px] [overflow-wrap:anywhere]">Destinataire : {(notif.notification?.contacts || []).map((c: any) => c.mail || c.name).join(', ') || '—'}</Note>
              <Btn kind="ghost" size="sm" icon="mail" className="mt-3" onClick={() => act(() => api.post('notification/test'), { ok: 'E-mail de test envoyé' })}>Envoyer un e-mail de test</Btn>
            </>
          ) : <Skeleton h={140} />}
        </Card>

        <Card className="lg:col-span-6" title="USB et partage" icon="usb">
          <Note className="mb-2 text-[13.5px]">{usbCount ? `${plural(usbCount, 'périphérique')} USB ${usbCount > 1 ? 'branchés' : 'branché'}.` : 'Aucun périphérique USB branché.'}</Note>
          {svc?.usb && (
            <div>
              <ToggleRow title="Partage de fichiers (SMB)" sub="Accès à la clé ou au disque depuis le réseau" value={svc.usb.samba?.enable === 1}
                onChange={(nv) => act(() => api.put('device/usb/samba', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
              <ToggleRow title="Serveur multimédia (DLNA)" sub="Photos, vidéos et musique sur la TV" value={svc.usb.dlna?.enable === 1}
                onChange={(nv) => act(() => api.put('device/usb/dlna', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
              <ToggleRow title="Imprimante partagée" sub="Imprimante USB accessible depuis le réseau" value={svc.usb.printer?.enable === 1}
                onChange={(nv) => act(() => api.put('device/usb/printer', { enable: nv ? 1 : 0 }), { ok: 'Préférence enregistrée' }).then(reloadAll)} />
            </div>
          )}
        </Card>

        <AppCard />
        <CompatCard />
      </div>
    </>
  );
}

/** Jumelage des apps iOS / Android : le QR code porte l'adresse de ce relais (bboxpanel://pair, voir docs/API-APPS.md) */
function AppCard() {
  // ouvert en localhost sur l'appareil du relais : le téléphone a besoin de son adresse sur le réseau local
  const loopback = /^(localhost|127\.|\[::1\])/.test(location.hostname);
  const [lan, setLan] = useState<string | null>(null);
  useEffect(() => { if (loopback) panel.info().then((i) => setLan(i?.lan?.[0] || null), () => {}); }, [loopback]);
  const origin = loopback ? lan : location.origin;
  const url = origin ? `bboxpanel://pair?url=${encodeURIComponent(origin)}` : '';
  return (
    <Card className="lg:col-span-6" title="App mobile" icon="phone">
      <div className="flex items-start gap-4 max-sm:flex-col">
        <QR text={url} label="QR code de jumelage de l’app mobile" size={132} className="shrink-0" />
        <div className="min-w-0">
          <Note>Dans l’app <b>Panel pour Bbox</b> (iOS et Android), touchez <b>Scanner le QR code</b> : elle se connecte à ce relais et profite du temps réel, de l’historique et des alertes.</Note>
          <Note className="mt-2">Hors de chez vous, l’app passe par l’adresse distante du relais si vous en avez une (Tailscale, par exemple), sinon directement par l’accès distant de la Bbox, avec les fonctions de base.</Note>
          <div className="mt-2 font-mono text-[12px] text-muted-foreground [overflow-wrap:anywhere]">{origin || 'Adresse réseau local introuvable : ouvrez le panel par son adresse IP.'}</div>
        </div>
      </div>
    </Card>
  );
}

const ISSUE_URL = 'https://github.com/Cremechocos/bbox-panel/issues/new?template=compatibilite.yml';
/** Rapport anonymisé (modèle, firmware, fonctions absentes) à joindre à une issue pour adapter le panel à d'autres Bbox */
function CompatCard() {
  const [report, setReport] = useState<string>('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { setReport(JSON.stringify(await act(() => panel.compat(), { silent: true }), null, 2)); } catch { /* toast déjà affiché */ } finally { setBusy(false); }
  };
  const copy = () => act(() => navigator.clipboard.writeText(report), { ok: 'Rapport copié' });
  return (
    <Card className="lg:col-span-6" title="Compatibilité" icon="info"
      action={<Btn kind="plain" size="sm" icon="refresh" disabled={busy} onClick={run}>{report ? 'Relancer' : 'Générer le rapport'}</Btn>}>
      <Note>Le panel est testé sur la Bbox Wi-Fi 7. Sur un autre modèle, ce rapport liste les fonctions que votre Bbox ne propose pas. Il ne contient ni numéro de série, ni adresse MAC, ni adresse IP.</Note>
      {report && (
        <>
          <pre className="mt-3 max-h-64 overflow-auto rounded-md bg-muted p-3 font-mono text-[12px] leading-relaxed">{report}</pre>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn kind="soft" size="sm" icon="copy" onClick={copy}>Copier</Btn>
            <Btn kind="ghost" size="sm" icon="external" onClick={() => window.open(ISSUE_URL, '_blank', 'noopener')}>Signaler sur GitHub</Btn>
          </div>
        </>
      )}
    </Card>
  );
}

/** Luminosité de l'écran : curseur à 5 crans, enregistré au relâchement */
function LumSlider({ value }: { value: any }) {
  const [v, setV] = useState(Number(value));
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!busy) setV(Number(value)); }, [value]);
  const commit = async (nv: number) => {
    if (nv === Number(value)) return;
    setBusy(true);
    try { await act(() => api.put('device/display', { luminosity: nv }), { ok: `Luminosité : ${LUM[nv].l.toLowerCase()}` }); refresh('statics'); }
    catch { setV(Number(value)); } finally { setBusy(false); }
  };
  return <Range label="Luminosité de l’écran" value={v} min={0} max={4} step={1} onChange={setV} onCommit={commit} format={(x) => LUM[x]?.l} ticks={LUM_TICKS} />;
}
