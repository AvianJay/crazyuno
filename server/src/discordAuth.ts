/**
 * 確認 Discord 玩家真的是他說的那個人。
 *
 * 座位是靠 Discord id 認人的（重新整理、換裝置都能拿回原本的座位和手牌），
 * 所以不能相信前端自己報的 id：前端把登入拿到的 access token 交上來，
 * 這裡拿它去問 Discord「這是誰」，Discord 回的 id 才算數。
 */

/** Discord 的 id（snowflake）是一串數字 */
const SNOWFLAKE = /^\d{5,32}$/;

/** 回傳 Discord 使用者 id；token 無效或 Discord 連不上就回 null */
export async function verifyDiscordUser(accessToken: string): Promise<string | null> {
  // 測試用（scripts/e2e/discord.mjs）：假的 Discord 客戶端拿不到真的 token，
  // 開了 DISCORD_MOCK_AUTH=1 就接受 `mock:<使用者 id>`。正式版（npm start）一律不接受。
  // 在函式裡才讀環境變數：import 的時候 index.ts 還沒載入 .env
  if (process.env.NODE_ENV !== 'production' && process.env.DISCORD_MOCK_AUTH === '1' && accessToken.startsWith('mock:')) {
    const id = accessToken.slice('mock:'.length);
    return SNOWFLAKE.test(id) ? id : null;
  }
  try {
    const res = await fetch('https://discord.com/api/v10/users/@me', {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const user = (await res.json()) as { id?: unknown };
    return typeof user.id === 'string' && SNOWFLAKE.test(user.id) ? user.id : null;
  } catch {
    return null;
  }
}
