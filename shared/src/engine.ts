import { getCardDef, ALL_CARDS, type EffectContext } from './cards';
import { activeCount, nextActive, pushLog, shuffle } from './state';
import {
  COLORS,
  type Card,
  type CardKind,
  type Color,
  type GameSettings,
  type GameState,
  type GameView,
  type PlayMsg,
} from './types';

/** 玩家做了不合法的事（伺服器會把訊息顯示給他） */
export class GameError extends Error {}

export const DEFAULT_SETTINGS: GameSettings = {
  // 預設是普通 UNO，怪牌讓房主自己在大廳打開
  crazyCards: [],
  handLimit: 30,
  startingHand: 7,
  turnSeconds: 30,
  gameMinutes: 0,
  sevenZero: false,
  stacking: true,
  stackUp: false,
  cap99: false,
  challenge: false,
};

type Rng = () => number;

export function buildDeck(crazyCards: CardKind[], nextId: () => string): Card[] {
  const deck: Card[] = [];
  for (const def of ALL_CARDS) {
    if (def.crazy && !crazyCards.includes(def.kind)) continue;
    if (def.kind === 'number') {
      for (const color of COLORS) {
        deck.push({ id: nextId(), kind: 'number', color, value: 0 });
        for (let v = 1; v <= 9; v++) {
          deck.push({ id: nextId(), kind: 'number', color, value: v });
          deck.push({ id: nextId(), kind: 'number', color, value: v });
        }
      }
    } else if (def.wild) {
      for (let i = 0; i < def.count; i++) deck.push({ id: nextId(), kind: def.kind, color: null });
    } else {
      for (const color of COLORS) {
        for (let i = 0; i < def.count; i++) deck.push({ id: nextId(), kind: def.kind, color });
      }
    }
  }
  return deck;
}

export const COLOR_NAME: Record<Color, string> = { red: '紅', yellow: '黃', green: '綠', blue: '藍' };

export function cardName(card: Card): string {
  const color = card.color ? COLOR_NAME[card.color] : '';
  if (card.kind === 'number') return `${color}${card.value}`;
  return `${color}${getCardDef(card.kind).name}`;
}

export function createGame(
  players: { id: string; name: string; avatar: string | null }[],
  settings: GameSettings,
  rng: Rng = Math.random,
): GameState {
  const state: GameState = {
    phase: 'playing',
    players: players.map((p) => ({ ...p, hand: [], out: false, unoSafe: false })),
    drawPile: [],
    discardPile: [],
    currentColor: 'red',
    turn: Math.floor(rng() * players.length),
    turnSeq: 0,
    direction: 1,
    pendingDraw: 0,
    pendingFrom: null,
    stackLevel: 0,
    lastWild4: null,
    challengeResult: null,
    bulkDiscard: null,
    hasDrawn: false,
    handSwap: null,
    winnerId: null,
    settings,
    log: [],
    nextCardId: 0,
  };
  state.drawPile = shuffle(buildDeck(settings.crazyCards, () => newId(state)), rng);

  for (let i = 0; i < state.players.length; i++) {
    for (let k = 0; k < settings.startingHand; k++) state.players[i].hand.push(takeCard(state, rng));
  }

  // 第一張一定要是數字牌，其他的塞回牌堆底
  let first = takeCard(state, rng);
  while (first.kind !== 'number') {
    state.drawPile.unshift(first);
    first = takeCard(state, rng);
  }
  state.discardPile.push(first);
  state.currentColor = first.color!;

  pushLog(state, `遊戲開始！由 ${state.players[state.turn].name} 先出`);
  return state;
}

function newId(state: GameState): string {
  return `c${state.nextCardId++}`;
}

/** 從牌堆抽一張。牌堆空了就把棄牌堆洗回去，還是不夠就直接開一副新的。 */
function takeCard(state: GameState, rng: Rng): Card {
  if (state.drawPile.length === 0) {
    const top = state.discardPile.pop();
    state.drawPile = shuffle(state.discardPile, rng);
    state.discardPile = top ? [top] : [];
  }
  if (state.drawPile.length === 0) {
    state.drawPile = shuffle(buildDeck(state.settings.crazyCards, () => newId(state)), rng);
  }
  return state.drawPile.pop()!;
}

export function topCard(state: GameState): Card {
  return state.discardPile[state.discardPile.length - 1];
}

