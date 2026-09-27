import type { GameView } from '@crazyuno/shared';
import * as THREE from 'three';
import { CARD_H, CARD_W } from './cardArt';

/** 出掉的牌疊在桌子正中間（抽牌堆在畫面左上角，跟著鏡頭，見 deckSlot） */
export const DISCARD = new THREE.Vector3(0, 0, 0.3);
/** 自己沒有座位模型，特效從鏡頭前面這裡出來 */
export const MY_SEAT = new THREE.Vector3(0, 0.6, 3.8);

export const TABLE_RX = 6.8;
export const TABLE_RZ = 4.6;

/** 手牌離鏡頭多遠 */
export const HAND_DIST = 3;
/** 抽牌堆離鏡頭多遠（比手牌遠一點，重疊時手牌在前面） */
export const DECK_DIST = HAND_DIST + 0.4;
export const FOV = 45;
/** 抽牌堆微微轉一個角度，看得到牌疊的厚度 */
export const DECK_TILT = new THREE.Euler(-0.22, -0.38, 0.06);

/**
 * 沒有被鏡頭晃動影響的「理想鏡頭」位置，手牌跟著它擺。
 * 由 CameraRig 每一格更新。用 Camera 而不是 Object3D，lookAt 才會用 -z 對準目標。
 */
export const rig = { base: new THREE.PerspectiveCamera(), ready: false };

/** 依螢幕比例擺鏡頭；angle 是繞桌子轉的角度（大風吹） */
export function placeRig(aspect: number, angle = 0) {
  // 直的螢幕要拉遠、拉高才看得到整張桌子
  const f = THREE.MathUtils.clamp(1.55 / aspect, 1, 2.1);
  const dist = 11 * f;
  const elev = THREE.MathUtils.degToRad(aspect < 1 ? 62 : 52);
  // 直的螢幕把桌子往上推，下面留給手牌
  const lookZ = aspect < 1 ? 2.2 : 1.1;
  const base = rig.base;
  base.position.set(Math.sin(angle) * Math.cos(elev) * dist, Math.sin(elev) * dist, lookZ + Math.cos(angle) * Math.cos(elev) * dist);
  base.lookAt(0, 0, lookZ);
  base.updateMatrixWorld();
  rig.ready = true;
}

/** 在離鏡頭 dist 的地方，一張牌要放大幾倍：牌高大約畫面的 22%，窄螢幕至少要並排放得下 4 張 */
function cardScale(dist: number, aspect: number) {
  const halfH = dist * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  return Math.min((halfH * 2 * 0.22) / CARD_H, (halfH * aspect * 2) / 4.2 / CARD_W);
}

/** 抽牌堆在鏡頭座標裡的位置：畫面左上角 */
export function deckSlot(aspect: number, heightPx: number) {
  const halfH = DECK_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const halfW = halfH * aspect;
  const px = (halfH * 2) / heightPx;
  const scale = cardScale(DECK_DIST, aspect) * 0.7;
  const w = CARD_W * scale;
  const h = CARD_H * scale;
  return { pos: new THREE.Vector3(-halfW + 20 * px + w * 0.55, halfH - 18 * px - h * 0.5, -DECK_DIST), scale };
}

/** 抽牌堆最上面那張在世界座標的位置，牌背朝鏡頭（新抽的牌從這裡飛出來） */
export function deckWorldPose(aspect: number, heightPx: number) {
  const slot = deckSlot(aspect, heightPx);
  const tilt = new THREE.Euler(DECK_TILT.x, DECK_TILT.y + Math.PI, -DECK_TILT.z);
  return {
    pos: slot.pos.applyMatrix4(rig.base.matrixWorld),
    quat: rig.base.quaternion.clone().multiply(new THREE.Quaternion().setFromEuler(tilt)),
    scale: slot.scale,
  };
}

/** 對手照座位順序，從自己的下一位開始排，排在桌子遠端的半圓上（左 → 右） */
export function seatMap(game: GameView, you: string, aspect: number): Map<string, THREE.Vector3> {
  const myIndex = game.players.findIndex((p) => p.id === you);
  const opponents =
    myIndex === -1 ? game.players : [...game.players.slice(myIndex + 1), ...game.players.slice(0, myIndex)];
  const map = new Map<string, THREE.Vector3>();
  const n = opponents.length;
  const margin = n <= 2 ? 0.55 : 0.25;
  // 直的螢幕左右放不下，座位往中間縮、往後推
  const rx = aspect < 1 ? 2.2 + aspect * 1.6 : 5.1;
  const rz = aspect < 1 ? 3.6 : 3.3;
  opponents.forEach((p, i) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const a = Math.PI + margin + t * (Math.PI - margin * 2);
    map.set(p.id, new THREE.Vector3(Math.cos(a) * rx, 0, Math.sin(a) * rz));
  });
  if (myIndex !== -1) map.set(you, MY_SEAT.clone());
  return map;
}

export interface Slot {
  x: number;
  y: number;
  z: number;
  /** 扇形的旋轉角度 */
  rz: number;
  scale: number;
}

/**
 * 手牌在鏡頭座標裡的位置（鏡頭看向 -z）。
 * 牌太多就疊得更密，再多就分成好幾排。
 */
export function handSlots(n: number, aspect: number, bottomPadPx: number, heightPx: number): Slot[] {
  const halfH = HAND_DIST * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
  const halfW = halfH * aspect;
  const pxToWorld = (halfH * 2) / heightPx;

  const scale = cardScale(HAND_DIST, aspect);
  const cw = CARD_W * scale;
  const ch = CARD_H * scale;
  const usable = Math.min(halfW * 2 - 0.1, cw * 12);
  // 每張牌至少要露出這麼多才點得到
  const minStep = cw * 0.36;
  const perRow = Math.max(1, Math.floor((usable - cw) / minStep) + 1);
  const rows = Math.min(5, Math.ceil(n / perRow));
  const inRow = Math.ceil(n / rows);
  const baseY = -halfH + bottomPadPx * pxToWorld + ch * 0.5;

  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    // 最後一排（最靠近鏡頭、畫面最下面）放在陣列的後段
    const row = rows - 1 - Math.floor(i / inRow);
    const k = i % inRow;
    const count = Math.min(inRow, n - Math.floor(i / inRow) * inRow);
    const step = count > 1 ? Math.min(cw * 1.02, (usable - cw) / (count - 1)) : 0;
    const x = (k - (count - 1) / 2) * step;
    const u = halfW > 0 ? x / halfW : 0;
    slots.push({
      x,
      y: baseY + row * ch * 0.42 - u * u * 0.06,
      z: -HAND_DIST - row * 0.12 + k * 0.002,
      rz: -u * 0.08,
      scale,
    });
  }
  return slots;
}
