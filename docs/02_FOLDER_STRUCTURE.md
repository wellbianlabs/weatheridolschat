# 02 · Folder Structure

스캐폴딩 시 그대로 `mkdir`/`pnpm create`로 만들 수 있는 트리.

## 1. 루트 레이아웃

```
weatheridolschat/
├── apps/
│   ├── web/                      # Next.js 14 (App Router)
│   └── mobile/                   # Expo SDK 51 (Expo Router)
├── packages/
│   ├── core/                     # 도메인 모델, 비즈니스 로직, 상수
│   ├── ui/                       # 공유 UI (NativeWind), 디자인 토큰
│   ├── ai/                       # LLM/이미지/음악 어댑터 + Mock
│   ├── db/                       # Supabase 클라이언트, 자동생성 타입, RLS 헬퍼
│   ├── weather/                  # 날씨 프로바이더 어댑터
│   ├── analytics/                # 이벤트 트래킹 추상화
│   └── config/                   # 환경변수 스키마, eslint/tsconfig 베이스
├── supabase/
│   ├── migrations/               # SQL 마이그레이션 (timestamped)
│   ├── functions/                # Edge Functions (Deno)
│   └── seed.sql                  # 캐릭터 4인, 샘플 quest 등
├── docs/                         # 이 디렉토리
├── .github/
│   └── workflows/                # ci.yml, deploy-web.yml, eas-mobile.yml
├── .changeset/                   # 패키지 버저닝
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── tsconfig.base.json
├── .env.example
└── README.md
```

## 2. `apps/web` (Next.js)

```
apps/web/
├── app/
│   ├── (marketing)/              # 공개 페이지 (랜딩, 약관)
│   │   ├── page.tsx              # 랜딩
│   │   ├── pricing/page.tsx
│   │   └── legal/[slug]/page.tsx
│   ├── (app)/                    # 로그인 필수 영역
│   │   ├── layout.tsx            # AuthGuard
│   │   ├── characters/page.tsx   # 캐릭터 선택
│   │   ├── chat/[characterId]/page.tsx
│   │   ├── settings/page.tsx
│   │   └── quests/page.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   └── onboarding/page.tsx
│   ├── api/
│   │   ├── chat/route.ts         # POST: 메시지 전송, SSE 스트림
│   │   ├── image/route.ts        # POST: 이미지 생성
│   │   ├── weather/route.ts      # GET: 현재 날씨
│   │   ├── quests/route.ts
│   │   ├── me/route.ts
│   │   └── auth/callback/route.ts
│   ├── layout.tsx
│   └── globals.css
├── components/                   # web 전용 컴포넌트(@wi/ui로 안 빠진 것)
├── lib/
│   ├── supabase-server.ts        # 서버 클라이언트 (cookies)
│   └── supabase-browser.ts
├── public/
├── next.config.mjs
├── tailwind.config.ts
├── postcss.config.js
└── package.json
```

## 3. `apps/mobile` (Expo)

```
apps/mobile/
├── app/                          # Expo Router (file-based)
│   ├── (auth)/
│   │   ├── login.tsx
│   │   └── onboarding.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx           # 하단 탭
│   │   ├── characters.tsx
│   │   ├── quests.tsx
│   │   └── settings.tsx
│   ├── chat/[characterId].tsx
│   ├── _layout.tsx               # Root (Providers, AuthGate)
│   └── +not-found.tsx
├── components/                   # mobile-only
├── lib/
│   └── supabase.ts               # RN용 (AsyncStorage)
├── assets/
│   ├── images/
│   └── fonts/
├── app.json                      # Expo config
├── babel.config.js
├── tailwind.config.js            # NativeWind preset
├── metro.config.js
└── package.json
```

## 4. `packages/core`

도메인 모델·순수 함수. 어떤 플랫폼 의존도 없음.

