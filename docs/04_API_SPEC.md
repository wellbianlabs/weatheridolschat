# 04 · API Spec

Next.js Route Handlers를 BFF로 사용. 웹/모바일 양쪽 모두 동일 엔드포인트.

## 0. 공통 사항

- **Base URL:** `https://api.weatheridols.app` (= 웹앱 도메인 `/api`)
- **인증:** Supabase JWT를 `Authorization: Bearer <token>` 헤더로. 웹은 쿠키 가능, 모바일은 헤더 사용.
- **Content-Type:** `application/json` (스트리밍 응답은 `text/event-stream`)
- **에러 포맷 (RFC 7807 변형):**
```json
{
  "error": {
    "code": "rate_limited",
    "message": "일일 무료 메시지 한도(30회)를 초과했어요.",
    "details": { "resetAt": "2026-05-16T00:00:00Z" }
  }
}
```
- **에러 코드:** `unauthorized`, `forbidden`, `not_found`, `validation_error`, `rate_limited`, `payment_required`, `internal_error`, `safety_blocked`.
- **공통 헤더:**
  - `X-Request-Id` (서버가 발급, 클라이언트 로그 상관관계)
  - `X-Locale` (요청 응답 언어 힌트)

## 1. Auth

### `POST /api/auth/callback`
Supabase OAuth 콜백. 쿠키 세션 설정 (웹 전용).

### `POST /api/auth/anonymous` (Phase 2)
체험용 익명 세션 발급. 24시간 후 만료.

> 일반 로그인(Google/Email)은 Supabase Auth JS SDK가 직접 처리. 별도 엔드포인트 불필요.

## 2. Me (Profile)

### `GET /api/me`
**응답 200:**
```json
{
  "id": "uuid",
  "nickname": "창민",
  "tier": "free",
  "locale": "ko",
  "timezone": "Asia/Seoul",
  "primaryLocation": { "lat": 37.498, "lng": 127.028, "label": "강남구" },
  "onboarded": true,
  "tokenBalance": 320,
  "usage": { "messagesToday": 12, "limit": 30 }
}
```

### `PATCH /api/me`
**요청:**
```json
{ "nickname": "창민", "locale": "ko", "primaryLocation": { "lat": 37.5, "lng": 127.0 } }
```

### `POST /api/me/onboarding`
온보딩 완료 처리. 닉네임·생일·성별·위치·선호 캐릭터 입력.

## 3. Characters

### `GET /api/characters`
정적 4인 메타. 캐시 가능 (`Cache-Control: public, max-age=3600`).

**응답 200:**
```json
{
  "characters": [
    {
      "id": "sunny",
      "displayName": "써니",
      "motif": "sunny",
      "accentColor": "#FFB347",
      "shortBio": "절망마저 태워버리는 강렬한 주파수",
      "originRegion": "부산 해운대",
      "referenceImageUrl": "https://.../sunny_ref.png",
      "recommendationDomains": ["outdoor", "beauty", "fitness"]
    }
    /* ... rain, cloudy, thunder */
  ]
}
```

## 4. Sessions

### `GET /api/sessions`
**응답 200:**
```json
{
  "sessions": [
    {
      "id": "uuid",
      "characterId": "sunny",
      "title": "오늘 부산 햇살 ☀️",
      "lastMessageAt": "2026-05-15T08:14:00Z",
      "pinned": true,
      "unread": false
    }
  ]
}
```

### `POST /api/sessions`
**요청:** `{ "characterId": "sunny" }`
**응답 201:** 위와 동일 객체. 이미 존재하면 200으로 기존 세션 반환.

### `GET /api/sessions/:id/messages?cursor=&limit=30`
페이지네이션은 `created_at` 기반 cursor.

**응답 200:**
```json
{
  "messages": [
    {
      "id": "uuid",
      "role": "assistant",
      "modality": "text",
      "content": "비 오는 날 우산 챙겼어?",
      "metadata": null,
      "createdAt": "2026-05-15T08:13:42Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "modality": "image",
      "content": null,
      "metadata": {
        "imageUrl": "https://.../sunny_rainy.png",
        "width": 1024,
        "height": 1024
      },
      "createdAt": "2026-05-15T08:14:00Z"
    },
    {
      "id": "uuid",
      "role": "assistant",
      "modality": "product",
      "content": "이런 우산 어때?",
      "metadata": {
        "campaignId": "nasm_123",
        "productId": "prd_456",
        "title": "투명 장우산",
        "price": 12900,
        "currency": "KRW",
        "imageUrl": "...",
        "ctaUrl": "https://aff.nasmedia.../track?..."
      }
    }
  ],
  "nextCursor": "2026-05-15T08:00:00Z"
}
```

## 5. Chat (핵심)

### `POST /api/chat`
**요청:**
```json
{
  "sessionId": "uuid",
  "text": "오늘 뭐 입을까?",
  "clientMessageId": "uuid-v4",   // 멱등성 + 낙관적 UI 매칭
  "locationHint": { "lat": 37.5, "lng": 127.0 }
}
```

**처리 단계:**
1. Auth & rate-limit
2. Safeguard pipeline (입력 필터)
3. 날씨 스냅샷 조회/생성
4. 메시지 메모리 fetch (recent 20개 + 요약)
5. 프롬프트 빌드 → AI 어댑터 라우팅 (free=Gemini / premium=Claude / dev=Mock)
6. 스트리밍 응답

