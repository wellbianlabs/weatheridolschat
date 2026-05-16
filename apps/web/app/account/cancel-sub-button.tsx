'use client';

import { useState } from 'react';

/**
 * Subscription cancel button. Calls /api/payments/cancel and
 * reloads the page so the user sees the new status. The server
 * keeps premium access until current_period_end so users get the
 * time they already paid for.
 */
export default function CancelSubButton() {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCancel() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/payments/cancel', { method: 'POST' });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(data.error?.message ?? `HTTP ${res.status}`);
      }
      window.location.reload();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="mt-4 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-red-500"
      >
        구독 해지
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-50/50 p-3">
      <p className="font-sans text-[13px] text-brand-ink">
        해지하면 다음 결제일부터 자동 결제가 멈춰요. 남은 기간 동안은 Premium이
        그대로 유지됩니다.
      </p>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={doCancel}
          disabled={busy}
          className="h-9 flex-1 rounded-full bg-red-500 px-4 font-sans text-[13px] font-medium text-white disabled:opacity-60"
        >
          {busy ? '해지 중…' : '해지 확정'}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={busy}
          className="h-9 flex-1 rounded-full border border-brand-ink/15 bg-white font-sans text-[13px] text-brand-ink-soft"
        >
          취소
        </button>
      </div>
      {error ? (
        <p className="mt-2 font-mono text-[10px] text-red-500">{error}</p>
      ) : null}
    </div>
  );
}
