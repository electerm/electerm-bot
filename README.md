# electerm-bot

克制的 electerm 社交机器人：每天最多发 1 条（新 release 或新 blog），偶尔回复相关提及。内容用 LLM 润色（OpenAI 兼容接口），没有 LLM 时退回模板文案。

## 特点

- **克制**：每天最多 1 条帖子；每天最多 `REPLIES_PER_DAY` 条回复（默认 3）；拿不准的提及直接跳过
- **内容源**：GitHub Releases（electerm/electerm）+ 官网博客（electerm/electerm.org 的 `src/blogs/`）+ 视频（同仓库 `bin/videos.json`）
- **选材顺序**：新 release → 没发过的 blog → 没发过的视频（各自按时间从新到旧）
- **多渠道**：Telegram / Bluesky / Mastodon / X / Facebook / 微博，按 `.env` 里配置了哪个就启用哪个
- **默认 DRY_RUN**：只打印不发送，跑通后再关掉
- **有状态**：`data/state.json` 记录发过什么、回复过谁，重启不重发

## 快速开始

```bash
cp .env.example .env   # 填入账号/密钥
npm install
npm run preview        # 只看它会怎么写今天这条（不消耗状态）
npm run dry            # 干跑：走完整发帖流程但不真的发
npm start              # 长驻模式：每日定时发帖 + 定期扫描回复
```

单次执行（配合 crontab）：

```bash
node src/run.js post   # 发一次今日帖
node src/run.js reply  # 扫描一轮回复
```

## 部署到服务器

任选其一：

**pm2（最轻，无需 Docker）**

```bash
git clone <repo> ~/dev/electerm-bot && cd ~/dev/electerm-bot
cp .env.example .env && vim .env      # 填 token 和 LLM 配置
npm install --omit=dev
npm i -g pm2                          # 若未安装
npm run pm2:start                     # pm2 start ecosystem.config.cjs
pm2 save && pm2 startup               # 开机自启
```

**Docker**

```bash
cp .env.example .env && vim .env
docker compose up -d --build
docker compose logs -f
```

**systemd**

```bash
sudo rsync -a ./ /opt/electerm-bot/ --exclude node_modules
cd /opt/electerm-bot && npm install --omit=dev
sudo cp deploy/electerm-bot.service /etc/systemd/system/
sudo systemctl daemon-reload && sudo systemctl enable --now electerm-bot
```

## 账号准备

| 渠道 | 需要什么 |
| --- | --- |
| Telegram | @BotFather 建 bot 拿 token，把 bot 拉进频道并给发帖权限，`TELEGRAM_CHANNEL_ID` 填 `@频道名` |
| Bluesky | 账号 + App Password（Settings → App passwords） |
| Mastodon | Preferences → Development → New application（scope: read write），填 API URL + token |
| X | developer 账号的 4 个 OAuth1 密钥（免费层只够低频发帖） |
| Facebook | 公共主页 + Meta 开发者应用（`pages_manage_posts`、`pages_read_engagement`、`pages_manage_engagement` 权限），长期有效的 Page Access Token，填 `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_TOKEN`。**详细步骤见 [docs/facebook-setup.md](docs/facebook-setup.md)**，换 token 用 `npm run fb:token`，体检用 `npm run fb:check` |
| 微博 | open.weibo.com 创建并审核通过的应用，OAuth2 拿 `WEIBO_ACCESS_TOKEN`（普通 token 约 90 天过期，到期需重新授权） |

LLM 用任意 OpenAI 兼容网关（你自己的 cf-ai-proxy 也行），填 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `LLM_MODEL`。

### 国内平台现状说明

- **微博**：有开放 API，已支持（发帖 + 提及回复用评论）
- **微信公众号**：有 API 但要求认证服务号，且群发图文必须带封面图（要先上传素材拿 thumb_media_id），流程重；如需要可以再加
- **知乎 / 小红书 / 抖音**：没有面向个人开发者的开放文本发帖 API，做不了（小红书仅电商场景、抖音以视频为主），不建议碰

## 防刷屏机制

- **release 水位线只由 release 自己推进**：`state.releaseFloor`（外加从 `seen` 里已发布 release 的 `published_at` 反推，双保险）决定"什么是新 release"。blog / 视频的日期再旧也不会把它拉回去——之前正是因为发完 blog 后水位线被 blog 的旧日期覆盖，导致老 release 又被当成新的发了一遍
- 早于 `MIN_RELEASE_DATE` 的一律忽略，所以首次部署也不会把历史版本逐条补发
- **blog / 视频没有水位线**：只要没发过就进队列，按发布时间从新到旧，一天一条慢慢放（`seen` 保证不重复）
- 发过/回过的 id 永久记录，不会重复
- **发送前先落盘认领**：条目在真正发送前就写入 `seen`，进程被 kill / pm2 reload / 并发跑都不会重发同一条（最多一次，绝不两次）
- **单实例锁**：`data/.post.lock` 保证同一时刻只有一个发帖进程（pm2 reload 期间新旧进程并存、手跑 `npm run post` 都不会撞车）
- **state 坏了不装死也不乱发**：`state.json` 解析失败会备份成 `state.json.corrupt-<ts>`，并把 release 水位线钉在当下，只发之后的新 release
- **发送失败不消耗条目**：所有渠道都失败（一条都没发出去）时撤销认领，下轮重试（避免"静默丢弃"）
- DRY_RUN=true 时一切只打印

## 调整

- 发帖时间：`DAILY_POST_TIME`（服务器时区）；文案长度：`POST_MAX_CHARS`（X 用 280）
- 回复频率：`REPLY_SCAN_MINUTES` + `REPLIES_PER_DAY`
