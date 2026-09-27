import { getCardDef, type Card, type Color, type RoomView } from '@crazyuno/shared';

/** 比對前後兩次畫面資料，推算出剛剛發生了什麼事，用來放動畫和音效 */
export type GameEvent =
  | { t: 'start' }
  | { t: 'play'; by: string; card: Card }
  | { t: 'draw'; id: string; n: number }
  | { t: 'stack'; total: number }
  | { t: 'color'; color: Color }
  | { t: 'reverse' }
  | { t: 'swap'; by: string }
  | { t: 'mirror' }
  | { t: 'dice'; roll: number }
  | { t: 'out'; id: string }
  | { t: 'uno'; id: string }
  | { t: 'caught' }
  | { t: 'timeout' }
  | { t: 'yourTurn' }
  | { t: 'end'; winnerId: string | null };

export function diffViews(prev: RoomView | null, next: RoomView): GameEvent[] {
  const a = prev?.game;
  const b = next.game;
  if (!b) return [];
  if (!a || (a.phase === 'ended' && b.phase === 'playing')) {
    return b.turnId === next.you ? [{ t: 'start' }, { t: 'yourTurn' }] : [{ t: 'start' }];
  }

  const events: GameEvent[] = [];
  const played = b.topCard.id !== a.topCard.id;
  const swapped = played && b.topCard.kind === 'swapAll';

  if (played) {
    // 只有輪到的人能出牌，所以出牌的是上一個畫面的 turnId
    events.push({ t: 'play', by: a.turnId, card: b.topCard });
    if (b.currentColor !== a.currentColor || getCardDef(b.topCard.kind).wild) events.push({ t: 'color', color: b.currentColor });
    if (swapped) events.push({ t: 'swap', by: a.turnId });
  }
  if (b.pendingDraw > a.pendingDraw) events.push({ t: 'stack', total: b.pendingDraw });
  if (b.direction !== a.direction) events.push({ t: 'reverse' });

  for (const p of b.players) {
    const old = a.players.find((q) => q.id === p.id);
    if (!old) continue;
    // 大風吹會讓每個人的張數亂跳，不算抽牌
    if (!swapped && p.handCount > old.handCount) events.push({ t: 'draw', id: p.id, n: p.handCount - old.handCount });
    if (p.out && !old.out) events.push({ t: 'out', id: p.id });
    if (p.unoSafe && !old.unoSafe) events.push({ t: 'uno', id: p.id });
  }

  for (const line of newLines(a.log, b.log)) {
    const roll = line.match(/🎲 骰出了 (\d+)/);
    if (roll) events.push({ t: 'dice', roll: Number(roll[1]) });
    else if (line.startsWith('🪞')) events.push({ t: 'mirror' });
    else if (line.startsWith('🚨')) events.push({ t: 'caught' });
    else if (line.startsWith('⏰')) events.push({ t: 'timeout' });
  }

  if (a.phase === 'playing' && b.phase === 'ended') events.push({ t: 'end', winnerId: b.winnerId });
  else if (b.phase === 'playing' && b.turnId === next.you && a.turnId !== next.you) events.push({ t: 'yourTurn' });

  return events;
}

/** 紀錄最多只留 30 行，舊的會被擠掉，所以要找出新舊重疊的地方 */
function newLines(before: string[], after: string[]): string[] {
  for (let s = 0; s <= before.length; s++) {
    const tail = before.slice(s);
    if (tail.length <= after.length && tail.every((line, i) => after[i] === line)) return after.slice(tail.length);
  }
  return after;
}
