# Vercel 배포 가이드

Vercel은 Next.js 앱(`apps/web`)을 호스팅합니다. 모바일(Expo)은 별도 EAS Build를 사용.

## 1) 프로젝트 import

1. [vercel.com/new](https://vercel.com/new) 접속
2. GitHub에서 `wellbianlabs/weatheridolschat` 선택 → **Import**

## 2) 프로젝트 설정 (Configure Project)

| 항목 | 값 |
| :-- | :-- |
| Framework Preset | `Next.js` (자동 감지됨) |
| **Root Directory** | `apps/web` ★ 반드시 지정 |
| Build Command | `cd ../.. && pnpm turbo run build --filter=@wi/web` |
| Output Directory | `.next` (기본값 유지) |
| Install Command | `cd ../.. && pnpm install --frozen-lockfile=false` |
| Node.js Version | `20.x` |

> 모노레포라서 Root Directory를 `apps/web`으로 잡고, build/install은 모노레포 루트로 올라가서 실행하는 게 핵심.

## 3) 환경 변수 (Environment Variables)

`Settings → Environment Variables`에서 **Production / Preview / Development** 모두 동일 셋업:

### 최소 (Mock 모드로 즉시 배포)

```
NODE_ENV=production
MOCK_MODE=true
NEXT_PUBLIC_APP_URL=https://<your-vercel-domain>.vercel.app
```

이 상태로 배포하면 데모용 Mock 응답 + picsum 이미지 + 저장된 reference 이미지로 동작합니다.

### Supabase 연결 후 (선택)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### 실제 AI 연결 (선택, MOCK_MODE=false로 토글)

```
MOCK_MODE=false
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...
OPENAI_API_KEY=sk-...
```

### 실제 날씨 (선택)

```
OPENWEATHERMAP_API_KEY=...
KWEATHER_API_KEY=...   # (옵션)
```

## 4) 배포 트리거

- 첫 배포: 위 import 마지막 단계의 **Deploy** 클릭
- 이후: `main` 브랜치에 push만 하면 자동 production 배포
- Preview 브랜치: 다른 브랜치 push 시 자동 preview URL 생성

## 5) 빌드 확인

- 빌드 로그에서 다음 메시지 확인:
  - `✓ Compiled successfully`
  - 라우트 7~8개 ((/, /onboarding, /characters, /chat/[characterId], /api/*))
- 빌드 실패 시 가장 흔한 원인:
  - Root Directory가 `.`(루트)로 잡힘 → `apps/web`으로 수정
  - Install이 pnpm 대신 npm으로 잡힘 → Install Command 명시
  - Lockfile 충돌 → `pnpm install --frozen-lockfile=false` 사용

## 6) 도메인 (선택)

- Vercel 자동 도메인: `weatheridolschat.vercel.app`
- 커스텀: `Settings → Domains`에서 추가

## 7) 트러블슈팅

| 증상 | 원인 | 해결 |
| :-- | :-- | :-- |
| Hero 이미지 안 보임 | public/*.png 4MB 초과 LFS 필요? | Vercel은 GitHub의 파일 그대로 사용. 100MB 이하면 OK. |
| `Cannot find module @wi/core` | install이 workspace 미인식 | Install Command 위 그대로 사용 (`cd ../..`) |
| Server-only env 노출 우려 | `NEXT_PUBLIC_*` prefix만 클라이언트 노출됨 | 서버 시크릿(`SUPABASE_SERVICE_ROLE_KEY` 등)에는 prefix 절대 X |