**응답 200 (Content-Type: text/event-stream):**
```
event: meta
data: {"userMessageId":"uuid","assistantMessageId":"uuid","model":"mock"}

event: token
data: {"delta":"안녕"}

event: token
data: {"delta":"! 오늘"}

event: tool
data: {"name":"weather","output":{"temp":18,"condition":"rain"}}

event: attachment
data: {"kind":"product","payload":{...}}

event: done
data: {"finishReason":"stop","usage":{"in":120,"out":45}}
```

**에러 응답:**
- 429 `rate_limited`
- 402 `payment_required` (premium 기능 요청 시)
- 451 `safety_blocked` — `details.refusalCharacter`로 페르소나 거절 메시지 포함

### `DELETE /api/chat/:messageId`
사용자 본인 메시지 또는 어시스턴트 마지막 응답 삭제 (UX: 재생성용).

### `POST /api/chat/regenerate`
**요청:** `{ "assistantMessageId": "uuid" }` — 동일 컨텍스트로 재생성.

## 6. Image Generation

### `POST /api/image`
**요청:**
```json
{
  "sessionId": "uuid",
  "characterId": "sunny",
  "intent": "selfie | scene | outfit",
  "userPrompt": "비 오는 날 카페에 앉아있는 모습",
  "weatherSnapshotId": "uuid"   // 선택, 없으면 현재 위치 조회
}
```

**응답 202 (즉시) + Webhook OR 동기 200:**

MVP는 동기 200 (mock):
```json
{
  "messageId": "uuid",
  "imageUrl": "https://.../generated/...",
  "prompt": "<assembled L1+L2+L3>",
  "seed": 123456789,
  "model": "mock"
}
```

**게이팅:**
- free: 일 3회
- premium: 일 50회

## 7. Weather

### `GET /api/weather?lat=&lng=`
캐시 우선(10분 TTL). 위치 미제공 시 프로필 `primary_location` 사용.

**응답 200:**
```json
{
  "location": { "lat": 37.498, "lng": 127.028, "label": "서울 강남구" },
  "observedAt": "2026-05-15T08:00:00Z",
  "temperatureC": 18.4,
  "condition": "rain",
  "humidity": 72,
  "windKph": 8.5,
  "precipitationMm": 3.2,
  "aqi": 65,
  "provider": "mock"
}
```

## 8. Quests / Rewards

### `GET /api/quests`
활성 퀘스트 + 사용자 진행 상태.

### `POST /api/quests/:id/complete`
완료 보고 (예: 위치+사진 첨부의 기상 제보).

### `POST /api/quests/:id/claim`
보상 수령 → `token_ledger`에 +reward 행 추가.

## 9. Recommendations (Nasmedia 연동)

### `GET /api/recommendations?context=`
컨텍스트(날씨·캐릭터·대화 의도) 기반 상품 추천. 채팅 핸들러가 내부 호출.

### `POST /api/recommendations/events`
**요청:** `{ "messageId": "...", "event": "click", "campaignId": "...", "productId": "..." }`
클라이언트가 상품 카드 노출/클릭 시 호출 (전환은 Nasmedia postback).

## 10. Billing (Phase 2)

### `POST /api/billing/checkout`
Stripe / Toss / IAP 체크아웃 세션 생성.

### `POST /api/billing/webhook/:provider`
- 서명 검증
- `subscriptions` upsert
- `profiles.tier` 동기화

### `GET /api/billing/portal`
포털 URL 반환 (구독 관리).

## 11. Realtime 채널

Supabase Realtime 채널 직접 구독 (서버 라우트 X).

| 채널 | 페이로드 | 용도 |
| :-- | :-- | :-- |
| `messages:session_id=eq.<id>` | INSERT 알림 | 다기기 동기화 |
| `weather:user_id=<id>` | 주기적 publish | 큰 날씨 변화 알림 |

## 12. Rate Limits

| 엔드포인트 | free | premium |
| :-- | :-- | :-- |
| POST /api/chat | 30/일 | 무제한 (1000/일 안전선) |
| POST /api/image | 3/일 | 50/일 |
| POST /api/quests/complete | 10/일 | 50/일 |
| GET /api/weather | 60/시간 | 600/시간 |

구현: Upstash Redis 또는 Supabase `pg_cron + table` (저비용).

## 13. 클라이언트 SDK 표면 (`@wi/core/api`)

서버 계약을 클라이언트 측 타입드 함수로 wrapping. 웹/모바일 동일 사용.

```ts
// packages/core/src/api/client.ts (개념적 시그니처)
export const api = {
  me: {
    get: () => Promise<Me>,
    update: (patch: Partial<Me>) => Promise<Me>,
  },
  characters: {
    list: () => Promise<Character[]>,
  },
  sessions: {
    list: () => Promise<Session[]>,
    create: (characterId: CharacterId) => Promise<Session>,
    messages: (sessionId: string, cursor?: string) => Promise<MessagesPage>,
  },
  chat: {
    send: (input: ChatInput) => AsyncIterable<ChatEvent>,  // SSE iterator
    regenerate: (assistantMessageId: string) => AsyncIterable<ChatEvent>,
  },
  image: {
    create: (input: ImageInput) => Promise<ImageResult>,
  },
  weather: {
    get: (lat?: number, lng?: number) => Promise<Weather>,
  },
  quests: {
    list: () => Promise<QuestWithProgress[]>,
    complete: (id: string, payload?: unknown) => Promise<void>,
    claim: (id: string) => Promise<{ tokenBalance: number }>,
  },
};
```

## 14. 버전 관리

- URL 버전 미사용. 호환성 깨지면 `/api/v2/...` 도입.
- 응답에 `X-API-Version: 1` 헤더 포함 (클라이언트 경고 트리거용).
