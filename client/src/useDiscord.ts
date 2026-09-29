/**
 * 把 discord.ts 裡的小 store 接進 React。
 * 用 useSyncExternalStore，事件來了只重畫用到的那個元件。
 */
import { useSyncExternalStore } from 'react';
import { speakingStore, thermalIsHigh, thermalStore } from './discord';

/**
 * 這個 Discord 使用者正在語音頻道裡說話嗎（沒在 Discord 裡永遠是 false）。
 * 回傳 boolean：別人開口閉口時，只有結果真的變了的那個座位會重畫，不會整張牌桌跟著重畫。
 */
export function useIsSpeaking(discordId: string | null | undefined): boolean {
  return useSyncExternalStore(
    speakingStore.subscribe,
    () => !!discordId && speakingStore.get().has(discordId),
    () => false,
  );
}

/** 手機過熱中（SERIOUS 以上），該換省電畫質了 */
export function useOverheated(): boolean {
  return useSyncExternalStore(
    thermalStore.subscribe,
    () => thermalIsHigh(thermalStore.get()),
    () => false,
  );
}
