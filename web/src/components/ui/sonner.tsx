// Toasts (retours d'action) — sonner, aux couleurs de l'apparence active.
import { CircleCheck, Info, Loader2, OctagonX, TriangleAlert } from 'lucide-react';
import { Toaster as Sonner, type ToasterProps } from 'sonner';
import { useAppearance } from '@/lib/theme';

export function Toaster(props: ToasterProps) {
  const a = useAppearance();
  return (
    <Sonner
      theme={a.theme}
      className="toaster group"
      icons={{
        success: <CircleCheck className="size-[18px] text-ok" />,
        info: <Info className="size-[18px] text-brand" />,
        warning: <TriangleAlert className="size-[18px] text-warn" />,
        error: <OctagonX className="size-[18px] text-danger" />,
        loading: <Loader2 className="size-[18px] animate-spin" />,
      }}
      toastOptions={{ classNames: { toast: 'font-sans !rounded-xl !border-[var(--card-border)] !shadow-pop geist:glass geist:!rounded-lg geist:!border-0 geist:!bg-[var(--glass)] geist:!py-3', title: '!text-[14px] !font-medium geist:!text-[13px]', actionButton: '!bg-primary !text-primary-foreground !rounded-md !font-medium' } }}
      style={{ '--normal-bg': 'var(--popover)', '--normal-text': 'var(--popover-foreground)', '--normal-border': 'var(--card-border)', '--border-radius': 'var(--radius-xl)' } as React.CSSProperties}
      {...props}
    />
  );
}
