# SailDesk

**Self-hosted analytics desk for SaaS sites going global.** Google Search Console, GA4 and Bing Webmaster in one password-protected dashboard, with cross-source analysis and prioritized action items. Runs on Cloudflare Workers — no database, no server to maintain.

[English](#english) · [中文](#中文)

---

## English

### What it is

SailDesk reads every Search Console property your Google account can access, pairs each one with its Google Analytics 4 property, and — optionally — its Bing Webmaster site and Umami website. A single page then shows search performance, on-site traffic, Bing visibility and self-hosted analytics side by side, plus a portfolio rollup that tells you what to fix first.

It is a **single-operator** tool: you deploy your own instance, authorize it with your own Google account, and share it with nobody. There is no sign-up, no multi-tenant layer, and no database.

### Features

- **Portfolio overview** across every verified property, with growth / decline / diverging / flat / empty filters, domain search, and sortable click and impression columns.
- **Cross-source rollup** at the top of the overview: combined GSC + GA4 + Bing (+ Umami) metrics, a per-site comparison table, and prioritized action items (missing GA4 links, high-impression low-CTR sites, declining queries, low engagement, and so on).
- **One-click export** on every site detail page — Markdown or CSV, assembled in the browser from data already on screen, so it costs no extra API calls. The Markdown file carries a "caveats" section that stops a downstream analysis model from dividing GA4 sessions by GSC clicks or reading a missing source as zero traffic.
- **Date ranges**: last 7 / 28 / 90 days or a custom window, always compared against the immediately preceding equal-length period.
- **Per-site detail**: GSC query and page breakdowns, GA4 channel sources and top pages, Bing top queries and pages, Umami pages, referrers and events.
- **Honest accounting**: properties that fail to load stay visible as error rows and are never counted as zero traffic. A portfolio with any failed property never renders a misleading total.
- **Password gate** backed by a signed, HttpOnly session cookie. One secret, no user table.

### How it works

```
Browser ── password ──▶ Worker ──┬─▶ Search Console API   (webmasters.readonly)
                                 ├─▶ Analytics Data API   (analytics.readonly)
                                 ├─▶ Analytics Admin API  (property discovery)
                                 ├─▶ Bing Webmaster API   (optional, via KV cache)
                                 └─▶ Umami API            (optional)
```

- One Google OAuth **Desktop** client produces a single refresh token, stored as a Worker Secret. The browser never sees it.
- An access token is minted per request and reused across the whole fan-out.
- The GSC overview costs roughly two Google requests per property, which keeps a ~20-property account inside the Workers free plan limit of 50 subrequests per request.
- GA4, Bing and Umami live on their own `/api/ga4/*`, `/api/bing/*` and `/api/umami/*` endpoints, so one source failing never breaks the others.
- **GA4 property linking** matches a property display name against the site domain (ignoring case, spaces and dots); when that fails it probes the property's `hostName` to see which domain it actually receives traffic from. One GA4 property links to at most one site, so nothing is double counted.
- **Bing is served from a KV cache**, not called live — see [Bing (optional)](#bing-optional). Bing throttles shared Cloudflare egress IPs, so the Worker cannot call it directly.

### Requirements

- Node.js 22+ and pnpm 10
- A Cloudflare account (Workers free plan is enough)
- A Google Cloud project with **Search Console API**, **Google Analytics Admin API** and **Google Analytics Data API** enabled
- Optional: a Bing Webmaster Tools API key, and/or a Umami API key

### Quick start

```bash
pnpm install
cp .dev.vars.example .dev.vars   # fill in the values
pnpm dev                         # http://127.0.0.1:3200
```

`pnpm install` runs `locale:compile` and `cf-typegen` as a postinstall step, so `src/locale/paraglide/` and `worker-configuration.d.ts` are generated for you. Never edit those two by hand.

### Google authorization (once)

1. In Google Cloud Console, enable **Google Search Console API**, **Google Analytics Admin API** and **Google Analytics Data API**, and configure the OAuth consent screen. While the app is in *Testing*, add your own account as a test user.
2. Create an OAuth client of type **Desktop app**. Do **not** create a Web application client — desktop clients use a local loopback redirect and need no authorized domain.
3. Run the authorization flow with the same Google account that owns your Search Console properties and GA4 properties:

```bash
GOOGLE_OAUTH_CLIENT_ID='your-desktop-client-id' \
GOOGLE_OAUTH_CLIENT_SECRET='your-desktop-client-secret' \
pnpm gsc:authorize
```

4. The command prints a refresh token. Store it as the `GSC_REFRESH_TOKEN` secret. Do not write it into `.dev.vars`, source code, or a chat message.

### Cloudflare secrets

Add these under **Workers & Pages → your worker → Settings → Variables and Secrets** as production secrets:

| Name | Value |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | the Desktop OAuth client ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | the Desktop OAuth client secret |
| `GSC_REFRESH_TOKEN` | the token printed by `pnpm gsc:authorize` |
| `DASHBOARD_PASSWORD` | the password you type to open the dashboard |
| `DASHBOARD_SESSION_SECRET` | output of `openssl rand -base64 32` |
| `BING_API_KEY` | *optional* — Bing Webmaster API key |
| `UMAMI_API_KEY` | *optional* — Umami API key |
| `UMAMI_BASE_URL` | *optional* — defaults to `https://api.umami.is/v1` |

`DASHBOARD_PASSWORD` is not optional. `workers.dev` is a public address, and without this boundary the authorized Search Console data would be readable by anyone who finds the URL.

### Bing (optional)

Bing adds a third data source: clicks, impressions, CTR, average position, and top queries and pages per site. It needs two things beyond the API key.

1. Get a key from **Bing Webmaster Tools → Settings → API access**, then add it as the `BING_API_KEY` secret.
2. Create a KV namespace and wire it up:

```bash
wrangler kv namespace create BING_CACHE
# paste the returned id into wrangler.jsonc → kv_namespaces[0].id
```

3. Seed the cache from a machine with a clean egress IP:

```bash
node scripts/seed-bing-cache.mjs --push
```

**Why a cache?** Bing rate-limits by egress IP and returns `{"ErrorCode":17,"Message":"ERROR!!! ThrottleIP"}` for shared Cloudflare Worker IP ranges. Calling Bing from inside the Worker therefore fails in production even though it works from your laptop. The Worker only reads KV; the seed script fetches from a normal network and bulk-writes the result. Cache TTL is 7 days, which matches Bing's weekly data refresh.

If the cache is cold or the key is missing, the Bing section says so and the rest of the dashboard keeps working. Run the seed script weekly (cron, GitHub Action, or a scheduled task) to keep it fresh.

### Umami (optional)

Umami adds a fourth source: pageviews, visitors, visits, bounces and total time, plus top pages, referrers and events. Both Umami Cloud and self-hosted instances work.

1. Create an API key in Umami under **Settings → API keys**.
2. Add it as the `UMAMI_API_KEY` secret. Self-hosted instances also set `UMAMI_BASE_URL` (for example `https://umami.example.com/api`); Cloud users can leave it unset and the default `https://api.umami.is/v1` applies.
3. Make sure each Umami website's **domain** matches the site hostname. The dashboard strips `www.` and compares whole hosts, so a Umami website `example.com` links to both `sc-domain:example.com` and `https://example.com/` in GSC. Domain properties also accept subdomain websites.

A missing key or an unmatched website is reported explicitly — never as zero traffic. Umami's time-series endpoint only returns pageviews and visits, so the trend chart does not invent visitor or bounce figures it does not have.

### Deploy

```bash
pnpm check      # biome + locale keys + unit tests + tsc
pnpm e2e        # Playwright, desktop and mobile
pnpm run deploy # vite build, tsc, then wrangler deploy
```

`pnpm run deploy` always builds first. Running `wrangler deploy` on its own re-uploads whatever is already in `dist/`, which is a common way to ship a stale build.

### Publishing the OAuth app to production

While the consent screen stays in *Testing*, the refresh token expires every 7 days. To stop that, publish the app — but `webmasters.readonly` and `analytics.readonly` are sensitive scopes, so Google requires:

1. **Ownership of an authorized domain** — verify it in Search Console with a domain property and a DNS TXT record.
2. **A public homepage** — `/` renders the access screen without authentication.
3. **A same-domain privacy policy** — `/privacy` is already built in and publicly reachable.

Then fill in the consent screen with your homepage, privacy policy URL and authorized domain, and click **Publish app**. `workers.dev` is a public suffix, so a custom domain is required for this step.

For a single-operator deployment this normally qualifies under Google's **personal use** exception, which skips manual review and the demo video.

### Troubleshooting

Start with `wrangler tail` to see Worker logs. The two 502s look identical in the UI but have completely different causes:

| Dashboard says | Worker log | Cause and fix |
| --- | --- | --- |
| `Token has been expired or revoked.` | `invalid_grant` | The refresh token is dead. While the consent screen is in *Testing* this happens every 7 days: rerun `pnpm gsc:authorize` and update `GSC_REFRESH_TOKEN`. |
| `Unauthorized` | `unauthorized_client` | The client secret does not match the client ID. Re-upload both secrets from a pair that works locally. |
| GA4 section says it is not authorized | 403 from Google | The refresh token lacks `analytics.readonly`. Rerun `pnpm gsc:authorize` and tick the Analytics permission. |
| GA4 section says no properties matched | all Google calls succeeded | The property names do not match the site domains and the hostname probe found nothing. Rename the GA4 property to the site domain (e.g. `example.com`) and refresh. |
| Bing section says the cache is not synced | — | Run `node scripts/seed-bing-cache.mjs --push`. See [Bing (optional)](#bing-optional). |

### Project layout

| Path | What lives there |
| --- | --- |
| `src/routes/api/` | GSC, GA4, Bing and Umami endpoints |
| `src/server/` | Google, Bing and Umami clients, dashboard auth |
| `src/features/` | Pure logic: date ranges, metrics, GA4 mapping, cross-source analysis, report export |
| `src/components/dashboard/` | UI: overview, per-site report, combined rollup, export bar |
| `scripts/` | OAuth flow, Bing cache seeding, locale key check |
| `tests/unit/` | Vitest unit tests for the pure layer |

### License

MIT — see [LICENSE](LICENSE).

---

## 中文

### 这是什么

SailDesk 是一个自托管的 SaaS 出海站点数据工作台。它会读取你的 Google 账号有权限访问的全部 Search Console 资源，为每个资源匹配对应的 GA4 媒体资源，并可选地匹配 Bing Webmaster 站点与 Umami 网站。打开一个受密码保护的页面，就能并排看到搜索表现、站内流量、Bing 收录与自建统计，顶部还有一份跨源汇总，直接告诉你先修哪个。

它是**单人使用**的工具：你自己部署实例、用自己的 Google 账号授权、不开放给任何人。没有注册、没有多租户、没有数据库。

### 功能

- **全站总览**：覆盖全部已验证资源，支持按增长 / 下降 / 走势分化 / 持平 / 无曝光筛选，支持域名搜索与点击、曝光排序。
- **跨源汇总**：总览最上方合并 GSC + GA4 + Bing（+ Umami）指标，附每站对比表与分级改进意见（未关联 GA4、曝光高但点击率低、查询下滑、互动率偏低等）。
- **一键导出**：每个单站详情页都能导出 Markdown 或 CSV。完全在浏览器里拼装，不发额外请求。Markdown 自带「口径与缺口」一节，避免下游分析模型把 GA4 会话除以 GSC 点击，或把缺失的数据源当成零流量。
- **时间维度**：最近 7 / 28 / 90 天或自定义区间，始终与紧邻的等长周期对比。
- **单站详情**：GSC 的查询词与页面明细、GA4 的渠道来源与热门页面、Bing 的热门查询与页面、Umami 的页面/来源/事件。
- **不造假数据**：读取失败的资源保留为错误行，绝不当成零流量；只要有资源失败，就不展示不完整的汇总。
- **密码保护**：签名 HttpOnly 会话 cookie，一个密钥搞定，没有用户表。

### 工作原理

```
浏览器 ── 密码 ──▶ Worker ──┬─▶ Search Console API   (webmasters.readonly)
                            ├─▶ Analytics Data API   (analytics.readonly)
                            ├─▶ Analytics Admin API  (发现媒体资源)
                            ├─▶ Bing Webmaster API   (可选，经 KV 缓存)
                            └─▶ Umami API            (可选)
```

- 一个 Google OAuth **桌面客户端**产出一个 refresh token，存为 Worker Secret，浏览器永远拿不到。
- 每次请求现签一个 access token，在整轮并发请求里复用。
- GSC 总览大约每个资源消耗 2 次 Google 请求，20 个资源仍在 Workers 免费版单请求 50 次子请求的上限内。
- GA4、Bing、Umami 各有独立的 `/api/ga4/*`、`/api/bing/*`、`/api/umami/*` 端点，一个数据源失败不影响其余几个。
- **GA4 关联规则**：先把属性显示名与站点域名做归一化匹配（忽略大小写、空格、点号）；匹配不上时用 `hostName` 探测该属性实际接收流量的域名。一个 GA4 属性最多只关联一个站点，避免重复计数。
- **Bing 走 KV 缓存**，不实时调用——见下文「Bing（可选）」。Bing 会按出口 IP 限流，Cloudflare Worker 的共享出口 IP 会被整段拦截，所以 Worker 里直接调 Bing 必然失败。

### 环境要求

- Node.js 22+ 与 pnpm 10
- Cloudflare 账号（Workers 免费版足够）
- 一个已启用 **Search Console API**、**Google Analytics Admin API**、**Google Analytics Data API** 的 Google Cloud 项目
- 可选：Bing Webmaster Tools API 密钥，和/或 Umami API 密钥

### 快速开始

```bash
pnpm install
cp .dev.vars.example .dev.vars   # 填入实际值
pnpm dev                         # http://127.0.0.1:3200
```

`pnpm install` 会通过 postinstall 自动跑 `locale:compile` 与 `cf-typegen`，生成 `src/locale/paraglide/` 与 `worker-configuration.d.ts`。这两个目录不要手改。

### Google 授权（只需一次）

1. 在 Google Cloud Console 启用 **Google Search Console API**、**Google Analytics Admin API**、**Google Analytics Data API**，并配置 OAuth 同意屏幕。应用处于「测试」状态时，把自己的账号加为测试用户。
2. 创建 **桌面应用（Desktop app）** 类型的 OAuth 客户端。**不要**建 Web application 类型——桌面客户端走本机 loopback 回调，不需要已获授权的网域。
3. 用拥有全部 Search Console 资源与 GA4 媒体资源的同一个 Google 账号完成授权：

```bash
GOOGLE_OAUTH_CLIENT_ID='你的桌面客户端 ID' \
GOOGLE_OAUTH_CLIENT_SECRET='你的桌面客户端 Secret' \
pnpm gsc:authorize
```

4. 命令会打印 refresh token。把它存为 `GSC_REFRESH_TOKEN` secret，不要写进 `.dev.vars`、代码或聊天消息。

### Cloudflare Secrets

在 **Workers 和 Pages → 你的 worker → Settings → Variables and Secrets** 添加以下生产 secret：

| 名称 | 值 |
| --- | --- |
| `GOOGLE_OAUTH_CLIENT_ID` | 桌面 OAuth 客户端 ID |
| `GOOGLE_OAUTH_CLIENT_SECRET` | 桌面 OAuth 客户端 Secret |
| `GSC_REFRESH_TOKEN` | `pnpm gsc:authorize` 输出的 token |
| `DASHBOARD_PASSWORD` | 打开看板时输入的密码 |
| `DASHBOARD_SESSION_SECRET` | `openssl rand -base64 32` 的输出 |
| `BING_API_KEY` | *可选* — Bing Webmaster API 密钥 |
| `UMAMI_API_KEY` | *可选* — Umami API 密钥 |
| `UMAMI_BASE_URL` | *可选* — 默认 `https://api.umami.is/v1` |

`DASHBOARD_PASSWORD` 不是可选项。`workers.dev` 是公开地址，没有这道边界，任何拿到 URL 的人都能读到你的 Search Console 数据。

### Bing（可选）

Bing 提供第三个数据源：点击、曝光、点击率、平均排名，以及每站的热门查询与页面。除密钥外还需要两步。

1. 在 **Bing Webmaster Tools → Settings → API access** 生成密钥，存为 `BING_API_KEY` secret。
2. 创建 KV 命名空间并接线：

```bash
wrangler kv namespace create BING_CACHE
# 把返回的 id 填进 wrangler.jsonc → kv_namespaces[0].id
```

3. 从出口 IP 干净的机器播种缓存：

```bash
node scripts/seed-bing-cache.mjs --push
```

**为什么要缓存？** Bing 按出口 IP 限流，对 Cloudflare Worker 的共享出口 IP 段会返回 `{"ErrorCode":17,"Message":"ERROR!!! ThrottleIP"}`。所以 Worker 里直接调 Bing 在线上必挂，虽然你本机 curl 是通的。Worker 只读 KV；播种脚本从普通网络抓数据后批量写入。缓存 TTL 为 7 天，正好对齐 Bing 按周更新的频率。

缓存为空或未配置密钥时，Bing 区块会显式说明，其余功能照常。建议用 cron、GitHub Action 或系统定时任务每周重新播种一次。

### Umami（可选）

Umami 提供第四个数据源：浏览量、访客、访问次数、跳出次数、停留总时长，以及热门页面、来源与事件。Cloud 版和自建版都支持。

1. 在 Umami 的 **Settings → API keys** 生成密钥。
2. 存为 `UMAMI_API_KEY` secret。自建实例还需设 `UMAMI_BASE_URL`（例如 `https://umami.example.com/api`）；Cloud 版留空即可，默认走 `https://api.umami.is/v1`。
3. 确保 Umami 里每个网站的 **domain** 与站点主机名一致。看板会去掉 `www.` 后整段比较，所以 Umami 的 `example.com` 能同时关联 GSC 的 `sc-domain:example.com` 与 `https://example.com/`。域资源还额外接受子域网站。

密钥缺失或网站匹配不上时会显式标注，绝不当成零流量。Umami 的时间序列端点只返回浏览量与访问次数，趋势图不会凭空补出访客或跳出数字。

### 部署

```bash
pnpm check      # biome + locale 校验 + 单测 + tsc
pnpm e2e        # Playwright，桌面与移动端
pnpm run deploy # vite build、tsc，然后 wrangler deploy
```

`pnpm run deploy` 一定会先构建。单独跑 `wrangler deploy` 只会重新上传 `dist/` 里已有的产物，很容易把旧构建发上线。

### 把 OAuth 应用发布到生产

同意屏幕停留在「测试」状态时，refresh token 每 7 天过期。要彻底摆脱，需要发布应用；但 `webmasters.readonly` 与 `analytics.readonly` 属于敏感权限，Google 要求：

1. **拥有 authorized domain**：在 Search Console 用网域资源 + DNS TXT 记录验证该域名。
2. **公开可访问的首页**：`/` 无需登录即可渲染访问页。
3. **同域隐私政策页**：`/privacy` 已内置且公开可达。

然后在同意屏幕填入应用主页、隐私政策 URL 与已授权域，点「发布应用」。`workers.dev` 属于公共后缀，这一步必须用自定义域名。

单人运营的部署通常符合 Google 的**个人使用（personal use）**例外，可跳过人工审核与演示视频。

### 故障排查

先用 `wrangler tail` 看 Worker 日志。两种 502 在界面上长得一样，原因完全不同：

| 界面提示 | Worker 日志 | 原因与处理 |
| --- | --- | --- |
| `Token has been expired or revoked.` | `invalid_grant` | refresh token 失效。同意屏幕在「测试」状态时每 7 天发生一次：重跑 `pnpm gsc:authorize` 并更新 `GSC_REFRESH_TOKEN`。 |
| `Unauthorized` | `unauthorized_client` | client secret 与 client ID 不配对。用本地能跑通的那组值重新上传两个 secret。 |
| GA4 区块提示未授权 | Google 返回 403 | refresh token 缺少 `analytics.readonly`。重跑 `pnpm gsc:authorize` 并勾选 Analytics 权限。 |
| GA4 区块提示没有匹配的资源 | Google 请求全部成功 | 属性名称与站点域名不一致，且主机名探测也没命中。把 GA4 属性名改成站点域名（如 `example.com`）后刷新。 |
| Bing 区块提示缓存未同步 | — | 运行 `node scripts/seed-bing-cache.mjs --push`，见「Bing（可选）」。 |

### 目录结构

| 路径 | 内容 |
| --- | --- |
| `src/routes/api/` | GSC、GA4、Bing、Umami 端点 |
| `src/server/` | Google、Bing、Umami 客户端、看板鉴权 |
| `src/features/` | 纯逻辑：日期区间、指标计算、GA4 映射、跨源分析、报告导出 |
| `src/components/dashboard/` | 界面：总览、单站报告、跨源汇总、导出条 |
| `scripts/` | OAuth 授权、Bing 缓存播种、locale 键校验 |
| `tests/unit/` | 纯逻辑层的 Vitest 单测 |

### 许可证

MIT，见 [LICENSE](LICENSE)。
