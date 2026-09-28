import { activeCount, addPendingDraw, nextActive, reverseDirection } from '../state';
import type { CardDef } from './def';

/**
 * 怪牌都寫在這裡。
 * 新增一張：在 types.ts 的 CardKind 加名字 → 在這個陣列加一個定義 → 完成。
 */
export const crazyCards: CardDef[] = [
  {
    kind: 'draw99',
    name: '+99',
    label: '+99',
    description: '下一個人抽 99 張。整副牌只有一張。',
    crazy: true,
    wild: true,
    count: 1,
    stackable: true,
    onPlay(ctx) {
      addPendingDraw(ctx.state, 99, ctx.playerIndex);
      ctx.log(`☠️ ${ctx.player.name} 丟出了 +99！`);
    },
  },
  {
    kind: 'double',
    name: '×2',
    label: '×2',
    description: '疊加中：累積的抽牌數翻倍再傳下去。平常：當 +2 用。',
    crazy: true,
    wild: false,
    count: 1,
    stackable: true,
    onPlay(ctx) {
      const { state } = ctx;
      if (state.pendingDraw > 0) {
        addPendingDraw(state, state.pendingDraw, ctx.playerIndex);
        ctx.log(`✖️ 抽牌數翻倍變成 ${state.pendingDraw}！`);
      } else {
        addPendingDraw(state, 2, ctx.playerIndex);
      }
    },
  },
  {
    kind: 'mirror',
    name: '鏡子',
    label: '🪞',
    description: '疊加中：整疊抽牌彈回給上一個攻擊你的人。平常：當迴轉用。',
    crazy: true,
    wild: false,
    count: 1,
    stackable: true,
    onPlay(ctx) {
      const { state } = ctx;
      const attacker = state.pendingFrom;
      if (state.pendingDraw > 0 && attacker !== null && !state.players[attacker].out) {
        ctx.nextTurn = attacker;
        state.pendingFrom = ctx.playerIndex;
        ctx.log(`🪞 ${state.players[attacker].name} 被自己的 ${state.pendingDraw} 張反彈了！`);
        return;
      }
      reverseDirection(state);
      if (activeCount(state) === 2) ctx.advance = 2;
    },
  },
  {
    kind: 'dice',
    name: '+🎲',
    label: '+🎲',
    description: '擲一顆 12 面骰，下一個人抽骰出來的數字。可以疊加。',
    crazy: true,
    wild: true,
    count: 2,
    stackable: true,
    onPlay(ctx) {
      const roll = 1 + Math.floor(ctx.rng() * 12);
      addPendingDraw(ctx.state, roll, ctx.playerIndex);
      ctx.log(`🎲 骰出了 ${roll}！`);
    },
  },
  {
    kind: 'swapAll',
    name: '大風吹',
    label: '🌀',
    description: '所有人把手牌整手傳給下一個人，傳完大家都要重喊 LAST!',
    crazy: true,
    wild: true,
    count: 2,
    onPlay(ctx) {
      const { state } = ctx;
      const active = state.players.map((_, i) => i).filter((i) => !state.players[i].out);
      const hands = active.map((i) => state.players[i].hand);
      for (let k = 0; k < active.length; k++) {
        const to = nextActive(state, active[k]);
        state.players[to].hand = hands[k];
      }
      for (const p of state.players) p.unoSafe = false;
      ctx.log('🌀 大風吹！大家的手牌都換人了');
    },
  },
];
