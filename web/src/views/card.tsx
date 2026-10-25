// Carte Wi-Fi à imprimer (ou à montrer) : nom du réseau, mot de passe et QR code.
import * as React from 'react';
import { useEffect, useState } from 'react';
import { Seg, QR, Btn, Banner, type Opt } from '@/components/kit';
import { Bytel } from '@/components/icon';
import { useLive } from '@/lib/live';
import { wifiQrString } from '@/lib/format';
import { go, type Route } from '@/lib/router';

type Net = 'main' | 'mlo' | 'guest';
const netOf = (arg: string): Net => (arg === 'guest' ? 'guest' : arg === 'mlo' ? 'mlo' : 'main');

// La carte est un objet imprimé : encre marine Bouygues Telecom sur fond blanc, quels que soient l'apparence et le thème.
// Les couleurs sont posées en variables locales (dont --logo, lu par <Bytel>).
const CARD_VARS = {
  '--ink': '#132331', '--ink-2': '#5a6d7e', '--logo': '#25465f', '--well': '#f2f5f8', '--edge': '#dce4ea',
  fontFamily: '"Bouygues Read", -apple-system, "SF Pro Text", system-ui, sans-serif',
} as React.CSSProperties;
const DT = 'text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ink-2)]';
const DD = 'mt-1 font-mono text-[18px] font-semibold leading-snug text-[color:var(--ink)] [overflow-wrap:anywhere]';

export default function WifiCard({ route }: { route: Route }) {
  const s = useLive();
  const [net, setNet] = useState<Net>(() => netOf(route.arg));
  useEffect(() => { setNet(netOf(route.arg)); }, [route.arg]);
  useEffect(() => { document.title = 'Carte Wi-Fi · Ma Bbox'; }, []);
  const w = s.wireless?.wireless || {};
  const src = net === 'guest' ? w.ssid?.guest : net === 'mlo' ? w.ssid?.mlo : w.ssid?.['24'];
  const ssid = src?.id || '…';
  const pass = src?.security?.passphrase || '';
  const security = src?.security?.protocol || 'WPA2';
  const opts = ([{ v: 'main', l: 'Principal' }, w.ssid?.mlo && { v: 'mlo', l: 'Wi-Fi 7' }, { v: 'guest', l: 'Invité' }] as (Opt | false)[]).filter(Boolean) as Opt[];
  const guestOff = net === 'guest' && w.ssid?.guest?.enable !== 1;

  return (
    <main className="grid min-h-dvh content-center justify-items-center gap-5 px-4 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(32px+env(safe-area-inset-top))] print:min-h-0 print:p-0">
      <div className="no-print flex max-w-full justify-center">
        <Seg options={opts} value={net} onChange={setNet} label="Réseau" />
      </div>

      {guestOff && (
        <Banner tone="warn" icon="info" className="no-print w-full max-w-[420px] items-start [&>svg]:mt-0.5">
          <span>Le Wi-Fi invité est actuellement désactivé : pensez à l’activer avant de donner la carte.</span>
        </Banner>
      )}

      <article style={CARD_VARS} aria-label={'Carte Wi-Fi · ' + ssid}
        className="enter grid w-full max-w-[420px] break-inside-avoid justify-items-center gap-5 rounded-[28px] bg-white px-7 pb-7 pt-8 text-center text-[color:var(--ink)] shadow-[0_32px_72px_-28px_rgba(0,0,0,.45),0_0_0_1px_rgba(0,0,0,.06)] [-webkit-print-color-adjust:exact] [print-color-adjust:exact] max-[360px]:px-5 print:border print:border-dashed print:border-[color:var(--edge)] print:shadow-none">
        <header className="grid justify-items-center gap-2.5">
          <Bytel className="size-11" />
          <h1 className="text-[28px] font-semibold leading-none tracking-[-0.02em]">Wi-Fi</h1>
        </header>

        {s.wireless
          ? <QR text={wifiQrString({ ssid, passphrase: pass, security })} label={'QR code du réseau ' + ssid} size={240} className="rounded-[20px] p-3.5 ring-1 ring-[color:var(--edge)]" />
          : <div className="size-[240px] animate-pulse rounded-[20px] bg-[color:var(--well)]" aria-hidden />}

        <dl className="w-full overflow-hidden rounded-2xl bg-[color:var(--well)] text-left">
          <div className="px-4 py-3"><dt className={DT}>Réseau</dt><dd className={DD}>{ssid}</dd></div>
          <div className="border-t border-[color:var(--edge)] px-4 py-3"><dt className={DT}>Mot de passe</dt><dd className={DD}>{pass || '—'}</dd></div>
        </dl>

        <p className="max-w-[32ch] text-[12.5px] leading-snug text-[color:var(--ink-2)]">Scannez le QR code avec l’appareil photo pour vous connecter.</p>
      </article>

      <div className="no-print flex flex-wrap justify-center gap-2.5">
        <Btn kind="go" icon="print" onClick={() => window.print()}>Imprimer</Btn>
        <Btn kind="ghost" onClick={() => (history.length > 1 ? history.back() : go('wifi'))}>Retour</Btn>
      </div>
    </main>
  );
}
