// Valeurs privées (adresse IP publique, numéro de la ligne) : floutées quand l'option de confidentialité
// correspondante est active (Apparence → Confidentialité). On n'affiche alors qu'une silhouette floutée,
// sans aucun caractère réel : rien à reconstituer sur une capture. Un clic (ou Entrée) l'affiche 8 secondes.
import * as React from 'react';
import { useEffect, useState } from 'react';
import { useHidden, isPrivateIp, shapeOf, type PrivacyKey } from '@/lib/privacy';
import { cn } from '@/lib/utils';

const LABEL: Record<PrivacyKey, string> = { wan: 'Adresse IP publique floutée', phone: 'Numéro de téléphone flouté' };

function Blurred({ kind, value, className }: { kind: PrivacyKey; value: string; className?: string }) {
  const hidden = useHidden(kind);
  const [peek, setPeek] = useState(false);
  useEffect(() => {
    if (!peek) return;
    const t = setTimeout(() => setPeek(false), 8000);
    return () => clearTimeout(t);
  }, [peek]);
  useEffect(() => { if (!hidden) setPeek(false); }, [hidden]);
  if (!hidden || peek) return <span className={className}>{value}</span>;
  return (
    <button type="button" onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPeek(true); }}
      title={LABEL[kind] + ' : cliquez pour l’afficher quelques secondes'} aria-label={LABEL[kind] + ', afficher'}
      className={cn('m-0 inline cursor-pointer select-none whitespace-nowrap rounded-[0.25em] border-0 bg-transparent p-0 align-baseline [font:inherit] text-inherit outline-none focus-visible:ring-2 focus-visible:ring-ring/50', className)}>
      <span aria-hidden className="pointer-events-none inline-block [filter:blur(0.32em)]">{shapeOf(value)}</span>
    </button>
  );
}

/** Adresse IP publique (WAN) ; une adresse privée (réseau local) n'est jamais floutée */
export function WanIp({ ip, className, fallback = '—' }: { ip?: string | null; className?: string; fallback?: React.ReactNode }) {
  if (!ip) return <>{fallback}</>;
  if (isPrivateIp(ip)) return <span className={className}>{ip}</span>;
  return <Blurred kind="wan" value={ip} className={className} />;
}

/** Numéro de téléphone de la ligne fixe de la Bbox */
export function PhoneNum({ value, className, fallback = '—' }: { value?: string | null; className?: string; fallback?: React.ReactNode }) {
  if (!value) return <>{fallback}</>;
  return <Blurred kind="phone" value={value} className={className} />;
}
