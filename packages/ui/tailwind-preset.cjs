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
    'ink-soft': '#5E5478',
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
        display: ['Playfair Display', 'Pretendard Variable', 'Georgia', 'serif'],
        sans: ['Inter', 'Pretendard Variable', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Pretendard Variable', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
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
        eyebrow: '0.18em',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%,100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
      },
      animation: {
        'fade-up': 'fade-up 320ms cubic-bezier(0.22,0.61,0.36,1) both',
        shimmer: 'shimmer 8s ease-in-out infinite',
      },
    },
  },
};
