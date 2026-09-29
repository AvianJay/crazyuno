/**
 * 畫面有沒有「一屏放得下」、手牌選不選得準：
 *
 *   GPU=1 node scripts/e2e/layout.mjs
 *
 * 驗證：
 *   1. 大廳在各種尺寸（桌機、Discord 小視窗、iPad、手機直放橫放）都沒有捲軸、沒有東西跑出畫面
 *   2. 對手名牌整塊在畫面裡，也沒有被上方「輪到誰」膠囊蓋住（正對面的人在橫的螢幕上最容易）
 *   3. 滑鼠橫掃手牌：每張牌只會被滑到一段，不會浮起來又掉下去一直閃；停在牌的下緣抖動也不會閃
 *   4. 手機：點到「不能出、但蓋在能出的牌前面」的牌，不會點穿去出到後面那張；能出的牌照樣點得到
 *
 * 要先開著 npm run dev。第 3 項要即時的滑鼠反應，軟體算圖太慢，請用 GPU=1。
 * 截圖存在系統暫存資料夾的 crazyuno-e2e/ 裡。
 */
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const OUT = join(tmpdir(), 'crazyuno-e2e');
mkdirSync(OUT, { recursive: true });
const stamp = Date.now();

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** 在頁面裡讀 R3F 的狀態（開發模式才載得到）：滑鼠現在滑到哪個物件、每張手牌的判定範圍 */
const PROBE = `(() => {
  const state = async () => {
    if (!window.__r3f) {
      const u = performance.getEntriesByType('resource').map((e) => e.name).find((n) => n.includes('@react-three_fiber.js'));
      window.__r3f = await import(u);
    }
    return window.__r3f._roots.get(document.querySelector('.table3d canvas')).store.getState();
  };
  window.__hovered = async () => [...(await state()).internal.hovered.values()].map((h) => h.eventObject.uuid)[0] ?? '-';
  // 手牌的隱形判定板：螢幕上的四個角、離鏡頭多近（越大越前面）、能不能出（能出的牌面不會變暗）
  window.__hand = async () => {
    const st = await state();
    const V = st.camera.position.constructor;
    const out = [];
    st.scene.children.forEach((o, i) => {
      if (!o.isMesh || o.visible || !st.internal.interaction.includes(o)) return;
      const quad = [[-0.5, -0.75], [0.5, -0.75], [0.5, 0.75], [-0.5, 0.75]].map(([x, y]) => {
        const v = new V(x, y, 0).applyMatrix4(o.matrixWorld).project(st.camera);
        return [((v.x + 1) / 2) * st.size.width, ((1 - v.y) / 2) * st.size.height];
      });
      const depth = new V().setFromMatrixPosition(o.matrixWorld).applyMatrix4(st.camera.matrixWorldInverse).z;
      out.push({ id: o.uuid, playable: st.scene.children[i - 1].children[1].material.color.r > 0.9, quad, depth });
    });
    return out;
  };
})()`;

const inQuad = (q, [x, y]) => {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = q[i];
    const [bx, by] = q[(i + 1) % 4];
    const c = Math.sign((bx - ax) * (y - ay) - (by - ay) * (x - ax));
    if (c && sign && c !== sign) return false;
    sign ||= c;
  }
  return true;
};

/** 螢幕上 (x, y) 點下去會點到哪張牌：包含這點的判定板裡最前面那張 */
const cardAt = (hand, pt) => hand.filter((c) => inQuad(c.quad, pt)).sort((a, b) => b.depth - a.depth);

