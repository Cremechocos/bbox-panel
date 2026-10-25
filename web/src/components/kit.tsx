// Kit d'interface du panel : briques communes aux deux apparences (Bbox Clair, Noir Geist),
// construites sur shadcn/ui (Radix) + Motion. Les noms et props reprennent ceux de l'ancienne interface.
import * as React from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { Switch as SwitchPrimitive, Select as SelectPrimitive, Slider as SliderPrimitive, Tooltip as TooltipPrimitive } from 'radix-ui';
import qrcode from 'qrcode-generator';
import { Check, ChevronDown, Loader2 } from 'lucide-react';
import { Icon } from '@/components/icon';
import { Button } from '@/components/ui/button';
import { Skeleton as UISkeleton } from '@/components/ui/skeleton';
import { confirm as confirmDialog, SheetBody, SheetFooter, type ConfirmOpts } from '@/components/overlays';
import { cn } from '@/lib/utils';
import { toast, useMobile, useApi, errMsg } from '@/lib/data';
import { DAYS, displayName } from '@/lib/format';

export { toast };
type Children = { children?: React.ReactNode };

// ═════════════ Mise en page ═════════════
export function PageHead({ kicker, title, sub, actions }: { kicker?: React.ReactNode; title: React.ReactNode; sub?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <header className="enter mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4 max-sm:mb-5 max-sm:flex-col max-sm:items-stretch max-sm:gap-y-3.5 geist:mb-8 geist:max-sm:mb-6">
      <div className="min-w-0 flex-1">
        {kicker && <div className="mb-1.5 text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-ink geist:hidden">{kicker}</div>}
        <h1 className="text-[30px] font-semibold leading-[1.1] tracking-[-0.025em] text-foreground max-sm:text-[28px] geist:text-[22px] geist:leading-tight geist:tracking-[-0.02em] geist:max-sm:text-[22px]">{title}</h1>
        {sub && <p className="mt-2 text-[14.5px] text-muted-foreground geist:mt-1.5 geist:text-[13px]">{sub}</p>}
      </div>
      {actions && <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Card({ title, icon, sub, action, children, className, flush = false, foot, bodyClass }: { title?: React.ReactNode; icon?: string; sub?: React.ReactNode; action?: React.ReactNode; className?: string; flush?: boolean; foot?: React.ReactNode; bodyClass?: string } & Children) {
  return (
    <section data-card="" className={cn('enter card-surface relative flex min-w-0 flex-col', flush ? 'py-1.5 geist:py-0' : 'p-5 max-sm:p-4 geist:p-0', className)}>
      {(title || action) && (
        <div className={cn('flex min-h-8 items-center gap-3', flush ? 'pb-1.5 pl-5 pr-5 pt-3.5 max-sm:pl-4 max-sm:pr-4 geist:pb-1 geist:pl-0 geist:pr-0 geist:pt-0' : 'mb-3.5 geist:mb-2')}>
          {title && (
            <h2 className="flex min-w-0 flex-1 items-center gap-2.5 text-[15px] font-semibold tracking-[-0.01em] geist:gap-2 geist:text-[13.5px] geist:tracking-normal">
              {icon && <Icon name={icon} className="size-[18px] text-brand geist:hidden" />}
              <span className="truncate">{title}</span>
              {sub && <span className="truncate text-[13px] font-normal text-muted-foreground max-sm:hidden geist:text-[12.5px]">{sub}</span>}
            </h2>
          )}
          {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
        </div>
      )}
      <div className={cn('min-w-0 flex-1', bodyClass)}>{children}</div>
      {foot && <div className="mt-4 border-t border-border pt-3.5 geist:border-t-0 geist:pt-0">{foot}</div>}
    </section>
  );
}
/** Lien d'action d'en-tête de carte (« Tout voir › ») */
export function CardLink({ href, onClick, children }: { href?: string; onClick?: () => void } & Children) {
  const cls = 'group inline-flex h-8 items-center gap-0.5 rounded-md px-2 -mr-2 text-[13px] font-semibold text-brand-ink transition-colors hover:bg-accent geist:h-7 geist:text-[12.5px] geist:font-normal geist:text-muted-foreground geist:hover:bg-transparent geist:hover:text-foreground max-sm:h-10';
  const inner = <>{children}<Icon name="chevron" className="size-4 transition-transform group-hover:translate-x-0.5" /></>;
  return href ? <a href={href} className={cls}>{inner}</a> : <button type="button" onClick={onClick} className={cls}>{inner}</button>;
}

export function KV({ rows }: { rows: (false | null | undefined | [React.ReactNode, React.ReactNode])[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,1fr)] text-[14px] geist:text-[13px]">
      {rows.filter(Boolean).map((r, i) => {
        const [k, v] = r as [React.ReactNode, React.ReactNode];
        return (
          <div key={i} className="flex min-h-10 items-baseline gap-3 border-t border-border py-2 first:border-t-0 clair:border-t-0 clair:py-[7px] geist:min-h-0 geist:border-t-0 geist:py-[5px]">
            <dt className="shrink-0 text-muted-foreground geist:w-[42%] geist:max-w-[180px]">{k}</dt>
            <span aria-hidden className="hidden min-w-3 flex-1 translate-y-[-4px] border-b-[1.5px] border-dotted border-border clair:block" />
            <dd className="min-w-0 flex-1 text-right font-medium [overflow-wrap:anywhere] clair:flex-initial clair:font-semibold geist:text-left geist:font-normal">{v ?? '—'}</dd>
          </div>
        );
      })}
    </dl>
  );
}

export function Skeleton({ h = 16, w = '100%', className }: { h?: number; w?: number | string; className?: string }) {
  return <UISkeleton className={cn('rounded-lg bg-muted', className)} style={{ height: h, width: typeof w === 'number' ? `${w}px` : w }} />;
}
export function SkeletonCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return <div className={cn('card-surface p-5 geist:p-0', className)}><div className="grid gap-3"><Skeleton h={18} w="40%" />{Array.from({ length: lines }, (_, i) => <Skeleton key={i} h={14} w={i === lines - 1 ? '70%' : '100%'} />)}</div></div>;
}
export function Empty({ icon = 'info', title, children, action, className }: { icon?: string; title: React.ReactNode; action?: React.ReactNode; className?: string } & Children) {
  return (
    <div className={cn('grid justify-items-center gap-1.5 px-4 py-9 text-center text-sm text-muted-foreground geist:justify-items-start geist:px-0 geist:py-6 geist:text-left geist:text-[13px]', className)}>
      <span className="mb-2 grid size-12 place-items-center rounded-2xl bg-muted text-muted-foreground geist:mb-1 geist:size-auto geist:bg-transparent geist:text-faint"><Icon name={icon} className="size-[22px] geist:size-[18px]" strokeWidth={1.7} /></span>
      <b className="text-[15px] font-semibold text-foreground geist:text-[13.5px] geist:font-medium">{title}</b>
      {children && <span className="max-w-[44ch] leading-relaxed">{children}</span>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}
export function ErrorCard({ error, onRetry }: { error: any; onRetry?: () => void }) {
  return <div className="card-surface"><Empty icon="alert" title="Impossible de charger ces données" action={onRetry && <Btn kind="soft" size="sm" onClick={onRetry}>Réessayer</Btn>}>{errMsg(error)}</Empty></div>;
}
export function Note({ className, children }: { className?: string } & Children) {
  return <p className={cn('text-[13px] leading-relaxed text-muted-foreground geist:text-[12.5px]', className)}>{children}</p>;
}
export function SectionTitle({ children, className }: { className?: string } & Children) {
  return <div className={cn('mb-2.5 mt-6 px-1 text-[12px] font-semibold uppercase tracking-[0.07em] text-muted-foreground geist:mb-2 geist:mt-8 geist:px-0 geist:text-[12.5px] geist:font-medium geist:normal-case geist:tracking-normal', className)}>{children}</div>;
}

// ═════════════ Boutons ═════════════
type BtnKind = 'go' | 'soft' | 'ghost' | 'plain' | 'danger' | 'danger-ghost' | 'brand';
const KIND: Record<BtnKind, { variant: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive'; cls?: string }> = {
  go: { variant: 'default' },
  brand: { variant: 'default', cls: 'bg-brand text-brand-foreground hover:bg-brand/90' },
  soft: { variant: 'secondary', cls: 'geist:bg-selected geist:text-foreground geist:shadow-none geist:hover:bg-[color-mix(in_oklab,var(--foreground)_10%,transparent)]' },
  ghost: { variant: 'outline', cls: 'bg-transparent shadow-none geist:border-0 geist:text-muted-foreground geist:hover:bg-selected geist:hover:text-foreground' },
  plain: { variant: 'ghost', cls: 'text-brand-ink geist:text-foreground' },
  danger: { variant: 'destructive' },
  'danger-ghost': { variant: 'ghost', cls: 'text-danger hover:bg-danger-soft hover:text-danger' },
};
/** Bouton qui gère seul son état « en cours » quand onClick renvoie une promesse ; confirm = dialogue préalable */
export function Btn({ kind = 'go', size, onClick, children, disabled, icon, type = 'button', className, title, confirm, block }: {
  kind?: BtnKind; size?: 'sm' | 'xs' | 'lg'; onClick?: (e: React.MouseEvent) => unknown; disabled?: boolean; icon?: string; type?: 'button' | 'submit';
  className?: string; title?: string; confirm?: ConfirmOpts | (() => ConfirmOpts); block?: boolean;
} & Children) {
  const [busy, setBusy] = useState(false);
  const run = async (e: React.MouseEvent) => {
    if (!onClick || busy) return;
    if (confirm && !(await confirmDialog(typeof confirm === 'function' ? confirm() : confirm))) return;
    const r = onClick(e) as any;
    if (r && typeof r.then === 'function') { setBusy(true); try { await r; } catch { /* toast déjà affiché */ } finally { setBusy(false); } }
  };
  const k = KIND[kind];
  const sz = size === 'xs' ? 'h-7 px-2.5 text-[12.5px] gap-1.5 max-sm:h-10 geist:h-[26px] geist:px-2 geist:max-sm:h-10' : size === 'sm' ? 'h-8 px-3 text-[13px] gap-1.5 max-sm:h-10 geist:h-7 geist:px-2.5 geist:text-[12.5px] geist:max-sm:h-10 geist:max-sm:text-[13.5px]' : size === 'lg' ? 'h-11 px-5 text-[15px] geist:h-10 geist:text-[14px]' : 'h-9 px-4 text-[14px] max-sm:h-11 geist:h-8 geist:px-3 geist:text-[13px] geist:max-sm:h-11 geist:max-sm:text-[14px]';
  return (
    <Button data-btn="" type={type} title={title} variant={k.variant} disabled={disabled || busy} aria-busy={busy || undefined} onClick={run}
      className={cn('rounded-[10px] font-medium clair:font-semibold clair:rounded-[12px] geist:rounded-md geist:shadow-none', sz, k.cls, block && 'w-full', className)}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : icon && <Icon name={icon} className={size === 'xs' ? 'size-3.5' : 'size-4'} />}
      {children}
    </Button>
  );
}
export function Tip({ label, children, side = 'bottom' }: { label: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' } & Children) {
  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content side={side} sideOffset={8} collisionPadding={8}
          className="z-[70] max-w-[260px] rounded-md bg-foreground px-2.5 py-1.5 text-[12px] font-medium text-background shadow-pop geist:glass geist:px-2 geist:py-1 geist:font-normal geist:text-foreground data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          {label}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
export const IconBtn = React.forwardRef<HTMLButtonElement, { icon: string; label: string; onClick?: (e: React.MouseEvent) => void; className?: string; disabled?: boolean; tip?: boolean; pressed?: boolean; size?: 'sm' | 'md' } & Children>(
  function IconBtn({ icon, label, onClick, className, disabled, tip = true, pressed, size = 'md', children }, ref) {
    const b = (
      <button ref={ref} type="button" aria-label={label} aria-pressed={pressed} onClick={onClick} disabled={disabled}
        className={cn('relative inline-grid shrink-0 place-items-center rounded-[10px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-40 geist:rounded-md geist:hover:bg-selected',
          size === 'sm' ? 'size-8 max-sm:size-10 geist:size-7 geist:max-sm:size-10' : 'size-9 max-sm:size-11 geist:size-8 geist:max-sm:size-11', className)}>
        <Icon name={icon} className={size === 'sm' ? 'size-4' : 'size-[18px]'} />{children}
      </button>
    );
    return tip ? <Tip label={label}>{b}</Tip> : b;
  });

// ═════════════ Interrupteurs ═════════════
export function Switch({ checked, onChange, disabled, label }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean; label?: string }) {
  return (
    <SwitchPrimitive.Root checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label}
      className={cn('group relative inline-flex shrink-0 cursor-pointer items-center rounded-full outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-45',
        'h-[30px] w-[50px] p-[3px] bg-[color-mix(in_oklab,var(--foreground)_16%,transparent)] data-[state=checked]:bg-brand',
        'geist:h-[18px] geist:w-[30px] geist:p-[2px] geist:data-[state=checked]:bg-foreground geist:max-sm:h-[28px] geist:max-sm:w-[48px] geist:max-sm:p-[3px]',
        'before:absolute before:-inset-x-1 before:-inset-y-2 before:content-[""] geist:before:-inset-x-2 geist:before:-inset-y-3')}>
      <SwitchPrimitive.Thumb className={cn('pointer-events-none block size-6 rounded-full bg-white shadow-[0_2px_6px_rgba(0,0,0,.22),0_0_0_.5px_rgba(0,0,0,.04)] transition-transform duration-300 ease-[cubic-bezier(.22,1,.36,1)] data-[state=checked]:translate-x-5',
        'geist:size-[14px] geist:shadow-none geist:data-[state=checked]:translate-x-3 geist:data-[state=checked]:bg-background geist:max-sm:size-[22px] geist:max-sm:data-[state=checked]:translate-x-5')} />
    </SwitchPrimitive.Root>
  );
}
/** Interrupteur relié à une écriture : optimiste, revient en arrière si la Bbox refuse */
export function Toggle({ value, onChange, label, disabled, confirm }: { value: boolean; onChange: (v: boolean) => unknown; label?: string; disabled?: boolean; confirm?: ConfirmOpts | ((nv: boolean) => ConfirmOpts | null) }) {
  const [v, setV] = useState(!!value);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!busy) setV(!!value); }, [value]);
  const flip = async (nv: boolean) => {
    if (busy) return;
    if (confirm) { const c = typeof confirm === 'function' ? confirm(nv) : confirm; if (c && !(await confirmDialog(c))) return; }
    setV(nv); setBusy(true);
    try { await onChange(nv); } catch { setV(!nv); } finally { setBusy(false); }
  };
  return <span className={cn('inline-flex', busy && 'opacity-70')}><Switch checked={v} onChange={flip} disabled={disabled || busy} label={label} /></span>;
}
export function ToggleRow({ title, sub, value, onChange, disabled, confirm, children }: { title: React.ReactNode; sub?: React.ReactNode; value: boolean; onChange: (v: boolean) => unknown; disabled?: boolean; confirm?: any } & Children) {
  return (
    <div className="flex min-h-[60px] items-center gap-4 border-t border-border py-3 first:border-t-0 geist:min-h-12 geist:border-t-0 geist:py-2.5">
      <div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium clair:font-semibold geist:text-[13.5px]">{title}</div>{sub && <div className="mt-0.5 text-[13px] leading-snug text-muted-foreground geist:text-[12.5px]">{sub}</div>}{children}</div>
      <Toggle value={value} onChange={onChange} label={typeof title === 'string' ? title : undefined} disabled={disabled} confirm={confirm} />
    </div>
  );
}

