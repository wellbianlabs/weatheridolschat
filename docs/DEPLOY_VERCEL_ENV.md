# Vercel 환경 변수 — 복붙용 가이드

Vercel `Settings → Environment Variables`에 입력할 모든 값과, 각 값을 어디서 어떻게 받는지 정리.

> **사용법**: Vercel은 환경변수 화면에서 `.env` 형식 다중 라인 붙여넣기를 지원합니다. 아래 박스를 통째로 복사 → 페이지 상단 **"Import .env File"** 또는 텍스트 영역에 붙여넣기 → 한 줄씩 자동 파싱.

---

## 🚀 Phase 1 — 지금 바로 배포 (Mock 모드)

이 한 블록만 입력하면 끝. 외부 키 0개로 운영 도메인 활성화.

```bash
# === Phase 1: 즉시 배포 (Mock 모드) ===
NODE_ENV=production
MOCK_MODE=true
NEXT_PUBLIC_APP_URL=https://weatheridolschat.vercel.app
```

| 키 | 값 | 환경 |
| :-- | :-- | :-- |
| `NODE_ENV` | `production` | Production |
| `MOCK_MODE` | `true` | Production, Preview |
| `NEXT_PUBLIC_APP_URL` | `https://weatheridolschat.vercel.app` (배정받은 도메인) | All |

**작동 결과**: 채팅·이미지·날씨 모두 Mock 응답. 캐릭터 reference 이미지·로스터 이미지는 정상 표시 (정적 자산이라 키 불필요).

---

## 🟡 Phase 2 — Supabase 연결

Supabase 프로젝트 생성 후 ([DEPLOY_SUPABASE.md](DEPLOY_SUPABASE.md) 참고), 아래 3개 추가:

```bash
# === Phase 2: Supabase ===
NEXT_PUBLIC_SUPABASE_URL=https://YOURPROJECTREF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<...>.<...>
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.<...>.<...>
```

### 어디서 받나

`https://supabase.com/dashboard/project/<your-ref>/settings/api`

| Vercel 변수 | Supabase 라벨 | 형식 | 보안 |
| :-- | :-- | :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | **Project URL** | `https://abcd1234.supabase.co` | 공개 OK |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **anon public** | JWT (1줄, 200~300자) | 공개 OK (RLS로 보호) |
| `SUPABASE_SERVICE_ROLE_KEY` | **service_role** | JWT (1줄, 200~300자) | ⛔ **절대 NEXT_PUBLIC_ X** |

---

## 🟢 Phase 3 — 실제 AI 연결 (Claude / Gemini / OpenAI / Suno)

Mock에서 실 모델로 전환:

```bash
# === Phase 3: 실제 AI ===
MOCK_MODE=false
ANTHROPIC_API_KEY=sk-ant-api03-<...>
GEMINI_API_KEY=AIza<...>
OPENAI_API_KEY=sk-proj-<...>
SUNO_API_KEY=<sunoapi.org dashboard key>
```

### 어디서 받나

