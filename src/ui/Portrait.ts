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

const SKINS = [0xf0c9a8, 0xe0ac85, 0xc98a5b, 0x8d5a3b, 0x6b4327, 0xf5d9bd];
const HAIRS = [0x4a2f1c, 0x2b2118, 0x8a6a3a, 0xd9c08a, 0x9a9a9a, 0x5a3b2a];
const SHIRTS = [0x2c3e66, 0x5a6b8a, 0x6b4d3a, 0x3d4b5e, 0x7a4b6b, 0x2f6f5a];

/** a stable portrait for a named contact person (clients and suppliers) */
export function contactPortrait(name: string, size = 40, accent = '#2f6fb4'): string {
  let h = 0;
  // unsigned shifts only: a signed shift on a large hash gives a negative index
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return portraitSvg(
    {
      skin: SKINS[h % SKINS.length],
      hair: HAIRS[(h >>> 3) % HAIRS.length],
      shirt: SHIRTS[(h >>> 6) % SHIRTS.length],
      vest: parseInt(accent.slice(1), 16),
      hat: 'none',
      hatColor: 0xffffff,
      height: 1,
      mustache: ((h >>> 9) & 3) === 0,
    },
    size,
  );
}

export function stars(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}
