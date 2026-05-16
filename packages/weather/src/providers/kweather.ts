import type { GeoPoint, WeatherCondition, WeatherSnapshot } from '@wi/core/weather';

import { latLngToKmaGrid } from './kmaGrid';
import type { WeatherProvider } from './types';

/**
 * KMA (기상청) 초단기실황 — getUltraSrtNcst.
 *
 * - Free public API hosted on data.go.kr (1M calls / month after signup).
 * - Korea-only coverage. The router falls back to OpenWeatherMap for non-KR
 *   coordinates.
 * - Set `KWEATHER_API_KEY` to the *decoded* (raw) service key. We URL-encode
 *   it ourselves so both encoded/decoded keys work.
 *
 * Endpoint: `https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst`
 * Categories returned (subset we map):
 *   T1H — 기온 (°C)
 *   REH — 습도 (%)
 *   WSD — 풍속 (m/s)
 *   RN1 — 1시간 강수량 (mm)
 *   PTY — 강수형태 (0없음/1비/2비눈/3눈/5빗방울/6빗방울눈/7눈날림)
 *   SKY — 하늘상태 (1맑음/3구름많음/4흐림)
 */
const BASE_URL =
  'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst';

interface KmaItem {
  category: string;
  obsrValue: string;
  baseDate?: string;
  baseTime?: string;
  nx?: number;
  ny?: number;
}

interface KmaResponse {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: { item?: KmaItem[] } };
  };
}

/**
 * Normalize the service key to the *decoded* form. data.go.kr shows the key
 * in two variants ("일반 인증키 Encoding" vs "Decoding"); users frequently
 * paste the wrong one. If the value still contains percent escapes we
 * decode it once so URLSearchParams can encode it cleanly without double-
 * encoding (which is the #1 cause of KMA 401 responses).
 */
function normalizeServiceKey(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.includes('%')) return trimmed;
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return trimmed;
  }
}

