# Weather Idols Chat (날씨의 아이돌 챗)

K-weather 초국지적 기상 데이터와 AI 멀티모달을 결합한 초개인화 라이프스타일 컴패니언 서비스.

> **현재 단계: 설계(PRD) 확정 → 코드 가능한 명세 구축 중**
> 본 디렉토리는 아직 코드를 포함하지 않습니다. `/docs` 하위 설계 문서가 곧 모노레포 스캐폴딩의 기반이 됩니다.

---

## 📚 설계 문서 인덱스

순서대로 읽으면 전체 시스템을 코드로 옮기는 데 필요한 결정이 모두 포함됩니다.

| # | 문서 | 내용 |
| :-- | :-- | :-- |
| 00 | [Overview](docs/00_OVERVIEW.md) | 비전·핵심가치·페르소나·KPI |
| 01 | [Architecture](docs/01_ARCHITECTURE.md) | Next.js + Expo 모노레포, Supabase 백엔드, 데이터 흐름 |
| 02 | [Folder Structure](docs/02_FOLDER_STRUCTURE.md) | Turborepo 디렉토리 트리, 패키지 경계 |
| 03 | [Data Model](docs/03_DATA_MODEL.md) | PostgreSQL 테이블·관계·RLS |
| 04 | [API Spec](docs/04_API_SPEC.md) | REST/RPC 엔드포인트 계약 |
| 05 | [AI Prompts](docs/05_AI_PROMPTS.md) | 캐릭터 시스템 프롬프트·LLM 라우팅·Mock 레이어 |
| 06 | [User Flows](docs/06_USER_FLOWS.md) | 화면 흐름·상태 머신·온보딩 |
| 07 | [Design System](docs/07_DESIGN_SYSTEM.md) | 토큰·다이내믹 날씨 테마·컴포넌트 |
| 08 | [Monetization](docs/08_MONETIZATION.md) | Freemium·Nasmedia·Web3 토큰 |
| 09 | [Safeguards](docs/09_SAFEGUARDS.md) | 3중 필터링·Graceful Refusal·법무 |
| 10 | [Roadmap](docs/10_ROADMAP.md) | 단계별 MVP 일정 |
| ⚡ | [Deploy · Vercel](docs/DEPLOY_VERCEL.md) | apps/web을 Vercel에 배포하는 단계 |
| ⚡ | [Deploy · Vercel Env Vars](docs/DEPLOY_VERCEL_ENV.md) | 5단계 환경변수 복붙 가이드 |
| ⚡ | [Deploy · Supabase](docs/DEPLOY_SUPABASE.md) | DB·인증·Storage 셋업 |

## 🎯 결정 요약

| 항목 | 선택 | 사유 |
| :-- | :-- | :-- |
| 클라이언트 | **Next.js 14 (web) + Expo SDK 51 (mobile)** | RSC·App Router로 SEO/SSR, RN으로 네이티브. 비즈니스 로직 패키지 공유. |
| 모노레포 | **Turborepo + pnpm workspaces** | 캐싱·파이프라인·작은 학습곡선. |
| 백엔드 | **Next.js API Routes + Supabase** | Postgres + Auth + Storage + Realtime + Edge Functions 일체형. |
| 상태/데이터 | **TanStack Query + Zustand** | 서버 상태 캐싱과 클라이언트 상태 분리. |
| 스타일 | **NativeWind (Tailwind 호환)** | 웹/RN에서 동일한 유틸리티 문법. |
| AI(MVP) | **Mock 응답 레이어** | 키 발급 전 풀스택 플로우 검증. 추후 Anthropic·Gemini·OpenAI·Suno 어댑터 교체. |
| 결제 | **Stripe(글로벌) + 토스페이먼츠(KR)** | 추후 Phase 2. |

## 🗺️ 다음 단계

1. **설계 문서 리뷰** (당신 검토)
2. **모노레포 스캐폴딩** — `apps/web`, `apps/mobile`, `packages/{core, ui, ai, db}` 생성
3. **Supabase 프로젝트 생성** & 스키마 마이그레이션
4. **캐릭터 선택 → 채팅 → Mock AI 응답** end-to-end MVP

---

**작성:** 2026-05-15 · **전략 총괄:** 이창민