// ═════════════ Contrôles segmentés & onglets ═════════════
export type Opt = { v: any; l: React.ReactNode; s?: React.ReactNode; disabled?: boolean; n?: number | null; icon?: string };
/** Contrôle segmenté : pastille qui glisse (layout Motion), flèches clavier, défilement horizontal si trop large */
export function Seg({ options, value, onChange, block = false, label, size }: { options: Opt[]; value: any; onChange: (v: any) => void; block?: boolean; label?: string; size?: 'sm' }) {
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = wrap.current, btn = el?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (el && btn && el.scrollWidth > el.clientWidth) el.scrollTo({ left: Math.max(0, btn.offsetLeft - el.clientWidth / 2 + btn.offsetWidth / 2), behavior: 'smooth' });
  }, [value]);
  // fondu sur le bord qui cache encore des options (défilement horizontal sur iPhone)
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const upd = () => {
      const over = el.scrollWidth > el.clientWidth + 1;
      el.dataset.fs = over && el.scrollLeft > 2 ? '1' : '';
      el.dataset.fe = over && el.scrollLeft + el.clientWidth < el.scrollWidth - 2 ? '1' : '';
    };
    upd();
    el.addEventListener('scroll', upd, { passive: true });
    const ro = new ResizeObserver(upd); ro.observe(el);
    return () => { el.removeEventListener('scroll', upd); ro.disconnect(); };
  }, []);
  const key = (e: React.KeyboardEvent) => {
    const i = options.findIndex((o) => String(o.v) === String(value));
    const n = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (n === null) return;
    e.preventDefault();
    const o = options[(n + options.length) % options.length];
    onChange(o.v);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLElement>(`[data-v="${CSS.escape(String(o.v))}"]`)?.focus());
  };
  return (
    <div ref={wrap} role="radiogroup" aria-label={label} onKeyDown={key}
      className={cn('no-scrollbar relative inline-flex max-w-full shrink-0 overflow-x-auto rounded-[12px] bg-secondary p-[3px] align-middle geist:gap-0.5 geist:rounded-md geist:bg-transparent geist:p-0', block && 'flex w-full')}>
      {options.map((o) => {
        const on = String(o.v) === String(value);
        return (
          <button key={String(o.v)} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-v={o.v} disabled={o.disabled} onClick={() => onChange(o.v)}
            className={cn('relative z-0 inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-[9px] px-3.5 font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/50 geist:rounded-md geist:px-2.5',
              size === 'sm' ? 'h-7 px-2.5 text-[12.5px] max-sm:h-10 geist:h-[26px] geist:max-sm:h-10' : 'h-8 text-[13.5px] max-sm:h-10 geist:h-7 geist:text-[13px] geist:max-sm:h-10', block && 'flex-1 geist:bg-field',
              on ? 'text-foreground' : 'text-[color-mix(in_oklab,var(--muted-foreground)_75%,var(--foreground))] hover:text-foreground')}>
            {on && <motion.span layoutId={'seg-' + id} className="absolute inset-0 -z-10 rounded-[9px] bg-card shadow-[0_1px_3px_rgba(0,0,0,.1),0_0_0_.5px_rgba(0,0,0,.04)] geist:rounded-md geist:bg-[color-mix(in_oklab,var(--foreground)_9%,transparent)] geist:shadow-none" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            {o.icon && <Icon name={o.icon} className="size-3.5" />}{o.l}
          </button>
        );
      })}
    </div>
  );
}
/** Onglets de page, soulignement animé */
export function Tabs({ tabs, value, onChange, label }: { tabs: Opt[]; value: any; onChange: (v: any) => void; label?: string }) {
  const id = useId();
  return (
    <div role="tablist" aria-label={label} className="no-scrollbar enter relative mb-5 flex gap-1 overflow-x-auto border-b border-border geist:mb-7 geist:gap-0.5 geist:border-b-0">
      {tabs.map((t) => {
        const on = t.v === value;
        return (
          <button key={String(t.v)} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.v)}
            className={cn('relative inline-flex h-11 items-center gap-2 whitespace-nowrap px-3 text-[14px] font-medium outline-none transition-colors focus-visible:text-foreground geist:isolate geist:h-8 geist:px-2.5 geist:text-[13px] geist:max-sm:h-10', on ? 'text-foreground' : 'text-[color-mix(in_oklab,var(--muted-foreground)_75%,var(--foreground))] hover:text-foreground')}>
            {t.icon && <Icon name={t.icon} className="size-4" />}{t.l}
            {t.n != null && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-secondary px-1.5 text-[11px] font-semibold tabular-nums text-foreground geist:h-auto geist:min-w-0 geist:bg-transparent geist:px-0 geist:text-[12px] geist:font-normal geist:text-muted-foreground">{t.n}</span>}
            {on && <motion.span layoutId={'tab-' + id} className="absolute inset-x-2 -bottom-px h-[2px] rounded-full bg-foreground clair:bg-brand geist:inset-0 geist:-z-10 geist:h-auto geist:rounded-md geist:bg-selected" transition={{ type: 'spring', stiffness: 480, damping: 40 }} />}
          </button>
        );
      })}
    </div>
  );
}