```
packages/core/
├── src/
│   ├── characters/
│   │   ├── catalog.ts            # CHARACTERS 상수 (id, name, motif, persona ref...)
│   │   ├── types.ts              # Character, CharacterId
│   │   └── personas.ts           # 캐릭터 페르소나 메타데이터
│   ├── chat/
│   │   ├── types.ts              # Message, Session, Role, Modality
│   │   ├── promptBuilder.ts      # weather + memory + persona → prompt
│   │   └── intentClassifier.ts   # 텍스트에서 image/song 요청 감지
│   ├── weather/
│   │   ├── types.ts              # WeatherCondition, WeatherSnapshot
│   │   └── normalize.ts          # provider별 응답 → 표준 스키마
│   ├── safeguards/
│   │   ├── blocklist.ts
│   │   ├── refusal.ts            # 페르소나별 우아한 거절 카피
│   │   └── pipeline.ts           # 3중 필터링 함수
│   ├── monetization/
│   │   ├── plans.ts              # FREE/PREMIUM 정의
│   │   └── gating.ts             # canUseFeature(user, feature)
│   ├── i18n/
│   │   └── messages/
│   │       ├── ko.json
│   │       ├── en.json
│   │       └── ja.json
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 5. `packages/ui`

```
packages/ui/
├── src/
│   ├── tokens/
│   │   ├── colors.ts             # 브랜드 + 캐릭터 + 날씨별 팔레트
│   │   ├── typography.ts
│   │   ├── spacing.ts
│   │   └── motion.ts
│   ├── components/
│   │   ├── Button/
│   │   ├── Avatar/
│   │   ├── ChatBubble/
│   │   ├── ChatComposer/
│   │   ├── CharacterCard/
│   │   ├── WeatherBadge/
│   │   ├── ProductCard/          # Nasmedia 추천 카드
│   │   ├── ImageMessage/
│   │   └── PaywallSheet/
│   ├── themes/
│   │   ├── ThemeProvider.tsx
│   │   └── weatherTheme.ts       # 현재 날씨 → 배경 그라데이션
│   └── index.ts
├── tailwind-preset.js            # 웹/모바일 공통 preset
├── package.json
└── tsconfig.json
```

## 6. `packages/ai`

```
packages/ai/
├── src/
│   ├── adapters/
│   │   ├── claude.ts             # Anthropic SDK 래퍼
│   │   ├── gemini.ts             # Google AI SDK 래퍼
│   │   ├── openai-image.ts
│   │   └── mock/
│   │       ├── chat.ts           # 캐릭터별 시드된 응답
│   │       ├── images/           # 미리 생성된 4인 × 날씨 × 표정 매트릭스
│   │       └── responses.json    # 키워드 → 답변 사전
│   ├── router.ts                 # tier/feature → adapter 결정
│   ├── streaming.ts              # SSE 헬퍼
│   ├── prompts/
│   │   ├── system/
│   │   │   ├── sunny.md
│   │   │   ├── rain.md
│   │   │   ├── cloudy.md
│   │   │   └── thunder.md
│   │   └── image/
│   │       └── base.ts           # L1 base prompt strings
│   ├── types.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 7. `packages/db`

```
packages/db/
├── src/
│   ├── client.ts                 # createBrowserClient / createServerClient 팩토리
│   ├── types.gen.ts              # supabase gen types output (committed)
│   ├── repositories/
│   │   ├── messages.ts
│   │   ├── sessions.ts
│   │   ├── users.ts
│   │   └── quests.ts
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 8. `packages/weather`

```
packages/weather/
├── src/
│   ├── providers/
│   │   ├── kweather.ts
│   │   ├── openweathermap.ts
│   │   └── mock.ts
│   ├── router.ts                 # 위치 → provider 선택
│   ├── cache.ts                  # 10분 TTL
│   └── index.ts
├── package.json
└── tsconfig.json
```

## 9. `packages/config`

```
packages/config/
├── eslint/
│   ├── base.cjs
│   ├── next.cjs
│   └── react-native.cjs
├── tsconfig/
│   ├── base.json
│   ├── nextjs.json
│   └── react-native.json
├── env/
│   └── schema.ts                 # zod 스키마, 모든 앱이 동일 사용
└── package.json
```

## 10. `supabase/`

```
supabase/
├── config.toml
├── seed.sql
├── migrations/
│   ├── 20260515000001_init_schema.sql
│   ├── 20260515000002_rls_policies.sql
│   └── 20260515000003_seed_characters.sql
└── functions/
    ├── weather-cron/             # 1시간마다 활성 사용자 위치 캐싱
    ├── moderation/               # 텍스트 사전 필터링
    └── stripe-webhook/           # (Phase 2)
```

## 11. Workspace 파일 예시

### `pnpm-workspace.yaml`
```yaml
packages:
  - "apps/*"
  - "packages/*"
```

### `turbo.json` (핵심만)
```json
{
  "$schema": "https://turbo.build/schema.json",
  "globalDependencies": [".env"],
  "pipeline": {
    "dev":   { "cache": false, "persistent": true },
    "build": { "dependsOn": ["^build"], "outputs": [".next/**", "dist/**"] },
    "lint":  { "outputs": [] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "test":  { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

### 패키지 명명
- npm scope: `@wi/*` (Weather Idols 약어)
- 예: `@wi/core`, `@wi/ui`, `@wi/ai`

## 12. 임포트 규칙

```
apps/* ──can import──▶ packages/*
packages/ui ──can import──▶ packages/core
packages/ai ──can import──▶ packages/core
packages/db ──can import──▶ packages/core
packages/* ✗ apps/* (역참조 금지)
packages/core ✗ react, react-native, next (순수 TS만)
```

ESLint `no-restricted-imports`로 강제.
