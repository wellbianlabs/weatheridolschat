'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { Button, Eyebrow, Wordmark } from '@wi/ui/web';

export default function OnboardingPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');

  useEffect(() => {
    const existing = localStorage.getItem('wi.nickname');
    if (existing) setNickname(existing);
  }, []);

  function complete() {
    const v = nickname.trim();
    if (!v) return;
    localStorage.setItem('wi.nickname', v);
    localStorage.setItem('wi.onboarded', '1');
    router.push('/characters');
  }

  return (
    <main className="bg-dreamy-vertical flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-8 py-6">
        <Link
          href="/"
          className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
        >
          ← Home
        </Link>
        <span className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
          Step 01 / 01
        </span>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-8 pb-24">
        <Wordmark size="md" />

        <h1 className="mt-10 font-display text-[56px] font-medium leading-[1.05] tracking-tightest text-brand-ink md:text-[72px]">
          뭐라고
          <br />
          부르면 좋을까?
        </h1>

        <p className="mt-5 max-w-md font-sans text-[17px] leading-relaxed text-brand-ink-soft">
          4명의 아이돌이 너를 부를 닉네임이 필요해요. 언제든 설정에서 바꿀 수 있어요.
        </p>

        <div className="mt-12 flex flex-col gap-3">
          <label className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
            Nickname · 닉네임
          </label>
          <input
            autoFocus
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="예: 창민"
            maxLength={20}
            className="w-full border-b-2 border-brand-ink/15 bg-transparent pb-3 font-display text-4xl font-medium text-brand-ink outline-none transition focus:border-brand-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') complete();
            }}
          />
        </div>

        <div className="mt-10 flex flex-col gap-3 md:flex-row md:items-center">
          <Button variant="accent" size="lg" onClick={complete} disabled={!nickname.trim()}>
            계속하기 →
          </Button>
          <span className="font-sans text-[13px] text-brand-ink-soft">⏎ Enter로 빠르게 진행</span>
        </div>
      </div>

      <footer className="mx-auto w-full max-w-3xl px-8 py-6 font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        © 2026 Weather Idols · Prism Station
      </footer>
    </main>
  );
}