export function canPlay(state: GameState, card: Card): boolean {
  if (state.pendingDraw > 0) return canStack(state, card.kind);
  if (getCardDef(card.kind).wild) return true;
  if (card.color === state.currentColor) return true;
  const top = topCard(state);
  if (card.kind !== top.kind) return false;
  return card.kind !== 'number' || card.value === top.value;
}

/** 抽牌疊加中能不能出這張來接 */
function canStack(state: GameState, kind: CardKind): boolean {
  const def = getCardDef(kind);
  if (!def.stackable) return false;
  // 鏡子不是疊上去，是把整疊彈回去：疊加關掉、+99 封頂都擋不住它
  if (kind === 'mirror') return true;
  const s = state.settings;
  if (!s.stacking) return false;
  if (s.cap99 && state.stackLevel >= 99) return false;
  // 越疊越大：+2、+4、+99 只能往上疊；×2、骰子沒有大小，不受限
  return !(s.stackUp && def.rank !== undefined && def.rank < state.stackLevel);
}

/** 喊 LAST! 的時機：剩兩張以下，或手上的清倉一出就剩一張以下 */
export function canCallLast(hand: Pick<Card, 'kind' | 'color'>[]): boolean {
  if (hand.length <= 2) return true;
  return hand.some((c) => c.kind === 'discardAll' && hand.length - hand.filter((d) => d.color === c.color).length <= 1);
}

/** 0/7 規則下的 7：出的人要選一個人交換手牌 */
export function isSwapSeven(sevenZero: boolean, card: Pick<Card, 'kind' | 'value'>): boolean {
  return sevenZero && card.kind === 'number' && card.value === 7;
}

/** 出 7 可以選的人：還在場上的其他人 */
function swapCandidates(state: GameState, index: number): number[] {
  return state.players.map((_, i) => i).filter((i) => i !== index && !state.players[i].out);
}

/** 檢查出 7 選的人（場上只剩一個對手就不用選）。不是換牌的 7 回傳 undefined */
function swapTarget(state: GameState, index: number, card: Card, targetId: unknown): number | undefined {
  // 最後一張出 7 直接贏，不用換
  if (!isSwapSeven(state.settings.sevenZero, card) || state.players[index].hand.length === 1) return undefined;
  const candidates = swapCandidates(state, index);
  if (targetId === undefined && candidates.length === 1) return candidates[0];
  const target = state.players.findIndex((p) => p.id === targetId);
  if (!candidates.includes(target)) throw new GameError('選一個人跟你換手牌');
  return target;
}

/**
 * 「不限手牌」其實還是有個上限：×2 一直疊可以疊到幾百億張，真的一張一張抽的話伺服器會先被撐爆。
 * 手機畫面上幾百張牌也已經點不到了。
 */
export const MAX_HAND = 500;

/** 讓某位玩家抽 n 張，超過手牌上限就爆掉。回傳實際抽了幾張。 */
function drawCards(state: GameState, index: number, n: number, rng: Rng): number {
  const player = state.players[index];
  const limit = state.settings.handLimit || MAX_HAND;
  let drawn = 0;
  for (; drawn < n; drawn++) {
    player.hand.push(takeCard(state, rng));
    if (player.hand.length > limit) {
      drawn++;
      const msg = state.settings.handLimit
        ? `💥 ${player.name} 手牌超過 ${limit} 張，爆牌出局！`
        : `💥 ${player.name} 被 ${n} 張牌活埋了，爆牌出局！`;
      eliminate(state, index, msg);
      break;
    }
  }
  if (drawn > 0) player.unoSafe = false;
  return drawn;
}

function eliminate(state: GameState, index: number, msg: string): void {
  const player = state.players[index];
  player.out = true;
  state.drawPile.unshift(...player.hand);
  player.hand = [];
  if (state.pendingFrom === index) state.pendingFrom = null;
  if (state.lastWild4?.from === index) state.lastWild4 = null;
  pushLog(state, msg);
  if (activeCount(state) <= 1) {
    const winner = state.players.find((p) => !p.out);
    endGame(state, winner?.id ?? null);
  } else if (state.turn === index) {
    // 輪到他的時候出局：累積的抽牌作廢，換下一個人
    clearPending(state);
    setTurn(state, nextActive(state, index));
  }
}

function endGame(state: GameState, winnerId: string | null): void {
  state.phase = 'ended';
  state.winnerId = winnerId;
  const winner = state.players.find((p) => p.id === winnerId);
  pushLog(state, winner ? `🏆 ${winner.name} 贏了！` : '遊戲結束');
}

