import type { ReactNode } from 'react';

/**
 * Eyebrow label — uppercase, tracked, small. Editorial "section number" or category.
 */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={[
        'inline-block font-mono text-[10px] font-semibold uppercase tracking-eyebrow text-brand-ink-soft',
        className ?? '',
      ].join(' ')}
    >
      {children}
    </span>
  );
}