// ═════════════ Champs ═════════════
export function Field({ label, help, error, children, htmlFor }: { label?: React.ReactNode; help?: React.ReactNode; error?: React.ReactNode; htmlFor?: string } & Children) {
  return (
    <div className="grid min-w-0 gap-2 geist:gap-1.5">
      {label && <label htmlFor={htmlFor} className="text-[13.5px] font-medium text-foreground clair:font-semibold geist:text-[12.5px] geist:text-muted-foreground">{label}</label>}
      {children}
      {error ? <div role="alert" className="flex items-center gap-1.5 text-[13px] font-medium text-danger"><Icon name="alert" className="size-3.5" />{error}</div> : help && <div className="text-[12.5px] leading-snug text-muted-foreground">{help}</div>}
    </div>
  );
}
const inputCls = 'h-10 w-full min-w-0 rounded-[11px] border border-input bg-card px-3 text-[15px] text-foreground shadow-[0_1px_2px_rgba(0,0,0,.03)] outline-none transition-[box-shadow,border-color] placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25 aria-invalid:border-danger aria-invalid:ring-danger/20 disabled:opacity-50 max-sm:h-11 max-sm:text-base clair:bg-surface geist:h-8 geist:rounded-md geist:border-0 geist:bg-field geist:px-2.5 geist:text-[13.5px] geist:shadow-none geist:focus-visible:ring-1 geist:focus-visible:ring-[color-mix(in_oklab,var(--foreground)_28%,transparent)] geist:max-sm:h-11 geist:max-sm:text-base';
export function Input({ value, onInput, type = 'text', placeholder, bad, icon, suffix, className, ...rest }: { value: any; onInput: (v: string) => void; type?: string; placeholder?: string; bad?: boolean; icon?: string; suffix?: React.ReactNode; className?: string } & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onInput' | 'type'>) {
  const el = <input className={cn(inputCls, icon && 'pl-10 geist:!pl-8', suffix && 'pr-14 geist:!pr-12', className)} type={type} value={value ?? ''} placeholder={placeholder} aria-invalid={bad || undefined} onChange={(e) => onInput(e.target.value)} {...rest} />;
  if (!icon && !suffix) return el;
  return (
    <div className="relative min-w-0">
      {icon && <Icon name={icon} className="pointer-events-none absolute left-3 top-1/2 size-[18px] -translate-y-1/2 text-muted-foreground geist:left-2.5 geist:size-[15px]" />}
      {el}
      {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-muted-foreground">{suffix}</span>}
    </div>
  );
}
export function PasswordInput({ value, onInput, placeholder, autoComplete = 'new-password', bad }: { value: string; onInput: (v: string) => void; placeholder?: string; autoComplete?: string; bad?: boolean }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative min-w-0">
      <input className={cn(inputCls, 'pr-12 font-mono tracking-wide')} type={show ? 'text' : 'password'} value={value ?? ''} placeholder={placeholder} autoComplete={autoComplete} autoCapitalize="off" spellCheck={false} aria-invalid={bad || undefined} onChange={(e) => onInput(e.target.value)} />
      <div className="absolute right-1 top-1/2 -translate-y-1/2"><IconBtn icon={show ? 'eyeoff' : 'eye'} label={show ? 'Masquer' : 'Afficher'} size="sm" tip={false} onClick={() => setShow(!show)} /></div>
    </div>
  );
}
export function Select({ value, onChange, options, placeholder, label }: { value: any; onChange: (v: string) => void; options: Opt[]; placeholder?: string; label?: string }) {
  const has = options.some((o) => String(o.v) === String(value) && o.v !== '');
  return (
    <SelectPrimitive.Root value={has ? String(value) : undefined} onValueChange={onChange}>
      <SelectPrimitive.Trigger aria-label={label} className={cn(inputCls, 'flex items-center justify-between gap-2 text-left data-[placeholder]:text-muted-foreground')}>
        <span className="truncate"><SelectPrimitive.Value placeholder={placeholder || (options.find((o) => o.v === '')?.l as string) || 'Choisir…'} /></span>
        <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content position="popper" sideOffset={6} collisionPadding={8}
          className="z-[80] max-h-[min(360px,var(--radix-select-content-available-height))] w-[var(--radix-select-trigger-width)] min-w-[220px] overflow-hidden rounded-xl border border-[var(--card-border)] bg-popover text-popover-foreground shadow-pop geist:glass geist:rounded-lg geist:border-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0">
          <SelectPrimitive.Viewport className="scroll-y p-1">
            {options.filter((o) => o.v !== '').map((o) => (
              <SelectPrimitive.Item key={String(o.v)} value={String(o.v)} disabled={o.disabled}
                className="relative flex min-h-9 cursor-pointer select-none items-center rounded-lg py-2 pl-3 pr-8 text-[14px] outline-none data-[disabled]:opacity-40 data-[highlighted]:bg-accent max-sm:min-h-11 geist:min-h-8 geist:rounded-md geist:py-1.5 geist:pl-2.5 geist:text-[13px] geist:data-[highlighted]:bg-selected geist:max-sm:min-h-11">
                <SelectPrimitive.ItemText>{o.l}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-2.5"><Check className="size-4 text-brand" /></SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
/** Curseur avec graduations ; onCommit au relâchement (écriture) */
export function Range({ value, onChange, min = 0, max = 100, step = 1, label, format = (v: number) => String(v), ticks, disabled, onCommit }: {
  value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; label?: React.ReactNode; format?: (v: number) => React.ReactNode; ticks?: { v: number; l: React.ReactNode }[]; disabled?: boolean; onCommit?: (v: number) => void;
}) {
  return (
    <div className="grid gap-2.5">
      {label && <div className="flex items-baseline justify-between gap-3 text-[13.5px]"><span className="font-medium clair:font-semibold">{label}</span><b className="num font-semibold text-foreground">{format(Number(value))}</b></div>}
      <SliderPrimitive.Root value={[Number(value)]} min={min} max={max} step={step} disabled={disabled} onValueChange={(v) => onChange(v[0])} onValueCommit={(v) => onCommit?.(v[0])}
        className="relative flex h-6 w-full touch-none select-none items-center data-[disabled]:opacity-50 max-sm:h-10">
        <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--foreground)_12%,transparent)]">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-brand geist:bg-foreground" />
        </SliderPrimitive.Track>
        <SliderPrimitive.Thumb aria-label={typeof label === 'string' ? label : undefined} className="block size-5 cursor-grab rounded-full border border-black/5 bg-white shadow-[0_1px_4px_rgba(0,0,0,.25)] outline-none transition-[box-shadow,transform] hover:scale-105 focus-visible:ring-4 focus-visible:ring-ring/30 active:cursor-grabbing active:scale-110 max-sm:size-6" />
      </SliderPrimitive.Root>
      {ticks && (
        <div className="relative mx-2.5 h-4 text-[11.5px] tabular-nums text-muted-foreground" aria-hidden>
          {ticks.map((t, i) => (
            <span key={i} className={cn('absolute top-0 whitespace-nowrap -translate-x-1/2 transition-colors', Number(t.v) === Number(value) && 'font-semibold text-foreground', i === 0 && 'translate-x-[-10px]', i === ticks.length - 1 && 'translate-x-[calc(-100%+10px)]')}
              style={{ left: `${((t.v - min) / (max - min || 1)) * 100}%` }}>{t.l}</span>
          ))}
        </div>
      )}
    </div>
  );
}
export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: React.ReactNode; disabled?: boolean }) {
  return (
    <label className={cn('inline-flex min-h-10 cursor-pointer select-none items-center gap-2.5 text-[14px]', disabled && 'opacity-50')}>
      <input type="checkbox" className="peer sr-only" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="grid size-[18px] place-items-center rounded-[6px] text-transparent shadow-[inset_0_0_0_1.5px_var(--input)] transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-none peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40 geist:rounded-[5px]">
        <Check className="size-3" strokeWidth={3.2} />
      </span>
      {label && <span>{label}</span>}
    </label>
  );
}
/** Cartes de choix (durées, options) */
export function Choices({ options, value, onChange, label, cols = 3 }: { options: Opt[]; value: any; onChange: (v: any) => void; label?: string; cols?: number }) {
  return (
    <div role="radiogroup" aria-label={label} className="grid gap-2" style={{ gridTemplateColumns: `repeat(auto-fit, minmax(${cols === 2 ? 140 : 108}px, 1fr))` }}>
      {options.map((o) => {
        const on = o.v === value;
        return (
          <button key={String(o.v)} type="button" role="radio" aria-checked={on} onClick={() => onChange(o.v)}
            className={cn('relative grid min-h-14 gap-0.5 rounded-xl border px-3.5 py-3 text-left outline-none transition-[border-color,background-color,box-shadow,color] focus-visible:ring-[3px] focus-visible:ring-ring/30 geist:min-h-12 geist:rounded-md geist:border-0 geist:px-3 geist:py-2.5',
              on ? 'border-brand bg-brand-soft shadow-[0_0_0_1px_var(--brand)] geist:bg-foreground geist:text-background geist:shadow-none' : 'border-border bg-card hover:border-[color-mix(in_oklab,var(--border)_50%,var(--foreground))] geist:bg-field geist:hover:bg-selected')}>
            <b className="text-[14px] font-semibold geist:text-[13.5px] geist:font-medium">{o.l}</b>
            {o.s && <small className={cn('text-[12.5px] text-muted-foreground geist:text-[12px]', on && 'geist:text-[color-mix(in_oklab,var(--background)_68%,transparent)]')}>{o.s}</small>}
            {on && <motion.span initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="absolute right-2.5 top-2.5 grid size-[18px] place-items-center rounded-full bg-brand text-brand-foreground geist:hidden"><Check className="size-3" strokeWidth={3} /></motion.span>}
          </button>
        );
      })}
    </div>
  );
}
export function Secret({ value, mask = true }: { value?: string; mask?: boolean }) {
  const [show, setShow] = useState(!mask);
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(value || ''); setCopied(true); toast('Copié dans le presse-papiers'); setTimeout(() => setCopied(false), 1500); } catch { toast('Copie impossible', 'err'); } };
  return (
    <div className="flex min-w-0 items-center gap-1 font-mono text-[15px] tracking-wide geist:text-[13.5px]">
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{show ? value || '—' : '•'.repeat(Math.min(16, String(value || '').length || 10))}</span>
      <IconBtn icon={show ? 'eyeoff' : 'eye'} label={show ? 'Masquer' : 'Afficher'} size="sm" onClick={() => setShow(!show)} />
      <IconBtn icon={copied ? 'check' : 'copy'} label="Copier" size="sm" onClick={copy} />
    </div>
  );
}
export function QR({ text, label = 'QR code', size = 168, className }: { text: string; label?: string; size?: number; className?: string }) {
  const svg = useMemo(() => {
    if (!text) return '';
    const q = qrcode(0, 'M'); q.addData(text, 'Byte'); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  }, [text]);
  return <div role="img" aria-label={label} className={cn('rounded-xl bg-white p-3 text-black [&_svg]:block [&_svg]:h-full [&_svg]:w-full', className)} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}
