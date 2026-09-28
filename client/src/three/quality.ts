/**
 * 畫質：high = 後製特效（泛光、紅藍分離）、高解析度、滿滿的粒子；low = 省電，舊手機用。
 *
 * 記在 localStorage：
 *   'high' / 'low' — 玩家自己按按鈕選的，照他的
 *   'auto-low'     — 之前跑不動被自動降過，下次直接從省電開始（玩家還是可以手動切回高）
 */
export type Quality = 'high' | 'low';

export interface QualityState {
  quality: Quality;
  /** 玩家自己選的就不再自動降級 */
  userChosen: boolean;
}

const KEY = 'crazyuno:quality';

function read(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

function write(v: string) {
  try {
    localStorage.setItem(KEY, v);
  } catch {
    // 無痕模式存不了，只影響下次開啟
  }
}

export function initialQuality(): QualityState {
  // 網址加 ?hq 強制高畫質（測試用）
  if (new URLSearchParams(location.search).has('hq')) return { quality: 'high', userChosen: true };
  const saved = read();
  if (saved === 'high' || saved === 'low') return { quality: saved, userChosen: true };
  if (saved === 'auto-low') return { quality: 'low', userChosen: false };
  // 記憶體很小的手機一開始就用省電（只有 Android 的 Chrome 有這個值）
  const memory = (navigator as { deviceMemory?: number }).deviceMemory;
  if (memory !== undefined && memory <= 3) return { quality: 'low', userChosen: false };
  return { quality: 'high', userChosen: false };
}

export function chooseQuality(q: Quality) {
  write(q);
}

/** 自動降級：記起來，下次直接省電 */
export function rememberAutoLow() {
  if (read() === null) write('auto-low');
}
