import { Hono } from 'hono';
import type { Env, WallMeta } from './types';
import { addDays, diffDays, todayBJ } from './lib/dates';
import { scheduledSync } from './scheduled';

const app = new Hono<{ Bindings: Env }>();

/** random 抽选失败时的重试次数(逐日往回) */
const RETRIES = 6;
/** /today 找不到当天时往回找的天数 */
const TODAY_FALLBACK_DAYS = 3;
/** 存档滚动窗口上限:365 天 */
const WINDOW_MAX = 365;

// 本 Worker 有两种挂载形态:通过 zone 路由挂到 api.careful.fyi/wallpaper/* 时,
// 收到的请求路径带 /wallpaper 前缀;独立部署在 workers.dev 根路径时则没有。
// 每个端点在两种路径下都注册,挂哪里都对。
const rootPaths = ['/', '/wallpaper', '/wallpaper/'];
const randomPaths = ['/random', '/wallpaper/random'];
const todayPaths = ['/today', '/wallpaper/today'];

function imageResponse(buf: ArrayBuffer, meta: WallMeta | null, today: boolean): Response {
  const headers = new Headers({
    'Content-Type': 'image/jpeg',
    // today 全网同图,可进 CDN 缓存;stale-if-error 让 cron 失速/源头异常时
    // 边缘继续供昨天的图(参考 ScreenShot 项目,最多续一天,不开天窗)
    // random 每次都要新意,禁止缓存
    'Cache-Control': today
      ? 'public, s-maxage=3600, max-age=300, stale-if-error=86400'
      : 'private, no-store',
  });
  // X-Title / X-Copyright 在写入时已是 URL 编码的 ASCII,可直接上头,取用方需 decodeURIComponent
  if (meta?.t) headers.set('X-Title', meta.t);
  if (meta?.c) headers.set('X-Copyright', meta.c);
  return new Response(buf, { headers });
}

async function readWall(env: Env, date: string): Promise<{ value: ArrayBuffer; metadata: WallMeta | null } | null> {
  const hit = await env.WALLS.getWithMetadata<WallMeta>(`w:${date}`, 'arrayBuffer');
  return hit.value ? { value: hit.value, metadata: hit.metadata } : null;
}

for (const path of rootPaths) {
  app.get(path, (c) =>
    c.text(
      [
        'Bing 壁纸 API',
        '',
        'GET /random  随机返回一张壁纸(每次不同,响应带 X-Title / X-Copyright)',
        'GET /today   返回今天的壁纸(当天未入库时自动回退最近一天)',
        '',
        'markdown 引用: ![](https://你的域名/random)',
      ].join('\n'),
    ),
  );
}

for (const path of randomPaths) {
  app.get(path, async (c) => {
    const today = todayBJ();
    const epoch = await c.env.WALLS.get('epoch');
    const age = epoch ? diffDays(today, epoch) : 8;
    const window = Math.max(1, Math.min(WINDOW_MAX, age));
    const offset = Math.floor(Math.random() * window);

    for (let attempt = 0; attempt < RETRIES; attempt++) {
      const hit = await readWall(c.env, addDays(today, -(offset + attempt)));
      if (hit) return imageResponse(hit.value, hit.metadata, false);
      // 该日期过期/缺档:逐日往回找一份最近可用的
    }
    return c.text('壁纸存档暂不可用,请稍后再试', 503, { 'Cache-Control': 'no-store' });
  });
}

for (const path of todayPaths) {
  app.get(path, async (c) => {
    const today = todayBJ();
    for (let back = 0; back <= TODAY_FALLBACK_DAYS; back++) {
      const hit = await readWall(c.env, addDays(today, -back));
      if (hit) {
        const res = imageResponse(hit.value, hit.metadata, true);
        if (back > 0) res.headers.set('X-Fallback-Date', addDays(today, -back));
        return res;
      }
    }
    return c.text('今日壁纸尚未入库,请稍后再试', 503, { 'Cache-Control': 'no-store' });
  });
}

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(scheduledSync(env).catch((e) => console.error('cron 失败:', e)));
  },
} satisfies ExportedHandler<Env>;
