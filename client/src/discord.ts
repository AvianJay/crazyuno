/**
 * Discord Activity 整合。
 *
 * 把所有跟 Discord 客戶端有關的東西集中在這裡：
 *   - SDK 生命週期（new DiscordSDK → ready）
 *   - OAuth 授權：連 identify 都沒授權就直接把活動關掉；其他權限不給只是少幾個功能
 *   - Rich Presence：朋友在個人檔案上看到你在打什麼、還剩幾張牌
 *   - 邀請好友：openInviteDialog，DM 或沒權限時退回 shareLink
 *   - 語音狀態：誰在說話（牌桌上會亮）
 *   - 手機過熱：通知外面降畫質
 *
 * 用瀏覽器直接開（開發測試）時 inDiscord 是 false，
 * 所有函式都安全地什麼都不做，遊戲本身完全不受影響。
 */
import { DiscordSDK, Events, RPCCloseCodes } from '@discord/embedded-app-sdk';

const CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID as string | undefined;

/** 在 Discord 裡面開的時候，網址會帶 frame_id */
export const inDiscord = new URLSearchParams(location.search).has('frame_id');

/**
 * Discord Activity 裡所有請求都要走 /.proxy/ 才會轉到你的伺服器
 * （Developer Portal 的 URL Mapping 設定 `/` → 你的網址）
 */
export const proxyBase = inDiscord ? '/.proxy' : '';

/**
 * 要跟使用者要的權限。每一項都會在授權視窗裡列出來，所以只拿真的用得到的。
 *
 * 一定要有的：
 *   identify             → 使用者名稱、頭像；伺服器也靠它確認你是誰
 */
const REQUIRED_SCOPES = ['identify'] as const;

/**
 * 加分功能：使用者不給（或 Discord 不讓我們要）也照樣能玩，只是那個功能關掉。
 *   guilds               → getChannel 拿語音頻道裡有誰
 *   rpc.activities.write → Rich Presence（setActivity）
 *   rpc.voice.read       → 誰在說話（SPEAKING_START / SPEAKING_STOP）
 */
const OPTIONAL_SCOPES = ['guilds', 'rpc.activities.write', 'rpc.voice.read'] as const;

type Scope = (typeof REQUIRED_SCOPES)[number] | (typeof OPTIONAL_SCOPES)[number];

/** 連 identify 都沒授權：呼叫端要直接把活動關掉，不要讓玩家卡在 loading */
export class DiscordAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DiscordAuthError';
  }
}

/**
 * authenticate() 回傳的使用者比 Types.User 少幾個欄位（沒有 bot / flags），
 * 所以這裡自己描述真正拿得到的部分。
 */
export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordSession {
  user: DiscordUser;
  /** 加入房間時交給伺服器，伺服器拿它跟 Discord 確認你真的是這個人 */
  accessToken: string;
  /** 使用者實際給了哪些權限；沒給的功能就不要去碰 */
  scopes: ReadonlySet<string>;
}

let sdk: DiscordSDK | null = null;
let session: DiscordSession | null = null;

export function discord(): DiscordSDK | null {
  return sdk;
}

/** 使用者有沒有給這個權限（沒在 Discord 裡永遠是 false） */
export function hasScope(scope: Scope): boolean {
  return session?.scopes.has(scope) ?? false;
}

/**
 * 頭像網址。沒有自訂頭像時用預設頭像：
 * 新制使用者名稱（discriminator 是 "0"）用 `(id >> 22) % 6`，舊的「名字#1234」用 `discriminator % 5`
 */
export function avatarUrl(user: { id: string; avatar?: string | null; discriminator?: string }): string | null {
  if (user.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`;
  try {
    const legacy = user.discriminator && user.discriminator !== '0';
    const index = legacy ? Number(user.discriminator) % 5 : Number((BigInt(user.id) >> 22n) % 6n);
    return `https://cdn.discordapp.com/embed/avatars/${index}.png`;
  } catch {
    return null;
  }
}

export function displayName(user: { username: string; global_name?: string | null }): string {
  return user.global_name ?? user.username;
}

