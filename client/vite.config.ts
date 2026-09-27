import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  // .env 放在專案根目錄，前後端共用
  envDir: '..',
  server: {
    port: 5173,
    // 聽所有網卡（0.0.0.0），別台機器（例如 tailnet 上跑 cloudflared 的）才連得進來
    host: true,
    // 讓 cloudflared 之類的 tunnel 網址也能連進來（Discord 測試用）
    allowedHosts: true,
    proxy: {
      '/api': 'http://localhost:4567',
      '/colyseus': {
        target: 'http://localhost:4567',
        ws: true,
        rewrite: (path) => path.replace(/^\/colyseus/, ''),
      },
    },
  },
});
