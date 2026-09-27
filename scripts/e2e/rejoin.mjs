/**
 * 斷線代打 + 重新加入：遊戲中手機玩家離開頁面 → 機器人幫他打 → 同一個分頁再開回來 → 拿回原本的座位繼續打完。
 * 要先開著 npm run dev。  node scripts/e2e/rejoin.mjs
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

const room = `rejoin-${Date.now()}`;
const url = (name) => `${BASE}/?room=${room}&name=${encodeURIComponent(name)}`;
const shot = (page, name) => page.shot(join(OUT, `rejoin-${name}.png`));
const ok = (cond, msg) => {
  console.log(`${cond ? '✅' : '❌'} ${msg}`);
  if (!cond) failures++;
};
let failures = 0;

const edge = await launch();
const pages = [];
let bots;
try {
  const host = await edge.newPage({ width: 1280, height: 800, label: 'host' });
  const phone = await edge.newPage({ width: 390, height: 844, mobile: true, label: 'phone' });
  pages.push(host, phone);
  await host.goto(url('房主'));
  await host.waitFor(`!!document.querySelector('.lobby')`, 60000);
  await phone.goto(url('手機仔'));
  await phone.waitFor(`!!document.querySelector('.lobby')`, 60000);
  bots = spawn(process.execPath, [join(ROOT, 'node_modules/tsx/dist/cli.mjs'), 'scripts/bots.mts', '1', room], {
    cwd: ROOT,
    env: { ...process.env, DELAY: '600' },
    stdio: 'ignore',
  });
  await host.waitFor(`document.querySelectorAll('.seats li:not(.empty-seat)').length === 3`);
  // 不限時，只測機器人代打
  await host.eval(`(() => { const b = document.querySelectorAll('.stepper')[2].querySelector('.step-btn'); for (let i = 0; i < 8; i++) b.click(); })()`);
  await host.waitFor(`!!document.querySelectorAll('.stepper')[2].querySelector('.stepper-value svg')`, 8000);
  await host.click('.start-btn');
  await host.waitFor(`!!window.__uno?.view.game`, 30000);
  await phone.waitFor(`!!window.__uno?.view.game`, 30000);

  const before = await phone.eval(`(() => { const v = window.__uno.view; return { you: v.you, hand: v.game.hand.map(c => c.id).sort() }; })()`);

  // ---- 手機離開頁面（連線直接斷掉，跟關掉 Discord 視窗一樣）----
  await phone.goto('about:blank');
  await host.waitFor(`window.__uno.view.seats.find(s => s.id === ${JSON.stringify(before.you)})?.connected === false`, 15000);
  ok(true, '房主看到手機仔離線了');

  // 房主照常打，等輪到手機仔、再等機器人幫他打完換人
  const phoneName = '手機仔';
  const phoneTurn = () => host.eval(`window.__uno.view.game.turnId === ${JSON.stringify(before.you)}`);
  let sawTurn = false;
  await drive([host], async () => sawTurn && !(await phoneTurn()), 60000, async () => {
    if (!sawTurn && (await phoneTurn())) {
      sawTurn = true;
      await sleep(600);
      await shot(host, 'bot-turn');
    }
  });
  const lines = await host.eval(`window.__uno.view.game.log.slice(-6)`);
  ok(
    lines.some((l) => l.startsWith(phoneName)),
    `機器人幫手機仔打了：${lines.filter((l) => l.startsWith(phoneName)).join('、')}`,
  );
  await shot(host, 'offline');

  // ---- 同一個分頁開回來 ----
  await phone.goto(url('手機仔'));
  await phone.waitFor(`!!window.__uno?.view.game`, 60000);
  const after = await phone.eval(`(() => { const v = window.__uno.view; return { you: v.you, hand: (v.game.hand ?? []).length, ended: v.game.phase === 'ended' }; })()`);
  ok(after.you === before.you, `拿回同一個座位（${before.you} → ${after.you}）`);
  ok(after.hand > 0 || after.ended, `手上有 ${after.hand} 張牌，不是觀戰`);
  await host.waitFor(`window.__uno.view.seats.find(s => s.id === ${JSON.stringify(before.you)})?.connected === true`, 10000);
  ok(true, '房主看到手機仔回來了');
  await sleep(1500);
  await shot(phone, 'back');

  // ---- 兩個人一起打完 ----
  const ended = await drive([host, phone], () => host.eval(`window.__uno.view.game.phase === 'ended'`), 180000);
  ok(ended, '回來之後可以繼續打到結束');
  await shot(host, 'end');
} catch (e) {
  failures++;
  console.log('FAILED:', e.stack ?? e.message);
  for (const [i, p] of pages.entries()) await p.shot(join(OUT, `rejoin-fail-${i}.png`)).catch(() => {});
} finally {
  const logs = pages.flatMap((p) => p.logs).filter((l) => !/\[vite\]|React DevTools|THREE\.Clock/.test(l));
  console.log(`--- 瀏覽器 console（${logs.length}）---`);
  console.log([...new Set(logs)].slice(0, 30).join('\n'));
  console.log(failures ? `❌ ${failures} 項失敗` : '✅ 全部通過', `截圖：${OUT}`);
  bots?.kill();
  edge.close();
  setTimeout(() => process.exit(failures ? 1 : 0), 2000);
}

/** 讓這幾個頁面自己打牌，直到 done() 成立或超時 */
async function drive(list, done, timeout, onTick) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await done()) return true;
    await onTick?.();
    for (const page of list) {
      const s = await page.eval(`(() => {
        const v = window.__uno?.view, g = v?.game;
        if (!g || g.phase !== 'playing' || g.turnId !== v.you) return null;
        const hand = g.hand ?? [];
        const wild = ['wild', 'wild4', 'draw99', 'dice', 'swapAll'];
        const card = hand.find(c => g.playable.includes(c.id));
        return { card: card && { id: card.id, wild: wild.includes(card.kind) }, hasDrawn: g.hasDrawn, uno: hand.length <= 2 };
      })()`);
      if (!s) continue;
      if (s.uno) await page.eval(`window.__uno.send('uno')`);
      if (s.card) await page.eval(`window.__uno.send('play', ${JSON.stringify(s.card.wild ? { cardId: s.card.id, color: 'red' } : { cardId: s.card.id })})`);
      else await page.eval(`window.__uno.send(${JSON.stringify(s.hasDrawn ? 'pass' : 'draw')})`);
      await sleep(400);
    }
    await sleep(300);
  }
  return false;
}
