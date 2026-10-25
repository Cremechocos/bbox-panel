// Feuilles partagées : pause Internet d'un appareil, Wi-Fi invité temporaire, choix des favoris.
import { useMemo, useState } from 'react';
import { Btn, Choices, Checkbox, Field, Input, Empty, Banner, Note, SectionTitle, Avatar, Chip, Row, type FieldDef } from '@/components/kit';
import { SheetBody, SheetFooter } from '@/components/overlays';
import { Icon, KIND_ICON } from '@/components/icon';
import { live } from '@/lib/live';
import { PAUSES, pauseDevice, resumeDevice, pauseOf, untilLabel, GUEST_DURATIONS, guestOn, guestOff, guestTimer, ACTIONS, usePrefs, setFavs } from '@/lib/prefs';
import { displayName, deviceKind, bboxHostname, BBOX_NAME_MAX } from '@/lib/format';
import { go } from '@/lib/router';

/** Pause Internet immédiate (règle de pare-feu retirée automatiquement par le serveur du panel) */
export function PauseSheet({ h, close }: { h: any; close: (v?: unknown) => void }) {
  const cur = pauseOf(h.macaddress);
  const [v, setV] = useState<number | string>(60);
  const [custom, setCustom] = useState('');
  const opts = [...PAUSES, { v: 'custom', l: 'Jusqu’à…', s: 'heure précise' }];
  const until = () => {
    if (v !== 'custom') return v;
    const [hh, mm] = custom.split(':').map(Number);
    const d = new Date(); d.setHours(hh, mm, 0, 0); if (d <= new Date()) d.setDate(d.getDate() + 1);
    return Math.round((d.getTime() - Date.now()) / 60000);
  };
  const valid = v !== 'custom' || /^\d{2}:\d{2}$/.test(custom);
  return (
    <>
      <SheetBody className="grid content-start gap-4">
        {cur && <Banner tone="warn" icon="pause"><b>En pause jusqu’à {untilLabel(cur.until)}.</b> <span>Choisissez une nouvelle durée pour prolonger ou raccourcir.</span></Banner>}
        <Note className="text-[13.5px]">{displayName(h)} n’aura plus accès à Internet (le réseau local reste disponible). La pause est levée automatiquement, même si cette page est fermée.</Note>
        <Choices options={opts} value={v} onChange={setV} label="Durée de la pause" cols={2} />
        {v === 'custom' && <Field label="Reprise à"><Input type="time" value={custom} onInput={setCustom} /></Field>}
      </SheetBody>
      <SheetFooter>
        {cur && <Btn kind="ghost" icon="play" onClick={async () => { await resumeDevice(h); close(true); }}>Reprendre maintenant</Btn>}
        <span className="flex-1" />
        <Btn kind="go" icon="pause" disabled={!valid} onClick={async () => { await pauseDevice(h, until()); close(true); }}>{cur ? 'Modifier la pause' : 'Mettre en pause'}</Btn>
      </SheetFooter>
    </>
  );
}

/** Wi-Fi invité : durée, avertissement de redémarrage du Wi-Fi, carte imprimable */
export function GuestSheet({ enabled, close }: { enabled: boolean; close: (v?: unknown) => void }) {
  const t = guestTimer();
  const [v, setV] = useState(240);
  return (
    <>
      <SheetBody className="grid content-start gap-4">
        <Banner tone="info" icon="wifi"><b>Coupure Wi-Fi d’environ 40 secondes.</b> <span>Pour activer ou couper le réseau invité, la Bbox redémarre son Wi-Fi : les appareils sans fil se reconnectent ensuite seuls.</span></Banner>
        {enabled ? (
          <div className="flex flex-wrap items-center gap-2"><Chip tone="ok" dot>Actif</Chip><span className="text-[13.5px] text-muted-foreground">{t ? `coupure automatique ${untilLabel(t.until)}` : 'sans limite de durée'}</span></div>
        ) : (
          <><Note className="text-[13.5px]">Pendant combien de temps ?</Note><Choices options={GUEST_DURATIONS} value={v} onChange={setV} label="Durée" cols={2} /></>
        )}
        <div className="-mx-5 border-t border-border sm:-mx-6">
          <Row onClick={() => { close(); go('carte', 'guest'); }} className="px-5 sm:px-6">
            <Avatar icon="print" size="sm" />
            <div className="min-w-0 flex-1"><div className="font-medium">Carte Wi-Fi à imprimer</div><div className="truncate text-[13px] text-muted-foreground">Nom du réseau, mot de passe et QR code pour vos invités</div></div>
            <Icon name="chevron" className="size-[18px] text-muted-foreground" />
          </Row>
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="flex-1" />
        <Btn kind="ghost" onClick={() => close(false)}>Annuler</Btn>
        {enabled
          ? <Btn kind="danger" icon="x" onClick={async () => { if (await guestOff({ ask: false })) close(true); }}>Couper le Wi-Fi invité</Btn>
          : <Btn kind="go" icon="link" onClick={async () => { if (await guestOn(v, { ask: false })) close(true); }}>Activer</Btn>}
      </SheetFooter>
    </>
  );
}

