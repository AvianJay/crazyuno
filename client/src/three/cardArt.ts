import { getCardDef, type Card, type Color } from '@crazyuno/shared';
import * as THREE from 'three';

/** 牌在 3D 世界的大小 */
export const CARD_W = 1;
export const CARD_H = 1.5;

export const COLOR_HEX: Record<Color, string> = {
  red: '#ff3b3f',
  yellow: '#ffc400',
  green: '#22c875',
  blue: '#2f86ff',
};

/** 牌面在 canvas 上畫的解析度 */
const W = 256;
const H = 384;
const R = 28;
const FONT = '"Arial Black", "Segoe UI Black", "Noto Sans TC", "Microsoft JhengHei", sans-serif';

const cache = new Map<string, THREE.Texture>();

function canvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

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

const isEmoji = (s: string) => /\p{Extended_Pictographic}/u.test(s);

/** 在 (x, y) 畫一段置中的字，寬度超過 maxW 就縮小 */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, maxW: number, fill: string | CanvasGradient, stroke = '#000') {
  g.save();
  g.translate(x, y);
  g.font = `italic 900 ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.scale(maxW / w, maxW / w);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (!isEmoji(text)) {
    g.lineJoin = 'round';
    g.lineWidth = size * 0.14;
    g.strokeStyle = stroke;
    g.strokeText(text, 0, 0);
  }
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

export function faceTexture(card: Card): THREE.Texture {
  const key = `${card.kind}:${card.color}:${card.value ?? ''}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const def = getCardDef(card.kind);
  const text = card.kind === 'number' ? String(card.value) : def.label;
  const legendary = card.kind === 'draw99';
  const [c, g] = canvas();

  // 外框：一般牌白色，怪牌是霓虹粉紫，+99 是金色
  let frame: string | CanvasGradient = '#fbfaf5';
  if (def.crazy) {
    frame = g.createLinearGradient(0, 0, W, H);
    if (legendary) {
      frame.addColorStop(0, '#fff3a8');
      frame.addColorStop(0.5, '#d4a017');
      frame.addColorStop(1, '#fff3a8');
    } else {
      frame.addColorStop(0, '#ff4fd8');
      frame.addColorStop(0.5, '#7b5cff');
      frame.addColorStop(1, '#3ee0ff');
    }
  }
  rounded(g, 0, 0, W, H, R);
  g.fillStyle = frame;
  g.fill();

  // 底色
  rounded(g, 14, 14, W - 28, H - 28, R - 10);
  if (legendary) {
    const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, H * 0.6);
    bg.addColorStop(0, '#7a0000');
    bg.addColorStop(1, '#0a0000');
    g.fillStyle = bg;
  } else {
    g.fillStyle = card.color ? COLOR_HEX[card.color] : '#15151d';
  }
  g.fill();

  // 怪牌加斜線花紋
  if (def.crazy) {
    g.save();
    g.clip();
    g.strokeStyle = 'rgba(255,255,255,0.08)';
    g.lineWidth = 10;
    for (let x = -H; x < W + H; x += 28) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x + H, H);
      g.stroke();
    }
    g.restore();
  }

  // 中間斜斜的橢圓
  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.42);
  g.beginPath();
  g.ellipse(0, 0, 86, 150, 0, 0, Math.PI * 2);
  if (legendary) {
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 6;
    g.stroke();
  } else if (card.color) {
    g.fillStyle = '#fbfaf5';
    g.fill();
  } else {
    // 萬用牌：橢圓裡是四色
    g.clip();
    const colors = [COLOR_HEX.red, COLOR_HEX.blue, COLOR_HEX.yellow, COLOR_HEX.green];
    colors.forEach((col, i) => {
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, 200, (i * Math.PI) / 2, ((i + 1) * Math.PI) / 2);
      g.fillStyle = col;
      g.fill();
    });
  }
  g.restore();

  // 大字
  let fill: string | CanvasGradient = card.color ? COLOR_HEX[card.color] : '#ffffff';
  if (legendary) {
    const gold = g.createLinearGradient(0, H / 2 - 60, 0, H / 2 + 60);
    gold.addColorStop(0, '#fff6c2');
    gold.addColorStop(0.5, '#ffc21a');
    gold.addColorStop(1, '#b36b00');
    fill = gold;
    g.shadowColor = '#ff2020';
    g.shadowBlur = 30;
  }
  const size = text.length <= 1 ? 150 : text.length === 2 ? 120 : 100;
  label(g, text, W / 2, H / 2 + 6, size, 190, fill);
  g.shadowBlur = 0;
  // 6 和 9 加底線才分得出來
  if (card.kind === 'number' && (card.value === 6 || card.value === 9)) {
    g.fillStyle = '#000';
    g.fillRect(W / 2 - 34, H / 2 + 72, 68, 10);
  }

  // 角落小字
  const corner = legendary ? '#ffd34d' : '#fff';
  label(g, text, 46, 50, 46, 60, corner);
  g.save();
  g.translate(W, H);
  g.rotate(Math.PI);
  label(g, text, 46, 50, 46, 60, corner);
  g.restore();

  const tex = toTexture(c);
  cache.set(key, tex);
  return tex;
}

let back: THREE.Texture | null = null;

export function backTexture(): THREE.Texture {
  if (back) return back;
  const [c, g] = canvas();
  rounded(g, 0, 0, W, H, R);
  g.fillStyle = '#fbfaf5';
  g.fill();
  rounded(g, 14, 14, W - 28, H - 28, R - 10);
  const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.6);
  bg.addColorStop(0, '#2a1036');
  bg.addColorStop(1, '#0b0610');
  g.fillStyle = bg;
  g.fill();

  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.42);
  g.beginPath();
  g.ellipse(0, 0, 86, 150, 0, 0, Math.PI * 2);
  g.fillStyle = COLOR_HEX.red;
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = '#ffd34d';
  g.stroke();
  g.restore();

  g.save();
  g.translate(W / 2, H / 2);
  g.rotate(-0.42);
  label(g, 'UNO', 0, 0, 84, 170, COLOR_HEX.yellow);
  g.restore();
  label(g, '瘋狂', W / 2, 62, 34, 120, '#ff4fd8', '#000');

  back = toTexture(c);
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
  label(g, '瘋狂 UNO', 0, 0, 90, 460, '#ffffff', 'transparent');
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
