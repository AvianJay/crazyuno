import { getCardDef, ALL_CARDS, type EffectContext } from './cards';
import { activeCount, nextActive, pushLog, shuffle } from './state';
import {
  COLORS,
  type Card,
  type CardKind,
  type GameSettings,
  type GameState,
  type GameView,
  type PlayMsg,
} from './types';

/** 玩家做了不合法的事（伺服器會把訊息顯示給他） */
export class GameError extends Error {}

export const DEFAULT_SETTINGS: GameSettings = {
  crazyCards: ALL_CARDS.filter((d) => d.crazy).map((d) => d.kind),
  handLimit: 30,
  startingHand: 7,
  turnSeconds: 30,
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

export function cardName(card: Card): string {
  const colorName = { red: '紅', yellow: '黃', green: '綠', blue: '藍' };
  const color = card.color ? colorName[card.color] : '';
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
    hasDrawn: false,
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
  const def = getCardDef(card.kind);
  if (state.pendingDraw > 0) return !!def.stackable;
  if (def.wild) return true;
  if (card.color === state.currentColor) return true;
  const top = topCard(state);
  if (card.kind !== top.kind) return false;
  return card.kind !== 'number' || card.value === top.value;
}

/** 讓某位玩家抽 n 張，超過手牌上限就爆掉。回傳實際抽了幾張。 */
function drawCards(state: GameState, index: number, n: number, rng: Rng): number {
  const player = state.players[index];
  let drawn = 0;
  for (; drawn < n; drawn++) {
    player.hand.push(takeCard(state, rng));
    const limit = state.settings.handLimit;
    if (limit > 0 && player.hand.length > limit) {
      drawn++;
      eliminate(state, index, `💥 ${player.name} 手牌超過 ${limit} 張，爆牌出局！`);
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
  pushLog(state, msg);
  if (activeCount(state) <= 1) {
    const winner = state.players.find((p) => !p.out);
    endGame(state, winner?.id ?? null);
  } else if (state.turn === index) {
    // 輪到他的時候出局：累積的抽牌作廢，換下一個人
    state.pendingDraw = 0;
    state.pendingFrom = null;
    setTurn(state, nextActive(state, index));
  }
}

function endGame(state: GameState, winnerId: string | null): void {
  state.phase = 'ended';
  state.winnerId = winnerId;
  const winner = state.players.find((p) => p.id === winnerId);
  pushLog(state, winner ? `🏆 ${winner.name} 贏了！` : '遊戲結束');
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

  player.hand.splice(cardIndex, 1);
  state.discardPile.push(card);
  state.currentColor = def.wild ? msg.color! : card.color!;
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
    advance: 1,
  };
  def.onPlay?.(ctx);
  setTurn(state, ctx.nextTurn ?? nextActive(state, index, ctx.advance));
}

export function drawAction(state: GameState, playerId: string, rng: Rng = Math.random): void {
  const index = requireTurn(state, playerId);
  const player = state.players[index];

  if (state.pendingDraw > 0) {
    const n = state.pendingDraw;
    state.pendingDraw = 0;
    state.pendingFrom = null;
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
  if (player.hand.length > 2) throw new GameError('剩兩張以下才能喊 UNO');
  if (player.unoSafe) return;
  player.unoSafe = true;
  pushLog(state, `📢 ${player.name}：UNO！`);
}

export function catchUno(state: GameState, catcherId: string, targetId: string, rng: Rng = Math.random): void {
  if (state.phase !== 'playing') throw new GameError('遊戲已經結束了');
  const catcher = state.players.find((p) => p.id === catcherId);
  const targetIndex = state.players.findIndex((p) => p.id === targetId);
  const target = state.players[targetIndex];
  if (!catcher || catcher.out || !target || catcherId === targetId) throw new GameError('抓不到');
  if (target.out || target.hand.length !== 1 || target.unoSafe) throw new GameError('他已經喊過了，或根本不是剩一張');
  pushLog(state, `🚨 ${catcher.name} 抓到 ${target.name} 沒喊 UNO！罰抽 2 張`);
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
    drawPileCount: state.drawPile.length,
    winnerId: state.winnerId,
    log: state.log,
  };
}
