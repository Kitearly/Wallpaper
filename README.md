# Wallpaper API · Bing 壁纸动态图 API

运行在 Cloudflare Workers 上的极简动态图片 API,每天自动镜像 Bing 每日壁纸,随机展示,适合博客文章封面配图等用途。

两种路径形态等价(根路径部署或挂到 `api.careful.fyi/wallpaper/*` 均可用):

```
GET /wallpaper/random → 随机返回一张壁纸(每次不同)
GET /wallpaper/today  → 返回今天的壁纸(尚未入库时自动回退最近一天)
```

服务端点用路径区分资源(Favicon/ScreenShot 是单端点靠 query 传参,这里不同),所以端点同时注册了带前缀与不带前缀两套路径,挂载形态 100% 无关。

## 特点

- **零外部数据库**:存档在 Cloudflare KV,单个键 = 一天的 1920x1080 JPEG(约 300KB),标题/版权放在 KV metadata
- **滚动一年**:每个键 TTL 365 天,存档稳态约 365 张 / 120MB,永不增长
- **每天 1 个 put**:Cron(北京时间 00:00 / 02:30 两次)拉 Bing 官方接口,补最近 8 天缺口,天然容错漏跑
- **几乎零成本**:免费额度(10 万读/天、1 千写/天、1GB 存储)全程无感,不需要 R2/D1/任何付费开通
- **响应自带元数据**:`X-Title` / `X-Copyright`(写入时已 URL 编码,取用需 `decodeURIComponent`),`/today` 回退时带 `X-Fallback-Date`
- **缓存**:今天图走 CDN 缓存(`/today` 平均 1 小时刷新),随机图 `no-store` 保证每次都不同;`stale-if-error=86400` 让源头异常时边缘最多续供一天旧图

## 使用

markdown 直接引用即可:

```markdown
![封面](https://api.careful.fyi/wallpaper/random)
```

```js
const res = await fetch('https://api.careful.fyi/wallpaper/today');
const title = decodeURIComponent(res.headers.get('X-Title') ?? '');
// res.headers.get('X-Copyright') 同理
```

根路径形态(挂在自己的域名或 workers.dev 时):

```markdown
![封面](https://你的域名/random)
```

## 本地开发

```bash
npm install
npm run dev            # http://127.0.0.1:8789
# 手动触发一次存档同步:
curl "http://127.0.0.1:8789/__scheduled?cron=*+*+*+*+*"
```

## 部署

KV 命名空间 ID 已写入 `wrangler.jsonc`,本项目通过 GitHub push 的 Workers Builds 自动部署。

- Zone 路由 `api.careful.fyi/wallpaper/*` 已在 Dashboard(DNS → Workers 路由)配置,指向 `wallpaper` worker
- 若要独立域名/workers.dev 根路径使用,部署后无需任何额外配置,root 路径端点直接可用
- 生产环境手动触发存档同步:Dashboard → wallpaper worker → Cron triggers → Run(仅 wrangler dev 暴露 `/__scheduled`,生产不可用)

上线后 Workers 会访问 `cn.bing.com` 与 `th.bing.com` 拉取数据,其余时间自动 cron 维护。

## 结构

```
src/
├── index.ts       # Hono 路由:/random、/today 双路径注册 + scheduled 入口
├── scheduled.ts   # Cron 拉取 Bing API、镜像 1080p 入 KV(TTL 365 天)
├── lib/dates.ts   # 北京时区的日期工具(日期即索引,滚动窗口取随机)
└── types.ts
```

> 图片版权归 Bing 及各版权方,仅建议个人用途展示,注明来源更佳。
