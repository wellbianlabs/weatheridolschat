# 01 · Architecture

웹과 모바일을 처음부터 동등하게 지원하기 위한 **모노레포 + 공유 비즈니스 로직** 구조.

## 1. 하이레벨 다이어그램

```
┌────────────────────────────────────────────────────────────────┐
│                         CLIENTS                                │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │ apps/web         │         │ apps/mobile      │             │
│  │ Next.js 14       │         │ Expo SDK 51      │             │
│  │ App Router · RSC │         │ React Native     │             │
│  └────────┬─────────┘         └────────┬─────────┘             │
│           │                            │                       │
│           └──────────┬─────────────────┘                       │
│                      │ shared packages                         │
│           ┌──────────┴──────────────┐                          │
│           │ @wi/core (domain)       │ @wi/ui (NativeWind)      │
│           │ @wi/ai   (LLM clients)  │ @wi/db (Supabase types)  │
│           │ @wi/weather (API)       │ @wi/config (env)         │
│           └──────────┬──────────────┘                          │
└──────────────────────┼─────────────────────────────────────────┘
                       │
                       │ HTTPS / WSS
                       ▼
┌────────────────────────────────────────────────────────────────┐
│                       BACKEND (BFF)                            │
│  Next.js Route Handlers (/app/api/*)  ── Edge & Node runtimes  │
│  ┌───────────────┬────────────────┬───────────────────────┐   │
│  │ /chat (SSE)   │ /image         │ /weather /quests /me  │   │
│  └───────┬───────┴────────┬───────┴──────────┬────────────┘   │
└──────────┼────────────────┼──────────────────┼────────────────┘
           │                │                  │
           ▼                ▼                  ▼
   ┌─────────────┐  ┌───────────────┐  ┌───────────────────┐
   │ AI Adapters │  │ Image Adapter │  │ Supabase          │
   │ Claude /    │  │ OpenAI Image  │  │ - Postgres        │
   │ Gemini /    │  │ (DALL-E 3)    │  │ - Auth (OAuth/EM) │
   │ MOCK        │  │ / MOCK        │  │ - Storage         │
   └─────────────┘  └───────────────┘  │ - Realtime        │
                                       │ - Edge Functions  │
   ┌─────────────────────────────┐     └───────────────────┘
   │ Weather Provider Adapter    │
   │ K-weather → Met.no → OpenWM │
   └─────────────────────────────┘

   ┌─────────────────────────────────────────────┐
   │ Affiliate (Nasmedia)  ·  Suno  ·  SeaDance  │  ← Phase 2+
   └─────────────────────────────────────────────┘
```

## 2. 기술 스택 결정 (Decision Records)

### 2.1 클라이언트
- **Web: Next.js 14 (App Router, RSC, Server Actions)**
  - 이유: SEO 필요(마케팅 페이지), 서버 컴포넌트로 LLM 응답 스트리밍 친화적.
- **Mobile: Expo SDK 51 (React Native + Expo Router)**
  - 이유: 단일 코드베이스 RN, OTA 업데이트, EAS Build로 스토어 배포.
- **공유 비율 목표:** 비즈니스 로직·타입·디자인 토큰·AI 어댑터 = **70%+ 공유**, UI 컴포넌트 표면은 플랫폼별 일부 분기.

### 2.2 모노레포
- **Turborepo + pnpm workspaces**
  - 캐싱·증분 빌드.
  - `turbo run dev --filter=web` 식 선택 실행.

### 2.3 백엔드 (BFF 패턴)
- **Next.js Route Handlers를 BFF로 사용**
  - 모바일도 동일 엔드포인트 호출 → 진실의 원천 단일화.
  - 무거운 작업(이미지·동영상)은 Supabase Edge Functions / 별도 큐.
- **이유:** Phase 1에서 NestJS 분리는 오버엔지니어링. 트래픽 증가 시 `apps/api`로 분리 가능한 패키지 경계는 유지.

### 2.4 데이터 / 인증 / 스토리지
- **Supabase**
  - Postgres + Row Level Security (RLS)
  - Auth: Google OAuth, Email/Password, Anonymous(추후)
  - Storage: 캐릭터 시트, 생성 이미지, 음악 파일
  - Realtime: 채팅 동기화(다기기 로그인 시), 알림
  - Edge Functions(Deno): 결제 웹훅, 스케줄 잡

### 2.5 상태 관리
- **TanStack Query (서버 상태)** — 채팅 메시지, 날씨, 사용자 프로필 캐시.
- **Zustand (클라이언트 상태)** — 현재 캐릭터 선택, 채팅 입력 드래프트, UI 토글.
- **MMKV (mobile) / localStorage (web)** — 토큰/세션 영속화.

### 2.6 스타일링
- **NativeWind (Tailwind v3 호환)**
  - 웹의 Tailwind 클래스가 RN에서도 그대로.
  - 디자인 토큰은 `packages/ui/tokens.ts`에서 한 곳 관리.
