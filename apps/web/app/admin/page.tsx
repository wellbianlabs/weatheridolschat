import Link from 'next/link';
import { redirect } from 'next/navigation';

import { Eyebrow } from '@wi/ui/web';

import HeaderNav from '@/components/HeaderNav';
import {
  getCharacterPopularity,
  getDailyUsageTrend,
  getRevenueKpis,
  getScheduledSlotStats,
  getSubscriptionKpis,
  getUserKpis,
  listRecentPayments,
  listRecentSignups,
} from '@/lib/admin';
import { resolveUser } from '@/lib/supabase/identity';

export const dynamic = 'force-dynamic';

/**
 * Admin operations dashboard.
 *
 * Single-page Server Component that fans out every metric query in
 * parallel via Promise.all and renders the result as a cards +
 * tables grid. No client state — refresh the page to pull new
 * numbers. (A future enhancement might add an auto-refresh poll, but
 * for an ops dashboard with low edit pressure it's more honest to
 * let the operator decide when to re-fetch.)
 *
 * Access control:
 *   - Anonymous visitors → redirected to /login?next=/admin
 *   - Logged-in non-admin users → redirected to / (silently, not
 *     /login — they ARE logged in, we just don't have anything for
 *     them here)
 *   - admin@wellbianlabs.io (or anyone in ADMIN_EMAILS) → in.
 */