const edge = await launch();
const pages = [];
let bots;
try {
  // ---------- 1. 大廳 ----------
  console.log('\n=== 1. 大廳一個畫面放得下 ===');
  const SIZES = [
    ['桌機 1280×720', 1280, 720, false],
    ['大螢幕 1920×1080', 1920, 1080, false],
    ['Discord 小視窗 800×450', 800, 450, false],
    ['Discord 子母畫面 640×360', 640, 360, false],
    ['方視窗 800×800', 800, 800, false],
    ['iPad 橫 1180×820', 1180, 820, true],
    ['iPad 直 820×1180', 820, 1180, true],
    ['手機 390×844', 390, 844, true],
    ['小手機 360×640', 360, 640, true],
    ['手機橫 844×390', 844, 390, true],
  ];
  const lobbyRoom = `layout-lobby-${stamp}`;
  for (const [name, width, height, mobile] of SIZES) {
    const p = await edge.newPage({ width, height, mobile, label: name });
    pages.push(p);
    await p.goto(`${BASE}/?room=${lobbyRoom}&name=${encodeURIComponent(name)}`);
    await p.waitFor(`!!document.querySelector('.lobby')`, 60000);
  }
  // 最後一個人進來之後座位面板最滿（十個人），等進場動畫放完再量
  await sleep(2500);
  for (const [i, [name]] of SIZES.entries()) {
    const p = pages[i];
    const m = await p.eval(`(() => {
      const scrollers = [...document.querySelectorAll('*')].filter((e) => {
        const s = getComputedStyle(e);
        return (e.scrollHeight > e.clientHeight + 1 && /(auto|scroll)/.test(s.overflowY)) || (e.scrollWidth > e.clientWidth + 1 && /(auto|scroll)/.test(s.overflowX));
      }).map((e) => e.className || e.tagName);
      const off = [...document.querySelectorAll('.lobby button, .lobby .panel, .lobby .title, .lobby .waiting')].filter((e) => {
        const b = e.getBoundingClientRect();
        return b.width && (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1);
      }).map((e) => e.className);
      return { scrollers, off, fit: getComputedStyle(document.querySelector('.fit-inner')).getPropertyValue('--fit') };
    })()`);
    check(`${name}：沒有捲軸、沒有東西跑出畫面`, !m.scrollers.length && !m.off.length, `縮放 ${Number(m.fit).toFixed(2)} 倍${m.scrollers.length ? `，捲軸：${m.scrollers}` : ''}${m.off.length ? `，超出：${m.off}` : ''}`);
    if (i === 0 || name.startsWith('手機 ')) await p.shot(join(OUT, `layout-lobby-${i}.png`));
  }
  for (const p of pages.splice(0)) await p.send('Page.close').catch(() => {});

  // ---------- 開一局：桌機房主 + 直手機 + 橫手機 + 1 機器人，起始 20 張（手機才會好幾排互相蓋住）----------
  const room = `layout-${stamp}`;
  const host = await edge.newPage({ width: 1280, height: 720, label: 'host' });
  const phone = await edge.newPage({ width: 390, height: 844, mobile: true, label: 'phone' });
  const land = await edge.newPage({ width: 844, height: 390, mobile: true, label: 'land' });
  pages.push(host, phone, land);
  for (const [p, name] of [
    [host, '房主'],
    [phone, '直手機'],
    [land, '橫手機'],
  ]) {
    await p.goto(`${BASE}/?room=${room}&name=${encodeURIComponent(name)}`);
    await p.waitFor(`!!document.querySelector('.lobby')`, 60000);
  }
  bots = spawn(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'scripts/bots.mts', '1', room], {
    cwd: ROOT,
    env: { ...process.env, DELAY: '500' },
    stdio: 'ignore',
  });
  await host.waitFor(`document.querySelectorAll('.seats li:not(.empty-seat)').length === 4`, 20000);
  await host.eval(`(() => { const b = document.querySelectorAll('.stepper')[2].querySelector('.step-btn'); for (let i = 0; i < 8; i++) b.click(); })()`);
  await host.eval(`(() => { const b = document.querySelectorAll('.stepper')[0].querySelectorAll('.step-btn')[1]; for (let i = 0; i < 13; i++) b.click(); })()`);
  await host.waitFor(`document.querySelectorAll('.stepper')[0].innerText.includes('20')`, 8000);
  await host.click('.start-btn');
  for (const p of pages) {
    await p.waitFor(`!!document.querySelector('.table3d canvas') && !!window.__uno`, 30000);
    await p.eval(PROBE);
  }
  // 發 20 張牌的動畫
  await sleep(process.env.GPU === '1' ? 4500 : 15000);

  // ---------- 2. 對手名牌 ----------
  console.log('\n=== 2. 對手名牌不會跑出畫面、不會被蓋住 ===');
  for (const [p, name] of [
    [host, '桌機'],
    [phone, '直手機'],
    [land, '橫手機'],
  ]) {
    // 名牌本身不接滑鼠（pointer-events: none），elementFromPoint 會穿過去，所以直接比方框有沒有重疊
    const labels = await p.eval(`(() => {
      const hud = [...document.querySelectorAll('.turn-pill, .game-clock, .hud-right')].map((e) => [e.classList[0], e.getBoundingClientRect()]);
      const box = document.querySelector('.table3d').getBoundingClientRect();
      return [...document.querySelectorAll('.seat3d')].map((s) => {
        const r = s.getBoundingClientRect();
        const over = hud.filter(([, h]) => r.left < h.right && r.right > h.left && r.top < h.bottom && r.bottom > h.top).map(([n]) => n);
        return { name: s.querySelector('.seat-name').innerText, inside: r.left >= box.left - 1 && r.top >= box.top - 1 && r.right <= box.right + 1 && r.bottom <= box.bottom + 1, covered: over.join('/') || null };
      });
    })()`);
    const bad = labels.filter((l) => !l.inside || l.covered);
    check(`${name}：${labels.length} 個名牌都完整看得到`, !bad.length, bad.map((l) => `${l.name}${l.inside ? '' : ' 超出畫面'}${l.covered ? ` 被 ${l.covered} 蓋住` : ''}`).join('、'));
    await p.shot(join(OUT, `layout-table-${name}.png`));
  }

  const state = (p) =>
    p.eval(`(() => { const v = window.__uno.view, g = v.game; return { phase: g.phase, myTurn: g.phase === 'playing' && g.turnId === v.you, playable: g.playable, hand: (g.hand ?? []).length, hasDrawn: g.hasDrawn }; })()`);
  const autoPlay = async (p) => {
    const s = await state(p);
    if (!s.myTurn) return;
    if (s.playable.length)
      await p.eval(`window.__uno.send('play', { cardId: ${JSON.stringify(s.playable[0])}, color: 'red', targetId: window.__uno.view.game.players.find((q) => q.id !== window.__uno.view.you && !q.out)?.id })`);
    else if (!s.hasDrawn) await p.eval(`window.__uno.send('draw')`);
    else await p.eval(`window.__uno.send('pass')`);
  };
  /** 等到 page 輪到、而且手上同時有能出和不能出的牌（別的真人頁面自動出牌） */
  const waitTurn = async (page) => {
    for (let i = 0; i < 300; i++) {
      const s = await state(page);
      if (s.phase !== 'playing') throw new Error('這局已經打完了');
      if (s.myTurn && s.playable.length && s.playable.length < s.hand) return;
      for (const p of pages) if (p !== page || s.myTurn) await autoPlay(p);
      await sleep(400);
    }
    throw new Error('一直沒有輪到');
  };

  // ---------- 3. 滑鼠 hover ----------
  console.log('\n=== 3. 滑鼠滑過手牌不會閃 ===');
  await waitTurn(host);
  // 新抽的牌、手牌重新排好
  await sleep(1500);
  const move = (x, y) => host.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  const hand = await host.eval(`window.__hand()`);
  const ys = hand.flatMap((c) => c.quad.map((q) => q[1]));
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  let broken = 0;
  let swept = 0;
  for (const y of [bottom - 8, (top + bottom) / 2, top + 10]) {
    const seq = [];
    for (let x = 40; x <= 1240; x += 5) {
      await move(x, y);
      await sleep(34);
      seq.push(await host.eval(`window.__hovered()`));
    }
    const runs = {};
    seq.forEach((id, i) => {
      if (id !== '-' && seq[i - 1] !== id) runs[id] = (runs[id] ?? 0) + 1;
    });
    swept += Object.keys(runs).length;
    broken += Object.values(runs).filter((n) => n > 1).length;
  }
  check('橫掃三條線：每張牌只被滑到一段', swept > 0 && broken === 0, `滑到 ${swept} 次，其中 ${broken} 張斷掉又出現`);

  // 停在最前面那張能出的牌的下緣，來回抖 1px
  const pc = hand.filter((c) => c.playable).sort((a, b) => b.depth - a.depth)[0];
  const cx = pc.quad.reduce((s, q) => s + q[0], 0) / 4;
  const by = Math.max(...pc.quad.map((q) => q[1]));
  let toggles = 0;
  for (const dy of [2, 5, 9, 14]) {
    let last = null;
    await move(cx, by - dy);
    await sleep(200);
    for (let k = 0; k < 14; k++) {
      await move(cx + (k % 2), by - dy);
      await sleep(70);
      const h = await host.eval(`window.__hovered()`);
      if (last !== null && h !== last) toggles++;
      last = h;
    }
  }
  check('停在牌的下緣抖動：不會一直切換', toggles === 0, `切換 ${toggles} 次`);
  await move(cx, (top + bottom) / 2);
  await sleep(600);
  await host.shot(join(OUT, 'layout-hover.png'));
  await move(5, 5);
  await autoPlay(host);

  // ---------- 4. 手機點牌 ----------
  console.log('\n=== 4. 手機點不能出的牌不會點穿 ===');
  await waitTurn(phone);
  await sleep(1500);
  const tap = async (x, y) => {
    for (const type of ['touchStart', 'touchEnd']) await phone.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
    await sleep(1200);
  };
  const choosing = () => phone.eval(`!!document.querySelector('.diamond-picker.open') || !!document.querySelector('.swap-btn')`);
  const ph = await phone.eval(`window.__hand()`);
  let blocked = null;
  let open = null;
  for (let y = 300; y < 844; y += 3) {
    for (let x = 4; x < 386; x += 3) {
      const under = cardAt(ph, [x, y]);
      if (!under.length) continue;
      if (!blocked && !under[0].playable && under.slice(1).some((c) => c.playable)) blocked = [x, y];
      if (!open && under[0].playable) open = [x, y];
    }
  }
  if (!blocked) {
    console.log('（這手牌剛好沒有「不能出的牌蓋住能出的牌」，略過點穿測試）');
  } else {
    const before = await state(phone);
    await tap(...blocked);
    const after = await state(phone);
    check('點不能出的牌：什麼都沒出', after.hand === before.hand && after.myTurn && !(await choosing()), `手牌 ${before.hand} → ${after.hand}`);
  }
  if (open) {
    const before = await state(phone);
    await tap(...open);
    const after = await state(phone);
    check('點能出的牌：出得去（或跳出選顏色、選人）', after.hand < before.hand || !after.myTurn || (await choosing()));
    await phone.shot(join(OUT, 'layout-phone-tap.png'));
  }
} catch (e) {
  console.log('FAILED:', e.stack ?? e.message);
  failures++;
  for (const [i, p] of pages.entries()) await p.shot(join(OUT, `layout-fail-${i}.png`)).catch(() => {});
} finally {
  const logs = pages.flatMap((p) => p.logs).filter((l) => /EXCEPTION|error/i.test(l) && !/\[vite\]|React DevTools/.test(l));
  console.log(`\n--- 瀏覽器錯誤（${logs.length}）---`);
  console.log([...new Set(logs)].slice(0, 20).join('\n'));
  console.log(`\n${failures === 0 ? '✅ 全部通過' : `❌ ${failures} 項失敗`}`);
  console.log(`截圖：${OUT}`);
  bots?.kill();
  edge.close();
  setTimeout(() => process.exit(failures === 0 ? 0 : 1), 1500);
}
