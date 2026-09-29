/**
 * 「邀請好友」按鈕。只有真的在 Discord 裡開才顯示。
 *
 * 按下去會開 Discord 的邀請視窗（可以邀人到這個語音頻道，或直接傳給朋友）；
 * 在 DM 裡或沒有建立邀請的權限時，inviteFriends() 會自動退回分享活動連結。
 */
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { inDiscord, inviteFriends } from '../discord';
import * as sfx from '../sfx';
import { InviteIcon } from './icons';

/** 按鈕外觀交給呼叫端：牌桌上用 icon-btn（跟右上角其他按鈕一樣），大廳用 lobby-invite */
export function InviteButton({ className }: { className: string }) {
  const [busy, setBusy] = useState(false);
  /** 按過之後短暫顯示結果，讓玩家知道有沒有成功 */
  const [note, setNote] = useState<{ id: number; text: string } | null>(null);
  const noteTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimeout(noteTimer.current);
    };
  }, []);

  if (!inDiscord) return null;

  const click = async () => {
    if (busy) return;
    sfx.flick();
    setBusy(true);
    const result = await inviteFriends();
    // 邀請視窗開著的時候可能已經開局、大廳按鈕不見了
    if (!mounted.current) return;
    setBusy(false);
    const text = result === 'failed' ? '邀請失敗' : result === 'cancelled' ? '沒有分享' : '已開啟邀請';
    setNote({ id: Date.now(), text });
    // 連按的話上一次的計時器不能把這次的提示提早收掉
    clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(null), 2200);
  };

  return (
    <>
      <button className={`invite-btn ${className}`} onClick={click} disabled={busy} aria-label="邀請好友一起玩" title="邀請好友">
        <InviteIcon />
      </button>
      {/* 掛到 body：大廳的 .panel 有 transform 動畫，fixed 會變成相對面板定位 */}
      {note &&
        createPortal(
          <div key={note.id} className="invite-note">
            {note.text}
          </div>,
          document.body,
        )}
    </>
  );
}
