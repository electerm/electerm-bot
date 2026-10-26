# electerm-bot

克制的 electerm 社交机器人：每天最多发 1 条（新 release 或新 blog），偶尔回复相关提及。内容用 LLM 润色（OpenAI 兼容接口），没有 LLM 时退回模板文案。

## 特点

- **克制**：每天最多 1 条帖子；每天最多 `REPLIES_PER_DAY` 条回复（默认 3）；拿不准的提及直接跳过
- **内容源**：GitHub Releases（electerm/electerm）+ 官网博客（electerm/electerm.org 的 `src/blogs/`）
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
| Facebook | 公共主页 + Meta 开发者应用（`pages_manage_posts`、`pages_read_engagement` 权限），长期有效的 Page Access Token，填 `FACEBOOK_PAGE_ID` + `FACEBOOK_PAGE_TOKEN` |
| 微博 | open.weibo.com 创建并审核通过的应用，OAuth2 拿 `WEIBO_ACCESS_TOKEN`（普通 token 约 90 天过期，到期需重新授权） |

LLM 用任意 OpenAI 兼容网关（你自己的 cf-ai-proxy 也行），填 `OPENAI_BASE_URL` / `OPENAI_API_KEY` / `LLM_MODEL`。

### 国内平台现状说明

- **微博**：有开放 API，已支持（发帖 + 提及回复用评论）
- **微信公众号**：有 API 但要求认证服务号，且群发图文必须带封面图（要先上传素材拿 thumb_media_id），流程重；如需要可以再加
- **知乎 / 小红书 / 抖音**：没有面向个人开发者的开放文本发帖 API，做不了（小红书仅电商场景、抖音以视频为主），不建议碰

## 防刷屏机制

- `MIN_RELEASE_DATE`：早于此的 release 不发（避免首次运行把历史版本全发一遍）
- 发过/回过的 id 永久记录，不会重复
- 没有新内容当天就不发（想每天固定发可以自己加个"回顾旧博客"源）
- DRY_RUN=true 时一切只打印

## 调整

- 发帖时间：`DAILY_POST_TIME`（服务器时区）；文案长度：`POST_MAX_CHARS`（X 用 280）
- 回复频率：`REPLY_SCAN_MINUTES` + `REPLIES_PER_DAY`