// ---------- 啟動 + OAuth ----------

/**
 * 連上 Discord 並完成授權。不在 Discord 裡就回 null（走本機模式）。
 * 連 identify 都沒授權時丟 DiscordAuthError，呼叫端要 exitActivity()。
 */
export async function connectDiscord(): Promise<DiscordSession | null> {
  if (!inDiscord) return null;
  // 這是部署設定錯了，不是玩家沒授權：當一般錯誤顯示，不要倒數關活動
  if (!CLIENT_ID) throw new Error('沒有設定 VITE_DISCORD_CLIENT_ID（看 .env.example）');

  sdk = new DiscordSDK(CLIENT_ID);
  await sdk.ready();

  const code = await authorize(sdk, CLIENT_ID);

  // code 換 access_token：client secret 只能放在伺服器，所以繞一圈 /api/token
  // 這一段失敗是伺服器設定或網路問題（不是使用者沒授權），所以不當成 auth error
  const res = await fetch(`${proxyBase}/api/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  const data = (await res.json()) as { access_token?: string; error?: string };
  if (!data.access_token) throw new Error(data.error ?? 'Discord 登入失敗');

  const auth = await sdk.commands.authenticate({ access_token: data.access_token });
  session = { user: auth.user, accessToken: data.access_token, scopes: new Set(auth.scopes.map(String)) };
  startSubscriptions(sdk);
  void promptHardwareAcceleration(sdk);
  return session;
}

/**
 * 先要全部權限；被拒絕（或出錯）就退一步只要 identify。
 * 加分功能不該因為玩家不想給、或 Discord 暫時出錯就整個不能玩，
 * 連 identify 都拿不到才算真的沒授權。
 */
async function authorize(s: DiscordSDK, clientId: string): Promise<string> {
  let failure: unknown = null;
  for (const scope of [[...REQUIRED_SCOPES, ...OPTIONAL_SCOPES], [...REQUIRED_SCOPES]]) {
    try {
      // prompt: 'none' = 已經授權過就直接給 code，沒有才會跳同意視窗
      const { code } = await s.commands.authorize({ client_id: clientId, response_type: 'code', state: '', prompt: 'none', scope });
      if (code) return code;
    } catch (e) {
      failure = e;
      console.warn(`[discord] 授權失敗（${scope.join(', ')}）`, e);
    }
  }
  throw new DiscordAuthError(failure ? `Discord 授權沒有完成：${describeError(failure)}` : 'Discord 沒有回傳授權碼');
}

/** 把活動關掉（Discord 客戶端會把這個 iframe 收起來） */
export function exitActivity(reason = '已離開活動'): void {
  if (!sdk) return;
  try {
    sdk.close(RPCCloseCodes.CLOSE_NORMAL, reason);
  } catch {
    // 關不掉就算了（例如測試環境），外層還有錯誤畫面
  }
}

// ---------- Rich Presence ----------

export interface Presence {
  details: string;
  state?: string;
  /** [目前人數, 上限] → 個人檔案上會顯示「(3 of 10)」 */
  party?: [number, number];
  /** 開局時間（unix 秒），Discord 會自己顯示「已經玩了多久」 */
  start?: number;
}

/**
 * Rich Presence 的大圖。
 * 在後台 Rich Presence → Art Assets 上傳圖片後，把 key 填進 .env 的 VITE_RP_ASSET
 * （key 會自動變小寫）。也可以直接填外部圖片網址。
 */
const RP_ASSET = String(import.meta.env.VITE_RP_ASSET ?? '').trim();

/** Discord 對 SET_ACTIVITY 有速率限制（大約 20 秒 5 次），兩次之間至少隔這麼久 */
const PRESENCE_GAP_MS = 4000;
/** 送失敗後多久再試（每失敗一次加倍，最多 1 分鐘） */
const PRESENCE_RETRY_MS = 5000;

let wantedPresence: Presence | null = null;
let wantedKey = '';
/** Discord 那邊現在真的顯示的內容：送成功才更新，失敗了下次還會再送 */
let shownKey = '';
let presenceTimer: ReturnType<typeof setTimeout> | undefined;
let presenceBusy = false;
let nextPresenceAt = 0;
let presenceFailures = 0;

/**
 * 更新 Rich Presence。傳 null 是清掉。
 * 跟 Discord 上顯示的一樣就不送；變太快的話等速率限制過了再送，中間的變化只留最後一次。
 */
export function setPresence(next: Presence | null): void {
  // 使用者沒給 rpc.activities.write 就不用試了
  if (!sdk || !hasScope('rpc.activities.write')) return;
  wantedPresence = next;
  wantedKey = next ? JSON.stringify(next) : '';
  schedulePresence();
}

function schedulePresence(): void {
  if (presenceBusy || presenceTimer || wantedKey === shownKey) return;
  presenceTimer = setTimeout(() => void pushPresence(), Math.max(0, nextPresenceAt - Date.now()));
}

async function pushPresence(): Promise<void> {
  presenceTimer = undefined;
  if (!sdk) return;
  const next = wantedPresence;
  const key = wantedKey;
  presenceBusy = true;
  try {
    await sdk.commands.setActivity({
      // 沒有值的欄位要整個不帶：SDK 的型別說可以填 null，但 Discord 會退回
      // （code 4000：`"timestamps" must be an object`）
      activity: next
        ? {
            type: 0, // 0 = Playing
            details: next.details,
            ...(next.state && { state: next.state }),
            ...(next.party && { party: { size: [...next.party] } }),
            ...(next.start && { timestamps: { start: next.start } }),
            ...(RP_ASSET && { assets: { large_image: RP_ASSET, large_text: 'MadCards' } }),
          }
        : null,
    });
    shownKey = key;
    presenceFailures = 0;
    nextPresenceAt = Date.now() + PRESENCE_GAP_MS;
  } catch (e) {
    // 多半是撞到速率限制：等一下再送最新的內容，不要打斷遊戲
    presenceFailures++;
    nextPresenceAt = Date.now() + Math.min(PRESENCE_RETRY_MS * 2 ** (presenceFailures - 1), 60_000);
    console.warn('[discord] 更新 Rich Presence 失敗，等一下再試', e);
  } finally {
    presenceBusy = false;
    schedulePresence();
  }
}

// ---------- 邀請好友 ----------

export type InviteResult = 'dialog' | 'shared' | 'cancelled' | 'failed';

/**
 * 邀請好友。
 * 先用 openInviteDialog（可以邀請人到這個頻道，或直接傳給朋友），
 * 在 DM 裡或沒有「建立邀請」權限時它會丟錯，就退回 shareLink 分享活動連結。
 */
export async function inviteFriends(): Promise<InviteResult> {
  if (!sdk) return 'failed';
  try {
    await sdk.commands.openInviteDialog();
    return 'dialog';
  } catch {
    // DM 或沒有權限：換 shareLink 試試看
  }
  try {
    const { success } = await sdk.commands.shareLink({
      message: '來打 MadCards！🃏 +99、鏡子、大風吹，保證友情崩壞',
      custom_id: 'invite',
    });
    return success ? 'shared' : 'cancelled';
  } catch (e) {
    console.warn('[discord] 邀請好友失敗', e);
    return 'failed';
  }
}

// ---------- 語音頻道 ----------

export interface VoiceMember {
  id: string;
  name: string;
  avatar: string | null;
}

/** 讀得到語音頻道成員嗎：要在伺服器的頻道裡（DM 沒有），而且使用者給了 guilds 權限 */
export function canReadVoiceChannel(): boolean {
  return !!sdk?.channelId && !!sdk.guildId && hasScope('guilds');
}

/**
 * 語音頻道裡有誰（包含還沒進來玩的人）。
 * 讀不到（沒權限、不在伺服器頻道裡、Discord 出錯）回 null，呼叫端就別再試了。
 */
export async function fetchVoiceMembers(): Promise<VoiceMember[] | null> {
  if (!sdk?.channelId || !canReadVoiceChannel()) return null;
  try {
    const channel = await sdk.commands.getChannel({ channel_id: sdk.channelId });
    return (channel.voice_states ?? []).map((vs) => ({
      id: vs.user.id,
      name: displayName(vs.user),
      avatar: avatarUrl(vs.user),
    }));
  } catch (e) {
    console.warn('[discord] 讀語音頻道成員失敗', e);
    return null;
  }
}

// ---------- 事件（用一個超小 store 讓 React 訂閱） ----------

type Listener = () => void;

function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<Listener>();
  return {
    get: () => value,
    set(next: T) {
      value = next;
      for (const fn of listeners) fn();
    },
    subscribe(fn: Listener) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** 正在說話的人的 Discord user id */
export const speakingStore = createStore<ReadonlySet<string>>(new Set());

/** 手機過熱（Android/iOS）：2 = SERIOUS、3 = CRITICAL */
export const thermalStore = createStore<number>(-1);

/**
 * 保險：離開語音、斷線時可能收不到 SPEAKING_STOP，
 * 這麼久沒有新的 SPEAKING_START 就當作不講了（講話一停頓 Discord 就會送 STOP，所以不會誤關）
 */
const SPEAKING_TIMEOUT_MS = 20_000;

/** ready 之後才訂閱；任何一項失敗都不影響其他項 */
function startSubscriptions(s: DiscordSDK): void {
  /** 正在說話的人 → 保險用的逾時計時器 */
  const speaking = new Map<string, ReturnType<typeof setTimeout>>();
  const update = () => speakingStore.set(new Set(speaking.keys()));
  const stopSpeaking = (userId: string) => {
    clearTimeout(speaking.get(userId));
    if (speaking.delete(userId)) update();
  };

  // 語音事件要指定頻道，沒有頻道（DM）或沒給 rpc.voice.read 就整組跳過
  if (s.channelId && hasScope('rpc.voice.read')) {
    const args = { channel_id: s.channelId };
    void s
      .subscribe(Events.SPEAKING_START, ({ user_id }) => {
        clearTimeout(speaking.get(user_id));
        speaking.set(user_id, setTimeout(() => stopSpeaking(user_id), SPEAKING_TIMEOUT_MS));
        update();
      }, args)
      .catch((e) => console.warn('[discord] 訂閱說話事件失敗', e));

    void s
      .subscribe(Events.SPEAKING_STOP, ({ user_id }) => stopSpeaking(user_id), args)
      .catch((e) => console.warn('[discord] 訂閱說話事件失敗', e));
  }

  void s
    .subscribe(Events.THERMAL_STATE_UPDATE, ({ thermal_state }) => thermalStore.set(thermal_state))
    .catch((e) => console.warn('[discord] 訂閱過熱事件失敗', e));
}

// ---------- 其他小工具 ----------

/** 手機太燙（或快沒電）時請前端換省電畫質 */
export function thermalIsHigh(state: number): boolean {
  return state >= 2;
}

/**
 * 問使用者要不要開硬體加速（3D 牌桌跑不動最常見的原因）。
 *
 * 這個要「越早問越好」：切換設定會讓 Discord 自己重開，
 * 所以在玩家開始玩之前問，才不會玩到一半被踢出去。
 * 桌機才有這個選項；已經問過就不要再問（Discord 也會給「不再顯示」的選項）。
 */
const HW_ACCEL_KEY = 'crazyuno:hwaccel-asked';

async function promptHardwareAcceleration(s: DiscordSDK): Promise<void> {
  if (s.platform !== 'desktop') return;
  try {
    if (localStorage.getItem(HW_ACCEL_KEY)) return;
  } catch {
    // 無痕模式讀不到，那就當作沒問過
  }
  try {
    await s.commands.encourageHardwareAcceleration();
    try {
      localStorage.setItem(HW_ACCEL_KEY, '1');
    } catch {
      // 存不了就算了，頂多下次再問
    }
  } catch (e) {
    // 舊版客戶端沒有這個指令：不重要，安靜略過
    console.warn('[discord] 硬體加速提示失敗', e);
  }
}

/** SDK 丟出來的錯誤是 { code, message } 物件，不是 Error */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e);
}
