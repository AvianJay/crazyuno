export const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
export type Color = (typeof COLORS)[number];

/** 所有牌的種類。新增怪牌時在這裡加一個名字，再到 cards/ 寫它的定義。 */
export type CardKind =
  // 一般 UNO
  | 'number'
  | 'skip'
  | 'reverse'
  | 'draw2'
  | 'wild'
  | 'wild4'
  // 怪牌
  | 'draw99'
  | 'double'
  | 'mirror'
  | 'dice'
  | 'swapAll';

export interface Card {
  id: string;
  kind: CardKind;
  /** 黑色萬用牌是 null */
  color: Color | null;
  /** 只有數字牌有 */
  value?: number;
}

export interface GameSettings {
  /** 這局要加入哪些怪牌 */
  crazyCards: CardKind[];
  /** 手牌超過這個數字就爆牌出局（0 = 不限制） */
  handLimit: number;
  startingHand: number;
  /** 每回合秒數，時間到自動抽牌（0 = 不限時） */
  turnSeconds: number;
  /** 整局幾分鐘，時間到手牌最少的人贏（0 = 不限時） */
  gameMinutes: number;
  /** 0/7 規則：出 0 大家的手牌往出牌方向傳，出 7 跟自己選的一個人交換手牌 */
  sevenZero: boolean;
}

export interface PlayerState {
  id: string;
  name: string;
  avatar: string | null;
  hand: Card[];
  /** 爆牌或離開 */
  out: boolean;
  /** 已經喊過 UNO，不能被抓 */
  unoSafe: boolean;
}

export interface GameState {
  phase: 'playing' | 'ended';
  players: PlayerState[];
  drawPile: Card[];
  discardPile: Card[];
  currentColor: Color;
  /** 目前輪到的玩家 index */
  turn: number;
  /** 每換一次回合 +1，伺服器用來重設計時器 */
  turnSeq: number;
  direction: 1 | -1;
  /** 累積中的抽牌數（+2、+4、+99 疊加） */
  pendingDraw: number;
  /** 最後一個往抽牌堆疊加的人，鏡子牌會把整疊彈回給他 */
  pendingFrom: number | null;
  /** 這回合已經抽過一張牌了 */
  hasDrawn: boolean;
  /** 最近一次換手牌（大風吹、0/7 規則），前端靠它放牌飛來飛去的動畫 */
  handSwap: HandSwap | null;
  winnerId: string | null;
  settings: GameSettings;
  log: string[];
  nextCardId: number;
}

export interface HandSwap {
  /** 每換一次 +1 */
  seq: number;
  /** 誰的整手牌給了誰 */
  moves: [from: string, to: string][];
}

/** 傳給單一玩家的畫面資料（看不到別人的手牌） */
export interface GameView {
  phase: GameState['phase'];
  players: {
    id: string;
    name: string;
    avatar: string | null;
    handCount: number;
    out: boolean;
    unoSafe: boolean;
  }[];
  /** 觀戰者是 null */
  hand: Card[] | null;
  playable: string[];
  topCard: Card;
  currentColor: Color;
  direction: 1 | -1;
  turnId: string;
  pendingDraw: number;
  hasDrawn: boolean;
  handSwap: HandSwap | null;
  /** 這局有沒有開 0/7 規則（出 7 要選人） */
  sevenZero: boolean;
  drawPileCount: number;
  winnerId: string | null;
  log: string[];
}

/** 一桌最多幾個人（伺服器的 maxClients 跟 Discord Rich Presence 的 party size 都用這個） */
export const MAX_PLAYERS = 10;

export interface Seat {
  id: string;
  name: string;
  avatar: string | null;
  connected: boolean;
  /**
   * Discord 使用者 id（瀏覽器直接開的人是 null）。
   * 語音事件只給 user id，前端靠這個把「誰在說話」對到座位上。
   */
  discordId?: string | null;
}

/** 伺服器每次狀態改變時送給每個玩家的完整資料 */
export interface RoomView {
  you: string;
  hostId: string | null;
  seats: Seat[];
  settings: GameSettings;
  game: GameView | null;
  /** 距離這回合時間到還有幾毫秒（null = 不限時） */
  turnMsLeft: number | null;
  /** 距離整局時間到還有幾毫秒（null = 不限時） */
  gameMsLeft: number | null;
}

// ---- client → server 訊息 ----
export interface PlayMsg {
  cardId: string;
  color?: Color;
  /** 0/7 規則出 7：要跟誰換手牌 */
  targetId?: string;
}
export interface CatchMsg {
  targetId: string;
}