- **Animation:** Reanimated 3 (mobile) / Framer Motion (web). 공통 어댑터 X — 플랫폼별 베스트.

### 2.7 결제
- **Phase 1: 결제 UI만 (mock 구독 버튼).**
- **Phase 2 (KR 출시):** 토스페이먼츠 + Apple/Google In-App Purchase.
- **Phase 3 (글로벌):** Stripe 추가.

## 3. 데이터 흐름 (대표 시나리오)

### 3.1 사용자가 써니에게 메시지 보냄
```
[Client]
 1. ChatInput → useSendMessage()
 2. POST /api/chat
    body: { sessionId, characterId: "sunny", text, locale }

[Next.js /api/chat handler]
 3. Auth 미들웨어 → user 확인
 4. RateLimit (free: 30/일, premium: 무제한)
 5. weather.getCurrent(user.location) → 컨텍스트 주입
 6. memory.fetchRecent(sessionId, 20) → 최근 메시지
 7. promptBuilder(character, weather, memory, userMessage)
 8. ai.stream(model, prompt)  ─ premium: Claude / free: Gemini / dev: MOCK
 9. Stream chunks → SSE → 클라이언트 점진 렌더
10. DB write: messages 테이블 (user msg, assistant msg)

[Client]
11. useChatStream subscribe → 실시간 토큰 표시
12. 응답 완료 → useQuery invalidate(['messages', sessionId])
```

### 3.2 이미지 생성 ("써니 셀카 보여줘")
```
1. ChatInput intent classifier가 image_request 감지 (LLM 함수콜)
2. POST /api/image
   body: { characterId, weatherContext, userPrompt }
3. promptAssembler 3-layer:
   L1 (Character Base) + L2 (Weather) + L3 (User Action)
4. openai.images.generate({ model, prompt, reference_image_url, seed })
   ── MOCK 모드: pre-generated 샘플 이미지 URL 반환
5. Storage 업로드 → public URL
6. messages 테이블에 type=image 행 추가
7. 클라이언트가 메시지 스트림에서 image bubble 렌더
```

## 4. 환경 분리

| 환경 | URL | DB | AI | 용도 |
| :-- | :-- | :-- | :-- | :-- |
| local | localhost:3000 | Supabase local (docker) | MOCK | 개발 |
| dev | dev.weatheridols.app | Supabase project A | MOCK / Gemini-free | 통합 테스트 |
| staging | stg.weatheridols.app | Supabase project B | Gemini / Claude | QA |
| prod | weatheridols.app | Supabase project C | Claude(Premium) / Gemini(Free) | 운영 |

## 5. 비기능 요구 (NFR)

| 항목 | 목표 |
| :-- | :-- |
| 첫 메시지 응답 latency (스트림 시작) | < 1.5s |
| 이미지 생성 end-to-end | < 12s |
| 동시 채팅 세션 (MVP) | 1,000 RPS 미만 |
| 가용성 | 99.5% (MVP) |
| 모바일 앱 크기 | < 60MB (initial) |
| 웹 LCP | < 2.5s |

## 6. 외부 의존성 매트릭스

| 서비스 | 용도 | 대체 가능성 | MVP에서 |
| :-- | :-- | :-- | :-- |
| Anthropic Claude | 프리미엄 대화 | OpenAI GPT-4 | MOCK |
| Google Gemini | 무료 대화 | Claude Haiku | MOCK |
| OpenAI Image | 캐릭터 이미지 | Stable Diffusion API | MOCK + 샘플 이미지 |
| Suno | 음악 생성 | Udio | ❌ 제외 |
| SeaDance / OmniHuman | 영상 생성 | RunwayML | ❌ 제외 |
| K-weather API | 한국 날씨 | 기상청 단기예보 | Mock JSON |
| OpenWeatherMap | 해외 날씨 | Met.no | Mock JSON |
| Nasmedia | 광고/추천 | 직접 협력사 | ❌ Phase 2 |
| Supabase | DB/Auth/Storage | Firebase | ✅ 사용 |

## 7. 아키텍처 원칙 (Constraints for Code)

1. **플랫폼 분기는 패키지 경계 너머로 새지 않는다.** `Platform.OS` 사용은 `packages/ui` 내부에서만.
2. **외부 API는 항상 어댑터 인터페이스 뒤에 있다.** (`packages/ai/adapters/*`, `packages/weather/providers/*`)
3. **MOCK은 1급 시민.** 모든 어댑터는 `MOCK_MODE=true` 환경변수로 즉시 전환 가능.
4. **타입은 DB가 진실의 원천.** `supabase gen types`로 자동 생성 → `@wi/db`에서 re-export.
5. **서버 비밀은 절대 클라이언트로 안 나간다.** AI 키·서비스 롤 키는 Route Handler 안에서만.
