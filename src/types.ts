/** Worker 绑定 */
export interface Env {
  /** 壁纸存档:b:w:{日期} → JPEG 二进制 + KV metadata */
  WALLS: KVNamespace;
}

/** KV metadata(上限 1024 字节,存标题/版权足够) */
export interface WallMeta {
  /** 标题 */
  t?: string;
  /** 版权说明 */
  c?: string;
}

/** Bing HPImageArchive 条目 */
export interface BingImage {
  /** 形如 20261021 */
  enddate: string;
  url: string;
  /** 形如 /th?id=OHR.XXX,我们的裸图名来源 */
  urlbase: string;
  copyright: string;
  title?: string;
}
