import type { CSSProperties, ReactNode } from 'react';

type Variant = 'flat' | 'elevated' | 'outlined';

/**
 * Soft, editorial card. Defaults to a tasteful elevation.
 */
export function Card({
  variant = 'elevated',
  className,
  style,
  children,
}: {
  variant?: Variant;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const classes = (() => {
    switch (variant) {
      case 'flat':
        return 'bg-white';
      case 'elevated':
        return 'bg-white shadow-sm';
      case 'outlined':
        return 'bg-white border border-brand-ink/8';
    }
  })();
  return (
    <div className={['rounded-2xl', classes, className ?? ''].join(' ')} style={style}>
      {children}
    </div>
  );
}
