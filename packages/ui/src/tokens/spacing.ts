export const spacing = {
  0: 0,
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  5: 20,
  6: 24,
  8: 32,
  10: 40,
  12: 48,
  16: 64,
  20: 80,
  24: 96,
  32: 128,
} as const;

export const radius = {
  none: 0,
  xs: 4,
  sm: 6,
  md: 8,
  lg: 12,
  xl: 16,
  '2xl': 20,
  '3xl': 24,
  pill: 9999,
} as const;

export const shadow = {
  xs: '0 1px 2px rgba(31,27,23,0.04)',
  sm: '0 2px 6px rgba(31,27,23,0.06)',
  md: '0 4px 14px rgba(31,27,23,0.08)',
  lg: '0 12px 32px rgba(31,27,23,0.10)',
  xl: '0 24px 64px rgba(31,27,23,0.14)',
} as const;
