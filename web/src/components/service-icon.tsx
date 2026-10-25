// Logo d'un service (Simple Icons, ou dessin maison pour les marques absentes), en couleur de marque.
// tile : pastille arrondie teintée (Bbox Clair) ou neutre (Noir Geist) autour du logo.
import * as React from 'react';
import { Bytel } from '@/components/icon';
import { brandOf } from '@/lib/services';
import { cn } from '@/lib/utils';

function Glyph({ id, name, className }: { id: string; name: string; className?: string }) {
  const b = brandOf(id, name);
  const cls = cn('block shrink-0', className);
  if (b.path) return <svg viewBox="0 0 24 24" className={cls} fill={b.fg} aria-hidden><path d={b.path} /></svg>;
  switch (b.mark) {
    case 'bytel': return <span className={cls} style={{ ['--logo' as string]: b.fg }}><Bytel className="size-full" title={name} /></span>;
    case 'microsoft': return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <rect x="2" y="2" width="9.5" height="9.5" fill="#F25022" /><rect x="12.5" y="2" width="9.5" height="9.5" fill="#7FBA00" />
        <rect x="2" y="12.5" width="9.5" height="9.5" fill="#00A4EF" /><rect x="12.5" y="12.5" width="9.5" height="9.5" fill="#FFB900" />
      </svg>
    );
    case 'amazon': return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden>
        <text x="12" y="14.5" textAnchor="middle" fontSize="17" fontWeight="800" fontFamily="Arial, Helvetica, sans-serif" fill="var(--foreground)">a</text>
        <path d="M4.5 17.2c4.6 2.9 10.4 2.9 15 0" fill="none" stroke={b.fg} strokeWidth="2.2" strokeLinecap="round" />
        <path d="M17.2 15.6l2.6 1.5-1 2.7" fill="none" stroke={b.fg} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
    case 'chatgpt': return (
      <svg viewBox="0 0 24 24" className={cls} aria-hidden fill="none" stroke={b.fg} strokeWidth="1.9">
        {[0, 60, 120].map((r) => <ellipse key={r} cx="12" cy="12" rx="9" ry="4.2" transform={`rotate(${r} 12 12)`} />)}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cls} aria-hidden>
      <rect x="1.5" y="1.5" width="21" height="21" rx="6" fill={b.fg} opacity="0.16" />
      <text x="12" y="16.6" textAnchor="middle" fontSize="13" fontWeight="700" fill={b.fg}>{b.letter}</text>
    </svg>
  );
}

/** size : taille du logo en px ; tile : pastille autour (1,75 × la taille du logo) */
export function ServiceIcon({ id, name, size = 16, tile = false, className }: { id: string; name: string; size?: number; tile?: boolean; className?: string }) {
  const glyph = <Glyph id={id} name={name} className="size-full" />;
  const style = { width: size, height: size } as React.CSSProperties;
  if (!tile) return <span className={cn('inline-grid shrink-0 place-items-center', className)} style={style}>{glyph}</span>;
  const b = brandOf(id, name);
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-[30%] geist:rounded-[26%]', className)}
      style={{ width: size * 1.75, height: size * 1.75, background: `color-mix(in oklab, ${b.fg} 13%, transparent)` }}>
      <span className="grid place-items-center" style={style}>{glyph}</span>
    </span>
  );
}

/** Variante en unités relatives (mode mural) : la taille suit la police du parent */
export function ServiceGlyph({ id, name, className }: { id: string; name: string; className?: string }) {
  return <Glyph id={id} name={name} className={className} />;
}
