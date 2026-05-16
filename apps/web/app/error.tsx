'use client';

import { useEffect } from 'react';

/**
 * Global error boundary for the App Router. Catches any uncaught
 * client-side render exception that isn't handled by a closer
 * error.tsx and shows the user something useful — including the
 * error message — instead of Next.js's bare "Application error"
 * white screen.
 *
 * Logs the digest + raw message to the console so we can grep for
 * it in browser DevTools / Vercel.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error.tsx] caught:', error.message, error);
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center px-6 py-12 bg-dreamy-vertical">
      <div className="w-full rounded-3xl bg-white p-8 shadow-md">
        <div className="font-mono text-[10px] uppercase tracking-eyebrow text-red-500">
          ★ Error
        </div>
        <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-brand-ink">
          잠시 문제가 생겼어요.
        </h1>
        <p className="mt-3 font-sans text-[14px] leading-relaxed text-brand-ink-soft">
          페이지를 다시 시도하거나 홈으로 돌아가주세요. 같은 문제가 반복되면 아래
          기술 정보를 운영자에게 알려주시면 큰 도움이 돼요.
        </p>
        <pre className="mt-4 max-h-32 overflow-auto rounded-2xl bg-brand-paper p-3 font-mono text-[11px] text-brand-ink-soft">
          {error.message}
          {error.digest ? `\nDigest: ${error.digest}` : ''}
        </pre>
        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={reset}
            className="h-11 flex-1 rounded-full bg-brand-accent font-sans text-[14px] font-medium text-white transition hover:opacity-90"
          >
            다시 시도
          </button>
          <a
            href="/"
            className="flex h-11 flex-1 items-center justify-center rounded-full border border-brand-ink/15 bg-white font-sans text-[14px] font-medium text-brand-ink-soft transition hover:border-brand-ink/30 hover:text-brand-ink"
          >
            홈으로
          </a>
        </div>
      </div>
    </main>
  );
}
