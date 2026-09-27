import { COLORS, type Card, type GameView, type RoomView } from '@crazyuno/shared';
import { Environment, Html, Lightformer, PerformanceMonitor, Sparkles } from '@react-three/drei';
import { useFrame, useThree } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type ChromaticAberrationEffect } from 'postprocessing';
import { useEffect, useMemo, useRef, useState, type ReactElement, type RefObject } from 'react';
import * as THREE from 'three';
import { Avatar } from '../components/Avatar';
import { backTexture, CARD_H, CARD_W, COLOR_HEX, feltTexture } from './cardArt';
import { CardMesh, FACE_DOWN, FACE_UP, pose, type Pose } from './CardMesh';
import { CameraRig, Particles, Shockwaves } from './Effects';
import type { GameEvent } from './events';
import { DISCARD, DRAW_PILE, handSlots, HAND_DIST, MY_SEAT, rig, seatMap, TABLE_RX, TABLE_RZ } from './layout';

interface Props {
  view: RoomView;
  game: GameView;
  events: GameEvent[];
  /** 每開新的一局就換一個數字，讓牌堆全部重來 */
  round: number;
  selectedId: string | null;
  onPlay(card: Card): void;
  onDraw(): void;
  onCatch(targetId: string): void;
  /** 3D 裡的 HTML 標籤掛在這個 div 上 */
  labels: RefObject<HTMLElement>;
}

export function Scene(props: Props) {
  const { view, game, labels } = props;
  const [hq, setHq] = useState(true);
  const setDpr = useThree((s) => s.setDpr);
  const size = useThree((s) => s.size);
  const aberration = useRef<ChromaticAberrationEffect>(null);
  const aspect = size.width / size.height;
  const seats = useMemo(() => seatMap(game, view.you, aspect), [game, view.you, aspect]);
  const myTurn = game.phase === 'playing' && game.turnId === view.you;

  return (
    <>
      <color attach="background" args={['#05060b']} />
      <fog attach="fog" args={['#05060b', 16, 34]} />
      <PerformanceMonitor
        onDecline={() => {
          // 手機跑不動就關掉後製、降解析度（網址加 ?hq 強制全開）
          if (FORCE_HQ) return;
          setHq(false);
          setDpr(1);
        }}
      />
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
      <Sparkles count={70} scale={[16, 5, 12]} position={[0, 2.5, 0]} size={3} speed={0.35} opacity={0.6} color={COLOR_HEX[game.currentColor]} />

      <DrawPile labels={labels} count={game.drawPileCount} active={myTurn && !game.hasDrawn} hint={myTurn && game.playable.length === 0} onDraw={props.onDraw} />
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
              pos={seats.get(p.id)!}
              active={p.id === game.turnId && game.phase === 'playing'}
              color={COLOR_HEX[game.currentColor]}
              canCatch={canCatch}
              onCatch={() => props.onCatch(p.id)}
            />
          );
        })}

      {/* Html 一直掛著，只換內容：drei 的 Html 卸載時會跟 React 19 打架 */}
      <Html portal={labels} position={[0, 1.7, 0.3]} center zIndexRange={[15, 0]}>
        {game.pendingDraw > 0 && (
          <div className="pending3d" style={{ fontSize: `${Math.min(6, 2.2 + game.pendingDraw * 0.06)}rem` }}>
            +{game.pendingDraw}
          </div>
        )}
      </Html>

      <Particles />
      <Shockwaves />

      {hq ? (
        <EffectComposer multisampling={4}>
          <Bloom mipmapBlur luminanceThreshold={0.9} luminanceSmoothing={0.2} intensity={1.1} />
          <ChromaticAberration ref={aberration} offset={new THREE.Vector2(0, 0)} radialModulation={false} modulationOffset={0} />
          <Vignette offset={0.25} darkness={0.75} />
          <ToneMapping mode={ToneMappingMode.NEUTRAL} />
        </EffectComposer>
      ) : null}
    </>
  );
}

const FORCE_HQ = new URLSearchParams(location.search).has('hq');

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

// ---------- 抽牌堆 ----------