/** 這一疊抽牌結束了（被吃掉、質疑完、輪到的人出局） */
function clearPending(state: GameState): void {
  state.pendingDraw = 0;
  state.pendingFrom = null;
  state.stackLevel = 0;
  state.lastWild4 = null;
}

function setTurn(state: GameState, index: number): void {
  state.turn = index;
  state.turnSeq++;
  state.hasDrawn = false;
}

function requireTurn(state: GameState, playerId: string): number {
  if (state.phase !== 'playing') throw new GameError('遊戲已經結束了');
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1) throw new GameError('你不在這局遊戲裡');
  if (state.turn !== index) throw new GameError('還沒輪到你');
  return index;
}

// ---------------- 玩家動作 ----------------

export function playCard(state: GameState, playerId: string, msg: PlayMsg, rng: Rng = Math.random): void {
  const index = requireTurn(state, playerId);
  const player = state.players[index];
  const cardIndex = player.hand.findIndex((c) => c.id === msg.cardId);
  if (cardIndex === -1) throw new GameError('你沒有這張牌');
  const card = player.hand[cardIndex];
  if (!canPlay(state, card)) {
    throw new GameError(state.pendingDraw > 0 ? `你要接抽牌，或是抽 ${state.pendingDraw} 張` : '這張現在不能出');
  }
  const def = getCardDef(card.kind);
  if (def.wild && !(msg.color && COLORS.includes(msg.color))) throw new GameError('請選一個顏色');
  const target = swapTarget(state, index, card, msg.targetId);

  const colorBefore = state.currentColor;
  player.hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.currentColor = def.wild ? msg.color! : card.color!;
  // 有人接了（或出了別的牌），上一張 +4 就不能再質疑
  state.lastWild4 = null;
  pushLog(state, `${player.name} 出了 ${cardName(card)}`);

  if (player.hand.length === 0) {
    endGame(state, player.id);
    return;
  }

  const ctx: EffectContext = {
    state,
    player,
    playerIndex: index,
    card,
    rng,
    log: (m) => pushLog(state, m),
    draw: (i, n) => {
      drawCards(state, i, n, rng);
    },
    advance: 1,
    target,
  };
  def.onPlay?.(ctx);
  // 見者有份可能把其他人全部抽爆
  if (state.phase !== 'playing') return;
  // 清倉一口氣丟光也算出完
  if (player.hand.length === 0) {
    endGame(state, player.id);
    return;
  }
  // LAST! 只保護剩一張的人：拿著清倉提早喊、最後卻沒出到剩一張，就不算數
  if (player.hand.length > 1) player.unoSafe = false;
  if (state.pendingDraw > 0 && def.rank) state.stackLevel = Math.max(state.stackLevel, def.rank);
  if (card.kind === 'wild4' && state.settings.challenge) {
    state.lastWild4 = { from: index, color: colorBefore, cards: player.hand.filter((c) => c.color === colorBefore) };
  }
  setTurn(state, ctx.nextTurn ?? nextActive(state, index, ctx.advance));
}

export function drawAction(state: GameState, playerId: string, rng: Rng = Math.random): void {
  const index = requireTurn(state, playerId);
  const player = state.players[index];

  if (state.pendingDraw > 0) {
    const n = state.pendingDraw;
    clearPending(state);
    pushLog(state, `${player.name} 吃下了 ${n} 張牌`);
    drawCards(state, index, n, rng);
    if (state.phase === 'playing' && !player.out) setTurn(state, nextActive(state, index));
    return;
  }

  if (state.hasDrawn) throw new GameError('這回合已經抽過了，出牌或跳過');
  drawCards(state, index, 1, rng);
  pushLog(state, `${player.name} 抽了一張`);
  if (state.phase !== 'playing' || player.out) return;
  state.hasDrawn = true;
  // 抽完還是沒牌可出，就自動跳過
  if (!player.hand.some((c) => canPlay(state, c))) {
    setTurn(state, nextActive(state, index));
  }
}

export function passTurn(state: GameState, playerId: string): void {
  const index = requireTurn(state, playerId);
  if (!state.hasDrawn) throw new GameError('要先抽一張才能跳過');
  setTurn(state, nextActive(state, index));
}

export function sayUno(state: GameState, playerId: string): void {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.out || state.phase !== 'playing') throw new GameError('現在不能喊');
  if (!canCallLast(player.hand)) throw new GameError('剩兩張以下才能喊 LAST!');
  if (player.unoSafe) return;
  player.unoSafe = true;
  pushLog(state, `📢 ${player.name}：LAST!`);
}

