# 07 · Design System

웹/모바일 단일 토큰 시스템. `packages/ui` 한 곳에서 정의 후 NativeWind 프리셋 + 코드 상수로 동시 노출.

## 1. 디자인 원칙

1. **날씨가 첫 번째 캔버스.** 모든 화면 배경은 현재 컨디션에 반응한다.
2. **캐릭터가 색을 결정한다.** 채팅 화면은 선택한 멤버의 액센트 색이 주조.
3. **광고는 선물처럼.** 상품 카드는 캐릭터의 톤·필체로 디자인.
4. **모션은 인지보다 감성.** 정보 전달은 정적, 무드는 동적.
5. **두 손가락 도달 거리.** 모바일 우선 컨트롤 배치.

## 2. 컬러 토큰

### 2.1 브랜드 코어
```ts
brand: {
  primary:   '#7C5CFF',   // 라일락 (그룹 시그니처)
  secondary: '#F8F4FF',
  ink:       '#0F0F14',
  paper:     '#FAFAFB',
}
```

### 2.2 캐릭터 액센트
```ts
character: {
  sunny:   { primary: '#FFB347', soft: '#FFE7C2', ink: '#5A2E00' },
  rain:    { primary: '#6BA8FF', soft: '#D8E8FF', ink: '#0E3A8A' },
  cloudy:  { primary: '#A8B5CF', soft: '#E3E9F4', ink: '#1E2A44' },
  thunder: { primary: '#A06CFF', soft: '#E5D8FF', ink: '#2A0E5A' },
}
```

### 2.3 날씨 무드 (배경 그라데이션)
```ts
weather: {
  clear:    ['#FFE0A8', '#FFB347'],
  clouds:   ['#D6DEEB', '#A8B5CF'],
  rain:     ['#6E8BB8', '#3E5E8A'],
  drizzle:  ['#90A4C2', '#5E7AA0'],
  thunder:  ['#3B2A6B', '#7C5CFF'],
  snow:     ['#F2F6FF', '#C9D6E8'],
  mist:     ['#D6D6E0', '#9C9CB0'],
}
```

### 2.4 시멘틱
```ts
semantic: {
  success: '#3DBE7A',
  warning: '#FFB020',
  danger:  '#E53E5E',
  info:    '#3D8AE5',

  bg:        { default: '#FAFAFB', subtle: '#F2F2F4', overlay: 'rgba(15,15,20,0.6)' },
  surface:   { card: '#FFFFFF', cardElev: '#FFFFFF', muted: '#F4F4F7' },
  text:      { primary: '#0F0F14', secondary: '#4B4B57', muted: '#86868F', inverse: '#FFFFFF' },
  border:    { default: '#E5E5EC', strong: '#C7C7D1', focus: '#7C5CFF' },
}
```

### 2.5 다크 모드
모든 토큰에 dark variant 동시 정의. 채팅 배경은 캐릭터 + 다크 모드 조합으로 별도 LUT.

## 3. 타이포그래피

- **국문:** Pretendard Variable (가변 폰트, 한국어 최적)
- **영문/숫자:** Inter Variable (보조)
- **로고/캐릭터 라벨:** 캐릭터별 핸드라이팅 폰트 (커스텀, Phase 2)

스케일 (모바일/웹 동일):

| 토큰 | size | line | weight | 용도 |
| :-- | :-- | :-- | :-- | :-- |
| display | 32 | 40 | 700 | 페이월 헤드 |
| h1 | 26 | 34 | 700 | 화면 제목 |
| h2 | 22 | 30 | 600 | 섹션 제목 |
| h3 | 18 | 26 | 600 | 카드 제목 |
| body | 15 | 22 | 400 | 본문 |
| body-strong | 15 | 22 | 600 | 강조 본문 |
| caption | 13 | 18 | 400 | 메타정보 |
| micro | 11 | 14 | 500 | 라벨, 뱃지 |
| chat | 16 | 24 | 400 | 채팅 버블 |

## 4. 스페이싱 / 라운드 / 그림자

```ts
spacing: { 0:0, 1:4, 2:8, 3:12, 4:16, 5:20, 6:24, 8:32, 10:40, 12:48, 16:64 }
radius:  { sm:8, md:12, lg:16, xl:20, '2xl':28, pill:9999 }
shadow:  {
  sm: '0 1px 2px rgba(15,15,20,0.06)',
  md: '0 4px 12px rgba(15,15,20,0.08)',
  lg: '0 12px 32px rgba(15,15,20,0.12)',
  glow: (color) => `0 0 24px ${color}55`   // 캐릭터 액센트
}
```

채팅 버블 라운드: 어시스턴트 `radius.xl` 4모서리, 사용자 `radius.xl` (꼬리쪽만 sm).

## 5. 아이콘 & 일러스트

- 아이콘 셋: **Lucide** (오픈 소스, 1.5px stroke).
- 캐릭터 일러스트: 시드 고정 OpenAI 생성본 + 후보정 PNG (1024x1024, 투명 배경 1버전 / 단색 배경 1버전).
- 날씨 픽토그램: Lucide weather + 커스텀 3종 (안개, 황사, 극단호우).

## 6. 다이내믹 날씨 테마 적용 로직

