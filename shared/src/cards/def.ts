import type { Card, CardKind, GameState, PlayerState } from '../types';

/** 出牌效果可以用的東西 */
export interface EffectContext {
  state: GameState;
  /** 出牌的人 */
  player: PlayerState;
  playerIndex: number;
  card: Card;
  rng: () => number;
  log(msg: string): void;
  /** 出完牌後往前走幾個人（預設 1；跳過 = 2） */
  advance: number;
  /** 直接指定下一個輪到誰（player index），會蓋過 advance */
  nextTurn?: number;
  /** 出牌的人指定的對象（player index）：0/7 規則的 7 要選跟誰換手牌 */
  target?: number;
}

export interface CardDef {
  kind: CardKind;
  /** 顯示名稱 */
  name: string;
  /** 牌面上的大字 */
  label: string;
  description: string;
  /** 怪牌可以在大廳開關，一般牌永遠都在 */
  crazy: boolean;
  /** 黑色萬用牌：出的時候要選顏色 */
  wild: boolean;
  /** 牌組裡的數量：有色牌是「每種顏色幾張」，萬用牌是「總共幾張」 */
  count: number;
  /** 抽牌疊加中（pendingDraw > 0）可以出這張來接 */
  stackable?: boolean;
  onPlay?(ctx: EffectContext): void;
}
