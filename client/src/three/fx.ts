/**
 * 特效的廣播站：導演（director）喊一聲，3D 場景和畫面上的大字各自接收。
 */

export type Vec3 = [number, number, number];

export type FxEvent =
  /** 一團粒子噴出來 */
  | { kind: 'burst'; at: Vec3; colors: string[]; count: number; speed: number; up?: number; gravity?: number; size?: number; life?: number }
  /** 從天上灑下來的彩帶 */
  | { kind: 'confetti'; count: number }
  /** 桌面上擴散的光圈 */
  | { kind: 'ring'; at: Vec3; color: string; size: number; life?: number }
  /** 鏡頭晃動，0~1 */
  | { kind: 'shake'; amount: number }
  /** 鏡頭繞桌子轉一圈 */
  | { kind: 'spin' }
  /** 畫面邊緣紅藍分離 */
  | { kind: 'aberration'; amount: number }
  /** 畫面中間砸下來的大字 */
  | { kind: 'text'; text: string; tone?: 'normal' | 'danger' | 'uno' | 'gold'; color?: string }
  /** 全螢幕閃一下 */
  | { kind: 'flash'; color: string; strength?: number };

type Listener = (e: FxEvent) => void;
const listeners = new Set<Listener>();

export function emitFx(e: FxEvent, delayMs = 0) {
  if (delayMs > 0) {
    setTimeout(() => emitFx(e), delayMs);
    return;
  }
  for (const l of listeners) l(e);
}

export function onFx(l: Listener) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
