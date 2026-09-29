/**
 * 測 Discord 專屬的功能（用 client/mock-discord.html 這個假客戶端實作 RPC 協議）：
 *
 *   node scripts/e2e/discord.mjs
 *
 * 驗證：
 *   1. 正常授權 → 進得了遊戲，而且真的有送 SET_ACTIVITY（Rich Presence）
 *   2. 邀請好友：openInviteDialog；DM / 沒權限時退回 shareLink
 *   3. 語音事件 → 座位上出現麥克風
 *   4. 拒絕授權 → 出現「沒有完成 Discord 授權」，倒數完會呼叫 close 離開活動
 *   5. 只給 identify → 照樣能玩，選擇性的功能（Rich Presence、語音）不去碰
 *   6. 冒充別人的 Discord id → 拿不到別人的座位
 *   7. 手機過熱 → 訂閱得到，並自動換省電畫質
 *
 * 要先開著 npm run dev，而且 .env 裡要有 DISCORD_MOCK_AUTH=1
 * （假客戶端拿不到真的 token，伺服器要接受 mock:<使用者 id> 才認得出人）。
 * 截圖存在系統暫存資料夾的 crazyuno-e2e/ 裡。
 */
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { launch, sleep } from './cdp.mjs';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const OUT = join(tmpdir(), 'crazyuno-e2e');
mkdirSync(OUT, { recursive: true });

