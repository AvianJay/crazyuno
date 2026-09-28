/**
 * 正式版啟動：npm start
 *
 * 1. 網頁（client/dist）還沒打包，或原始碼、.env 比它新（例如剛 git pull） → 先打包。
 *    記憶體很小的主機打包可能會被系統殺掉：那就在自己電腦跑 npm run build，
 *    把 client/dist 整個傳上去，再用 SKIP_BUILD=1 npm start 啟動。
 * 2. 用 NODE_ENV=production 在同一個程序裡啟動遊戲伺服器，它會順便提供網頁，整個遊戲只佔一個 port。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const built = join(root, 'client/dist/index.html');

/** 資料夾裡最新的檔案修改時間 */
function newest(dir) {
  let t = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    t = Math.max(t, entry.isDirectory() ? newest(path) : statSync(path).mtimeMs);
  }
  return t;
}

// 會影響打包結果的東西（.env 裡的 VITE_ 開頭的值是打包時寫死進網頁的）
const inputs = ['client/src', 'client/privacy', 'client/terms', 'shared/src', 'client/index.html', 'client/vite.config.ts', '.env']
  .map((p) => join(root, p))
  .filter(existsSync)
  .map((p) => (statSync(p).isDirectory() ? newest(p) : statSync(p).mtimeMs));
const stale = !existsSync(built) || Math.max(...inputs) > statSync(built).mtimeMs;

if (stale && process.env.SKIP_BUILD !== '1') {
  console.log(existsSync(built) ? '原始碼有更新，重新打包網頁…' : '第一次啟動，先打包網頁…');
  const result = spawnSync(process.execPath, [join(root, 'node_modules/vite/bin/vite.js'), 'build'], {
    cwd: join(root, 'client'),
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    console.error(
      '\n打包失敗。如果上面出現 Killed，代表這台主機記憶體不夠：' +
        '\n在自己電腦跑 npm run build，把 client/dist 整個傳上來，再用 SKIP_BUILD=1 npm start 啟動。',
    );
    process.exit(result.status ?? 1);
  }
}
if (!existsSync(built)) {
  console.error('找不到 client/dist/index.html，沒辦法提供網頁。先跑 npm run build。');
  process.exit(1);
}

process.env.NODE_ENV = 'production';
// 直接在這個程序裡跑遊戲伺服器（TypeScript 交給 tsx 即時轉），不用多開一個 node
const { register } = await import('tsx/esm/api');
register();
await import('../server/src/index.ts');
