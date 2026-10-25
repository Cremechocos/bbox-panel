// Mode mural : panneau de personnalisation (à droite sur grand écran, plein écran sur iPhone).
// Chaque réglage s'applique tout de suite derrière le panneau et reste enregistré sur cet appareil.
import * as React from 'react';
import { useState } from 'react';
import { AnimatePresence, motion, Reorder, useDragControls } from 'motion/react';
import { GripVertical } from 'lucide-react';
import { Btn, IconBtn, Seg, Switch, Range, Input, Select } from '@/components/kit';
import { openSheet } from '@/components/overlays';
import { FavoritesSheet } from '@/components/sheets';
import { Icon } from '@/components/icon';
import { cn } from '@/lib/utils';
import { useLive } from '@/lib/live';
import { probesOf } from '@/lib/services';
import { ServiceIcon } from '@/components/service-icon';
import { openProbesSheet } from '@/components/services';
import { useWallCfg, setWall, setWidget, applyPreset, resetWall, presetOf, metaOf, PRESETS, ACCENTS, type Widget, type WidgetId, type Size } from './config';

const EASE = [0.22, 1, 0.36, 1] as const;
const SIZES: { v: Size; l: string }[] = [{ v: 3, l: '¼' }, { v: 4, l: '⅓' }, { v: 6, l: '½' }, { v: 8, l: '⅔' }, { v: 12, l: 'Plein' }];

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-border pt-4 first:border-t-0 first:pt-0 geist:border-[color-mix(in_oklab,var(--foreground)_8%,transparent)]">
      <div className="mb-3 flex items-baseline gap-2"><h3 className="text-[13.5px] font-semibold">{title}</h3>{sub && <span className="text-[12px] text-muted-foreground">{sub}</span>}</div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}
