import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  autoMove,
  botMove,
  catchUno,
  createGame,
  CRAZY_KINDS,
  DEFAULT_SETTINGS,
  drawAction,
  playCard,
  removePlayer,
  sayUno,
  type Card,
  type CardKind,
  type Color,
  type GameState,
} from '../src';

function seeded(seed = 1) {
  return () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
}

let idc = 0;
function card(kind: CardKind, color: Color | null = null, value?: number): Card {
  return { id: `t${idc++}`, kind, color, value };
}

/** 開一局，然後把每個人的手牌、檯面換成指定的樣子 */
function setup(hands: Card[][], top: Card = card('number', 'red', 5), settings = {}): GameState {
  const players = hands.map((_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: null }));
  const state = createGame(players, { ...DEFAULT_SETTINGS, ...settings }, seeded());
  hands.forEach((h, i) => (state.players[i].hand = h));
  state.discardPile = [top];
  state.currentColor = top.color!;
  state.turn = 0;
  return state;
}

const filler = () => [card('number', 'blue', 1), card('number', 'blue', 2), card('number', 'blue', 3)];

describe('牌組', () => {
  it('一般 UNO 是 108 張', () => {
    let i = 0;
    expect(buildDeck([], () => `${i++}`)).toHaveLength(108);
  });

  it('怪牌全開會多出來', () => {
    let i = 0;
    const deck = buildDeck(CRAZY_KINDS, () => `${i++}`);
    expect(deck.filter((c) => c.kind === 'draw99')).toHaveLength(1);
    expect(deck.length).toBeGreaterThan(108);
  });
});

describe('基本規則', () => {
  it('顏色或數字相同才能出', () => {
    const red7 = card('number', 'red', 7);
    const blue5 = card('number', 'blue', 5);
    const blue7 = card('number', 'blue', 7);
    const state = setup([[red7, blue5, blue7, ...filler()], filler()]);
    expect(() => playCard(state, 'p0', { cardId: blue7.id })).toThrow();
    playCard(state, 'p0', { cardId: red7.id });
    expect(state.turn).toBe(1);
  });

  it('萬用牌一定要選顏色', () => {
    const w = card('wild');
    const state = setup([[w, ...filler()], filler()]);
    expect(() => playCard(state, 'p0', { cardId: w.id })).toThrow('顏色');
    playCard(state, 'p0', { cardId: w.id, color: 'green' });
    expect(state.currentColor).toBe('green');
  });

  it('出完最後一張就贏', () => {
    const last = card('number', 'red', 1);
    const state = setup([[last], filler()]);
    playCard(state, 'p0', { cardId: last.id });
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p0');
  });

  it('禁止會跳過下一個人', () => {
    const skip = card('skip', 'red');
    const state = setup([[skip, ...filler()], filler(), filler()]);
    playCard(state, 'p0', { cardId: skip.id });
    expect(state.turn).toBe(2);
  });

  it('迴轉會反向', () => {
    const rev = card('reverse', 'red');
    const state = setup([[rev, ...filler()], filler(), filler()]);
    playCard(state, 'p0', { cardId: rev.id });
    expect(state.turn).toBe(2);
  });
});

describe('抽牌疊加', () => {
  it('+2 疊 +4 之後，下一個人吃 6 張', () => {
    const d2 = card('draw2', 'red');
    const w4 = card('wild4');
    const state = setup([[d2, ...filler()], [w4, ...filler()], filler()]);
    playCard(state, 'p0', { cardId: d2.id });
    playCard(state, 'p1', { cardId: w4.id, color: 'blue' });
    expect(state.pendingDraw).toBe(6);
    drawAction(state, 'p2');
    expect(state.players[2].hand).toHaveLength(9);
    expect(state.pendingDraw).toBe(0);
    expect(state.turn).toBe(0);
  });

  it('疊加中不能出一般牌', () => {
    const d2 = card('draw2', 'red');
    const red3 = card('number', 'red', 3);
    const state = setup([[d2, ...filler()], [red3, ...filler()]]);
    playCard(state, 'p0', { cardId: d2.id });
    expect(() => playCard(state, 'p1', { cardId: red3.id })).toThrow();
  });

  it('×2 讓累積數翻倍', () => {
    const d2 = card('draw2', 'red');
    const dbl = card('double', 'green');
    const state = setup([[d2, ...filler()], [dbl, ...filler()], filler()]);
    playCard(state, 'p0', { cardId: d2.id });
    playCard(state, 'p1', { cardId: dbl.id });
    expect(state.pendingDraw).toBe(4);
    expect(state.turn).toBe(2);
  });

  it('鏡子把整疊彈回給攻擊者', () => {
    const w4 = card('wild4');
    const mirror = card('mirror', 'green');
    const state = setup([[w4, ...filler()], [mirror, ...filler()], filler()]);
    playCard(state, 'p0', { cardId: w4.id, color: 'red' });
    playCard(state, 'p1', { cardId: mirror.id });
    expect(state.turn).toBe(0);
    expect(state.pendingDraw).toBe(4);
    expect(state.pendingFrom).toBe(1);
  });
});

