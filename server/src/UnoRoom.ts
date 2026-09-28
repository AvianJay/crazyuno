import { Room, type Client } from 'colyseus';
import {
  autoMove,
  botMove,
  catchUno,
  createGame,
  CRAZY_KINDS,
  DEFAULT_SETTINGS,
  drawAction,
  GameError,
  getView,
  passTurn,
  playCard,
  sayUno,
  timeUp,
  type CardKind,
  type CatchMsg,
  type GameSettings,
  type GameState,
  type PlayMsg,
  type RoomView,
  type Seat,
} from '@crazyuno/shared';

interface JoinOptions {
  roomKey?: string;
  name?: string;
  avatar?: string | null;
  /** 認人用的 key（Discord 是使用者 id，瀏覽器是這個分頁存的亂數），重新連進來靠它拿回座位 */
  userKey?: string;
}

type Timer = ReturnType<Room['clock']['setTimeout']>;

/** 斷線後等多久機器人才接手（網路閃一下就回來的話不會被代打） */
const BOT_GRACE_MS = 4000;
/** 機器人每一步之間停多久，大家才看得清楚 */
const BOT_STEP_MS = 1300;
/** 大廳裡斷線的人留幾秒座位 */
const SEAT_GRACE_MS = 60_000;
/** 所有人都斷線後，房間留幾分鐘等人回來 */
const EMPTY_ROOM_MS = 5 * 60_000;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

/**
 * 一間房 = 一桌 UNO。
 * 遊戲狀態只存在伺服器，每次有變化就幫每個人各算一份「他看得到的畫面」送過去，
 * 所以前端永遠拿不到別人的手牌。
 *
 * 座位（Seat）跟連線（Client）是分開的：斷線時座位留著、遊戲中由機器人代打，
 * 同一個人（同一個 userKey）重新連進來就接回原本的座位繼續玩。
 */
export class UnoRoom extends Room {
  maxClients = 10;
  // 沒人連著也先別關房，等大家回來（見 scheduleDispose）
  autoDispose = false;

  private seats: Seat[] = [];
  private hostId: string | null = null;
  private settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  private game: GameState | null = null;

  private nextSeat = 0;
  /** 連線 → 座位 */
  private sessionSeat = new Map<string, string>();
  /** 座位 → 目前接著它的連線 */
  private seatSession = new Map<string, string>();
  /** userKey → 座位 */
  private keySeat = new Map<string, string>();
  /** 座位什麼時候斷線的 */
  private droppedAt = new Map<string, number>();

  private turnTimer: Timer | null = null;
  private timerSeq = -1;
  private turnEndsAt = 0;
  private gameTimer: Timer | null = null;
  /** 正在計時的是哪一局 */
  private timedGame: GameState | null = null;
  private gameEndsAt = 0;
  private botTimer: Timer | null = null;
  private botStep = '';
  private disposeTimer: Timer | null = null;