function Line({ label, sub, children }: { label: React.ReactNode; sub?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-9 items-center gap-3">
      <div className="min-w-0 flex-1"><div className="text-[13.5px]">{label}</div>{sub && <div className="mt-0.5 text-[12px] leading-snug text-muted-foreground">{sub}</div>}</div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Options propres à chaque tuile */
function WidgetOptions({ w }: { w: Widget }) {
  const o = w.opts;
  const set = (opts: Record<string, any>) => setWidget(w.id, { opts });
  const probes = probesOf(useLive());
  const pick: string[] = o.pick || [];
  switch (w.id) {
    case 'clock': return <>
      <Line label="Style"><Seg size="sm" value={o.style} onChange={(v) => set({ style: v })} options={[{ v: 'digital', l: 'Chiffres' }, { v: 'analog', l: 'Aiguilles' }]} label="Style de l’horloge" /></Line>
      <Line label="Secondes"><Switch checked={!!o.seconds} onChange={(v) => set({ seconds: v })} label="Secondes" /></Line>
      <Line label="Date"><Switch checked={!!o.date} onChange={(v) => set({ date: v })} label="Date" /></Line>
    </>;
    case 'internet': return <>
      <Line label="Adresse IP publique"><Switch checked={!!o.ip} onChange={(v) => set({ ip: v })} label="Adresse IP" /></Line>
      <Line label="Durée de fonctionnement"><Switch checked={!!o.uptime} onChange={(v) => set({ uptime: v })} label="Durée" /></Line>
    </>;
    case 'latency': return <>
      <div className="grid gap-1.5 text-[13.5px]">Service mesuré
        <Select value={o.target || 'internet'} onChange={(v) => set({ target: v })} label="Service mesuré"
          options={[{ v: 'internet', l: 'Internet (1.1.1.1 et 8.8.8.8)' }, ...probes.map((p) => ({ v: p.id, l: <span className="flex items-center gap-2"><ServiceIcon id={p.id} name={p.name} size={14} />{p.name}</span> }))]} />
      </div>
      <Line label="Courbe"><Switch checked={!!o.chart} onChange={(v) => set({ chart: v })} label="Courbe" /></Line>
      {o.chart && <Line label="Période"><Seg size="sm" value={o.minutes} onChange={(v) => set({ minutes: Number(v) })} options={[{ v: 2, l: '2 min' }, { v: 5, l: '5 min' }, { v: 10, l: '10 min' }]} label="Période" /></Line>}
    </>;
    case 'services': return <>
      <div className="grid gap-2 text-[13.5px]">
        <div>Services affichés <span className="text-[12px] text-muted-foreground">· {pick.length ? `${pick.length} choisi${pick.length > 1 ? 's' : ''}` : 'tous'}</span></div>
        <div className="flex flex-wrap gap-1.5">
          {probes.map((p) => {
            const on = pick.includes(p.id);
            return (
              <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ pick: on ? pick.filter((x) => x !== p.id) : [...pick, p.id] })}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[12.5px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50',
                  on ? 'bg-foreground text-background' : 'bg-[color-mix(in_oklab,var(--foreground)_7%,transparent)] text-muted-foreground hover:text-foreground')}>
                <ServiceIcon id={p.id} name={p.name} size={13} />{p.name}
              </button>
            );
          })}
        </div>
      </div>
      <Line label="Mini-courbes"><Switch checked={o.spark !== false} onChange={(v) => set({ spark: v })} label="Mini-courbes" /></Line>
      <Line label="Ordre"><Seg size="sm" value={o.sort || 'order'} onChange={(v) => set({ sort: v })} options={[{ v: 'order', l: 'Réglages' }, { v: 'fast', l: 'Plus rapides' }]} label="Ordre" /></Line>
      <Line label="Services mesurés" sub="Partagés par tous vos écrans"><Btn kind="soft" size="sm" onClick={openProbesSheet}>Choisir</Btn></Line>
    </>;
    case 'traffic': return <>
      <Line label="Courbe"><Switch checked={!!o.chart} onChange={(v) => set({ chart: v })} label="Courbe" /></Line>
      {o.chart && <Line label="Période"><Seg size="sm" value={o.minutes} onChange={(v) => set({ minutes: Number(v) })} options={[{ v: 10, l: '10 min' }, { v: 30, l: '30 min' }, { v: 60, l: '1 h' }]} label="Période" /></Line>}
    </>;
    case 'today': return <Line label="Détail réception / envoi"><Switch checked={!!o.split} onChange={(v) => set({ split: v })} label="Détail" /></Line>;
    case 'devices': return <>
      <Line label="Liste"><Seg size="sm" value={o.list} onChange={(v) => set({ list: v })} options={[{ v: 'top', l: 'Plus actifs' }, { v: 'recent', l: 'Arrivées' }, { v: 'none', l: 'Aucune' }]} label="Liste" /></Line>
      {o.list !== 'none' && <Line label="Nombre"><Seg size="sm" value={o.max} onChange={(v) => set({ max: Number(v) })} options={[{ v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }]} label="Nombre" /></Line>}
    </>;
    case 'activity': return <>
      <Line label="Événements"><Seg size="sm" value={o.kinds} onChange={(v) => set({ kinds: v })} options={[{ v: 'presence', l: 'Présence' }, { v: 'all', l: 'Tout' }]} label="Événements" /></Line>
      <Line label="Nombre"><Seg size="sm" value={o.max} onChange={(v) => set({ max: Number(v) })} options={[{ v: 3, l: '3' }, { v: 5, l: '5' }, { v: 8, l: '8' }]} label="Nombre" /></Line>
    </>;
    case 'wifi': return <Line label="Nom du réseau"><Switch checked={!!o.ssid} onChange={(v) => set({ ssid: v })} label="Nom du réseau" /></Line>;
    case 'health': return <Line label="Style"><Seg size="sm" value={o.style} onChange={(v) => set({ style: v })} options={[{ v: 'gauges', l: 'Jauges' }, { v: 'bars', l: 'Barres' }]} label="Style" /></Line>;
    case 'favorites': return <Line label="Appareils affichés" sub="Les favoris sont partagés entre vos appareils."><Btn kind="soft" size="sm" onClick={() => { openSheet(FavoritesSheet, {}, { title: 'Favoris', description: 'Partagés entre tous vos appareils' }); }}>Choisir</Btn></Line>;
    case 'guest': return <>
      <Line label="QR code"><Switch checked={!!o.qr} onChange={(v) => set({ qr: v })} label="QR code" /></Line>
      <Line label="Mot de passe en clair"><Switch checked={!!o.pass} onChange={(v) => set({ pass: v })} label="Mot de passe" /></Line>
    </>;
    default: return <div className="text-[12.5px] text-muted-foreground">Pas d’option pour cette tuile.</div>;
  }
}

