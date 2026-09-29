/**
 * 把遊戲狀態變成 Discord Rich Presence：
 * 朋友在個人檔案上看到「在 MadCards 玩 3/10 人的牌局」、還剩幾張牌、誰領先。
 *
 * 只在真的有變化時才送（setPresence 自己會比對），而且大廳／牌桌／結算各一句話。
 */
import { MAX_PLAYERS, type RoomView } from '@crazyuno/shared';
import { useEffect, useRef } from 'react';
import { setPresence } from './discord';

export function usePresence(view: RoomView | null): void {
  /** 這一局什麼時候開始的（unix 秒），讓 Discord 顯示「已經玩了多久」 */
  const startedAt = useRef<number | null>(null);
  const phase = useRef<string>('');

  useEffect(() => {
    if (!view) {
      setPresence(null);
      return;
    }
    const game = view.game;
    const me = game?.players.find((p) => p.id === view.you);
    const playing = game?.phase === 'playing';

    if (playing && phase.current !== 'playing') startedAt.current = Math.floor(Date.now() / 1000);
    if (!playing) startedAt.current = null;
    phase.current = playing ? 'playing' : (game?.phase ?? 'lobby');

    // 只算連著的人：斷線（機器人代打、還在等他回來）的座位不算在房間裡，
    // 座位數也可能超過上限（滿人時有人斷線、又有人進來觀戰），Discord 不收「11 of 10」
    const seats = Math.min(view.seats.filter((s) => s.connected).length, MAX_PLAYERS);

    if (!game) {
      setPresence({
        details: '在大廳等大家進來',
        state: seats > 1 ? `${seats} 個人在房間裡` : '等第一個人加入',
        party: [Math.max(seats, 1), MAX_PLAYERS],
      });
      return;
    }

    if (game.phase === 'ended') {
      const winner = game.players.find((p) => p.id === game.winnerId);
      setPresence({
        details: winner ? (winner.id === view.you ? '我贏了！🏆' : `${winner.name} 贏了`) : '這局結束了',
        state: '準備下一局',
        party: [seats, MAX_PLAYERS],
      });
      return;
    }

    // 玩到一半：看自己的手牌，觀戰的人看場上狀況
    if (!me) {
      setPresence({ details: '觀戰中', state: `場上還有 ${game.players.filter((p) => !p.out).length} 個人`, party: [seats, MAX_PLAYERS] });
      return;
    }

    const myTurn = game.turnId === view.you;
    setPresence({
      details: myTurn ? '輪到我出牌了 🔥' : '打牌中',
      state: me.out ? '已經爆牌出局 💥' : `手上還有 ${me.handCount} 張`,
      party: [seats, MAX_PLAYERS],
      start: startedAt.current ?? undefined,
    });
  }, [view]);
}
