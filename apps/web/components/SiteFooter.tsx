import Link from 'next/link';

/**
 * Global footer with legal links and corporate identity.
 *
 * Korean consumer-app convention: a thin grey strip at the bottom
 * of every page with 회사 정보 + 약관/정책 링크. Without it the
 * site reads as a side project rather than a real product.
 *
 * Deliberately minimal — no marketing copy, no newsletter form, no
 * social links yet. Just the bare legally-meaningful surface so a
 * user (or a regulator) can find the documents in two clicks from
 * anywhere in the app.
 *
 * The HeaderNav at the top of each page stays the action surface
 * (Login / 채팅 시작 etc.); this footer is the *reference* surface.
 */
const linkClass =
  'font-sans text-[12px] text-brand-ink-soft hover:text-brand-ink hover:underline underline-offset-2';

export default function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-brand-ink/8 bg-brand-paper/60">
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/terms" className={linkClass}>
            이용약관
          </Link>
          <span className="text-brand-ink/15">·</span>
          <Link href="/privacy" className={`${linkClass} font-medium`}>
            개인정보처리방침
          </Link>
          <span className="text-brand-ink/15">·</span>
          <Link href="/copyright" className={linkClass}>
            저작권 정책
          </Link>
          <span className="text-brand-ink/15">·</span>
          <Link href="/pricing" className={linkClass}>
            가격
          </Link>
        </nav>
        <div className="font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
          © 2026 Kweather Inc. · Powered by Prism Station
        </div>
      </div>
    </footer>
  );
}
