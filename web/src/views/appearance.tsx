// Apparence : Bbox Clair ou Noir Geist, en clair ou en sombre. Les aperçus sont l'application elle-même, en direct.
import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { PageHead, Seg, Btn, Chip, Note, Card, ToggleRow, Input } from '@/components/kit';
import { usePrefs, setOwner } from '@/lib/prefs';
import { hello } from '@/lib/format';
import { Icon } from '@/components/icon';
import { SKINS, useAppearance, setSkin, setThemePref, type SkinId } from '@/lib/theme';
import { useMobile } from '@/lib/data';
import { useWanHidden, setWanHidden, usePhoneHidden, setPhoneHidden } from '@/lib/privacy';
import { cn } from '@/lib/utils';
import type { Route } from '@/lib/router';

const MODES = [{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }];
const PAGES = [{ v: 'accueil', l: 'Accueil' }, { v: 'appareils', l: 'Appareils' }, { v: 'stats', l: 'Statistiques' }, { v: 'wifi', l: 'Wi-Fi' }];
type Skin = (typeof SKINS)[number];

/** Aperçu en direct : l'application dans un cadre d'ordinateur, et en surimpression dans un iPhone */
function Preview({ skin, theme, path }: { skin: Skin; theme: string; path: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [k, setK] = useState(0.4);
  useEffect(() => {
    const ro = new ResizeObserver(([e]) => setK(e.contentRect.width / 1280));
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, []);
  const src = `/?skin=${skin.id}&theme=${theme}&preview=1#/${path}`;
  const pk = Math.max(0.3, Math.min(0.44, k * 0.86));
  return (
    <div ref={box} aria-hidden className="pointer-events-none relative overflow-hidden rounded-t-[inherit] border-b border-border bg-muted" style={{ height: Math.round(800 * k) }}>
      <iframe src={src} title={'Aperçu ' + skin.name} loading="lazy" tabIndex={-1} className="absolute left-0 top-0 h-[800px] w-[1280px] origin-top-left border-0" style={{ transform: `scale(${k})` }} />
      <div className="absolute bottom-0 right-[6%] origin-bottom-right overflow-hidden rounded-[52px] border-[9px] border-[#0b0b0c] bg-black shadow-[0_24px_60px_-12px_rgba(0,0,0,.55),0_0_0_1px_rgba(255,255,255,.08)]"
        style={{ width: 390 + 18, height: 844 + 18, transform: `translateY(28%) scale(${pk})` }}>
        <iframe src={src} title={'Aperçu mobile ' + skin.name} loading="lazy" tabIndex={-1} className="h-[844px] w-[390px] border-0" />
      </div>
    </div>
  );
}
/** Vignette stylisée (iPhone : pas d'iframe, plus léger) */
function Swatch({ id, onClick, label }: { id: SkinId; onClick: () => void; label: string }) {
  const geist = id === 'geist';
  return (
    <button type="button" onClick={onClick} aria-label={label}
      className={cn('flex h-36 w-full overflow-hidden rounded-t-[inherit] border-b border-border text-left', geist ? 'flex-col bg-black' : 'bg-[#eef2f5]')}>
      {geist ? (
        <>
          <span className="flex h-7 items-center gap-1.5 border-b border-[#1f1f1f] px-3"><i className="size-2.5 rounded-full bg-white" /><i className="h-1.5 w-10 rounded-full bg-[#3a3a3a]" /><i className="ml-auto h-1.5 w-6 rounded-full bg-[#2e2e2e]" /></span>
          <span className="flex h-6 items-end gap-3 border-b border-[#1f1f1f] px-3 pb-1.5"><i className="h-1.5 w-8 rounded-full bg-[#ededed]" /><i className="h-1.5 w-8 rounded-full bg-[#3a3a3a]" /><i className="h-1.5 w-8 rounded-full bg-[#3a3a3a]" /></span>
          <span className="grid flex-1 grid-cols-3 gap-2 p-3">{[0, 1, 2].map((i) => <i key={i} className="rounded-md border border-[#1f1f1f] bg-[#0a0a0a]" />)}</span>
        </>
      ) : (
        <>
          <span className="flex w-14 flex-col gap-1.5 bg-[#182b3b] p-2.5"><i className="mb-1 size-3 rounded-full bg-white" />{[0, 1, 2, 3].map((i) => <i key={i} className={cn('h-1.5 rounded-full', i === 0 ? 'bg-[#5fd0e2]' : 'bg-white/20')} />)}</span>
          <span className="grid flex-1 grid-cols-2 gap-2 p-3">{[0, 1, 2, 3].map((i) => <i key={i} className="rounded-xl bg-white shadow-[0_1px_3px_rgba(16,32,48,.08)]" />)}</span>
        </>
      )}
    </button>
  );
}

export default function Appearance(_: { route: Route }) {
  const a = useAppearance();
  const mobile = useMobile();
  const [mode, setMode] = useState('def');
  const [path, setPath] = useState('accueil');
  const wanHidden = useWanHidden();
  const phoneHidden = usePhoneHidden();
  return (
    <>
      <PageHead kicker="Réglages" title="Apparence" sub="Deux apparences complètes, chacune en clair et en sombre. Les aperçus sont l’application elle-même, en direct."
        actions={<Seg label="Mode clair ou sombre" value={a.pref} onChange={setThemePref} options={MODES} />} />
      {!mobile && (
        <div className="enter mb-4 flex flex-wrap items-center gap-2.5">
          <span className="mr-1 text-[13px] text-muted-foreground">Aperçus</span>
          <Seg size="sm" label="Thème des aperçus" value={mode} onChange={setMode} options={[{ v: 'def', l: 'Par défaut' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }]} />
          <Seg size="sm" label="Page des aperçus" value={path} onChange={setPath} options={PAGES} />
        </div>
      )}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {SKINS.map((s) => {
          const on = a.skin === s.id;
          return (
            <section key={s.id} className={cn('enter card-surface relative flex min-w-0 flex-col overflow-hidden transition-shadow', on && 'shadow-[0_0_0_2px_var(--brand)] geist:shadow-[0_0_0_1px_var(--foreground)]')}>
              {mobile ? <Swatch id={s.id} onClick={() => setSkin(s.id)} label={'Utiliser ' + s.name} /> : <Preview key={s.id + mode + path} skin={s} theme={mode === 'def' ? s.def : mode} path={path} />}
              <div className="flex flex-wrap items-center gap-4 p-5 max-sm:p-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[17px] font-semibold tracking-[-0.01em]">{s.name}{on && <Chip tone="brand">Utilisée</Chip>}</div>
                  <Note className="mt-1 text-[13.5px]">{s.desc}</Note>
                  <Note className="mt-0.5">Police {s.font} · {s.layout === 'ligne' ? 'barre latérale dense, sans cartes' : 'barre latérale'} · {s.def === 'light' ? 'clair' : 'sombre'} par défaut</Note>
                </div>
                {on ? (
                  <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-brand-soft px-3.5 text-[13px] font-semibold text-brand-ink geist:rounded-lg geist:bg-secondary geist:text-foreground">
                    <Icon name="check" className="size-4" />Sélectionnée
                  </motion.span>
                ) : <Btn kind="go" size="sm" onClick={() => setSkin(s.id)}>Utiliser</Btn>}
              </div>
            </section>
          );
        })}
      </div>
      <Card title="Confidentialité" icon="eyeoff" className="enter mt-5">
        <ToggleRow title="Flouter les adresses IP publiques" value={wanHidden} onChange={(v) => setWanHidden(v)}
          sub="Adresses IPv4 et IPv6 de la connexion, passerelle, préfixe IPv6, accès à distance et journaux, sur toutes les pages et le mode mural. Les adresses du réseau local (192.168…) restent visibles. Un clic sur une adresse floutée l’affiche quelques secondes." />
        <ToggleRow title="Flouter le numéro de téléphone" value={phoneHidden} onChange={(v) => setPhoneHidden(v)}
          sub="Le numéro de votre ligne fixe, sur la page Téléphonie et dans le journal de la Bbox. Les numéros de vos correspondants (journal d’appels, numéros autorisés) restent visibles. Un clic l’affiche quelques secondes." />
      </Card>
      <Card title="Accueil" icon="home" className="enter mt-5">
        <OwnerField />
      </Card>
      <Note className="mt-4">Ces choix sont mémorisés sur cet appareil (sauf le prénom, commun à tous vos écrans) : le Mac et l’iPhone peuvent avoir chacun leur apparence. « Auto » suit le réglage clair/sombre du système.</Note>
    </>
  );
}

/** Prénom de la salutation (« Bonsoir Alexandre ») : enregistré sur le serveur, à la sortie du champ */
function OwnerField() {
  const p = usePrefs();
  const [v, setV] = useState(p.owner);
  useEffect(() => setV(p.owner), [p.owner]);
  return (
    <div className="py-3 geist:py-2.5">
      <label htmlFor="owner" className="text-[14.5px] font-medium clair:font-semibold geist:text-[13.5px]">Votre prénom</label>
      <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground geist:text-[12.5px]">Affiché dans la salutation de l’accueil (« {hello()}{v.trim() ? ` ${v.trim()}` : ''} »). Laissez vide pour une salutation seule.</div>
      <Input id="owner" value={v} onInput={setV} placeholder="Prénom" maxLength={32} autoComplete="given-name" className="mt-2.5 max-w-[320px]"
        onBlur={() => setOwner(v)} onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
    </div>
  );
}
