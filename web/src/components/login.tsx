// Connexion minimaliste : logo animé, « Ma Bbox », un champ mot de passe, « Rester connecté ».
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, stagger } from 'motion';
import { Loader2 } from 'lucide-react';
import { Bytel, Icon } from '@/components/icon';
import { panel } from '@/lib/api';
import { toggleTheme, useAppearance } from '@/lib/theme';
import { cn } from '@/lib/utils';

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function Login({ onDone }: { onDone: () => void }) {
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const root = useRef<HTMLElement>(null), field = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null);
  const a = useAppearance();
  useEffect(() => { if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) input.current?.focus({ preventScroll: true }); }, []);
  useLayoutEffect(() => {
    if (reduced() || document.hidden || !root.current) return;
    const els = root.current.querySelectorAll('[data-enter]');
    animate(els, { opacity: [0, 1], transform: ['translateY(12px)', 'translateY(0px)'] }, { duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: stagger(0.08, { startDelay: 0.35 }) });
  }, []);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pw || busy) return;
    setBusy(true); setErr('');
    try { await panel.login(pw, remember); setPw(''); onDone(); }
    catch (ex: any) {
      const b = ex?.body || {};
      setErr(b.error === 'bad_password' ? 'Mot de passe incorrect'
        : b.error === 'bbox_locked' ? 'Trop d’essais : Bbox verrouillée quelques minutes'
        : b.error === 'local_throttle' ? `Réessayez dans ${b.retryIn} s`
        : b.error === 'bbox_unreachable' ? 'Bbox injoignable'
        : 'Connexion impossible');
      if (field.current && !reduced()) animate(field.current, { transform: ['translateX(0px)', 'translateX(-8px)', 'translateX(7px)', 'translateX(-4px)', 'translateX(2px)', 'translateX(0px)'] }, { duration: 0.42 });
      input.current?.select();
    } finally { setBusy(false); }
  }
  return (
    <main ref={root} className="login relative isolate grid min-h-dvh place-items-center overflow-hidden bg-background px-6 py-[max(24px,env(safe-area-inset-top))] text-foreground">
      <div className="login-bg pointer-events-none absolute inset-0 -z-10 geist:hidden" aria-hidden>
        <div className="login-glow" />
        <svg className="login-rings" viewBox="0 0 800 800">{[120, 200, 280, 360].map((r, i) => <circle key={r} cx="400" cy="400" r={r} style={{ animationDelay: `${i * 0.6}s` }} />)}</svg>
      </div>
      <button type="button" onClick={toggleTheme} aria-label={a.theme === 'dark' ? 'Passer en clair' : 'Passer en sombre'}
        className="absolute right-[max(14px,env(safe-area-inset-right))] top-[max(14px,env(safe-area-inset-top))] grid size-10 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-accent hover:text-foreground geist:rounded-md geist:hover:bg-selected">
        <Icon name={a.theme === 'dark' ? 'sun' : 'moon'} className="size-[19px]" />
      </button>
      <form onSubmit={submit} noValidate className="grid w-full max-w-[380px] justify-items-center -translate-y-[8vh] max-sm:-translate-y-[12vh]">
        <Bytel animated className="size-16 geist:size-12" />
        <h1 data-enter className="mb-[30px] mt-[18px] text-[30px] font-semibold leading-none tracking-[-0.035em] geist:mb-7 geist:mt-4 geist:text-[22px] geist:tracking-[-0.02em]">Ma Bbox</h1>
        <input type="text" name="username" value="admin" autoComplete="username" hidden readOnly />
        <div ref={field} data-enter className={cn('relative flex h-14 w-full items-center gap-0.5 rounded-2xl bg-card pl-4 pr-[7px] shadow-[0_0_0_1px_var(--border),0_12px_32px_-14px_rgba(16,32,48,.22)] transition-shadow geist:h-12 geist:rounded-lg geist:bg-field geist:pl-3.5 geist:pr-1.5 geist:shadow-none',
          'focus-within:shadow-[0_0_0_1.5px_var(--brand),0_0_0_5px_color-mix(in_oklab,var(--brand)_20%,transparent),0_12px_32px_-14px_rgba(16,32,48,.22)] geist:focus-within:shadow-[0_0_0_1px_color-mix(in_oklab,var(--foreground)_32%,transparent)]',
          err && '!shadow-[0_0_0_1.5px_var(--danger),0_0_0_5px_color-mix(in_oklab,var(--danger)_20%,transparent)]')}>
          <Icon name="lock" className="size-[18px] text-muted-foreground" />
          <input ref={input} type={show ? 'text' : 'password'} value={pw} onChange={(e) => { setPw(e.target.value); if (err) setErr(''); }}
            placeholder="Mot de passe" aria-label="Mot de passe de la Bbox" aria-invalid={!!err} aria-describedby="login-msg"
            autoComplete="current-password" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="go"
            className={cn('h-full min-w-0 flex-1 bg-transparent pl-2.5 pr-1.5 text-base font-medium outline-none placeholder:font-normal placeholder:text-muted-foreground', !show && pw && 'tracking-[0.16em]')} />
          <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} aria-pressed={show}
            className="grid size-[38px] place-items-center rounded-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground geist:size-9 geist:rounded-md geist:hover:bg-selected"><Icon name={show ? 'eyeoff' : 'eye'} className="size-[18px] geist:size-4" /></button>
          <button type="submit" disabled={!pw || busy} aria-label="Se connecter"
            className="grid size-[42px] place-items-center rounded-xl bg-primary text-primary-foreground transition-[transform,opacity] active:scale-95 disabled:opacity-30 geist:size-9 geist:rounded-md">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Icon name="arrowright" className="size-[18px]" />}
          </button>
        </div>
        <p id="login-msg" role="alert" className="mt-3 min-h-5 text-center text-[13.5px] font-medium text-danger">{err}</p>
        <label data-enter className="relative inline-flex min-h-10 cursor-pointer select-none items-center gap-2.5 px-1.5 text-[13.5px] text-muted-foreground">
          <input type="checkbox" className="peer sr-only" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
          <span className="grid size-[18px] place-items-center rounded-[6px] text-transparent shadow-[inset_0_0_0_1.5px_var(--input)] transition-colors peer-checked:bg-primary peer-checked:text-primary-foreground peer-checked:shadow-none peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/40">
            <Icon name="check" className="size-3" strokeWidth={3.2} />
          </span>
          Rester connecté
        </label>
      </form>
    </main>
  );
}
