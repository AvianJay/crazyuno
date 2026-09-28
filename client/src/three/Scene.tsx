import { COLORS, type Card, type Color, type GameView, type RoomView } from '@crazyuno/shared';
import { Environment, Html, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type ChromaticAberrationEffect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { Avatar } from '../components/Avatar';
import { DeckIcon, RobotIcon, SirenIcon, SkullIcon, SwapIcon } from '../components/icons';
import { formatCount } from '../count';
import { backTexture, CARD_H, CARD_W, COLOR_HEX, feltTexture, glowTexture } from './cardArt';
import { CardMesh, FACE_DOWN, FACE_UP, pose, type Pose } from './CardMesh';
import { CameraRig, Particles, Shockwaves } from './Effects';
import type { GameEvent } from './events';
import type { Quality } from './quality';
import {
  DECK_TILT,
  deckSlot,
  deckWorldPose,
  DISCARD,
  handSlots,
  HAND_DIST,
  MY_SEAT,
  placeRig,
  rig,
  seatMap,
  TABLE_RX,
  TABLE_RZ,
} from './layout';

interface Props {
  view: RoomView;
  game: GameView;
  events: GameEvent[];
  /** 每開新的一局就換一個數字，讓牌堆全部重來 */
  round: number;
  /** 出了萬用牌還沒選顏色、出了 7 還沒選人：這張牌先飛到桌子中間 */
  pendingCard: Card | null;
  /** 要不要顯示選顏色的四個菱形 */
  picking: boolean;
  onPickColor(color: Color): void;
  /** 0/7 規則出 7：對手的座位變成可以點的按鈕 */
  targeting: boolean;
  onPickTarget(id: string): void;
  onPlay(card: Card): void;
  onDraw(): void;
  onCatch(targetId: string): void;
  /** 3D 裡的 HTML 標籤掛在這個 div 上 */
  labels: RefObject<HTMLElement>;
  quality: Quality;
  /** 一直跑不動（每秒不到 50 格） */
  onSlow(): void;
  /** 顯示卡記憶體不夠，瀏覽器把 WebGL 收回去了 */
  onContextLost(): void;
}

export function Scene(props: Props) {
  const { view, game, labels } = props;
  const hq = props.quality === 'high';
  const size = useThree((s) => s.size);
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const aspect = size.width / size.height;
  const seats = useMemo(() => seatMap(game, view.you, aspect), [game, view.you, aspect]);
  const myTurn = game.phase === 'playing' && game.turnId === view.you;
  // 第一格畫面之前就要知道鏡頭在哪，新牌才知道從哪裡飛出來
  if (!rig.ready) placeRig(aspect);

  return (
    <>
      <color attach="background" args={['#05060b']} />
      <fog attach="fog" args={['#05060b', 16, 34]} />
      {/* 高畫質跑不動就通知外面降成省電 */}
      {hq && <PerformanceMonitor onDecline={props.onSlow} />}
      <GpuWatch quality={props.quality} onContextLost={props.onContextLost} />
      <CameraRig aberration={aberration} />

      <ambientLight intensity={0.5} />
      <directionalLight position={[3, 10, 6]} intensity={1.4} />
      <pointLight position={[0, 4, 0.3]} intensity={14} distance={12} color="#fff1d6" />
      <Environment resolution={128} frames={1}>
        <Lightformer intensity={0.8} position={[0, 6, 0]} rotation-x={Math.PI / 2} scale={[12, 12, 1]} />
        <Lightformer intensity={2} position={[-6, 3, 4]} rotation-y={Math.PI / 2} scale={[6, 2, 1]} color="#ff4fd8" />
        <Lightformer intensity={2} position={[6, 3, 4]} rotation-y={-Math.PI / 2} scale={[6, 2, 1]} color="#3ee0ff" />
      </Environment>

      <TableModel color={game.currentColor} direction={game.direction} />
      {hq && (
        <Sparkles count={70} scale={[16, 5, 12]} position={[0, 2.5, 0]} size={3} speed={0.35} opacity={0.6} color={COLOR_HEX[game.currentColor]} />
      )}

      <Deck
        labels={labels}
        count={game.drawPileCount}
        pending={myTurn ? game.pendingDraw : 0}
        active={myTurn && !game.hasDrawn && !props.pendingCard}
        hint={myTurn && game.playable.length === 0}
        onDraw={props.onDraw}
      />
      <Cards key={props.round} {...props} seats={seats} myTurn={myTurn} />
      <Ghosts key={`g${props.round}`} events={props.events} game={game} you={view.you} seats={seats} />

      {game.players
        .filter((p) => p.id !== view.you)
        .map((p) => {
          const me = game.players.find((q) => q.id === view.you);
          const canCatch = game.phase === 'playing' && !p.out && p.handCount === 1 && !p.unoSafe && !!me && !me.out;
          return (
            <Seat
              key={p.id}
              labels={labels}
              player={p}
              offline={!view.seats.find((s) => s.id === p.id)?.connected}
              pos={seats.get(p.id)!}
              active={p.id === game.turnId && game.phase === 'playing'}
              color={COLOR_HEX[game.currentColor]}
              canCatch={canCatch}
              onCatch={() => props.onCatch(p.id)}
              canTarget={props.targeting && !p.out}
              onTarget={() => props.onPickTarget(p.id)}
            />
          );
        })}

      {/* Html 一直掛著，只換內容：drei 的 Html 卸載時會跟 React 19 打架 */}
      <Html portal={labels} position={[DISCARD.x, 1.7, DISCARD.z]} center zIndexRange={[15, 0]}>
        {game.pendingDraw > 0 && !props.picking && (
          <PendingCount n={game.pendingDraw} width={size.width} />
        )}
      </Html>

      <Html portal={labels} position={[DISCARD.x, 0.55, DISCARD.z]} center zIndexRange={[30, 0]} pointerEvents="none">
        <div className={`diamond-picker ${props.picking ? 'open' : ''}`}>
          {COLORS.map((c, i) => (
            <button
              key={c}
              className={`diamond ${c}`}
              style={{ '--i': i } as CSSProperties}
              disabled={!props.picking}
              aria-label={c}
              onClick={() => props.onPickColor(c)}
            />
          ))}
        </div>
      </Html>

      <Particles key={props.quality} max={hq ? 4000 : 1500} density={hq ? 1 : 0.4} />
      <Shockwaves />

      {hq ? (
        // 手機不開 MSAA：Adreno 之類的手機顯示卡在多重取樣的浮點緩衝上會一閃一閃，手機解析度高鋸齒也看不太出來
        <EffectComposer multisampling={IS_MOBILE ? 0 : 4}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.1} />
          <ChromaticAberration ref={aberration} offset={new THREE.Vector2(0, 0)} radialModulation={false} modulationOffset={0} />
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : null}
    </>
  );
}

/** 桌子中間累積的 +N：越多字越大，但不能比畫面還寬（手機直的放不下「+567.1億」這種） */
function PendingCount({ n, width }: { n: number; width: number }) {
  const text = `+${formatCount(n)}`;
  // 粗斜體的字，寬度大約是字高的 0.7 倍
  const fit = (width * 0.85) / (text.length * 0.7);
  return (
    <div className="pending3d" style={{ fontSize: `min(${Math.min(6, 2.2 + n * 0.06)}rem, ${Math.floor(fit)}px)` }}>
      {text}
    </div>
  );
}

const IS_MOBILE = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || matchMedia('(pointer: coarse)').matches;

/**
 * 盯著顯示卡：WebGL 被瀏覽器收回（context lost）時通知外面降畫質；
 * 開發模式下把這支裝置的顯示卡、每秒格數寫進 console（Vite 會轉到伺服器的記錄檔，查舊手機的問題用）。
 */
function GpuWatch({ quality, onContextLost }: { quality: Quality; onContextLost(): void }) {
  const gl = useThree((s) => s.gl);
  const frames = useRef(0);
  useFrame(() => {
    frames.current++;
  });

  useEffect(() => {
    const canvas = gl.domElement;
    const lost = () => {
      console.warn('[crazyuno-perf] WebGL context lost');
      onContextLost();
    };
    const restored = () => console.warn('[crazyuno-perf] WebGL context restored');
    canvas.addEventListener('webglcontextlost', lost);
    canvas.addEventListener('webglcontextrestored', restored);
    return () => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
    };
  }, [gl, onContextLost]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    // 等開局的動畫跑完再量 5 秒
    const start = setTimeout(() => {
      frames.current = 0;
      const t0 = performance.now();
      const done = setTimeout(() => {
        const ctx = gl.getContext();
        const info = ctx.getExtension('WEBGL_debug_renderer_info');
        console.warn(
          '[crazyuno-perf] ' +
            JSON.stringify({
              fps: Math.round((frames.current * 1000) / (performance.now() - t0)),
              quality,
              dpr: gl.getPixelRatio(),
              canvas: [ctx.drawingBufferWidth, ctx.drawingBufferHeight],
              gpu: info ? ctx.getParameter(info.UNMASKED_RENDERER_WEBGL) : '?',
              memory: (navigator as { deviceMemory?: number }).deviceMemory,
              ua: navigator.userAgent,
            }),
        );
      }, 5000);
      cleanup.current = () => clearTimeout(done);
    }, 4000);
    const cleanup = { current: () => {} };
    return () => {
      clearTimeout(start);
      cleanup.current();
    };
  }, [gl, quality]);

  return null;
}

