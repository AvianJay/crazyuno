import type { Card } from '@crazyuno/shared';
import * as THREE from 'three';
import { backCanvas, COLOR_HEX, FACE_H, FACE_W, faceCanvas, label, makeCanvas } from '../cardFace';

export { COLOR_HEX };

/** 牌在 3D 世界的大小 */
export const CARD_W = 1;
export const CARD_H = 1.5;

const W = FACE_W;
const H = FACE_H;
const R = 28;
const canvas = makeCanvas;

const cache = new Map<string, THREE.Texture>();

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

export function faceTexture(card: Card): THREE.Texture {
  const key = `${card.kind}:${card.color}:${card.value ?? ''}`;
  let tex = cache.get(key);
  if (!tex) {
    tex = toTexture(faceCanvas(card));
    cache.set(key, tex);
  }
  return tex;
}

let back: THREE.Texture | null = null;

export function backTexture(): THREE.Texture {
  back ??= toTexture(backCanvas());
  return back;
}

let glow: THREE.Texture | null = null;

/** 可以出的牌後面那圈光 */
export function glowTexture(): THREE.Texture {
  if (glow) return glow;
  const pad = 48;
  const [c, g] = canvas(W + pad * 2, H + pad * 2);
  g.shadowColor = '#fff';
  g.shadowBlur = 40;
  g.fillStyle = '#fff';
  for (let i = 0; i < 3; i++) {
    rounded(g, pad, pad, W, H, R);
    g.fill();
  }
  // 挖掉中間，只留外圈
  g.globalCompositeOperation = 'destination-out';
  g.shadowBlur = 0;
  rounded(g, pad + 8, pad + 8, W - 16, H - 16, R);
  g.fill();
  glow = new THREE.CanvasTexture(c);
  return glow;
}

/** 桌面上的絨布 */
export function feltTexture(): THREE.Texture {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const bg = g.createRadialGradient(S / 2, S / 2, 40, S / 2, S / 2, S * 0.55);
  bg.addColorStop(0, '#1d6b52');
  bg.addColorStop(0.6, '#0f3f33');
  bg.addColorStop(1, '#07201c');
  g.fillStyle = bg;
  g.fillRect(0, 0, S, S);
  // 絨布的雜點
  const img = g.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 14;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
  // 中間淡淡的 logo
  g.save();
  g.translate(S / 2, S / 2 + 250);
  g.globalAlpha = 0.1;
  label(g, 'MadCards', 0, 0, 90, 460, '#ffffff', 'transparent');
  g.restore();
  const t = toTexture(c);
  t.anisotropy = 4;
  return t;
}

/** 圓形的柔光點，粒子用 */
export function dotTexture(): THREE.Texture {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
