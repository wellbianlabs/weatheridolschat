# 03 · Data Model (Supabase / PostgreSQL)

## 1. ERD 개요

```
auth.users (Supabase 내장)
    │
    │ 1:1
    ▼
profiles ─────────────┬──── subscriptions (1:N, 이력)
    │                 │
    │ 1:N             │
    ▼                 │
sessions ──── 1:N ──▶ messages ──── 1:N ──▶ message_attachments
    │
    │ N:1
    ▼
characters (정적, 4 rows)

profiles ─── 1:N ──▶ user_locations
profiles ─── 1:N ──▶ quest_progress ──── N:1 ──▶ quests
profiles ─── 1:N ──▶ token_ledger    (Wellbian 시뮬레이션)
profiles ─── 1:N ──▶ recommendation_events  (Nasmedia 트래킹)

weather_snapshots (location, ts) — append-only 캐시
```

## 2. 테이블 명세

### 2.1 `profiles`
사용자 프로필. `auth.users.id` 1:1 연결.

| 컬럼 | 타입 | 제약 | 비고 |
| :-- | :-- | :-- | :-- |
| id | uuid | PK, FK → auth.users.id | |
| nickname | text | not null, unique(citext) | |
| birth_date | date | | 운세/이벤트 |
| gender | text | check in ('female','male','nonbinary','prefer_not') | |
| locale | text | default 'ko' | ko/en/ja |
| timezone | text | default 'Asia/Seoul' | |
| primary_location | geography(Point, 4326) | | 위경도 |
| tier | text | not null default 'free' | free/premium |
| onboarded_at | timestamptz | | |
| created_at | timestamptz | default now() | |
| updated_at | timestamptz | default now() | trigger |

### 2.2 `characters`
정적 캐릭터 메타. 코드와 DB에 이중 정의 — DB는 운영에서 텍스트 패치용.

| 컬럼 | 타입 | 비고 |
| :-- | :-- | :-- |
| id | text | PK ('sunny', 'rain', 'cloudy', 'thunder') |
| display_name | text | "써니" |
| display_name_en | text | "Sunny" |
| motif | text | sunny/rain/cloud/thunder |
| origin_region | text | "부산 해운대" |
| accent_color | text | hex #FFB347 |
| short_bio | text | 카드용 짧은 소개 |
| system_prompt | text | 전체 페르소나 시스템 프롬프트 |
| image_base_prompt | text | OpenAI Image L1 프롬프트 |
| reference_image_url | text | Storage public URL |
| seed | bigint | 이미지 일관성 시드 |
| recommendation_domains | text[] | ['fnb','beauty',...] |
| sort_order | int | UI 정렬 |

### 2.3 `sessions`
캐릭터 × 사용자 채팅 세션. 보통 사용자당 캐릭터당 1개.

| 컬럼 | 타입 | 제약 | 비고 |
| :-- | :-- | :-- | :-- |
| id | uuid | PK default gen_random_uuid() | |
| user_id | uuid | FK → profiles, not null, on delete cascade | |
| character_id | text | FK → characters, not null | |
| title | text | | 자동 생성 요약 |
| pinned | boolean | default false | |
| last_message_at | timestamptz | | 인덱스 |
| memory_summary | text | | 장기 기억 (premium만 사용) |
| created_at | timestamptz | default now() | |

unique (user_id, character_id) — 동일 캐릭터 세션 1개 (Phase 1).

### 2.4 `messages`
채팅 메시지 본체. 텍스트·이미지·상품 카드 등 다형성.

| 컬럼 | 타입 | 제약 | 비고 |
| :-- | :-- | :-- | :-- |
| id | uuid | PK | |
| session_id | uuid | FK → sessions, not null, cascade | |
| role | text | check in ('user','assistant','system','tool') | |
| modality | text | check in ('text','image','product','song','video') | default 'text' |
| content | text | | role=user/assistant 텍스트 |
| metadata | jsonb | | 모달별 페이로드 (image_url, product_meta...) |
| weather_snapshot_id | uuid | FK → weather_snapshots | 응답 시 컨텍스트 |
| model | text | | claude-3-5 / gemini-pro / mock |
| token_usage | jsonb | | { input, output, total } |
| created_at | timestamptz | default now() | 인덱스 desc |

### 2.5 `message_attachments`
이미지·음악·영상 파일 메타.

| 컬럼 | 타입 | 비고 |
| :-- | :-- | :-- |
| id | uuid | PK |
| message_id | uuid | FK → messages, cascade |
| kind | text | image/audio/video |
| storage_path | text | Supabase Storage 경로 |
| mime_type | text | |
| width / height | int | |
| duration_ms | int | audio/video |
| created_at | timestamptz | |

### 2.6 `weather_snapshots`
응답 컨텍스트로 사용한 날씨 스냅샷. 재현성·디버깅용.

| 컬럼 | 타입 | 비고 |
| :-- | :-- | :-- |
| id | uuid | PK |
| location | geography(Point) | |
| location_label | text | "서울 강남구" |
| temperature_c | numeric(4,1) | |
| condition | text | clear/clouds/rain/snow/thunder |
| humidity | int | |
| wind_kph | numeric(4,1) | |
| precipitation_mm | numeric(5,2) | |
| aqi | int | 미세먼지 지수 |
| provider | text | kweather/openweathermap/mock |
| observed_at | timestamptz | |
| cached_until | timestamptz | TTL 10분 |

인덱스: `(location, observed_at desc)`.

### 2.7 `user_locations`
사용자 즐겨찾기 장소(집/회사 등).

| 컬럼 | 타입 |
| :-- | :-- |
| id | uuid PK |
| user_id | uuid FK |
| label | text |
| location | geography(Point) |
| is_primary | boolean |
| created_at | timestamptz |

