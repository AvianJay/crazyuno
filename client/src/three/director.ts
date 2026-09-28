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
export function direct(events: GameEvent[], view: RoomView, game: GameView, seats: Map<string, THREE.Vector3>) {
  const name = (id: string) => (id === view.you ? '你' : (game.players.find((p) => p.id === id)?.name ?? '?'));
  const seat = (id: string) => seats.get(id) ?? MY_SEAT;
  const pile = v(DISCARD, 0.1);
  const colorHex = COLOR_HEX[game.currentColor];

  for (const e of events) {
    switch (e.t) {
      case 'start':
        sfx.shuffle();
        emitFx({ kind: 'text', text: '開局！', tone: 'gold' });
        emitFx({ kind: 'burst', at: v(deckWorldPose(innerWidth / innerHeight, innerHeight).pos), colors: RAINBOW, count: 120, speed: 4, up: 3 });
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
        }
        break;
      }

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
        sfx.tornado();
        emitFx({ kind: 'spin' }, 200);
        emitFx({ kind: 'text', text: '🌀 大風吹！', tone: 'gold' }, 200);
        emitFx({ kind: 'burst', at: [0, 0.3, 0.3], colors: ['#bdf6ff', '#ffffff', '#7b5cff'], count: 300, speed: 7, up: 2, life: 1.8 }, 300);
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
        sfx.drawCards(e.n);
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
        emitFx({ kind: 'text', text: won ? '🎉 你贏了！' : `🏆 ${e.winnerId ? name(e.winnerId) : '沒有人'} 贏了`, tone: 'gold' }, 200);
        break;
      }
    }
  }
}
