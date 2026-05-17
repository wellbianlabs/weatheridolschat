/**
 * Soft pastel summer K-pop Tailwind preset.
 * Used by apps/web (Next.js) and apps/mobile (NativeWind).
 */
const colors = {
  brand: {
    DEFAULT: '#241B3E',
    primary: '#241B3E',
    secondary: '#6A5F8A',
    accent: '#F49ABE',
    paper: '#FFFAF3',
    'paper-warm': '#FFF1E4',
    'paper-sky': '#E6F0FB',
    'paper-lilac': '#F0E8FB',
    ink: '#241B3E',
    // ink-soft is for secondary text. Was #5E5478 (lighter purple) but
    // at small sizes (10-11px eyebrow chips) on the cream paper bg
    // it read as washed out. Darker mix bumps contrast to ~7.5:1 vs
    // the prior ~5.8:1 — still distinct from primary ink but legible
    // at micro sizes without losing the "soft" feel.
    'ink-soft': '#4A4068',
    chrome: '#E7DDF0',
  },
  sunny: {
    DEFAULT: '#E48F5A',
    soft: '#FFE5D2',
    ink: '#5A2A0F',
    accent: '#F3C9A2',
  },
  rain: {
    DEFAULT: '#7AA5CF',
    soft: '#DCEAF6',
    ink: '#1A3759',
    accent: '#B2CCE3',
  },
  cloudy: {
    DEFAULT: '#B79ECC',
    soft: '#EADCF3',
    ink: '#3D2A56',
    accent: '#CFBADD',
  },
  thunder: {
    DEFAULT: '#7A6BB5',
    soft: '#D9CFEC',
    ink: '#241B3E',
    accent: '#A398CB',
  },
  success: '#7AAC8E',
  warning: '#E4A86B',
  danger: '#D67B7B',
  info: '#7AA5CF',
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors,
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '12px',
        xl: '16px',
        '2xl': '20px',
        '3xl': '28px',
      },
      fontFamily: {
        // Korean readability is the top priority. The browser picks
        // per-glyph: Hangul characters hit Noto Sans KR first
        // (loaded via next/font in apps/web/app/layout.tsx), Latin
        // hits Inter, and only failures cascade to system-ui. The
        // old chain listed "Pretendard Variable" without actually
        // loading it, so Hangul fell through to Linux's Liberation
        // Sans on Vercel — visibly thin and grey. With Noto loaded
        // the same characters render crisp.
        display: [
          'Playfair Display',
          'var(--font-sans-kr)',
          'Pretendard Variable',
          'Georgia',
          'serif',
        ],
        sans: [
          'var(--font-sans-kr)',
          'Inter',
          'Pretendard Variable',
          'system-ui',
          'sans-serif',
        ],
        serif: [
          'Playfair Display',
          'var(--font-sans-kr)',
          'Pretendard Variable',
          'Georgia',
          'serif',
        ],
        // Mono stays Latin-only; Korean inside `<code>` blocks falls
        // through to Noto Sans KR for legibility (better than
        // forcing JetBrains Mono's Latin glyphs onto Hangul).
        mono: ['JetBrains Mono', 'var(--font-sans-kr)', 'ui-monospace', 'monospace'],
      },
      // Korean glyphs read narrower than Latin at the same px size,
      // so default `text-xs` (12px) is the practical floor for body
      // copy. Anything smaller becomes a UI label only, never a
      // sentence. The chip ramps below are slightly larger than
      // Tailwind defaults specifically to lift the 9-11px eyebrow
      // band off the legibility cliff.
      fontSize: {
        // Custom micro-label scale used by chips / eyebrows.
        chip: ['11px', { lineHeight: '14px', letterSpacing: '0.08em' }],
        // 13px = tightest body text we ever ship. Anything finer is
        // a chip, not body.
        micro: ['13px', { lineHeight: '18px' }],
      },
      boxShadow: {
        xs: '0 1px 2px rgba(36,27,62,0.04)',
        sm: '0 2px 8px rgba(36,27,62,0.06)',
        md: '0 6px 18px rgba(36,27,62,0.08)',
        lg: '0 14px 40px rgba(36,27,62,0.10)',
        xl: '0 28px 72px rgba(36,27,62,0.14)',
        soft: '0 10px 40px rgba(244,154,190,0.15)',
      },
      backgroundImage: {
        'grad-paper-sky': 'linear-gradient(120deg, #FFFAF3 0%, #FFF6F0 40%, #E6F0FB 100%)',
        'grad-paper-warm': 'linear-gradient(135deg, #FFF1E4 0%, #F0E8FB 100%)',
        'grad-wordmark': 'linear-gradient(90deg, #F49ABE 0%, #C9A4E5 50%, #9A8FE0 100%)',
        'grad-sunset': 'linear-gradient(135deg, #FFC9A4 0%, #F49ABE 50%, #C9A4E5 100%)',
        'grad-ink': 'linear-gradient(180deg, #241B3E 0%, #5E5478 100%)',
      },
      letterSpacing: {
        tightest: '-0.025em',
        // Eyebrow spacing: was 0.18em which on 9-10px Hangul looked
        // like floating disconnected syllables. 0.10em keeps the
        // editorial "small-caps" feel without breaking the word
        // gestalt. Korean characters in particular need tighter
        // tracking than Latin — they're already perceptually wide.
        eyebrow: '0.10em',
      },
      keyframes: {
        'fade-up': {
          // Slightly more pronounced rise (+12px from +8px) + a hair
          // of scale so freshly-arrived chat bubbles "pop" rather
          // than fade. Read as physical landing in the messaging
          // surface, not a slow opacity ramp.
          '0%': { opacity: '0', transform: 'translateY(12px) scale(0.98)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        shimmer: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        // Typing indicator — three dots that gently rise & fade in sequence.
        // Each dot uses the same keyframes with a stagger delay applied inline.
        'typing-bounce': {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.3' },
          '40%': { transform: 'translateY(-4px)', opacity: '1' },
        },
        // Blinking cursor at the tail of a streaming message.
        'cursor-blink': {
          '0%, 50%': { opacity: '1' },
          '51%, 100%': { opacity: '0' },
        },
        // Loader sweep for image generation — diagonal gloss across placeholder.
        'sheen-sweep': {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.22,0.61,0.36,1) both',
        shimmer: 'shimmer 8s ease-in-out infinite',
        'typing-bounce': 'typing-bounce 1.2s ease-in-out infinite',
        'cursor-blink': 'cursor-blink 0.9s steps(1) infinite',
        'sheen-sweep': 'sheen-sweep 1.6s ease-in-out infinite',
      },
    },
  },
};
