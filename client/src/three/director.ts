import type { GameView, RoomView } from '@crazyuno/shared';
import type * as THREE from 'three';
import * as sfx from '../sfx';
import { COLOR_HEX } from './cardArt';
import type { GameEvent } from './events';
import { emitFx, type Vec3 } from './fx';
import { deckWorldPose, DISCARD, MY_SEAT } from './layout';

const RAINBOW = Object.values(COLOR_HEX);
const FIRE = ['#ffdd55', '#ff8a00', '#ff3b1f', '#ffffff'];

const v = (p: THREE.Vector3, y = 0): Vec3 => [p.x, p.y + y, p.z];

/** 把事件翻譯成音效和特效 */
export function direct(
  events: GameEvent[],
  view: RoomView,
  game: GameView,
  seats: Map<string, THREE.Vector3>,
  /** 3D 畫布的大小（手機版 Discord 會扣掉被蓋住的邊，不一定是整個視窗） */
  size: { width: number; height: number },
) {
  const name = (id: string) => (id === view.you ? '你' : (game.players.find((p) => p.id === id)?.name ?? '?'));
  const seat = (id: string) => seats.get(id) ?? MY_SEAT;
  const pile = v(DISCARD, 0.1);
  const colorHex = COLOR_HEX[game.currentColor];
  // 見者有份一次讓全桌都抽牌：抽牌聲只放一次，不然十個人的刷刷聲疊在一起
  const everyone = events.some((e) => e.t === 'play' && e.card.kind === 'drawAll');
  let drawSounded = false;

  for (const e of events) {
    switch (e.t) {
      case 'start':
        sfx.shuffle();
        emitFx({ kind: 'text', text: '開局！', tone: 'gold' });
        emitFx({ kind: 'burst', at: v(deckWorldPose(size.width / size.height, size.height).pos), colors: RAINBOW, count: 120, speed: 4, up: 3 });
        break;

      case 'play': {
        const kind = e.card.kind;
        const hex = e.card.color ? COLOR_HEX[e.card.color] : colorHex;
        sfx.whoosh(0.25);
        sfx.slap(0.28);
        emitFx({ kind: 'burst', at: pile, colors: [hex, '#ffffff'], count: 70, speed: 3.2, up: 1.5 }, 300);
        emitFx({ kind: 'ring', at: pile, color: hex, size: 2.4 }, 300);
        emitFx({ kind: 'shake', amount: 0.18 }, 300);

        if (kind === 'draw99') {
          sfx.plus99();
          emitFx({ kind: 'flash', color: '#ff0000', strength: 0.8 }, 250);
          emitFx({ kind: 'text', text: '+99', tone: 'danger' }, 250);
          emitFx({ kind: 'shake', amount: 1 }, 300);
          emitFx({ kind: 'aberration', amount: 1 }, 300);
          for (let i = 0; i < 4; i++) {
            emitFx({ kind: 'ring', at: pile, color: i % 2 ? '#ffd34d' : '#ff2020', size: 5 + i * 2.5, life: 1.4 }, 300 + i * 180);
          }
          emitFx({ kind: 'burst', at: pile, colors: FIRE, count: 600, speed: 9, up: 4, size: 0.35, life: 2 }, 300);
        } else if (kind === 'skip') {
          sfx.buzzer();
          emitFx({ kind: 'text', text: '⊘ 禁止！', color: hex }, 250);
        } else if (kind === 'double') {
          emitFx({ kind: 'text', text: '×2！', tone: 'danger' }, 250);
        } else if (kind === 'drawAll') {
          sfx.gift();
          emitFx({ kind: 'text', text: '🎁 見者有份！', tone: 'gold' }, 250);
          emitFx({ kind: 'ring', at: pile, color: hex, size: 8, life: 1.2 }, 300);
          // 每個人頭上都炸一下：大家都有份
          for (const p of game.players) {
            if (p.id === e.by || p.out) continue;
            emitFx({ kind: 'burst', at: v(seat(p.id), 1), colors: [hex, '#ffd34d', '#ffffff'], count: 90, speed: 3.5, up: 2 }, 450);
          }
        }
        break;
      }

      case 'sweep': {
        const hex = e.cards[0]?.color ? COLOR_HEX[e.cards[0].color] : colorHex;
        sfx.sweep(e.cards.length);
        emitFx({ kind: 'text', text: `🧹 清倉！×${e.cards.length + 1}`, color: hex }, 250);
        emitFx({ kind: 'burst', at: pile, colors: [hex, '#ffffff'], count: Math.min(400, 120 + e.cards.length * 40), speed: 5, up: 2.5 }, 300);
        emitFx({ kind: 'ring', at: pile, color: hex, size: 5, life: 1 }, 300);
        emitFx({ kind: 'shake', amount: Math.min(0.6, 0.15 + e.cards.length * 0.06) }, 300);
        break;
      }

      // 判決的大字比「+N 張」早一點出來：疊在上面那行先講誰唬爛，下面那行才是誰吃牌
      case 'challenge':
        sfx.gavel();
        if (e.guilty) {
          sfx.whistle();
          emitFx({ kind: 'flash', color: '#ff2020', strength: 0.4 }, 150);
          emitFx({ kind: 'text', text: e.target === view.you ? '🎯 你被抓包了！' : `🎯 抓到 ${name(e.target)} 唬爛！`, tone: 'danger' }, 150);
          emitFx({ kind: 'ring', at: v(seat(e.target), 0.05), color: '#ff2020', size: 4, life: 1.2 }, 150);
        } else {
          sfx.buzzer();
          emitFx({ kind: 'text', text: `😇 ${name(e.target)} 是清白的！`, tone: 'gold' }, 150);
          emitFx({ kind: 'ring', at: v(seat(e.target), 0.05), color: '#7dff9b', size: 4, life: 1.2 }, 150);
        }
        break;

      case 'stack':
        sfx.stack(e.total);
        if (e.total >= 10) emitFx({ kind: 'shake', amount: Math.min(0.8, e.total / 40) }, 300);
        break;

      case 'color':
        sfx.colorWave();
        emitFx({ kind: 'ring', at: [0, 0.05, 0.3], color: COLOR_HEX[e.color], size: 9, life: 1.2 }, 300);
        emitFx({ kind: 'flash', color: COLOR_HEX[e.color], strength: 0.25 }, 300);
        break;

      case 'reverse':
        sfx.reverse();
        emitFx({ kind: 'text', text: '⇄ 迴轉！', color: colorHex }, 250);
        break;

      case 'swap':
        if (e.card.kind === 'swapAll') {
          sfx.tornado();
          emitFx({ kind: 'spin' }, 200);
          emitFx({ kind: 'text', text: '🌀 大風吹！', tone: 'gold' }, 200);
          emitFx({ kind: 'burst', at: [0, 0.3, 0.3], colors: ['#bdf6ff', '#ffffff', '#7b5cff'], count: 300, speed: 7, up: 2, life: 1.8 }, 300);
        } else if (e.card.kind === 'number' && e.card.value === 7) {
          // 0/7 規則的 7：兩個人對調
          const [a, b] = e.moves[0];
          sfx.whoosh(0.5, 0.2);
          sfx.shimmer();
          emitFx({ kind: 'text', text: `🔀 ${name(a)} ⇄ ${name(b)}`, color: '#3ee0ff' }, 250);
          for (const id of [a, b]) {
            emitFx({ kind: 'ring', at: v(seat(id), 0.05), color: '#3ee0ff', size: 3, life: 1 }, 300);
            emitFx({ kind: 'burst', at: v(seat(id), 1), colors: ['#3ee0ff', '#ffffff', '#ff4fd8'], count: 140, speed: 4, up: 2 }, 300);
          }
        } else {
          // 0/7 規則的 0：大家往下一家傳
          sfx.tornado();
          emitFx({ kind: 'text', text: game.direction === 1 ? '🔄 手牌往下傳！' : '🔄 手牌往回傳！', color: colorHex }, 250);
          emitFx({ kind: 'ring', at: pile, color: colorHex, size: 7, life: 1.2 }, 300);
          emitFx({ kind: 'burst', at: [0, 0.3, 0.3], colors: [colorHex, '#ffffff'], count: 220, speed: 6, up: 2, life: 1.5 }, 300);
        }
        break;

      case 'mirror':
        sfx.shimmer();
        emitFx({ kind: 'flash', color: '#ffffff', strength: 0.6 }, 250);
        emitFx({ kind: 'text', text: '🪞 反彈！', tone: 'gold' }, 250);
        break;

      case 'dice':
        sfx.dice();
        emitFx({ kind: 'text', text: `🎲 ${e.roll}！`, tone: e.roll >= 10 ? 'danger' : 'normal' }, 600);
        break;

      case 'draw': {
        if (!everyone || !drawSounded) sfx.drawCards(e.n);
        drawSounded = true;
        if (e.n >= 4) {
          emitFx({ kind: 'text', text: `${name(e.id)} +${e.n} 張`, tone: e.n >= 10 ? 'danger' : 'normal' }, 200);
          emitFx({ kind: 'burst', at: v(seat(e.id), 1), colors: ['#ff3b3f', '#ffffff'], count: Math.min(300, 40 + e.n * 4), speed: 4 }, 400);
        }
        if (e.n >= 10) {
          sfx.sadTrombone(0.8);
          emitFx({ kind: 'shake', amount: 0.6 }, 300);
        }
        break;
      }

      case 'out':
        sfx.explosion();
        emitFx({ kind: 'flash', color: '#ff7a00', strength: 0.7 });
        emitFx({ kind: 'text', text: `💥 ${name(e.id)} 爆牌！`, tone: 'danger' });
        emitFx({ kind: 'burst', at: v(seat(e.id), 0.8), colors: FIRE, count: 500, speed: 8, up: 3, size: 0.3, life: 1.8 });
        emitFx({ kind: 'ring', at: v(seat(e.id), 0.05), color: '#ff7a00', size: 6, life: 1 });
        emitFx({ kind: 'shake', amount: 1 });
        emitFx({ kind: 'aberration', amount: 0.7 });
        break;

      case 'uno':
        sfx.unoShout();
        emitFx({ kind: 'text', text: 'LAST!', tone: 'uno' });
        emitFx({ kind: 'burst', at: v(seat(e.id), 1.2), colors: ['#ffc400', '#ff3b3f', '#ffffff'], count: 160, speed: 4, up: 2 });
        break;

      case 'caught':
        sfx.whistle();
        emitFx({ kind: 'text', text: '🚨 抓到了！', tone: 'danger' });
        emitFx({ kind: 'flash', color: '#ff0000', strength: 0.35 });
        break;

      case 'timeout':
        sfx.alarm();
        emitFx({ kind: 'text', text: '⏰ 時間到' });
        break;

      case 'timeUp':
        sfx.alarm();
        sfx.buzzer();
        emitFx({ kind: 'flash', color: '#ffffff', strength: 0.5 });
        emitFx({ kind: 'text', text: '⌛ 整局時間到！', tone: 'danger' });
        emitFx({ kind: 'shake', amount: 0.5 });
        break;

      case 'yourTurn':
        sfx.chime();
        break;

      case 'offline':
        sfx.powerDown();
        emitFx({ kind: 'burst', at: v(seat(e.id), 1), colors: ['#3ee0ff', '#9aa4b2', '#ffffff'], count: 120, speed: 3, up: 1 });
        emitFx({ kind: 'ring', at: v(seat(e.id), 0.05), color: '#3ee0ff', size: 3 });
        break;

      case 'online':
        sfx.powerUp();
        emitFx({ kind: 'burst', at: v(seat(e.id), 1), colors: ['#7dff9b', '#ffffff', '#ffc400'], count: 160, speed: 4, up: 2 });
        emitFx({ kind: 'ring', at: v(seat(e.id), 0.05), color: '#7dff9b', size: 3 });
        break;

      case 'rejoin':
        sfx.powerUp();
        emitFx({ kind: 'text', text: '回來了！', tone: 'gold' });
        break;

      case 'end': {
        const won = e.winnerId === view.you;
        if (won || game.hand === null) sfx.fanfare();
        else sfx.sadTrombone(0.2);
        emitFx({ kind: 'confetti', count: won ? 900 : 400 }, 200);
        if (e.winnerId) {
          emitFx({ kind: 'burst', at: v(seat(e.winnerId), 1), colors: RAINBOW, count: 400, speed: 6, up: 4, life: 2 }, 200);
        }
        emitFx({ kind: 'text', text: won ? '🎉 你贏了！' : e.winnerId ? `🏆 ${name(e.winnerId)} 贏了` : '🤝 平手！', tone: 'gold' }, 200);
        break;
      }
    }
  }
}
