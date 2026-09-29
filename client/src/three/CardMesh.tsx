import type { Card } from '@crazyuno/shared';
import { useFrame, type ThreeEvent } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as sfx from '../sfx';
import { backTexture, CARD_H, CARD_W, faceTexture, glowTexture } from './cardArt';

export interface Pose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: number;
}

export function pose(pos: THREE.Vector3, euler: [number, number, number] = [0, 0, 0], scale = 1): Pose {
  return { pos: pos.clone(), quat: new THREE.Quaternion().setFromEuler(new THREE.Euler(...euler)), scale };
}

/** 牌面朝上平放 / 牌面朝下平放 */
export const FACE_UP = -Math.PI / 2;
export const FACE_DOWN = Math.PI / 2;

const plane = new THREE.PlaneGeometry(CARD_W, CARD_H);
const glowPlane = new THREE.PlaneGeometry(CARD_W * 1.375, CARD_H * 1.25);
/** 隱形判定板共用的材質（不會畫出來，只是射線判定要有材質） */
const hitMat = new THREE.MeshBasicMaterial();
let backMat: THREE.MeshStandardMaterial | null = null;
const WHITE = new THREE.Color(1, 1, 1);
const DIM = new THREE.Color(0.38, 0.38, 0.42);
/** 牌面自己發一點光，不管燈怎麼打顏色都鮮豔 */
const EMISSIVE = new THREE.Color(0.5, 0.5, 0.5);
const EMISSIVE_DIM = new THREE.Color(0.12, 0.12, 0.14);
const tmp = new THREE.Vector3();

interface Props {
  /** null = 只看得到牌背 */
  card: Card | null;
  /** 剛出現時的位置 */
  spawn: Pose;
  /** 每一格算出要去的位置 */
  target: (out: Pose, hovered: boolean) => void;
  /**
   * 手牌才有：這張牌沒被滑到時的位置。點擊和滑鼠判定用一塊固定在這裡的隱形板子，
   * 不跟著牌浮起、放大、靠近鏡頭一起跑（不然游標在牌邊緣時，牌一浮起來就離開游標、掉回去又碰到，一直閃）
   */
  rest?: (out: Pose) => void;
  /** 等幾秒再出現（發牌一張一張來） */
  delay?: number;
  /** 追上目標的速度 */
  speed?: number;
  glow?: string | null;
  dim?: boolean;
  /** 可以出的牌：滑鼠移上去會浮起來，點了就出 */
  onClick?: () => void;
  /** 不能出的手牌被點到。它還是會擋住後面的牌，不會點穿去出到被它蓋住的那張 */
  onBlockedClick?: () => void;
}

/** 牌浮起來的時候，判定範圍往上多延伸這麼多（牌高的比例），游標跟著牌往上移也不會掉 */
const HOVER_REACH = 0.35;

