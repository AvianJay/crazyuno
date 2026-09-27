/**
 * 自動打一整局：桌機房主 + 手機玩家 + 1 個機器人，全部怪牌打開。
 * 途中截圖、檢查瀏覽器 console 有沒有錯誤，並用真的滑鼠點一次 3D 手牌。
 * 要先開著 npm run dev。
 *
 *   node scripts/e2e/play.mjs          打一整局
 *   node scripts/e2e/play.mjs fx       開局後先放一輪特效再打
 *   QUICK=1 node scripts/e2e/play.mjs  只截開局畫面
 *   HQ=1 …                             網址加 ?hq，軟體算圖也不關後製特效
 *
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

const room = `e2e-${Date.now()}`;
const url = (name) => `${BASE}/?room=${room}&name=${encodeURIComponent(name)}${process.env.HQ ? '&hq' : ''}`;
const shot = (page, name) => page.shot(join(OUT, `${name}.png`));
const withFx = process.argv[2] === 'fx';

const edge = await launch();
const pages = [];
let bots;
let botOut = '';
try {
  const host = await edge.newPage({ width: 1280, height: 800, label: 'host' });
  const phone = await edge.newPage({ width: 390, height: 844, mobile: true, label: 'phone' });
  pages.push(host, phone);
  await host.goto(url('房主'));
  await sleep(400);
  await shot(host, 'loading');
  await host.waitFor(`!!document.querySelector('.lobby')`, 60000);
  await phone.goto(url('手機仔'));
  await phone.waitFor(`!!document.querySelector('.lobby')`, 60000);

  bots = spawn(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'scripts/bots.mts', '1', room], {
    cwd: ROOT,
    env: { ...process.env, DELAY: '900' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  bots.stdout.on('data', (d) => (botOut += d));
  bots.stderr.on('data', (d) => (botOut += d));
  await host.waitFor(`document.querySelectorAll('.seats li:not(.empty-seat)').length === 3`);
  await sleep(1200);
  await shot(host, 'lobby-default');

  // 把全部怪牌打開
  await host.eval(`[...document.querySelectorAll('.crazy-card:not(.on)')].forEach(b => b.click())`);
  // 不限時（軟體算圖很慢，不然一直時間到）；連點 8 下「−」，順便測連點不會被舊畫面蓋掉
  await host.eval(`(() => { const b = document.querySelectorAll('.stepper')[2].querySelector('.step-btn'); for (let i = 0; i < 8; i++) b.click(); })()`);
  await host.waitFor(`!!document.querySelectorAll('.stepper')[2].querySelector('.stepper-value svg')`, 8000);
  await host.waitFor(`document.querySelectorAll('.crazy-card.on').length === 5`, 8000);
  await sleep(1200);
  await shot(host, 'lobby');
  await shot(phone, 'lobby-mobile');
  await host.click('.start-btn');
  await host.waitFor(`!!document.querySelector('.table3d canvas') && !!window.__uno`, 30000);
  await phone.waitFor(`!!document.querySelector('.table3d canvas') && !!window.__uno`, 30000);
  await sleep(300);
  await shot(host, 'deal');
  // 軟體算圖第一格要等比較久
  await sleep(5000);
  await shot(host, 'table');
  await shot(phone, 'table-mobile');

  if (withFx) {
    for (const [name, ev] of [
      ['fx-99', `[{kind:'flash',color:'#ff0000',strength:0.8},{kind:'text',text:'+99',tone:'danger'},{kind:'shake',amount:1},{kind:'aberration',amount:1},{kind:'ring',at:[1.1,0.1,0.3],color:'#ff2020',size:6,life:1.4},{kind:'burst',at:[1.1,0.1,0.3],colors:['#ffdd55','#ff8a00','#ff3b1f','#ffffff'],count:600,speed:9,up:4,size:0.35,life:2}]`],
      ['fx-uno', `[{kind:'text',text:'UNO!',tone:'uno'},{kind:'burst',at:[0,1.2,-3],colors:['#ffc400','#ff3b3f','#ffffff'],count:160,speed:4,up:2}]`],
      ['fx-win', `[{kind:'confetti',count:900},{kind:'text',text:'🎉 你贏了！',tone:'gold'}]`],
      ['fx-spin', `[{kind:'spin'},{kind:'text',text:'🌀 大風吹！',tone:'gold'}]`],
    ]) {
      await host.eval(`${ev}.forEach(e => window.__uno.emitFx(e))`);
      // 等大字真的出現再拍
      await host.waitFor(`document.querySelectorAll('.slam').length > 0`, 5000).catch(() => console.log(name, '：大字沒出現'));
      await sleep(name === 'fx-spin' ? 700 : 100);
      await shot(host, name);
      await sleep(1800);
    }
  }
  if (process.env.QUICK) {
    console.log('QUICK：只截開局畫面');
  } else {
    await playGame(host, phone);
  }
} catch (e) {
  console.log('FAILED:', e.stack ?? e.message);
  for (const [i, p] of pages.entries()) await p.shot(join(OUT, `fail-${i}.png`)).catch(() => {});
} finally {
  const logs = pages.flatMap((p) => p.logs).filter((l) => !/\[vite\]|React DevTools|THREE\.Clock/.test(l));
  console.log(`--- 瀏覽器 console（${logs.length}）---`);
  console.log([...new Set(logs)].slice(0, 40).join('\n'));
  console.log('--- 機器人最後幾行 ---');
  console.log(botOut.split('\n').slice(-6).join('\n'));
  console.log(`截圖：${OUT}`);
  bots?.kill();
  edge.close();
  setTimeout(() => process.exit(0), 2000);
}

async function playGame(host, phone) {
  const state = (page) =>
    page.eval(`(() => {
      const v = window.__uno.view, g = v.game;
      if (!g) return { lobby: true };
      return {
        ended: g.phase === 'ended',
        myTurn: g.phase === 'playing' && g.turnId === v.you,
        playable: g.playable,
        hand: (g.hand ?? []).map(c => ({ id: c.id, wild: ['wild','wild4','draw99','dice','swapAll'].includes(c.kind) })),
        hasDrawn: g.hasDrawn,
        pending: g.pendingDraw,
        unoSafe: g.players.find(p => p.id === v.you)?.unoSafe,
        out: g.players.find(p => p.id === v.you)?.out,
        catchBtn: !!document.querySelector('.catch-btn'),
        toast: document.querySelector('.toast')?.innerText ?? null,
      };
    })()`);

  // 真的用滑鼠點 3D 手牌：沿著手牌那一排從左掃到右，直到出了一張牌或跳出選色
  const tryRealClick = async (page, width, height) => {
    const before = await state(page);
    for (let x = width * 0.2; x < width * 0.8; x += 14) {
      for (const y of [height - 150, height - 190]) {
        await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
        await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
        await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
        await sleep(60);
        if (await page.eval(`!!window.__uno && document.querySelector('.diamond-picker.open') !== null`).catch(() => false)) {
          await sleep(1500);
          await shot(page, 'picker');
          await page.eval(`document.querySelector('.diamond-picker.open .diamond').click()`);
          return `點到萬用牌 (${x}, ${y})，選了顏色`;
        }
        const s = await state(page);
        if (s.hand.length < before.hand.length || !s.myTurn) return `點到牌出掉了 (${x}, ${y})`;
      }
    }
    return '沒點到任何牌';
  };

  const seen = new Set();
  const once = async (key, fn) => {
    if (!seen.has(key)) {
      seen.add(key);
      await fn();
    }
  };
  // 萬用牌：跟點牌一樣走 play()，確認牌先飛到中間、四個菱形出現，再真的用滑鼠點一個顏色
  const tryWild = async (page, cardId) => {
    await page.eval(`window.__uno.play(window.__uno.view.game.hand.find(c => c.id === ${JSON.stringify(cardId)}))`);
    await page.waitFor(`!!document.querySelector('.diamond-picker.open')`, 8000);
    await sleep(1500);
    await shot(page, 'picker');
    const r = await page.eval(`(() => { const b = document.querySelector('.diamond-picker.open .diamond').getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; })()`);
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await page.send('Input.dispatchMouseEvent', { type, x: r.x, y: r.y, button: 'left', clickCount: 1 });
    }
    await page.waitFor(`!window.__uno.view.game.hand.some(c => c.id === ${JSON.stringify(cardId)})`, 8000);
    await sleep(900);
    await shot(page, 'picked');
    return '萬用牌：先飛到中間，點菱形選了顏色，牌出掉了';
  };

  const toasts = new Set();
  let realClickDone = false;
  let wildDone = false;
  let moves = 0;
  let ended = false;
  const deadline = Date.now() + 200_000;
  while (!ended && Date.now() < deadline) {
    for (const [page, name, w, h] of [
      [host, 'host', 1280, 800],
      [phone, 'phone', 390, 844],
    ]) {
      const s = await state(page);
      if (s.lobby) continue;
      if (s.toast) toasts.add(`${name}: ${s.toast}`);
      if (s.ended) {
        ended = true;
        await sleep(600);
        await shot(host, 'end-fx');
        await page.waitFor(`!!document.querySelector('.result')`, 6000).catch(() => {});
        await shot(host, 'result');
        await shot(phone, 'result-mobile');
        break;
      }
      if (s.pending > 0) await once(`pending-${name}`, async () => { await sleep(500); await shot(page, `pending-${name}`); });
      if (s.hand.length >= 12) await once(`bighand-${name}`, async () => { await sleep(1200); await shot(page, `bighand-${name}`); });
      if (s.catchBtn) await once(`catch-${name}`, () => shot(page, `catch-${name}`));
      if (s.out || !s.myTurn) continue;

      if (s.hand.length <= 2 && !s.unoSafe) await page.eval(`window.__uno.send('uno')`);
      const wildCard = s.hand.find((c) => c.wild && s.playable.includes(c.id));
      if (!wildDone && wildCard) {
        wildDone = true;
        console.log(`${name}：`, await tryWild(page, wildCard.id));
      } else if (!realClickDone && name === 'host' && s.playable.length) {
        realClickDone = true;
        console.log('真的滑鼠點擊：', await tryRealClick(page, w, h));
      } else if (s.playable.length) {
        const card = s.hand.find((c) => c.id === s.playable[0]);
        await page.eval(`window.__uno.send('play', ${JSON.stringify(card.wild ? { cardId: card.id, color: 'red' } : { cardId: card.id })})`);
        await once(`play-${name}`, async () => { await sleep(260); await shot(page, `flying-${name}`); });
      } else if (!s.hasDrawn) {
        await page.eval(`window.__uno.send('draw')`);
      } else {
        await page.eval(`window.__uno.send('pass')`);
      }
      moves++;
      await sleep(700);
    }
    await sleep(250);
  }
  console.log(`打完了嗎：${ended}，動作數：${moves}`);
  console.log('伺服器錯誤訊息：', [...toasts]);
}