/** 輪到的人能不能質疑上一張 +4 */
function canChallenge(state: GameState): boolean {
  const check = state.lastWild4;
  return state.phase === 'playing' && !!check && state.pendingDraw > 0 && check.from !== state.turn && !state.players[check.from].out;
}

/**
 * 質疑上一張 +4：出的人其實有原本的顏色嗎？（疊加中也可以，手上有 + 也可以）
 * 猜對 → 他吃下整疊，你照常出牌；猜錯 → 你吃下整疊再多 2 張，換下一個人。
 */
export function challengeWild4(state: GameState, playerId: string, rng: Rng = Math.random): void {
  const index = requireTurn(state, playerId);
  const check = state.lastWild4;
  if (!check || !canChallenge(state)) throw new GameError('現在沒有 +4 可以質疑');
  const challenger = state.players[index];
  const suspect = state.players[check.from];
  const n = state.pendingDraw;
  const guilty = check.cards.length > 0;
  const color = COLOR_NAME[check.color];
  clearPending(state);
  state.challengeResult = {
    seq: (state.challengeResult?.seq ?? 0) + 1,
    by: challenger.id,
    target: suspect.id,
    color: check.color,
    guilty,
    cards: check.cards,
  };
  pushLog(state, `⚖️ ${challenger.name} 質疑 ${suspect.name} 的 +4！`);
  if (guilty) {
    pushLog(state, `🎯 抓到了！${suspect.name} 明明有${color}牌，自己吃下 ${n} 張`);
    drawCards(state, check.from, n, rng);
    // 猜對的人照常出牌，重新計時
    if (state.phase === 'playing') setTurn(state, index);
  } else {
    pushLog(state, `❌ 猜錯了！${suspect.name} 真的沒有${color}牌，${challenger.name} 吃下 ${n + 2} 張`);
    drawCards(state, index, n + 2, rng);
    if (state.phase === 'playing' && !challenger.out) setTurn(state, nextActive(state, index));
  }
}

export function catchUno(state: GameState, catcherId: string, targetId: string, rng: Rng = Math.random): void {
  if (state.phase !== 'playing') throw new GameError('遊戲已經結束了');
  const catcher = state.players.find((p) => p.id === catcherId);
  const targetIndex = state.players.findIndex((p) => p.id === targetId);
  const target = state.players[targetIndex];
  if (!catcher || catcher.out || !target || catcherId === targetId) throw new GameError('抓不到');
  if (target.out || target.hand.length !== 1 || target.unoSafe) throw new GameError('他已經喊過了，或根本不是剩一張');
  pushLog(state, `🚨 ${catcher.name} 抓到 ${target.name} 沒喊 LAST，罰抽 2 張`);
  drawCards(state, targetIndex, 2, rng);
}

/** 玩家離開遊戲 */
export function removePlayer(state: GameState, playerId: string): void {
  const index = state.players.findIndex((p) => p.id === playerId);
  if (index === -1 || state.players[index].out || state.phase !== 'playing') return;
  eliminate(state, index, `🚪 ${state.players[index].name} 離開了`);
}

/** 時間到：幫目前的玩家抽牌然後跳過 */
export function autoMove(state: GameState, rng: Rng = Math.random): void {
  if (state.phase !== 'playing') return;
  const player = state.players[state.turn];
  const seq = state.turnSeq;
  pushLog(state, `⏰ ${player.name} 時間到`);
  if (state.pendingDraw > 0 || !state.hasDrawn) drawAction(state, player.id, rng);
  if (state.phase === 'playing' && state.turnSeq === seq) passTurn(state, player.id);
}

/** 牌面點數：數字牌照數字，萬用牌 50，其他功能牌 20 */
function cardPoints(card: Card): number {
  if (card.kind === 'number') return card.value ?? 0;
  return getCardDef(card.kind).wild ? 50 : 20;
}

/** 整局時間到：手牌最少的人贏；張數一樣就比點數，點數也一樣就平手 */
export function timeUp(state: GameState): void {
  if (state.phase !== 'playing') return;
  const score = (i: number) => {
    const hand = state.players[i].hand;
    return hand.length * 10_000 + hand.reduce((sum, c) => sum + cardPoints(c), 0);
  };
  const alive = state.players.map((_, i) => i).filter((i) => !state.players[i].out);
  const best = Math.min(...alive.map(score));
  const leaders = alive.filter((i) => score(i) === best);
  pushLog(state, '⌛ 整局時間到！手牌最少的人獲勝');
  if (leaders.length > 1) pushLog(state, `🤝 ${leaders.map((i) => state.players[i].name).join('、')} 平手`);
  endGame(state, leaders.length === 1 ? state.players[leaders[0]].id : null);
}

