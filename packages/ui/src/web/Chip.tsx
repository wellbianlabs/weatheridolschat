import type { CSSProperties, ReactNode } from 'react';

type Variant = 'outline' | 'ink' | 'soft' | 'accent';

/**
 * Refined eyebrow / metadata chip. Small, uppercase, tracked.
 */
export function Chip({
  variant = 'outline',
  color,
  className,
  style,
  children,
}: {
  variant?: Variant;
  color?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const classes = (() => {
    switch (variant) {
      case 'outline':
        return 'border border-brand-ink/15 text-brand-ink-soft bg-transparent';
      case 'ink':
        return 'bg-brand-ink text-brand-paper border border-brand-ink';
      case 'soft':
        return 'bg-brand-paper-deep text-brand-ink-soft border border-transparent';
      case 'accent':
        return 'text-white';
    }
  })();
  const accentStyle = variant === 'accent' ? { background: color ?? '#C44F2D', ...style } : style;
  return (
    <span
      className={[
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1',
        'font-mono text-[10px] font-semibold uppercase tracking-eyebrow',
        classes,
        className ?? '',
      ].join(' ')}
      style={accentStyle}
    >
      {children}
    </span>
  );
}
