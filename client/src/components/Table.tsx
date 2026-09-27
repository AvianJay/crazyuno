import { COLORS, getCardDef, type Card, type Color, type GameView, type RoomView } from '@crazyuno/shared';
import { Canvas } from '@react-three/fiber';
import * as THREE from 'three';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Send } from '../App';
import * as sfx from '../sfx';
import { direct } from '../three/director';
import { diffViews } from '../three/events';
import { emitFx } from '../three/fx';
import { FxLayer } from '../three/FxLayer';
import { FOV, seatMap } from '../three/layout';
import { Scene } from '../three/Scene';

const COLOR_NAME: Record<Color, string> = { red: '紅', yellow: '黃', green: '綠', blue: '藍' };

export function Table({ view, game, send }: { view: RoomView; game: GameView; send: Send }) {
  const [picking, setPicking] = useState<Card | null>(null);
  const [muted, setMuted] = useState(sfx.isMuted());
  const labels = useRef<HTMLDivElement>(null!);
  const secondsLeft = useCountdown(view.turnMsLeft, game.turnId);

  const myTurn = game.phase === 'playing' && game.turnId === view.you;
  const hand = game.hand ?? [];
  const me = game.players.find((p) => p.id === view.you);
  const isHost = view.you === view.hostId;

  // 跟上一個畫面比較，找出剛發生的事
  const prev = useRef<RoomView | null>(null);
  const round = useRef(0);
  const events = useMemo(() => {
    const ev = diffViews(prev.current, view);
    if (ev.some((e) => e.t === 'start')) round.current++;
    return ev;
  }, [view]);
  useEffect(() => {
    prev.current = view;
    direct(events, view, game, seatMap(game, view.you, innerWidth / innerHeight));
  }, [events, view, game]);

  // 開發模式：讓自動測試腳本讀得到畫面資料、可以直接觸發特效
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __uno: { view, send, emitFx } });
  }, [view, send]);

  // 輪到別人或牌已經不在手上就收起選色
  useEffect(() => {
    if (picking && (!myTurn || !hand.some((c) => c.id === picking.id))) setPicking(null);
  }, [picking, myTurn, hand]);

  // 最後五秒滴答
  useEffect(() => {
    if (myTurn && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) sfx.tick(secondsLeft <= 2);
  }, [myTurn, secondsLeft]);

  // 結束畫面等特效放完再跳出來
  const showResult = useDelayed(game.phase === 'ended', 2200);

  const play = (card: Card) => {
    if (!myTurn) return;
    if (getCardDef(card.kind).wild) setPicking(card);
    else send('play', { cardId: card.id });
  };

  const turnName = game.players.find((p) => p.id === game.turnId)?.name;

  return (
    <div className={`table3d color-${game.currentColor} ${myTurn ? 'my-turn' : ''}`}>
      <Canvas
        className="scene"
        dpr={[1, 2]}
        camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 9, 8] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, toneMapping: THREE.NeutralToneMapping }}
        onPointerMissed={() => setPicking(null)}
      >
        <Scene
          view={view}
          game={game}
          events={events}
          round={round.current}
          selectedId={picking?.id ?? null}
          onPlay={play}
          onDraw={() => send('draw')}
          onCatch={(targetId) => send('catch', { targetId })}
          labels={labels}
        />
      </Canvas>
      <div className="labels3d" ref={labels} />

      <FxLayer />

      <div className="hud-top">
        <div className="log3d">
          {game.log.slice(-4).map((line, i) => (
            <div key={game.log.length - 4 + i}>{line}</div>
          ))}
        </div>
        <div className="hud-right">
          {secondsLeft !== null && game.phase === 'playing' && (
            <div className={`timer ${secondsLeft <= 5 ? 'hurry' : ''}`}>{secondsLeft}s</div>
          )}
          <button
            className="icon-btn"
            title={muted ? '開聲音' : '靜音'}
            onClick={() => {
              sfx.setMuted(!muted);
              setMuted(!muted);
            }}
          >
            {muted ? '🔇' : '🔊'}
          </button>
        </div>
      </div>

      <div className={`turn-pill ${myTurn ? 'mine' : ''}`}>
        {game.phase === 'ended'
          ? '遊戲結束'
          : myTurn
            ? game.pendingDraw > 0
              ? `輪到你！接一張，或吃下 ${game.pendingDraw} 張`
              : '輪到你！'
            : me?.out
              ? '你出局了，看戲吧'
              : !me
                ? `觀戰中：輪到 ${turnName}`
                : `等 ${turnName} 出牌…`}
      </div>
      <div className="hud-bottom">
        {game.phase === 'playing' && me && !me.out && (
          <div className="actions">
            {myTurn && !game.hasDrawn && (
              <button onClick={() => send('draw')}>{game.pendingDraw > 0 ? `吃下 ${game.pendingDraw} 張` : '抽一張'}</button>
            )}
            {myTurn && game.hasDrawn && <button onClick={() => send('pass')}>跳過</button>}
            <button className={`uno-btn ${hand.length <= 2 && !me.unoSafe ? 'ready' : ''}`} onClick={() => send('uno')}>
              UNO!
            </button>
          </div>
        )}
      </div>

      {picking && (
        <div className="overlay clear" onClick={() => setPicking(null)}>
          <div className="color-picker" onClick={(e) => e.stopPropagation()}>
            <p>選一個顏色</p>
            <div>
              {COLORS.map((c) => (
                <button
                  key={c}
                  className={`swatch ${c}`}
                  onClick={() => {
                    send('play', { cardId: picking.id, color: c });
                    setPicking(null);
                  }}
                >
                  {COLOR_NAME[c]}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {game.phase === 'ended' && showResult && (
        <div className="overlay">
          <div className="result">
            <h2>{game.winnerId === view.you ? '🎉 你贏了！' : `🏆 ${game.players.find((p) => p.id === game.winnerId)?.name ?? '沒有人'} 贏了`}</h2>
            {isHost ? (
              <div className="result-actions">
                <button className="big-btn" onClick={() => send('start')}>
                  再來一局
                </button>
                <button onClick={() => send('lobby')}>回大廳改設定</button>
              </div>
            ) : (
              <p>等房主決定下一局…</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 伺服器給的是「還剩幾毫秒」，每次換人重新算一次截止時間 */
function useCountdown(msLeft: number | null, turnKey: string): number | null {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    setDeadline(msLeft === null ? null : Date.now() + msLeft);
  }, [msLeft, turnKey]);

  useEffect(() => {
    if (deadline === null) return;
    const id = setInterval(() => tick((t) => t + 1), 250);
    return () => clearInterval(id);
  }, [deadline]);

  return deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

/** value 變成 true 之後等 ms 毫秒才回傳 true */
function useDelayed(value: boolean, ms: number): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (!value) {
      setOn(false);
      return;
    }
    const t = setTimeout(() => setOn(true), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return on;
}
