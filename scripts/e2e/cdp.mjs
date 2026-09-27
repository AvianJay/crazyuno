/**
 * 迷你的 Chrome DevTools Protocol 驅動程式，開無頭 Edge 來測試（不用裝套件，Node 22+ 內建 WebSocket）。
 * 用 SwiftShader 軟體算圖，所以 WebGL 能跑但很慢（每秒 1～6 格），截圖會比畫面慢一點。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
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

export async function launch({ port = 9333 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'edge-cdp-'));
  const proc = spawn(
    EDGE,
    ['--headless=new', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', 'about:blank'],
    { stdio: 'ignore' },
  );
  let version;
  for (let i = 0; i < 100 && !version; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
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
        if (msg.method === 'Runtime.consoleAPICalled')
          logs.push(`[${label} console.${p.type}] ${p.args.map((a) => a.value ?? a.description ?? '').join(' ')}`);
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
      };
      return page;
    },
    close() {
      conn.close();
      proc.kill();
      setTimeout(() => rmSync(dir, { recursive: true, force: true }), 1500);
    },
  };
}
