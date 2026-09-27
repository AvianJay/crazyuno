import { ALL_CARDS, type CardKind, type GameSettings, type RoomView } from '@crazyuno/shared';
import type { Send } from '../App';
import { Avatar } from './Avatar';

export function Lobby({ view, send }: { view: RoomView; send: Send }) {
  const isHost = view.you === view.hostId;
  const s = view.settings;
  const update = (patch: Partial<GameSettings>) => send('settings', patch);

  const toggle = (kind: CardKind) =>
    update({
      crazyCards: s.crazyCards.includes(kind) ? s.crazyCards.filter((k) => k !== kind) : [...s.crazyCards, kind],
    });

  return (
    <div className="lobby">
      <h1 className="title">
        瘋狂 <span>UNO</span>
      </h1>

      <section className="panel">
        <h2>玩家（{view.seats.length}）</h2>
        <ul className="seats">
          {view.seats.map((seat) => (
            <li key={seat.id} className={seat.connected ? '' : 'offline'}>
              <Avatar name={seat.name} src={seat.avatar} />
              <span>{seat.name}</span>
              {seat.id === view.hostId && <em>👑 房主</em>}
              {seat.id === view.you && <em>（你）</em>}
            </li>
          ))}
        </ul>
      </section>

      <section className="panel">
        <h2>怪牌 {isHost ? '' : '（房主設定）'}</h2>
        <div className="crazy-list">
          {ALL_CARDS.filter((d) => d.crazy).map((def) => (
            <label key={def.kind} className={s.crazyCards.includes(def.kind) ? 'on' : ''}>
              <input
                type="checkbox"
                disabled={!isHost}
                checked={s.crazyCards.includes(def.kind)}
                onChange={() => toggle(def.kind)}
              />
              <strong>{def.name}</strong>
              <small>{def.description}</small>
            </label>
          ))}
        </div>

        <div className="numbers">
          <NumberField label="起始手牌" value={s.startingHand} disabled={!isHost} onChange={(v) => update({ startingHand: v })} />
          <NumberField
            label="爆牌上限（0 = 無限）"
            value={s.handLimit}
            disabled={!isHost}
            onChange={(v) => update({ handLimit: v })}
          />
          <NumberField
            label="每回合秒數（0 = 不限）"
            value={s.turnSeconds}
            disabled={!isHost}
            onChange={(v) => update({ turnSeconds: v })}
          />
        </div>
      </section>

      {isHost ? (
        <button className="big-btn" disabled={view.seats.length < 2} onClick={() => send('start')}>
          {view.seats.length < 2 ? '等其他人加入…' : '開始遊戲'}
        </button>
      ) : (
        <p className="waiting">等房主開始…</p>
      )}
    </div>
  );
}

function NumberField(props: { label: string; value: number; disabled: boolean; onChange: (v: number) => void }) {
  return (
    <label className="number-field">
      <span>{props.label}</span>
      <input
        type="number"
        value={props.value}
        disabled={props.disabled}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
