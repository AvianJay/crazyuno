import { fileURLToPath } from 'node:url';
import express from 'express';
import { defineRoom, defineServer } from 'colyseus';
import { UnoRoom } from './UnoRoom';

try {
  process.loadEnvFile(fileURLToPath(new URL('../../.env', import.meta.url)));
} catch {
  // 沒有 .env 也能跑（只是不能在 Discord 裡登入）
}

// 不用 Colyseus 預設的 2567：Windows 常把那一段保留給 Hyper-V，會 EACCES
const port = Number(process.env.PORT) || 4567;

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
  },
});

server.listen(port);
