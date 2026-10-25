// Jeu d'icônes linéaires (24×24, trait 1.8) — dessinées pour le panel.
import { h } from '/vendor/preact.mjs';
import { useEffect, useRef } from '/vendor/hooks.mjs';

const P = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z',
  devices: 'M4 5h12a1 1 0 0 1 1 1v8H3V6a1 1 0 0 1 1-1zM1 17h18M19 9h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1z',
  wifi: 'M2 8.8a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16.2a5 5 0 0 1 6 0M12 20h.01',
  network: 'M12 3v5M5 13v-2h14v2M5 13v3M19 13v3M12 8v8M3 16h4v5H3zM10 16h4v5h-4zM17 16h4v5h-4zM9 3h6v5H9z',
  shield: 'M12 3 4 6v6c0 4.5 3.4 8.2 8 9 4.6-.8 8-4.5 8-9V6z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  phone: 'M5 3h3l2 5-2.5 1.5a11 11 0 0 0 5 5L14 12l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 5a2 2 0 0 1 2-2z',
  activity: 'M3 12h4l3-8 4 16 3-8h4',
  box: 'M3 7h18v10H3zM7 12h.01M11 12h.01M15 12h3',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  chevron: 'M9 6l6 6-6 6',
  back: 'M15 6l-6 6 6 6',
  check: 'M5 12.5l4.5 4.5L19 7',
  x: 'M6 6l12 12M18 6 6 18',
  plus: 'M12 5v14M5 12h14',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  eyeoff: 'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3 3.9M6.4 6.4C3.6 8.2 2 12 2 12s3.5 7 10 7a9.6 9.6 0 0 0 5.6-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  refresh: 'M20 11a8 8 0 0 0-14.3-4.9L4 8M4 4v4h4M4 13a8 8 0 0 0 14.3 4.9L20 16M20 20v-4h-4',
  power: 'M12 3v9M6.3 6.3a8 8 0 1 0 11.4 0',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  ethernet: 'M5 4h14v10h-3v3h-3v3h-2v-3H8v-3H5zM9 8v2M12 8v2M15 8v2',
  laptop: 'M4 6h16v10H4zM2 19h20',
  mobile: 'M8 2h8a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1zM11 18h2',
  tablet: 'M5 3h14a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM11 18h2',
  tv: 'M3 5h18v12H3zM8 21h8M12 17v4',
  watch: 'M8 6h8v12H8zM9 6l1-3h4l1 3M9 18l1 3h4l1-3',
  speaker: 'M7 3h10v18H7zM12 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM12 7h.01',
  printer: 'M7 9V3h10v6M6 18H4v-7h16v7h-2M7 14h10v7H7z',
  game: 'M6 9h12a4 4 0 0 1 4 4v1a3 3 0 0 1-5.5 1.7L15 14H9l-1.5 1.7A3 3 0 0 1 2 14v-1a4 4 0 0 1 4-4zM8 11v4M6 13h4M16 12h.01M18 14h.01',
  homeauto: 'M3 10.5 12 3l9 7.5M6 9v11h12V9M10 15a2 2 0 1 0 4 0 2 2 0 0 0-4 0z',
  generic: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v4M12 16h.01',
  down: 'M12 4v16M6 14l6 6 6-6',
  up: 'M12 20V4M6 10l6-6 6 6',
  alert: 'M12 3 2 20h20zM12 10v4M12 17h.01',
  lock: 'M6 11h12v10H6zM8 11V8a4 4 0 0 1 8 0v3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v2h-2zM14 18h2v2h-2zM18 18h2v2h-2zM16 16h2v2h-2z',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  moon: 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z',
  logout: 'M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  thermo: 'M14 14.8V4a2 2 0 0 0-4 0v10.8a4 4 0 1 0 4 0z',
  cpu: 'M6 6h12v12H6zM9 9h6v6H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4',
  fiber: 'M3 12c4-6 14-6 18 0M3 12c4 6 14 6 18 0M12 9v6',
  usb: 'M12 2v14M9 5l3-3 3 3M8 10v3l4 3 4-3v-3M12 16a2 2 0 1 0 0 4 2 2 0 0 0 0-4z',
  save: 'M5 3h11l3 3v15H5zM8 3v5h7V3M8 21v-7h8v7',
  mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
  play: 'M7 4l13 8-13 8z',
  stop: 'M6 6h12v12H6z',
  link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
  sliders: 'M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4',
  external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v6M12 7.5h.01',
  bell: 'M6 9a6 6 0 1 1 12 0c0 5 2 6.5 2 6.5H4S6 14 6 9zM10 19.5a2.2 2.2 0 0 0 4 0',
  star: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  starfill: 'M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z',
  pause: 'M8 5v14M16 5v14',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  palette: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-1.3-1.1-1.6-1.1-2.6 0-.9.7-1.6 1.6-1.6H16a5 5 0 0 0 5-5C21 6.4 17 3 12 3zM7.5 12h.01M9.5 7.5h.01M14.5 7.5h.01',
  expand: 'M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5',
  shrink: 'M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5',
  command: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  timer: 'M12 22a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 10v4l2 1.5M9 2h6',
  arrowright: 'M5 12h14M13 6l6 6-6 6',
  filter: 'M3 5h18l-7 8v6l-4-2v-4z',
  calendar: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  user: 'M12 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM4 21a8 8 0 0 1 16 0',
  userplus: 'M10 12a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM2.5 21a7.5 7.5 0 0 1 12.8-5.3M19 15v6M16 18h6',
  signal: 'M4 20v-3M9 20v-7M14 20V9M19 20V4',
  layout: 'M3 4h18v16H3zM9 4v16M9 10h12',
  print: 'M7 9V3h10v6M7 17H4v-7a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v7h-3M7 14h10v7H7z',
  zap: 'M13 2 4 14h7l-1 8 9-12h-7z',
  dot: 'M12 12h.01',
};

