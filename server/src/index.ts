import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Application } from 'express';
import { defineRoom, defineServer } from 'colyseus';
import { UnoRoom } from './UnoRoom';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // 沒有 .env 也能跑（只是不能在 Discord 裡登入）
}

/** npm start（scripts/start.mjs）會設成 production：網頁也由這台提供 */
const production = process.env.NODE_ENV === 'production';

// 不用 Colyseus 預設的 2567：Windows 常把那一段保留給 Hyper-V，會 EACCES。
// 正式版看 PORT，沒有的話看 SERVER_PORT（Pterodactyl 之類的面板會自動給）。
// 開發模式固定 4567：Vite 會把 /api、/colyseus 轉到這裡，改了就連不上。
const port = production ? Number(process.env.PORT || process.env.SERVER_PORT) || 4567 : 4567;

const server = defineServer({
  rooms: {
    // 同一個 roomKey（Discord 的 instanceId）的人會進同一間
    uno: defineRoom(UnoRoom).filterBy(['roomKey']),
  },
  express: (app) => {
    app.use(express.json());

    // Discord 登入：把前端拿到的 code 換成 access_token（client secret 只能放在伺服器）
    app.post('/api/token', async (req, res) => {
      const clientId = process.env.VITE_DISCORD_CLIENT_ID;
      const clientSecret = process.env.DISCORD_CLIENT_SECRET;
      if (!clientId || !clientSecret) {
        res.status(500).json({ error: '伺服器沒有設定 Discord client id / secret（看 .env.example）' });
        return;
      }
      const response = await fetch('https://discord.com/api/oauth2/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: 'authorization_code',
          code: String(req.body?.code ?? ''),
        }),
      });
      const data = (await response.json()) as { access_token?: string };
      if (!response.ok || !data.access_token) {
        res.status(400).json({ error: 'Discord 登入失敗', detail: data });
        return;
      }
      res.json({ access_token: data.access_token });
    });

    // 正式版：打包好的網頁也從這裡出去，整個遊戲只要一個 port
    if (production) serveClient(app);
  },
});

server.listen(port).then(() => {
  if (production) console.log(`\n🃏 正式版已啟動：http://localhost:${port}\n`);
});

/**
 * 提供 client/dist（npm run build 的結果）。
 * Colyseus 自己的路徑（/matchmake/…、WebSocket）會先被 Colyseus 接走，其他的才輪到這裡。
 */
function serveClient(app: Application) {
  const dist = fileURLToPath(new URL('../../client/dist/', import.meta.url));
  if (!existsSync(`${dist}index.html`)) {
    console.error('找不到 client/dist/index.html：先跑 npm run build（npm start 會自動打包）');
    return;
  }
  // 檔名有雜湊的可以放心快取一年；HTML 不快取，更新後大家才會拿到新版
  app.use('/assets', express.static(`${dist}assets`, { immutable: true, maxAge: '1y', fallthrough: false }));
  // /privacy 會自動轉到 /privacy/（資料夾），/privacy/ 給 privacy/index.html
  app.use(express.static(dist, { maxAge: 0 }));
}
