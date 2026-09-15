import { WorkerLook } from '../core/workers/WorkerTypes';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

/** small SVG portrait generated from a worker's look (skin, hair, hat, vest) */
export function portraitSvg(look: WorkerLook, size = 48): string {
  const skin = hex(look.skin);
  const hair = hex(look.hair);
  const vest = hex(look.vest);
  const shirt = hex(look.shirt);
  const hat = hex(look.hatColor);
  let head = `<path d="M17 27 Q32 12 47 27 L47 30 L17 30Z" fill="${hair}"/>`;
  if (look.hat === 'helmet') head = `<path d="M16 28 Q32 6 48 28Z" fill="${hat}"/><rect x="13" y="26" width="38" height="4" rx="2" fill="${hat}"/>`;
  else if (look.hat === 'cap') head = `<path d="M17 27 Q32 10 47 27Z" fill="${hat}"/><rect x="15" y="25" width="36" height="4" rx="2" fill="${hat}"/>`;
  const mustache = look.mustache ? `<path d="M24 40 Q32 44 40 40 Q32 42 24 40Z" fill="${hair}"/>` : '';
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <circle cx="32" cy="32" r="31" fill="#2a3448"/>
    <path d="M10 64 Q32 44 54 64Z" fill="${shirt}"/>
    <path d="M14 64 Q32 46 50 64Z" fill="${vest}"/>
    <rect x="18" y="52" width="28" height="3" fill="#e9edf0" opacity="0.9"/>
    <circle cx="32" cy="31" r="14" fill="${skin}"/>
    ${head}
    <circle cx="26" cy="32" r="2" fill="#141414"/><circle cx="38" cy="32" r="2" fill="#141414"/>
    ${mustache}
    <path d="M27 39 Q32 42 37 39" stroke="#7a4a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
  </svg>`;
}

export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
