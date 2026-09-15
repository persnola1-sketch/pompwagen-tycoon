import * as THREE from 'three';

/** All textures are generated on canvas — zero downloads, works offline. */

function canvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  return [c, c.getContext('2d')!];
}

function tex(c: HTMLCanvasElement, repeat = 1): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, alpha: number): void {
  for (let i = 0; i < count; i++) {
    const v = Math.floor(Math.random() * 60) - 30;
    ctx.fillStyle = `rgba(${128 + v},${128 + v},${128 + v},${alpha})`;
    ctx.fillRect(Math.random() * size, Math.random() * size, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

export function concreteTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#9a9b9e';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 4000, 0.25);
  // expansion joints
  ctx.strokeStyle = 'rgba(60,60,64,0.5)';
  ctx.lineWidth = 3;
  for (let i = 0; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo((size / 2) * i, 0);
    ctx.lineTo((size / 2) * i, size);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, (size / 2) * i);
    ctx.lineTo(size, (size / 2) * i);
    ctx.stroke();
  }
  // subtle stains
  for (let i = 0; i < 14; i++) {
    const sx = Math.random() * size;
    const sy = Math.random() * size;
    const g = ctx.createRadialGradient(sx, sy, 4, sx, sy, 40 + Math.random() * 60);
    g.addColorStop(0, 'rgba(70,70,74,0.10)');
    g.addColorStop(1, 'rgba(70,70,74,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
  }
  return tex(c, 8);
}

export function asphaltTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#4a4c50';
  ctx.fillRect(0, 0, size, size);
  speckle(ctx, size, 6000, 0.3);
  return tex(c, 10);
}

export function corrugatedWallTexture(): THREE.CanvasTexture {
  const size = 512;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#b8bec6';
  ctx.fillRect(0, 0, size, size);
  // vertical corrugation stripes with shading
  const stripe = 32;
  for (let x = 0; x < size; x += stripe) {
    const g = ctx.createLinearGradient(x, 0, x + stripe, 0);
    g.addColorStop(0, 'rgba(70,80,92,0.35)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.22)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(60,70,82,0.4)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, stripe, size);
  }
  // lower protective band
  ctx.fillStyle = 'rgba(52,86,128,0.85)';
  ctx.fillRect(0, size * 0.82, size, size * 0.18);
  return tex(c, 4);
}

export function shrinkWrapTexture(color: string): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  // plastic wrap sheen bands
  for (let i = 0; i < 18; i++) {
    const y = Math.random() * size;
    const g = ctx.createLinearGradient(0, y, size, y + 40);
    g.addColorStop(0, 'rgba(255,255,255,0)');
    g.addColorStop(0.5, `rgba(255,255,255,${0.10 + Math.random() * 0.14})`);
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, y - 20, size, 60);
  }
  // hint of bottles behind the wrap
  ctx.fillStyle = 'rgba(255,255,255,0.16)';
  for (let gx = 12; gx < size; gx += 42) {
    for (let gy = 16; gy < size; gy += 52) {
      ctx.beginPath();
      ctx.ellipse(gx, gy, 9, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  return tex(c, 1);
}

export function woodTexture(): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  ctx.fillStyle = '#a9855c';
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

/** steel plate texture for floor pads, with painted label */
export function padPlateTexture(lines: string[], accent: string): THREE.CanvasTexture {
  const size = 256;
  const [c, ctx] = canvas(size);
  // brushed steel
  ctx.fillStyle = '#6d7480';
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 500; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`;
    ctx.fillRect(0, Math.random() * size, size, 1);
  }
  // hazard border
  const bw = 22;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, size, size);
  ctx.rect(bw, bw, size - bw * 2, size - bw * 2);
  ctx.clip('evenodd');
  ctx.fillStyle = '#f2c018';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#1c1c1c';
  for (let i = -size; i < size * 2; i += 36) {
    ctx.save();
    ctx.translate(i, 0);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(0, -size, 18, size * 3);
    ctx.restore();
  }
  ctx.restore();
  // rivets
  ctx.fillStyle = 'rgba(30,34,40,0.8)';
  for (const [rx, ry] of [[34, 34], [size - 34, 34], [34, size - 34], [size - 34, size - 34]]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  // label text
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontSize = lines.length > 1 ? 40 : 48;
  const lineH = fontSize * 1.15;
  const startY = size / 2 - ((lines.length - 1) * lineH) / 2;
  for (let i = 0; i < lines.length; i++) {
    ctx.font = `800 ${fontSize}px -apple-system, sans-serif`;
    ctx.fillStyle = i === 0 ? accent : '#e8eaf0';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeText(lines[i], size / 2, startY + i * lineH, size - bw * 2 - 16);
    ctx.fillText(lines[i], size / 2, startY + i * lineH, size - bw * 2 - 16);
  }
  const t = tex(c, 1);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** simple sign texture (safety signs, logos on trucks) */
export function textSprite(text: string, bg: string, fg: string, w = 256, h = 128, fontPx = 48): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
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
