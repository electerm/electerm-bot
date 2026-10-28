# 获取 Facebook 发帖凭证（Page Access Token）

给 `electerm-bot` 的 Facebook 渠道用。读完你手上应该有三样东西：

| 需要的东西 | 长什么样 | 用在哪 |
| --- | --- | --- |
| Facebook **公共主页**（Page） | 一串数字 Page ID | `FACEBOOK_PAGE_ID` |
| Meta **开发者应用** | App ID + App Secret | 只用来换 token，不用写进 `.env` |
| **长期有效的 Page Access Token** | `EAAG...` 开头的一长串 | `FACEBOOK_PAGE_TOKEN` |

> **先纠正一个常见误解**：Facebook 没有"一个 API key 走天下"这种东西。你能拿到的是 App ID / App Secret / 各种 Access Token，权限范围由 token 决定。真正能发帖的只有 **Page Access Token**——它绑定"某个主页 + 某个应用 + 某个管理员"这三者的组合。

> **另一条硬限制**：Graph API **不能**往个人主页（你的 profile）或群组发帖。个人主页的发布权限 2018 年就关了；Groups API 2024 年整体下线。所以"用我的老账号自动发帖"这条路，实际形态一定是"我的老账号 → 它管理的一个公共主页 → 主页发帖"。老账号在这里的作用是**当主页管理员 + 当应用管理员**，它本身不发内容。

---

## 0. 先说结论：需不需要审核？

**不需要。** 只要满足这三个条件：

1. 应用的管理员 = 你（就是这个老账号）；
2. 要发的主页，你是管理员；
3. token 由你自己在开发者后台生成。

这种"自己给自己授权"的场景，权限走 **Standard access** 就够，**不用 App Review，不用 Advanced access，不用企业认证**。

只有当你让**别人**（对你应用没有角色的第三方）授权时，才需要审核 + Advanced access。你这不是那个场景。

---

## 1. 老账号前置检查（这一步别跳）

20 年的老账号是优势——注册时间久、有历史行为，比新注册的号更不容易被风控误杀。但"不活跃"会带来两个具体麻烦：

- **登录时要过验证**：长期未登录的账号，首次登录大概率要求短信/邮箱验证码，甚至上传证件。**先在你自己的手机 App 上正常登录几天**，让它重新变成"活跃设备"，再去碰开发者后台。
- **网络环境突变会被拦**：别在挂代理/机房的 IP 上登录 Facebook 网页版。开发者后台的操作全部在**你平时用的网络**下完成。等 token 生成好了，服务端从哪台机器调用都无所谓（token 认证不走登录风控）。

需要确认的几件事：

- [ ] 账号能正常登录，绑定了手机号（开发者注册要验证）
- [ ] 开了两步验证（Settings → Security and login → Two-factor authentication）。**开 2FA 不会影响 API 调用**，token 是独立凭证。
- [ ] 账号没有被限制发帖（随便在时间线上发一条试试，能发就正常）

---

## 2. 准备一个公共主页

已经有主页就跳到第 3 步。没有的话：

1. 打开 <https://www.facebook.com/pages/create>，填主页名称（比如 `electerm`）、分类（Software / 软件公司）。
2. 创建完，进主页 → **About / 关于** → 页面底部 **Page transparency / 主页透明度** → 里面能看到 **Page ID**。
   或者更直接：主页 URL `facebook.com/profile.php?id=123456789` 里的数字就是；新版主页 URL 里的用户名不行，那个不是 ID。
3. 确认你是这个主页的 **Admin**（主页 → Settings → Page access / 主页访问权限）。

> 全新主页刚建好就高频发帖容易被判为垃圾账号。**养几天**，手动发一两条，再上自动化。你这个 bot 一天一条，本身是安全的节奏。

---

## 3. 注册 Meta 开发者

1. 用**这个老账号**登录 <https://developers.facebook.com/>，右上角 **Get Started**。
2. 按提示验证手机号或邮箱、接受平台条款。
3. 完成。开发者身份就挂在你这个个人账号上，**不需要单独注册一个"开发者账号"**。

---

## 4. 创建应用

1. 打开 <https://developers.facebook.com/apps/creation/>
2. **App name**：随便，比如 `electerm-bot`；**Contact email**：你的邮箱。
3. **Use case**（关键）：选
   **"Manage everything on your Page"**（管理主页上的一切）
   —— 这个 use case 自带 `business_management`、`pages_show_list`、`public_profile` 三个必需权限，并且允许追加发帖/互动类权限。
   选错 use case 后面很麻烦（use case 加上去就删不掉）。
4. **Business portfolio**：选 **"I don't want to connect a business portfolio yet"**（暂不关联企业资产组合）。个人自用不需要。
5. 一路 Next → **Go to dashboard**。

### 拿到 App ID / App Secret

