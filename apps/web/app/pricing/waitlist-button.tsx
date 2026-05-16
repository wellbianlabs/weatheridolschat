'use client';

import { useState } from 'react';

/**
 * Phase 3 waitlist button. Stores intent locally so we can show the
 * list to the user later as a confirmation, AND so Phase 4's payment
 * flow can offer them an "early bird" discount when payments go
 * live. Real signup will go through Supabase + a `waitlist` table
 * once /api/waitlist is built.
 */
export default function WaitlistButton() {
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="flex h-11 w-full items-center justify-center rounded-full bg-brand-accent/15 font-sans text-[14px] font-medium text-brand-accent">
        ✓ 출시 알림 등록 완료
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        try {
          localStorage.setItem('wi.waitlist', new Date().toISOString());
        } catch {
          /* private browsing — silently ignore */
        }
        setDone(true);
      }}
      className="flex h-11 w-full items-center justify-center rounded-full bg-brand-accent font-sans text-[14px] font-medium text-white transition hover:opacity-90"
    >
      출시 알림 받기
    </button>
  );
}