export function CardMesh({ card, spawn, target, rest, delay = 0, speed = 8, glow = null, dim = false, onClick, onBlockedClick }: Props) {
  const group = useRef<THREE.Group>(null!);
  const hit = useRef<THREE.Mesh>(null!);
  const tgt = useMemo<Pose>(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }), []);
  const restPose = useMemo<Pose>(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }), []);
  /** over：滑鼠游標在判定板上；hovered：牌浮起來了（游標在上面而且能出） */
  const s = useRef({ born: -1, over: false, hovered: false, shown: false });
  const live = useRef({ target, rest, glow, dim, onClick, onBlockedClick });
  live.current = { target, rest, glow, dim, onClick, onBlockedClick };

  const tex = card ? faceTexture(card) : backTexture();
  const front = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        map: tex,
        emissiveMap: tex,
        emissive: EMISSIVE,
        roughness: 0.55,
        metalness: 0,
        envMapIntensity: 0.4,
        alphaTest: 0.5,
      }),
    [tex],
  );
  backMat ??= new THREE.MeshStandardMaterial({
    map: backTexture(),
    emissiveMap: backTexture(),
    emissive: EMISSIVE,
    roughness: 0.55,
    envMapIntensity: 0.4,
    alphaTest: 0.5,
  });
  const glowMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        map: glowTexture(),
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      }),
    [],
  );
  useLayoutEffect(
    () => () => {
      front.dispose();
      glowMat.dispose();
      if (s.current.hovered) document.body.style.cursor = '';
    },
    [front, glowMat],
  );

  useLayoutEffect(() => {
    const g = group.current;
    g.position.copy(spawn.pos);
    g.quaternion.copy(spawn.quat);
    g.scale.setScalar(spawn.scale);
    // spawn 只在第一次出現時用
  }, []);

  useFrame((st, dt) => {
    const g = group.current;
    const now = st.clock.elapsedTime;
    if (s.current.born < 0) s.current.born = now;
    if (now - s.current.born < delay) {
      g.visible = false;
      return;
    }
    g.visible = true;
    s.current.shown = true;
    const { target, rest, glow, dim, onClick } = live.current;
    // 游標停著不動，牌也可能變得能出（輪到自己）、不能出（輪到別人）或離開手牌（出掉了），每一格都對一次
    if (!rest) s.current.over = false;
    const lift = s.current.over && !!onClick;
    if (lift !== s.current.hovered) setHovered(lift);
    target(tgt, s.current.hovered);

    if (rest && hit.current) {
      rest(restPose);
      const h = hit.current;
      h.position.copy(restPose.pos);
      h.quaternion.copy(restPose.quat);
      const reach = s.current.hovered ? HOVER_REACH : 0;
      h.scale.set(restPose.scale, restPose.scale * (1 + reach), 1);
      h.translateY((CARD_H * restPose.scale * reach) / 2);
    }

    const k = 1 - Math.exp(-speed * Math.min(dt, 0.05));
    // 飛行途中往上拋，看起來像被丟出去
    const dist = g.position.distanceTo(tgt.pos);
    tmp.copy(tgt.pos);
    tmp.y += Math.min(dist, 5) * 0.3;
    g.position.lerp(tmp, k);
    g.quaternion.slerp(tgt.quat, k);
    g.scale.setScalar(THREE.MathUtils.lerp(g.scale.x, tgt.scale, k));

    front.color.lerp(dim ? DIM : WHITE, k);
    front.emissive.lerp(dim ? EMISSIVE_DIM : EMISSIVE, k);
    if (glow) {
      glowMat.color.set(glow).multiplyScalar(2.5);
      glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, 0.75 + Math.sin(now * 6) * 0.25, k);
    } else {
      glowMat.opacity = THREE.MathUtils.lerp(glowMat.opacity, 0, k);
    }
  });

  function setHovered(on: boolean) {
    s.current.hovered = on;
    document.body.style.cursor = on ? 'pointer' : '';
    if (on) sfx.hover();
  }

  // 手牌的每一張（能不能出都一樣）都會擋住後面的牌：只有最前面那張收得到滑鼠
  const handlers = {
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      const { onClick, onBlockedClick } = live.current;
      if (onClick) onClick();
      else onBlockedClick?.();
    },
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      // 手機上點一下也會觸發 over，只有滑鼠才做「浮起來」；不能出的牌不浮
      if (e.pointerType !== 'mouse') return;
      s.current.over = true;
      if (live.current.onClick) setHovered(true);
    },
    onPointerOut: () => {
      s.current.over = false;
      if (s.current.hovered) setHovered(false);
    },
  };

  return (
    <>
      <group ref={group} visible={false}>
        <mesh geometry={glowPlane} material={glowMat} position-z={-0.004} raycast={noRaycast} />
        <mesh geometry={plane} material={front} raycast={noRaycast} />
        <mesh geometry={plane} material={backMat} rotation-y={Math.PI} raycast={noRaycast} />
      </group>
      {/* 隱形的判定板：不畫出來（射線不管 visible），發牌還沒飛出來之前也點不到 */}
      {rest && (
        <mesh
          ref={hit}
          geometry={plane}
          material={hitMat}
          visible={false}
          raycast={function (this: THREE.Mesh, raycaster, hits) {
            if (s.current.shown) THREE.Mesh.prototype.raycast.call(this, raycaster, hits);
          }}
          {...handlers}
        />
      )}
    </>
  );
}

function noRaycast() {}