// ---------- 桌子 ----------

function TableModel({ color, direction }: { color: GameView['currentColor']; direction: 1 | -1 }) {
  const { felt, rim } = useMemo(() => {
    const shape = (rx: number, rz: number) => {
      const s = new THREE.Shape();
      s.absellipse(0, 0, rx, rz, 0, Math.PI * 2, false, 0);
      return s;
    };
    const outer = shape(TABLE_RX + 0.45, TABLE_RZ + 0.45);
    outer.holes.push(shape(TABLE_RX, TABLE_RZ) as unknown as THREE.Path);
    const rim = new THREE.ExtrudeGeometry(outer, { depth: 0.35, bevelEnabled: true, bevelSize: 0.12, bevelThickness: 0.12, curveSegments: 96 });
    rim.rotateX(-Math.PI / 2);
    rim.translate(0, -0.3, 0);
    const felt = new THREE.ShapeGeometry(shape(TABLE_RX, TABLE_RZ), 96);
    felt.rotateX(-Math.PI / 2);
    // ShapeGeometry 的 UV 是原始座標，換成 0~1
    const uv = felt.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (uv.getX(i) / TABLE_RX + 1) / 2, (uv.getY(i) / TABLE_RZ + 1) / 2);
    }
    return { felt, rim };
  }, []);
  const feltTex = useMemo(() => feltTexture(), []);

  // 顏色光圈和方向箭頭跟著目前顏色慢慢變色
  const ringMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const arrowMat = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false, transparent: true, opacity: 0.85 }), []);
  const arrows = useRef<THREE.Group>(null!);
  const spinBoost = useRef(0);
  const lastDir = useRef(direction);
  const target = useMemo(() => new THREE.Color(), []);

  useEffect(() => {
    if (lastDir.current !== direction) spinBoost.current = 14;
    lastDir.current = direction;
  }, [direction]);

  useFrame((st, dt) => {
    target.set(COLOR_HEX[color]).multiplyScalar(2.2 + Math.sin(st.clock.elapsedTime * 2) * 0.4);
    ringMat.color.lerp(target, 1 - Math.exp(-4 * dt));
    arrowMat.color.copy(ringMat.color).multiplyScalar(0.8);
    spinBoost.current *= Math.exp(-2 * dt);
    // 從上面看，順時針 = 往左邊的人傳
    arrows.current.rotation.y -= direction * (0.35 + spinBoost.current) * dt;
  });

  const arrowGeo = useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-0.22, -0.14);
    s.lineTo(0.22, 0);
    s.lineTo(-0.22, 0.14);
    s.lineTo(-0.1, 0);
    const g = new THREE.ShapeGeometry(s);
    g.rotateX(-Math.PI / 2);
    return g;
  }, []);

  return (
    <group>
      <mesh geometry={felt} position-y={0}>
        <meshStandardMaterial map={feltTex} roughness={0.95} metalness={0} />
      </mesh>
      <mesh geometry={rim}>
        <meshStandardMaterial color="#2a1a12" roughness={0.35} metalness={0.3} />
      </mesh>
      {/* 桌邊一圈霓虹 */}
      <group position-y={0.02} scale={[TABLE_RX - 0.12, 1, TABLE_RZ - 0.12]}>
        <mesh rotation-x={-Math.PI / 2} material={ringMat}>
          <torusGeometry args={[1, 0.012, 8, 160]} />
        </mesh>
      </group>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.015, 0.3]} material={ringMat}>
        <ringGeometry args={[2.55, 2.6, 128]} />
      </mesh>
      <group ref={arrows} position={[0, 0.02, 0.3]}>
        {Array.from({ length: 10 }, (_, i) => {
          const a = (i / 10) * Math.PI * 2;
          return (
            <mesh
              key={i}
              geometry={arrowGeo}
              material={arrowMat}
              position={[Math.cos(a) * 2.3, 0, Math.sin(a) * 2.3]}
              // 箭頭沿著圓周切線，指向角度變大的方向（= direction 1 的轉向），反方向就左右翻過來
              rotation-y={-a - Math.PI / 2}
              scale={direction === 1 ? [1, 1, 1] : [-1, 1, 1]}
            />
          );
        })}
      </group>
    </group>
  );
}