  messages = {
    // 前端掛好 onMessage 之後才送 hello，再回畫面給他（太早送的訊息 SDK 會丟掉）
    hello: (client: Client) => {
      const seatId = this.sessionSeat.get(client.sessionId);
      if (seatId) client.send('view', this.viewFor(seatId));
    },

    settings: (client: Client, patch: Partial<GameSettings>) =>
      this.handle(client, () => {
        this.requireHost(client);
        const s = this.settings;
        if (Array.isArray(patch.crazyCards)) s.crazyCards = CRAZY_KINDS.filter((k) => patch.crazyCards!.includes(k));
        if (patch.handLimit !== undefined) s.handLimit = clamp(patch.handLimit, 0, 200, s.handLimit);
        if (patch.startingHand !== undefined) s.startingHand = clamp(patch.startingHand, 1, 20, s.startingHand);
        if (patch.turnSeconds !== undefined) s.turnSeconds = clamp(patch.turnSeconds, 0, 120, s.turnSeconds);
        if (patch.gameMinutes !== undefined) s.gameMinutes = clamp(patch.gameMinutes, 0, 60, s.gameMinutes);
        if (typeof patch.sevenZero === 'boolean') s.sevenZero = patch.sevenZero;
      }),

    // 下面三個是「相對」的改法：連點好幾下時伺服器照順序改，不會被還沒更新的畫面蓋掉
    toggleCrazy: (client: Client, kind: CardKind) =>
      this.handle(client, () => {
        this.requireHost(client);
        const s = this.settings;
        if (!CRAZY_KINDS.includes(kind)) return;
        const on = s.crazyCards.includes(kind);
        s.crazyCards = CRAZY_KINDS.filter((k) => (k === kind ? !on : s.crazyCards.includes(k)));
      }),

    toggleSevenZero: (client: Client) =>
      this.handle(client, () => {
        this.requireHost(client);
        this.settings.sevenZero = !this.settings.sevenZero;
      }),

    adjust: (client: Client, msg: { key: 'startingHand' | 'handLimit' | 'turnSeconds' | 'gameMinutes'; delta: number }) =>
      this.handle(client, () => {
        this.requireHost(client);
        const s = this.settings;
        const range = { startingHand: [1, 20], handLimit: [0, 200], turnSeconds: [0, 120], gameMinutes: [0, 60] } as const;
        const r = range[msg?.key];
        if (!r || !Number.isFinite(msg.delta)) return;
        s[msg.key] = clamp(s[msg.key] + msg.delta, r[0], r[1], s[msg.key]);
      }),

    start: (client: Client) =>
      this.handle(client, () => {
        this.requireHost(client);
        if (this.game?.phase === 'playing') throw new GameError('遊戲已經在進行中');
        this.pruneSeats(true);
        // 開新的一局只算連著的人，斷線的人不會被發牌
        const players = this.seats.filter((s) => s.connected);
        if (players.length < 2) throw new GameError('至少要兩個人才能開始');
        this.game = createGame(players, structuredClone(this.settings));
      }),

    lobby: (client: Client) =>
      this.handle(client, () => {
        this.requireHost(client);
        if (this.game?.phase === 'playing') throw new GameError('遊戲還在進行中');
        this.game = null;
        this.pruneSeats(true);
      }),

    play: (client: Client, msg: PlayMsg) => this.handle(client, (id) => playCard(this.requireGame(), id, msg)),
    draw: (client: Client) => this.handle(client, (id) => drawAction(this.requireGame(), id)),
    pass: (client: Client) => this.handle(client, (id) => passTurn(this.requireGame(), id)),
    uno: (client: Client) => this.handle(client, (id) => sayUno(this.requireGame(), id)),
    catch: (client: Client, msg: CatchMsg) =>
      this.handle(client, (id) => catchUno(this.requireGame(), id, String(msg?.targetId))),
  };

  onCreate() {
    // 大廳裡斷線太久的人定期清掉
    this.clock.setInterval(() => {
      if (this.pruneSeats(false)) this.sync();
    }, 5000);
  }

  onJoin(client: Client, options: JoinOptions) {
    const name = String(options.name ?? '').trim().slice(0, 20) || `玩家${this.seats.length + 1}`;
    const avatar = typeof options.avatar === 'string' && options.avatar.startsWith('https://') ? options.avatar : null;
    const key = typeof options.userKey === 'string' && options.userKey ? options.userKey.slice(0, 80) : `session:${client.sessionId}`;

    let seat = this.seats.find((s) => s.id === this.keySeat.get(key));
    if (seat) {
      // 回來了：接回原本的座位。如果舊的連線還在（例如在別的裝置開著），把它踢掉
      const oldSession = this.seatSession.get(seat.id);
      if (oldSession) {
        this.sessionSeat.delete(oldSession);
        const old = this.clients.find((c) => c.sessionId === oldSession);
        old?.send('error', '你在別的地方重新加入了');
        old?.leave();
      }
      seat.name = name;
      seat.avatar = avatar;
    } else {
      seat = { id: `p${++this.nextSeat}`, name, avatar, connected: true };
      this.seats.push(seat);
      this.keySeat.set(key, seat.id);
    }
    this.attach(client, seat);
    this.hostId ??= seat.id;
    this.sync();
  }

