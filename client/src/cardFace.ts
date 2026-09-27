import { getCardDef, type Card, type CardKind, type Color } from '@crazyuno/shared';

/**
 * 牌面用 canvas 畫出來。3D 牌桌拿去當貼圖，大廳和畫面上的小圖拿去當圖片。
 * 這個檔案不能 import three，大廳才不會把整包 3D 一起載進來。
 */

export const COLOR_HEX: Record<Color, string> = {
  red: '#ff3b3f',
  yellow: '#ffc400',
  green: '#22c875',
  blue: '#2f86ff',
};

/** 牌面在 canvas 上畫的解析度 */
export const FACE_W = 256;
export const FACE_H = 384;
const W = FACE_W;
const H = FACE_H;
const R = 28;
const FONT = '"Arial Black", "Segoe UI Black", "Noto Sans TC", "Microsoft JhengHei", sans-serif';
const INK = '#111';

export function makeCanvas(w = W, h = H) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function rounded(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.roundRect(x, y, w, h, r);
}

/** 在 (x, y) 畫一段置中的字，寬度超過 maxW 就縮小 */
export function label(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  maxW: number,
  fill: string | CanvasGradient,
  stroke = '#000',
) {
  g.save();
  g.translate(x, y);
  g.font = `italic 900 ${size}px ${FONT}`;
  const w = g.measureText(text).width;
  if (w > maxW) g.scale(maxW / w, maxW / w);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = size * 0.14;
  g.strokeStyle = stroke;
  g.strokeText(text, 0, 0);
  g.fillStyle = fill;
  g.fillText(text, 0, 0);
  g.restore();
}

// ---------- 圖示：畫在 (0, 0) 為中心、大小 s 的方框裡 ----------

type Icon = (g: CanvasRenderingContext2D, s: number, fill: string) => void;

/** 先畫一圈黑邊再填色，在什麼底色上都看得清楚 */
function inked(g: CanvasRenderingContext2D, s: number, path: () => void, fill: string, mode: 'fill' | 'stroke', lw = 0) {
  g.lineJoin = 'round';
  g.lineCap = 'round';
  path();
  g.strokeStyle = INK;
  g.lineWidth = lw + s * 0.07;
  g.stroke();
  path();
  if (mode === 'fill') {
    g.fillStyle = fill;
    g.fill();
  } else {
    g.strokeStyle = fill;
    g.lineWidth = lw;
    g.stroke();
  }
}

const ICONS: Partial<Record<CardKind, Icon>> = {
  // 禁止：圓圈加一條斜線
  skip(g, s, fill) {
    const r = s * 0.34;
    inked(
      g,
      s,
      () => {
        g.beginPath();
        g.arc(0, 0, r, 0, Math.PI * 2);
        g.moveTo(-r * 0.7, r * 0.7);
        g.lineTo(r * 0.7, -r * 0.7);
      },
      fill,
      'stroke',
      s * 0.13,
    );
  },

  // 迴轉：兩支反方向的箭頭
  reverse(g, s, fill) {
    const t = s * 0.07;
    const h = s * 0.17;
    const arrow = () => {
      g.beginPath();
      g.moveTo(-s * 0.36, -t);
      g.lineTo(s * 0.08, -t);
      g.lineTo(s * 0.08, -h);
      g.lineTo(s * 0.36, 0);
      g.lineTo(s * 0.08, h);
      g.lineTo(s * 0.08, t);
      g.lineTo(-s * 0.36, t);
      g.closePath();
    };
    g.save();
    g.rotate(-Math.PI / 4);
    for (const dir of [1, -1]) {
      g.save();
      g.translate(0, dir * s * 0.13);
      g.scale(dir, 1);
      inked(g, s, arrow, fill, 'fill');
      g.restore();
    }
    g.restore();
  },

  // 變色：四角星
  wild(g, s, fill) {
    inked(g, s, () => star(g, 4, s * 0.44, s * 0.12), fill, 'fill');
  },

  // 鏡子：有柄的手鏡
  mirror(g, s, fill) {
    inked(g, s, () => rounded(g, -s * 0.06, s * 0.14, s * 0.12, s * 0.34, s * 0.04), fill, 'fill');
    inked(
      g,
      s,
      () => {
        g.beginPath();
        g.ellipse(0, -s * 0.1, s * 0.27, s * 0.32, 0, 0, Math.PI * 2);
      },
      fill,
      'fill',
    );
    const glass = g.createLinearGradient(-s * 0.2, -s * 0.35, s * 0.2, s * 0.15);
    glass.addColorStop(0, '#ffffff');
    glass.addColorStop(0.5, '#bdf3ff');
    glass.addColorStop(1, '#6fcfff');
    g.beginPath();
    g.ellipse(0, -s * 0.1, s * 0.2, s * 0.25, 0, 0, Math.PI * 2);
    g.fillStyle = glass;
    g.fill();
    g.strokeStyle = '#fff';
    g.lineWidth = s * 0.03;
    g.beginPath();
    g.moveTo(-s * 0.1, -s * 0.22);
    g.lineTo(s * 0.02, -s * 0.34);
    g.moveTo(-s * 0.12, -s * 0.08);
    g.lineTo(s * 0.08, -s * 0.28);
    g.stroke();
  },

  // +骰子
  dice(g, s, fill) {
    inked(
      g,
      s,
      () => {
        const a = s * 0.1;
        const b = s * 0.035;
        g.beginPath();
        g.save();
        g.translate(-s * 0.28, 0);
        g.moveTo(-a, -b);
        g.lineTo(-b, -b);
        g.lineTo(-b, -a);
        g.lineTo(b, -a);
        g.lineTo(b, -b);
        g.lineTo(a, -b);
        g.lineTo(a, b);
        g.lineTo(b, b);
        g.lineTo(b, a);
        g.lineTo(-b, a);
        g.lineTo(-b, b);
        g.lineTo(-a, b);
        g.closePath();
        g.restore();
      },
      fill,
      'fill',
    );
    g.save();
    g.translate(s * 0.12, 0);
    g.rotate(0.26);
    const d = s * 0.42;
    inked(g, s, () => rounded(g, -d / 2, -d / 2, d, d, s * 0.08), '#fff', 'fill');
    const p = d * 0.27;
    for (const [x, y] of [
      [-p, -p],
      [p, -p],
      [-p, p],
      [p, p],
      [0, 0],
    ]) {
      g.beginPath();
      g.arc(x, y, s * 0.042, 0, Math.PI * 2);
      g.fillStyle = x === 0 && y === 0 ? '#e5383b' : INK;
      g.fill();
    }
    g.restore();
  },

  // 大風吹：漩渦
  swapAll(g, s, fill) {
    inked(
      g,
      s,
      () => {
        g.beginPath();
        for (let i = 0; i <= 100; i++) {
          const t = i / 100;
          const a = t * Math.PI * 4.3;
          const r = s * (0.03 + 0.36 * t);
          if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
          else g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.85);
        }
      },
      fill,
      'stroke',
      s * 0.09,
    );
  },
};

