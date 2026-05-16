import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Eyebrow } from '@wi/ui/web';

import { getCreditBalance, listRecentPayments } from '@/lib/payments';
import { resolveUser } from '@/lib/supabase/identity';

import CancelSubButton from './cancel-sub-button';

export const dynamic = 'force-dynamic';

export default async function AccountPage({
  searchParams,
}: {
  searchParams: { paid?: string };
}) {
  const user = await resolveUser();
  if (!user) {
    redirect('/login?next=/account');
  }
  const credits = await getCreditBalance(user.id);
  const payments = await listRecentPayments(user.id, 10);
  const sub = user.subscription ?? null;
  const justPaid = searchParams.paid === '1';

  const tierBadge = (() => {
    if (user.isAdmin)
      return (
        <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-red-600">
          ★ Admin
        </span>
      );
    if (sub)
      return (
        <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-brand-accent">
          ★ Premium
        </span>
      );
    return (
      <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 font-mono text-[9px] uppercase tracking-eyebrow text-brand-ink-soft">
        Free
      </span>
    );
  })();

  return (
    <main className="mx-auto min-h-screen max-w-2xl px-6 py-12 bg-dreamy-vertical">
      <Link
        href="/"
        className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft hover:text-brand-ink"
      >
        ← Home
      </Link>

      <header className="mt-8 flex items-start justify-between">
        <div>
          <Eyebrow>★ Account</Eyebrow>
          <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-brand-ink">
            내 계정
          </h1>
          <p className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
            {user.email}
          </p>
        </div>
        <div className="pt-2">{tierBadge}</div>
      </header>

      {justPaid ? (
        <div className="mt-6 rounded-2xl border border-brand-accent/30 bg-brand-accent/10 px-4 py-3 font-sans text-[13px] text-brand-accent">
          ✓ 결제가 완료됐어요. 잔액과 구독 상태가 아래에 반영됐어요.
        </div>
      ) : null}

      {/* Credit balance */}
      <section className="mt-8 rounded-3xl border border-brand-ink/10 bg-white p-6">
        <div className="flex items-baseline justify-between">
          <h2 className="font-display text-2xl text-brand-ink">크레딧</h2>
          <Link
            href="/pricing"
            className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-accent hover:underline"
          >
            충전 →
          </Link>
        </div>
        <div className="mt-3 flex items-baseline gap-2">
          <span className="font-display text-5xl text-brand-ink">
            {credits.balance.toLocaleString()}
          </span>
          <span className="font-sans text-[14px] text-brand-ink-soft">credits</span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
          <div>
            누적 구매 <span className="text-brand-ink">{credits.totalPurchased.toLocaleString()}</span>
          </div>
          <div>
            누적 사용 <span className="text-brand-ink">{credits.totalConsumed.toLocaleString()}</span>
          </div>
        </div>
        <p className="mt-3 font-sans text-[12px] leading-relaxed text-brand-ink-soft">
          크레딧은 셀카 5개 / 날씨송 30개 단위로 차감돼요. 일일 무료 한도를 다 쓴 뒤
          자동으로 크레딧에서 결제됩니다.
        </p>
      </section>

      {/* Subscription */}
      <section className="mt-6 rounded-3xl border border-brand-ink/10 bg-white p-6">
        <h2 className="font-display text-2xl text-brand-ink">구독</h2>
        {sub ? (
          <div className="mt-3 space-y-2 font-sans text-[14px] text-brand-ink">
            <div>
              플랜:{' '}
              <span className="font-medium">
                {sub.plan === 'monthly' ? '월 구독' : '연 구독'}
              </span>
            </div>
            <div>
              상태:{' '}
              <span
                className={`font-medium ${
                  sub.status === 'active' ? 'text-brand-accent' : 'text-brand-ink-soft'
                }`}
              >
                {sub.status === 'active'
                  ? '활성'
                  : sub.status === 'canceled'
                    ? '해지 예약'
                    : sub.status === 'past_due'
                      ? '결제 실패 — 확인 필요'
                      : '만료됨'}
              </span>
            </div>
            <div>
              다음{' '}
              {sub.status === 'active' ? '결제' : '만료'}일:{' '}
              <span className="font-mono text-[12px]">
                {new Date(sub.currentPeriodEnd).toLocaleString('ko-KR', {
                  timeZone: 'Asia/Seoul',
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </span>
            </div>
            {sub.status === 'active' ? <CancelSubButton /> : null}
          </div>
        ) : (
          <div className="mt-3">
            <p className="font-sans text-[14px] text-brand-ink-soft">
              현재 구독 중이 아니에요. 매일 더 많은 대화 + 셀카 20장/일 + 날씨송
              3곡/일을 받고 싶다면 Premium 으로 업그레이드 해보세요.
            </p>
            <Link
              href="/pricing"
              className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-brand-accent px-5 font-sans text-[14px] font-medium text-white transition hover:opacity-90"
            >
              플랜 보기
            </Link>
          </div>
        )}
      </section>

      {/* Payment history */}
      <section className="mt-6 rounded-3xl border border-brand-ink/10 bg-white p-6">
        <h2 className="font-display text-2xl text-brand-ink">최근 결제</h2>
        {payments.length === 0 ? (
          <p className="mt-3 font-sans text-[14px] text-brand-ink-soft">
            아직 결제 내역이 없어요.
          </p>
        ) : (
          <ul className="mt-4 divide-y divide-brand-ink/10">
            {payments.map((p) => (
              <li
                key={p.id as string}
                className="flex items-center justify-between py-3 font-sans text-[14px]"
              >
                <div>
                  <div className="text-brand-ink">
                    {p.kind === 'subscription'
                      ? '구독 결제'
                      : p.kind === 'credit_pack'
                        ? `크레딧 ${p.credit_pack ?? ''}`
                        : '환불 / 실패'}
                  </div>
                  <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
                    {new Date(p.created_at as string).toLocaleString('ko-KR', {
                      timeZone: 'Asia/Seoul',
                      dateStyle: 'short',
                      timeStyle: 'short',
                    })}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-brand-ink">
                    ₩{(p.amount_krw as number).toLocaleString()}
                  </div>
                  <div
                    className={`font-mono text-[10px] uppercase tracking-eyebrow ${
                      p.status === 'paid'
                        ? 'text-brand-accent'
                        : p.status === 'pending'
                          ? 'text-brand-ink-soft'
                          : 'text-red-500'
                    }`}
                  >
                    {p.status}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="mt-10 flex items-center justify-between font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        <Link href="/auth/logout" className="hover:text-brand-ink">
          로그아웃 ↗
        </Link>
        <Link href="/pricing" className="hover:text-brand-ink">
          가격 보기 →
        </Link>
      </div>
    </main>
  );
}
