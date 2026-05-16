'use client';

import { useState } from 'react';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Sign-in form — OAuth (Google / Kakao) + email magic link fallback.
 *
 * OAuth is the primary flow for our K-pop chat audience:
 *   - Kakao is ubiquitous in Korea (~90% market share for daily messaging)
 *   - Google is the global default and works as a one-tap on Android
 *   - Email magic link covers everyone else (and lets users sign in
 *     without granting OAuth scopes to a third party)
 *
 * OAuth requires *Supabase project configuration*:
 *   Authentication → Providers → enable Google and Kakao, paste each
 *   provider's client id + secret, and add the production redirect
 *   URL `https://<host>/auth/callback` to the allowlist. Until that's
 *   done the buttons surface a friendly "OAuth not configured" error
 *   from Supabase itself.
 */
export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [oauthBusy, setOauthBusy] = useState<'google' | 'kakao' | null>(null);

  async function signInWithProvider(provider: 'google' | 'kakao') {
    const supabase = getBrowserSupabase();
    if (!supabase) {
      setErrMsg('Supabase가 설정되어 있지 않아요.');
      setStatus('error');
      return;
    }
    setOauthBusy(provider);
    setErrMsg(null);
    // Where the OAuth callback should land after Supabase exchanges
    // the code. Same /auth/callback handler we use for magic links —
    // exchangeCodeForSession works for both.
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo },
    });
    if (error) {
      setOauthBusy(null);
      setStatus('error');
      setErrMsg(error.message);
      return;
    }
    // signInWithOAuth navigates the browser to the provider — execution
    // here doesn't normally continue. If it does, the browser is about
    // to leave anyway; keep the spinner up.
  }

  async function submitMagicLink(e: React.FormEvent) {
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
    <div className="space-y-4">
      {/* Primary: OAuth buttons */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => signInWithProvider('kakao')}
          disabled={oauthBusy !== null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-[#FEE500] font-sans text-[15px] font-medium text-[#000000] transition hover:opacity-90 disabled:opacity-60"
        >
          <KakaoIcon />
          {oauthBusy === 'kakao' ? '카카오로 이동 중…' : '카카오로 시작'}
        </button>
        <button
          type="button"
          onClick={() => signInWithProvider('google')}
          disabled={oauthBusy !== null}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-brand-ink/15 bg-white font-sans text-[15px] font-medium text-brand-ink transition hover:border-brand-ink/30 disabled:opacity-60"
        >
          <GoogleIcon />
          {oauthBusy === 'google' ? 'Google로 이동 중…' : 'Google로 시작'}
        </button>
      </div>

      {/* Divider */}
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-brand-ink/10" />
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          또는 이메일로
        </span>
        <span className="h-px flex-1 bg-brand-ink/10" />
      </div>

      {/* Fallback: magic link */}
      <form onSubmit={submitMagicLink} className="space-y-3">
        <input
          type="email"
          required
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
      </form>

      {status === 'error' && errMsg ? (
        <p className="font-sans text-[12px] text-red-500">{errMsg}</p>
      ) : null}
    </div>
  );
}

/** Inline Kakao "talk bubble" icon. Avoids adding an asset request to
 *  the critical login render. */
function KakaoIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 4C7.03 4 3 7.21 3 11.16c0 2.54 1.69 4.76 4.22 6.04l-.99 3.6c-.08.3.25.55.51.39l4.31-2.84c.31.02.63.04.95.04 4.97 0 9-3.21 9-7.16C21 7.21 16.97 4 12 4Z"
        fill="currentColor"
      />
    </svg>
  );
}

/** Inline Google "G" icon — multicolored as per brand guidelines. */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.99.66-2.25 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.44.34-2.1V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.46 1.18 4.94l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.46 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07L5.84 9.9C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}
