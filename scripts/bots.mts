/**
 * 開幾個機器人連進房間互打一整局，用來測試伺服器。
 *   npx tsx scripts/bots.mts [人數] [房間]
 * 也可以自己開瀏覽器 http://localhost:5173/?room=bots 跟它們一起玩（機器人只會在輪到自己時出牌，不會開局，要你當房主或讓 bot0 開）
 */
import { Client, type Room } from '@colyseus/sdk';
import { getCardDef, type RoomView } from '@crazyuno/shared';

const count = Number(process.argv[2] ?? 3);
const roomKey = process.argv[3] ?? `bots-${Date.now()}`;
const endpoint = process.env.ENDPOINT ?? 'http://localhost:5173/colyseus';
/** 每個動作前等幾毫秒（跟真人一起玩時設 1500 左右） */
const delay = Number(process.env.DELAY ?? 0);

const COLORS = ['red', 'yellow', 'green', 'blue'] as const;
let finished = false;
let actions = 0;

async function bot(i: number): Promise<void> {
  const room: Room = await new Client(endpoint).joinOrCreate('uno', { roomKey, name: `bot${i}` });
  let lastSeq = '';
  let latest: RoomView | null = null;
  let scheduled = false;
  room.onMessage('error', (msg: string) => console.log(`[bot${i}] 錯誤：${msg}`));
  room.onMessage('view', (v: RoomView) => {
    latest = v;
    const g = v.game;
    if (!g) {
      if (i === 0 && v.you === v.hostId && v.seats.length >= count && !finished) {
        room.send('settings', { turnSeconds: 0 });
        room.send('start');
      }
      return;
    }
    if (g.phase === 'ended') {
      if (!finished) {
        finished = true;
        console.log(g.log.slice(-8).join('\n'));
        console.log(`\n✅ 遊戲結束，共 ${actions} 個動作。贏家：${g.players.find((p) => p.id === g.winnerId)?.name}`);
        setTimeout(() => process.exit(0), 200);
      }
      return;
    }
    const hand = g.hand ?? [];
    // 被抓 UNO 的機會：有人剩一張沒喊就抓
    for (const p of g.players) {
      if (p.id !== v.you && !p.out && p.handCount === 1 && !p.unoSafe && Math.random() < 0.3) {
        room.send('catch', { targetId: p.id });
      }
    }
    if (g.turnId !== v.you) return;
    const key = `${g.log.length}:${hand.length}:${g.hasDrawn}:${g.pendingDraw}`;
    if (key === lastSeq) return;
    lastSeq = key;
    actions++;
    if (actions > 3000) {
      console.log('❌ 動作太多，可能卡住了');
      process.exit(1);
    }
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      // 用最新的畫面行動，避免拿舊資料出已經不在手上的牌
      if (latest?.game?.phase === 'playing' && latest.game.turnId === latest.you) act(latest);
    }, delay);
  });
  room.send('hello');

  function act(v: RoomView) {
    const g = v.game!;
    const hand = g.hand ?? [];
    if (hand.length <= 2 && Math.random() < 0.7) room.send('uno');
    const card = hand.find((c) => g.playable.includes(c.id));
    if (card) {
      const color = getCardDef(card.kind).wild ? COLORS[Math.floor(Math.random() * 4)] : undefined;
      room.send('play', { cardId: card.id, color });
    } else if (g.hasDrawn) {
      room.send('pass');
    } else {
      room.send('draw');
    }
  }
}

for (let i = 0; i < count; i++) {
  await bot(i);
}
if (delay === 0) {
  setTimeout(() => {
    console.log('❌ 60 秒內沒打完');
    process.exit(1);
  }, 60_000);
}
