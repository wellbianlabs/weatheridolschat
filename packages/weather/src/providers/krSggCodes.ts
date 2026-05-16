/**
 * Korea 시군구(SGG) lookup table for KWeather B2B.
 *
 * The B2B contract this app uses does *not* include `kw-gis-gps` (the GPS →
 * 행정동 resolver), so we ship a local haversine table to find the nearest
 * 시군구 code from a raw lat/lon. This trades ~120 hard-coded rows for one
 * round-trip and works fully offline.
 *
 * Coverage: 서울 25 + 광역시(부산/대구/인천/광주/대전/울산) + 세종 + 9개도 주요
 * 시·군. We don't need 100% of the 250-ish 시군구 — the haversine snaps the
 * coordinate to the nearest entry, so a row that covers an adjacent county
 * is "good enough" for chat context (temperature drift ≤ 1°C over 20km).
 *
 * Codes are the KWeather/KMA `법정코드` 10-digit format with `00000` suffix
 * (시군구-level placeholder). They feed `kw-odam2` directly.
 *
 * If you need finer accuracy later, expand this list or wire up
 * `kw-code-city2` to drill down to 읍면동.
 */
export interface SggEntry {
  /** Full 10-digit 시군구 code for kw-odam2 (e.g. "1168000000"). */
  code: string;
  /** Short display name (시군구). Used only for log lines. */
  name: string;
  lat: number;
  lng: number;
}

