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

/** 牌面中間的招牌造型：以 (0, 0) 為中心、半寬 hw、半高 hh 的圓角菱形 */
const DW = 104;
const DH = 140;

function diamond(g: CanvasRenderingContext2D, hw: number, hh: number, r: number) {
  const pts = [
    [0, -hh],
    [hw, 0],
    [0, hh],
    [-hw, 0],
  ];
  g.beginPath();
  g.moveTo(hw / 2, -hh / 2);
  for (let i = 1; i <= 4; i++) {
    const [px, py] = pts[i % 4];
    const [nx, ny] = pts[(i + 1) % 4];
    g.arcTo(px, py, (px + nx) / 2, (py + ny) / 2, r);
  }
  g.closePath();
}

/**
 * 萬用牌的四色菱形：沿著跟邊平行的兩條線切成上右下左四塊小菱形，
 * 排法跟選顏色的四個菱形一樣（上紅、右黃、下藍、左綠）。
 */
function fourColorDiamond(g: CanvasRenderingContext2D, hw: number, hh: number, r: number) {
  const x = hw / 2;
  const y = hh / 2;
  const parts: [string, number[][]][] = [
    [COLOR_HEX.red, [[0, -hh], [x, -y], [0, 0], [-x, -y]]],
    [COLOR_HEX.yellow, [[hw, 0], [x, y], [0, 0], [x, -y]]],
    [COLOR_HEX.blue, [[0, hh], [-x, y], [0, 0], [x, y]]],
    [COLOR_HEX.green, [[-hw, 0], [-x, -y], [0, 0], [-x, y]]],
  ];
  g.save();
  diamond(g, hw, hh, r);
  g.clip();
  for (const [color, poly] of parts) {
    g.beginPath();
    poly.forEach(([px, py], i) => (i === 0 ? g.moveTo(px, py) : g.lineTo(px, py)));
    g.closePath();
    g.fillStyle = color;
    g.fill();
  }
  // 四塊之間的白線
  g.strokeStyle = '#fbfaf5';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(-x, -y);
  g.lineTo(x, y);
  g.moveTo(x, -y);
  g.lineTo(-x, y);
  g.stroke();
  g.restore();
  diamond(g, hw, hh, r);
  g.strokeStyle = '#fbfaf5';
  g.lineWidth = 5;
  g.stroke();
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

  // 見者有份：+2 往四面八方炸開
  drawAll(g, s, fill) {
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * Math.PI * 2;
      const [x, y] = [Math.cos(a), Math.sin(a)];
      inked(
        g,
        s,
        () => {
          g.beginPath();
          g.moveTo(x * s * 0.33, y * s * 0.33);
          g.lineTo(x * s * 0.46, y * s * 0.46);
        },
        fill,
        'stroke',
        s * 0.075,
      );
    }
    label(g, '+2', 0, s * 0.02, s * 0.4, s * 0.46, fill);
  },

  // 清倉：一疊牌一口氣飛出去
  discardAll(g, s, fill) {
    for (const [y, len] of [
      [-0.02, 0.2],
      [0.14, 0.3],
      [0.3, 0.16],
    ]) {
      inked(
        g,
        s,
        () => {
          g.beginPath();
          g.moveTo(-s * 0.46, s * y);
          g.lineTo(-s * (0.46 - len), s * (y - len * 0.6));
        },
        fill,
        'stroke',
        s * 0.06,
      );
    }
    for (let i = 0; i < 3; i++) {
      g.save();
      g.translate(s * (-0.06 + i * 0.14), s * (0.06 - i * 0.12));
      g.rotate(-0.5 + i * 0.28);
      inked(g, s, () => rounded(g, -s * 0.12, -s * 0.18, s * 0.24, s * 0.36, s * 0.05), i === 2 ? fill : '#fff', 'fill');
      g.restore();
    }
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

  // 中間的圓角菱形：有色牌是白的，萬用牌四色，+99 是金色外框
  g.save();
  g.translate(W / 2, H / 2);
  if (legendary) {
    diamond(g, DW, DH, 18);
    g.shadowColor = '#ff2020';
    g.shadowBlur = 18;
    g.strokeStyle = '#ffd34d';
    g.lineWidth = 6;
    g.stroke();
    g.shadowBlur = 0;
    diamond(g, DW - 16, DH - 22, 12);
    g.strokeStyle = 'rgba(255, 211, 77, 0.45)';
    g.lineWidth = 2;
    g.stroke();
  } else if (card.color) {
    diamond(g, DW, DH, 18);
    g.shadowColor = 'rgba(0, 0, 0, 0.35)';
    g.shadowBlur = 12;
    g.shadowOffsetY = 4;
    g.fillStyle = '#fbfaf5';
    g.fill();
  } else {
    fourColorDiamond(g, DW, DH, 18);
  }
  g.restore();

  // 中間的大圖示或大字（要塞得進菱形裡）
  const main = card.color ? COLOR_HEX[card.color] : '#ffffff';
  if (icon) {
    g.save();
    g.translate(W / 2, H / 2);
    icon(g, 165, main);
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
    const size = text.length <= 1 ? 136 : text.length === 2 ? 96 : 84;
    label(g, text, W / 2, H / 2 + 4, size, legendary ? 170 : 140, fill);
    g.shadowBlur = 0;
    // 6 和 9 加底線才分得出來
    if (card.kind === 'number' && (card.value === 6 || card.value === 9)) {
      g.fillStyle = '#000';
      g.fillRect(W / 2 - 28, H / 2 + 58, 56, 9);
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

  // 深紫底 + 菱形格紋
  rounded(g, 14, 14, W - 28, H - 28, R - 10);
  const bg = g.createRadialGradient(W / 2, H / 2, 20, W / 2, H / 2, H * 0.62);
  bg.addColorStop(0, '#2b1450');
  bg.addColorStop(1, '#0a0716');
  g.fillStyle = bg;
  g.fill();
  g.save();
  g.clip();
  g.strokeStyle = 'rgba(123, 92, 255, 0.16)';
  g.lineWidth = 2;
  for (let x = -H; x < W + H; x += 24) {
    g.beginPath();
    g.moveTo(x, 0);
    g.lineTo(x + H * 0.75, H);
    g.moveTo(x, H);
    g.lineTo(x + H * 0.75, 0);
    g.stroke();
  }
  g.restore();

  // 四個角落的小菱形：遊戲的四種顏色
  const corners: [string, number, number][] = [
    [COLOR_HEX.red, 40, 46],
    [COLOR_HEX.yellow, W - 40, 46],
    [COLOR_HEX.green, 40, H - 46],
    [COLOR_HEX.blue, W - 40, H - 46],
  ];
  for (const [color, x, y] of corners) {
    g.save();
    g.translate(x, y);
    diamond(g, 11, 15, 3);
    g.fillStyle = color;
    g.fill();
    g.restore();
  }

  // 中間的霓虹菱形
  g.save();
  g.translate(W / 2, H / 2);
  diamond(g, DW, DH, 20);
  g.fillStyle = 'rgba(12, 6, 26, 0.85)';
  g.fill();
  const neon = g.createLinearGradient(-DW, -DH, DW, DH);
  neon.addColorStop(0, '#ff4fd8');
  neon.addColorStop(0.5, '#7b5cff');
  neon.addColorStop(1, '#3ee0ff');
  g.shadowColor = '#ff4fd8';
  g.shadowBlur = 20;
  g.strokeStyle = neon;
  g.lineWidth = 8;
  g.stroke();
  g.shadowBlur = 0;

  // 字：直的、不斜，跟品牌 logo 一樣
  const word = (text: string, y: number, size: number, maxW: number, fill: string | CanvasGradient, glow: string) => {
    g.save();
    g.translate(0, y);
    g.font = `900 ${size}px ${FONT}`;
    const w = g.measureText(text).width;
    if (w > maxW) g.scale(maxW / w, maxW / w);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = glow;
    g.shadowBlur = 14;
    g.fillStyle = fill;
    g.fillText(text, 0, 0);
    g.restore();
  };
  const mad = g.createLinearGradient(-70, 0, 70, 0);
  mad.addColorStop(0, '#ff8ae6');
  mad.addColorStop(1, '#ffffff');
  word('MAD', -16, 70, 150, mad, '#ff4fd8');
  word('CARDS', 38, 34, 118, '#8ff0ff', '#3ee0ff');
  g.restore();

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
