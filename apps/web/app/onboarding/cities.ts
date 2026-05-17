/**
 * Manual-fallback city catalogue for users who decline browser
 * geolocation. Coordinates target a representative central district
 * of each city — close enough that KWeather's dong-level data
 * grabs a sensible reading for any user who picks "부산" without
 * caring which dong.
 *
 * Curated for mainland Korea + Jeju. The full sgg lookup in
 * packages/weather/src/providers/krSggCodes.ts covers many more
 * codes but is targeting the weather provider's matching logic,
 * not human-readable picking — this list is the shorter version
 * built for an onboarding dropdown.
 *
 * Sort order: largest cities first, then by region.
 */
export interface CityChoice {
  id: string;
  label: string; // shown in the dropdown
  lat: number;
  lng: number;
}

export const KR_CITIES: CityChoice[] = [
  { id: 'seoul_gangnam', label: '서울 강남구', lat: 37.498, lng: 127.028 },
  { id: 'seoul_jongno', label: '서울 종로구', lat: 37.573, lng: 126.979 },
  { id: 'busan_haeundae', label: '부산 해운대구', lat: 35.163, lng: 129.163 },
  { id: 'incheon_namdong', label: '인천 남동구', lat: 37.447, lng: 126.732 },
  { id: 'daegu_suseong', label: '대구 수성구', lat: 35.858, lng: 128.631 },
  { id: 'daejeon_seogu', label: '대전 서구', lat: 36.355, lng: 127.384 },
  { id: 'gwangju_seogu', label: '광주 서구', lat: 35.152, lng: 126.890 },
  { id: 'ulsan_namgu', label: '울산 남구', lat: 35.544, lng: 129.330 },
  { id: 'suwon_yeongtong', label: '수원 영통구', lat: 37.259, lng: 127.046 },
  { id: 'seongnam_bundang', label: '성남 분당구', lat: 37.382, lng: 127.119 },
  { id: 'chuncheon', label: '강원 춘천', lat: 37.881, lng: 127.730 },
  { id: 'gangneung', label: '강원 강릉', lat: 37.751, lng: 128.876 },
  { id: 'jeonju', label: '전북 전주', lat: 35.824, lng: 127.148 },
  { id: 'cheongju', label: '충북 청주', lat: 36.642, lng: 127.489 },
  { id: 'changwon', label: '경남 창원', lat: 35.227, lng: 128.682 },
  { id: 'jeju', label: '제주시', lat: 33.499, lng: 126.531 },
];
