# 10 · Roadmap

설계 완료(오늘) → 코드 가능한 마일스톤으로 분해. 각 단계는 데모 가능한 산출물이 명확.

## 마일스톤 요약

| 단계 | 기간 (가이드) | 산출물 |
| :-- | :-- | :-- |
| **M0 — 설계 락인** | T+0 (오늘) | `/docs` 전체 (현재 단계) |
| **M1 — 모노레포 스캐폴딩** | T+1~3일 | `apps/*`, `packages/*` 빈 빌드 통과 |
| **M2 — Supabase 스키마 + 인증** | T+4~6일 | 로그인 + 프로필 + RLS 동작 |
| **M3 — 캐릭터 선택 + Mock 채팅 (E2E)** | T+7~12일 | 4인 선택 → 채팅 → Mock 응답 스트리밍 |
| **M4 — 날씨 컨텍스트 + 이미지 생성(Mock)** | T+13~17일 | 날씨 배지, 사진 첨부 모달 |
| **M5 — 페이월 + 게이팅 UI** | T+18~21일 | 한도 도달 시 시트, Waitlist 등록 |
| **M6 — 디자인 시스템 + 다이내믹 배경** | T+22~25일 | 날씨별 배경/파티클, 캐릭터 액센트 |
| **M7 — 안전 파이프라인** | T+26~29일 | Blocklist + Moderation + Refusal |
| **M8 — 모바일 빌드 (Expo)** | T+30~33일 | Android/iOS 개발 빌드, 동일 기능 |
| **M9 — 실 AI 연동 (Beta)** | T+34~40일 | Gemini/Claude/OpenAI 어댑터 교체 |
| **M10 — 베타 출시** | T+41+ | 클로즈드 베타 100명, 분석 시작 |

> 위 일정은 1~2인 풀스택 기준. 디자인 자산(캐릭터 일러스트)이 병렬로 준비된다고 가정.

---

## M1 · 모노레포 스캐폴딩

### 산출물
- `pnpm install`이 성공
- `pnpm turbo run build`가 빈 패키지 모두 통과
- `pnpm turbo run dev --filter=web` 으로 빈 Next.js 페이지 노출

### 핵심 작업
- pnpm + Turborepo init
- `apps/web` — `pnpm create next-app` (App Router, TS, Tailwind)
- `apps/mobile` — `pnpm create expo-app` (template: tabs)
- `packages/core`, `ui`, `ai`, `db`, `weather`, `analytics`, `config` 골격 생성
- `packages/config`에 tsconfig 베이스 / eslint 베이스 / env 스키마
- NativeWind 설정 (mobile)
- import 경계 ESLint 규칙

### 완료 기준 (DoD)
- [ ] CI에서 lint + typecheck + build 통과
- [ ] 패키지 간 import 순환 X

## M2 · Supabase 스키마 + 인증

### 산출물
- Google 로그인 + 이메일 가입이 web/mobile에서 동작
- `profiles` 자동 생성
- 캐릭터 4인 seed 완료

### 핵심 작업
- Supabase 프로젝트 생성 (dev / stg / prod)
- 마이그레이션 작성 (init_schema, rls_policies, seed_characters, seed_quests)
- `packages/db`에 client 팩토리 + repositories
- `supabase gen types`로 타입 자동 생성
- 웹: `lib/supabase-server.ts`, `lib/supabase-browser.ts`
- 모바일: `lib/supabase.ts` (AsyncStorage 어댑터)
- `on_auth_user_created` 트리거 동작 확인

### DoD
- [ ] 신규 가입 후 `profiles` row 생성 확인
- [ ] 본인 외 row select 시 403
- [ ] 로그아웃·세션 갱신 정상

## M3 · 캐릭터 선택 + Mock 채팅 (E2E)

### 산출물
- 웹/모바일 동일 화면으로:
  1. 로그인 → 온보딩 → 홈
  2. 캐릭터 카드 탭 → 채팅 진입
  3. 메시지 보내기 → Mock 응답 스트리밍

### 핵심 작업
- `packages/ai/adapters/mock/chat.ts` — 키워드 응답 사전 + 80ms 토큰 스트림
- `packages/core/chat/promptBuilder.ts` (Mock에서는 단순 호출용)
- `app/api/chat/route.ts` SSE 핸들러
- `@wi/core/api` 타입드 클라이언트
- `ChatBubble`, `ChatComposer`, `CharacterCard` 컴포넌트
- 낙관적 UI + invalidation

### DoD
- [ ] 메시지 보내기→첫 토큰 도착 < 1s (Mock)
- [ ] 페이지 새로고침 시 히스토리 복원
- [ ] 모바일에서 동일 동작

## M4 · 날씨 컨텍스트 + 이미지 생성 (Mock)

### 산출물
- 채팅 상단 날씨 배지(실시간 또는 mock JSON)
- "셀카 보여줘" → Mock 이미지 메시지

### 핵심 작업
- `packages/weather/providers/mock.ts` + `kweather.ts` 스텁
- `app/api/weather/route.ts`
- 캐릭터별 mock 이미지 셋 (날씨×표정 매트릭스 4×4×3장)
- `ImageMessage` 컴포넌트, 풀스크린 모달
- 의도 분류기로 image_request 라우팅