// ---------- 抽牌堆（畫面左上角，跟著鏡頭）----------

function Deck({
  count,
  pending,
  active,
  hint,
  onDraw,
  labels,
}: {
  count: number;
  /** 輪到你時累積要吃的張數 */
  pending: number;
  active: boolean;
  /** 沒牌可出：抽牌堆跳動提示 */
  hint: boolean;
  onDraw(): void;
  labels: RefObject<HTMLElement>;
}) {
  const size = useThree((st) => st.size);
  const group = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.MeshBasicMaterial>(null!);
  const thick = Math.max(0.03, Math.min(count, 110) * 0.005);
  const tilt = useMemo(() => new THREE.Quaternion().setFromEuler(DECK_TILT), []);
  const mats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.7, emissive: '#3a372f' });
    const top = new THREE.MeshStandardMaterial({
      map: backTexture(),
      emissiveMap: backTexture(),
      emissive: new THREE.Color(0.5, 0.5, 0.5),
      roughness: 0.55,
    });
    // BoxGeometry 的面：+x -x +y -y +z(朝鏡頭) -z
    return [side, side, side, side, top, side];
  }, []);

  useFrame((st) => {
    const slot = deckSlot(size.width / size.height, size.height);
    const g = group.current;
    g.position.copy(slot.pos).applyMatrix4(rig.base.matrixWorld);
    g.quaternion.copy(rig.base.quaternion).multiply(tilt);
    const t = st.clock.elapsedTime;
    const bounce = active && hint ? Math.abs(Math.sin(t * 5)) * 0.08 : 0;
    g.scale.setScalar(slot.scale * (1 + bounce));
    glow.current.opacity = active ? (hint ? 0.8 + Math.sin(t * 7) * 0.2 : 0.45 + Math.sin(t * 3) * 0.2) : 0;
    glow.current.color.set(pending > 0 ? '#ff3030' : '#ffe08a').multiplyScalar(2.5);
  });

  return (
    <group ref={group}>
      <mesh
        material={mats}
        position-z={-thick / 2}
        onClick={(e) => {
          e.stopPropagation();
          if (active) onDraw();
        }}
        onPointerOver={() => active && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[CARD_W, CARD_H, thick]} />
      </mesh>
      <mesh position-z={-thick - 0.01} raycast={() => null}>
        <planeGeometry args={[CARD_W * 1.375, CARD_H * 1.25]} />
        <meshBasicMaterial
          ref={glow}
          map={glowTexture()}
          transparent
          opacity={0}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <Html portal={labels} position={[CARD_W * 0.42, -CARD_H * 0.42, 0]} center zIndexRange={[12, 0]}>
        <div className={`deck-badge ${pending > 0 ? 'hot' : ''}`}>{pending > 0 ? `+${formatCount(pending)}` : count}</div>
      </Html>
    </group>
  );
}

