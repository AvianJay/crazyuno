import { ALL_CARDS, type CardDef, type CardKind, type RoomView } from '@crazyuno/shared';
import type { CSSProperties, ReactNode } from 'react';
import type { Send } from '../App';
import { backImage, faceImage } from '../cardFace';
import * as sfx from '../sfx';
import { Avatar } from './Avatar';
import {
  BoltIcon,
  BombIcon,
  CrownIcon,
  HandIcon,
  HourglassIcon,
  InfinityIcon,
  LockIcon,
  MinusIcon,
  PlayersIcon,
  PlayIcon,
  PlusIcon,
  TimerIcon,
} from './icons';
import { LegalLinks } from './Legal';
import { FloatingCards } from './Loader';

/** 大廳裡怪牌用哪個顏色的樣子展示（萬用牌是黑的） */
const previewColor = (def: CardDef) => (def.wild ? null : 'red');

export function Lobby({ view, send }: { view: RoomView; send: Send }) {
  const isHost = view.you === view.hostId;
  const s = view.settings;
  const host = view.seats.find((seat) => seat.id === view.hostId);
  // 用「切換一張」「加減多少」的訊息，連點的時候伺服器才會照順序一個一個改
  const toggle = (kind: CardKind) => {
    sfx.flick();
    send('toggleCrazy', kind);
  };
  const adjust = (key: 'startingHand' | 'handLimit' | 'turnSeconds') => (delta: number) => {
    sfx.hover();
    send('adjust', { key, delta });
  };

  return (
    <div className="lobby-screen">
      <FloatingCards />
      <div className="lobby">
        <h1 className="title" aria-label="MadCards">
          <span className="brand-mark" aria-hidden="true" />
          <span className="brand-text">MadCards</span>
        </h1>

        <section className="panel" style={{ '--i': 0 } as CSSProperties}>
          <h2 className="panel-head">
            <PlayersIcon />
            <span className="count">{view.seats.length}</span>
          </h2>
          <ul className="seats">
            {view.seats.map((seat, i) => (
              <li
                key={seat.id}
                className={`${seat.connected ? '' : 'offline'} ${seat.id === view.you ? 'me' : ''}`}
                style={{ '--i': i } as CSSProperties}
              >
                <div className="seat-avatar">
                  <Avatar name={seat.name} src={seat.avatar} />
                  {seat.id === view.hostId && <CrownIcon className="crown" />}
                </div>
                <span className="seat-label">{seat.name}</span>
              </li>
            ))}
            {view.seats.length < 2 && (
              <li className="empty-seat" aria-label="等其他人加入">
                <div className="seat-avatar">
                  <PlusIcon />
                </div>
              </li>
            )}
          </ul>
        </section>

        <section className="panel" style={{ '--i': 1 } as CSSProperties}>
          <h2 className="panel-head">
            <BoltIcon className="bolt" />
            <span className="count">
              {s.crazyCards.length}/{ALL_CARDS.filter((d) => d.crazy).length}
            </span>
            {!isHost && <LockIcon className="lock" />}
          </h2>
          <div className="crazy-grid">
            {ALL_CARDS.filter((d) => d.crazy).map((def, i) => {
              const on = s.crazyCards.includes(def.kind);
              return (
                <button
                  key={def.kind}
                  className={`crazy-card ${on ? 'on' : ''}`}
                  disabled={!isHost}
                  onClick={() => toggle(def.kind)}
                  title={`${def.name}：${def.description}`}
                  style={{ '--i': i } as CSSProperties}
                >
                  <div className="flip">
                    <img className="front" src={faceImage({ kind: def.kind, color: previewColor(def) })} alt={def.name} />
                    <img className="back" src={backImage()} alt="" />
                  </div>
                  <span className="crazy-name">{def.name}</span>
                  <span className="crazy-desc">{def.description}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel steppers" style={{ '--i': 2 } as CSSProperties}>
          <Stepper
            icon={<HandIcon />}
            title="起始手牌"
            value={s.startingHand}
            step={1}
            min={1}
            max={20}
            editable={isHost}
            onStep={adjust('startingHand')}
          />
          <Stepper
            icon={<BombIcon />}
            title="手牌超過幾張就爆牌出局（∞ = 不限）"
            value={s.handLimit}
            step={5}
            min={0}
            max={200}
            editable={isHost}
            onStep={adjust('handLimit')}
          />
          <Stepper
            icon={<TimerIcon />}
            title="每回合秒數（∞ = 不限時）"
            value={s.turnSeconds}
            step={5}
            min={0}
            max={120}
            editable={isHost}
            onStep={adjust('turnSeconds')}
          />
        </section>

        {isHost ? (
          <button
            className="start-btn"
            disabled={view.seats.length < 2}
            onClick={() => send('start')}
            aria-label={view.seats.length < 2 ? '等其他人加入' : '開始遊戲'}
          >
            {view.seats.length < 2 ? <HourglassIcon className="spin-slow" /> : <PlayIcon />}
          </button>
        ) : (
          <div className="waiting" aria-label="等房主開始">
            {host && <Avatar name={host.name} src={host.avatar} />}
            <HourglassIcon className="spin-slow" />
          </div>
        )}

        <LegalLinks />
      </div>
    </div>
  );
}

function Stepper(props: {
  icon: ReactNode;
  title: string;
  value: number;
  step: number;
  min: number;
  max: number;
  editable: boolean;
  onStep: (delta: number) => void;
}) {
  const { value, step, min, max } = props;
  return (
    <div className="stepper" title={props.title}>
      <span className="stepper-icon">{props.icon}</span>
      {props.editable && (
        <button className="step-btn" disabled={value <= min} onClick={() => props.onStep(-step)} aria-label="減少">
          <MinusIcon />
        </button>
      )}
      {/* key 讓數字每次變都重播跳動的動畫 */}
      <span key={value} className="stepper-value">
        {value === 0 && min === 0 ? <InfinityIcon /> : value}
      </span>
      {props.editable && (
        <button className="step-btn" disabled={value >= max} onClick={() => props.onStep(step)} aria-label="增加">
          <PlusIcon />
        </button>
      )}
    </div>
  );
}
