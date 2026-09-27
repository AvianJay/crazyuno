import type { Room } from '@colyseus/sdk';
import type { RoomView } from '@crazyuno/shared';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { getIdentity, joinRoom } from './connect';
import { Lobby } from './components/Lobby';
// 3D 牌桌（three.js）很大，分開載入；大廳一出來就先在背景下載
const loadTable = () => import('./components/Table');
const Table = lazy(() => loadTable().then((m) => ({ default: m.Table })));
import * as sfx from './sfx';

export type Send = (type: string, payload?: unknown) => void;

export function App() {
  const [view, setView] = useState<RoomView | null>(null);
  const [status, setStatus] = useState('連線中…');
  const [toast, setToast] = useState<string | null>(null);
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
          setToast(msg);
          sfx.error();
          clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 2500);
        });
        room.onDrop(() => setStatus('斷線了，重新連線中…'));
        room.onReconnect(() => {
          setStatus('');
          room!.send('hello');
        });
        room.onLeave(() => setStatus('已離開房間，重新整理再加入'));
        room.send('hello');
        setStatus('');
      } catch (e) {
        console.error(e);
        setStatus(`連不上：${e instanceof Error ? e.message : e}`);
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
        <div className="center-msg">{status}</div>
      ) : view.game ? (
        <Suspense fallback={<div className="center-msg">載入 3D 牌桌…</div>}>
          <Table view={view} game={view.game} send={send} />
        </Suspense>
      ) : (
        <Lobby view={view} send={send} />
      )}
      {view && status && <div className="banner">{status}</div>}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
