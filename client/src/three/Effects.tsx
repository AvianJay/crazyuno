import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { COLOR_HEX, dotTexture } from './cardArt';
import { onFx } from './fx';
import { FOV, rig } from './layout';

const MAX_PARTICLES = 4000;

/** 所有粒子共用一個 Points，用環狀緩衝區循環使用 */
export function Particles() {
  const { geo, mat, sim } = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES * 3), 3));
    geo.setAttribute('size', new THREE.BufferAttribute(new Float32Array(MAX_PARTICLES), 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: dotTexture() }, scale: { value: 1 }, maxSize: { value: 32 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute vec3 color;
        varying vec3 vColor;
        uniform float scale;
        uniform float maxSize;
        void main() {
          vColor = color;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = min(size * scale / -mv.z, maxSize);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D map;
        varying vec3 vColor;
        void main() {
          vec4 t = texture2D(map, gl_PointCoord);
          gl_FragColor = vec4(vColor * t.a, 1.0);
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    });
    const sim = {
      vel: new Float32Array(MAX_PARTICLES * 3),
      base: new Float32Array(MAX_PARTICLES * 3),
      life: new Float32Array(MAX_PARTICLES),
      maxLife: new Float32Array(MAX_PARTICLES),
      size: new Float32Array(MAX_PARTICLES),
      gravity: new Float32Array(MAX_PARTICLES),
      drag: new Float32Array(MAX_PARTICLES),
      next: 0,
    };
    return { geo, mat, sim };
  }, []);

  const size = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);
  useEffect(() => {
    // 讓粒子大小跟畫面高度成正比
    mat.uniforms.scale.value = (size.height * dpr) / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
    mat.uniforms.maxSize.value = 32 * dpr;
  }, [mat, size.height, dpr]);

  useEffect(() => {
    const pos = geo.attributes.position.array as Float32Array;
    const col = new THREE.Color();
    const spawn = (
      p: [number, number, number],
      v: [number, number, number],
      color: string,
      life: number,
      sz: number,
      gravity: number,
      drag: number,
    ) => {
      const i = sim.next;
      sim.next = (sim.next + 1) % MAX_PARTICLES;
      pos.set(p, i * 3);
      sim.vel.set(v, i * 3);
      col.set(color).multiplyScalar(1.6 + Math.random());
      sim.base.set([col.r, col.g, col.b], i * 3);
      sim.life[i] = sim.maxLife[i] = life * (0.6 + Math.random() * 0.6);
      sim.size[i] = sz * (0.5 + Math.random());
      sim.gravity[i] = gravity;
      sim.drag[i] = drag;
    };

    return onFx((e) => {
      if (e.kind === 'burst') {
        for (let n = 0; n < e.count; n++) {
          // 球面上隨機方向，往上多噴一點
          const u = Math.random() * 2 - 1;
          const a = Math.random() * Math.PI * 2;
          const r = Math.sqrt(1 - u * u);
          const sp = e.speed * (0.3 + Math.random() * 0.7);
          spawn(
            e.at,
            [r * Math.cos(a) * sp, Math.abs(u) * sp + (e.up ?? 1), r * Math.sin(a) * sp],
            e.colors[n % e.colors.length],
            e.life ?? 1.2,
            e.size ?? 0.22,
            e.gravity ?? 6,
            1.6,
          );
        }
      } else if (e.kind === 'confetti') {
        const colors = Object.values(COLOR_HEX);
        for (let n = 0; n < e.count; n++) {
          spawn(
            [(Math.random() - 0.5) * 14, 4 + Math.random() * 3, (Math.random() - 0.5) * 8 - 1],
            [(Math.random() - 0.5) * 2, -Math.random() * 2, (Math.random() - 0.5) * 2],
            colors[n % colors.length],
            4,
            0.28,
            1.2,
            0.6,
          );
        }
      }
    });
  }, [geo, sim]);

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.05);
    const pos = geo.attributes.position.array as Float32Array;
    const col = geo.attributes.color.array as Float32Array;
    const sz = geo.attributes.size.array as Float32Array;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (sim.life[i] <= 0) {
        sz[i] = 0;
        continue;
      }
      sim.life[i] -= dt;
      const t = Math.max(0, sim.life[i] / sim.maxLife[i]);
      const j = i * 3;
      const drag = Math.exp(-sim.drag[i] * dt);
      sim.vel[j] *= drag;
      sim.vel[j + 1] = sim.vel[j + 1] * drag - sim.gravity[i] * dt;
      sim.vel[j + 2] *= drag;
      pos[j] += sim.vel[j] * dt;
      pos[j + 1] += sim.vel[j + 1] * dt;
      pos[j + 2] += sim.vel[j + 2] * dt;
      // 碰到桌面彈一下
      if (pos[j + 1] < 0.02 && sim.vel[j + 1] < 0) {
        pos[j + 1] = 0.02;
        sim.vel[j + 1] *= -0.35;
      }
      col[j] = sim.base[j] * t;
      col[j + 1] = sim.base[j + 1] * t;
      col[j + 2] = sim.base[j + 2] * t;
      sz[i] = sim.size[i] * (0.4 + t * 0.6);
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
  });

  return <points geometry={geo} material={mat} frustumCulled={false} />;
}