// ---------- 牌（手牌 + 棄牌堆）----------

interface DiscardItem {
  card: Card;
  rz: number;
}

function Cards({
  view,
  game,
  events,
  seats,
  myTurn,
  pendingCard: pending,
  onPlay,
}: Props & { seats: Map<string, THREE.Vector3>; myTurn: boolean }) {
  const size = useThree((s) => s.size);
  const discard = useRef<DiscardItem[]>([]);
  const spawns = useRef(new Map<string, Pose>());
  const delays = useRef(new Map<string, number>());
  const known = useRef(new Set<string>());

  const hand = useMemo(() => sortHand(game.hand ?? []), [game.hand]);
  const aspect = size.width / size.height;
  const fromDeck = () => deckWorldPose(aspect, size.height);

  // 事件改變時（也就是收到新畫面時）更新棄牌堆、決定新牌從哪裡飛出來
  useMemo(() => {
    if (discard.current.length === 0) {
      // 開局翻開的第一張從抽牌堆翻過來
      discard.current.push({ card: game.topCard, rz: jitter() });
      spawns.current.set(game.topCard.id, fromDeck());
    }
    let giver: string | null = null;
    for (const e of events) {
      if (e.t === 'play' && !discard.current.some((d) => d.card.id === e.card.id)) {
        if (!known.current.has(e.card.id)) {
          spawns.current.set(e.card.id, pose(seatPoint(seats, e.by, 0.9), [FACE_DOWN, 0, 0], 0.7));
        }
        discard.current.push({ card: e.card, rz: jitter() });
        if (discard.current.length > 16) discard.current.shift();
      }
      if (e.t === 'swap') giver = e.moves.find(([, to]) => to === view.you)?.[0] ?? null;
    }
    // 新拿到的牌：一般從抽牌堆飛過來，換手牌的話從原本拿著的人那裡飛過來
    const fresh = hand.filter((c) => !known.current.has(c.id));
    const gap = fresh.length > 20 ? 0.025 : 0.08;
    fresh.forEach((c, i) => {
      const from = giver ? pose(seatPoint(seats, giver, 0.9), [FACE_DOWN, 0, 0], 0.7) : fromDeck();
      spawns.current.set(c.id, from);
      delays.current.set(c.id, i * gap);
    });
    for (const c of hand) known.current.add(c.id);
  }, [events]);

  // 飛到中間等選顏色（或選人）的那張不算在手牌的位置裡
  const pendingId = pending && hand.some((c) => c.id === pending.id) ? pending.id : null;
  const inHand = pendingId ? hand.filter((c) => c.id !== pendingId) : hand;
  const slots = useMemo(() => handSlots(inHand.length, aspect, 78, size.height), [inHand.length, aspect, size.height]);
  const handIds = new Set(hand.map((c) => c.id));
  const items: ReactElement[] = [];
  const n = discard.current.length;

  discard.current.forEach((d, i) => {
    // 已經在手上的牌不會在棄牌堆（剛出、畫面還沒更新的情況）
    if (handIds.has(d.card.id)) return;
    const at = DISCARD.clone().setY(0.012 + i * 0.006);
    const target = pose(at, [FACE_UP, 0, d.rz]);
    items.push(
      <CardMesh
        key={d.card.id}
        card={d.card}
        spawn={spawns.current.get(d.card.id) ?? target}
        speed={i === n - 1 ? 7 : 10}
        target={(out) => {
          out.pos.copy(target.pos);
          out.quat.copy(target.quat);
          out.scale = 1;
        }}
      />,
    );
  });

  const localQ = new THREE.Quaternion();
  const flatQ = new THREE.Quaternion();
  const euler = new THREE.Euler();
  inHand.forEach((card, i) => {
    const slot = slots[i];
    const playable = game.playable.includes(card.id);
    items.push(
      <CardMesh
        key={card.id}
        card={card}
        spawn={spawns.current.get(card.id) ?? fromDeck()}
        delay={delays.current.get(card.id) ?? 0}
        speed={9}
        glow={playable ? COLOR_HEX[card.color ?? game.currentColor] : null}
        dim={myTurn && !playable}
        onClick={playable ? () => onPlay(card) : undefined}
        target={(out, hovered) => {
          const lift = (playable ? 0.12 : 0) + (hovered ? 0.18 : 0);
          out.pos.set(slot.x, slot.y + lift * slot.scale * 1.5, slot.z + (hovered ? 0.25 : 0));
          out.pos.applyMatrix4(rig.base.matrixWorld);
          euler.set(0, 0, hovered ? 0 : slot.rz);
          out.quat.copy(rig.base.quaternion).multiply(localQ.setFromEuler(euler));
          out.scale = slot.scale * (hovered ? 1.15 : 1);
        }}
      />,
    );
  });

  // 萬用牌（或換牌的 7）先丟到桌子中間浮著，半躺半朝鏡頭，等選完顏色（或人）
  const pendingCard = pendingId ? hand.find((c) => c.id === pendingId)! : null;
  if (pendingCard) {
    const topY = 0.012 + discard.current.length * 0.006;
    items.push(
      <CardMesh
        key={pendingCard.id}
        card={pendingCard}
        spawn={fromDeck()}
        speed={7}
        glow="#ffffff"
        target={(out) => {
          const t = performance.now() / 1000;
          out.pos.copy(DISCARD).setY(topY + 0.55 + Math.sin(t * 3) * 0.05);
          flatQ.setFromEuler(euler.set(FACE_UP, 0, Math.sin(t * 2) * 0.08));
          out.quat.copy(flatQ).slerp(rig.base.quaternion, 0.45);
          out.scale = 1.25;
        }}
      />,
    );
  }

  return <>{items}</>;
}

