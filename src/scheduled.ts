import { addDays, todayBJ } from './lib/dates';
import type { BingImage, Env } from './types';

const BING_API = 'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=0&n=8';
const BING_IMG_HOST = 'https://th.bing.com';
const UA = 'Mozilla/5.0 (wallpaper-api; Cloudflare Workers)';
/** 档案库滚动有效期:365 天 */
const TTL_SECONDS = 365 * 86_400;
/** 必维键:存档首次建立日,random 用它推算抽选窗口 */
const EPOCH_KEY = 'epoch';
/** 新建存档时一次性补最近 N 天,保证 /random 与回退可用 */
const WARMUP_DAYS = 8;

export async function scheduledSync(env: Env): Promise<void> {
  const res = await fetch(BING_API, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`Bing API ${res.status}`);
  const { images } = (await res.json()) as { images: BingImage[] };

  const today = todayBJ();
  if ((await env.WALLS.get(EPOCH_KEY)) === null) {
    // 往前记 7 天:warmup 已经补了 8 天入档,首日随机池就该有 8 张
    await env.WALLS.put(EPOCH_KEY, addDays(today, -(WARMUP_DAYS - 1)));
  }

  // 最近 8 天逐条补齐:漏跑/首建都能自愈,幂等
  const results = await Promise.allSettled(images.map((img) => mirrorOne(env, img)));
  for (const r of results) if (r.status === 'rejected') console.error(r.reason);
}

/** 同一天只写一次:命中即跳过(图片内容永不变) */
async function mirrorOne(env: Env, img: BingImage): Promise<void> {
  if (!/^\d{8}$/.test(img.enddate)) return;
  const key = `w:${img.enddate.slice(0, 4)}-${img.enddate.slice(4, 6)}-${img.enddate.slice(6, 8)}`;
  if ((await env.WALLS.get(key)) !== null) return;

  const m = img.urlbase.match(/id=OHR\.(.+)$/);
  if (!m) throw new Error(`无法解析图名: ${img.urlbase}`);
  const url = `${BING_IMG_HOST}/th?id=OHR.${m[1]}_1920x1080.jpg`;

  const imgRes = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!imgRes.ok) throw new Error(`镜像失败 ${imgRes.status} ${img.enddate}`);
  const buf = await imgRes.arrayBuffer();
  if (buf.byteLength < 10_000) throw new Error(`疑似占位图,跳过 ${img.enddate}`);
  if (buf.byteLength > 25_000_000) throw new Error(`超出 KV 上限,跳过 ${img.enddate}`);

  // metadata 值写入时就 URL 编码(ASCII),读侧可直接作为 HTTP 头值
  const meta = {
    t: encodeURIComponent((img.title ?? img.copyright.split('(')[0] ?? '').trim().slice(0, 120)),
    c: encodeURIComponent(img.copyright.slice(0, 300)),
  };
  await env.WALLS.put(key, buf, { metadata: meta, expirationTtl: TTL_SECONDS });
  console.log(`archived ${key} (${Math.round(buf.byteLength / 1024)} KB)`);
}
