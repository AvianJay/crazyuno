import { describe, expect, it } from 'vitest';
import {
  buildDeck,
  autoMove,
  botMove,
  canPlay,
  catchUno,
  challengeWild4,
  createGame,
  CRAZY_KINDS,
  DEFAULT_SETTINGS,
  drawAction,
  getView,
  MAX_HAND,
  playCard,
  removePlayer,
  sayUno,
  timeUp,
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
    // 見者有份、清倉每個顏色各一張
    for (const kind of ['drawAll', 'discardAll'] as const) {
      expect(deck.filter((c) => c.kind === kind).map((c) => c.color).sort()).toEqual(['blue', 'green', 'red', 'yellow']);
    }
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

  it('不限手牌時疊到幾百億張也不會真的去抽，超過 MAX_HAND 直接爆牌', () => {
    const x2 = card('double', 'red');
    const state = setup([[x2, ...filler()], filler(), filler()], undefined, { handLimit: 0 });
    state.pendingDraw = 28_354_413_749;
    state.pendingFrom = 2;
    playCard(state, 'p0', { cardId: x2.id });
    expect(state.pendingDraw).toBe(56_708_827_498);
    drawAction(state, 'p1');
    expect(state.players[1].out).toBe(true);
    expect(state.players[1].hand).toHaveLength(0);
    expect(state.pendingDraw).toBe(0);
    expect(state.turn).toBe(2);
    // 牌堆只多出「撐爆那一手」的量，不是幾百億張
    expect(state.drawPile.length).toBeLessThan(MAX_HAND * 2);
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

describe('見者有份', () => {
  it('除了出牌的人，每個人都抽 2 張，然後照常換下一個人', () => {
    const all = card('drawAll', 'red');
    const state = setup([[all, ...filler()], filler(), filler(), filler()]);
    state.players[2].hand = [card('number', 'green', 1)];
    state.players[2].unoSafe = true;
    playCard(state, 'p0', { cardId: all.id });
    expect(state.players.map((p) => p.hand.length)).toEqual([3, 5, 3, 5]);
    // 抽了牌就要重喊 LAST!
    expect(state.players[2].unoSafe).toBe(false);
    expect(state.turn).toBe(1);
    expect(state.pendingDraw).toBe(0);
  });

  it('把其他人全部抽爆就直接贏', () => {
    const all = card('drawAll', 'red');
    const state = setup([[all, ...filler()], filler(), filler()], undefined, { handLimit: 4 });
    playCard(state, 'p0', { cardId: all.id });
    expect(state.players[1].out).toBe(true);
    expect(state.players[2].out).toBe(true);
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p0');
  });

  it('有人被抽爆，其他人照樣要抽，輪到下一個還在場上的人', () => {
    const all = card('drawAll', 'red');
    const state = setup([[all, ...filler()], filler(), [card('number', 'green', 1)]], undefined, { handLimit: 4 });
    playCard(state, 'p0', { cardId: all.id });
    expect(state.players[1].out).toBe(true);
    expect(state.players[2].hand).toHaveLength(3);
    expect(state.phase).toBe('playing');
    expect(state.turn).toBe(2);
  });

  it('最後一張出見者有份直接贏，大家不用抽', () => {
    const all = card('drawAll', 'red');
    const state = setup([[all], filler()]);
    playCard(state, 'p0', { cardId: all.id });
    expect(state.winnerId).toBe('p0');
    expect(state.players[1].hand).toHaveLength(3);
  });

  it('不能拿來接疊加', () => {
    const d2 = card('draw2', 'red');
    const all = card('drawAll', 'red');
    const state = setup([[d2, ...filler()], [all, ...filler()]]);
    playCard(state, 'p0', { cardId: d2.id });
    expect(() => playCard(state, 'p1', { cardId: all.id })).toThrow();
  });
});

describe('清倉', () => {
  it('同顏色的一起丟掉，清倉這張留在最上面', () => {
    const sweep = card('discardAll', 'red');
    const red2 = card('number', 'red', 2);
    const redSkip = card('skip', 'red');
    const blue = card('number', 'blue', 4);
    const wild = card('wild');
    const state = setup([[red2, sweep, blue, redSkip, wild], filler(), filler()]);
    playCard(state, 'p0', { cardId: sweep.id });
    expect(state.players[0].hand).toEqual([blue, wild]);
    expect(state.discardPile.at(-1)).toBe(sweep);
    expect(state.discardPile.slice(-3, -1)).toEqual([red2, redSkip]);
    expect(state.currentColor).toBe('red');
    expect(state.bulkDiscard).toEqual({ seq: 1, by: 'p0', cards: [red2, redSkip] });
    // 一起丟掉的禁止不會發動
    expect(state.turn).toBe(1);
  });

  it('一口氣丟光就贏', () => {
    const sweep = card('discardAll', 'red');
    const state = setup([[sweep, card('number', 'red', 1), card('draw2', 'red')], filler()]);
    playCard(state, 'p0', { cardId: sweep.id });
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p0');
    expect(state.pendingDraw).toBe(0);
  });

  it('可以接在別的顏色的清倉上面，丟的是自己這張的顏色', () => {
    const blueSweep = card('discardAll', 'blue');
    const state = setup([[blueSweep, ...filler(), card('number', 'red', 3)], filler()], card('discardAll', 'red'));
    playCard(state, 'p0', { cardId: blueSweep.id });
    expect(state.players[0].hand.map((c) => c.color)).toEqual(['red']);
    expect(state.currentColor).toBe('blue');
  });

  it('清倉一出就剩一張的話可以先喊 LAST!，喊了沒出到剩一張就不算', () => {
    const sweep = card('discardAll', 'red');
    const hand = [sweep, card('number', 'red', 1), card('number', 'red', 2), card('number', 'blue', 9)];
    const state = setup([hand, filler()]);
    sayUno(state, 'p0');
    expect(state.players[0].unoSafe).toBe(true);
    playCard(state, 'p0', { cardId: hand[1].id });
    expect(state.players[0].unoSafe).toBe(false);

    // 同一手牌不夠清到剩一張就不能喊
    const other = setup([[card('discardAll', 'red'), card('number', 'red', 1), ...filler()], filler()]);
    expect(() => sayUno(other, 'p0')).toThrow('LAST!');
  });

  it('先喊再清倉到剩一張，就抓不到', () => {
    const sweep = card('discardAll', 'red');
    const state = setup([[sweep, card('number', 'red', 1), card('number', 'red', 2), card('number', 'blue', 9)], filler()]);
    sayUno(state, 'p0');
    playCard(state, 'p0', { cardId: sweep.id });
    expect(state.players[0].hand).toHaveLength(1);
    expect(() => catchUno(state, 'p1', 'p0')).toThrow();
  });

  it('機器人會挑清倉，出之前先喊 LAST!', () => {
    const sweep = card('discardAll', 'red');
    const state = setup([[card('number', 'red', 1), card('number', 'red', 2), sweep, card('number', 'blue', 9)], filler()]);
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(sweep);
    expect(state.players[0].hand).toHaveLength(1);
    expect(state.players[0].unoSafe).toBe(true);
  });
});

describe('疊加規則', () => {
  it('疊加關掉：只能直接抽，鏡子還是能彈回去', () => {
    const d2 = card('draw2', 'red');
    const d2b = card('draw2', 'blue');
    const mirror = card('mirror', 'green');
    const state = setup([[d2, ...filler()], [d2b, mirror, ...filler()], filler()], undefined, { stacking: false });
    playCard(state, 'p0', { cardId: d2.id });
    expect(() => playCard(state, 'p1', { cardId: d2b.id })).toThrow();
    playCard(state, 'p1', { cardId: mirror.id });
    expect(state.turn).toBe(0);
    expect(state.pendingDraw).toBe(2);
  });

  it('越疊越大：+4 上面不能疊 +2，×2 不受限，疊完 ×2 還是不能出 +2', () => {
    const w4 = card('wild4');
    const d2 = card('draw2', 'blue');
    const x2 = card('double', 'blue');
    const w4b = card('wild4');
    const state = setup([[w4, ...filler()], [d2, x2, ...filler()], [card('draw2', 'green'), w4b, ...filler()]], undefined, {
      stackUp: true,
    });
    playCard(state, 'p0', { cardId: w4.id, color: 'blue' });
    expect(() => playCard(state, 'p1', { cardId: d2.id })).toThrow();
    playCard(state, 'p1', { cardId: x2.id });
    expect(state.pendingDraw).toBe(8);
    expect(state.players[2].hand.filter((c) => canPlay(state, c))).toEqual([w4b]);
  });

  it('越疊越大：+2 上面可以疊 +2 和 +4；吃完之後重新開始算', () => {
    const d2 = card('draw2', 'red');
    const d2b = card('draw2', 'blue');
    const w4 = card('wild4');
    const state = setup([[d2, ...filler()], [d2b, ...filler()], [w4, ...filler()], filler()], undefined, { stackUp: true });
    playCard(state, 'p0', { cardId: d2.id });
    playCard(state, 'p1', { cardId: d2b.id });
    playCard(state, 'p2', { cardId: w4.id, color: 'red' });
    expect(state.pendingDraw).toBe(8);
    drawAction(state, 'p3');
    expect(state.stackLevel).toBe(0);
  });

  it('+99 封頂：只剩鏡子能擋，彈回去之後還是封頂', () => {
    const p99 = card('draw99');
    const mirror = card('mirror', 'red');
    const state = setup(
      [
        [p99, card('draw2', 'red'), ...filler()],
        [card('draw2', 'blue'), card('wild4'), card('double', 'blue'), mirror, ...filler()],
      ],
      undefined,
      { cap99: true, handLimit: 0 },
    );
    playCard(state, 'p0', { cardId: p99.id, color: 'blue' });
    expect(state.players[1].hand.filter((c) => canPlay(state, c))).toEqual([mirror]);
    playCard(state, 'p1', { cardId: mirror.id });
    expect(state.turn).toBe(0);
    expect(state.players[0].hand.filter((c) => canPlay(state, c))).toEqual([]);
  });

  it('沒開 +99 封頂：+99 上面照樣可以疊', () => {
    const p99 = card('draw99');
    const d2 = card('draw2', 'blue');
    const state = setup([[p99, ...filler()], [d2, ...filler()], filler()], undefined, { handLimit: 0 });
    playCard(state, 'p0', { cardId: p99.id, color: 'blue' });
    playCard(state, 'p1', { cardId: d2.id });
    expect(state.pendingDraw).toBe(101);
  });
});

describe('+4 質疑', () => {
  const rules = { challenge: true };

  it('猜對：出 +4 的人明明有原本的顏色，他吃 4 張，質疑的人照常出牌', () => {
    const w4 = card('wild4');
    const red3 = card('number', 'red', 3);
    const state = setup([[w4, red3, card('wild'), ...filler()], filler(), filler()], undefined, rules);
    playCard(state, 'p0', { cardId: w4.id, color: 'blue' });
    const view = getView(state, 'p1');
    expect(view.challenge).toEqual({ fromId: 'p0', color: 'red' });
    // 只給誰出的、原本的顏色，不能讓前端看出他有沒有唬爛
    expect(JSON.stringify(view.challenge)).not.toContain(red3.id);
    const seq = state.turnSeq;
    challengeWild4(state, 'p1');
    expect(state.players[0].hand).toHaveLength(9);
    expect(state.players[1].hand).toHaveLength(3);
    expect(state.turn).toBe(1);
    expect(state.turnSeq).toBe(seq + 1);
    expect(state.pendingDraw).toBe(0);
    expect(state.challengeResult).toMatchObject({ seq: 1, by: 'p1', target: 'p0', color: 'red', guilty: true, cards: [red3] });
    expect(getView(state, 'p1').challenge).toBeNull();
    // 猜對的人接著出牌
    playCard(state, 'p1', { cardId: state.players[1].hand[0].id });
    expect(state.turn).toBe(2);
  });

  it('猜錯：他真的沒有原本的顏色，質疑的人吃 6 張，換下一個人', () => {
    const w4 = card('wild4');
    const state = setup([[w4, card('wild'), ...filler()], filler(), filler()], undefined, rules);
    playCard(state, 'p0', { cardId: w4.id, color: 'green' });
    challengeWild4(state, 'p1');
    expect(state.players[0].hand).toHaveLength(4);
    expect(state.players[1].hand).toHaveLength(9);
    expect(state.turn).toBe(2);
    expect(state.challengeResult).toMatchObject({ guilty: false, cards: [] });
  });

  it('疊加中也能質疑，賭的是整疊', () => {
    const d2 = card('draw2', 'red');
    const w4 = card('wild4');
    const w4c = card('wild4');
    const state = setup([[d2, ...filler()], [w4, card('number', 'red', 8), ...filler()], [w4c, ...filler()]], undefined, rules);
    playCard(state, 'p0', { cardId: d2.id });
    playCard(state, 'p1', { cardId: w4.id, color: 'blue' });
    // 手上有 + 可以接也照樣能質疑
    expect(getView(state, 'p2').challenge).toEqual({ fromId: 'p1', color: 'red' });
    challengeWild4(state, 'p2');
    expect(state.players[1].hand).toHaveLength(4 + 6);
    expect(state.turn).toBe(2);

    const innocent = setup([[d2, ...filler()], [w4, ...filler()], filler()], undefined, rules);
    playCard(innocent, 'p0', { cardId: d2.id });
    playCard(innocent, 'p1', { cardId: w4.id, color: 'green' });
    challengeWild4(innocent, 'p2');
    expect(innocent.players[2].hand).toHaveLength(3 + 8);
  });

  it('接了之後下一家就不能再質疑那張 +4', () => {
    const w4 = card('wild4');
    const d2 = card('draw2', 'blue');
    const state = setup([[w4, card('number', 'red', 1), ...filler()], [d2, ...filler()], filler()], undefined, rules);
    playCard(state, 'p0', { cardId: w4.id, color: 'blue' });
    playCard(state, 'p1', { cardId: d2.id });
    expect(getView(state, 'p2').challenge).toBeNull();
    expect(() => challengeWild4(state, 'p2')).toThrow('質疑');
  });

  it('被 +4 的人也可以不質疑、再疊一張 +4，下一家質疑的是他', () => {
    const w4 = card('wild4');
    const w4b = card('wild4');
    const state = setup([[w4, card('number', 'red', 1), ...filler()], [w4b, card('number', 'yellow', 1), ...filler()], filler()], undefined, rules);
    playCard(state, 'p0', { cardId: w4.id, color: 'yellow' });
    playCard(state, 'p1', { cardId: w4b.id, color: 'green' });
    expect(getView(state, 'p2').challenge).toEqual({ fromId: 'p1', color: 'yellow' });
    challengeWild4(state, 'p2');
    expect(state.players[1].hand).toHaveLength(4 + 8);
    expect(state.players[0].hand).toHaveLength(4);
  });

  it('沒開規則、出 +4 的人已經離開，都不能質疑', () => {
    const w4 = card('wild4');
    const off = setup([[w4, card('number', 'red', 1), ...filler()], filler(), filler()]);
    playCard(off, 'p0', { cardId: w4.id, color: 'blue' });
    expect(getView(off, 'p1').challenge).toBeNull();
    expect(() => challengeWild4(off, 'p1')).toThrow('質疑');

    const left = setup([[card('wild4'), card('number', 'red', 1), ...filler()], filler(), filler()], undefined, rules);
    playCard(left, 'p0', { cardId: left.players[0].hand[0].id, color: 'blue' });
    removePlayer(left, 'p0');
    expect(() => challengeWild4(left, 'p1')).toThrow('質疑');
    expect(left.pendingDraw).toBe(4);
  });

  it('時間到就當作吃下去，不會質疑', () => {
    const w4 = card('wild4');
    const state = setup([[w4, card('number', 'red', 1), ...filler()], filler(), filler()], undefined, rules);
    playCard(state, 'p0', { cardId: w4.id, color: 'blue' });
    autoMove(state);
    expect(state.players[1].hand).toHaveLength(7);
    expect(state.challengeResult).toBeNull();
  });

  it('機器人：對方剩很多張就質疑，剩一兩張就乖乖吃', () => {
    const many = setup([[card('wild4'), ...filler(), ...filler()], filler(), filler()], undefined, rules);
    playCard(many, 'p0', { cardId: many.players[0].hand[0].id, color: 'blue' });
    botMove(many);
    expect(many.challengeResult?.by).toBe('p1');

    const few = setup([[card('wild4'), card('number', 'blue', 1)], filler(), filler()], undefined, rules);
    playCard(few, 'p0', { cardId: few.players[0].hand[0].id, color: 'green' });
    botMove(few);
    expect(few.challengeResult).toBeNull();
    expect(few.players[1].hand).toHaveLength(7);
  });
});

describe('機器人互打', () => {
  it('怪牌全開、規則輪流開關，打幾百局都能打完，也不會出現重複的牌', () => {
    const rng = seeded(7);
    const seen = { sweep: 0, drawAll: 0, challenge: 0, guilty: 0, capped: 0 };
    for (let g = 0; g < 300; g++) {
      const players = Array.from({ length: 2 + (g % 6) }, (_, i) => ({ id: `p${i}`, name: `P${i}`, avatar: null }));
      const settings = {
        ...DEFAULT_SETTINGS,
        crazyCards: CRAZY_KINDS,
        handLimit: 40,
        sevenZero: g % 2 === 0,
        challenge: g % 3 !== 0,
        stackUp: g % 4 === 1,
        cap99: g % 5 === 2,
        stacking: g % 7 !== 3,
      };
      const state = createGame(players, settings, rng);
      for (let step = 0; state.phase === 'playing'; step++) {
        expect(step).toBeLessThan(20_000);
        if (state.settings.cap99 && state.stackLevel >= 99) seen.capped++;
        botMove(state, rng);
        if (state.phase !== 'playing') break;
        // 疊加結束的時候，疊加用的紀錄要一起清乾淨；輪到的人一定還在場上、手上有牌
        if (state.pendingDraw === 0) {
          expect(state.stackLevel).toBe(0);
          expect(state.lastWild4).toBeNull();
        }
        expect(state.players[state.turn].out).toBe(false);
        expect(state.players.every((p) => p.out || p.hand.length > 0)).toBe(true);
      }
      const ids = [...state.drawPile, ...state.discardPile, ...state.players.flatMap((p) => p.hand)].map((c) => c.id);
      expect(new Set(ids).size).toBe(ids.length);
      seen.sweep += state.bulkDiscard?.seq ?? 0;
      seen.challenge += state.challengeResult?.seq ?? 0;
      seen.drawAll += state.log.filter((l) => l.startsWith('🎁')).length;
      seen.guilty += state.log.filter((l) => l.startsWith('🎯')).length;
    }
    // 新的牌和規則真的有被打到
    expect(seen.sweep).toBeGreaterThan(20);
    expect(seen.drawAll).toBeGreaterThan(20);
    expect(seen.challenge).toBeGreaterThan(5);
    expect(seen.guilty).toBeGreaterThan(0);
  });
});

describe('0/7 規則', () => {
  const sevenZero = { sevenZero: true };

  it('沒開的話 0 跟 7 就是普通的數字牌', () => {
    const red0 = card('number', 'red', 0);
    const h1 = filler();
    const state = setup([[red0, ...filler()], h1, filler()]);
    playCard(state, 'p0', { cardId: red0.id });
    expect(state.players[1].hand).toBe(h1);
    expect(state.handSwap).toBeNull();
  });

  it('出 0：大家的手牌往出牌方向傳給下一家', () => {
    const red0 = card('number', 'red', 0);
    const rest = card('number', 'red', 1);
    const h1 = filler();
    const h2 = [card('number', 'green', 9)];
    const state = setup([[red0, rest], h1, h2], undefined, sevenZero);
    state.players[2].unoSafe = true;
    playCard(state, 'p0', { cardId: red0.id });
    expect(state.players[1].hand).toEqual([rest]);
    expect(state.players[2].hand).toBe(h1);
    expect(state.players[0].hand).toBe(h2);
    expect(state.players[2].unoSafe).toBe(false);
    expect(state.handSwap?.moves).toEqual([
      ['p0', 'p1'],
      ['p1', 'p2'],
      ['p2', 'p0'],
    ]);
  });

  it('出 0：反方向的時候往另一邊傳', () => {
    const red0 = card('number', 'red', 0);
    const h1 = filler();
    const h2 = [card('number', 'green', 9)];
    const state = setup([[red0, card('number', 'red', 1)], h1, h2], undefined, sevenZero);
    state.direction = -1;
    playCard(state, 'p0', { cardId: red0.id });
    expect(state.players[0].hand).toBe(h1);
    expect(state.players[1].hand).toBe(h2);
  });

  it('出 7：跟自己選的人交換手牌', () => {
    const red7 = card('number', 'red', 7);
    const rest = card('number', 'red', 1);
    const h2 = [card('number', 'green', 9)];
    const state = setup([[red7, rest, card('number', 'red', 2)], filler(), h2], undefined, sevenZero);
    expect(() => playCard(state, 'p0', { cardId: red7.id })).toThrow('換手牌');
    expect(() => playCard(state, 'p0', { cardId: red7.id, targetId: 'p0' })).toThrow('換手牌');
    playCard(state, 'p0', { cardId: red7.id, targetId: 'p2' });
    expect(state.players[0].hand).toBe(h2);
    expect(state.players[2].hand.map((c) => c.id)).toContain(rest.id);
    expect(state.players[2].hand).toHaveLength(2);
    expect(state.handSwap?.moves).toEqual([
      ['p0', 'p2'],
      ['p2', 'p0'],
    ]);
    expect(state.turn).toBe(1);
  });

  it('出 7：不能選已經出局的人；只剩一個對手就不用選', () => {
    const red7 = card('number', 'red', 7);
    const h1 = filler();
    const state = setup([[red7, card('number', 'red', 1)], h1, filler()], undefined, sevenZero);
    state.players[2].out = true;
    expect(() => playCard(state, 'p0', { cardId: red7.id, targetId: 'p2' })).toThrow('換手牌');
    playCard(state, 'p0', { cardId: red7.id });
    expect(state.players[0].hand).toBe(h1);
    expect(state.players[1].hand).toHaveLength(1);
  });

  it('最後一張出 7 直接贏，不用選人', () => {
    const red7 = card('number', 'red', 7);
    const state = setup([[red7], filler(), filler()], undefined, sevenZero);
    playCard(state, 'p0', { cardId: red7.id });
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p0');
  });

  it('機器人出 7 會找手牌最少的人換', () => {
    const red7 = card('number', 'red', 7);
    const small = [card('number', 'green', 9)];
    const state = setup([[red7, ...filler()], filler(), small], undefined, sevenZero);
    botMove(state);
    expect(state.discardPile.at(-1)).toBe(red7);
    expect(state.players[0].hand).toBe(small);
  });
});

describe('整局時間到', () => {
  it('手牌最少的人贏', () => {
    const state = setup([filler(), [card('number', 'red', 1)], filler()]);
    timeUp(state);
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBe('p1');
  });

  it('張數一樣比點數，出局的人不算', () => {
    const state = setup([[card('number', 'red', 9)], [card('skip', 'red')], [card('number', 'red', 3)], []]);
    state.players[3].out = true;
    timeUp(state);
    expect(state.winnerId).toBe('p2');
  });

  it('張數、點數都一樣就平手', () => {
    const state = setup([[card('number', 'red', 4)], [card('number', 'blue', 4)]]);
    timeUp(state);
    expect(state.phase).toBe('ended');
    expect(state.winnerId).toBeNull();
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