const room = `discord-${Date.now()}`;
/** 同一個活動實例 = 同一桌（真的 Discord 是「同一個語音頻道裡開的活動」共用一個 instanceId） */
const instance = `i-${room}`;
const url = (query) => `${BASE}/mock-discord.html?room=${room}&instance=${instance}&name=${encodeURIComponent('MockUser')}&${query}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const edge = await launch();
const page = await edge.newPage({ width: 1280, height: 800, label: 'discord' });

/** 假客戶端預設的使用者（mock-discord.html 沒給 ?user= 時） */
const MOCK_USER = '111111111111111111';

// 真的 /api/token 要用 client secret 跟 Discord 換 token，測試裡直接回假的。
// 伺服器開了 DISCORD_MOCK_AUTH=1 會把 mock:<id> 當成這個使用者
await page.route('*api/token*', { access_token: `mock:${MOCK_USER}` });

/** 在 iframe（活動本體）裡求值，win 是活動的 window */
const inner = (expr) => page.eval(`(() => { const win = document.getElementById('app').contentWindow; return ${expr}; })()`);

/** 開一個情境，等 iframe 裡的活動載入完 */
async function open(query, { waitFor } = {}) {
  await page.goto(url(query));
  await sleep(1500);
  if (waitFor) await page.waitFor(`(() => { const win = document.getElementById('app').contentWindow; return ${waitFor}; })()`, 45000);
}

const calls = () => page.eval(`window.__calls.map(c => c.cmd)`);

try {
  // ---------- 1. 正常授權 ----------
  console.log('\n=== 1. 正常授權 ===');
  await open('', { waitFor: `!!win.document.querySelector('.lobby')` });
  // Rich Presence 是 async 送的，等一下再一起看送了哪些指令
  await sleep(1200);
  const cmds = await calls();
  check('有跟 Discord 要授權', cmds.includes('AUTHORIZE'));
  check('有把 code 換成 token 後 authenticate', cmds.includes('AUTHENTICATE'));
  check('有送出 Rich Presence', cmds.includes('SET_ACTIVITY'), cmds.filter((c) => c === 'SET_ACTIVITY').length + ' 次');
  check('桌機版會問硬體加速', cmds.includes('ENCOURAGE_HW_ACCELERATION'));
  check('有讀語音頻道成員', cmds.includes('GET_CHANNEL'));

  // 大廳看得到語音頻道裡還沒加入的朋友（自己已經在座位上，不該被列進去）
  const waiting = await inner(`win.document.querySelector('.voice-waiting')?.innerText ?? ''`);
  check('大廳列出還沒加入的語音成員', waiting.includes('還沒進來的朋友'), JSON.stringify(waiting));
  // 座位上的 Discord id 是伺服器驗證過才有的：沒驗證過的話自己也會被列進去
  check('已經在座位上的人不會被列進去', !waiting.includes('MockUser'), `${JSON.stringify(waiting)}（失敗的話：伺服器有開 DISCORD_MOCK_AUTH=1 嗎？）`);

  // Rich Presence 內容：在大廳應該寫「在大廳等大家進來」，而且 Discord 有收（欄位填 null 會被退回）
  const presence = await page.eval(`(() => { const c = window.__calls.filter(c => c.cmd === 'SET_ACTIVITY').pop(); return c ? { activity: c.args?.activity ?? null, error: c.error ?? null } : null; })()`);
  check('Rich Presence 有大廳狀態', presence?.activity?.details === '在大廳等大家進來', JSON.stringify(presence));
  check('Rich Presence 沒被 Discord 退回', presence && !presence.error, JSON.stringify(presence?.error));
  await page.shot(join(OUT, 'discord-lobby.png'));

  // ---------- 2. 邀請好友（正常） ----------
  console.log('\n=== 2. 邀請好友 ===');
  check('在 Discord 裡才顯示邀請按鈕', await inner(`!!win.document.querySelector('.invite-btn')`));
  await inner(`win.document.querySelector('.invite-btn').click()`);
  await sleep(900);
  const afterInvite = await calls();
  check('按邀請會開 Discord 的邀請視窗', afterInvite.includes('OPEN_INVITE_DIALOG'));
  check('正常情況不用退回 shareLink', !afterInvite.includes('SHARE_LINK'));

  // ---------- 3. 誰在說話 ----------
  console.log('\n=== 3. 語音：誰在說話 ===');
  await page.eval(`window.__speak()`);
  await sleep(700);
  check('說話的人座位上出現麥克風', await inner(`!!win.document.querySelector('.seats li.speaking')`));
  await page.shot(join(OUT, 'discord-speaking.png'));
  await page.eval(`window.__stopSpeaking()`);
  await sleep(700);
  check('停止說話後麥克風消失', !(await inner(`!!win.document.querySelector('.seats li.speaking')`)));

  // ---------- 4. 拒絕授權 → 自動離開活動 ----------
  console.log('\n=== 4. 拒絕授權 ===');
  await open('mode=deny', { waitFor: `!!win.document.querySelector('.auth-title')` });
  const authText = await inner(`win.document.querySelector('.auth-title').innerText`);
  check('顯示沒有完成授權', authText.includes('沒有完成 Discord 授權'), JSON.stringify(authText));
  check('有倒數提示', await inner(`!!win.document.querySelector('.auth-countdown')`));
  check('沒有進到遊戲', !(await inner(`!!win.document.querySelector('.lobby')`)));
  check('沒有送出 Rich Presence', !(await calls()).includes('SET_ACTIVITY'));
  await page.shot(join(OUT, 'discord-deny.png'));
  console.log('   等倒數結束（10 秒）…');
  await page.waitFor(`!!window.__closed`, 20000).catch(() => {});
  const closed = await page.eval(`window.__closed ?? null`);
  check('倒數完會把活動關掉', !!closed, JSON.stringify(closed));

  // ---------- 5. 只給 identify → 照樣能玩 ----------
  console.log('\n=== 5. 只給 identify ===');
  await open('mode=identify-only', { waitFor: `!!win.document.querySelector('.lobby')` });
  await sleep(1200);
  const tried = await page.eval(`window.__calls.filter(c => c.cmd === 'AUTHORIZE').map(c => c.args.scope.join(' '))`);
  check('全部權限被拒絕後退回只要 identify', tried.length === 2 && tried[1] === 'identify', JSON.stringify(tried));
  check('照樣進得了大廳', await inner(`!!win.document.querySelector('.lobby')`));
  check('沒有授權畫面', !(await inner(`!!win.document.querySelector('.auth-title')`)));
  const idOnly = await calls();
  check('沒給 rpc.activities.write 就不送 Rich Presence', !idOnly.includes('SET_ACTIVITY'));
  check('沒給 guilds 就不讀語音頻道', !idOnly.includes('GET_CHANNEL'));
  const subscribed = await page.eval(`window.__calls.filter(c => c.cmd === 'SUBSCRIBE').map(c => c.evt)`);
  check('沒給 rpc.voice.read 就不訂閱說話事件', !subscribed.includes('SPEAKING_START'), JSON.stringify(subscribed));
  check('邀請按鈕還在（不用額外權限）', await inner(`!!win.document.querySelector('.invite-btn')`));

  // ---------- 6. 冒充別人的 Discord id ----------
  console.log('\n=== 6. 冒充別人搶座位 ===');
  // 受害者自己開一桌，免得影響後面的測試
  const victimRoom = `${instance}-victim`;
  await page.goto(`${BASE}/mock-discord.html?room=${room}&instance=${victimRoom}&name=Victim`);
  await sleep(1500);
  await page.waitFor(`(() => { const win = document.getElementById('app').contentWindow; return !!win.document.querySelector('.lobby'); })()`, 45000);
  // 攻擊者用瀏覽器直接開，把分頁的 key 改成受害者的 Discord key。
  // 以前伺服器直接相信這個 key，會把受害者的座位（遊戲中連手牌）交給攻擊者、把受害者踢掉
  const attacker = await edge.newPage({ width: 900, height: 700, label: 'attacker' });
  await attacker.goto(`${BASE}/privacy/`);
  await sleep(800);
  await attacker.eval(`sessionStorage.setItem('crazyuno:key', 'discord:${MOCK_USER}')`);
  await attacker.goto(`${BASE}/?room=${victimRoom}&name=Attacker`);
  await attacker.waitFor(`document.querySelectorAll('.seats li:not(.empty-seat)').length === 2`, 45000).catch(() => {});
  const attackerSeat = await attacker.eval(`document.querySelector('.seats li.me .seat-label')?.innerText ?? ''`);
  check('攻擊者拿到的是新座位', attackerSeat === 'Attacker', JSON.stringify(attackerSeat));
  const victimSeats = await inner(`[...win.document.querySelectorAll('.seats li:not(.empty-seat) .seat-label')].map(e => e.innerText)`);
  check('受害者還坐在原位', victimSeats.includes('Victim') && victimSeats.includes('Attacker'), JSON.stringify(victimSeats));
  check('受害者沒被踢掉', !(await inner(`win.document.body.innerText.includes('你在別的地方重新加入了')`)));
  attacker.send('Page.close').catch(() => {});

  // ---------- 7. DM：openInviteDialog 失敗 → shareLink ----------
  console.log('\n=== 7. DM 情境 ===');
  await open('mode=dm', { waitFor: `!!win.document.querySelector('.lobby')` });
  await inner(`win.document.querySelector('.invite-btn').click()`);
  await sleep(900);
  const dmCalls = await calls();
  check('DM 裡先試 openInviteDialog', dmCalls.includes('OPEN_INVITE_DIALOG'));
  check('失敗後退回 shareLink', dmCalls.includes('SHARE_LINK'));
  const note = await inner(`win.document.querySelector('.invite-note')?.innerText ?? ''`);
  check('有告訴使用者結果', note.length > 0, JSON.stringify(note));

  // ---------- 8. 沒有邀請權限 ----------
  console.log('\n=== 8. 沒有建立邀請權限 ===');
  await open('mode=noperm', { waitFor: `!!win.document.querySelector('.lobby')` });
  await inner(`win.document.querySelector('.invite-btn').click()`);
  await sleep(900);
  check('沒有權限時也退回 shareLink', (await calls()).includes('SHARE_LINK'));

  // ---------- 9. 手機過熱 → 自動省電 ----------
  console.log('\n=== 9. 手機過熱 ===');
  // hq=1 是「玩家自己選高畫質」：過熱要能蓋掉它（過熱是裝置狀態，不是偏好）
  await open('thermal=3&hq=1&platform=mobile', { waitFor: `!!win.document.querySelector('.lobby')` });
  check('有訂閱事件（含過熱）', (await calls()).includes('SUBSCRIBE'));
  // 過熱事件 3 秒後才送，先等它到
  await sleep(4000);
  page.logs.length = 0; // 只看開局之後的 log，才分得出是過熱降的還是跑不動降的

  // 開一局才會載入 3D 牌桌，畫質設定才有意義（兩個人才能開始）
  const second = await edge.newPage({ width: 900, height: 700, label: 'second' });
  await second.route('*api/token*', { access_token: 'mock:222222222222222222' });
  // 同一桌要共用 instance，但要是不同的人（不然會被當成同一個人重新加入）
  await second.goto(`${BASE}/mock-discord.html?room=${room}&instance=${instance}&user=222222222222222222&name=${encodeURIComponent('Other')}`);
  await sleep(2500);
  await second.waitFor(`(() => { const win = document.getElementById('app')?.contentWindow; return !!win && win.document.querySelectorAll('.seats li:not(.empty-seat)').length === 2; })()`, 45000);
  await inner(`win.document.querySelector('.start-btn').click()`);
  await page.waitFor(`(() => { const win = document.getElementById('app').contentWindow; return !!win.document.querySelector('.table3d canvas'); })()`, 60000);
  await sleep(2500);

  check('過熱的手機會自動換省電畫質（蓋掉玩家選的高畫質）', await inner(`!!win.document.querySelector('.icon-btn.eco')`));
  // 確認真的是「過熱」這條路降的，不是剛好跑不動被 PerformanceMonitor 降的
  const thermalLog = page.logs.some((l) => l.includes('手機過熱'));
  check('降畫質的原因是過熱', thermalLog, page.logs.filter((l) => l.includes('crazyuno-perf')).join(' | ') || '(沒有 perf log)');
  await page.shot(join(OUT, 'discord-thermal.png'));
  second.send('Page.close').catch(() => {});
} catch (e) {
  console.log('FAILED:', e.stack ?? e.message);
  failures++;
  await page.shot(join(OUT, 'discord-fail.png')).catch(() => {});
} finally {
  const logs = page.logs.filter((l) => !/\[vite\]|React DevTools|THREE\.Clock|crazyuno-perf/.test(l));
  console.log(`\n--- 瀏覽器 console（${logs.length}）---`);
  console.log([...new Set(logs)].slice(0, 30).join('\n'));
  console.log(`\n${failures === 0 ? '✅ 全部通過' : `❌ ${failures} 項失敗`}`);
  console.log(`截圖：${OUT}`);
  edge.close();
  setTimeout(() => process.exit(failures === 0 ? 0 : 1), 1500);
}
