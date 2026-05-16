import type { GeoPoint, WeatherCondition, WeatherSnapshot } from '@wi/core/weather';

import { findNearestSggCode } from './krSggCodes';
import type { WeatherProvider } from './types';

/**
 * KWeather B2B Gateway adapter — Wellbian API v2.6.
 *
 * The user's KWeather contract key talks to the *private* gateway, NOT the
 * data.go.kr public KMA service. They look similar (both are Korean weather
 * APIs, both use sensor-style URLs) but the auth, host, and endpoint shapes
 * are completely different:
 *
 *   Public KMA (data.go.kr)  — `?serviceKey=...` (URL-encoded), free 1M/mo
 *   KWeather B2B (this file) — `?api_key=...` (raw), paid contract
 *
 * Flow:
 *   1. Lat/lon → nearest 시군구 (sgg) code via local haversine lookup table.
 *      This contract doesn't include `kw-gis-gps`, so we resolve locally
 *      instead of making an extra round-trip.
 *   2. `kw-odam2` with sgg code → 시군구 실황 (primary).
 *   3. `kw-odam3` with 광역 prefix → 광역시도 실황 (cascade on miss).
 *   4. Router falls through to Open-Meteo if both tiers fail.
 *
 * 시군구-level resolution (~250 districts) is plenty accurate for the
 * "오늘 날씨 어때?" chat context — temperature varies by <0.5°C across a
 * single 시군구. Upgrading to dong-level would require a kw-code-city2
 * round-trip per request, which isn't worth the latency for v1.
 *
 * Env var: `KW_API_KEY` (new) — `KWEATHER_API_KEY` is accepted as a legacy
 * fallback by the chat/weather route handlers so users upgrading don't have
 * to rename their Vercel env vars.
 */
const BASE_URL = 'https://gateway.kweather.co.kr:8443/weather/w3/v2/kw-sensors';

interface KwOdamData {
  state?: string;
  city?: string;
  city2?: string;
  t1h?: number; // 기온 (°C)
  senseTemp?: number; // 체감온도 (°C)
  reh?: number; // 습도 (%)
  rn1?: number; // 1시간 강수량 (mm)
  wsd?: number; // 풍속 (m/s)
  vec?: number; // 풍향 (도)
  pty?: number; // 강수형태 (0없음 / 1비 / 2비눈 / 3눈 / 4소나기 / 5빗방울)
  wIcon?: number; // 1-12 아이콘 코드
  wText?: string; // 한글 텍스트 조건
}

interface KwEnvelope {
  error?: string; // "0" on success
  message?: string;
  data?: Record<
    string,
    { data?: KwOdamData; service?: { timestamp?: string } }
  >;
}

export function createKWeatherProvider(rawApiKey: string): WeatherProvider {
  const apiKey = rawApiKey.trim();
  // Sanity log: confirm the env var reached the lambda without leaking the key.
  console.info(
    `[kweather] init len=${apiKey.length} head=${apiKey.slice(0, 4)}… tail=…${apiKey.slice(-4)}`,
  );

  return {
    id: 'kweather',
    async fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot> {
      // ── Step 1: local lat/lon → nearest 시군구 코드 ─────────────────
      const match = findNearestSggCode(point.lat, point.lng);
      if (!match) {
        // Coordinate is outside the KR lookup table — let the router cascade.
        throw new Error('kweather: lat/lon outside KR sgg lookup table');
      }

      // ── Step 2-3: kw-odam2 → kw-odam3 cascade ──────────────────────
      const doCode = match.code.slice(0, 2) + '00000000';
      const order: Array<{ sensor: 'kw-odam2' | 'kw-odam3'; code: string; tag: string }> = [
        { sensor: 'kw-odam2', code: match.code, tag: `시군구 ${match.name}` },
        { sensor: 'kw-odam3', code: doCode, tag: `광역 ${doCode.slice(0, 2)}` },
      ];

      let data: KwOdamData | null = null;
      let usedSensor = '';
      let lastErr: Error | null = null;
      for (const { sensor, code, tag } of order) {
        try {
          const env = await kwFetch<KwEnvelope>(sensor, code, apiKey);
          data = firstDataPayload(env);
          if (data && data.t1h != null) {
            usedSensor = `${sensor} (${tag})`;
            break;
          }
        } catch (err) {
          lastErr = err as Error;
          console.warn(`[kweather] ${sensor}(${code}) miss: ${(err as Error).message}`);
        }
      }

      if (!data || data.t1h == null) {
        throw new Error(
          `kw-odam cascade exhausted (sgg=${match.code}): ${lastErr?.message ?? 'no data'}`,
        );
      }

      const label =
        [data.state, data.city, data.city2].filter(Boolean).join(' ').trim() ||
        point.label ||
        match.name;
      console.info(
        `[kweather] OK sensor=${usedSensor} t=${data.t1h}° ${data.wText ?? ''} loc="${label}"`,
      );

      return {
        location: { ...point, label },
        observedAt: new Date().toISOString(),
        temperatureC: round1(data.t1h),
        condition: mapCondition(data.pty ?? 0, data.wIcon ?? 0, data.wText ?? ''),
        humidity: Math.round(data.reh ?? 0),
        windKph: round1((data.wsd ?? 0) * 3.6),
        precipitationMm: round1(data.rn1 ?? 0),
        aqi: 0,
        provider: 'kweather',
      };
    },
  };
}

