import type { GameState } from './types';

/** 還在場上（沒爆牌、沒離開）的玩家數 */
export function activeCount(state: GameState): number {
  return state.players.filter((p) => !p.out).length;
}

/** 從 from 開始，照目前方向往前走 steps 個「還在場上」的玩家 */
export function nextActive(state: GameState, from: number, steps = 1): number {
  const n = state.players.length;
  let i = from;
  let moved = 0;
  // 最多繞 n * steps 圈，避免全部出局時卡死
  for (let guard = 0; moved < steps && guard < n * (steps + 1); guard++) {
    i = (i + state.direction + n) % n;
    if (!state.players[i].out) moved++;
  }
  return i;
}

/** 把抽牌數疊上去，並記住是誰疊的（鏡子牌要用） */
export function addPendingDraw(state: GameState, amount: number, fromIndex: number): void {
  state.pendingDraw += amount;
  state.pendingFrom = fromIndex;
}

export function reverseDirection(state: GameState): void {
  state.direction = state.direction === 1 ? -1 : 1;
}

export function pushLog(state: GameState, msg: string): void {
  state.log.push(msg);
  if (state.log.length > 30) state.log.splice(0, state.log.length - 30);
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