function DrawPile({
  count,
  active,
  hint,
  onDraw,
  labels,
}: {
  count: number;
  active: boolean;
  hint: boolean;
  onDraw(): void;
  labels: RefObject<HTMLElement>;
}) {
  const h = Math.max(0.01, Math.min(count, 110) * 0.005);
  const mats = useMemo(() => {
    const side = new THREE.MeshStandardMaterial({ color: '#e9e4d8', roughness: 0.7 });
    const top = new THREE.MeshStandardMaterial({ map: backTexture(), roughness: 0.4 });
    return [side, side, top, side, side, side];
  }, []);
  const glow = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame((st) => {
    const t = st.clock.elapsedTime;
    glow.current.opacity = active ? (hint ? 0.7 + Math.sin(t * 7) * 0.3 : 0.35 + Math.sin(t * 3) * 0.15) : 0;
  });

  return (
    <group position={DRAW_PILE}>
      <mesh
        material={mats}
        position-y={h / 2}
        rotation-y={0.04}
        onClick={(e) => {
          e.stopPropagation();
          if (active) onDraw();
        }}
        onPointerOver={() => active && (document.body.style.cursor = 'pointer')}
        onPointerOut={() => (document.body.style.cursor = '')}
      >
        <boxGeometry args={[CARD_W, h, CARD_H]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.012} raycast={() => null}>
        <planeGeometry args={[CARD_W * 1.5, CARD_H * 1.35]} />
        <meshBasicMaterial ref={glow} color={[2.5, 2.2, 1.2]} transparent opacity={0} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} alphaMap={roundGlow()} />
      </mesh>
      <Html portal={labels} position={[0, h + 0.1, CARD_H * 0.62]} center zIndexRange={[10, 0]}>
        {count > 0 && <div className="pile-count">{count}</div>}
      </Html>
    </group>
  );
}

