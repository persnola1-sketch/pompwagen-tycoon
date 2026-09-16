import * as THREE from 'three';

/**
 * Canvas-generated textures: instant fallbacks for the KTX2 photo textures,
 * plus every sign, livery, plate and decal — no downloads needed.
 */

export function canvas(w: number, h = w): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function tex(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function clampTex(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = tex(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, w: number, h: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * 60) - 30;
    ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},${alpha})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function concreteTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#a3a4a6';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, 2500, 0.22);
  return tex(c, 6);
}

export function asphaltTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4a4c50';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, size, 3000, 0.3);
  return tex(c, 10);
}

export function corrugatedWallTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#c3c8cf';
  ctx.fillRect(0, 0, size, size);
  const stripe = 16;
  for (let x = 0; x < size; x += stripe) {
    const g = ctx.createLinearGradient(x, 0, x + stripe, 0);
    g.addColorStop(0, 'rgba(70,80,92,0.35)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(60,70,82,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, stripe, size);
  }
  return tex(c, 4);
}

export function grassTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#5f8f45';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 3000; i++) {
    const v = Math.floor(Math.random() * 50) - 25;
    ctx.fillStyle = `rgba(${90 + v},${140 + v},${60 + v},0.5)`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1, 2 + Math.random() * 3);
  }
  return tex(c, 12);
}

export function woodTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#b08b5f';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 40; i++) {
    ctx.strokeStyle = `rgba(90,60,30,${0.1 + Math.random() * 0.2})`;
    ctx.lineWidth = 1 + Math.random() * 2;
    const y = Math.random() * size;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(size * 0.3, y + Math.random() * 8 - 4, size * 0.7, y + Math.random() * 8 - 4, size, y);
    ctx.stroke();
  }
  return tex(c, 1);
}

/** yellow/black diagonal safety stripes (bollards, guards, dock edges) */
export function hazardTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#f2c018';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1c1c1c';
  for (let i = -size; i < size * 2; i += 64) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 32, 0);
    ctx.lineTo(i + 32 - size, size);
    ctx.lineTo(i - size, size);
    ctx.closePath();
    ctx.fill();
  }
  return tex(c, 1);
}