### DoD
- [ ] 채팅 진입 시 1회 weather fetch
- [ ] 이미지 요청 → 5s 이내 카드 첨부 (Mock)

## M5 · 페이월 + 게이팅

### 산출물
- 메시지 30회 도달 시 PaywallSheet
- "관심 등록" → Waitlist DB row

### 핵심 작업
- `packages/core/monetization/gating.ts`
- 카운터 (Supabase `usage_counters` 테이블 또는 redis)
- `app/api/me/usage/route.ts`
- `PaywallSheet` 컴포넌트
- 페이월 분석 이벤트

### DoD
- [ ] 정확히 30회째에 페이월 노출
- [ ] 24시 자정 리셋

## M6 · 디자인 시스템 + 다이내믹 배경

### 산출물
- 4 캐릭터 × 7 날씨 = 28 테마 매트릭스 적용
- 비/눈/햇살/번개 파티클

### 핵심 작업
- `packages/ui/tokens/*`
- `tailwind-preset.js` 공유
- `<WeatherBackground />` (web=CSS gradient + canvas, mobile=Reanimated + Skia)
- prefers-reduced-motion 분기

### DoD
- [ ] 4 × 7 조합 시각 회귀 통과
- [ ] 모바일 60fps 유지

## M7 · 안전 파이프라인

### 산출물
- Blocklist + OpenAI Moderation + Persona Refusal 3단 적용
- `moderation_logs` 채워짐

### 핵심 작업
- `packages/core/safeguards/*`
- OpenAI Moderation 어댑터 (`packages/ai/adapters/moderation.ts`)
- 자해 핫라인 응답 템플릿
- 사용자 신고 UI + 큐

### DoD
- [ ] 평가 셋(`docs/05_AI_PROMPTS.md` §10) 100% 기대 동작
- [ ] 인젝션 페이로드 10건 모두 차단

## M8 · 모바일 빌드 (Expo)

### 산출물
- EAS Build로 Android `.apk` / iOS `.ipa`
- TestFlight / 내부 트랙 배포

### 핵심 작업
- `eas.json` 환경 분리 (development/preview/production)
- 푸시 알림 셋업 (Expo Notifications)
- 딥링크 (`weatheridols://chat/sunny`)
- 권한(위치·카메라) 안내 카피

### DoD
- [ ] 콜드 스타트 < 3s
- [ ] 푸시 → 채팅 화면 딥링크 성공

## M9 · 실 AI 연동 (Beta)

### 산출물
- Mock 어댑터 → 실제 모델로 ENV 토글
- 응답 품질 평가 셋 통과

### 핵심 작업
- Anthropic, Gemini, OpenAI SDK 어댑터 마무리
- 스트리밍 백프레셔 / 타임아웃 / 에러 폴백
- 토큰 예산 가드 (입력 4K, 출력 1K)
- 비용 대시보드 (사용자별 일 비용)

### DoD
- [ ] free 무작위 50 발화 → 평균 응답 < 3s
- [ ] premium 응답에 memory_summary 정확히 반영
- [ ] 일 사용자당 비용 < 목표값

## M10 · 클로즈드 베타 출시

### 산출물
- 100명 초청 코드 발급
- 분석 대시보드 (PostHog or Mixpanel)
- 핫픽스 채널

### 핵심 작업
- 초청 코드 시스템
- 피드백 인앱 폼 (NPS + 자유 텍스트)
- 일일 운영 데이터 리뷰 루틴

### DoD
- [ ] D7 잔존 ≥ 30%
- [ ] 크래시율 < 1%
- [ ] 평균 세션 ≥ 6분

---

## Phase 2 (출시 후 1~3개월) 후보

- 토스/Stripe 실결제
- Suno 음악 생성 (캐릭터 헌정곡)
- SeaDance 안무 영상
- 친구 초대 / 그룹 채팅 (4인 멤버 동시 등장)
- 캐릭터 시즌 코스튬 / 한정 스토리
- iOS·Android 정식 출시

## Phase 3 (6개월~)

- OmniHuman 실시간 화상통화
- Wellbian 토큰 온체인 연동
- 글로벌(JP/EN) 출시
- 음성 모드 (Realtime API)
- B2B (날씨 데이터 + 캐릭터 IP 라이선스)

---

## 측정 지표 (Continuous)

매 마일스톤 종료 시 점검:

- **품질:** crash-free %, P99 응답 latency, eval 점수
- **참여:** DAU/MAU, 세션당 메시지, D1/D7/D30
- **수익:** 페이월 conversion, ARPPU, 광고 CTR
- **안전:** 모더레이션 차단 비율, 신고 1차 대응 시간

## 의존성 / 리스크 추적

| 항목 | 대응 |
| :-- | :-- |
| AI API 가격/정책 변동 | 어댑터 추상화로 모델 교체 가능 |
| 캐릭터 일러스트 일정 | mock으로 병렬 진행, 실 자산 늦어도 M9까지 |
| Apple/Google 심사 | 베타는 TestFlight/내부 트랙, 정식은 Phase 2 |
| Nasmedia 협력 일정 | MVP는 추천 카드 UI만 유지, 실연동은 Phase 2 |