function TileRow({ w, open, onToggle }: { w: Widget; open: boolean; onToggle: () => void }) {
  const m = metaOf(w.id);
  const drag = useDragControls();
  return (
    <Reorder.Item value={w} dragListener={false} dragControls={drag} layout="position"
      whileDrag={{ scale: 1.02, boxShadow: '0 12px 32px rgba(0,0,0,.28)', zIndex: 5 }}
      className="relative rounded-xl bg-secondary/70 geist:rounded-lg geist:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)]">
      <div className="flex items-center gap-1.5 py-1 pl-0.5 pr-1.5">
        <button type="button" aria-label={`Déplacer « ${m.label} »`} onPointerDown={(e) => drag.start(e)}
          className="grid size-9 shrink-0 cursor-grab touch-none place-items-center rounded-lg text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 active:cursor-grabbing max-sm:size-11">
          <GripVertical className="size-4" strokeWidth={1.8} />
        </button>
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md py-1.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
          <Icon name={m.icon} className={cn('size-4 shrink-0', w.on ? 'text-foreground' : 'text-muted-foreground')} strokeWidth={1.8} />
          <span className="min-w-0">
            <span className={cn('block truncate text-[13.5px] font-medium', !w.on && 'text-muted-foreground')}>{m.label}</span>
            <span className="block truncate text-[11.5px] text-muted-foreground">{w.on ? `${SIZES.find((x) => x.v === w.size)?.l}${w.size === 12 ? '' : ' de largeur'}${w.tall ? ' · double hauteur' : ''}` : 'masquée'}</span>
          </span>
          <Icon name="chevron" className={cn('ml-auto size-4 shrink-0 text-muted-foreground transition-transform duration-200', open && 'rotate-90')} />
        </button>
        <Switch checked={w.on} onChange={(v) => setWidget(w.id, { on: v })} label={`Afficher « ${m.label} »`} />
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden">
            <div className="grid gap-2.5 px-3 pb-3 pt-1">
              <div className="text-[12px] text-muted-foreground">{m.desc}</div>
              <Line label="Largeur"><Seg size="sm" value={w.size} onChange={(v) => setWidget(w.id, { size: Number(v) as Size, on: true })} options={SIZES} label="Largeur" /></Line>
              <Line label="Double hauteur"><Switch checked={w.tall} onChange={(v) => setWidget(w.id, { tall: v, on: true })} label="Double hauteur" /></Line>
              <WidgetOptions w={w} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Reorder.Item>
  );
}