function star(g: CanvasRenderingContext2D, points: number, outer: number, inner: number) {
  g.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const a = (i * Math.PI) / points - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else g.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  g.closePath();
}

// ---------- 牌面 ----------

const faceCache = new Map<string, HTMLCanvasElement>();
const urlCache = new Map<string, string>();

const keyOf = (card: Pick<Card, 'kind' | 'color' | 'value'>) => `${card.kind}:${card.color}:${card.value ?? ''}`;

export function faceCanvas(card: Pick<Card, 'kind' | 'color' | 'value'>): HTMLCanvasElement {
  const key = keyOf(card);
  const hit = faceCache.get(key);
  if (hit) return hit;

  const def = getCardDef(card.kind);
  const icon = ICONS[card.kind];
  const text = card.kind === 'number' ? String(card.value) : def.label;
  const legendary = card.kind === 'draw99';
  const [c, g] = makeCanvas();

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

  // 中間的大圖示或大字
  const main = card.color ? COLOR_HEX[card.color] : '#ffffff';
  if (icon) {
    g.save();
    g.translate(W / 2, H / 2);
    icon(g, 200, main);
    g.restore();
  } else {
    let fill: string | CanvasGradient = main;
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
  }

  // 角落小圖示或小字（右下角轉 180 度）
  const corner = legendary ? '#ffd34d' : '#fff';
  for (const flip of [false, true]) {
    g.save();
    if (flip) {
      g.translate(W, H);
      g.rotate(Math.PI);
    }
    if (icon) {
      g.translate(46, 52);
      icon(g, 62, corner);
    } else {
      label(g, text, 46, 50, 46, 60, corner);
    }
    g.restore();
  }

  faceCache.set(key, c);
  return c;
}

let backCache: HTMLCanvasElement | null = null;

export function backCanvas(): HTMLCanvasElement {
  if (backCache) return backCache;
  const [c, g] = makeCanvas();
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

  backCache = c;
  return c;
}

/** 牌面圖片網址（HTML 的 <img> 用） */
export function faceImage(card: Pick<Card, 'kind' | 'color' | 'value'>): string {
  const key = keyOf(card);
  let url = urlCache.get(key);
  if (!url) {
    url = faceCanvas(card).toDataURL();
    urlCache.set(key, url);
  }
  return url;
}

let backUrl: string | null = null;

export function backImage(): string {
  backUrl ??= backCanvas().toDataURL();
  return backUrl;
}