| Vercel 변수 | 발급처 | 직접 링크 | 키 형식 | 비용 안내 |
| :-- | :-- | :-- | :-- | :-- |
| `ANTHROPIC_API_KEY` | Anthropic Console | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) | `sk-ant-api03-...` (108자) | 크레딧 선결제, $5/M tok |
| `GEMINI_API_KEY` | Google AI Studio | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | `AIza...` (39자) | **무료 티어 있음** — Flash 모델 |
| `OPENAI_API_KEY` | OpenAI Platform | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | `sk-proj-...` 또는 `sk-...` | gpt-image-1: $0.04/이미지 |
| `SUNO_API_KEY` | sunoapi.org | [sunoapi.org](https://sunoapi.org) → Sign up → API Keys | 임의 hex 64자 전후 | Pay-as-you-go (~$0.08/곡) |
| `SUNO_API_BASE` (옵션) | — | — | URL | 다른 Suno-호환 wrapper용 |

> 💡 **권장 순서**: 무료부터 시작 → `GEMINI_API_KEY`만 먼저 넣고 `MOCK_MODE=false`. 채팅 비용 0원으로 실 LLM 응답 확인. 그 다음에 Claude → OpenAI → Suno 순서로 추가.

> **자동 폴백 동작**:
> - `MOCK_MODE=false` + 키 1개도 없음 → 자동 Mock으로 다운그레이드 (절대 빈 응답 X)
> - free 사용자 + Gemini 키만 → Gemini 사용
> - premium 사용자 + Claude 키만 → Claude 사용
> - 이미지: OpenAI 키 없으면 Mock 이미지 유지
> - 음악: Suno 키 없으면 Mock 트랙 (Kalimba 샘플) 반환

---

## 🌤 Phase 4 — 실시간 날씨 (선택)

Mock 날씨 → 실제 관측 데이터:

```bash
# === Phase 4: Live Weather ===
# KMA 기상청 (한국 좌표면 우선 사용 — 정부 무료 공개 API)
KWEATHER_API_KEY=<data.go.kr 발급 Decoded Service Key>
# 해외 좌표 fallback (선택)
OPENWEATHERMAP_API_KEY=<32자 hex>
```

| Vercel 변수 | 발급처 | 직접 링크 | 키 형식 | 무료 한도 |
| :-- | :-- | :-- | :-- | :-- |
| `KWEATHER_API_KEY` | 공공데이터포털 (data.go.kr) | [data.go.kr](https://www.data.go.kr) → 검색 **"단기예보조회서비스"** → 활용 신청 | URL-디코딩된 인증키 (영숫자+`/`+`=`) | **1M calls / month** 무료, 한국만 |
| `OPENWEATHERMAP_API_KEY` | OpenWeather | [openweathermap.org/api](https://openweathermap.org/api) → "Current Weather Data" → 무료 가입 | 32자 hex (예: `1a2b3c4d...`) | 60 calls/min, 1M/월 |

> **라우팅 동작**:
> - 좌표가 한국(위도 33–38.6, 경도 124.5–132) 안 + `KWEATHER_API_KEY` 있음 → KMA 사용 (정부 데이터)
> - 그 외 + `OPENWEATHERMAP_API_KEY` 있음 → OpenWeatherMap
> - 둘 다 없으면 Mock

> **KMA 발급 팁**:
> 1. data.go.kr 가입 후 "단기예보조회서비스" 활용 신청 (즉시 승인)
> 2. 마이페이지 → "오픈 API" → 해당 서비스의 **"일반 인증키(Decoding)"** 값을 복사
> 3. Vercel `KWEATHER_API_KEY`에 붙여넣기. URL 인코딩은 우리 코드가 자동 처리.
> 4. 첫 호출은 활성화까지 **최대 1시간** 소요 가능.

> **OpenWeather 발급 팁**: 키 활성화는 가입 후 **최대 2시간**. 활성화 안 됐을 때 자동으로 Mock 폴백.

---

## 📋 Phase 5 — 광고/제휴 (Phase 2 출시 시)

```bash
# === Phase 5: Affiliate (선택) ===
NASMEDIA_API_KEY=<제휴 후 발급>
```

현재는 Mock product catalog 사용 중. Nasmedia 계약 체결 후 입력.

---

## 🔧 Vercel 입력 절차 (UI 가이드)

1. [vercel.com/wellbianlabs/weatheridolschat/settings/environment-variables](https://vercel.com/wellbianlabs/weatheridolschat/settings/environment-variables)
2. 상단의 **"Import .env File"** 드롭다운 클릭 → 위 블록 복붙
3. 각 변수마다 **Environment 선택**:
   - `NEXT_PUBLIC_*` → ✅ Production, ✅ Preview, ✅ Development
   - 서버 시크릿 (`*_KEY`) → ✅ Production, ✅ Preview, ⛔ Development(선택)
4. **Save**
5. **Deployments** 탭 → 최신 배포 우측 점 메뉴 → **Redeploy** (환경변수는 재배포 시 적용됨)

---

## 🛡 보안 체크리스트

- [ ] `service_role` 키에 `NEXT_PUBLIC_` prefix가 **절대** 붙어있지 않음
- [ ] AI 제공자 키들도 `NEXT_PUBLIC_` 없이 서버 전용
- [ ] `.env.local` 같은 로컬 파일이 git에 안 들어감 (이미 .gitignore에 포함)
- [ ] 키 회전 시 Vercel UI에서 값만 교체 → 자동 재배포

---

## 🆘 즉시 배포가 안 될 때

| 증상 | 해결 |
| :-- | :-- |
| `MOCK_MODE` 입력했는데도 Claude 호출 시도 | `MOCK_MODE` 값이 정확히 문자열 `true` 또는 `false`인지 확인 (대소문자 구분) |
| Supabase 호출 401 | anon key가 service key 자리에 들어갔거나 그 반대 |
| OpenAI 이미지 403 | gpt-image-1 모델은 결제 정보 필수 — Platform → Billing 추가 |
| Gemini 429 | 무료 티어 RPM(분당) 한도 초과 — 잠시 후 재시도하거나 모델을 flash-lite로 |
