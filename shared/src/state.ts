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

/** 所有還在場上的人把整手牌傳給下一家（照目前方向），傳完大家都要重喊 LAST! */
export function passHands(state: GameState): void {
  const active = state.players.map((_, i) => i).filter((i) => !state.players[i].out);
  const hands = active.map((i) => state.players[i].hand);
  const moves: [string, string][] = [];
  for (let k = 0; k < active.length; k++) {
    const to = nextActive(state, active[k]);
    state.players[to].hand = hands[k];
    moves.push([state.players[active[k]].id, state.players[to].id]);
  }
  for (const p of state.players) p.unoSafe = false;
  recordSwap(state, moves);
}

/** 兩個人交換整手牌 */
export function swapHands(state: GameState, a: number, b: number): void {
  const pa = state.players[a];
  const pb = state.players[b];
  [pa.hand, pb.hand] = [pb.hand, pa.hand];
  pa.unoSafe = false;
  pb.unoSafe = false;
  recordSwap(state, [
    [pa.id, pb.id],
    [pb.id, pa.id],
  ]);
}

function recordSwap(state: GameState, moves: [string, string][]): void {
  state.handSwap = { seq: (state.handSwap?.seq ?? 0) + 1, moves };
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
