'use client';

import type { ReactNode } from 'react';

import type { WeatherCondition } from '@wi/core/weather';
import { colorTokens } from '@wi/ui/tokens';

export default function WeatherBackground({
  condition,
  children,
}: {
  condition: WeatherCondition;
  children: ReactNode;
}) {
  const stops = colorTokens.weather[condition];
  const c1 = stops[0];
  const c2 = stops[1];
  const c3 = stops[2] ?? stops[1];
  const grad = `linear-gradient(180deg, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;

  return (
    <div className="relative min-h-screen" style={{ background: grad }}>
      {/* very subtle paper grain overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(31,27,23,0.6) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
