export const motion = {
  duration: {
    instant: 80,
    fast: 160,
    base: 240,
    slow: 400,
    deliberate: 700,
  },
  ease: {
    out: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    inOut: 'cubic-bezier(0.4, 0, 0.2, 1)',
  },
  spring: { damping: 18, stiffness: 220 },
  scale: { tap: 0.97 },
} as const;