describe('+99 與爆牌', () => {
  it('吃下 +99 超過手牌上限就爆牌，只剩一人時他贏', () => {
    const p99 = card('draw99');
    const state = setup([[p99, ...filler()], filler()], undefined, { handLimit: 30 });
    playCard(state, 'p0', { cardId: p99.id, color: 'red' });
    drawAction(state, 'p1');
    expect(state.players[1].out).toBe(true);
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p0');
  });

  it('三人局爆牌後輪到下一個還在場上的人', () => {
    const p99 = card('draw99');
    const state = setup([[p99, ...filler()], filler(), filler()]);
    playCard(state, 'p0', { cardId: p99.id, color: 'red' });
    drawAction(state, 'p1');
    expect(state.players[1].out).toBe(true);
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe(2);
    expect(state.pendingDraw).toBe(0);
  });

  it('不限手牌時牌堆不夠會自動補牌', () => {
    const p99 = card('draw99');
    const state = setup([[p99, ...filler()], filler(), filler()], undefined, { handLimit: 0 });
    playCard(state, 'p0', { cardId: p99.id, color: 'red' });
    drawAction(state, 'p1');
    expect(state.players[1].hand).toHaveLength(102);
  });
});

describe('大風吹', () => {
  it('每個人的手牌傳給下一個人', () => {
    const swap = card('swapAll');
    const h1 = filler();
    const h2 = [card('number', 'green', 9)];
    const state = setup([[swap, card('number', 'red', 1)], h1, h2]);
    const h0Rest = state.players[0].hand.filter((c) => c.id !== swap.id);
    playCard(state, 'p0', { cardId: swap.id, color: 'red' });
    expect(state.players[1].hand).toEqual(h0Rest);
    expect(state.players[2].hand).toBe(h1);
    expect(state.players[0].hand).toBe(h2);
  });
});

describe('UNO', () => {
  it('沒喊 UNO 被抓要罰抽 2 張', () => {
    const a = card('number', 'red', 1);
    const state = setup([[a, card('number', 'red', 2)], filler()]);
    playCard(state, 'p0', { cardId: a.id });
    catchUno(state, 'p1', 'p0');
    expect(state.players[0].hand).toHaveLength(3);
  });

  it('喊過就抓不到', () => {
    const a = card('number', 'red', 1);
    const state = setup([[a, card('number', 'red', 2)], filler()]);
    sayUno(state, 'p0');
    playCard(state, 'p0', { cardId: a.id });
    expect(() => catchUno(state, 'p1', 'p0')).toThrow();
  });
});

describe('離開', () => {
  it('輪到的人離開，換下一個人，累積抽牌作廢', () => {
    const d2 = card('draw2', 'red');
    const state = setup([[d2, ...filler()], filler(), filler()]);
    playCard(state, 'p0', { cardId: d2.id });
    removePlayer(state, 'p1');
    expect(state.turn).toBe(2);
    expect(state.pendingDraw).toBe(0);
  });
});

describe('時間到', () => {
  it('沒出牌就幫他抽一張然後換人', () => {
    const state = setup([filler(), filler(), filler()], card('number', 'red', 5));
    autoMove(state);
    expect(state.players[0].hand).toHaveLength(4);
    expect(state.turn).toBe(1);
  });

  it('疊加中時間到就吃下整疊', () => {
    const d2 = card('draw2', 'red');
    const state = setup([[d2, ...filler()], filler(), filler()]);
    playCard(state, 'p0', { cardId: d2.id });
    autoMove(state);
    expect(state.players[1].hand).toHaveLength(5);
    expect(state.turn).toBe(2);
  });
});

describe('機器人代打', () => {
  it('先出手上最多的顏色，萬用牌和 +99 留著', () => {
    const red9 = card('number', 'red', 9);
    const blue5 = card('number', 'blue', 5);
    const state = setup([[card('draw99'), card('wild'), red9, blue5, card('number', 'blue', 1), card('number', 'blue', 2)], filler()]);
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(blue5);
    expect(state.currentColor).toBe('blue');
    expect(state.turn).toBe(1);
  });

  it('只剩萬用牌能出，就選手上最多的顏色', () => {
    const w = card('wild');
    const state = setup([[w, card('number', 'green', 1), card('number', 'green', 2), card('number', 'blue', 7)], filler()]);
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(w);
    expect(state.currentColor).toBe('green');
  });

  it('沒牌能出就抽一張，抽到能出的下一步就出掉', () => {
    const red7 = card('number', 'red', 7);
    const state = setup([filler(), filler()]);
    state.drawPile = [red7];
    botMove(state);
    expect(state.turn).toBe(0);
    expect(state.hasDrawn).toBe(true);
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(red7);
    expect(state.turn).toBe(1);
  });

  it('抽到的還是不能出就換人', () => {
    const state = setup([filler(), filler()]);
    state.drawPile = [card('number', 'green', 8)];
    botMove(state);
    expect(state.players[0].hand).toHaveLength(4);
    expect(state.turn).toBe(1);
  });

  it('疊加中能接就接，不能接就吃下整疊', () => {
    const d2 = card('draw2', 'red');
    const d2b = card('draw2', 'blue');
    const state = setup([[d2, ...filler()], [d2b, ...filler()], filler()]);
    playCard(state, 'p0', { cardId: d2.id });
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(d2b);
    expect(state.pendingDraw).toBe(4);
    botMove(state);
    expect(state.players[2].hand).toHaveLength(7);
    expect(state.pendingDraw).toBe(0);
  });

  it('剩兩張出牌前會先喊 UNO', () => {
    const state = setup([[card('number', 'red', 9), card('number', 'blue', 1)], filler()]);
    botMove(state);
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].unoSafe).toBe(true);
  });
});
