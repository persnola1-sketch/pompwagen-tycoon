import { Brand } from '../core/Brands';

/** the drawing for each brand mark, as SVG paths on a 0–64 grid */
function markSvg(mark: string, fill: string): string {
  switch (mark) {
    case 'cart':
      return `<path d="M14 18h6l6 20h20l6-14H26" stroke="${fill}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="29" cy="46" r="3.5" fill="${fill}"/><circle cx="45" cy="46" r="3.5" fill="${fill}"/>`;
    case 'bolt':
      return `<path d="M36 10 L18 36h12l-4 18 20-28H34z" fill="${fill}"/>`;
    case 'leaf':
      return `<path d="M48 14C30 14 16 26 16 44c0 3 1 5 2 7 2-16 14-26 30-27-12 4-20 12-24 24 18 2 32-10 32-28 0-3-2-6-8-6z" fill="${fill}"/>`;
    case 'box':
      return `<path d="M32 12 L52 22v20L32 52 12 42V22z" fill="none" stroke="${fill}" stroke-width="4" stroke-linejoin="round"/>
        <path d="M12 22 L32 32l20-10M32 32v20" stroke="${fill}" stroke-width="3" fill="none"/>`;
    case 'star':
      return `<path d="M32 12l6.5 13.5L53 27.5l-10.5 10L45 52l-13-7-13 7 2.5-14.5L11 27.5l14.5-2z" fill="${fill}"/>`;
    case 'drop':
      return `<path d="M32 10c10 12 16 20 16 27a16 16 0 0 1-32 0c0-7 6-15 16-27z" fill="${fill}"/>`;
    case 'wave':
      return `<path d="M10 38c6-8 12-8 18 0s12 8 18 0 8-6 8-6" stroke="${fill}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M10 50c6-8 12-8 18 0s12 8 18 0 8-6 8-6" stroke="${fill}" stroke-width="4" fill="none" stroke-linecap="round" opacity="0.6"/>`;
    case 'bag':
      return `<path d="M18 24h28l-3 28H21z" fill="${fill}"/><path d="M25 24a7 7 0 0 1 14 0" stroke="${fill}" stroke-width="4" fill="none"/>`;
    case 'spark':
      return `<path d="M32 10l4 14 14 4-14 4-4 14-4-14-14-4 14-4z" fill="${fill}"/><circle cx="48" cy="18" r="3" fill="${fill}"/>`;
    default:
      return `<circle cx="32" cy="32" r="16" fill="none" stroke="${fill}" stroke-width="5"/><circle cx="32" cy="32" r="6" fill="${fill}"/>`;
  }
}

/** rounded brand logo tile used across the UI */
export function logoSvg(b: Brand, size = 34): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
    <rect width="64" height="64" rx="16" fill="${b.color}"/>
    ${markSvg(b.mark, b.accent)}
  </svg>`;
}

/** the same mark drawn on a canvas, for truck liveries and 3D signs */
export function drawMark(ctx: CanvasRenderingContext2D, mark: string, x: number, y: number, size: number, color: string): void {
  const s = size / 64;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(s, s);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const p = (d: string): Path2D => new Path2D(d);
  switch (mark) {
    case 'cart':
      ctx.lineWidth = 4;
      ctx.stroke(p('M14 18h6l6 20h20l6-14H26'));
      ctx.beginPath();
      ctx.arc(29, 46, 3.5, 0, Math.PI * 2);
      ctx.arc(45, 46, 3.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'bolt':
      ctx.fill(p('M36 10 L18 36h12l-4 18 20-28H34z'));
      break;
    case 'leaf':
      ctx.fill(p('M48 14C30 14 16 26 16 44c0 3 1 5 2 7 2-16 14-26 30-27-12 4-20 12-24 24 18 2 32-10 32-28 0-3-2-6-8-6z'));
      break;
    case 'box':
      ctx.lineWidth = 4;
      ctx.stroke(p('M32 12 L52 22v20L32 52 12 42V22z'));
      ctx.lineWidth = 3;
      ctx.stroke(p('M12 22 L32 32l20-10M32 32v20'));
      break;
    case 'star':
      ctx.fill(p('M32 12l6.5 13.5L53 27.5l-10.5 10L45 52l-13-7-13 7 2.5-14.5L11 27.5l14.5-2z'));
      break;
    case 'drop':
      ctx.fill(p('M32 10c10 12 16 20 16 27a16 16 0 0 1-32 0c0-7 6-15 16-27z'));
      break;
    case 'wave':
      ctx.lineWidth = 5;
      ctx.stroke(p('M10 38c6-8 12-8 18 0s12 8 18 0 8-6 8-6'));
      ctx.lineWidth = 4;
      ctx.stroke(p('M10 50c6-8 12-8 18 0s12 8 18 0 8-6 8-6'));
      break;
    case 'bag':
      ctx.fill(p('M18 24h28l-3 28H21z'));
      ctx.lineWidth = 4;
      ctx.stroke(p('M25 24a7 7 0 0 1 14 0'));
      break;
    case 'spark':
      ctx.fill(p('M32 10l4 14 14 4-14 4-4 14-4-14-14-4 14-4z'));
      ctx.beginPath();
      ctx.arc(48, 18, 3, 0, Math.PI * 2);
      ctx.fill();
      break;
    default:
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(32, 32, 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(32, 32, 6, 0, Math.PI * 2);
      ctx.fill();
  }
  ctx.restore();
}
