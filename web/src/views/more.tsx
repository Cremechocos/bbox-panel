// « Plus » (iPhone) : accès aux autres écrans, apparence, outils, installation sur l'écran d'accueil, déconnexion.
import { PageHead, Card, Seg, Chip, Btn, Note, SectionTitle, Row, Avatar } from '@/components/kit';
import { Icon } from '@/components/icon';
import { openNotifSettings } from '@/components/notify';
import { ROUTES } from '@/lib/routes';
import { useLiveValue } from '@/lib/live';
import { useAppearance, setThemePref, skinOf } from '@/lib/theme';
import { go, type Route } from '@/lib/router';

const DESC: Record<string, string> = {
  stats: 'Consommation, débit, latence, historique', controle: 'Plages horaires Internet, Wi-Fi et veille', reseau: 'DHCP, baux fixes, ports Ethernet, IPv6',
  securite: 'Ports, DMZ, UPnP, pare-feu, accès distant', telephone: 'Ligne, appels, ne pas déranger', diagnostic: 'Tests, fibre, sessions, journal', bbox: 'Matériel, écran, sauvegardes, redémarrage',
};
const TOOLS = [
  { id: 'apparence', icon: 'palette', l: 'Apparence', s: 'Bbox Clair ou Noir Geist' },
  { id: 'carte', icon: 'print', l: 'Carte Wi-Fi', s: 'QR code et mot de passe à imprimer' },
  { id: 'mural', icon: 'expand', l: 'Mode écran mural', s: 'Vue plein écran en temps réel' },
];

function LinkRow({ icon, title, sub, onClick, extra }: { icon: string; title: string; sub?: string; onClick: () => void; extra?: React.ReactNode }) {
  return (
    <Row onClick={onClick}>
      <Avatar icon={icon} size="sm" tone="brand" />
      <div className="min-w-0 flex-1"><div className="truncate text-[15px] font-medium clair:font-semibold">{title}</div>{sub && <div className="truncate text-[13px] text-muted-foreground">{sub}</div>}</div>
      {extra}
      <Icon name="chevron" className="size-[18px] shrink-0 text-muted-foreground" />
    </Row>
  );
}

export default function More({ onLogout }: { route: Route; onLogout?: () => void }) {
  const a = useAppearance();
  const alerts = useLiveValue((s) => s.summary?.alerts?.count || 0);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone;
  const items = ROUTES.filter((r) => !['accueil', 'appareils', 'wifi', 'activite'].includes(r.id));
  return (
    <>
      <PageHead kicker="Ma Bbox" title="Plus" />
      <Card flush>
        {items.map((r) => <LinkRow key={r.id} icon={r.icon} title={r.label} sub={DESC[r.id]} onClick={() => go(r.id)} extra={r.id === 'diagnostic' && alerts > 0 ? <Chip tone="warn">{alerts}</Chip> : null} />)}
      </Card>
      <SectionTitle>Outils</SectionTitle>
      <Card flush>
        {TOOLS.map((t) => <LinkRow key={t.id} icon={t.icon} title={t.l} sub={t.id === 'apparence' ? skinOf(a.skin).name : t.s} onClick={() => go(t.id)} />)}
        <LinkRow icon="bell" title="Notifications" sub="Alertes en temps réel, son, système" onClick={() => openNotifSettings()} />
      </Card>
      <SectionTitle>Mode</SectionTitle>
      <Card>
        <Seg block options={[{ v: 'auto', l: 'Auto' }, { v: 'light', l: 'Clair' }, { v: 'dark', l: 'Sombre' }]} value={a.pref} onChange={setThemePref} label="Clair ou sombre" />
        <Note className="mt-2.5">Apparence actuelle : {skinOf(a.skin).name}.</Note>
      </Card>
      {!standalone && (
        <>
          <SectionTitle>Installer sur l’iPhone</SectionTitle>
          <Card>
            <ol className="grid list-decimal gap-1.5 pl-5 text-[14.5px] marker:text-muted-foreground">
              <li>Ouvrez ce panel dans <b>Safari</b>.</li>
              <li>Touchez <b>Partager</b> <span className="text-muted-foreground">(carré avec une flèche)</span>.</li>
              <li>Choisissez <b>Sur l’écran d’accueil</b>, puis <b>Ajouter</b>.</li>
            </ol>
            <Note className="mt-2.5">L’app s’ouvre alors en plein écran, comme une application native.</Note>
          </Card>
        </>
      )}
      <div className="mt-6"><Btn kind="danger-ghost" size="lg" block icon="logout" onClick={() => onLogout?.()}>Se déconnecter</Btn></div>
      <Note className="mt-3.5 text-center">Panel v3 · serveur local</Note>
    </>
  );
}