/** steel plate texture for floor pads, with a big painted label readable at default zoom */
export function padPlateTexture(lines: string[], accent: string, locked = false): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = locked ? '#4c525c' : '#6d7480';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 600; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    ctx.fillRect(0, Math.random() * size, size, 2);
  }
  // diamond tread pattern
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 56; x < size - 40; x += 36) {
    for (let y = 56; y < size - 40; y += 36) {
      ctx.save();
      ctx.translate(x + ((y / 36) % 2) * 18, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-10, -3, 20, 6);
      ctx.restore();
    }
  }
  const bw = 40;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.rect(bw, bw, size - bw * 2, size - bw * 2);
  ctx.clip('evenodd');
  ctx.fillStyle = locked ? '#8a8f98' : '#f2c018';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1c1c1c';
  for (let i = -size; i < size * 2; i += 72) {
    ctx.save();
    ctx.translate(i, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -size, 36, size * 3);
    ctx.restore();
  }
  ctx.restore();
  // dark painted field behind the text for contrast
  ctx.fillStyle = 'rgba(20,24,32,0.55)';
  ctx.fillRect(bw + 10, bw + 10, size - bw * 2 - 20, size - bw * 2 - 20);
  ctx.fillStyle = 'rgba(30,34,40,0.8)';
  for (const [rx, ry] of [[62, 62], [size - 62, 62], [62, size - 62], [size - 62, size - 62]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = lines.length > 1 ? 88 : 104;
  const lineH = fontSize * 1.12;
  const startY = size / 2 - ((lines.length - 1) * lineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.font = `900 ${fontSize}px -apple-system, sans-serif`;
    ctx.fillStyle = i === 0 ? accent : '#ffffff';
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 8;
    ctx.strokeText(lines[i], size / 2, startY + i * lineH, size - bw * 2 - 40);
    ctx.fillText(lines[i], size / 2, startY + i * lineH, size - bw * 2 - 40);
  }
  return clampTex(c);
}

/** floating billboard label above a pad: icon + title + cost on a dark rounded panel */
export function padLabelTexture(icon: string, title: string, sub: string, accent: string, locked = false): THREE.CanvasTexture {
  const W = 512;
  const H = 176;
  const [c, ctx] = canvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const r = 34;
  ctx.beginPath();
  ctx.moveTo(r, 4);
  ctx.arcTo(W - 4, 4, W - 4, H - 4, r);
  ctx.arcTo(W - 4, H - 4, 4, H - 4, r);
  ctx.arcTo(4, H - 4, 4, 4, r);
  ctx.arcTo(4, 4, W - 4, 4, r);
  ctx.closePath();
  ctx.fillStyle = locked ? 'rgba(40,44,52,0.88)' : 'rgba(20,24,32,0.9)';
  ctx.fill();
  ctx.lineWidth = 6;
  ctx.strokeStyle = locked ? '#7a8090' : accent;
  ctx.stroke();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.font = '100px -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(icon, 78, H / 2 + 6);
  ctx.textAlign = 'left';
  const hasSub = sub.length > 0;
  ctx.font = `900 ${hasSub ? 58 : 66}px -apple-system, sans-serif`;
  ctx.fillStyle = locked ? '#b9bfcc' : '#ffffff';
  ctx.fillText(title, 150, hasSub ? 60 : H / 2, W - 170);
  if (hasSub) {
    ctx.font = '800 54px -apple-system, sans-serif';
    ctx.fillStyle = locked ? '#8a92a5' : accent;
    ctx.fillText(sub, 150, 122, W - 170);
  }
  const t = clampTex(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/** simple text texture (labels, boards) */
export function textSprite(text: string, bg: string, fg: string, w = 256, h = 128, fontPx = 48): THREE.CanvasTexture {
  const [c, ctx] = canvas(w, h);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = fg;
  ctx.font = `800 ${fontPx}px -apple-system, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, w / 2, h / 2, w - 16);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export type SignKind = 'forklift' | 'hivis' | 'speed' | 'exit' | 'fire' | 'nosmoking' | 'helmet';

const SIGN_TEXT: Record<SignKind, string> = {
  forklift: 'FORKLIFT TRAFFIC',
  hivis: 'HI-VIS REQUIRED',
  speed: 'MAX 5 KM/H',
  exit: 'EMERGENCY EXIT',
  fire: 'FIRE EXTINGUISHER',
  nosmoking: 'NO SMOKING',
  helmet: 'HARD HAT AREA',
};

const SIGN_W = 256;
const SIGN_H = 320;
const SIGN_KINDS: SignKind[] = ['forklift', 'hivis', 'speed', 'exit', 'fire', 'nosmoking', 'helmet'];
const SIGN_COLS = 4;
const SIGN_ROWS = 2;
let signAtlas: THREE.CanvasTexture | null = null;

/** every safety sign in one texture, so all signs merge into one draw call */
export function signAtlasTexture(): THREE.CanvasTexture {
  if (signAtlas) return signAtlas;
  const [c, ctx] = canvas(SIGN_W * SIGN_COLS, SIGN_H * SIGN_ROWS);
  SIGN_KINDS.forEach((kind, i) => {
    ctx.save();
    ctx.translate((i % SIGN_COLS) * SIGN_W, Math.floor(i / SIGN_COLS) * SIGN_H);
    drawSign(ctx, kind);
    ctx.restore();
  });
  signAtlas = clampTex(c);
  return signAtlas;
}

/** 1 × 1.25 plane showing one sign from the atlas */
export function signGeometry(kind: SignKind): THREE.PlaneGeometry {
  const i = SIGN_KINDS.indexOf(kind);
  const col = i % SIGN_COLS;
  const row = Math.floor(i / SIGN_COLS);
  const g = new THREE.PlaneGeometry(1, 1.25);
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let k = 0; k < uv.count; k++) {
    uv.setXY(k, (col + uv.getX(k)) / SIGN_COLS, (SIGN_ROWS - 1 - row + uv.getY(k)) / SIGN_ROWS);
  }
  return g;
}

/** safety sign with a simple pictogram and caption, drawn at (0,0)–(256,320) */
function drawSign(ctx: CanvasRenderingContext2D, kind: SignKind): void {
  const W = SIGN_W;
  const H = SIGN_H;
  const green = kind === 'exit';
  const red = kind === 'fire';
  ctx.fillStyle = green ? '#1f9a4c' : red ? '#c8302c' : '#ffffff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#20242c';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, W - 6, H - 6);
  const cx = W / 2;
  const cy = 128;
  const blue = '#1f5fb4';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (kind) {
    case 'forklift': {
      ctx.fillStyle = '#f2c018';
      ctx.strokeStyle = '#1c1c1c';
      ctx.lineWidth = 12;
      ctx.beginPath();
      ctx.moveTo(cx, 22);
      ctx.lineTo(W - 22, 222);
      ctx.lineTo(22, 222);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#1c1c1c';
      ctx.fillRect(cx - 44, 140, 60, 40); // body
      ctx.fillRect(cx - 30, 112, 12, 30); // cab post
      ctx.fillRect(cx + 20, 96, 8, 90); // mast
      ctx.fillRect(cx + 20, 180, 38, 6); // forks
      ctx.beginPath();
      ctx.arc(cx - 30, 190, 12, 0, Math.PI * 2);
      ctx.arc(cx + 8, 190, 12, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'hivis':
    case 'helmet': {
      ctx.fillStyle = blue;
      ctx.beginPath();
      ctx.arc(cx, cy, 100, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      if (kind === 'hivis') {
        ctx.beginPath();
        ctx.moveTo(cx - 55, 70);
        ctx.lineTo(cx - 18, 70);
        ctx.lineTo(cx, 110);
        ctx.lineTo(cx + 18, 70);
        ctx.lineTo(cx + 55, 70);
        ctx.lineTo(cx + 60, 190);
        ctx.lineTo(cx - 60, 190);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = blue;
        ctx.fillRect(cx - 60, 135, 120, 10);
        ctx.fillRect(cx - 60, 160, 120, 10);
      } else {
        ctx.beginPath();
        ctx.arc(cx, 150, 62, Math.PI, 0);
        ctx.fill();
        ctx.fillRect(cx - 82, 148, 164, 16);
        ctx.fillStyle = blue;
        ctx.fillRect(cx - 6, 92, 12, 56);
      }
      break;
    }
    case 'speed': {
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#d0302a';
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#111';
      ctx.font = '900 110px -apple-system, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('5', cx, cy + 6);
      break;
    }
    case 'nosmoking': {
      ctx.strokeStyle = '#d0302a';
      ctx.lineWidth = 20;
      ctx.fillStyle = '#222';
      ctx.fillRect(cx - 60, cy - 10, 100, 22);
      ctx.fillStyle = '#e07b2a';
      ctx.fillRect(cx + 40, cy - 10, 20, 22);
      ctx.beginPath();
      ctx.arc(cx, cy, 90, 0, Math.PI * 2);
      ctx.moveTo(cx - 64, cy - 64);
      ctx.lineTo(cx + 64, cy + 64);
      ctx.stroke();
      break;
    }
    case 'exit': {
      ctx.strokeStyle = '#ffffff';
      ctx.fillStyle = '#ffffff';
      ctx.lineWidth = 14;
      ctx.strokeRect(cx + 20, 50, 70, 150);
      ctx.beginPath();
      ctx.arc(cx - 30, 62, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx - 36, 84);
      ctx.lineTo(cx - 50, 140);
      ctx.lineTo(cx - 80, 190);
      ctx.moveTo(cx - 50, 140);
      ctx.lineTo(cx - 20, 170);
      ctx.lineTo(cx - 10, 205);
      ctx.moveTo(cx - 40, 100);
      ctx.lineTo(cx - 78, 120);
      ctx.moveTo(cx - 40, 100);
      ctx.lineTo(cx - 4, 118);
      ctx.stroke();
      break;
    }
    case 'fire': {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(cx - 30, 80);
      ctx.lineTo(cx + 30, 80);
      ctx.lineTo(cx + 34, 210);
      ctx.lineTo(cx - 34, 210);
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(cx - 12, 50, 24, 30);
      ctx.fillRect(cx + 10, 56, 48, 12);
      break;
    }
  }
  ctx.fillStyle = green || red ? '#ffffff' : '#20242c';
  ctx.font = '800 26px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(SIGN_TEXT[kind], cx, 276, W - 24);
}

/** chain-link fence mesh with transparent gaps (use with alphaTest) */
export function chainLinkTexture(): THREE.CanvasTexture {
  const size = 64;
  const [c, ctx] = canvas(size);
  ctx.clearRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(165,172,180,1)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(size, size);
  ctx.moveTo(size, 0);
  ctx.lineTo(0, size);
  ctx.stroke();
  const t = tex(c, 1);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Dutch yellow licence plate */
export function plateTexture(text: string): THREE.CanvasTexture {
  const [c, ctx] = canvas(256, 60);
  ctx.fillStyle = '#f6c800';
  ctx.fillRect(0, 0, 256, 60);
  ctx.fillStyle = '#1f47a8';
  ctx.fillRect(0, 0, 34, 60);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 18px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('NL', 17, 42);
  ctx.fillStyle = '#111111';
  ctx.font = '900 38px -apple-system, sans-serif';
  ctx.fillText(text, 145, 32, 210);
  ctx.strokeStyle = '#111';
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, 252, 56);
  return clampTex(c);
}

/** trailer side livery: company name on a colour swoosh */
export function liveryTexture(name: string, primary: string, accent: string, drawLogo?: (ctx: CanvasRenderingContext2D, x: number, y: number, size: number, color: string) => void): THREE.CanvasTexture {
  const W = 1024;
  const H = 256;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = '#f4f6f8';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = primary;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H * 0.62);
  ctx.bezierCurveTo(W * 0.35, H * 0.4, W * 0.6, H * 0.95, W, H * 0.55);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = accent;
  ctx.beginPath();
  ctx.moveTo(0, H * 0.58);
  ctx.bezierCurveTo(W * 0.35, H * 0.36, W * 0.6, H * 0.9, W, H * 0.5);
  ctx.lineTo(W, H * 0.55);
  ctx.bezierCurveTo(W * 0.6, H * 0.95, W * 0.35, H * 0.4, 0, H * 0.62);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = primary;
  ctx.font = '900 104px -apple-system, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const logoW = drawLogo ? 130 : 0;
  if (drawLogo) drawLogo(ctx, 44, H * 0.3 - 55, 110, primary);
  ctx.fillText(name, 48 + logoW, H * 0.3, W - 96 - logoW);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 30px -apple-system, sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText('LOGISTICS · DISTRIBUTION', W - 40, H * 0.86);
  return clampTex(c);
}

/** sectional dock door panel ribs */
export function doorPanelTexture(): THREE.CanvasTexture {
  const [c, ctx] = canvas(128, 256);
  ctx.fillStyle = '#9aa3ad';
  ctx.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 256; y += 32) {
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(0, y + 2, 128, 4);
    ctx.fillStyle = 'rgba(40,46,54,0.45)';
    ctx.fillRect(0, y + 28, 128, 4);
  }
  return clampTex(c);
}

/** soft radial light pool for fake lamp light on the floor */
export function lightPoolTexture(): THREE.CanvasTexture {
  const size = 128;
  const [c, ctx] = canvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,236,190,0.55)');
  g.addColorStop(0.5, 'rgba(255,236,190,0.18)');
  g.addColorStop(1, 'rgba(255,236,190,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return clampTex(c);
}
