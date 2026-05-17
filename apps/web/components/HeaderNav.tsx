'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Wordmark } from '@wi/ui/web';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Top navigation, login-state aware.
 *
 * Deliberately minimal markup — plain `<Link>` elements styled as
 * pill buttons, no nested `<Button>` components inside `<Link>`. The
 * nested-button-in-anchor pattern (Link wrapping Button) is invalid
 * HTML and can break hydration in some React/Next combinations, so
 * we render styled anchors directly.
 *
 * Client Component so we can subscribe to supabase.auth state. The
 * useEffect is wrapped in try/catch — any auth failure logs to
 * stderr and leaves the chip in the logged-out shape. The nav must
 * never break the underlying page.
 */
const ADMIN_EMAILS = ['admin@wellbianlabs.io'];

type Account = { email: string | null; isAdmin: boolean } | null;

const linkClass =
  'inline-flex items-center justify-center h-9 px-3.5 rounded-full font-sans text-[13px] text-brand-ink hover:bg-brand-ink/5 transition-colors';
const linkClassMuted =
  'inline-flex items-center justify-center h-9 px-3.5 rounded-full font-sans text-[13px] text-brand-ink-soft hover:text-brand-ink hover:bg-brand-ink/5 transition-colors';
const accentClass =
  'inline-flex items-center justify-center h-9 px-4 rounded-full font-sans text-[13px] font-medium text-white bg-brand-accent hover:opacity-90 transition-opacity';

export default function HeaderNav({
  variant = 'solid',
}: {
  variant?: 'solid' | 'transparent';
}) {
  const [account, setAccount] = useState<Account>(null);

  useEffect(() => {
    try {
      const supabase = getBrowserSupabase();
      if (!supabase) return;
      let alive = true;
      const apply = (email: string | null) => {
        if (!alive) return;
        setAccount({
          email,
          isAdmin: !!email && ADMIN_EMAILS.includes(email.toLowerCase()),
        });
      };
      void supabase.auth
        .getUser()
        .then(({ data }) => apply(data.user?.email ?? null))
        .catch((err) => {
          // Auth failures never block the page — log and stay anon.
          console.warn('[HeaderNav] getUser failed:', (err as Error).message);
        });
      const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
        apply(session?.user?.email ?? null);
      });
      return () => {
        alive = false;
        sub.subscription.unsubscribe();
      };
    } catch (err) {
      console.warn('[HeaderNav] init failed:', (err as Error).message);
      return;
    }
  }, []);

  const loggedIn = !!account?.email;

  const wrapClass =
    variant === 'transparent'
      ? 'absolute inset-x-0 top-0 z-20 mx-auto flex max-w-6xl items-center justify-between px-8 py-6'
      : 'sticky top-0 z-20 border-b border-brand-ink/8 bg-brand-paper/80 backdrop-blur-md';

  const inner = (
    <>
      <Link href="/" aria-label="Home" className="block shrink-0">
        <Wordmark size="sm" showSubtitle={false} />
      </Link>
      <nav className="flex items-center gap-1">
        <Link href="/characters" className={linkClassMuted}>
          Characters
        </Link>
        <Link href="/pricing" className={`${linkClassMuted} hidden sm:inline-flex`}>
          Pricing
        </Link>
        {account?.isAdmin ? (
          // Admin-only entry — sits between Pricing and the Account
          // chip so it's discoverable without being prominent for a
          // typical user (they never see it).
          <Link
            href="/admin"
            className="inline-flex items-center justify-center h-9 px-3 rounded-full bg-red-500/10 font-mono text-[10px] uppercase tracking-eyebrow text-red-600 hover:bg-red-500/15 transition-colors"
          >
            ★ Admin
          </Link>
        ) : null}
        {loggedIn ? (
          <Link href="/account" className="ml-1 flex items-center gap-1.5 px-2">
            {account?.isAdmin ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-red-600">
                ★ Admin
              </span>
            ) : null}
            <span
              className="hidden max-w-[140px] truncate font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink sm:inline-block"
              title={account?.email ?? undefined}
            >
              {account?.email?.split('@')[0] ?? '내 계정'}
            </span>
          </Link>
        ) : (
          <Link href="/login" className={linkClass}>
            로그인
          </Link>
        )}
        <Link
          href={loggedIn ? '/characters' : '/onboarding'}
          className={`${accentClass} ml-1`}
        >
          {loggedIn ? '채팅' : '시작하기'}
        </Link>
      </nav>
    </>
  );

  if (variant === 'transparent') {
    return <header className={wrapClass}>{inner}</header>;
  }

  return (
    <header className={wrapClass}>
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 md:px-8 md:py-4">
        {inner}
      </div>
    </header>
  );
}