Dashboard → 左侧 **App settings → Basic**：

- **App ID**：一串数字
- **App Secret**：点 **Show**，可能要再输一次密码

App Secret 只在这里看得到，**复制走**。它等同于应用的密码，泄露了别人就能冒充你的应用——不要提交进 git。

### 确认发帖权限都开着

左侧 **Use cases → Manage everything on your Page → Customize / Edit**，确认这几个权限在列表里且已添加：

| 权限 | 这个 bot 用它干什么 |
| --- | --- |
| `pages_show_list` | 列出你管理的 pages，用来换 page token |
| `pages_read_engagement` | 读主页帖子、读评论（`handleReplies` 扫描用） |
| `pages_manage_posts` | 发帖（`post()` 用） |
| `pages_manage_engagement` | **以主页身份回复评论**（`handleReplies` 写评论用） |

最后这个最容易漏。少了 `pages_manage_engagement`，发帖正常、回复评论会报 `(#200)`。

### 应用模式：别乱动

- 新式（use case 流程创建的）应用**没有** Development/Live 开关，权限默认是 Standard access。保持原样即可，**不要去申请 Advanced access**，也不要提交 App Review——你不需要。
- 如果你看到老的 **App Mode: Development** 开关，**保持在 Development**。切成 Live 但权限没审核通过，反而会让权限失效。

---

## 5. 拿 token（三条路，选一条）

### 路线 A：交互式脚本（最省事，推荐）

本仓库自带 `scripts/fb-token.mjs`，把"短 token → 长期 token → page token → 验证"全串起来了：

```bash
node scripts/fb-token.mjs            # 跟着提示粘贴 App ID / App Secret / 短 token
node scripts/fb-token.mjs --write    # 同上，成功后直接写回 .env
```

短 token 从哪来？看下面的路线 B 第 1 步（Graph API Explorer）。**注意短 token 只有 1–2 小时寿命**，拿到就赶紧跑脚本。

脚本会打印：

```
FACEBOOK_PAGE_ID=1234567890
FACEBOOK_PAGE_TOKEN=EAAG...
token 类型: PAGE / 有效期: never / 主页: electerm (粉丝 123)
```

### 路线 B：手动 curl（想搞清楚原理就走这条）

**第 1 步：拿一个短命 user token**

1. 打开 <https://developers.facebook.com/tools/explorer/>
2. 右上角 **Meta App** 选你刚建的应用
3. **Permissions** 里加上：`pages_show_list`、`pages_read_engagement`、`pages_manage_posts`、`pages_manage_engagement`、`business_management`、`public_profile`
   （如果某个权限选不到，回 Dashboard 的 use case 里先把它加上）
4. 点 **Generate Access Token**，弹窗里**勾选你的主页**并授权
5. 复制 **Access Token** 框里的字符串 —— 这就是短命 user token（1–2 小时）

**第 2 步：换成 60 天的长命 user token**

```bash
curl -s "https://graph.facebook.com/v26.0/oauth/access_token?\
grant_type=fb_exchange_token&\
client_id=<APP_ID>&\
client_secret=<APP_SECRET>&\
fb_exchange_token=<短命 user token>"
```

返回：

```json
{ "access_token": "EAAG...", "token_type": "bearer", "expires_in": 5183944 }
```

`5183944` 秒 ≈ 60 天。这一步必须**在服务端/本机**做，因为要带 App Secret。

**第 3 步：用长命 user token 换 Page token**

```bash
curl -s "https://graph.facebook.com/v26.0/me/accounts?\
access_token=<长命 user token>"
```

返回里每个 page 都有 `id`、`name`、`access_token`、`tasks`：

```json
{
  "data": [{
    "access_token": "EAAG...",
    "name": "electerm",
    "id": "1234567890",
    "tasks": ["ANALYZE", "ADVERTISE", "MODERATE", "CREATE_CONTENT", "MANAGE"]
  }]
}
```

**关键点**：从**长命** user token 换出来的 page token **没有过期时间**，只有被撤销才会失效。从短命 user token 换出来的 page token 也是短命的——所以第 2 步不能跳。

`tasks` 里必须有 `CREATE_CONTENT`（发帖）和 `MODERATE`（回复评论）。

### 路线 C：Business 后台的 System User（最稳，可选）

如果你以后可能换管理员账号，或者想要一个跟个人账号解绑的 token：

1. <https://business.facebook.com/settings> → **System users / 系统用户** → Add，角色选 Admin 或 Employee
2. **Assign assets**：分配你的**应用**（给 Manage app）和**主页**（给完全控制）
3. 点 **Generate token** → 选你的应用 → 有效期选 **Never expire** → 勾上面那四个权限 → 生成

代价是要建一个 Business portfolio。个人项目用路线 A 就够了。

---

## 6. 验证 token 真的能用

