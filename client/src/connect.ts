import { Client, type Room } from '@colyseus/sdk';
import { DiscordSDK } from '@discord/embedded-app-sdk';

export interface Identity {
  name: string;
  avatar: string | null;
  /** 同一個 roomKey 的人會進同一桌 */
  roomKey: string;
  /** 認人用：斷線或重新整理後，伺服器靠這個把原本的座位還給你 */
  userKey: string;
}

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

/** 在 Discord 裡面開的時候，網址會帶 frame_id */
export const inDiscord = new URLSearchParams(location.search).has('frame_id');

/**
 * Discord Activity 裡所有請求都要走 /.proxy/ 才會轉到你的伺服器
 * （Developer Portal 的 URL Mapping 設定 `/` → 你的網址）
 */
const base = inDiscord ? '/.proxy' : '';

export async function getIdentity(): Promise<Identity> {
  if (!inDiscord) return getLocalIdentity();
  if (!CLIENT_ID) throw new Error('沒有設定 VITE_DISCORD_CLIENT_ID（看 .env.example）');

  const sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();
  const { code } = await sdk.commands.authorize({
    client_id: CLIENT_ID,
    response_type: 'code',
    state: '',
    prompt: 'none',
    scope: ['identify'],
  });
  const res = await fetch(`${base}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const { access_token, error } = await res.json();
  if (!access_token) throw new Error(error ?? 'Discord 登入失敗');
  const { user } = await sdk.commands.authenticate({ access_token });

  return {
    name: user.global_name ?? user.username,
    avatar: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` : null,
    // 同一個語音頻道裡開的 Activity 共用同一個 instanceId
    roomKey: sdk.instanceId,
    userKey: `discord:${user.id}`,
  };
}

/** 瀏覽器直接開（開發測試用）：名字存在這個分頁，房間用網址的 ?room=，也可以用 ?name= 直接指定名字 */
function getLocalIdentity(): Identity {
  const params = new URLSearchParams(location.search);
  let name = params.get('name') || sessionStorage.getItem('crazyuno:name');
  if (!name) {
    name = prompt('你的名字？')?.trim() || `玩家${Math.floor(Math.random() * 1000)}`;
    sessionStorage.setItem('crazyuno:name', name);
  }
  const roomKey = params.get('room') || 'local';
  // 存在這個分頁：重新整理還是同一個人，開新分頁就是另一個玩家
  let userKey = sessionStorage.getItem('crazyuno:key');
  if (!userKey) {
    userKey = `tab:${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
    sessionStorage.setItem('crazyuno:key', userKey);
  }
  return { name, avatar: null, roomKey, userKey };
}

export async function joinRoom(identity: Identity): Promise<Room> {
  // 開發模式由 Vite 把 /colyseus 轉給遊戲伺服器；正式版網頁和遊戲伺服器在同一個 port，直接連
  const client = new Client(`${location.origin}${base}${import.meta.env.DEV ? '/colyseus' : ''}`);
  return client.joinOrCreate('uno', identity);
}