export function Icon({ name, size = 20, class: cls = '', title, stroke = 1.8 }) {
  const d = P[name] || P.generic;
  const filled = name === 'starfill';
  return h('svg', { class: 'ico ' + cls, width: size, height: size, viewBox: '0 0 24 24', fill: filled ? 'currentColor' : 'none', stroke: 'currentColor', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': title ? undefined : 'true', role: title ? 'img' : undefined },
    title ? h('title', null, title) : null,
    h('path', { d }));
}

export const KIND_ICON = { phone: 'mobile', watch: 'watch', laptop: 'laptop', tablet: 'tablet', tv: 'tv', speaker: 'speaker', printer: 'printer', game: 'game', home: 'homeauto', generic: 'devices' };

// ── Logo Bouygues Telecom (tracé repris des ressources servies par la Bbox) ──
const BYTEL = [
  'M23.9972 19.2412C31.9373 19.2412 38.3748 16.2761 38.3748 12.6206C38.3748 8.96419 31.9373 6 23.9972 6C16.0571 6 9.61958 8.96419 9.61958 12.6206C9.61958 16.2761 16.0571 19.2412 23.9972 19.2412Z',
  'M20.0974 40.5885C16.9691 42.669 10.7771 39.2701 6.27063 32.9846C1.76315 26.6991 0.645473 19.9243 3.77476 17.8448C6.90405 15.7643 12.9389 18.9889 17.4464 25.2754C21.9539 31.5599 23.2257 38.508 20.0974 40.5885Z',
  'M27.9024 40.5885C24.7741 38.508 26.0459 31.5599 30.5534 25.2754C35.0609 18.9889 41.0957 15.7643 44.226 17.8448C47.3543 19.9243 46.2366 26.6991 41.7291 32.9846C37.2226 39.2701 31.0307 42.669 27.9024 40.5885Z',
];
/** Logo animé : les trois pétales éclosent en ressort (transform/opacity uniquement) */
export function Bytel({ animate = false, size, title = 'Bouygues Telecom', loop = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const M = window.Motion;
    if (!animate || !M || !ref.current || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const paths = ref.current.querySelectorAll('path');
    const from = ['translateY(-10px) scale(.4)', 'translate(-8px, 8px) scale(.4) rotate(-20deg)', 'translate(8px, 8px) scale(.4) rotate(20deg)'];
    const ctls = [...paths].map((p, i) => M.animate(p, { opacity: [0, 1], transform: [from[i], 'translate(0,0) scale(1) rotate(0deg)'] }, { type: 'spring', stiffness: 260, damping: 16, delay: 0.08 + i * 0.09 }));
    let t;
    if (loop) t = setInterval(() => [...paths].forEach((p, i) => M.animate(p, { transform: ['scale(1)', 'scale(.86)', 'scale(1)'] }, { duration: 0.9, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] })), 1600);
    return () => { clearInterval(t); ctls.forEach((c) => c.stop?.()); };
  }, [animate, loop]);
  return h('svg', { ref, class: 'bytel', viewBox: '0 0 48 48', width: size, height: size, role: 'img', 'aria-label': title },
    BYTEL.map((d) => h('path', { d, fill: 'currentColor', style: animate ? 'opacity:0' : undefined })));
}
