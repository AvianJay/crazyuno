import { ALL_CARDS, type CardDef, type CardKind, type RoomView, type Seat } from '@crazyuno/shared';
import type { CSSProperties, ReactNode } from 'react';
import type { Send } from '../App';
import { backImage, faceImage } from '../cardFace';
import * as sfx from '../sfx';
import { useIsSpeaking } from '../useDiscord';
import { useVoiceMembers } from '../useVoiceMembers';
import { Avatar } from './Avatar';
import { Fit } from './Fit';
import {
  BoltIcon,
  BombIcon,
  ClockIcon,
  CrownIcon,
  HandIcon,
  HourglassIcon,
  InfinityIcon,
  LockIcon,
  MicIcon,
  MinusIcon,
  PlayersIcon,
  PlayIcon,
  PlusIcon,
  SwapIcon,
  TimerIcon,
} from './icons';
import { InviteButton } from './InviteButton';
import { LegalLinks } from './Legal';
import { FloatingCards } from './Loader';

/** 大廳裡怪牌用哪個顏色的樣子展示（萬用牌是黑的） */
const previewColor = (def: CardDef) => (def.wild ? null : 'red');

export function Lobby({ view, send }: { view: RoomView; send: Send }) {
  const isHost = view.you === view.hostId;
  const s = view.settings;
  const host = view.seats.find((seat) => seat.id === view.hostId);
  // 語音頻道裡還沒進來玩的人：房主可以直接邀他們
  const waiting = useVoiceMembers(view.seats.map((s) => s.discordId));
  // 用「切換一張」「加減多少」的訊息，連點的時候伺服器才會照順序一個一個改
  const toggle = (kind: CardKind) => {
    sfx.flick();
    send('toggleCrazy', kind);
  };
  const adjust = (key: 'startingHand' | 'handLimit' | 'turnSeconds' | 'gameMinutes') => (delta: number) => {
    sfx.hover();
    send('adjust', { key, delta });
  };

  const crazy = ALL_CARDS.filter((d) => d.crazy);

  return (
    <div className="lobby-screen">
      <FloatingCards />
      {/* 整個大廳照設計的大小排好再縮放塞進畫面：一個畫面剛好放得下，不會有捲軸 */}
      <Fit className="lobby-fit" max={1.8}>
        <div className="lobby">
          <h1 className="title" aria-label="MadCards">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-text">MadCards</span>
          </h1>

          <section className="panel seats-panel" style={{ '--i': 0 } as CSSProperties}>
            <h2 className="panel-head">
              <PlayersIcon />
              <span className="count">{view.seats.length}</span>
              <InviteButton className="lobby-invite" />
            </h2>
            <ul className="seats">
              {view.seats.map((seat, i) => (
                <SeatChip key={seat.id} seat={seat} index={i} me={seat.id === view.you} host={seat.id === view.hostId} />
              ))}
              {view.seats.length < 2 && (
                <li className="empty-seat" aria-label="等其他人加入">
                  <div className="seat-avatar">
                    <PlusIcon />
                  </div>
                </li>
              )}
            </ul>
            {waiting.length > 0 && (
              <div className="voice-waiting">
                <span className="voice-waiting-label">在語音頻道裡還沒加入：</span>
                <div className="voice-waiting-list">
                  {waiting.map((m) => (
                    <div key={m.id} className="voice-waiting-person" title={m.name}>
                      <Avatar name={m.name} src={m.avatar} />
                      <span>{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>

          {/* 怪牌和 0/7 規則排在同一排：開 = 牌面朝上發光，關 = 翻到背面。說明在滑上去時蓋在面板上緣（不另外用 title，才不會跳兩個提示） */}
          <section className="panel deck-panel" style={{ '--i': 1 } as CSSProperties}>
            <h2 className="panel-head">
              <BoltIcon className="bolt" />
              <span className="count">
                {s.crazyCards.length}/{crazy.length}
              </span>
              {!isHost && <LockIcon className="lock" />}
            </h2>
            <div className="deck-grid">
              {crazy.map((def, i) => {
                const on = s.crazyCards.includes(def.kind);
                return (
                  <button
                    key={def.kind}
                    className={`crazy-card ${on ? 'on' : ''}`}
                    disabled={!isHost}
                    onClick={() => toggle(def.kind)}
                    style={{ '--i': i } as CSSProperties}
                  >
                    <div className="flip">
                      <img className="front" src={faceImage({ kind: def.kind, color: previewColor(def) })} alt={def.name} />
                      <img className="back" src={backImage()} alt="" />
                    </div>
                    <span className="crazy-name">{def.name}</span>
                    <span className="crazy-desc">
                      <b>{def.name}</b>
                      {def.description}
                    </span>
                  </button>
                );
              })}
              <span className="deck-divider" aria-hidden="true">
                <SwapIcon />
              </span>
              <button
                className={`rule-card ${s.sevenZero ? 'on' : ''}`}
                disabled={!isHost}
                onClick={() => {
                  sfx.flick();
                  send('toggleSevenZero');
                }}
                style={{ '--i': crazy.length } as CSSProperties}
              >
                <div className="flip">
                  <div className="front pair">
                    <img src={faceImage({ kind: 'number', color: 'blue', value: 0 })} alt="0" />
                    <img src={faceImage({ kind: 'number', color: 'red', value: 7 })} alt="7" />
                  </div>
                  <img className="back" src={backImage()} alt="" />
                </div>
                <span className="crazy-name">0/7 換牌</span>
                <span className="crazy-desc">
                  <b>0/7 換牌</b>出 0：大家的手牌往出牌方向傳。出 7：選一個人交換手牌。
                </span>
              </button>
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
            <Stepper
              icon={<ClockIcon />}
              title="整局幾分鐘，時間到手牌最少的人贏（∞ = 不限時）"
              value={s.gameMinutes}
              unit="分"
              step={5}
              min={0}
              max={60}
              editable={isHost}
              onStep={adjust('gameMinutes')}
            />
          </section>

          <div className="start-area">
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
          </div>

          <LegalLinks />
        </div>
      </Fit>
    </div>
  );
}

/** 座位清單的一格。自己訂閱「在不在說話」，有人開口時只重畫這一格 */
function SeatChip({ seat, index, me, host }: { seat: Seat; index: number; me: boolean; host: boolean }) {
  const speaking = useIsSpeaking(seat.discordId);
  return (
    <li
      className={`${seat.connected ? '' : 'offline'} ${me ? 'me' : ''} ${speaking ? 'speaking' : ''}`}
      style={{ '--i': index } as CSSProperties}
    >
      <div className="seat-avatar">
        <Avatar name={seat.name} src={seat.avatar} />
        {host && <CrownIcon className="crown" />}
        {speaking && <MicIcon className="speaking-badge" />}
      </div>
      <span className="seat-label">{seat.name}</span>
    </li>
  );
}

function Stepper(props: {
  icon: ReactNode;
  title: string;
  value: number;
  /** 數字後面的小單位 */
  unit?: string;
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
        {value === 0 && min === 0 ? (
          <InfinityIcon />
        ) : (
          <span>
            {value}
            {props.unit && <small className="stepper-unit">{props.unit}</small>}
          </span>
        )}
      </span>
      {props.editable && (
        <button className="step-btn" disabled={value >= max} onClick={() => props.onStep(step)} aria-label="增加">
          <PlusIcon />
        </button>
      )}
    </div>
  );
}
