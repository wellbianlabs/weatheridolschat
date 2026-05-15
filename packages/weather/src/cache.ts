import type { GeoPoint, WeatherSnapshot } from '@wi/core/weather';

const TTL_MS = 10 * 60 * 1000;

interface Entry {
  snapshot: WeatherSnapshot;
  expires: number;
}

const memoryCache = new Map<string, Entry>();

function keyOf(point: GeoPoint): string {
  return `${point.lat.toFixed(3)},${point.lng.toFixed(3)}`;
}

export function getCached(point: GeoPoint, now = Date.now()): WeatherSnapshot | null {
  const key = keyOf(point);
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (entry.expires <= now) {
    memoryCache.delete(key);
    return null;
  }
  return entry.snapshot;
}

export function setCached(point: GeoPoint, snapshot: WeatherSnapshot, now = Date.now()): void {
  memoryCache.set(keyOf(point), { snapshot, expires: now + TTL_MS });
}
