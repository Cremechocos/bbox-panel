// Icônes : jeu Lucide (celui de shadcn/ui) derrière les noms historiques du panel, + logo Bouygues Telecom.
import * as React from 'react';
import { useEffect, useRef } from 'react';
import { animate } from 'motion';
import {
  Activity, ArrowDown, ArrowRight, ArrowUp, Bell, Cable, Calendar, ChartColumn, Check, ChevronLeft, ChevronRight, Clock,
  Command, Copy, Cpu, Dot, Ellipsis, EthernetPort, ExternalLink, Eye, EyeOff, Gamepad2, Globe, House, Info, LayoutDashboard,
  Laptop, Lightbulb, Link, ListFilter, Lock, LogOut, Mail, Maximize2, Minimize2, MonitorSmartphone, Moon, Network, Palette,
  Pause, Pencil, Play, Plus, Power, Printer, QrCode, RefreshCw, Router, Save, Search, Shield, Signal, SlidersHorizontal,
  Smartphone, Speaker, Square, Star, Sun, Tablet, Thermometer, Timer, Trash2, TriangleAlert, Tv, Usb, User, UserPlus, Watch,
  Wifi, X, Zap, type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DeviceKind } from '@/lib/format';

export const ICONS: Record<string, LucideIcon> = {
  home: House, devices: MonitorSmartphone, wifi: Wifi, network: Network, shield: Shield, clock: Clock, phone: Smartphone,
  telephone: Smartphone, activity: Activity, box: Router, more: Ellipsis, chevron: ChevronRight, back: ChevronLeft, check: Check,
  x: X, plus: Plus, trash: Trash2, edit: Pencil, eye: Eye, eyeoff: EyeOff, copy: Copy, refresh: RefreshCw, power: Power,
  search: Search, ethernet: EthernetPort, laptop: Laptop, mobile: Smartphone, tablet: Tablet, tv: Tv, watch: Watch,
  speaker: Speaker, printer: Printer, game: Gamepad2, homeauto: Lightbulb, generic: MonitorSmartphone, down: ArrowDown,
  up: ArrowUp, alert: TriangleAlert, lock: Lock, globe: Globe, qr: QrCode, sun: Sun, moon: Moon, logout: LogOut, bolt: Zap,
  thermo: Thermometer, cpu: Cpu, fiber: Cable, usb: Usb, save: Save, mail: Mail, play: Play, stop: Square, link: Link,
  sliders: SlidersHorizontal, external: ExternalLink, info: Info, bell: Bell, star: Star, starfill: Star, pause: Pause,
  chart: ChartColumn, palette: Palette, expand: Maximize2, shrink: Minimize2, command: Command, timer: Timer,
  arrowright: ArrowRight, filter: ListFilter, calendar: Calendar, user: User, userplus: UserPlus, signal: Signal,
  layout: LayoutDashboard, print: Printer, zap: Zap, dot: Dot, landline: Smartphone,
};
export const KIND_ICON: Record<DeviceKind, string> = { phone: 'mobile', watch: 'watch', laptop: 'laptop', tablet: 'tablet', tv: 'tv', speaker: 'speaker', printer: 'printer', game: 'game', home: 'homeauto', generic: 'devices' };

export function Icon({ name, className, size, strokeWidth = 1.9, ...rest }: { name: string; className?: string; size?: number; strokeWidth?: number } & Omit<React.SVGProps<SVGSVGElement>, 'ref'>) {
  const C = ICONS[name] || Info;
  return <C className={cn('shrink-0', name === 'starfill' && 'fill-current', className)} size={size} strokeWidth={strokeWidth} aria-hidden {...(rest as any)} />;
}

// ── Logo Bouygues Telecom (tracé repris des ressources servies par la Bbox) ──
const BYTEL = [
  'M23.9972 19.2412C31.9373 19.2412 38.3748 16.2761 38.3748 12.6206C38.3748 8.96419 31.9373 6 23.9972 6C16.0571 6 9.61958 8.96419 9.61958 12.6206C9.61958 16.2761 16.0571 19.2412 23.9972 19.2412Z',
  'M20.0974 40.5885C16.9691 42.669 10.7771 39.2701 6.27063 32.9846C1.76315 26.6991 0.645473 19.9243 3.77476 17.8448C6.90405 15.7643 12.9389 18.9889 17.4464 25.2754C21.9539 31.5599 23.2257 38.508 20.0974 40.5885Z',
  'M27.9024 40.5885C24.7741 38.508 26.0459 31.5599 30.5534 25.2754C35.0609 18.9889 41.0957 15.7643 44.226 17.8448C47.3543 19.9243 46.2366 26.6991 41.7291 32.9846C37.2226 39.2701 31.0307 42.669 27.9024 40.5885Z',
];
export function Bytel({ animated = false, className, title = 'Bouygues Telecom' }: { animated?: boolean; className?: string; title?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!animated || !ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) {
      ref.current?.querySelectorAll('path').forEach((p) => { p.style.opacity = '1'; });
      return;
    }
    const from = ['translateY(-10px) scale(.4)', 'translate(-8px, 8px) scale(.4) rotate(-20deg)', 'translate(8px, 8px) scale(.4) rotate(20deg)'];
    const ctls = [...ref.current.querySelectorAll('path')].map((p, i) =>
      animate(p, { opacity: [0, 1], transform: [from[i], 'translate(0px, 0px) scale(1) rotate(0deg)'] }, { type: 'spring', stiffness: 260, damping: 16, delay: 0.08 + i * 0.09 }));
    return () => ctls.forEach((c) => c.stop());
  }, [animated]);
  return (
    <svg ref={ref} viewBox="0 0 48 48" role="img" aria-label={title} className={cn('text-[var(--logo)]', className)}>
      {BYTEL.map((d) => <path key={d} d={d} fill="currentColor" style={{ opacity: animated ? 0 : 1, transformBox: 'fill-box', transformOrigin: 'center' }} />)}
    </svg>
  );
}
