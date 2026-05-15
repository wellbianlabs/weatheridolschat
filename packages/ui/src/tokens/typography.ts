/**
 * Editorial typography mix.
 * - Serif display for headlines (DM Serif Display) — sophistication.
 * - Grotesque sans for UI body (Inter / Space Grotesk).
 * - Mono for labels and micro UI text.
 */
export const typography = {
  fonts: {
    display: ['"DM Serif Display"', '"Pretendard Variable"', 'Georgia', 'serif'],
    sans: ['"Inter"', '"Pretendard Variable"', 'system-ui', 'sans-serif'],
    serif: ['"DM Serif Display"', '"Pretendard Variable"', 'Georgia', 'serif'],
    mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
  },
  scale: {
    hero: { size: 80, line: 80, weight: 400, tracking: -0.025 },
    display: { size: 56, line: 58, weight: 400, tracking: -0.02 },
    h1: { size: 36, line: 42, weight: 400, tracking: -0.015 },
    h2: { size: 26, line: 32, weight: 500, tracking: -0.01 },
    h3: { size: 20, line: 28, weight: 500, tracking: -0.005 },
    bodyLg: { size: 17, line: 26, weight: 400, tracking: -0.005 },
    body: { size: 15, line: 24, weight: 400, tracking: 0 },
    bodyStrong: { size: 15, line: 24, weight: 500, tracking: 0 },
    caption: { size: 13, line: 18, weight: 400, tracking: 0.005 },
    micro: { size: 10, line: 12, weight: 600, tracking: 0.15 }, // uppercase eyebrow
    chat: { size: 15, line: 22, weight: 400, tracking: 0 },
  },
} as const;
