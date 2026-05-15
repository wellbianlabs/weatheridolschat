/**
 * KMA (기상청) Lambert Conformal Conic projection — converts WGS84 lat/lng
 * to KMA's grid coordinates (nx, ny). Required because KMA's 단기예보·실황 APIs
 * accept grid coords only.
 *
 * Source: KMA official "예보지점좌표" reference (2024).
 */
const RE = 6371.00877; // Earth radius (km)
const GRID = 5.0; // Grid spacing (km)
const SLAT1 = 30.0; // Projection latitude 1
const SLAT2 = 60.0; // Projection latitude 2
const OLON = 126.0; // Reference longitude
const OLAT = 38.0; // Reference latitude
const XO = 43; // Reference X
const YO = 136; // Reference Y

const DEG = Math.PI / 180.0;

export function latLngToKmaGrid(lat: number, lng: number): { nx: number; ny: number } {
  const re = RE / GRID;
  const slat1 = SLAT1 * DEG;
  const slat2 = SLAT2 * DEG;
  const olon = OLON * DEG;
  const olat = OLAT * DEG;

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = (re * sf) / Math.pow(ro, sn);

  let ra = Math.tan(Math.PI * 0.25 + lat * DEG * 0.5);
  ra = (re * sf) / Math.pow(ra, sn);
  let theta = lng * DEG - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5);
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5);
  return { nx, ny };
}
