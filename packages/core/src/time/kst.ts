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