/** 手牌照顏色、種類、數字排好 */
function sortHand(hand: Card[]): Card[] {
  const colorRank = (c: Card) => (c.color ? COLORS.indexOf(c.color) : 99);
  return [...hand].sort(
    (a, b) => colorRank(a) - colorRank(b) || a.kind.localeCompare(b.kind) || (a.value ?? 0) - (b.value ?? 0) || a.id.localeCompare(b.id),
  );
}

const jitter = () => (Math.random() - 0.5) * 0.7;

function seatPoint(seats: Map<string, THREE.Vector3>, id: string, y: number) {
  return (seats.get(id) ?? MY_SEAT).clone().setY(y);
}

// ---------- 只有牌背、飛完就消失的牌（別人抽牌、換手牌、爆牌）----------

interface Ghost {
  id: number;
  from: Pose;
  to: Pose;
  delay: number;
  speed: number;
}

let ghostId = 0;

function Ghosts({ events, game, you, seats }: { events: GameEvent[]; game: GameView; you: string; seats: Map<string, THREE.Vector3> }) {
  const [ghosts, setGhosts] = useState<Ghost[]>([]);
  const size = useThree((st) => st.size);

  useEffect(() => {
    const add: Ghost[] = [];
    const deck = deckWorldPose(size.width / size.height, size.height);
    const seatPose = (id: string) => pose(seatPoint(seats, id, 0.9), [-0.35, seatYaw(seats.get(id)!), 0], 0.6);

    for (const e of events) {
      if (e.t === 'draw' && e.id !== you) {
        const shown = Math.min(e.n, 24);
        for (let i = 0; i < shown; i++) {
          add.push({ id: ghostId++, from: deck, to: seatPose(e.id), delay: i * (e.n > 10 ? 0.04 : 0.1), speed: 7 });
        }
      } else if (e.t === 'swap') {
        // 每一手牌從原本的人飛到新主人那裡（張數 = 新主人現在的張數）
        const at = (id: string) => (id === you ? pose(handCenter(), [0, 0, 0], 0.5) : seatPose(id));
        for (const [from, to] of e.moves) {
          const n = game.players.find((p) => p.id === to)?.handCount ?? 0;
          for (let k = 0; k < Math.min(n, 6); k++) {
            add.push({ id: ghostId++, from: at(from), to: at(to), delay: k * 0.06, speed: 4 });
          }
        }
      } else if (e.t === 'out') {
        // 爆牌：牌往四面八方噴出去
        const at = seatPoint(seats, e.id, 1);
        for (let k = 0; k < 24; k++) {
          const a = Math.random() * Math.PI * 2;
          const to = at.clone().add(new THREE.Vector3(Math.cos(a) * 6, -1.5, Math.sin(a) * 6));
          add.push({
            id: ghostId++,
            from: pose(at, [Math.random() * 6, Math.random() * 6, 0], 0.6),
            to: pose(to, [Math.random() * 12, Math.random() * 12, Math.random() * 12], 0.6),
            delay: 0,
            speed: 2.5,
          });
        }
      }
    }
    if (!add.length) return;
    setGhosts((g) => [...g, ...add]);
    const ids = new Set(add.map((g) => g.id));
    const maxDelay = Math.max(...add.map((g) => g.delay));
    // 不在 cleanup 清掉計時器：每個新畫面都會重跑這個 effect，清掉的話這批牌會永遠卡在桌上
    setTimeout(() => setGhosts((g) => g.filter((x) => !ids.has(x.id))), (maxDelay + 0.9) * 1000);
  }, [events]);

  return (
    <>
      {ghosts.map((g) => (
        <CardMesh
          key={g.id}
          card={null}
          spawn={g.from}
          delay={g.delay}
          speed={g.speed}
          target={(out) => {
            out.pos.copy(g.to.pos);
            out.quat.copy(g.to.quat);
            out.scale = g.to.scale;
          }}
        />
      ))}
    </>
  );
}