let roundGlowTex: THREE.Texture | null = null;
function roundGlow() {
  if (roundGlowTex) return roundGlowTex;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, '#fff');
  grad.addColorStop(1, '#000');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  roundGlowTex = new THREE.CanvasTexture(c);
  return roundGlowTex;
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
  selectedId,
  onPlay,
}: Props & { seats: Map<string, THREE.Vector3>; myTurn: boolean }) {
  const size = useThree((s) => s.size);
  const discard = useRef<DiscardItem[]>([]);
  const spawns = useRef(new Map<string, Pose>());
  const delays = useRef(new Map<string, number>());
  const known = useRef(new Set<string>());

  const hand = useMemo(() => sortHand(game.hand ?? []), [game.hand]);
  const pileTop = DRAW_PILE.clone().setY(Math.min(game.drawPileCount, 110) * 0.005 + 0.05);

  // 事件改變時（也就是收到新畫面時）更新棄牌堆、決定新牌從哪裡飛出來
  useMemo(() => {
    if (discard.current.length === 0) {
      // 開局翻開的第一張從抽牌堆翻過來
      discard.current.push({ card: game.topCard, rz: jitter() });
      spawns.current.set(game.topCard.id, pose(pileTop, [FACE_DOWN, 0, 0]));
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
      if (e.t === 'swap') giver = previousActive(game, view.you);
    }
    // 新拿到的牌：一般從抽牌堆飛過來，大風吹從上家飛過來
    const fresh = hand.filter((c) => !known.current.has(c.id));
    const gap = fresh.length > 20 ? 0.025 : 0.08;
    fresh.forEach((c, i) => {
      const from = giver ? pose(seatPoint(seats, giver, 0.9), [FACE_DOWN, 0, 0], 0.7) : pose(pileTop, [FACE_DOWN, 0, 0]);
      spawns.current.set(c.id, from);
      delays.current.set(c.id, i * gap);
    });
    for (const c of hand) known.current.add(c.id);
  }, [events]);

  const aspect = size.width / size.height;
  const slots = useMemo(() => handSlots(hand.length, aspect, 78, size.height), [hand.length, aspect, size.height]);
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
  const euler = new THREE.Euler();
  hand.forEach((card, i) => {
    const slot = slots[i];
    const playable = game.playable.includes(card.id);
    const selected = card.id === selectedId;
    items.push(
      <CardMesh
        key={card.id}
        card={card}
        spawn={spawns.current.get(card.id) ?? pose(pileTop, [FACE_DOWN, 0, 0])}
        delay={delays.current.get(card.id) ?? 0}
        speed={9}
        glow={selected ? '#ffffff' : playable ? COLOR_HEX[card.color ?? game.currentColor] : null}
        dim={myTurn && !playable}
        onClick={playable ? () => onPlay(card) : undefined}
        target={(out, hovered) => {
          const lift = (playable ? 0.12 : 0) + (hovered ? 0.18 : 0) + (selected ? 0.3 : 0);
          out.pos.set(slot.x, slot.y + lift * slot.scale * 1.5, slot.z + (hovered || selected ? 0.25 : 0));
          out.pos.applyMatrix4(rig.base.matrixWorld);
          euler.set(0, 0, hovered || selected ? 0 : slot.rz);
          out.quat.copy(rig.base.quaternion).multiply(localQ.setFromEuler(euler));
          out.scale = slot.scale * (hovered || selected ? 1.15 : 1);
        }}
      />,
    );
  });

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

/** 大風吹時把牌傳給我的人：往出牌方向的反方向找第一個還沒出局的 */
function previousActive(game: GameView, you: string): string | null {
  const n = game.players.length;
  const me = game.players.findIndex((p) => p.id === you);
  if (me === -1) return null;
  for (let k = 1; k < n; k++) {
    const p = game.players[(((me - k * game.direction) % n) + n) % n];
    if (!p.out) return p.id;
  }
  return null;
}

// ---------- 只有牌背、飛完就消失的牌（別人抽牌、大風吹、爆牌）----------

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

  useEffect(() => {
    const add: Ghost[] = [];
    const pileTop = DRAW_PILE.clone().setY(Math.min(game.drawPileCount, 110) * 0.005 + 0.05);
    const seatPose = (id: string) => pose(seatPoint(seats, id, 0.9), [-0.35, seatYaw(seats.get(id)!), 0], 0.6);

    for (const e of events) {
      if (e.t === 'draw' && e.id !== you) {
        const shown = Math.min(e.n, 24);
        for (let i = 0; i < shown; i++) {
          add.push({ id: ghostId++, from: pose(pileTop, [FACE_DOWN, 0, 0]), to: seatPose(e.id), delay: i * (e.n > 10 ? 0.04 : 0.1), speed: 7 });
        }
      } else if (e.t === 'swap') {
        // 每個人的手牌往下一家飛
        const active = game.players.filter((p) => !p.out);
        active.forEach((p, i) => {
          const to = active[(i + (game.direction === 1 ? 1 : active.length - 1)) % active.length];
          const from = p.id === you ? pose(handCenter(), [0, 0, 0], 0.5) : seatPose(p.id);
          const dest = to.id === you ? pose(handCenter(), [0, 0, 0], 0.5) : seatPose(to.id);
          for (let k = 0; k < Math.min(p.handCount, 6); k++) {
            add.push({ id: ghostId++, from, to: dest, delay: k * 0.06, speed: 4 });
          }
        });
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
    const t = setTimeout(() => setGhosts((g) => g.filter((x) => !ids.has(x.id))), (maxDelay + 0.9) * 1000);
    return () => clearTimeout(t);
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
  labels,
}: {
  labels: RefObject<HTMLElement>;
  player: GameView['players'][number];
  pos: THREE.Vector3;
  active: boolean;
  color: string;
  canCatch: boolean;
  onCatch(): void;
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
        <div className={`seat3d ${active ? 'active' : ''} ${player.out ? 'out' : ''}`}>
          <Avatar name={player.name} src={player.avatar} />
          <div className="seat-name">{player.name}</div>
          <div className="seat-count">{player.out ? '💀 出局' : `🂠 ${player.handCount}`}</div>
          {player.unoSafe && !player.out && <div className="uno-badge">UNO!</div>}
          {canCatch && (
            <button className="catch-btn" onClick={onCatch}>
              抓！
            </button>
          )}
        </div>
      </Html>
    </group>
  );
}
