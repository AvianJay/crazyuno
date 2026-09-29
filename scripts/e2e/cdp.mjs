/**
 * 迷你的 Chrome DevTools Protocol 驅動程式，開無頭 Edge 來測試（不用裝套件，Node 22+ 內建 WebSocket）。
 * 預設用 SwiftShader 軟體算圖，所以 WebGL 能跑但很慢（每秒 1～6 格），截圖會比畫面慢一點。
 * GPU=1 改用顯示卡（每秒 50 格上下），要測滑鼠 hover 這種即時反應就要開。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const EDGE = process.env.EDGE ?? 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    let id = 0;
    const pending = new Map();
    const listeners = [];
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id !== undefined) {
        const p = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else for (const l of listeners) l(msg);
    };
    ws.onerror = reject;
    ws.onopen = () =>
      resolve({
        send(method, params = {}, sessionId) {
          const msgId = ++id;
          ws.send(JSON.stringify({ id: msgId, method, params, sessionId }));
          return new Promise((res, rej) => pending.set(msgId, { resolve: res, reject: rej }));
        },
        on: (fn) => listeners.push(fn),
        close: () => ws.close(),
      });
  });
}

/** CDP urlPattern 的萬用字元（* 任意長度、? 一個字）轉成 RegExp，才知道請求是哪個 route 攔到的 */
function globToRegExp(pattern) {
  const source = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp(`^${source}$`);
}

/**
 * port 預設 0 = 讓 Edge 自己挑一個空的，再從使用者資料夾的 DevToolsActivePort 讀出來。
 * 不寫死：Windows（Hyper-V）每次開機保留的 port 範圍都不一樣，寫死的 9333 就碰過剛好被保留、Edge 開不起來。
 */
export async function launch({ port = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'edge-cdp-'));
  const gl =
    process.env.GPU === '1'
      ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
      : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  // 全新的使用者資料夾：Edge 會同步裝上一堆擴充功能、開歡迎頁、在背景更新元件，記憶體少的時候整個慢到截一張圖要好幾秒
  const lean = ['--disable-extensions', '--disable-sync', '--disable-background-networking', '--disable-component-update', '--no-default-browser-check', '--renderer-process-limit=2'];
  // 關掉「上一頁快取」：新版 Edge 換頁時會把開著 WebSocket 的頁面整個凍結起來，連線不會斷，斷線重連的測試就測不到
  const noCache = ['--disable-features=BackForwardCache'];
  const proc = spawn(EDGE, ['--headless=new', ...gl, ...lean, ...noCache, `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'], {
    stdio: 'ignore',
  });
  let version;
  for (let i = 0; i < 100 && !version; i++) {
    try {
      const actual = port || Number(readFileSync(join(dir, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      version = await (await fetch(`http://127.0.0.1:${actual}/json/version`)).json();
    } catch {
      await sleep(100);
    }
  }
  if (!version) throw new Error('Edge did not start');
  const conn = await connect(version.webSocketDebuggerUrl);

  return {
    async newPage({ width, height, mobile = false, label = 'page' }) {
      const { targetId } = await conn.send('Target.createTarget', { url: 'about:blank' });
      const { sessionId } = await conn.send('Target.attachToTarget', { targetId, flatten: true });
      const send = (m, p) => conn.send(m, p, sessionId);
      const logs = [];
      conn.on((msg) => {
        if (msg.sessionId !== sessionId) return;
        const p = msg.params;
        if (msg.method === 'Runtime.consoleAPICalled') {
          // 參數可能是物件（React 的警告會把 component stack 放在第二個參數）
          const text = p.args.map((a) => a.value ?? a.description ?? (a.preview ? JSON.stringify(a.preview.properties ?? []) : '')).join(' ');
          const stack = p.stackTrace?.callFrames?.slice(0, 6).map((f) => `${f.functionName || '?'}@${f.url.split('/').pop()}:${f.lineNumber + 1}`).join(' <- ');
          logs.push(`[${label} console.${p.type}] ${text}${stack ? `\n    ${stack}` : ''}`);
        }
        if (msg.method === 'Runtime.exceptionThrown')
          logs.push(`[${label} EXCEPTION] ${p.exceptionDetails.exception?.description ?? p.exceptionDetails.text}`);
        if (msg.method === 'Log.entryAdded') logs.push(`[${label} log.${p.entry.level}] ${p.entry.text} ${p.entry.url ?? ''}`);
      });
      await send('Runtime.enable');
      await send('Page.enable');
      await send('Log.enable');
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile });
      await send('Emulation.setFocusEmulationEnabled', { enabled: true });
      if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

      const page = {
        send,
        logs,
        goto: (url) => send('Page.navigate', { url }),
        async eval(expression) {
          const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
          if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
          return r.result.value;
        },
        async waitFor(expression, timeout = 15000) {
          const end = Date.now() + timeout;
          let last;
          while (Date.now() < end) {
            try {
              if (await page.eval(expression)) return;
            } catch (e) {
              last = e;
            }
            await sleep(150);
          }
          const body = await page.eval('document.body.innerText.slice(0, 300)').catch(() => '?');
          throw new Error(`[${label}] timeout waiting for: ${expression}\n  body: ${body}\n  last error: ${last?.message ?? '-'}`);
        },
        async shot(path) {
          const { data } = await send('Page.captureScreenshot', { format: 'png' });
          writeFileSync(path, Buffer.from(data, 'base64'));
        },
        click: (selector) => page.eval(`document.querySelector(${JSON.stringify(selector)}).click()`),
        /**
         * 攔截符合 urlPattern（CDP 樣式：* 任意長度、? 一個字，例如 '*api/token*'）的請求，直接回假的 JSON。
         * 用來擋掉需要真的 Discord 憑證的 /api/token。
         * 可以設很多個樣式；同一個樣式再設一次會換掉回應。
         */
        async route(urlPattern, body, status = 200) {
          routes.set(urlPattern, { test: globToRegExp(urlPattern), body, status });
          // Fetch.enable 每次都是整組換掉，所以要把全部樣式一起帶上
          await send('Fetch.enable', { patterns: [...routes.keys()].map((p) => ({ urlPattern: p })) });
        },
      };

      /** page.route() 設的攔截：樣式 → 要回的假資料。只掛一個 handler，一個請求只會回一次 */
      const routes = new Map();
      conn.on((msg) => {
        if (msg.sessionId !== sessionId || msg.method !== 'Fetch.requestPaused') return;
        const { requestId, request } = msg.params;
        const route = [...routes.values()].find((r) => r.test.test(request.url));
        const reply = route
          ? send('Fetch.fulfillRequest', {
              requestId,
              responseCode: route.status,
              responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
              body: Buffer.from(JSON.stringify(route.body)).toString('base64'),
            })
          : send('Fetch.continueRequest', { requestId });
        reply.catch(() => {});
      });
      return page;
    },
    close() {
      conn.close();
      proc.kill();
      setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1500);
    },
  };
}
