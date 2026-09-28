import { activeCount, addPendingDraw, passHands, reverseDirection, swapHands } from '../state';
import type { CardDef } from './def';

export const standardCards: CardDef[] = [
  {
    kind: 'number',
    name: '數字牌',
    label: '',
    description: '顏色或數字相同就能出。',
    crazy: false,
    wild: false,
    count: 0, // 特別處理：每色一張 0、兩張 1~9
    onPlay(ctx) {
      // 0/7 規則（大廳可以開關）
      const { state } = ctx;
      if (!state.settings.sevenZero) return;
      if (ctx.card.value === 0) {
        passHands(state);
        ctx.log('🔄 大家的手牌往下一家傳！');
      } else if (ctx.card.value === 7 && ctx.target !== undefined) {
        swapHands(state, ctx.playerIndex, ctx.target);
        ctx.log(`🔀 ${ctx.player.name} 跟 ${state.players[ctx.target].name} 交換了手牌`);
      }
    },
  },
  {
    kind: 'skip',
    name: '禁止',
    label: '⊘',
    description: '下一個人跳過。',
    crazy: false,
    wild: false,
    count: 2,
    onPlay(ctx) {
      ctx.advance = 2;
    },
  },
  {
    kind: 'reverse',
    name: '迴轉',
    label: '⇄',
    description: '反轉出牌方向。只剩兩人時等於禁止。',
    crazy: false,
    wild: false,
    count: 2,
    onPlay(ctx) {
      reverseDirection(ctx.state);
      if (activeCount(ctx.state) === 2) ctx.advance = 2;
    },
  },
  {
    kind: 'draw2',
    name: '+2',
    label: '+2',
    description: '下一個人抽 2 張，可以疊加。',
    crazy: false,
    wild: false,
    count: 2,
    stackable: true,
    onPlay(ctx) {
      addPendingDraw(ctx.state, 2, ctx.playerIndex);
    },
  },
  {
    kind: 'wild',
    name: '變色',
    label: '★',
    description: '任何時候都能出，指定下一個顏色。',
    crazy: false,
    wild: true,
    count: 4,
  },
  {
    kind: 'wild4',
    name: '+4',
    label: '+4',
    description: '指定顏色，下一個人抽 4 張，可以疊加。',
    crazy: false,
    wild: true,
    count: 4,
    stackable: true,
    onPlay(ctx) {
      addPendingDraw(ctx.state, 4, ctx.playerIndex);
    },
  },
];
