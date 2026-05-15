import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'accent';
type Size = 'sm' | 'md' | 'lg';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  accentColor?: string;
  fullWidth?: boolean;
  children: ReactNode;
}

const SIZES: Record<Size, string> = {
  sm: 'h-9 px-4 text-[13px]',
  md: 'h-11 px-5 text-[14px]',
  lg: 'h-12 px-6 text-[15px]',
};

/**
 * Editorial button — subtle, refined.
 * - primary: deep ink fill, paper text
 * - secondary: paper background, ink border, ink text
 * - ghost: transparent, ink text, subtle underline on hover
 * - accent: warm burnt sienna (or character accent) fill
 */
export function Button({
  variant = 'primary',
  size = 'md',
  accentColor,
  fullWidth,
  disabled,
  children,
  className,
  style,
  ...rest
}: Props) {
  const classes = (() => {
    switch (variant) {
      case 'primary':
        return 'bg-brand-ink text-brand-paper hover:bg-brand-ink-soft';
      case 'secondary':
        return 'bg-white text-brand-ink border border-brand-ink/12 hover:border-brand-ink/30';
      case 'ghost':
        return 'bg-transparent text-brand-ink hover:bg-brand-ink/5';
      case 'accent':
        return 'text-white';
    }
  })();

  const accentStyle = variant === 'accent' ? { background: accentColor ?? '#C44F2D', ...style } : style;

  return (
    <button
      {...rest}
      disabled={disabled}
      className={[
        'group inline-flex select-none items-center justify-center gap-1.5 rounded-full font-sans font-medium',
        'transition-all duration-200 ease-out',
        'disabled:cursor-not-allowed disabled:opacity-40',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-ink/20 focus-visible:ring-offset-2 focus-visible:ring-offset-brand-paper',
        SIZES[size],
        classes,
        fullWidth ? 'w-full' : '',
        className ?? '',
      ].join(' ')}
      style={accentStyle}
    >
      {children}
    </button>
  );
}