export function WallEditor({ onClose }: { onClose: () => void }) {
  const c = useWallCfg();
  const [open, setOpen] = useState<WidgetId | null>(null);
  const preset = presetOf(c);
  const shown = c.widgets.filter((w) => w.on).length;
  return (
    <motion.aside role="dialog" aria-label="Personnaliser l’écran mural" initial={{ x: 48, opacity: 0 }} animate={{ x: 0, opacity: 1 }} exit={{ x: 48, opacity: 0 }} transition={{ duration: 0.38, ease: EASE }}
      className="fixed inset-y-0 right-0 z-[60] flex w-[400px] max-w-full flex-col border-l border-border bg-card text-foreground shadow-pop geist:glass geist:border-l-0 max-md:w-full">
      <header className="flex items-start gap-2 px-5 pb-3 pt-[max(18px,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <h2 className="text-[17px] font-semibold tracking-[-0.01em] geist:text-[15px]">Personnaliser l’écran</h2>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Enregistré sur cet appareil · {shown} tuile{shown > 1 ? 's' : ''}</p>
        </div>
        <IconBtn icon="x" label="Fermer" onClick={onClose} />
      </header>
      <div className="scroll-y grid min-h-0 flex-1 content-start gap-5 overflow-y-auto overscroll-contain px-5 pb-6">
        <Section title="Modèles" sub="point de départ">
          <div className="grid grid-cols-2 gap-2">
            {PRESETS.map((p) => (
              <button key={p.id} type="button" onClick={() => applyPreset(p.id)} aria-pressed={preset === p.id}
                className={cn('h-full min-w-0 rounded-xl px-3 py-2.5 text-left align-top outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 geist:rounded-lg',
                  preset === p.id ? 'bg-brand-soft text-brand-ink shadow-[inset_0_0_0_1.5px_var(--brand)] geist:bg-selected geist:text-foreground geist:shadow-[inset_0_0_0_1px_color-mix(in_oklab,var(--foreground)_35%,transparent)]' : 'bg-secondary/70 hover:bg-secondary geist:bg-[color-mix(in_oklab,var(--foreground)_5%,transparent)] geist:hover:bg-hover')}>
                <div className="truncate text-[13.5px] font-semibold geist:font-medium">{p.label}</div>
                <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">{p.desc}</div>
              </button>
            ))}
          </div>
        </Section>

        <Section title="Tuiles" sub="glissez pour réordonner">
          <Reorder.Group axis="y" values={c.widgets} onReorder={(ws) => setWall({ widgets: ws })} className="grid gap-1.5">
            {c.widgets.map((w) => <TileRow key={w.id} w={w} open={open === w.id} onToggle={() => setOpen(open === w.id ? null : w.id)} />)}
          </Reorder.Group>
        </Section>

        <Section title="Affichage">
          <Line label="Thème"><Seg size="sm" value={c.theme} onChange={(v) => setWall({ theme: v })} options={[{ v: 'app', l: 'Comme l’app' }, { v: 'dark', l: 'Sombre' }, { v: 'light', l: 'Clair' }]} label="Thème" /></Line>
          <Range label="Taille du texte" value={Math.round(c.scale * 100)} min={80} max={160} step={5} format={(v) => `${v} %`} onChange={(v) => setWall({ scale: v / 100 })}
            ticks={[{ v: 80, l: '80' }, { v: 100, l: '100' }, { v: 120, l: '120' }, { v: 140, l: '140' }, { v: 160, l: '160' }]} />
          <Line label="Espacement"><Seg size="sm" value={c.density} onChange={(v) => setWall({ density: v })} options={[{ v: 'air', l: 'Aéré' }, { v: 'compact', l: 'Compact' }]} label="Espacement" /></Line>
          <div>
            <div className="mb-2 text-[13.5px]">Couleur des graphiques</div>
            <div role="radiogroup" aria-label="Couleur des graphiques" className="flex flex-wrap gap-2">
              {ACCENTS.map((a) => (
                <button key={a.id} type="button" role="radio" aria-checked={c.accent === a.id} aria-label={a.label} title={a.label} onClick={() => setWall({ accent: a.id })}
                  className={cn('grid size-9 place-items-center rounded-full outline-none transition-[box-shadow,transform] focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95',
                    c.accent === a.id ? 'shadow-[0_0_0_2px_var(--card),0_0_0_4px_var(--foreground)]' : 'hover:scale-105')}>
                  <span className="size-7 rounded-full shadow-[inset_0_0_0_1px_rgba(0,0,0,.12)]" style={{ background: a.id === 'auto' ? 'conic-gradient(var(--chart-1), var(--chart-2), var(--chart-4), var(--chart-1))' : a.color }} />
                </button>
              ))}
            </div>
          </div>
          <Line label="En-tête" sub="Logo, titre, état d’Internet"><Switch checked={c.header.on} onChange={(v) => setWall({ header: { ...c.header, on: v } })} label="En-tête" /></Line>
          {c.header.on && (
            <>
              <label className="grid gap-1.5 text-[13.5px]">Titre
                <Input value={c.header.title} maxLength={40} placeholder="Ma Bbox" onInput={(v) => setWall({ header: { ...c.header, title: v } })} />
              </label>
              <Line label="Heure dans l’en-tête" sub="Si la tuile Horloge est masquée"><Switch checked={c.header.clock} onChange={(v) => setWall({ header: { ...c.header, clock: v } })} label="Heure dans l’en-tête" /></Line>
            </>
          )}
        </Section>

        <Section title="Écran">
          <Line label="Atténuer la nuit" sub="Assombrit l’écran pendant la plage choisie"><Switch checked={c.dim.on} onChange={(v) => setWall({ dim: { ...c.dim, on: v } })} label="Atténuer la nuit" /></Line>
          {c.dim.on && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-[12.5px] text-muted-foreground">De<Input type="time" value={c.dim.from} onInput={(v) => setWall({ dim: { ...c.dim, from: v } })} /></label>
                <label className="grid gap-1.5 text-[12.5px] text-muted-foreground">À<Input type="time" value={c.dim.to} onInput={(v) => setWall({ dim: { ...c.dim, to: v } })} /></label>
              </div>
              <Range label="Intensité" value={Math.round(c.dim.level * 100)} min={20} max={85} step={5} format={(v) => `${v} %`} onChange={(v) => setWall({ dim: { ...c.dim, level: v / 100 } })} />
            </>
          )}
          <Line label="Anti-marquage" sub="Décale très légèrement l’affichage toutes les 2 minutes (écrans OLED, téléviseurs)"><Switch checked={c.shift} onChange={(v) => setWall({ shift: v })} label="Anti-marquage" /></Line>
          <Line label="Masquer les commandes"><Seg size="sm" value={c.hideAfter} onChange={(v) => setWall({ hideAfter: Number(v) })} options={[{ v: 3, l: '3 s' }, { v: 6, l: '6 s' }, { v: 15, l: '15 s' }, { v: 0, l: 'Jamais' }]} label="Masquer les commandes" /></Line>
        </Section>
      </div>
      <footer className="flex items-center gap-2 border-t border-border px-5 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 geist:border-[color-mix(in_oklab,var(--foreground)_8%,transparent)]">
        <Btn kind="danger-ghost" size="sm" icon="refresh" onClick={resetWall}
          confirm={{ title: 'Réinitialiser l’écran mural ?', message: 'Tuiles et réglages reviennent au modèle « Essentiel » sur cet appareil.', confirm: 'Réinitialiser', icon: 'refresh' }}>Réinitialiser</Btn>
        <span className="flex-1" />
        <Btn onClick={onClose}>Terminé</Btn>
      </footer>
    </motion.aside>
  );
}