/** Choix des favoris (appareils et actions), partagés entre le Mac et l'iPhone */
export function FavoritesSheet({ close }: { close: (v?: unknown) => void }) {
  const p = usePrefs();
  const [devs, setDevs] = useState(() => new Set(p.favorites.devices));
  const [acts, setActs] = useState(() => new Set(p.favorites.actions));
  const [busy, setBusy] = useState(false);
  const hosts = useMemo(() => [...(live.hosts || [])].sort((a, b) => b.active - a.active || displayName(a).localeCompare(displayName(b), 'fr')), []);
  const tog = (set: Set<string>, setter: (s: Set<string>) => void, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); setter(n); };
  const n = devs.size + acts.size;
  return (
    <>
      <SheetBody>
        <SectionTitle className="mt-1">Appareils</SectionTitle>
        {hosts.length ? (
          <div className="-mx-5 sm:-mx-6">
            {hosts.map((h) => {
              const id = String(h.macaddress).toLowerCase();
              return (
                <Row key={id} onClick={() => tog(devs, setDevs, id)} className="min-h-[54px] px-5 sm:px-6">
                  <Avatar icon={KIND_ICON[deviceKind(h)]} size="sm" on={!!h.active} />
                  <div className="min-w-0 flex-1"><div className="truncate font-medium">{displayName(h)}</div><div className="text-[13px] text-muted-foreground">{h.active ? h.ipaddress : 'hors ligne'}</div></div>
                  <span onClick={(e) => e.stopPropagation()}><Checkbox checked={devs.has(id)} onChange={() => tog(devs, setDevs, id)} label={<span className="sr-only">{displayName(h)}</span>} /></span>
                </Row>
              );
            })}
          </div>
        ) : <Empty icon="devices" title="Aucun appareil" />}
        <SectionTitle>Actions rapides</SectionTitle>
        <div className="-mx-5 sm:-mx-6">
          {ACTIONS.map((a) => (
            <Row key={a.id} onClick={() => tog(acts, setActs, a.id)} className="min-h-[52px] px-5 sm:px-6">
              <Avatar icon={a.icon} size="sm" />
              <div className="min-w-0 flex-1 font-medium">{a.label}</div>
              <span onClick={(e) => e.stopPropagation()}><Checkbox checked={acts.has(a.id)} onChange={() => tog(acts, setActs, a.id)} label={<span className="sr-only">{a.label}</span>} /></span>
            </Row>
          ))}
        </div>
      </SheetBody>
      <SheetFooter>
        <span className="flex-1 text-[13px] text-muted-foreground">{n} favori{n > 1 ? 's' : ''}</span>
        <Btn kind="ghost" onClick={() => close(false)}>Annuler</Btn>
        <Btn kind="go" disabled={busy} onClick={async () => { setBusy(true); try { await setFavs({ devices: [...devs], actions: [...acts] }); close(true); } catch { /* toast */ } finally { setBusy(false); } }}>Enregistrer</Btn>
      </SheetFooter>
    </>
  );
}

/** Champ « nom d'appareil » : nom libre dans le panel, converti pour la Bbox ([A-Za-z0-9_-], 48 max) */
export const nameField = (label = 'Nom de l’appareil'): FieldDef => ({
  key: 'hostname', label, required: true,
  validate: (v) => { const t = String(v || '').trim(); return !bboxHostname(t) ? 'Utilisez au moins une lettre ou un chiffre' : t.length > 64 ? '64 caractères au plus' : null; },
  help: (vals) => {
    const t = String(vals.hostname || '').trim(), b = bboxHostname(t);
    return t && b !== t
      ? <>La Bbox n’accepte ni espaces ni accents : elle l’enregistrera sous <b className="whitespace-nowrap font-medium text-foreground">{b}</b>, le panel affichera « {t} ».</>
      : `Lettres, chiffres, tirets : ${BBOX_NAME_MAX} caractères au plus pour la Bbox.`;
  },
});
