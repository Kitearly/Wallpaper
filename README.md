# Wallpaper API · Bing 壁纸动态图 API

运行在 Cloudflare Workers 上的极简动态图片 API,每天自动镜像 Bing 每日壁纸,随机展示,适合博客文章封面配图等用途。

```
GET /random  → 随机返回一张壁纸(每次不同)
GET /today   → 返回今天的壁纸(尚未入库时自动回退最近一天)
```

## 特点

- **零外部数据库**:存档在 Cloudflare KV,单个键 = 一天的 1920x1080 JPEG(约 300KB),标题/版权放在 KV metadata
- **滚动一年**:每个键 TTL 365 天,存档稳态约 365 张 / 120MB,永不增长
- **每天 1 个 put**:Cron(北京时间 00:00 / 02:30 两次)拉 Bing 官方接口,补最近 8 天缺口,天然容错漏跑
- **几乎零成本**:免费额度(10 万读/天、1 千写/天、1GB 存储)全程无感,不需要 R2/D1/任何付费开通
- **响应自带元数据**:`X-Title` / `X-Copyright`(URL 编码,需 `decodeURIComponent`),`/today` 回退时带 `X-Fallback-Date`

## 使用

markdown 直接引用即可:

```markdown
![封面](https://你的域名/random)
```

```js
const res = await fetch('https://你的域名/today');
const title = decodeURIComponent(res.headers.get('X-Title') ?? '');
// res.headers.get('X-Copyright') 同理
```

## 本地开发

```bash
npm install
npm run dev            # http://127.0.0.1:8789
# 手动触发一次存档同步:
curl "http://127.0.0.1:8789/__scheduled?cron=*+*+*+*+*"
```

## 部署

```bash
npx wrangler kv namespace create WALLS   # 生成命名空间
# 把输出的 id 填进 wrangler.jsonc 的 kv_namespaces[].id
npm run deploy
```

上线后 Workers 会访问 `cn.bing.com` 与 `th.bing.com` 拉取数据,其余时间自动 cron 维护。

## 结构

```
src/
├── index.ts       # Hono 路由:/random、/today + scheduled 入口
├── scheduled.ts   # Cron 拉取 Bing API、镜像 1080p 入 KV(TTL 365 天)
├── lib/dates.ts   # 北京时区的日期工具(日期即索引,滚动窗口取随机)
└── types.ts
```

> 图片版权归 Bing 及各版权方,仅建议个人用途展示,注明来源更佳。
