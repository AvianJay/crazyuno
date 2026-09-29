# 🃏 MadCards

![MadCards](promo/cover.png)

在 Discord 語音頻道裡直接開打的 3D 派對卡牌遊戲。規則是大家熟悉的「同色或同數字就能出」，再加上 +99、鏡子反彈、大風吹、清倉這些怪牌。2～10 人同桌，電腦、手機都能玩。

## ✨ 特色

- **真 3D 牌桌**：React Three Fiber 畫的牌桌、粒子、鏡頭震動，每張怪牌都有專屬演出
- **Discord Activity**：同一個語音頻道的人自動進同一桌，顯示頭像、誰在說話、Rich Presence
- **斷線重連**：座位會留著，機器人先幫你打，連回來拿回原本的座位
- **觀戰**：遊戲中才進來的人先觀戰，下一局一起玩
- **即時合成音效**：全部用 Web Audio 現場合成，沒有音檔

## ⚡ 怪牌（房主可以一張一張開關）

| 牌 | 效果 |
| --- | --- |
| ☠️ **+99** | 下一家抽 99 張。整副牌只有一張，可以疊加 |
| ✖️ **×2** | 疊加中把累積的抽牌數翻倍再傳下去；平常當 +2 用 |
| 🪞 **鏡子** | 疊加中把整疊抽牌彈回給攻擊你的人；平常當迴轉用 |
| 🎲 **+骰子** | 擲 12 面骰，下一家抽骰出來的數字，可以疊加 |
| 🌀 **大風吹** | 所有人把整手牌傳給下一家，大家都要重新喊 LAST! |
| 🎁 **見者有份** | 除了出牌的人，每個人都抽 2 張 |
| 🧹 **清倉** | 手上跟它同顏色的牌一口氣全部丟掉（一起丟掉的功能牌不會發動），丟光就贏 |

## 📜 規則

- 顏色或數字相同就能出，+2、+4 可以疊加往下傳
- 剩一張要喊 **LAST!**，沒喊被別人抓到罰抽 2 張（手上的清倉一出就剩一張的話，也可以先喊）
- 手牌超過上限就 💥 爆牌出局
- 最先出完手牌的人獲勝

房主可以調：

- 起始手牌 1～20 張
- 爆牌上限 5～200 張，或不限
- 每回合 5～120 秒，或不限（時間到自動抽牌）
- 整局 1～60 分鐘，或不限（時間到手牌最少的人贏）

房主可以開關的規則：

| 規則 | 預設 | 說明 |
| --- | --- | --- |
| **疊加** | 開 | 被 + 的人可以再出 + 疊上去丟給下一家。關掉就只能乖乖抽 |
| **越疊越大** | 關 | 只能疊一樣大或更大的：+4 上面不能疊 +2，+99 上面不能疊 +2、+4（×2、骰子不受限） |
| **+99 封頂** | 關 | +99 出了之後誰都不能再疊 |
| **+4 質疑** | 關 | 被 +4 的人可以質疑「他手上其實有原本的顏色」。猜對 → 出 +4 的人吃下整疊、亮出那個顏色的牌，你照常出牌；猜錯 → 你吃下整疊再多 2 張。疊加中、手上有 + 也可以質疑 |
| **0/7 換牌** | 關 | 出 0 大家的手牌往出牌方向傳，出 7 跟自己選的一個人交換手牌 |

🪞 鏡子不是疊上去，是把整疊彈回去，所以疊加關掉、+99 封頂的時候還是能用。

## 🧱 技術

| | |
| --- | --- |
| `client/` | React 19 + React Three Fiber + Vite，Discord Embedded App SDK |
| `server/` | Colyseus 0.18 + Express，順便處理 Discord OAuth 換 token |
| `shared/` | 遊戲規則引擎（純 TypeScript，前後端共用），牌的定義在 `shared/src/cards/` |
| `scripts/` | 正式版啟動、機器人、瀏覽器測試 |

伺服器是唯一的真相：規則全在伺服器跑，每個玩家只拿得到自己看得到的資料（看不到別人的手牌）。

## 🚀 開發

需要 Node.js 22 以上。

```bash
npm install
cp .env.example .env   # 只在瀏覽器測試的話可以先不填
npm run dev
```