  onDrop(client: Client) {
    this.detach(client);
    // SDK 會自己重連；連回來的是同一個 session，在 onReconnect 接回座位
    Promise.resolve(this.allowReconnection(client, 60)).catch(() => {});
  }

  onReconnect(client: Client) {
    const seat = this.seats.find((s) => s.id === this.sessionSeat.get(client.sessionId));
    if (!seat || this.seatSession.get(seat.id) !== client.sessionId) {
      // 斷線期間座位已經被新的連線接走了（例如重新整理過）
      this.sessionSeat.delete(client.sessionId);
      client.leave();
      return;
    }
    this.attach(client, seat);
    this.sync();
  }

  onLeave(client: Client) {
    this.detach(client);
    this.sessionSeat.delete(client.sessionId);
  }

  private attach(client: Client, seat: Seat) {
    this.sessionSeat.set(client.sessionId, seat.id);
    this.seatSession.set(seat.id, client.sessionId);
    seat.connected = true;
    this.droppedAt.delete(seat.id);
    this.disposeTimer?.clear();
    this.disposeTimer = null;
  }

  /** 連線斷了：座位標成離線（遊戲中就由機器人代打），但先不刪 */
  private detach(client: Client) {
    const seatId = this.sessionSeat.get(client.sessionId);
    // 座位已經被別的連線接走就不用管
    if (!seatId || this.seatSession.get(seatId) !== client.sessionId) return;
    const seat = this.seats.find((s) => s.id === seatId);
    if (seat?.connected) {
      seat.connected = false;
      this.droppedAt.set(seatId, Date.now());
    }
    if (!this.seats.some((s) => s.connected)) this.scheduleDispose();
    this.sync();
  }

  private scheduleDispose() {
    this.disposeTimer?.clear();
    this.disposeTimer = this.clock.setTimeout(() => {
      if (!this.seats.some((s) => s.connected)) this.disconnect();
    }, EMPTY_ROOM_MS);
  }

  /**
   * 把斷線的座位清掉：遊戲中還在場上的人不清（機器人在幫他打）。
   * now = true 表示不用等寬限時間（開新局、回大廳的時候）。回傳有沒有清掉誰。
   */
  private pruneSeats(now: boolean): boolean {
    const playing = this.game?.phase === 'playing' ? this.game : null;
    const before = this.seats.length;
    this.seats = this.seats.filter((s) => {
      if (s.connected) return true;
      if (playing?.players.some((p) => p.id === s.id && !p.out)) return true;
      if (!now && Date.now() - (this.droppedAt.get(s.id) ?? 0) < SEAT_GRACE_MS) return true;
      this.droppedAt.delete(s.id);
      this.seatSession.delete(s.id);
      for (const [key, id] of this.keySeat) if (id === s.id) this.keySeat.delete(key);
      return false;
    });
    if (!this.seats.some((s) => s.id === this.hostId)) this.hostId = this.seats[0]?.id ?? null;
    return this.seats.length !== before;
  }

  /** 房主離線的時候，由第一個還連著的人暫代（房主回來就還給他） */
  private effectiveHost(): string | null {
    const host = this.seats.find((s) => s.id === this.hostId);
    if (host?.connected) return host.id;
    return this.seats.find((s) => s.connected)?.id ?? this.hostId;
  }

  private requireHost(client: Client) {
    if (this.sessionSeat.get(client.sessionId) !== this.effectiveHost()) throw new GameError('只有房主可以做這件事');
  }

  private requireGame(): GameState {
    if (!this.game) throw new GameError('遊戲還沒開始');
    return this.game;
  }

  /** 執行玩家動作；不合法就只回錯誤給那個人，成功就同步給所有人 */
  private handle(client: Client, action: (seatId: string) => void) {
    const seatId = this.sessionSeat.get(client.sessionId);
    if (!seatId) return;
    try {
      action(seatId);
    } catch (e) {
      if (e instanceof GameError) {
        client.send('error', e.message);
        return;
      }
      console.error(e);
      client.send('error', '伺服器出錯了');
      return;
    }
    this.sync();
  }

