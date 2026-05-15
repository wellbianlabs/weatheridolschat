# Supabase 셋업 가이드

Supabase는 인증·DB·스토리지를 담당합니다. Phase 1에는 선택 사항(Mock 모드로도 작동), Phase 2부터 필수.

## 1) 프로젝트 생성

1. [supabase.com/dashboard](https://supabase.com/dashboard) → **New Project**
2. 설정:
   - **Name**: `weatheridolschat-prod` (또는 dev/stg/prod 분리)
   - **Database Password**: 강력한 비밀번호 → 1Password 등에 저장
   - **Region**: `Northeast Asia (Seoul) — ap-northeast-2` (한국 사용자 기준)
   - **Pricing Plan**: Free (Phase 1) → Pro (Phase 2)
3. 프로젝트 ref 메모해두기 (예: `abcd1234efgh`)

## 2) Supabase CLI 설치 (선택 — SQL Editor로도 가능)

### Scoop (Windows) — 권장

```powershell
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase
supabase --version
```

### npm

```powershell
npm install -g supabase
```

## 3) 마이그레이션 적용 — 옵션 A (대시보드 SQL Editor)

가장 단순한 방법. 외부 도구 불필요.

1. Supabase 대시보드 → **SQL Editor**
2. 다음 파일들을 **순서대로** 복사·붙여넣기·Run:
   1. `supabase/migrations/20260515000001_init_schema.sql`
   2. `supabase/migrations/20260515000002_rls_policies.sql`
   3. `supabase/migrations/20260515000003_seed_characters.sql`
   4. `supabase/migrations/20260515000004_seed_quests.sql`
3. 각 실행 후 **Database → Tables** 에서 테이블 확인

## 4) 마이그레이션 적용 — 옵션 B (CLI link + push)

```powershell
cd C:\project\weatheridolschat

# 1) 액세스 토큰 로그인 (브라우저 OAuth)
supabase login

# 2) 로컬 프로젝트와 클라우드 ref 연결
supabase link --project-ref <your-project-ref>

# 3) 마이그레이션 push
supabase db push
```

성공하면 `Applied migration 20260515000001_init_schema.sql` 등 4건 표시.

## 5) 인증 설정 (Auth)

대시보드 → **Authentication → Providers**

### Email (기본 활성)

- `Enable Email signups`: ON
- `Confirm email`: ON (운영 시) / OFF (개발 시)

### Google OAuth (Phase 2)

1. [Google Cloud Console](https://console.cloud.google.com)에서 OAuth Client ID 생성
2. Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
3. Client ID / Secret을 Supabase 대시보드에 입력

## 6) 환경 변수 추출

대시보드 → **Settings → API**:

| Vercel 환경변수 | Supabase 위치 |
| :-- | :-- |
| `NEXT_PUBLIC_SUPABASE_URL` | `Project URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `Project API keys → anon public` |
| `SUPABASE_SERVICE_ROLE_KEY` | `Project API keys → service_role` ⚠️ **절대 클라이언트 노출 X** |

Vercel `Settings → Environment Variables`에 입력 후 `MOCK_MODE=false` 로 토글.

## 7) Storage 셋업 (이미지 호스팅 시)

```sql
-- characters 버킷 (공개 reference·roster 이미지)
insert into storage.buckets (id, name, public) values ('characters', 'characters', true);

-- generated 버킷 (사용자별 생성 이미지)
insert into storage.buckets (id, name, public) values ('generated', 'generated', false);

create policy "Generated images: user can read own"
on storage.objects for select
using ( bucket_id = 'generated' and (storage.foldername(name))[1] = auth.uid()::text );
```

Phase 2: `/reference/*.png`을 Storage로 이전하고 `referenceImageUrl`을 Supabase Storage public URL로 교체.

## 8) 타입 자동 생성

```powershell
cd C:\project\weatheridolschat
supabase gen types typescript --project-id <ref> --schema public > packages/db/src/types.gen.ts
```

이후 `packages/db/src/client.ts`에서 `SupabaseClient<Database>` generic을 재활성화 (현재는 미적용 상태).

## 9) 트러블슈팅

| 증상 | 원인 | 해결 |
| :-- | :-- | :-- |
| `extension "pgcrypto" not available` | 무료 플랜 일부 리전 제한 | 대시보드 → Database → Extensions에서 활성화 |
| `auth.users` 트리거 권한 오류 | `security definer` 필요 | 마이그레이션 SQL 이미 포함됨, 재실행 |
| RLS로 anon이 읽기 못함 | 정책 누락 | `20260515000002_rls_policies.sql` 재실행 |
| `relation "profiles" already exists` | 마이그레이션 중복 실행 | `drop schema public cascade; create schema public;` 후 재실행 (개발 환경만) |

## 10) Vercel과 함께 사용 시 흐름

```
1. Supabase 프로젝트 생성
2. SQL Editor에서 4개 마이그레이션 실행
3. API keys 복사
4. Vercel 환경변수에 URL/anon/service-role 입력
5. Vercel 환경변수에 MOCK_MODE=false 설정
6. Vercel에서 재배포 트리거 (Settings → Redeploy)
```