**用官方调试器看有效期**：<https://developers.facebook.com/tools/debug/accesstoken/>
粘贴 token，重点看三行：

- `Type` = **Page**（如果是 User，说明你拿错了）
- `Expires` = **Never**（如果是具体时间，说明你用了短 token 链路）
- `Scopes` 包含 `pages_manage_posts`、`pages_manage_engagement`、`pages_read_engagement`

**用命令行打两个只读接口**：

```bash
# 主页信息（能返回名字就说明 token + page id 都对）
curl -s "https://graph.facebook.com/v26.0/<PAGE_ID>?fields=name,fan_count&access_token=<PAGE_TOKEN>"

# 最近帖子（验证 pages_read_engagement）
curl -s "https://graph.facebook.com/v26.0/<PAGE_ID>/posts?limit=3&access_token=<PAGE_TOKEN>"
```

**体检脚本**（读 `.env` 里现有的凭证）：

```bash
node scripts/fb-token.mjs --check
```

**最后一步，真发一条**：

```bash
# 先看它会写什么，不消耗状态、不发出去
npm run preview

# 走完整发帖流程但不真的发
npm run dry

# 确认无误后，只在 .env 里把 DRY_RUN 改成 false，再单发一次
DRY_RUN=false node src/run.js post
```

---

## 7. 报错对照表

| 报错 | 真实原因 | 怎么办 |
| --- | --- | --- |
| `(#200) The user hasn't authorized the application to perform this action` | 缺权限，或你不是该主页管理员 | 回 Explorer 重新授权；检查权限列表和主页 Admin 身份 |
| `(#190) Error validating access token: Session has expired` | 用了短命 token，或 token 被撤销 | 重走第 5 步，确保拿到 `Expires = Never` 的 page token |
| `(#190) ... because the user has changed the password` | 改过密码 / 点了"退出所有设备" | 所有 token 失效，重新生成 |
| `(#10) Application does not have permission for this action` | 权限没加到应用上 | Dashboard → Use cases 里补权限 |
| `(#100) Unsupported post request` / `nonexistent field` | `FACEBOOK_PAGE_ID` 填成了个人账号 ID 或主页用户名 | 换成纯数字 Page ID |
| `(#368) The action attempted has been deemed abusive` | 触发风控（频率、内容、新主页） | 停 24–48 小时，降低频率，主页先手动养几天 |
| `(#4) Application request limit reached` | 应用级限流 | 等一小时。一天一条的量不可能碰到 |
| `(#803) Some of the aliases you requested do not exist` | 对象 ID 错（比如把 post id 当 page id） | 检查 ID |

---

## 8. token 会在什么时候失效

长期 Page token 没有过期时间，但**不等于永久**。以下操作会让它立刻失效：

- 改 Facebook 账号密码
- 设置里"退出所有设备"（Log out of all sessions）
- 在 Facebook 的"应用和网站"里移除这个应用
- 把该账号从主页管理员里移除
- 账号被限制/封禁
- 在调试器里手动 **Revoke**

所以别把"配置好了"当成一次性任务。`scripts/fb-token.mjs --check` 可以挂到 cron 里一周跑一次，或者干脆让发帖失败时给你报错（`src/poster.js` 已经会把渠道异常打出来）。

---

## 9. 红线（这些别做，老号也救不了）

- **不要**用 API 操作个人主页/个人账号发帖、加好友、点赞——接口早关了，硬试就是封号。
- **不要**抓取他人数据、自动评论别人帖子、批量私信。违反 Platform Terms，20 年的号一样封，而且封了申诉很难。
- **不要**买 token 或用别人应用的 token。token 绑定 app，跨 app 用直接 `(#190)`。
- **不要**把 App Secret 或 page token 提交进 git。`.env` 已在 `.gitignore` 里，别再复制到别处。
- 群组发帖：Groups API 2024 年已下线，做不了，别在这上面花时间。

---

## 10. 时间预估

| 步骤 | 耗时 |
| --- | --- |
| 老账号登录 + 开 2FA + 建主页 | 15 分钟（如果触发身份验证，可能等 1 天） |
| 注册开发者 + 建应用 + 配权限 | 10 分钟 |
| 拿 token（脚本路线） | 5 分钟 |
| 验证 + 首条真发 | 5 分钟 |

顺利的话半小时内跑通。**唯一可能卡住的是老账号的登录验证**——先把这一步过了，剩下的都是点鼠标。

---

## 附：API 版本

代码里 Graph API 版本固定在 `src/channels/facebook.js` 的 `API` 常量，当前是 **v26.0**（2026-07-29 发布）。

Meta 的版本生命周期约 2 年。历史参考：v21.0（2024-10-02 发布）可用到 **2027-01-21**。升级时只改这一行常量，接口路径和参数不变。
