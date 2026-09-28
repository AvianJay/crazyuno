import { getCardDef, isSwapSeven, type Card, type Color, type GameView, type RoomView } from '@crazyuno/shared';
import { Canvas } from '@react-three/fiber';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Send } from '../App';
import { faceImage } from '../cardFace';
import { formatCount } from '../count';
import * as sfx from '../sfx';
import { direct } from '../three/director';
import { diffViews, type GameEvent } from '../three/events';
import { emitFx } from '../three/fx';
import { FxLayer } from '../three/FxLayer';
import { FOV, seatMap } from '../three/layout';
import { chooseQuality, initialQuality, rememberAutoLow, type QualityState } from '../three/quality';
import { Scene } from '../three/Scene';
import { Avatar } from './Avatar';
import {
  ClockIcon,
  DeckIcon,
  DownIcon,
  EyeIcon,
  GearIcon,
  HourglassIcon,
  LeafIcon,
  MuteIcon,
  PassIcon,
  ReplayIcon,
  RobotIcon,
  SirenIcon,
  SkullIcon,
  SparkleIcon,
  SpeakerIcon,
  TimerIcon,
  TrophyIcon,
  WaveIcon,
} from './icons';

/** 右上角的動態紀錄，用頭像 + 小圖代替文字 */
interface FeedItem {
  id: number;
  who: string | null;
  kind: 'play' | 'draw' | 'uno' | 'out' | 'caught' | 'timeout' | 'timeUp' | 'offline' | 'online';
  card?: Card;
  n?: number;
}

let feedId = 0;

function toFeed(e: GameEvent): FeedItem | null {
  switch (e.t) {
    case 'play':
      return { id: feedId++, who: e.by, kind: 'play', card: e.card };
    case 'draw':
      return { id: feedId++, who: e.id, kind: 'draw', n: e.n };
    case 'uno':
    case 'out':
    case 'offline':
    case 'online':
      return { id: feedId++, who: e.id, kind: e.t };
    case 'timeout':
      return { id: feedId++, who: e.id, kind: 'timeout' };
    case 'caught':
    case 'timeUp':
      return { id: feedId++, who: null, kind: e.t };
    default:
      return null;
  }
}

