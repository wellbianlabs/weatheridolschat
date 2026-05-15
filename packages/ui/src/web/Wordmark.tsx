import type { CSSProperties } from 'react';

type Size = 'sm' | 'md' | 'lg' | 'xl' | 'hero';

const SIZE_TOKENS: Record<Size, { en: string; ko: string }> = {
  sm: { en: 'text-xl', ko: 'text-[10px]' },
  md: { en: 'text-3xl', ko: 'text-[12px]' },
  lg: { en: 'text-5xl', ko: 'text-sm' },
  xl: { en: 'text-7xl', ko: 'text-base' },
  hero: { en: 'text-[120px] leading-[0.85]', ko: 'text-xl' },
};

/**
 * Weather Idols wordmark.
 * - "Weather idols" rendered with pink → lilac → purple gradient
 * - Korean subtitle "날씨의 ✦ 아이돌"
 * - Always upright (NO italic).
 */
export function Wordmark({
  size = 'md',
  showSubtitle = true,
  className,
  style,
  align = 'left',
}: {
  size?: Size;
  showSubtitle?: boolean;
  className?: string;
  style?: CSSProperties;
  align?: 'left' | 'center';
}) {
  const tokens = SIZE_TOKENS[size];
  return (
    <div
      className={['flex flex-col', align === 'center' ? 'items-center text-center' : 'items-start', className ?? ''].join(' ')}
      style={style}
    >
      <span
        className={[
          'font-display font-normal tracking-tight',
          'bg-grad-wordmark bg-clip-text text-transparent',
          tokens.en,
        ].join(' ')}
        style={{ lineHeight: 0.95 }}
      >
        Weather idols
      </span>
      {showSubtitle ? (
        <span
          className={[
            'mt-1 inline-flex items-center gap-1.5 font-sans font-medium text-brand-accent',
            tokens.ko,
          ].join(' ')}
        >
          <span>날씨의</span>
          <span aria-hidden className="text-brand-accent/80">✦</span>
          <span>아이돌</span>
        </span>
      ) : null}
    </div>
  );
}
