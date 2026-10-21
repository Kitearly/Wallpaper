/**
 * 所有"日期"都指 Bing 的更新日历:中国标准时间(UTC+8)的自然日。
 * 键与查找均使用 YYYY-MM-DD 字符串。
 */

const DAY_MS = 86_400_000;
const BEIJING_OFFSET_MS = 8 * 3_600_000;

/** 把墙钟毫秒数平移到北京时区后,取 UTC 部件即北京日历 */
function bjDate(ms: number): Date {
  return new Date(ms + BEIJING_OFFSET_MS);
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function formatUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 现在的北京日期 */
export function todayBJ(): string {
  return formatUTC(bjDate(Date.now()));
}

/** 日期加减 n 天(负数往回走),入参 YYYY-MM-DD,出参同 */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  return formatUTC(new Date(Date.UTC(y, m - 1, d) + n * DAY_MS));
}

/** a - b 的自然日天数(两个北京日期字符串) */
export function diffDays(a: string, b: string): number {
  const parse = (s: string) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((parse(a) - parse(b)) / DAY_MS);
}