const RING_POOL = 12;

/** 桌面上擴散的衝擊波 */
export function Shockwaves() {
  const rings = useMemo(
    () =>
      Array.from({ length: RING_POOL }, () => ({
        mat: new THREE.MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
          side: THREE.DoubleSide,
        }),
        age: 1,
        life: 1,
        size: 1,
        ref: { current: null as THREE.Mesh | null },
      })),
    [],
  );
  const geo = useMemo(() => new THREE.RingGeometry(0.85, 1, 96).rotateX(-Math.PI / 2), []);
  const next = useRef(0);

  useEffect(
    () =>
      onFx((e) => {
        if (e.kind !== 'ring') return;
        const r = rings[next.current];
        next.current = (next.current + 1) % RING_POOL;
        r.age = 0;
        r.life = e.life ?? 0.7;
        r.size = e.size;
        r.mat.color.set(e.color).multiplyScalar(3);
        r.ref.current?.position.set(...e.at);
      }),
    [rings],
  );

  useFrame((_, dt) => {
    for (const r of rings) {
      const m = r.ref.current;
      if (!m) continue;
      r.age += dt;
      const t = Math.min(1, r.age / r.life);
      const eased = 1 - Math.pow(1 - t, 3);
      m.scale.setScalar(t < 1 ? 0.1 + eased * r.size : 0.001);
      r.mat.opacity = (1 - t) * 0.9;
    }
  });

  return (
    <>
      {rings.map((r, i) => (
        <mesh
          key={i}
          geometry={geo}
          material={r.mat}
          scale={0.001}
          ref={(m) => {
            r.ref.current = m;
          }}
        />
      ))}
    </>
  );
}

/**
 * 鏡頭：依螢幕比例自動拉遠，處理晃動和「大風吹」轉一圈。
 * rig.base 是沒有晃動的位置，手牌跟著它。
 */
export function CameraRig({ aberration }: { aberration?: { current: { offset: THREE.Vector2 } | null } }) {
  const camera = useThree((s) => s.camera);
  const trauma = useRef(0);
  const chroma = useRef(0);
  const spin = useRef(-1);
  const look = useMemo(() => new THREE.Vector3(), []);

  useEffect(
    () =>
      onFx((e) => {
        if (e.kind === 'shake') trauma.current = Math.min(1.2, trauma.current + e.amount);
        else if (e.kind === 'spin') spin.current = 0;
        else if (e.kind === 'aberration') chroma.current = Math.min(1.5, chroma.current + e.amount);
      }),
    [],
  );

  useFrame((st, dt) => {
    const aspect = st.size.width / st.size.height;
    // 直的螢幕要拉遠、拉高才看得到整張桌子
    const f = THREE.MathUtils.clamp(1.55 / aspect, 1, 2.1);
    const dist = 11 * f;
    const elev = THREE.MathUtils.degToRad(aspect < 1 ? 62 : 52);
    const base = rig.base;
    let angle = 0;
    if (spin.current >= 0) {
      spin.current += dt / 1.8;
      const t = Math.min(1, spin.current);
      angle = (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) * Math.PI * 2;
      if (t >= 1) spin.current = -1;
    }
    // 直的螢幕把桌子往上推，下面留給手牌
    const lookZ = aspect < 1 ? 2.6 : 1.1;
    base.position.set(Math.sin(angle) * Math.cos(elev) * dist, Math.sin(elev) * dist, lookZ + Math.cos(angle) * Math.cos(elev) * dist);
    look.set(0, 0, lookZ);
    base.lookAt(look);
    base.updateMatrixWorld();

    camera.position.copy(base.position);
    camera.quaternion.copy(base.quaternion);
    const s = trauma.current * trauma.current;
    if (s > 0) {
      const t = st.clock.elapsedTime;
      camera.position.x += Math.sin(t * 47) * s * 0.35;
      camera.position.y += Math.sin(t * 53 + 1) * s * 0.25;
      camera.rotateZ(Math.sin(t * 31 + 2) * s * 0.04);
    }
    trauma.current = Math.max(0, trauma.current - dt * 1.4);

    chroma.current = Math.max(0, chroma.current - dt * 1.5);
    const ab = aberration?.current;
    if (ab) ab.offset.set(chroma.current * 0.012, chroma.current * 0.006);
  });

  return null;
}
