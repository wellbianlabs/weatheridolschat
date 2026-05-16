'use client';

import { useState } from 'react';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Email magic-link sign-in form.
 *
 * Flow:
 *   1. User enters email → we call supabase.auth.signInWithOtp()
 *   2. Supabase sends a magic link to that address
 *   3. User clicks the link → Supabase redirects to /auth/callback
 *   4. /auth/callback exchanges the code for a session cookie
 *   5. User lands on / (or wherever the link was originated from)
 *
 * The form is intentionally minimal — Phase 1 is just "auth works
 * + admin recognized". Social login (Kakao / Google) can be added
 * later by enabling those providers in Supabase Studio + adding
 * extra `signInWithOAuth` buttons here.
 */
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setStatus('error');
      setErrMsg('Supabase가 설정되어 있지 않아요.');
      return;
    }
    setStatus('sending');
    setErrMsg(null);
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo },
    });
    if (error) {
      setStatus('error');
      setErrMsg(error.message);
      return;
    }
    setStatus('sent');
  }

  if (status === 'sent') {
    return (
      <div className="rounded-2xl border border-brand-ink/10 bg-white p-5">
        <div className="font-display text-xl text-brand-ink">메일 보냈어요.</div>
        <p className="mt-2 font-sans text-[14px] leading-relaxed text-brand-ink-soft">
          <strong className="text-brand-ink">{email}</strong> 받은편지함을 확인해주세요.
          매직 링크를 클릭하면 자동으로 로그인됩니다.
        </p>
        <button
          type="button"
          onClick={() => {
            setStatus('idle');
            setEmail('');
          }}
          className="mt-4 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
        >
          ← 다른 이메일로 다시 보내기
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <label className="block font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        이메일
      </label>
      <input
        type="email"
        required
        autoFocus
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        className="h-12 w-full rounded-full border border-brand-ink/12 bg-white px-5 font-sans text-[15px] text-brand-ink outline-none transition focus:border-brand-ink/40"
      />
      <button
        type="submit"
        disabled={status === 'sending' || !email.trim()}
        className="flex h-12 w-full items-center justify-center rounded-full bg-brand-accent font-sans text-[14px] font-medium text-white transition disabled:opacity-60"
      >
        {status === 'sending' ? '보내는 중…' : '매직 링크 받기'}
      </button>
      {status === 'error' && errMsg ? (
        <p className="font-sans text-[12px] text-red-500">{errMsg}</p>
      ) : null}
    </form>
  );
}
