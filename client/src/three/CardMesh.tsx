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
  /** 等幾秒再出現（發牌一張一張來） */
  delay?: number;
  /** 追上目標的速度 */
  speed?: number;
  glow?: string | null;
  dim?: boolean;
  onClick?: () => void;
}

export function CardMesh({ card, spawn, target, delay = 0, speed = 8, glow = null, dim = false, onClick }: Props) {
  const group = useRef<THREE.Group>(null!);
  const tgt = useMemo<Pose>(() => ({ pos: new THREE.Vector3(), quat: new THREE.Quaternion(), scale: 1 }), []);
  const s = useRef({ born: -1, hovered: false });
  const live = useRef({ target, glow, dim });
  live.current = { target, glow, dim };

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
    const { target, glow, dim } = live.current;
    target(tgt, s.current.hovered);

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

  const handlers = onClick
    ? {
        onClick: (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          onClick();
        },
        onPointerOver: (e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          // 手機上點一下也會觸發 over，只有滑鼠才做「浮起來」
          if (e.pointerType !== 'mouse') return;
          s.current.hovered = true;
          document.body.style.cursor = 'pointer';
          sfx.hover();
        },
        onPointerOut: () => {
          s.current.hovered = false;
          document.body.style.cursor = '';
        },
      }
    : {};

  return (
    <group ref={group} visible={false}>
      <mesh geometry={glowPlane} material={glowMat} position-z={-0.004} raycast={noRaycast} />
      <mesh geometry={plane} material={front} {...handlers} />
      <mesh geometry={plane} material={backMat} rotation-y={Math.PI} />
    </group>
  );
}

function noRaycast() {}
