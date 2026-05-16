'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

import { Button, Wordmark } from '@wi/ui/web';

import { getBrowserSupabase } from '@/lib/supabase/browser';

/**
 * Top navigation that's aware of the visitor's auth state.
 *
 * Client Component on purpose — that lets us drop it into both the
 * marketing pages (Server Components) and the few existing Client
 * Components (characters page) without having to thread an async
 * RSC through a "use client" boundary.
 *
 * Tradeoff: server-rendered HTML shows the logged-out shape on first
 * paint, then the chip flips to "내 계정" as soon as supabase.auth
 * resolves the session client-side. That's ~1 frame on a warm session
 * and we keep `Login` visible the rest of the time, so the worst
 * case is a tiny visual snap — not a bad UX trade for the codebase
 * simplification.
 *
 * Variants:
 *   - 'transparent' — nav floats above a hero image; no backdrop. Used
 *     on the home page over the photo.
 *   - 'solid'       — sticky with a paper background + bottom border.
 *     Used on the characters/pricing/onboarding pages.
 */
const ADMIN_EMAILS = ['admin@wellbianlabs.io']; // mirror of the server allowlist

export default function HeaderNav({
  variant = 'solid',
}: {
  variant?: 'solid' | 'transparent';
}) {
  const [account, setAccount] = useState<{ email: string | null; isAdmin: boolean } | null>(
    null,
  );

  useEffect(() => {
    // Defensive on purpose — any failure inside here must NEVER
    // bubble up and break the page. The nav is decoration; the page
    // content underneath is what users actually came for.
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

  return (
    <header className={wrapClass}>
      {variant === 'transparent' ? (
        renderContent(account, loggedIn)
      ) : (
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 md:px-8 md:py-4">
          {renderContent(account, loggedIn)}
        </div>
      )}
    </header>
  );
}

function renderContent(
  account: { email: string | null; isAdmin: boolean } | null,
  loggedIn: boolean,
) {
  return (
    <>
      <Link href="/" className="block" aria-label="Home">
        <Wordmark size="sm" showSubtitle={false} />
      </Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <Link href="/characters">
          <Button variant="ghost" size="sm">
            Characters
          </Button>
        </Link>
        <Link href="/pricing" className="hidden sm:inline-block">
          <Button variant="ghost" size="sm">
            Pricing
          </Button>
        </Link>

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
          <Link href="/login">
            <Button variant="ghost" size="sm">
              로그인
            </Button>
          </Link>
        )}

        <Link href={loggedIn ? '/characters' : '/onboarding'}>
          <Button variant="accent" size="sm">
            {loggedIn ? '채팅' : '시작하기'}
          </Button>
        </Link>
      </nav>
    </>
  );
}