```ts
// packages/ui/src/themes/weatherTheme.ts
export function getWeatherTheme(condition: WeatherCondition, time: 'day' | 'night') {
  const grad = weather[condition];
  const overlay = time === 'night' ? 'rgba(15,15,30,0.25)' : 'rgba(255,255,255,0.0)';
  return {
    gradient: grad,
    overlay,
    particle: pickParticle(condition),    // 'raindrop' | 'sunray' | 'fog' | 'lightning' | null
    soundscape: pickAsmr(condition),      // optional
  };
}
```

- 적용 위치: `<ChatBackground />` 컴포넌트 — 화면 전체 absolute 레이어.
- 모션: 비 = Y축 떨어지는 파티클(40개), 맑음 = 회전하는 라이트빔(부드러운 가우시안), 천둥 = 1.5~6초 랜덤 플래시.

## 7. 컴포넌트 카탈로그

### 7.1 Button
- Variants: `primary | secondary | ghost | danger`
- Sizes: `sm | md | lg`
- States: default / hover / pressed / disabled / loading
- 라운드 `radius.lg`, height md=44.

### 7.2 ChatBubble
- Props: `role`, `modality`, `tail`, `accentColor`, `timestamp`, `pending`
- 어시스턴트: 좌측 정렬, 흰 카드 + 캐릭터 액센트 1px 보더.
- 사용자: 우측 정렬, 캐릭터 액센트 배경 + ink 텍스트.
- pending: dot typing 애니메이션.

### 7.3 ChatComposer
- 입력 영역 자동 높이 (1~5줄), 좌측 액션 아이콘 슬롯 3개, 우측 send 버튼(disabled until non-empty).
- 키보드 회피 (mobile: KeyboardAvoidingView, web: sticky bottom).

### 7.4 CharacterCard
- 일러스트 background + 그라데이션 오버레이 + 캐릭터 이름 + 한 줄 무드.
- 호버/탭: 액센트 글로우.

### 7.5 WeatherBadge
- 아이콘 + 온도 + 컨디션 + 위치 라벨. 탭 시 위치 변경.

### 7.6 ProductCard
- 캐릭터의 "선물" 톤. 16:9 상품 이미지 + 제목 + 가격 + "지금 보기" CTA.
- 캐릭터별 카피 템플릿: 써니="이거 어때? ☀️", 레인="이거 마음에 들지도 몰라…"

### 7.7 PaywallSheet
- 모바일: 80% 높이 bottom sheet, drag handle.
- 웹: 모달, 480px.
- 비교 표, 캐릭터 4명 미니 일러스트 가로 배치.

### 7.8 ImageMessage
- 1024x1024 정사각 카드, 라운드 lg, 로딩 시 블러 + 진행률.
- 탭 시 풀스크린 모달.

### 7.9 ToastStack
- 상단 중앙(웹) / 상단 노치 아래(mobile).
- Variants: info, success, warning, danger. 3s auto-dismiss.

### 7.10 EmptyState
- 일러스트(캐릭터별) + 문구 + 액션 버튼.

## 8. 모션 토큰

```ts
motion: {
  duration: { instant: 80, fast: 160, base: 240, slow: 400, deliberate: 700 },
  ease: {
    out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
    spring: { damping: 18, stiffness: 220 },
  },
  scale: { tap: 0.97 },
}
```

표준 인터랙션:
- 버튼 press: scale 0.97, 80ms.
- 모달 enter: fade 240ms + translateY 16→0.
- 채팅 버블 enter: opacity 0→1 + translateY 8→0, 160ms.

## 9. NativeWind 프리셋 스니펫

```js
// packages/ui/tailwind-preset.js
const tokens = require('./src/tokens/colors').tokens;

module.exports = {
  theme: {
    extend: {
      colors: {
        brand: tokens.brand,
        ink: tokens.brand.ink,
        paper: tokens.brand.paper,
        sunny: tokens.character.sunny,
        rain: tokens.character.rain,
        cloudy: tokens.character.cloudy,
        thunder: tokens.character.thunder,
        // ... semantic
      },
      borderRadius: { sm:8, md:12, lg:16, xl:20, '2xl':28 },
      fontFamily: { sans: ['Pretendard Variable', 'Inter Variable'] },
    },
  },
};
```

각 앱 `tailwind.config`는 이 프리셋을 `presets`로 임포트.

## 10. 자산 폴더 규칙

```
packages/ui/assets/
├── characters/
│   ├── sunny/  (avatar.png, full.png, stickers/01.png ...)
│   ├── rain/
│   ├── cloudy/
│   └── thunder/
├── weather/
│   └── particles/  (raindrop.lottie, sunray.json ...)
└── icons/
```

## 11. 채팅 화면 색 적용 예시

캐릭터 = sunny, 컨디션 = rain 인 경우:
- 배경 그라데이션: `weather.rain`
- 액센트(보내기 버튼, 사용자 버블, 링크): `character.sunny.primary`
- 어시스턴트 버블 보더: `character.sunny.primary @ 30%`
- 상단 날씨 배지 텍스트: `character.sunny.ink`

이 조합 매트릭스를 `getChatTheme(characterId, weatherCondition)`이 반환.

## 12. 다국어 폰트 폴백

- ja: Noto Sans JP
- en: Inter Variable
- ko: Pretendard Variable
- 시스템 폰트 폴백 체인 명시.

## 13. 디자인 토큰 → 코드 동기화

- 토큰은 `packages/ui/src/tokens/*.ts`가 진실의 원천.
- Figma 토큰은 Tokens Studio로 동일 JSON 임포트/익스포트.
- CI에서 토큰 변경 시 시각 회귀(Chromatic) 자동 실행.