/** Legacy export — kept so existing imports keep compiling. Throws if used directly. */
export const KWeatherProvider: WeatherProvider = {
  id: 'kweather',
  async fetchCurrent(): Promise<WeatherSnapshot> {
    throw new Error('Use createKWeatherProvider(apiKey) — direct call deprecated.');
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

/** Issue one sensor call against the B2B gateway. */
async function kwFetch<T>(sensor: string, code: string, apiKey: string): Promise<T> {
  const url = `${BASE_URL}/${sensor}/${encodeURIComponent(code)}?api_key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`[kweather] HTTP ${res.status} ${sensor}/${code} body=${body.slice(0, 200)}`);
    throw new Error(`KWeather HTTP ${res.status}`);
  }
  const json = (await res.json()) as { error?: string; message?: string } & T;
  if (json.error && json.error !== '0') {
    throw new Error(json.message ?? `KWeather error code=${json.error}`);
  }
  return json as T;
}

/** Pull the first non-empty `.data` payload from the KWeather envelope. */
function firstDataPayload(env: KwEnvelope): KwOdamData | null {
  if (!env.data) return null;
  for (const entry of Object.values(env.data)) {
    if (entry?.data && Object.keys(entry.data).length > 0) return entry.data;
  }
  return null;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * KWeather → WeatherCondition mapping.
 *
 * Priority order:
 *   1. PTY (precipitation type) wins when active — most accurate "is it
 *      raining right now" signal.
 *   2. wIcon (1-12 numeric) — covers all sky states the API publishes.
 *   3. wText fallback — for rare cases with only text (offshore, edge zones).
 */
function mapCondition(pty: number, wIcon: number, wText: string): WeatherCondition {
  // 1) PTY first — direct observation beats forecast icons.
  if (pty === 3) return 'snow';
  if (pty === 2) return 'snow'; // 비/눈 → 눈으로 통일 (시각적으로 더 강한 신호)
  if (pty === 5) return 'drizzle'; // 빗방울
  if (pty === 1 || pty === 4) return 'rain'; // 비 / 소나기

  // 2) wIcon numeric (KWeather 1-12 spec)
  switch (wIcon) {
    case 1:
    case 2:
      return 'clear';
    case 3:
    case 4:
      return 'clouds';
    case 5:
    case 7:
    case 9:
      return 'rain';
    case 6:
    case 10:
      return 'snow';
    case 8:
    case 11:
      return 'thunder';
    case 12:
      return 'mist';
  }

  // 3) wText keyword fallback
  if (wText.includes('뇌우') || wText.includes('번개')) return 'thunder';
  if (wText.includes('눈') || wText.includes('진눈깨비')) return 'snow';
  if (wText.includes('비') || wText.includes('소나기')) return 'rain';
  if (wText.includes('이슬비')) return 'drizzle';
  if (wText.includes('흐림') || wText.includes('구름')) return 'clouds';
  if (wText.includes('안개')) return 'mist';
  return 'clear';
}