export const KR_SGG_TABLE: readonly SggEntry[] = [
  // 서울특별시 (11) — 25개 구
  { code: '1111000000', name: '서울 종로구', lat: 37.594, lng: 126.977 },
  { code: '1114000000', name: '서울 중구', lat: 37.564, lng: 126.997 },
  { code: '1117000000', name: '서울 용산구', lat: 37.532, lng: 126.991 },
  { code: '1120000000', name: '서울 성동구', lat: 37.563, lng: 127.037 },
  { code: '1121500000', name: '서울 광진구', lat: 37.538, lng: 127.082 },
  { code: '1123000000', name: '서울 동대문구', lat: 37.574, lng: 127.04 },
  { code: '1126000000', name: '서울 중랑구', lat: 37.606, lng: 127.092 },
  { code: '1129000000', name: '서울 성북구', lat: 37.589, lng: 127.017 },
  { code: '1130500000', name: '서울 강북구', lat: 37.64, lng: 127.025 },
  { code: '1132000000', name: '서울 도봉구', lat: 37.669, lng: 127.047 },
  { code: '1135000000', name: '서울 노원구', lat: 37.654, lng: 127.056 },
  { code: '1138000000', name: '서울 은평구', lat: 37.603, lng: 126.929 },
  { code: '1141000000', name: '서울 서대문구', lat: 37.579, lng: 126.937 },
  { code: '1144000000', name: '서울 마포구', lat: 37.566, lng: 126.901 },
  { code: '1147000000', name: '서울 양천구', lat: 37.517, lng: 126.866 },
  { code: '1150000000', name: '서울 강서구', lat: 37.551, lng: 126.85 },
  { code: '1153000000', name: '서울 구로구', lat: 37.495, lng: 126.888 },
  { code: '1154500000', name: '서울 금천구', lat: 37.457, lng: 126.895 },
  { code: '1156000000', name: '서울 영등포구', lat: 37.526, lng: 126.896 },
  { code: '1159000000', name: '서울 동작구', lat: 37.512, lng: 126.94 },
  { code: '1162000000', name: '서울 관악구', lat: 37.478, lng: 126.952 },
  { code: '1165000000', name: '서울 서초구', lat: 37.484, lng: 127.033 },
  { code: '1168000000', name: '서울 강남구', lat: 37.517, lng: 127.047 },
  { code: '1171000000', name: '서울 송파구', lat: 37.515, lng: 127.106 },
  { code: '1174000000', name: '서울 강동구', lat: 37.53, lng: 127.124 },

  // 부산광역시 (26)
  { code: '2611000000', name: '부산 중구', lat: 35.103, lng: 129.034 },
  { code: '2614000000', name: '부산 서구', lat: 35.097, lng: 129.024 },
  { code: '2617000000', name: '부산 동구', lat: 35.129, lng: 129.045 },
  { code: '2620000000', name: '부산 영도구', lat: 35.091, lng: 129.067 },
  { code: '2623000000', name: '부산 부산진구', lat: 35.163, lng: 129.053 },
  { code: '2626000000', name: '부산 동래구', lat: 35.205, lng: 129.083 },
  { code: '2629000000', name: '부산 남구', lat: 35.137, lng: 129.084 },
  { code: '2632000000', name: '부산 북구', lat: 35.197, lng: 128.99 },
  { code: '2635000000', name: '부산 해운대구', lat: 35.163, lng: 129.164 },
  { code: '2638000000', name: '부산 사하구', lat: 35.105, lng: 128.974 },
  { code: '2641000000', name: '부산 금정구', lat: 35.243, lng: 129.092 },
  { code: '2644000000', name: '부산 강서구', lat: 35.212, lng: 128.98 },
  { code: '2647000000', name: '부산 연제구', lat: 35.176, lng: 129.079 },
  { code: '2650000000', name: '부산 수영구', lat: 35.146, lng: 129.113 },
  { code: '2653000000', name: '부산 사상구', lat: 35.153, lng: 128.991 },
  { code: '2671000000', name: '부산 기장군', lat: 35.244, lng: 129.222 },

  // 대구광역시 (27)
  { code: '2711000000', name: '대구 중구', lat: 35.869, lng: 128.606 },
  { code: '2714000000', name: '대구 동구', lat: 35.886, lng: 128.635 },
  { code: '2717000000', name: '대구 서구', lat: 35.872, lng: 128.559 },
  { code: '2720000000', name: '대구 남구', lat: 35.846, lng: 128.598 },
  { code: '2723000000', name: '대구 북구', lat: 35.886, lng: 128.583 },
  { code: '2726000000', name: '대구 수성구', lat: 35.858, lng: 128.631 },
  { code: '2729000000', name: '대구 달서구', lat: 35.83, lng: 128.533 },
  { code: '2771000000', name: '대구 달성군', lat: 35.775, lng: 128.431 },

  // 인천광역시 (28)
  { code: '2811000000', name: '인천 중구', lat: 37.473, lng: 126.622 },
  { code: '2814000000', name: '인천 동구', lat: 37.474, lng: 126.643 },
  { code: '2817700000', name: '인천 미추홀구', lat: 37.464, lng: 126.65 },
  { code: '2818500000', name: '인천 연수구', lat: 37.41, lng: 126.679 },
  { code: '2820000000', name: '인천 남동구', lat: 37.447, lng: 126.732 },
  { code: '2823700000', name: '인천 부평구', lat: 37.507, lng: 126.722 },
  { code: '2826000000', name: '인천 계양구', lat: 37.537, lng: 126.738 },
  { code: '2829000000', name: '인천 서구', lat: 37.545, lng: 126.676 },
  { code: '2871000000', name: '인천 강화군', lat: 37.747, lng: 126.488 },

  // 광주광역시 (29)
  { code: '2911000000', name: '광주 동구', lat: 35.146, lng: 126.923 },
  { code: '2914000000', name: '광주 서구', lat: 35.152, lng: 126.89 },
  { code: '2917000000', name: '광주 남구', lat: 35.133, lng: 126.902 },
  { code: '2920000000', name: '광주 북구', lat: 35.174, lng: 126.912 },
  { code: '2923000000', name: '광주 광산구', lat: 35.139, lng: 126.794 },

  // 대전광역시 (30)
  { code: '3011000000', name: '대전 동구', lat: 36.312, lng: 127.455 },
  { code: '3014000000', name: '대전 중구', lat: 36.326, lng: 127.421 },
  { code: '3017000000', name: '대전 서구', lat: 36.355, lng: 127.383 },
  { code: '3020000000', name: '대전 유성구', lat: 36.362, lng: 127.356 },
  { code: '3023000000', name: '대전 대덕구', lat: 36.347, lng: 127.415 },

  // 울산광역시 (31)
  { code: '3111000000', name: '울산 중구', lat: 35.569, lng: 129.333 },
  { code: '3114000000', name: '울산 남구', lat: 35.544, lng: 129.33 },
  { code: '3117000000', name: '울산 동구', lat: 35.505, lng: 129.417 },
  { code: '3120000000', name: '울산 북구', lat: 35.582, lng: 129.361 },
  { code: '3171000000', name: '울산 울주군', lat: 35.563, lng: 129.244 },

  // 세종특별자치시 (36)
  { code: '3611000000', name: '세종특별자치시', lat: 36.48, lng: 127.289 },

  // 경기도 (41) — 주요 시
  { code: '4111000000', name: '경기 수원시', lat: 37.263, lng: 127.029 },
  { code: '4113000000', name: '경기 성남시', lat: 37.42, lng: 127.127 },
  { code: '4115000000', name: '경기 의정부시', lat: 37.738, lng: 127.034 },
  { code: '4117000000', name: '경기 안양시', lat: 37.394, lng: 126.957 },
  { code: '4119000000', name: '경기 부천시', lat: 37.503, lng: 126.766 },
  { code: '4121000000', name: '경기 광명시', lat: 37.479, lng: 126.865 },
  { code: '4122000000', name: '경기 평택시', lat: 36.992, lng: 127.087 },
  { code: '4125000000', name: '경기 동두천시', lat: 37.903, lng: 127.06 },
  { code: '4127000000', name: '경기 안산시', lat: 37.322, lng: 126.831 },
  { code: '4128000000', name: '경기 고양시', lat: 37.658, lng: 126.832 },
  { code: '4129000000', name: '경기 과천시', lat: 37.429, lng: 126.988 },
  { code: '4131000000', name: '경기 구리시', lat: 37.594, lng: 127.13 },
  { code: '4133000000', name: '경기 남양주시', lat: 37.636, lng: 127.216 },
  { code: '4135000000', name: '경기 오산시', lat: 37.15, lng: 127.077 },
  { code: '4137000000', name: '경기 시흥시', lat: 37.38, lng: 126.803 },
  { code: '4139000000', name: '경기 군포시', lat: 37.361, lng: 126.935 },
  { code: '4141000000', name: '경기 의왕시', lat: 37.345, lng: 126.968 },
  { code: '4143000000', name: '경기 하남시', lat: 37.539, lng: 127.215 },
  { code: '4145000000', name: '경기 용인시', lat: 37.241, lng: 127.178 },
  { code: '4146000000', name: '경기 파주시', lat: 37.76, lng: 126.78 },
  { code: '4148000000', name: '경기 이천시', lat: 37.272, lng: 127.435 },
  { code: '4150000000', name: '경기 안성시', lat: 37.008, lng: 127.27 },
  { code: '4155000000', name: '경기 김포시', lat: 37.615, lng: 126.716 },
  { code: '4157000000', name: '경기 화성시', lat: 37.199, lng: 126.831 },
  { code: '4159000000', name: '경기 광주시', lat: 37.429, lng: 127.255 },
  { code: '4161000000', name: '경기 양주시', lat: 37.785, lng: 127.046 },
  { code: '4163000000', name: '경기 포천시', lat: 37.895, lng: 127.2 },
  { code: '4165000000', name: '경기 여주시', lat: 37.298, lng: 127.637 },

  // 강원도 (51)
  { code: '5111000000', name: '강원 춘천시', lat: 37.881, lng: 127.73 },
  { code: '5113000000', name: '강원 원주시', lat: 37.342, lng: 127.92 },
  { code: '5115000000', name: '강원 강릉시', lat: 37.752, lng: 128.876 },
  { code: '5117000000', name: '강원 동해시', lat: 37.524, lng: 129.114 },
  { code: '5119000000', name: '강원 태백시', lat: 37.164, lng: 128.985 },
  { code: '5121000000', name: '강원 속초시', lat: 38.207, lng: 128.591 },
  { code: '5123000000', name: '강원 삼척시', lat: 37.45, lng: 129.165 },

  // 충청북도 (43)
  { code: '4311000000', name: '충북 청주시', lat: 36.642, lng: 127.489 },
  { code: '4313000000', name: '충북 충주시', lat: 36.991, lng: 127.926 },
  { code: '4315000000', name: '충북 제천시', lat: 37.133, lng: 128.191 },

  // 충청남도 (44)
  { code: '4413000000', name: '충남 천안시', lat: 36.815, lng: 127.114 },
  { code: '4415000000', name: '충남 공주시', lat: 36.447, lng: 127.119 },
  { code: '4418000000', name: '충남 보령시', lat: 36.333, lng: 126.612 },
  { code: '4420000000', name: '충남 아산시', lat: 36.79, lng: 127.002 },
  { code: '4421000000', name: '충남 서산시', lat: 36.785, lng: 126.45 },
  { code: '4423000000', name: '충남 논산시', lat: 36.187, lng: 127.099 },
  { code: '4425000000', name: '충남 계룡시', lat: 36.275, lng: 127.249 },
  { code: '4427000000', name: '충남 당진시', lat: 36.892, lng: 126.646 },

  // 전라북도 (52, 구 45) — 통합 코드
  { code: '5211000000', name: '전북 전주시', lat: 35.824, lng: 127.148 },
  { code: '5213000000', name: '전북 군산시', lat: 35.967, lng: 126.737 },
  { code: '5215000000', name: '전북 익산시', lat: 35.948, lng: 126.957 },
  { code: '5217000000', name: '전북 정읍시', lat: 35.57, lng: 126.856 },
  { code: '5219000000', name: '전북 남원시', lat: 35.416, lng: 127.39 },
  { code: '5221000000', name: '전북 김제시', lat: 35.803, lng: 126.881 },

  // 전라남도 (46)
  { code: '4611000000', name: '전남 목포시', lat: 34.812, lng: 126.392 },
  { code: '4613000000', name: '전남 여수시', lat: 34.76, lng: 127.662 },
  { code: '4615000000', name: '전남 순천시', lat: 34.95, lng: 127.487 },
  { code: '4617000000', name: '전남 나주시', lat: 35.016, lng: 126.711 },
  { code: '4623000000', name: '전남 광양시', lat: 34.94, lng: 127.696 },

  // 경상북도 (47)
  { code: '4711000000', name: '경북 포항시', lat: 36.019, lng: 129.343 },
  { code: '4713000000', name: '경북 경주시', lat: 35.856, lng: 129.225 },
  { code: '4715000000', name: '경북 김천시', lat: 36.14, lng: 128.114 },
  { code: '4717000000', name: '경북 안동시', lat: 36.568, lng: 128.729 },
  { code: '4719000000', name: '경북 구미시', lat: 36.119, lng: 128.345 },
  { code: '4721000000', name: '경북 영주시', lat: 36.806, lng: 128.624 },
  { code: '4723000000', name: '경북 영천시', lat: 35.973, lng: 128.939 },
  { code: '4725000000', name: '경북 상주시', lat: 36.41, lng: 128.159 },
  { code: '4728000000', name: '경북 문경시', lat: 36.587, lng: 128.187 },
  { code: '4729000000', name: '경북 경산시', lat: 35.825, lng: 128.741 },

  // 경상남도 (48)
  { code: '4812000000', name: '경남 창원시', lat: 35.228, lng: 128.682 },
  { code: '4817000000', name: '경남 진주시', lat: 35.18, lng: 128.108 },
  { code: '4822000000', name: '경남 통영시', lat: 34.854, lng: 128.433 },
  { code: '4824000000', name: '경남 사천시', lat: 35.004, lng: 128.064 },
  { code: '4825000000', name: '경남 김해시', lat: 35.229, lng: 128.889 },
  { code: '4827000000', name: '경남 밀양시', lat: 35.504, lng: 128.747 },
  { code: '4831000000', name: '경남 거제시', lat: 34.881, lng: 128.621 },
  { code: '4833000000', name: '경남 양산시', lat: 35.335, lng: 129.038 },

  // 제주특별자치도 (50)
  { code: '5011000000', name: '제주시', lat: 33.499, lng: 126.531 },
  { code: '5013000000', name: '서귀포시', lat: 33.254, lng: 126.56 },
];

/**
 * Find the nearest 시군구 entry to a given lat/lon (haversine, km).
 * Returns null if no entry is within reasonable KR distance (200km), which
 * lets the router cascade to OpenWeatherMap/Open-Meteo for overseas coords.
 */
export function findNearestSggCode(
  lat: number,
  lng: number,
  maxKm = 200,
): { code: string; name: string; distKm: number } | null {
  let best: { code: string; name: string; distKm: number } | null = null;
  for (const row of KR_SGG_TABLE) {
    const d = haversineKm(lat, lng, row.lat, row.lng);
    if (best === null || d < best.distKm) {
      best = { code: row.code, name: row.name, distKm: d };
    }
  }
  if (best && best.distKm <= maxKm) return best;
  return null;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
