import { getCardDef, type Card, type ChallengeResult, type Color, type RoomView } from '@crazyuno/shared';

/** 比對前後兩次畫面資料，推算出剛剛發生了什麼事，用來放動畫和音效 */
export type GameEvent =
  | { t: 'start' }
  | { t: 'play'; by: string; card: Card }
  | { t: 'draw'; id: string; n: number }
  | { t: 'stack'; total: number }
  | { t: 'color'; color: Color }
  | { t: 'reverse' }
  /** 換手牌（大風吹、0/7 規則）：card 是造成換牌的那張，moves 是誰的整手牌給了誰 */
  | { t: 'swap'; card: Card; moves: [from: string, to: string][] }
  | { t: 'mirror' }
  | { t: 'dice'; roll: number }
  /** 清倉：跟著一起丟到棄牌堆的牌（壓在清倉那張下面） */
  | { t: 'sweep'; by: string; cards: Card[] }
  /** +4 質疑的結果：guilty = 猜對了，cards 是亮出來的證據 */
  | ({ t: 'challenge' } & ChallengeResult)
  | { t: 'out'; id: string }
  | { t: 'uno'; id: string }
  | { t: 'caught' }
  | { t: 'timeout'; id: string }
  /** 整局時間到 */
  | { t: 'timeUp' }
  | { t: 'yourTurn' }
  /** 斷線了，機器人接手 */
  | { t: 'offline'; id: string }
  /** 斷線的人回來了 */
  | { t: 'online'; id: string }
  /** 自己在遊戲中途（重新）連進來 */
  | { t: 'rejoin' }
  | { t: 'end'; winnerId: string | null };

export function diffViews(prev: RoomView | null, next: RoomView): GameEvent[] {
  const a = prev?.game;
  const b = next.game;
  if (!b) return [];
  if (!a || (a.phase === 'ended' && b.phase === 'playing')) {
    // 紀錄不只「遊戲開始」那一行 = 已經打了一陣子，是中途連進來的
    const first: GameEvent = !a && b.log.length > 1 ? { t: 'rejoin' } : { t: 'start' };
    return b.turnId === next.you && b.phase === 'playing' ? [first, { t: 'yourTurn' }] : [first];
  }

  const events: GameEvent[] = [];
  const played = b.topCard.id !== a.topCard.id;
  const swap = b.handSwap && b.handSwap.seq !== a.handSwap?.seq ? b.handSwap : null;
  const sweep = b.bulkDiscard && b.bulkDiscard.seq !== a.bulkDiscard?.seq ? b.bulkDiscard : null;
  const challenge = b.challengeResult && b.challengeResult.seq !== a.challengeResult?.seq ? b.challengeResult : null;

  // 清倉丟掉的牌要先放進棄牌堆，清倉那張才會疊在它們上面
  if (sweep) events.push({ t: 'sweep', by: sweep.by, cards: sweep.cards });
  if (challenge) events.push({ t: 'challenge', ...challenge });
  if (played) {
    // 只有輪到的人能出牌，所以出牌的是上一個畫面的 turnId
    events.push({ t: 'play', by: a.turnId, card: b.topCard });
    if (b.currentColor !== a.currentColor || getCardDef(b.topCard.kind).wild) events.push({ t: 'color', color: b.currentColor });
  }
  if (swap) events.push({ t: 'swap', card: b.topCard, moves: swap.moves });
  if (b.pendingDraw > a.pendingDraw) events.push({ t: 'stack', total: b.pendingDraw });
  if (b.direction !== a.direction) events.push({ t: 'reverse' });

  for (const p of b.players) {
    const old = a.players.find((q) => q.id === p.id);
    if (!old) continue;
    // 換手牌會讓張數亂跳，不算抽牌
    if (!swap && p.handCount > old.handCount) events.push({ t: 'draw', id: p.id, n: p.handCount - old.handCount });
    if (p.out && !old.out) events.push({ t: 'out', id: p.id });
    if (p.unoSafe && !old.unoSafe) events.push({ t: 'uno', id: p.id });
  }

  // 座位的連線狀態：遊戲中有人斷線（機器人接手）或回來
  for (const seat of next.seats) {
    const old = prev!.seats.find((s) => s.id === seat.id);
    if (!old || old.connected === seat.connected || !b.players.some((p) => p.id === seat.id && !p.out)) continue;
    events.push({ t: seat.connected ? 'online' : 'offline', id: seat.id });
  }

  for (const line of newLines(a.log, b.log)) {
    const roll = line.match(/🎲 骰出了 (\d+)/);
    if (roll) events.push({ t: 'dice', roll: Number(roll[1]) });
    else if (line.startsWith('🪞')) events.push({ t: 'mirror' });
    else if (line.startsWith('🚨')) events.push({ t: 'caught' });
    else if (line.startsWith('⏰')) events.push({ t: 'timeout', id: a.turnId });
    else if (line.startsWith('⌛')) events.push({ t: 'timeUp' });
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
