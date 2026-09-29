import { Client, type Room } from '@colyseus/sdk';
import { avatarUrl, connectDiscord, displayName, discord, proxyBase } from './discord';

export interface Identity {
  name: string;
  avatar: string | null;
  /** 同一個 roomKey 的人會進同一桌 */
  roomKey: string;
  /** 瀏覽器直接開的人認人用：斷線或重新整理後，伺服器靠這個把原本的座位還給你 */
  userKey?: string;
  /**
   * Discord 登入的 access token。伺服器拿它跟 Discord 確認你是誰，
   * 才用你的 Discord id 認座位、對語音（不能讓前端自己報 id，不然誰都能冒充別人拿走座位）
   */
  accessToken?: string;
}

export async function getIdentity(): Promise<Identity> {
  const session = await connectDiscord();
  if (!session) return getLocalIdentity();
  const user = session.user;
  return {
    name: displayName(user),
    avatar: avatarUrl(user),
    // 同一個語音頻道裡開的 Activity 共用同一個 instanceId
    roomKey: discord()!.instanceId,
    accessToken: session.accessToken,
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
  const client = new Client(`${location.origin}${proxyBase}${import.meta.env.DEV ? '/colyseus' : ''}`);
  return client.joinOrCreate('uno', identity);
}