function handCenter() {
  return new THREE.Vector3(0, -0.8, -HAND_DIST).applyMatrix4(rig.base.matrixWorld);
}

/** 讓座位朝向桌子中間 */
function seatYaw(p: THREE.Vector3) {
  return Math.atan2(-p.x, -p.z);
}

// ---------- 對手座位 ----------

function Seat({
  player,
  pos,
  active,
  color,
  canCatch,
  onCatch,
  canTarget,
  onTarget,
  labels,
  offline,
}: {
  labels: RefObject<HTMLElement>;
  player: GameView['players'][number];
  /** 斷線中，機器人代打 */
  offline: boolean;
  pos: THREE.Vector3;
  active: boolean;
  color: string;
  canCatch: boolean;
  onCatch(): void;
  /** 可以選他換手牌 */
  canTarget: boolean;
  onTarget(): void;
}) {
  const ring = useRef<THREE.MeshBasicMaterial>(null!);
  const fan = useRef<THREE.Group>(null!);
  const backMat = useMemo(() => new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.4, alphaTest: 0.5, side: THREE.DoubleSide }), []);
  const n = player.out ? 0 : Math.min(player.handCount, 14);

  useFrame((st, dt) => {
    const t = st.clock.elapsedTime;
    ring.current.opacity = THREE.MathUtils.lerp(ring.current.opacity, active ? 0.75 + Math.sin(t * 5) * 0.25 : 0, 1 - Math.exp(-6 * dt));
    ring.current.color.set(color).multiplyScalar(2.5);
    // 輪到的人手牌會上下浮動
    fan.current.position.y = 0.55 + (active ? Math.sin(t * 4) * 0.06 : 0);
  });

  return (
    <group position={pos} rotation-y={seatYaw(pos)}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.02}>
        <ringGeometry args={[0.8, 1.05, 64]} />
        <meshBasicMaterial ref={ring} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
      </mesh>
      <group ref={fan}>
        {Array.from({ length: n }, (_, i) => {
          const u = i - (n - 1) / 2;
          return (
            <mesh key={i} material={backMat} position={[u * 0.16, -Math.abs(u) * 0.015, -i * 0.004]} rotation={[-0.35, 0, -u * 0.07]} scale={0.55}>
              <planeGeometry args={[CARD_W, CARD_H]} />
            </mesh>
          );
        })}
      </group>
      <Html portal={labels} position={[0, 1.9, -0.7]} center zIndexRange={[20, 0]}>
        <div
          className={`seat3d ${active ? 'active' : ''} ${player.out ? 'out' : ''} ${offline && !player.out ? 'bot' : ''} ${canTarget ? 'targetable' : ''}`}
        >
          <div className="seat-face">
            <Avatar name={player.name} src={player.avatar} />
            {offline && !player.out && <RobotIcon className="bot-badge" aria-label="機器人代打中" />}
          </div>
          <div className="seat-name">{player.name}</div>
          <div className="seat-count">
            {player.out ? (
              <SkullIcon />
            ) : (
              <>
                <DeckIcon /> <span key={player.handCount}>{player.handCount}</span>
              </>
            )}
          </div>
          {player.unoSafe && !player.out && <div className="uno-badge">LAST!</div>}
          {canCatch && !canTarget && (
            <button className="catch-btn" onClick={onCatch} aria-label="抓他沒喊 LAST!">
              <SirenIcon />
            </button>
          )}
          {canTarget && (
            <button className="swap-btn" onClick={onTarget} aria-label={`跟 ${player.name} 換手牌`}>
              <SwapIcon />
            </button>
          )}
        </div>
      </Html>
    </group>
  );
}