- 網頁：<http://localhost:5173>（Vite，會把 `/api`、`/colyseus` 轉到遊戲伺服器）
- 遊戲伺服器：固定 4567 port

### 不開 Discord，直接在瀏覽器玩

直接開 <http://localhost:5173>，每開一個分頁就是一個玩家。網址參數：

- `?room=xxx`：同一個 room 的人進同一桌（預設 `local`）
- `?name=xxx`：直接指定名字，不跳輸入框

### 機器人

```bash
npx tsx scripts/bots.mts 3 bots   # 3 個機器人進 room=bots
```

再開 <http://localhost:5173/?room=bots> 跟它們一起玩。環境變數 `DELAY=1500` 讓它們出牌慢一點；`SEVEN_ZERO=1`、`GAME_MINUTES=n`、`CRAZY=1`（怪牌全開）、`RULES=challenge,stackUp,-stacking`（開關規則，`-` 是關掉）在 bot 當房主開局時生效。

### 指令

| 指令 | 用途 |
| --- | --- |
| `npm run dev` | 同時開遊戲伺服器和 Vite |
| `npm test` | 規則引擎單元測試（vitest） |
| `npm run typecheck` | 全部 workspace 型別檢查 |
| `npm run build` | 打包網頁到 `client/dist` |
| `npm start` | 正式版（見下面） |
| `npm run e2e` | 用 headless Edge 跑一整局（要先開 `npm run dev`） |
| `npm run e2e:rejoin` | 斷線重連測試 |
| `npm run e2e:sfx` | 播一遍所有音效 |
| `npm run e2e:discord` | Discord 整合測試（用 `client/mock-discord.html` 假客戶端，測授權、Rich Presence、邀請、語音、過熱、冒充別人）。`.env` 要先加 `DISCORD_MOCK_AUTH=1` 再開 `npm run dev` |

e2e 的截圖存在 `%TEMP%\crazyuno-e2e`。

## 🎮 接上 Discord

1. 到 [Discord Developer Portal](https://discord.com/developers/applications) 建一個 App
2. **OAuth2**：把 Client ID、Client Secret 填進 `.env` 的 `VITE_DISCORD_CLIENT_ID`、`DISCORD_CLIENT_SECRET`；Redirects 加一個 `https://127.0.0.1` 當佔位
3. **Activities → Settings**：打開 Activities
4. 用 cloudflared 之類的 tunnel 把網頁開到公開網址（開發時指到 5173，正式版指到 `npm start` 的 port）
5. **Activities → URL Mappings**：`/` 指到上面的網址（不含 `https://`）
6. 到語音頻道的「活動」🚀 裡開 MadCards

Activity 會跟使用者要這些權限：`identify`（名字、頭像，一定要）、`guilds`（語音頻道資訊）、`rpc.activities.write`（Rich Presence）、`rpc.voice.read`（誰在說話）。後三個是選擇性的：使用者拒絕的話會退回只要 `identify`，照樣能玩，只是那些功能關掉。

玩家加入房間時，伺服器會拿 access token 跟 Discord 確認身分，座位是用驗證過的 Discord id 認的，前端沒辦法冒充別人。

`.env` 裡 `VITE_` 開頭的值會在打包時寫死進網頁，改了要重新打包（`npm start` 會自動處理）。

## 🌐 正式部署

```bash
npm start
```

`scripts/start.mjs` 會：

1. 網頁還沒打包，或原始碼、`.env` 比 `client/dist` 新（例如剛 `git pull`）→ 先打包
2. 用 `NODE_ENV=production` 啟動遊戲伺服器，網頁也由它提供，整個遊戲只佔一個 port

Port 看 `PORT`，沒有的話看 `SERVER_PORT`（Pterodactyl 之類的面板會自動給）。

主機記憶體太小、打包被系統殺掉（`Killed`）的話：在自己電腦跑 `npm run build`，把 `client/dist` 整個傳上去，再用 `SKIP_BUILD=1 npm start` 啟動。

隱私權政策和服務條款在 `/privacy`、`/terms`，上面的聯絡方式由 `.env` 的 `VITE_CONTACT` 設定。

## 📄 授權

[GNU GPL v3](LICENSE)

MadCards 是獨立製作的遊戲，與 Mattel 或 UNO® 沒有任何關係。
