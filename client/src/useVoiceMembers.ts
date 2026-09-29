/**
 * 語音頻道裡還沒進來玩的人。
 * 大廳可以顯示「誰在語音頻道裡但還沒加入」，房主就知道還能邀誰。
 *
 * 只有真的在 Discord 裡、而且拿得到 guilds 權限才有資料，其他情況回空陣列。
 */
import { useEffect, useMemo, useState } from 'react';
import { canReadVoiceChannel, fetchVoiceMembers, type VoiceMember } from './discord';

/**
 * 多久重新看一次語音頻道。
 * SDK 只有 VOICE_STATE_UPDATE（靜音之類的變化），沒有「有人進來 / 離開語音」的事件，所以只能輪詢。
 */
const POLL_MS = 15_000;

export function useVoiceMembers(seatDiscordIds: (string | null | undefined)[]): VoiceMember[] {
  const [members, setMembers] = useState<VoiceMember[]>([]);

  useEffect(() => {
    if (!canReadVoiceChannel()) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    // 上一次讀完才排下一次：同時只會有一個請求，舊的回應不會蓋掉新的
    const load = async () => {
      const all = await fetchVoiceMembers();
      if (cancelled) return;
      // 讀不到多半是權限或頻道的問題，再試也一樣，就停在這裡
      if (!all) return;
      setMembers(all);
      timer = setTimeout(() => void load(), POLL_MS);
    };

    void load();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  // 已經坐在座位上的人不用再列一次；座位變了只要重新過濾，不用重抓
  const seatedKey = seatDiscordIds.join(',');
  return useMemo(() => {
    const seated = new Set(seatedKey.split(','));
    return members.filter((m) => !seated.has(m.id));
  }, [members, seatedKey]);
}