/**
 * 離線玩家由機器人代打：每呼叫一次走一步（出牌、抽牌或跳過），伺服器隔一下再叫下一步，看起來才像有人在玩。
 * 策略很簡單：先出手上最多的那個顏色的牌，萬用牌留著，+99 留到最後；選顏色就選手上最多的顏色。
 */
export function botMove(state: GameState, rng: Rng = Math.random): void {
  if (state.phase !== 'playing') return;
  const player = state.players[state.turn];
  const options = player.hand.filter((c) => canPlay(state, c));
  if (options.length === 0) {
    if (state.hasDrawn && state.pendingDraw === 0) passTurn(state, player.id);
    else if (shouldChallenge(state)) challengeWild4(state, player.id, rng);
    else drawAction(state, player.id, rng);
    return;
  }

  const counts = colorCounts(player.hand);
  const cost = (c: Card) => {
    if (c.kind === 'draw99') return 1000;
    if (getCardDef(c.kind).wild) return 500;
    // 清倉：同顏色越多越划算
    if (c.kind === 'discardAll') return -counts[c.color!] * 2;
    return -counts[c.color!];
  };
  const card = options.reduce((best, c) => (cost(c) < cost(best) ? c : best));
  // 出完剩一張就先喊（清倉一次會少好幾張）
  const left = player.hand.length - (card.kind === 'discardAll' ? counts[card.color!] : 1);
  if (left === 1 && !player.unoSafe) sayUno(state, player.id);
  const color = getCardDef(card.kind).wild ? bestColor(player.hand.filter((c) => c !== card), rng) : undefined;
  // 出 7 換牌就找手牌最少的人換
  let targetId: string | undefined;
  if (isSwapSeven(state.settings.sevenZero, card)) {
    const others = swapCandidates(state, state.turn).map((i) => state.players[i]);
    targetId = others.reduce((a, b) => (b.hand.length < a.hand.length ? b : a)).id;
  }
  playCard(state, player.id, { cardId: card.id, color, targetId }, rng);
}

/**
 * 機器人要不要質疑 +4：對方剩的牌越多，越可能其實有原本的顏色（當作一半的人會老實出）；
 * 疊得越多，猜錯多吃的 2 張相對越不痛。期望值划算才質疑。
 */
function shouldChallenge(state: GameState): boolean {
  if (!canChallenge(state)) return false;
  const left = state.players[state.lastWild4!.from].hand.length;
  const guilty = 0.5 * (1 - 0.77 ** left);
  return guilty > 2 / (state.pendingDraw + 2);
}

function colorCounts(hand: Card[]): Record<Color, number> {
  const counts = { red: 0, yellow: 0, green: 0, blue: 0 };
  for (const c of hand) if (c.color) counts[c.color]++;
  return counts;
}

/** 手上最多的顏色（一樣多就隨便挑一個） */
function bestColor(hand: Card[], rng: Rng): Color {
  const counts = colorCounts(hand);
  const max = Math.max(...COLORS.map((c) => counts[c]));
  const best = COLORS.filter((c) => counts[c] === max);
  return best[Math.floor(rng() * best.length)];
}

export function getView(state: GameState, viewerId: string): GameView {
  const me = state.players.find((p) => p.id === viewerId);
  const myTurn = state.phase === 'playing' && state.players[state.turn]?.id === viewerId;
  const hand = me && !me.out ? me.hand : null;
  return {
    phase: state.phase,
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      handCount: p.hand.length,
      out: p.out,
      unoSafe: p.unoSafe,
    })),
    hand,
    playable: myTurn && hand ? hand.filter((c) => canPlay(state, c)).map((c) => c.id) : [],
    topCard: topCard(state),
    currentColor: state.currentColor,
    direction: state.direction,
    turnId: state.players[state.turn].id,
    pendingDraw: state.pendingDraw,
    hasDrawn: myTurn && state.hasDrawn,
    handSwap: state.handSwap,
    sevenZero: state.settings.sevenZero,
    // 只給誰出的、原本的顏色；他到底有沒有唬爛（lastWild4.cards）前端不能知道
    challenge: canChallenge(state) ? { fromId: state.players[state.lastWild4!.from].id, color: state.lastWild4!.color } : null,
    challengeResult: state.challengeResult,
    bulkDiscard: state.bulkDiscard,
    drawPileCount: state.drawPile.length,
    winnerId: state.winnerId,
    log: state.log,
  };
}