### 2.8 `subscriptions`
결제·구독 이력. Phase 2부터 실데이터, Phase 1은 mock.

| 컬럼 | 타입 | 비고 |
| :-- | :-- | :-- |
| id | uuid PK | |
| user_id | uuid FK | |
| provider | text | stripe/toss/iap_apple/iap_google/mock |
| plan | text | premium_monthly / premium_yearly |
| status | text | active/canceled/past_due/trialing |
| current_period_start | timestamptz | |
| current_period_end | timestamptz | |
| external_id | text | provider 측 ID |
| raw | jsonb | webhook payload |

### 2.9 `quests`
기상 제보 등 미션 정의 (정적).

| 컬럼 | 타입 |
| :-- | :-- |
| id | text PK |
| title | text |
| description | text |
| reward_tokens | int |
| kind | text (weather_report/share/daily_chat...) |
| active | boolean |

### 2.10 `quest_progress`
사용자 미션 수행 상태.

| 컬럼 | 타입 |
| :-- | :-- |
| user_id | uuid FK |
| quest_id | text FK |
| state | text (pending/done/claimed) |
| completed_at | timestamptz |
| PRIMARY KEY (user_id, quest_id) |

### 2.11 `token_ledger`
Wellbian 토큰 시뮬레이션. 실 체인 연동 전까지 오프체인 원장.

| 컬럼 | 타입 |
| :-- | :-- |
| id | uuid PK |
| user_id | uuid FK |
| delta | int |  (+ 적립, – 사용)
| reason | text  (quest:weather_report / ad_share / purchase) |
| ref_id | text  (관련 객체 ID) |
| created_at | timestamptz |

### 2.12 `recommendation_events`
Nasmedia 상품 추천 이벤트 트래킹 (CPC/CPS 정산용).

| 컬럼 | 타입 |
| :-- | :-- |
| id | uuid PK |
| user_id | uuid FK |
| message_id | uuid FK → messages |
| campaign_id | text |
| product_id | text |
| event | text (impression/click/conversion) |
| revenue_amount | numeric(10,2) |
| currency | text default 'KRW' |
| created_at | timestamptz |

### 2.13 `moderation_logs`
필터링 차단/거절 이력 (학습 데이터 + 운영 감사).

| 컬럼 | 타입 |
| :-- | :-- |
| id | uuid PK |
| user_id | uuid FK |
| input_text | text |
| stage | text (blocklist/openai_mod/persona_refusal) |
| matched_pattern | text |
| action | text (block/refuse/warn) |
| created_at | timestamptz |

## 3. Row Level Security (RLS) 정책

### 원칙
- `profiles`, `sessions`, `messages`, `user_locations`, `subscriptions`, `quest_progress`, `token_ledger`, `recommendation_events` → **본인만 SELECT/INSERT/UPDATE**.
- `characters`, `quests` → **모두 SELECT**, 쓰기는 service_role만.
- `weather_snapshots` → **인증 사용자 SELECT**, 쓰기는 service_role만.
- `moderation_logs` → 본인 SELECT, 쓰기는 service_role만.

### 예시 정책 (messages)
```sql
alter table messages enable row level security;

create policy "messages_select_own"
on messages for select
using (
  exists (
    select 1 from sessions s
    where s.id = messages.session_id and s.user_id = auth.uid()
  )
);

create policy "messages_insert_own"
on messages for insert
with check (
  exists (
    select 1 from sessions s
    where s.id = messages.session_id and s.user_id = auth.uid()
  )
);

-- 업데이트/삭제는 클라이언트에서 금지, service_role로만
```

## 4. 인덱스 전략

| 테이블 | 인덱스 | 사유 |
| :-- | :-- | :-- |
| messages | `(session_id, created_at desc)` | 채팅 페이지네이션 |
| sessions | `(user_id, last_message_at desc)` | 최근 대화 목록 |
| sessions | unique `(user_id, character_id)` | 중복 방지 |
| weather_snapshots | `(location, observed_at desc)` | 캐시 조회 |
| recommendation_events | `(user_id, created_at)` | 정산 집계 |
| token_ledger | `(user_id, created_at)` | 잔액 계산 |

## 5. 마이그레이션 순서

```
20260515000001_init_schema.sql
  ├─ extensions: pgcrypto, postgis, citext
  ├─ enums (선언 안 함, text + check)
  ├─ tables: profiles, characters, sessions, messages, ...
  └─ indexes

20260515000002_rls_policies.sql
  └─ enable RLS + policies

20260515000003_seed_characters.sql
  └─ insert 4 characters (sunny, rain, cloudy, thunder)

20260515000004_seed_quests.sql
  └─ insert 초기 퀘스트 5종
```

## 6. 자동 생성 타입

```bash
pnpm supabase gen types typescript \
  --project-id <ref> \
  --schema public \
  > packages/db/src/types.gen.ts
```

`packages/db`에서 `export type { Database } from './types.gen'`로 재공개. 모든 앱/패키지가 이 타입을 통해서만 DB에 접근.

## 7. 트리거 / 함수

- `updated_at` 자동 업데이트 트리거 (profiles, sessions).
- `on_auth_user_created()` AFTER INSERT on `auth.users` → `profiles` row 생성.
- `summarize_session(session_id)` Edge Function — 일정 메시지 누적 시 `memory_summary` 갱신 (premium).

## 8. 데이터 보관 / 삭제

- 사용자 탈퇴: `auth.users` 삭제 → 모든 FK cascade.
- `messages.content` 90일 후 익명화 옵션 (Phase 2 정책).
- `moderation_logs` 영구 보관 (운영 분석).
