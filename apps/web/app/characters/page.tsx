'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { CHARACTER_LIST } from '@wi/core/characters';
import { Button, Card, Chip, Eyebrow } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';

export default function CharactersPage() {
  const router = useRouter();
  const [nickname, setNickname] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem('wi.nickname');
    if (!stored) {
      router.replace('/onboarding');
      return;
    }
    setNickname(stored);
  }, [router]);

  if (!nickname) return null;

  return (
    <main className="bg-dreamy min-h-screen">
      <HeaderNav />
      <div className="mx-auto flex max-w-6xl justify-end px-8 pt-3">
        <Button variant="ghost" size="sm" onClick={() => router.push('/onboarding')}>
          닉네임 변경
        </Button>
      </div>

      <section className="mx-auto max-w-6xl px-8 pt-12 pb-8">
        <Eyebrow>★ Hello, {nickname}</Eyebrow>
        <h1 className="mt-3 font-display text-[56px] font-medium leading-[1.05] tracking-tightest text-brand-ink md:text-[80px]">
          오늘 누구랑
          <br />
          얘기할까?
        </h1>
        <p className="mt-4 max-w-md font-sans text-[17px] leading-relaxed text-brand-ink-soft">
          탭하면 1:1 채팅으로 이동해요. 모두 다른 매력, 모두 다른 날씨.
        </p>
      </section>

      <section className="mx-auto max-w-6xl space-y-10 px-8 py-12">
        {CHARACTER_LIST.map((c, idx) => (
          <Link key={c.id} href={`/chat/${c.id}`} className="group block">
            <Card variant="elevated" className="overflow-hidden p-0 transition hover:shadow-md">
              <div className="grid items-stretch gap-0 md:grid-cols-[1.5fr_1fr]">
                <div
                  className="relative aspect-[16/9] w-full overflow-hidden md:aspect-auto md:min-h-[360px]"
                  style={{
                    background: `linear-gradient(135deg, ${c.accentColor}1f 0%, ${c.accentColor}0a 60%, #FFFAF3 100%)`,
                  }}
                >
                  {c.rosterImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={c.rosterImageUrl}
                      alt={`${c.displayNameEn} roster`}
                      className="absolute inset-0 h-full w-full object-cover transition duration-700 group-hover:scale-[1.02]"
                      loading="lazy"
                    />
                  ) : null}
                  <div
                    className="pointer-events-none absolute left-5 top-5 font-display text-[32px] font-medium leading-none text-white"
                    style={{ textShadow: '0 2px 12px rgba(0,0,0,0.3)' }}
                  >
                    {String(idx + 1).padStart(2, '0')}
                  </div>
                </div>
                <div className="flex flex-col justify-center gap-4 p-8 md:p-10">
                  <Eyebrow>
                    {c.displayNameEn} · {c.originRegion}
                  </Eyebrow>
                  <span
                    className="block font-display text-[56px] font-medium leading-none tracking-tight"
                    style={{ color: c.accentColor }}
                  >
                    {c.displayName}
                  </span>
                  <p className="max-w-sm font-sans text-[16px] leading-relaxed text-brand-ink-soft">
                    {c.shortBio}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    {c.recommendationDomains.slice(0, 3).map((d) => (
                      <Chip key={d} variant="outline">
                        {d}
                      </Chip>
                    ))}
                  </div>
                  <div className="flex items-center gap-1 pt-2 font-sans text-sm text-brand-ink">
                    <span className="underline-offset-4 group-hover:underline">대화 시작</span>
                    <span
                      className="transition-transform group-hover:translate-x-0.5"
                      style={{ color: c.accentColor }}
                    >
                      →
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </section>

      <footer className="mx-auto max-w-6xl border-t border-brand-ink/10 px-8 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
          <span>© 2026 Weather Idols · Prism Station</span>
        </div>
      </footer>
    </main>
  );
}
