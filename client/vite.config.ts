import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { defineConfig, type Connect } from 'vite';

/** /privacy、/terms 沒有結尾斜線也導到頁面（Discord 後台貼網址時常常不會加斜線） */
const legalRedirect: Connect.NextHandleFunction = (req, res, next) => {
  const m = req.url?.match(/^\/(privacy|terms)(\?.*)?$/);
  if (!m) return next();
  res.statusCode = 301;
  res.setHeader('Location', `/${m[1]}/${m[2] ?? ''}`);
  res.end();
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'legal-redirect',
      configureServer: (server) => void server.middlewares.use(legalRedirect),
      configurePreviewServer: (server) => void server.middlewares.use(legalRedirect),
    },
  ],
  // 多頁：遊戲本體 + 隱私權政策 + 服務條款
  input: {
    main: resolve(import.meta.dirname, 'index.html'),
    privacy: resolve(import.meta.dirname, 'privacy/index.html'),
    terms: resolve(import.meta.dirname, 'terms/index.html'),
  },
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