export type Tone = '' | 'ok' | 'warn' | 'danger' | 'brand' | 'off';
export function Chip({ tone = '', dot, children, className }: { tone?: Tone; dot?: boolean; className?: string } & Children) {
  const t = { '': 'bg-secondary text-secondary-foreground', ok: 'bg-ok-soft text-ok', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', brand: 'bg-brand-soft text-brand-ink', off: 'bg-secondary text-muted-foreground' }[tone];
  return (
    <span className={cn('inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-semibold geist:h-[22px] geist:px-2 geist:font-medium', t, className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" />}{children}
    </span>
  );
}
export function StatusChip({ on, onLabel = 'Actif', offLabel = 'Inactif' }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return <Chip tone={on ? 'ok' : 'off'} dot>{on ? onLabel : offLabel}</Chip>;
}

// ═════════════ Tableau de données ═════════════
export type Col<R> = { key: string; label: React.ReactNode; render?: (r: R) => React.ReactNode; sort?: (r: R) => any; align?: 'r' | 'c'; className?: string };
/** Tableau triable sur bureau, liste sur mobile */
export function DataTable<R>({ rows, columns, rowKey = (_r: R, i: number) => i, onRow, mobile, initialSort, dim, empty }: {
  rows: R[]; columns: Col<R>[]; rowKey?: (r: R, i: number) => React.Key; onRow?: (r: R) => void; mobile?: (r: R) => React.ReactNode; initialSort?: { key: string; dir: 'asc' | 'desc' }; dim?: (r: R) => boolean; empty?: React.ReactNode;
}) {
  const isM = useMobile();
  const [sort, setSort] = useState(initialSort || null);
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    if (!col?.sort) return rows;
    const val = col.sort;
    return [...rows].sort((a, b) => { const x = val(a), y = val(b); const r = typeof x === 'string' ? x.localeCompare(y, 'fr', { numeric: true }) : (x ?? -Infinity) - (y ?? -Infinity); return sort.dir === 'asc' ? r : -r; });
  }, [rows, sort?.key, sort?.dir]);
  if (!rows.length) return <>{empty || null}</>;
  if (isM && mobile) return <div className="grid grid-cols-[minmax(0,1fr)]">{sorted.map((r, i) => <React.Fragment key={rowKey(r, i)}>{mobile(r)}</React.Fragment>)}</div>;
  const toggle = (c: Col<R>) => { if (!c.sort) return; setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: c.align === 'r' ? 'desc' : 'asc' })); };
  return (
    <div className="scroll-x overflow-x-auto geist:-mx-2">
      <table className="w-full border-collapse text-[14px] geist:text-[13px]">
        <thead>
          <tr className="border-b border-border geist:border-b-0">
            {columns.map((c) => (
              <th key={c.key} scope="col" onClick={() => toggle(c)} aria-sort={sort?.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                className={cn('h-10 whitespace-nowrap px-4 text-left text-[12.5px] font-medium text-muted-foreground first:pl-5 last:pr-5 geist:h-8 geist:px-3 geist:text-[12px] geist:first:pl-2 geist:last:pr-2',
                  c.align === 'r' && 'text-right', c.align === 'c' && 'text-center', c.sort && 'cursor-pointer select-none hover:text-foreground', sort?.key === c.key && 'text-foreground', c.className)}>
                <span className="inline-flex items-center gap-1">{c.label}{c.sort && sort?.key === c.key && <Icon name="down" className={cn('size-3.5 transition-transform', sort.dir === 'asc' && 'rotate-180')} />}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={rowKey(r, i)} onClick={onRow ? () => onRow(r) : undefined} tabIndex={onRow ? 0 : undefined} onKeyDown={onRow ? (e) => e.key === 'Enter' && onRow(r) : undefined}
              className={cn('border-b border-border transition-colors last:border-b-0 geist:border-b-0 geist:[&>td:first-child]:rounded-l-md geist:[&>td:last-child]:rounded-r-md', onRow && 'cursor-pointer outline-none hover:bg-accent/60 focus-visible:bg-accent geist:hover:bg-transparent geist:focus-visible:bg-transparent geist:[&:hover>td]:bg-hover geist:[&:focus-visible>td]:bg-selected', dim?.(r) && '[&_td]:text-muted-foreground')}>
              {columns.map((c) => <td key={c.key} className={cn('h-14 px-4 align-middle first:pl-5 last:pr-5 geist:h-10 geist:px-3 geist:first:pl-2 geist:last:pr-2', c.align === 'r' && 'text-right', c.align === 'c' && 'text-center', c.className)}>{c.render ? c.render(r) : (r as any)[c.key]}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
/** Rangée de liste (mobile et listes simples) */
export function Row({ onClick, children, className, as }: { onClick?: () => void; className?: string; as?: 'a'; href?: string } & Children & { href?: string }) {
  const cls = cn('flex min-h-[60px] min-w-0 items-center gap-3 border-t border-border px-5 py-2.5 first:border-t-0 max-sm:px-4 geist:min-h-10 geist:gap-2.5 geist:rounded-md geist:border-t-0 geist:px-2 geist:py-1.5 geist:max-sm:min-h-12', onClick && 'cursor-pointer outline-none transition-colors hover:bg-accent/60 focus-visible:bg-accent active:bg-accent geist:hover:bg-hover geist:focus-visible:bg-selected geist:active:bg-selected', className);
  return <div role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined} onClick={onClick} onKeyDown={onClick ? (e) => (e.key === 'Enter' || e.key === ' ') && onClick() : undefined} className={cls}>{children}</div>;
}
export function Avatar({ icon, on, paused, size = 'md', tone }: { icon: string; on?: boolean; paused?: boolean; size?: 'sm' | 'md' | 'lg'; tone?: Tone }) {
  const s = size === 'sm' ? 'size-9 rounded-[11px] [&>svg]:size-4 geist:size-7 geist:rounded-md geist:[&>svg]:size-[15px]' : size === 'lg' ? 'size-14 rounded-2xl [&>svg]:size-7 geist:size-11 geist:rounded-lg geist:[&>svg]:size-[22px]' : 'size-10 rounded-xl [&>svg]:size-5 geist:size-8 geist:rounded-md geist:[&>svg]:size-[17px]';
  const t = tone === 'ok' ? 'bg-ok-soft text-ok' : tone === 'warn' ? 'bg-warn-soft text-warn' : tone === 'danger' ? 'bg-danger-soft text-danger' : tone === 'brand' ? 'bg-brand-soft text-brand-ink' : 'bg-secondary text-[color-mix(in_oklab,var(--foreground)_80%,var(--brand))] geist:bg-selected geist:text-muted-foreground';
  return (
    <span className={cn('relative grid shrink-0 place-items-center', s, t)}>
      <Icon name={icon} />
      {(on !== undefined || paused) && <span className={cn('absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card geist:size-2.5 geist:border-background', paused ? 'bg-warn' : on ? 'bg-ok' : 'bg-[color-mix(in_oklab,var(--muted-foreground)_55%,var(--card))]')} />}
    </span>
  );
}

// ═════════════ Formulaire générique (feuille) ═════════════
export type FieldDef = {
  key: string; label?: string; type?: 'text' | 'number' | 'toggle' | 'select' | 'seg' | 'password' | 'days' | 'time' | 'range' | 'device';
  required?: boolean; validate?: (v: any, vals: any) => string | null | undefined; help?: React.ReactNode | ((vals: any) => React.ReactNode);
  placeholder?: string; inputmode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; suffix?: React.ReactNode; options?: Opt[] | ((vals: any) => Opt[]);
  hidden?: (vals: any) => boolean; default?: any; min?: number; max?: number; step?: number; ticks?: any; format?: (v: number) => React.ReactNode; mode?: 'ip' | 'mac';
};
export function FormSheet({ fields, initial = {}, onSubmit, submitLabel = 'Enregistrer', close, danger, onDelete, deleteLabel = 'Supprimer', intro }: {
  fields: FieldDef[]; initial?: Record<string, any>; onSubmit: (vals: any) => Promise<unknown> | unknown; submitLabel?: string; close: (v?: unknown) => void; danger?: boolean; onDelete?: () => Promise<unknown>; deleteLabel?: string; intro?: React.ReactNode;
}) {
  const [vals, setVals] = useState<Record<string, any>>(() => {
    const v: Record<string, any> = {};
    for (const f of fields) {
      v[f.key] = initial[f.key] ?? f.default ?? (f.type === 'toggle' ? 0 : '');
      if (typeof v[f.key] === 'number' && f.type !== 'toggle' && f.type !== 'range') v[f.key] = String(v[f.key]);
    }
    return v;
  });
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);
  const set = (k: string, x: any) => { setVals((o) => ({ ...o, [k]: x })); setErrors((e) => ({ ...e, [k]: undefined })); };
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const errs: Record<string, string> = {};
    for (const f of fields) {
      if (f.hidden?.(vals)) continue;
      const x = vals[f.key];
      if (f.required && (x === '' || x === undefined || x === null)) errs[f.key] = 'Champ requis';
      else if (f.validate) { const m = f.validate(x, vals); if (m) errs[f.key] = m; }
    }
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try { await onSubmit(vals); close(true); } catch { /* toast affiché */ } finally { setBusy(false); }
  };
  return (
    <>
      <SheetBody>
        <form onSubmit={submit} className="grid gap-5 pt-1.5">
          {intro && <Note className="text-[13.5px]">{intro}</Note>}
          {fields.filter((f) => !f.hidden?.(vals)).map((f) => <FormField key={f.key} f={f} value={vals[f.key]} set={(x) => set(f.key, x)} error={errors[f.key]} vals={vals} />)}
          <button type="submit" hidden />
        </form>
      </SheetBody>
      <SheetFooter>
        {onDelete && <Btn kind="danger-ghost" icon="trash" confirm={{ title: deleteLabel + ' ?', message: 'Cette action est immédiate.', confirm: deleteLabel, tone: 'danger', icon: 'trash' }} onClick={async () => { await onDelete(); close(true); }}>{deleteLabel}</Btn>}
        <span className="flex-1" />
        <Btn kind="ghost" onClick={() => close(false)}>Annuler</Btn>
        <Btn kind={danger ? 'danger' : 'go'} disabled={busy} onClick={() => submit()}>{busy && <Loader2 className="size-4 animate-spin" />}{submitLabel}</Btn>
      </SheetFooter>
    </>
  );
}
function FormField({ f, value, set, error, vals }: { f: FieldDef; value: any; set: (v: any) => void; error?: string; vals: any }) {
  const help = typeof f.help === 'function' ? f.help(vals) : f.help;
  const common = { label: f.label, help, error };
  switch (f.type) {
    case 'toggle': return <div className="flex min-h-12 items-center gap-4"><div className="min-w-0 flex-1"><div className="text-[14.5px] font-medium clair:font-semibold geist:text-[13.5px]">{f.label}</div>{help && <div className="mt-0.5 text-[13px] text-muted-foreground geist:text-[12.5px]">{help}</div>}</div><Switch checked={!!Number(value)} onChange={(x) => set(x ? 1 : 0)} label={f.label} /></div>;
    case 'select': return <Field {...common}><Select value={value} onChange={set} options={typeof f.options === 'function' ? f.options(vals) : f.options || []} label={f.label} /></Field>;
    case 'seg': return <Field {...common}><Seg block value={value} onChange={set} options={(typeof f.options === 'function' ? f.options(vals) : f.options) || []} label={f.label} /></Field>;
    case 'password': return <Field {...common}><PasswordInput value={value} onInput={set} placeholder={f.placeholder} bad={!!error} /></Field>;
    case 'days': return <Field {...common}><DaysPicker value={value} onChange={set} /></Field>;
    case 'time': return <Field {...common}><Input type="time" value={value} onInput={set} bad={!!error} /></Field>;
    case 'range': return <Field help={help} error={error}><Range label={f.label} value={Number(value)} onChange={set} min={f.min} max={f.max} step={f.step} ticks={f.ticks} format={f.format} /></Field>;
    case 'device': return <Field {...common}><DevicePicker value={value} onChange={set} mode={f.mode || 'ip'} /></Field>;
    default: return <Field {...common}><Input value={value} onInput={set} placeholder={f.placeholder} bad={!!error} inputMode={f.inputmode} suffix={f.suffix} type="text" autoCapitalize="off" spellCheck={false} /></Field>;
  }
}
export function DaysPicker({ value = '', onChange }: { value: string; onChange: (v: string) => void }) {
  const set = new Set(String(value).split(',').filter(Boolean));
  const tog = (d: string) => { set.has(d) ? set.delete(d) : set.add(d); onChange(DAYS.map((x) => x.v).filter((x) => set.has(x)).join(',')); };
  const pill = 'grid h-10 place-items-center rounded-[10px] text-[13.5px] font-semibold outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/30 geist:h-9 geist:rounded-md geist:text-[13px] geist:font-medium';
  return (
    <div role="group" className="grid grid-cols-7 gap-1.5">
      {DAYS.map((d) => (
        <button key={d.v} type="button" aria-pressed={set.has(d.v)} aria-label={d.l} onClick={() => tog(d.v)}
          className={cn(pill, set.has(d.v) ? 'bg-primary text-primary-foreground' : 'bg-secondary text-muted-foreground hover:text-foreground geist:bg-field')}>{d.s}</button>
      ))}
      <button type="button" className={cn(pill, 'col-span-3 bg-transparent text-brand-ink hover:bg-accent geist:text-foreground')} onClick={() => onChange('1,2,3,4,5')}>Semaine</button>
      <button type="button" className={cn(pill, 'col-span-4 bg-transparent text-brand-ink hover:bg-accent geist:text-foreground')} onClick={() => onChange('1,2,3,4,5,6,0')}>Tous les jours</button>
    </div>
  );
}
/** Sélection d'un appareil connu (remplit l'IP ou la MAC) + saisie libre */
export function DevicePicker({ value, onChange, mode = 'ip' }: { value: string; onChange: (v: string) => void; mode?: 'ip' | 'mac' }) {
  const { data } = useApi<any>('hosts', { raw: true });
  const hosts = (data?.[0]?.hosts?.list || []).filter((x: any) => x.ipaddress && x.ipaddress !== '0.0.0.0');
  const opts: Opt[] = hosts.sort((a: any, b: any) => b.active - a.active).map((x: any) => ({ v: mode === 'mac' ? x.macaddress : x.ipaddress, l: `${displayName(x)} · ${mode === 'mac' ? x.macaddress : x.ipaddress}${x.active ? '' : ' (hors ligne)'}` }));
  return (
    <div className="grid gap-2">
      <Select value={opts.some((o) => o.v === value) ? value : ''} onChange={(v) => v && onChange(v)} options={opts} placeholder="Choisir un appareil…" />
      <Input value={value} onInput={onChange} placeholder={mode === 'mac' ? 'aa:bb:cc:dd:ee:ff' : '192.168.1.x'} autoCapitalize="off" spellCheck={false} className="font-mono" />
    </div>
  );
}

// ═════════════ Divers ═════════════
/** Tuile compacte (valeur + libellé), utilisée dans les cartes */
export function Tile({ l, v, x, className }: { l: React.ReactNode; v: React.ReactNode; x?: React.ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0 rounded-xl bg-surface px-3.5 py-3 [container-type:inline-size] geist:rounded-none geist:bg-transparent geist:!px-0 geist:py-0', className)}>
      <div className="truncate text-[12px] text-muted-foreground">{l}</div>
      <div className="num mt-0.5 truncate text-[clamp(14px,16cqi,17px)] font-semibold geist:text-[17px] geist:font-medium geist:tracking-[-0.02em]">{v}</div>
      {x && <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{x}</div>}
    </div>
  );
}
export function Banner({ tone = 'info', icon, children, action, className }: { tone?: 'info' | 'warn' | 'danger' | 'ok' | 'neutral'; icon?: string; action?: React.ReactNode; className?: string } & Children) {
  const t = { info: 'bg-brand-soft text-brand-ink', warn: 'bg-warn-soft text-warn', danger: 'bg-danger-soft text-danger', ok: 'bg-ok-soft text-ok', neutral: 'bg-secondary text-foreground' }[tone];
  return (
    <div className={cn('flex items-center gap-3 rounded-xl px-4 py-3 text-[14px] geist:rounded-md geist:px-3 geist:py-2.5 geist:text-[13px]', t, className)}>
      {icon && <Icon name={icon} className="size-[18px]" />}
      <div className="min-w-0 flex-1 [&_b]:font-semibold [&_span]:text-[color-mix(in_oklab,currentColor_80%,var(--foreground))]">{children}</div>
      {action}
    </div>
  );
}
export { SheetBody, SheetFooter };
