import { Room, type Client } from 'colyseus';
import {
  autoMove,
  catchUno,
  createGame,
  CRAZY_KINDS,
  DEFAULT_SETTINGS,
  drawAction,
  GameError,
  getView,
  passTurn,
  playCard,
  removePlayer,
  sayUno,
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
}

type Timer = ReturnType<Room['clock']['setTimeout']>;

const clamp = (n: unknown, min: number, max: number, fallback: number) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
};

/**
 * 一間房 = 一桌 UNO。
 * 遊戲狀態只存在伺服器，每次有變化就幫每個人各算一份「他看得到的畫面」送過去，
 * 所以前端永遠拿不到別人的手牌。
 */
export class UnoRoom extends Room {
  maxClients = 10;

  private seats: Seat[] = [];
  private hostId: string | null = null;
  private settings: GameSettings = structuredClone(DEFAULT_SETTINGS);
  private game: GameState | null = null;

  private turnTimer: Timer | null = null;
  private timerSeq = -1;
  private turnEndsAt = 0;

  messages = {
    // 前端掛好 onMessage 之後才送 hello，再回畫面給他（太早送的訊息 SDK 會丟掉）
    hello: (client: Client) => client.send('view', this.viewFor(client.sessionId)),

    settings: (client: Client, patch: Partial<GameSettings>) =>
      this.handle(client, () => {
        this.requireHost(client);
        const s = this.settings;
        if (Array.isArray(patch.crazyCards)) s.crazyCards = CRAZY_KINDS.filter((k) => patch.crazyCards!.includes(k));
        if (patch.handLimit !== undefined) s.handLimit = clamp(patch.handLimit, 0, 200, s.handLimit);
        if (patch.startingHand !== undefined) s.startingHand = clamp(patch.startingHand, 1, 20, s.startingHand);
        if (patch.turnSeconds !== undefined) s.turnSeconds = clamp(patch.turnSeconds, 0, 120, s.turnSeconds);
      }),

    start: (client: Client) =>
      this.handle(client, () => {
        this.requireHost(client);
        if (this.game?.phase === 'playing') throw new GameError('遊戲已經在進行中');
        const players = this.seats.filter((s) => s.connected);
        if (players.length < 2) throw new GameError('至少要兩個人才能開始');
        this.game = createGame(players, structuredClone(this.settings));
      }),

    lobby: (client: Client) =>
      this.handle(client, () => {
        this.requireHost(client);
        if (this.game?.phase === 'playing') throw new GameError('遊戲還在進行中');
        this.game = null;
      }),

    play: (client: Client, msg: PlayMsg) => this.handle(client, () => playCard(this.requireGame(), client.sessionId, msg)),
    draw: (client: Client) => this.handle(client, () => drawAction(this.requireGame(), client.sessionId)),
    pass: (client: Client) => this.handle(client, () => passTurn(this.requireGame(), client.sessionId)),
    uno: (client: Client) => this.handle(client, () => sayUno(this.requireGame(), client.sessionId)),
    catch: (client: Client, msg: CatchMsg) =>
      this.handle(client, () => catchUno(this.requireGame(), client.sessionId, String(msg?.targetId))),
  };

  onJoin(client: Client, options: JoinOptions) {
    const name = String(options.name ?? '').trim().slice(0, 20) || `玩家${this.seats.length + 1}`;
    const avatar = typeof options.avatar === 'string' && options.avatar.startsWith('https://') ? options.avatar : null;
    this.seats.push({ id: client.sessionId, name, avatar, connected: true });
    this.hostId ??= client.sessionId;
    this.sync();
  }

  onDrop(client: Client) {
    this.setConnected(client.sessionId, false);
    Promise.resolve(this.allowReconnection(client, 60)).catch(() => {});
  }

  onReconnect(client: Client) {
    this.setConnected(client.sessionId, true);
  }

  onLeave(client: Client) {
    this.seats = this.seats.filter((s) => s.id !== client.sessionId);
    if (this.hostId === client.sessionId) this.hostId = this.seats[0]?.id ?? null;
    if (this.game) removePlayer(this.game, client.sessionId);
    this.sync();
  }

  private setConnected(id: string, connected: boolean) {
    const seat = this.seats.find((s) => s.id === id);
    if (seat) seat.connected = connected;
    this.sync();
  }

  private requireHost(client: Client) {
    if (client.sessionId !== this.hostId) throw new GameError('只有房主可以做這件事');
  }

  private requireGame(): GameState {
    if (!this.game) throw new GameError('遊戲還沒開始');
    return this.game;
  }

  /** 執行玩家動作；不合法就只回錯誤給那個人，成功就同步給所有人 */
  private handle(client: Client, action: () => void) {
    try {
      action();
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
    for (const client of this.clients) client.send('view', this.viewFor(client.sessionId));
  }

  private viewFor(id: string): RoomView {
    const timed = this.game?.phase === 'playing' && this.turnTimer !== null;
    return {
      you: id,
      hostId: this.hostId,
      seats: this.seats,
      settings: this.settings,
      game: this.game ? getView(this.game, id) : null,
      turnMsLeft: timed ? Math.max(0, this.turnEndsAt - Date.now()) : null,
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
}
