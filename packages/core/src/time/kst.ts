/**
 * KST (Korea Standard Time, UTC+9) helpers.
 *
 * Everything in this app — chat context, daily quota reset, mock weather
 * hour-of-day — operates on Korean local time, regardless of where the
 * server (Vercel = UTC) or the user's browser actually runs. Centralising
 * the conversion here keeps the call sites short and the timezone hard-
 * coded so we never accidentally pick up the host's TZ.
 *
 * Implementation note: we use `Intl.DateTimeFormat` with `timeZone:
 * 'Asia/Seoul'` rather than the older `+09:00` offset math because Korea
 * doesn't observe DST and Node's `Intl` is reliable across Vercel/Edge/
 * RN runtimes.
 */

const KST_TZ = 'Asia/Seoul';

/** Parts pulled from a Date in KST. Easier than re-parsing formatted strings. */
function kstParts(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: KST_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    weekday: 'short',
  });
  const out: Record<string, string> = {};
  for (const p of fmt.formatToParts(d)) {
    if (p.type !== 'literal') out[p.type] = p.value;
  }
  return out;
}

/**
 * YYYY-MM-DD in KST. Used as the daily-quota reset key so the message
 * counter rolls over at Korean midnight (00:00 KST), not UTC midnight.
 *
 * Without this, a user chatting at 09:30 KST would see their quota reset
 * mid-session because UTC just rolled to a new day.
 */
export function kstDateString(now: Date = new Date()): string {
  const p = kstParts(now);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Hour 0-23 in KST. Used by the mock weather to pick a time-of-day temp. */
export function kstHour(now: Date = new Date()): number {
  const p = kstParts(now);
  return Number.parseInt(p.hour ?? '0', 10);
}

const WEEKDAY_KO: Record<string, string> = {
  Sun: '일',
  Mon: '월',
  Tue: '화',
  Wed: '수',
  Thu: '목',
  Fri: '금',
  Sat: '토',
};

/**
 * Korean-friendly current-time string for the LLM prompt context.
 * Example: `2026-05-16 (토) 13:25 KST`.
 *
 * Kept as a single line so it slots into the `[Now Context]` block of the
 * prompt without breaking line counts.
 */
export function formatKstLocalTime(now: Date = new Date()): string {
  const p = kstParts(now);
  const dow = WEEKDAY_KO[p.weekday ?? ''] ?? p.weekday ?? '';
  return `${p.year}-${p.month}-${p.day} (${dow}) ${p.hour}:${p.minute} KST`;
}

/**
 * ISO 8601 string with explicit +09:00 offset. Useful for `observedAt`
 * fields when we want the receiver to see the original KST clock time
 * rather than a UTC moment that they have to re-localise.
 *
 * Example: `2026-05-16T13:25:00+09:00`
 */
export function kstIsoString(now: Date = new Date()): string {
  const p = kstParts(now);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+09:00`;
}

/**
 * Rich KST context bundle for the prompt builder.
 *
 * The base `formatKstLocalTime()` only gives a display string. The
 * LLM can technically *infer* time-of-day, weekend, and season from
 * that — but the inference is unreliable across model versions and
 * burns tokens that should go to the response. Precomputing these
 * derived fields keeps the [Now Context] block compact AND gives
 * the model unambiguous categorical anchors ("새벽" vs "이른 아침"
 * vs "오전") that map straight onto Korean cultural expectations of
 * what someone would be doing at that moment.
 */
export type KstTimeOfDay =
  | '심야' // 0-4 — most people asleep
  | '새벽' // 5-6 — pre-dawn, quiet
  | '이른 아침' // 7-8 — wake-up, commute starts
  | '오전' // 9-11 — work/school hours
  | '점심' // 12-13 — lunch window
  | '오후' // 14-17 — afternoon productivity / school out
  | '저녁' // 18-20 — dinner / wind-down
  | '밤'; // 21-23 — late evening, pre-bed

export type KstSeason = '봄' | '여름' | '가을' | '겨울';

export interface KstContext {
  /** Human-readable display, same as formatKstLocalTime(). */
  display: string;
  /** ISO with +09:00, same as kstIsoString(). */
  iso: string;
  /** 0-23 */
  hour: number;
  /** 0-59 */
  minute: number;
  /** 'Mon'|'Tue'|...|'Sun' (English short, from Intl). */
  weekday: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  /** '월'|'화'|...|'일' */
  weekdayKo: string;
  /** Saturday or Sunday in KST. */
  isWeekend: boolean;
  /** 1-12 */
  month: number;
  /** Categorical time-of-day bucket. */
  timeOfDay: KstTimeOfDay;
  /** Meteorological season by KR convention (Mar-May spring, etc.). */
  season: KstSeason;
}

function classifyTimeOfDay(hour: number): KstTimeOfDay {
  if (hour < 5) return '심야';
  if (hour < 7) return '새벽';
  if (hour < 9) return '이른 아침';
  if (hour < 12) return '오전';
  if (hour < 14) return '점심';
  if (hour < 18) return '오후';
  if (hour < 21) return '저녁';
  return '밤';
}

function classifySeason(month: number): KstSeason {
  if (month >= 3 && month <= 5) return '봄';
  if (month >= 6 && month <= 8) return '여름';
  if (month >= 9 && month <= 11) return '가을';
  return '겨울';
}

/**
 * Single entry point for "what is the current Korean moment". Use
 * this whenever you need more than just the formatted display
 * string — e.g. the prompt builder, the scheduled-greeting cron, or
 * a UI that wants to greet the user differently on weekends.
 */
export function buildKstContext(now: Date = new Date()): KstContext {
  const p = kstParts(now);
  const hour = Number.parseInt(p.hour ?? '0', 10);
  const minute = Number.parseInt(p.minute ?? '0', 10);
  const month = Number.parseInt(p.month ?? '1', 10);
  const weekday = (p.weekday ?? 'Mon') as KstContext['weekday'];
  const weekdayKo = WEEKDAY_KO[weekday] ?? weekday;
  return {
    display: `${p.year}-${p.month}-${p.day} (${weekdayKo}) ${p.hour}:${p.minute} KST`,
    iso: `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}+09:00`,
    hour,
    minute,
    weekday,
    weekdayKo,
    isWeekend: weekday === 'Sat' || weekday === 'Sun',
    month,
    timeOfDay: classifyTimeOfDay(hour),
    season: classifySeason(month),
  };
}