export function Table({ view, game, send }: { view: RoomView; game: GameView; send: Send }) {
  /** 出了萬用牌還沒選顏色、出了 7 還沒選人（chosen = 已經選了，等伺服器回應） */
  const [pending, setPending] = useState<{ card: Card; chosen: boolean } | null>(null);
  const [muted, setMuted] = useState(sfx.isMuted());
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [quality, setQuality] = useState<QualityState>(initialQuality);
  const labels = useRef<HTMLDivElement>(null!);
  const secondsLeft = useCountdown(view.turnMsLeft, game.turnId);

  const myTurn = game.phase === 'playing' && game.turnId === view.you;
  const hand = game.hand ?? [];
  const me = game.players.find((p) => p.id === view.you);
  const isHost = view.you === view.hostId;
  const playerOf = (id: string | null) => game.players.find((p) => p.id === id);

  // 跟上一個畫面比較，找出剛發生的事
  const prev = useRef<RoomView | null>(null);
  const round = useRef(0);
  const events = useMemo(() => {
    const ev = diffViews(prev.current, view);
    if (ev.some((e) => e.t === 'start' || e.t === 'rejoin')) round.current++;
    return ev;
  }, [view]);
  useEffect(() => {
    prev.current = view;
    const box = { width: labels.current.clientWidth || innerWidth, height: labels.current.clientHeight || innerHeight };
    direct(events, view, game, seatMap(game, view.you, box.width / box.height), box);
    const add = events.map(toFeed).filter((f): f is FeedItem => f !== null);
    if (events.some((e) => e.t === 'start' || e.t === 'rejoin')) setFeed(add);
    else if (add.length) setFeed((f) => [...f, ...add].slice(-5));
  }, [events, view, game]);

  // 開發模式：讓自動測試腳本讀得到畫面資料、可以直接觸發特效
  useEffect(() => {
    if (import.meta.env.DEV) Object.assign(window, { __uno: { view, send, emitFx, play } });
  }, [view, send]);

  // 輪到別人、牌已經出掉了，就把選到一半的牌清掉（還在手上的話會飛回去）
  useEffect(() => {
    if (pending && (!myTurn || !hand.some((c) => c.id === pending.card.id))) setPending(null);
  }, [pending, myTurn, hand]);
  // 選了但伺服器沒接受（例如剛好時間到），牌飛回手上
  useEffect(() => {
    if (!pending?.chosen) return;
    const t = setTimeout(() => setPending(null), 2500);
    return () => clearTimeout(t);
  }, [pending]);
  // 牌飛到中間之後，四個顏色菱形（或對手身上的換牌按鈕）才冒出來
  const choosing = pending && !pending.chosen ? pending.card : null;
  const picking = useDelayed(!!choosing && getCardDef(choosing.kind).wild, 380);
  const targeting = useDelayed(!!choosing && !getCardDef(choosing.kind).wild, 380);

  // 最後五秒滴答
  useEffect(() => {
    if (myTurn && secondsLeft !== null && secondsLeft > 0 && secondsLeft <= 5) sfx.tick(secondsLeft <= 2);
  }, [myTurn, secondsLeft]);

  // 結束畫面等特效放完再跳出來
  const showResult = useDelayed(game.phase === 'ended', 2200);

  const play = (card: Card) => {
    if (!myTurn) return;
    // 出 7 換牌：場上只剩一個對手就不用選，伺服器會直接跟他換；最後一張也不用換
    const others = game.players.filter((p) => p.id !== view.you && !p.out);
    const chooseTarget = isSwapSeven(game.sevenZero, card) && others.length > 1 && hand.length > 1;
    if (getCardDef(card.kind).wild || chooseTarget) {
      sfx.whoosh(0.3);
      setPending({ card, chosen: false });
    } else {
      setPending(null);
      send('play', { cardId: card.id });
    }
  };

  const pickColor = (color: Color) => {
    if (!pending || pending.chosen) return;
    send('play', { cardId: pending.card.id, color });
    setPending({ ...pending, chosen: true });
  };

  const pickTarget = (targetId: string) => {
    if (!pending || pending.chosen) return;
    send('play', { cardId: pending.card.id, targetId });
    setPending({ ...pending, chosen: true });
  };

  // 跑不動或顯示卡記憶體不夠：自動換成省電（玩家自己選過高畫質就尊重他，除非 WebGL 真的掛了）
  const onSlow = useCallback(() => {
    setQuality((q) => {
      if (q.userChosen || q.quality === 'low') return q;
      console.warn('[crazyuno-perf] 太慢了，自動換成省電畫質');
      rememberAutoLow();
      return { quality: 'low', userChosen: false };
    });
  }, []);
  const onContextLost = useCallback(() => {
    setQuality((q) => {
      if (!q.userChosen) rememberAutoLow();
      return { quality: 'low', userChosen: q.userChosen };
    });
  }, []);

  const turnPlayer = playerOf(game.turnId);
  /** 離線（機器人代打中） */
  const isBot = (id: string) => !view.seats.find((s) => s.id === id)?.connected;
  const winner = playerOf(game.winnerId);

  return (
    <div className={`table3d color-${game.currentColor} ${myTurn ? 'my-turn' : ''}`}>
      <Canvas
        className="scene"
        // 省電模式固定 1 倍解析度（高解析度手機要畫的像素少一大半）
        dpr={quality.quality === 'high' ? [1, 2] : 1}
        camera={{ fov: FOV, near: 0.1, far: 80, position: [0, 9, 8] }}
        // alpha: false = 不透明的畫布：手機合成畫面比較省，也不會有透明的一格露出後面的黑底
        gl={{ alpha: false, antialias: false, powerPreference: 'high-performance', stencil: false, toneMapping: THREE.NeutralToneMapping }}
        onPointerMissed={() => {
          if (pending && !pending.chosen) setPending(null);
        }}
      >
        <Scene
          view={view}
          game={game}
          events={events}
          round={round.current}
          pendingCard={pending?.card ?? null}
          picking={picking}
          onPickColor={pickColor}
          targeting={targeting}
          onPickTarget={pickTarget}
          onPlay={play}
          onDraw={() => {
            setPending(null);
            send('draw');
          }}
          onCatch={(targetId) => send('catch', { targetId })}
          labels={labels}
          quality={quality.quality}
          onSlow={onSlow}
          onContextLost={onContextLost}
        />
      </Canvas>
      <div className="labels3d" ref={labels} />

      <FxLayer />

      <div className={`turn-pill ${myTurn ? 'mine' : ''}`}>
        {game.phase === 'ended' ? (
          <TrophyIcon className="pill-icon" />
        ) : myTurn ? (
          <>
            <DownIcon className="pill-icon bob" />
            {game.pendingDraw > 0 && <span className="pill-pending">+{formatCount(game.pendingDraw)}</span>}
          </>
        ) : me?.out ? (
          <SkullIcon className="pill-icon" />
        ) : (
          <>
            {!me && <EyeIcon className="pill-icon" />}
            {turnPlayer && <Avatar name={turnPlayer.name} src={turnPlayer.avatar} />}
            {isBot(game.turnId) ? <RobotIcon className="pill-icon bot-think" /> : <HourglassIcon className="pill-icon spin-slow" />}
          </>
        )}
      </div>

      {view.gameMsLeft !== null && game.phase === 'playing' && <GameClock msLeft={view.gameMsLeft} />}

      <div className="hud-right">
        {secondsLeft !== null && game.phase === 'playing' && (
          <TimerRing left={secondsLeft} total={view.settings.turnSeconds} />
        )}
        <button
          className={`icon-btn ${quality.quality === 'low' ? 'eco' : ''}`}
          aria-label={quality.quality === 'high' ? '高畫質（點一下換省電）' : '省電畫質（點一下換高畫質）'}
          title={quality.quality === 'high' ? '高畫質' : '省電畫質'}
          onClick={() => {
            const next = quality.quality === 'high' ? 'low' : 'high';
            chooseQuality(next);
            setQuality({ quality: next, userChosen: true });
          }}
        >
          {quality.quality === 'high' ? <SparkleIcon /> : <LeafIcon />}
        </button>
        <button
          className="icon-btn"
          aria-label={muted ? '開聲音' : '靜音'}
          onClick={() => {
            sfx.setMuted(!muted);
            setMuted(!muted);
          }}
        >
          {muted ? <MuteIcon /> : <SpeakerIcon />}
        </button>
      </div>

      <div className="feed">
        {feed.map((f) => {
          const p = playerOf(f.who);
          return (
            <div key={f.id} className={`feed-item ${f.kind}`}>
              {p && <Avatar name={p.name} src={p.avatar} />}
              {f.kind === 'play' && f.card && <img className="feed-card" src={faceImage(f.card)} alt="" />}
              {f.kind === 'draw' && (
                <span className="feed-draw">
                  <DeckIcon />+{f.n}
                </span>
              )}
              {f.kind === 'uno' && <span className="feed-uno">LAST!</span>}
              {f.kind === 'out' && <SkullIcon className="feed-icon danger" />}
              {f.kind === 'caught' && <SirenIcon className="feed-icon danger" />}
              {f.kind === 'timeout' && <TimerIcon className="feed-icon" />}
              {f.kind === 'timeUp' && <ClockIcon className="feed-icon danger" />}
              {f.kind === 'offline' && <RobotIcon className="feed-icon bot" />}
              {f.kind === 'online' && <WaveIcon className="feed-icon back" />}
            </div>
          );
        })}
      </div>

      <div className="hud-bottom">
        {game.phase === 'playing' && me && !me.out && (
          <div className="actions">
            {myTurn && game.hasDrawn && (
              <button className="pass-btn" onClick={() => send('pass')} aria-label="跳過">
                <PassIcon />
              </button>
            )}
            <button className={`uno-btn ${hand.length <= 2 && !me.unoSafe ? 'ready' : ''}`} onClick={() => send('uno')}>
              LAST!
            </button>
          </div>
        )}
      </div>

      {game.phase === 'ended' && showResult && (
        <div className="overlay">
          <div className="result">
            <TrophyIcon className="trophy" />
            {winner ? (
              <div className="winner">
                <div className="winner-avatar">
                  <Avatar name={winner.name} src={winner.avatar} />
                </div>
                <div className="winner-name">{winner.id === view.you ? '你' : winner.name}</div>
              </div>
            ) : (
              <SkullIcon className="trophy" />
            )}
            {isHost ? (
              <div className="result-actions">
                <button className="round-btn big" onClick={() => send('start')} aria-label="再來一局">
                  <ReplayIcon />
                </button>
                <button className="round-btn" onClick={() => send('lobby')} aria-label="回大廳改設定">
                  <GearIcon />
                </button>
              </div>
            ) : (
              <HourglassIcon className="waiting-icon spin-slow" aria-label="等房主決定下一局" />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** 倒數圓環：一圈慢慢縮短，最後五秒變紅 */
function TimerRing({ left, total }: { left: number; total: number }) {
  const r = 16;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  return (
    <div className={`timer-ring ${left <= 5 ? 'hurry' : ''}`}>
      <svg viewBox="0 0 40 40">
        <circle cx="20" cy="20" r={r} className="track" />
        <circle cx="20" cy="20" r={r} className="bar" strokeDasharray={`${c * frac} ${c}`} transform="rotate(-90 20 20)" />
      </svg>
      <span>{left}</span>
    </div>
  );
}

/**
 * 整局剩下的時間。自己一個元件，每秒跳動的時候不用重畫整張牌桌。
 * 剩一分鐘跳警告，最後十秒滴答。
 */
function GameClock({ msLeft }: { msLeft: number }) {
  const left = useCountdown(msLeft, 'game');
  const warned = useRef(msLeft <= 60_000);

  useEffect(() => {
    if (left === null || left > 60 || left <= 0) return;
    if (!warned.current) {
      warned.current = true;
      sfx.alarm();
      emitFx({ kind: 'text', text: '⌛ 剩 1 分鐘！', tone: 'danger' });
    }
    if (left <= 10) sfx.tick(left <= 3);
  }, [left]);

  if (left === null) return null;
  const m = Math.floor(left / 60);
  const sec = String(left % 60).padStart(2, '0');
  return (
    <div className={`game-clock ${left <= 60 ? 'hurry' : ''}`} aria-label={`整局剩 ${m} 分 ${sec} 秒`}>
      <ClockIcon />
      <span key={left <= 10 ? left : 0}>
        {m}:{sec}
      </span>
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