export function createKWeatherProvider(rawServiceKey: string): WeatherProvider {
  const serviceKey = normalizeServiceKey(rawServiceKey);
  const decodedAtBoot = serviceKey !== rawServiceKey.trim();
  if (decodedAtBoot) {
    console.warn('[kweather] service key contained %-escapes; decoded once before use');
  }
  // Sanity log: show key length + edges so we can confirm the env var actually
  // reached the lambda (and isn't truncated). We never log the full key.
  const keyFingerprint = `len=${serviceKey.length} head=${serviceKey.slice(0, 4)}… tail=…${serviceKey.slice(-4)}`;
  console.info(`[kweather] init ${keyFingerprint}`);

  return {
    id: 'kweather',
    async fetchCurrent(point: GeoPoint): Promise<WeatherSnapshot> {
      const { nx, ny } = latLngToKmaGrid(point.lat, point.lng);
      const { baseDate, baseTime } = kmaBaseDateTime(new Date());

      // Build query manually so we control encoding exactly once.
      const params = new URLSearchParams();
      params.set('serviceKey', serviceKey);
      params.set('pageNo', '1');
      params.set('numOfRows', '20');
      params.set('dataType', 'JSON');
      params.set('base_date', baseDate);
      params.set('base_time', baseTime);
      params.set('nx', String(nx));
      params.set('ny', String(ny));
      const url = `${BASE_URL}?${params.toString()}`;

      const res = await fetch(url, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        // data.go.kr usually returns 200 with an error code in the body,
        // but a true 4xx/5xx happens too. Pull the body so we surface the
        // actual reason ("SERVICE_KEY_IS_NOT_REGISTERED_ERROR" etc.).
        const body = await res.text().catch(() => '');
        console.error(`[kweather] HTTP ${res.status} body=${body.slice(0, 300)}`);
        throw new Error(`KMA responded ${res.status} ${body.slice(0, 200)}`);
      }
      // data.go.kr quirk: when the key is invalid, the server may return 200
      // with content-type text/xml carrying an "OpenAPI_ServiceResponse"
      // envelope (errMsg / returnReasonCode). Parse defensively.
      const rawBody = await res.text();
      let data: KmaResponse | undefined;
      try {
        data = JSON.parse(rawBody) as KmaResponse;
      } catch {
        const xmlReason = /<returnReasonCode>(\d+)<\/returnReasonCode>/.exec(rawBody)?.[1];
        const xmlMsg = /<returnAuthMsg>([^<]+)<\/returnAuthMsg>/.exec(rawBody)?.[1]
          ?? /<errMsg>([^<]+)<\/errMsg>/.exec(rawBody)?.[1];
        console.error(`[kweather] non-json body code=${xmlReason ?? '?'} msg=${xmlMsg ?? rawBody.slice(0, 200)}`);
        throw new Error(`KMA non-JSON: ${xmlMsg ?? xmlReason ?? 'unknown'}`);
      }
      const code = data.response?.header?.resultCode;
      if (code && code !== '00') {
        const msg = data.response?.header?.resultMsg ?? code;
        console.error(`[kweather] header code=${code} msg=${msg}`);
        throw new Error(`KMA error: ${msg}`);
      }
      const items = data.response?.body?.items?.item ?? [];
      const map: Record<string, string> = {};
      for (const it of items) map[it.category] = it.obsrValue;

      const t1h = num(map.T1H, 0);
      const reh = num(map.REH, 50);
      const wsd = num(map.WSD, 0);
      const rn1 = parseRn1(map.RN1);
      const pty = num(map.PTY, 0);
      const sky = num(map.SKY, 1);

      return {
        location: { ...point, label: point.label },
        observedAt: kmaToISO(baseDate, baseTime),
        temperatureC: Math.round(t1h * 10) / 10,
        condition: mapCondition(pty, sky),
        humidity: Math.round(reh),
        windKph: Math.round(wsd * 3.6 * 10) / 10,
        precipitationMm: Math.round(rn1 * 10) / 10,
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
    throw new Error('Use createKWeatherProvider(serviceKey) — direct call deprecated.');
  },
};

// ── helpers ──────────────────────────────────────────────────────────────

function num(s: string | undefined, fallback: number): number {
  if (!s) return fallback;
  const n = Number(s);
  return Number.isFinite(n) ? n : fallback;
}

/** "강수없음" → 0, "30.0mm 이상" → 30, "1.5" → 1.5 */
function parseRn1(s: string | undefined): number {
  if (!s) return 0;
  if (s.includes('없음')) return 0;
  const m = /([\d.]+)/.exec(s);
  return m ? Number(m[1]) : 0;
}

function mapCondition(pty: number, sky: number): WeatherCondition {
  if (pty === 3 || pty === 7) return 'snow';
  if (pty === 2 || pty === 6) return 'snow'; // rain+snow → treat as snow visually
  if (pty === 1 || pty === 5) return 'rain';
  if (sky >= 4) return 'clouds';
  if (sky === 3) return 'clouds';
  return 'clear';
}

/**
 * KMA 초단기실황은 매시 40분 이후 호출 가능 (전 시각 정시 관측이 그때 게시).
 * 현재 분이 40 미만이면 한 시간 전 정시 데이터를 요청.
 */
export function kmaBaseDateTime(now: Date): { baseDate: string; baseTime: string } {
  const t = new Date(now.getTime());
  if (t.getMinutes() < 40) t.setHours(t.getHours() - 1);
  const yyyy = t.getFullYear();
  const mm = String(t.getMonth() + 1).padStart(2, '0');
  const dd = String(t.getDate()).padStart(2, '0');
  const hh = String(t.getHours()).padStart(2, '0');
  return { baseDate: `${yyyy}${mm}${dd}`, baseTime: `${hh}00` };
}

function kmaToISO(baseDate: string, baseTime: string): string {
  const y = baseDate.slice(0, 4);
  const mo = baseDate.slice(4, 6);
  const d = baseDate.slice(6, 8);
  const h = baseTime.slice(0, 2);
  const mi = baseTime.slice(2, 4);
  // KMA reports KST. Construct a KST ISO and let Date normalize to UTC.
  return new Date(`${y}-${mo}-${d}T${h}:${mi}:00+09:00`).toISOString();
}
