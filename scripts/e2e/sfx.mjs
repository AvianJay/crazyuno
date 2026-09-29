/**
 * 在瀏覽器裡把每個音效都呼叫一次，確認不會丟錯（聽不到，只檢查程式）。
 * 要先開著 npm run dev。  node scripts/e2e/sfx.mjs
 */
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const edge = await launch();
const page = await edge.newPage({ width: 800, height: 600, label: 'sfx' });
try {
  await page.goto(`${BASE}/?room=sfx-${Date.now()}&name=sfx`);
  await page.waitFor(`!!document.querySelector('.lobby')`, 30000);
  // 瀏覽器要點過畫面才能出聲
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: 5, y: 5, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: 5, y: 5, button: 'left', clickCount: 1 });
  const result = await page.eval(`(async () => {
    const sfx = await import('/src/sfx.ts');
    sfx.unlockAudio();
    await new Promise(r => setTimeout(r, 300));
    const skip = new Set(['isMuted', 'setMuted', 'unlockAudio']);
    const args = { drawCards: [40], stack: [99], tick: [true] };
    const errors = [];
    let called = 0;
    for (const [name, fn] of Object.entries(sfx)) {
      if (skip.has(name)) continue;
      called++;
      try { fn(...(args[name] ?? [])); } catch (e) { errors.push(name + ': ' + e.message); }
    }
    return { called, errors };
  })()`);
  console.log(`呼叫了 ${result.called} 個音效，錯誤：${result.errors.length ? result.errors.join('、') : '沒有'}`);
  await sleep(500);
} catch (e) {
  console.log('FAILED', e.message);
} finally {
  const logs = page.logs.filter((l) => !/vite|DevTools/.test(l));
  if (logs.length) console.log(logs.join('\n'));
  edge.close();
  setTimeout(() => process.exit(0), 1500);
}