export default async function AdminPage() {
  const user = await resolveUser();
  if (!user) redirect('/login?next=/admin');
  if (!user.isAdmin) redirect('/');

  const [
    userKpis,
    subKpis,
    revenueKpis,
    recentSignups,
    recentPayments,
    usage,
    slotStats,
    charPop,
  ] = await Promise.all([
    getUserKpis(),
    getSubscriptionKpis(),
    getRevenueKpis(),
    listRecentSignups(10),
    listRecentPayments(10),
    getDailyUsageTrend(7),
    getScheduledSlotStats(),
    getCharacterPopularity(),
  ]);

  return (
    <main className="bg-dreamy-vertical min-h-screen">
      <HeaderNav />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <header className="flex items-start justify-between">
          <div>
            <Eyebrow>★ Admin</Eyebrow>
            <h1 className="mt-3 font-display text-4xl font-medium leading-tight tracking-tight text-brand-ink">
              운영 대시보드
            </h1>
            <p className="mt-2 font-sans text-[14px] text-brand-ink-soft">
              실시간 사용자 · 구독 · 결제 · 사용량 현황. 새로고침해서 최신 숫자 반영.
            </p>
          </div>
          <span className="rounded-full bg-red-500/15 px-3 py-1 font-mono text-[10px] uppercase tracking-eyebrow text-red-600">
            ★ Admin only
          </span>
        </header>

        {/* ── KPI cards ──────────────────────────────────────────── */}
        <section className="mt-10 grid gap-3 md:grid-cols-4">
          <KpiCard
            label="전체 가입자"
            value={userKpis.totalUsers.toLocaleString()}
            sub={`오늘 신규 +${userKpis.newUsersToday} · 7일 +${userKpis.newUsersLast7Days}`}
          />
          <KpiCard
            label="Premium 구독자"
            value={subKpis.activeSubscribers.toLocaleString()}
            sub={
              subKpis.endingSoon > 0
                ? `7일 내 만료 ${subKpis.endingSoon}건`
                : '만료 임박 없음'
            }
            accent
          />
          <KpiCard
            label="오늘 매출"
            value={`₩${revenueKpis.revenueTodayKrw.toLocaleString()}`}
            sub={`결제 ${revenueKpis.paidCountToday}건 · 30일 ₩${revenueKpis.revenueLast30DaysKrw.toLocaleString()}`}
          />
          <KpiCard
            label="오늘 사용량"
            value={(usage[0]?.messages ?? 0).toLocaleString()}
            sub={`셀카 ${usage[0]?.selfies ?? 0} · 노래 ${usage[0]?.songs ?? 0} · 비전 ${usage[0]?.vision ?? 0}`}
          />
        </section>

        {/* ── Recent signups + payments side-by-side ────────────── */}
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <Panel title="최근 가입자" empty={recentSignups.length === 0 ? '아직 가입자가 없어요.' : null}>
            <table className="w-full font-sans text-[13px]">
              <thead className="text-brand-ink-soft">
                <tr>
                  <Th>닉네임</Th>
                  <Th>티어</Th>
                  <Th className="text-right">가입</Th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map((u) => (
                  <tr key={u.id} className="border-t border-brand-ink/8">
                    <Td className="font-medium text-brand-ink">{u.nickname}</Td>
                    <Td>
                      <TierBadge tier={u.tier} />
                    </Td>
                    <Td className="text-right text-brand-ink-soft">
                      {formatRelativeKst(u.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="최근 결제"
            empty={recentPayments.length === 0 ? '아직 결제 내역이 없어요.' : null}
          >
            <table className="w-full font-sans text-[13px]">
              <thead className="text-brand-ink-soft">
                <tr>
                  <Th>종류</Th>
                  <Th className="text-right">금액</Th>
                  <Th>상태</Th>
                  <Th className="text-right">시각</Th>
                </tr>
              </thead>
              <tbody>
                {recentPayments.map((p) => (
                  <tr key={p.id} className="border-t border-brand-ink/8">
                    <Td className="font-medium text-brand-ink">
                      {p.kind === 'subscription'
                        ? '구독'
                        : p.kind === 'credit_pack'
                          ? `크레딧 ${p.creditPack ?? ''}`
                          : '환불'}
                    </Td>
                    <Td className="text-right font-mono text-brand-ink">
                      ₩{p.amountKrw.toLocaleString()}
                    </Td>
                    <Td>
                      <PaymentStatusBadge status={p.status} />
                    </Td>
                    <Td className="text-right text-brand-ink-soft">
                      {formatRelativeKst(p.createdAt)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>

        {/* ── 7-day usage trend ─────────────────────────────────── */}
        <section className="mt-10">
          <Panel
            title="최근 7일 사용량"
            empty={usage.length === 0 ? '아직 사용량 데이터가 없어요.' : null}
          >
            <table className="w-full font-sans text-[13px]">
              <thead className="text-brand-ink-soft">
                <tr>
                  <Th>날짜 (KST)</Th>
                  <Th className="text-right">메시지</Th>
                  <Th className="text-right">셀카</Th>
                  <Th className="text-right">노래</Th>
                  <Th className="text-right">비전</Th>
                  <Th className="text-right">TTS 글자</Th>
                </tr>
              </thead>
              <tbody>
                {usage.map((d) => (
                  <tr key={d.day} className="border-t border-brand-ink/8">
                    <Td className="font-mono text-brand-ink">{d.day}</Td>
                    <Td className="text-right">{d.messages.toLocaleString()}</Td>
                    <Td className="text-right">{d.selfies.toLocaleString()}</Td>
                    <Td className="text-right">{d.songs.toLocaleString()}</Td>
                    <Td className="text-right">{d.vision.toLocaleString()}</Td>
                    <Td className="text-right text-brand-ink-soft">
                      {d.ttsChars.toLocaleString()}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>

        {/* ── Scheduled slots + character popularity side-by-side ── */}
        <section className="mt-10 grid gap-6 md:grid-cols-2">
          <Panel
            title="스케줄 인사 (지난 24시간)"
            empty={
              slotStats.every((s) => s.inserted === 0)
                ? '아직 스케줄 발송 이력이 없어요.'
                : null
            }
          >
            <table className="w-full font-sans text-[13px]">
              <thead className="text-brand-ink-soft">
                <tr>
                  <Th>슬롯</Th>
                  <Th className="text-right">발송</Th>
                  <Th className="text-right">전달</Th>
                  <Th className="text-right">대기</Th>
                </tr>
              </thead>
              <tbody>
                {slotStats.map((s) => (
                  <tr key={s.slot} className="border-t border-brand-ink/8">
                    <Td className="font-medium text-brand-ink">{SLOT_KR[s.slot]}</Td>
                    <Td className="text-right">{s.inserted}</Td>
                    <Td className="text-right text-emerald-700">{s.delivered}</Td>
                    <Td className="text-right text-amber-700">{s.pending}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel
            title="캐릭터별 인기도"
            empty={charPop.length === 0 ? '아직 채팅 데이터가 없어요.' : null}
          >
            <table className="w-full font-sans text-[13px]">
              <thead className="text-brand-ink-soft">
                <tr>
                  <Th>캐릭터</Th>
                  <Th className="text-right">총 세션</Th>
                  <Th className="text-right">7일 활성</Th>
                </tr>
              </thead>
              <tbody>
                {charPop.map((c) => (
                  <tr key={c.characterId} className="border-t border-brand-ink/8">
                    <Td className="font-medium text-brand-ink">
                      {CHARACTER_KR[c.characterId] ?? c.characterId}
                    </Td>
                    <Td className="text-right">{c.sessionCount}</Td>
                    <Td className="text-right text-brand-ink-soft">{c.recentChatters}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        </section>

        <footer className="mt-12 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
            대시보드는 새로고침 시점의 스냅샷입니다.
          </p>
          <Link
            href="/admin"
            className="rounded-full border border-brand-ink/15 bg-white px-4 py-2 font-sans text-[12px] text-brand-ink transition hover:border-brand-ink/30"
          >
            새로고침
          </Link>
        </footer>
      </div>
    </main>
  );
}

// ── Tiny presentation primitives (inline to keep this file self-contained) ──

function KpiCard({
  label,
  value,
  sub,
  accent = false,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <article
      className={`rounded-2xl border p-5 ${
        accent
          ? 'border-brand-accent/40 bg-brand-accent/5'
          : 'border-brand-ink/10 bg-white'
      }`}
    >
      <div className="font-mono text-[10px] uppercase tracking-eyebrow text-brand-ink-soft">
        {label}
      </div>
      <div
        className={`mt-2 font-display text-3xl ${
          accent ? 'text-brand-accent' : 'text-brand-ink'
        }`}
      >
        {value}
      </div>
      {sub ? (
        <div className="mt-1 font-mono text-[10px] text-brand-ink-soft">{sub}</div>
      ) : null}
    </article>
  );
}

function Panel({
  title,
  children,
  empty,
}: {
  title: string;
  children: React.ReactNode;
  empty?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-brand-ink/10 bg-white p-5">
      <h2 className="font-display text-lg text-brand-ink">{title}</h2>
      <div className="mt-4 overflow-x-auto">
        {empty ? (
          <p className="py-4 font-sans text-[13px] text-brand-ink-soft">{empty}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

function Th({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={`pb-2 font-mono text-[10px] font-normal uppercase tracking-eyebrow ${className ?? ''}`}
    >
      {children}
    </th>
  );
}
function Td({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <td className={`py-2 ${className ?? ''}`}>{children}</td>;
}

function TierBadge({ tier }: { tier: string }) {
  if (tier === 'premium') {
    return (
      <span className="rounded-full bg-brand-accent/15 px-2 py-0.5 font-mono text-[11px] uppercase tracking-eyebrow text-brand-accent">
        Premium
      </span>
    );
  }
  return (
    <span className="rounded-full bg-brand-ink/10 px-2 py-0.5 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
      Free
    </span>
  );
}
function PaymentStatusBadge({
  status,
}: {
  status: 'pending' | 'paid' | 'failed' | 'refunded';
}) {
  const map = {
    paid: 'bg-emerald-500/15 text-emerald-700',
    pending: 'bg-amber-500/15 text-amber-700',
    failed: 'bg-red-500/15 text-red-700',
    refunded: 'bg-brand-ink/10 text-brand-ink-soft',
  } as const;
  return (
    <span
      className={`rounded-full px-2 py-0.5 font-mono text-[11px] uppercase tracking-eyebrow ${map[status]}`}
    >
      {status}
    </span>
  );
}

// "5분 전" / "2시간 전" / "어제" / "yyyy.mm.dd" depending on how old.
function formatRelativeKst(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffSec = Math.floor((now - then) / 1000);
  if (diffSec < 60) return '방금 전';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}분 전`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}시간 전`;
  if (diffSec < 86400 * 2) return '어제';
  if (diffSec < 86400 * 7) return `${Math.floor(diffSec / 86400)}일 전`;
  // Older than a week — show KST date.
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: '2-digit',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(iso));
}

const SLOT_KR = {
  morning_7: '아침 7시',
  lunch_12: '점심 12시',
  evening_18: '저녁 6시',
  night_22: '밤 10시',
} as const;

const CHARACTER_KR: Record<string, string> = {
  sunny: '☀️ 써니',
  rain: '🌧️ 레인',
  cloudy: '☁️ 클라우디',
  thunder: '⚡ 썬더',
};
