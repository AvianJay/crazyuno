import type { Room } from '@colyseus/sdk';
import type { RoomView } from '@crazyuno/shared';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getIdentity, joinRoom } from './connect';
import { AlertIcon, ReplayIcon, WifiOffIcon } from './components/icons';
import { ErrorScreen, Loader } from './components/Loader';
import { Lobby } from './components/Lobby';
import * as sfx from './sfx';

// 3D 牌桌（three.js）很大，分開載入；大廳一出來就先在背景下載
const loadTable = () => import('./components/Table');
const Table = lazy(() => loadTable().then((m) => ({ default: m.Table })));

export type Send = (type: string, payload?: unknown) => void;

type Conn = { state: 'connecting' | 'ok' | 'dropped' | 'left' } | { state: 'error'; message: string };

export function App() {
  const [view, setView] = useState<RoomView | null>(null);
  const [conn, setConn] = useState<Conn>({ state: 'connecting' });
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const roomRef = useRef<Room | null>(null);
  const toastTimer = useRef<number>(undefined);

  // 瀏覽器規定要點過畫面才能播聲音
  useEffect(() => {
    window.addEventListener('pointerdown', sfx.unlockAudio);
    return () => window.removeEventListener('pointerdown', sfx.unlockAudio);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let room: Room | null = null;

    (async () => {
      try {
        const identity = await getIdentity();
        if (cancelled) return;
        room = await joinRoom(identity);
        if (cancelled) {
          room.leave();
          return;
        }
        roomRef.current = room;
        room.onMessage('view', (v: RoomView) => setView(v));
        room.onMessage('error', (msg: string) => {
          setToast({ id: Date.now(), text: msg });
          sfx.error();
          clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 2500);
        });
        room.onDrop(() => setConn({ state: 'dropped' }));
        room.onReconnect(() => {
          setConn({ state: 'ok' });
          room!.send('hello');
        });
        room.onLeave(() => setConn({ state: 'left' }));
        room.send('hello');
        setConn({ state: 'ok' });
      } catch (e) {
        console.error(e);
        setConn({ state: 'error', message: describeError(e) });
      }
    })();

    return () => {
      cancelled = true;
      room?.leave();
    };
  }, []);

  useEffect(() => {
    if (view) void loadTable();
  }, [view]);

  const send: Send = (type, payload) => roomRef.current?.send(type, payload);

  return (
    <div className="app">
      {!view ? (
        conn.state === 'error' ? <ErrorScreen message={conn.message} /> : <Loader caption="連線中" />
      ) : view.game ? (
        <Suspense fallback={<Loader caption="擺牌桌中" />}>
          <Table view={view} game={view.game} send={send} />
        </Suspense>
      ) : (
        <Lobby view={view} send={send} />
      )}
      {view && (conn.state === 'dropped' || conn.state === 'left') && (
        <div className="banner">
          <WifiOffIcon className="banner-icon" />
          {conn.state === 'dropped' ? (
            <span className="spinner" aria-label="重新連線中" />
          ) : (
            <button className="banner-btn" onClick={() => location.reload()} aria-label="重新整理">
              <ReplayIcon />
            </button>
          )}
        </div>
      )}
      {toast && (
        <div key={toast.id} className="toast">
          <AlertIcon className="toast-icon" />
          {toast.text}
        </div>
      )}
    </div>
  );
}

/** Discord SDK 丟出來的錯誤是 { code, message } 物件，不是 Error */
function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e);
}