  private sync() {
    this.updateTurnTimer();
    this.updateGameTimer();
    this.updateBot();
    for (const client of this.clients) {
      const seatId = this.sessionSeat.get(client.sessionId);
      if (seatId) client.send('view', this.viewFor(seatId));
    }
  }

  private viewFor(seatId: string): RoomView {
    const timed = this.game?.phase === 'playing' && this.turnTimer !== null;
    return {
      you: seatId,
      hostId: this.effectiveHost(),
      seats: this.seats,
      settings: this.settings,
      game: this.game ? getView(this.game, seatId) : null,
      turnMsLeft: timed ? Math.max(0, this.turnEndsAt - Date.now()) : null,
      gameMsLeft: this.gameTimer ? Math.max(0, this.gameEndsAt - Date.now()) : null,
    };
  }

  /** 換人的時候重新計時；時間到就幫他抽牌跳過 */
  private updateTurnTimer() {
    const game = this.game;
    const seconds = game?.settings.turnSeconds ?? 0;
    if (!game || game.phase !== 'playing' || seconds <= 0) {
      this.turnTimer?.clear();
      this.turnTimer = null;
      this.timerSeq = -1;
      return;
    }
    if (game.turnSeq === this.timerSeq) return;

    this.turnTimer?.clear();
    this.timerSeq = game.turnSeq;
    this.turnEndsAt = Date.now() + seconds * 1000;
    this.turnTimer = this.clock.setTimeout(() => {
      this.turnTimer = null;
      if (this.game !== game) return;
      autoMove(game);
      this.timerSeq = -1; // 就算 autoMove 沒換人也要重新計時
      this.sync();
    }, seconds * 1000);
  }

  /** 整局限時：開局就開始倒數，時間到比誰手牌最少 */
  private updateGameTimer() {
    const game = this.game?.phase === 'playing' && this.game.settings.gameMinutes > 0 ? this.game : null;
    if (game === this.timedGame) return;

    this.gameTimer?.clear();
    this.gameTimer = null;
    this.timedGame = game;
    if (!game) return;
    const ms = game.settings.gameMinutes * 60_000;
    this.gameEndsAt = Date.now() + ms;
    this.gameTimer = this.clock.setTimeout(() => {
      this.gameTimer = null;
      if (this.game !== game) return;
      timeUp(game);
      this.sync();
    }, ms);
  }

  /** 輪到離線的人：過一下子讓機器人幫他走一步 */
  private updateBot() {
    const game = this.game;
    const current = game?.phase === 'playing' ? game.players[game.turn] : null;
    const seat = current && this.seats.find((s) => s.id === current.id);
    // 全部人都離線就先停著，等有人回來再繼續
    const needBot = !!current && !seat?.connected && this.seats.some((s) => s.connected);
    // 同一步已經排好了就不要重排，不然別人一直操作會把機器人一直往後推
    const step = needBot ? `${game!.turnSeq}:${game!.hasDrawn}:${game!.pendingDraw}` : '';
    if (step === this.botStep && (this.botTimer || !needBot)) return;

    this.botTimer?.clear();
    this.botTimer = null;
    this.botStep = step;
    if (!needBot) return;

    const since = Date.now() - (this.droppedAt.get(current!.id) ?? 0);
    this.botTimer = this.clock.setTimeout(
      () => {
        this.botTimer = null;
        this.botStep = '';
        if (this.game !== game || game!.players[game!.turn] !== current) return;
        try {
          botMove(game!);
        } catch (e) {
          // 機器人不應該出錯；真的出錯就當作時間到，至少遊戲不會卡住
          console.error('botMove', e);
          autoMove(game!);
        }
        this.sync();
      },
      Math.max(BOT_STEP_MS, BOT_GRACE_MS - since),
    );
  }
}
