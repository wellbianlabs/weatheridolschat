import type { Metadata, Viewport } from 'next';
import {
  Inter,
  JetBrains_Mono,
  Noto_Sans_KR,
  Playfair_Display,
} from 'next/font/google';

import SiteFooter from '@/components/SiteFooter';

import './globals.css';

// ── Type stack rationale ──────────────────────────────────────────────
// Korean readability was the dominant feel-quality issue: previously
// the Tailwind fontFamily listed "Pretendard Variable" as the Hangul
// fallback, but it was never actually loaded. On Vercel (Linux build
// hosts) every Hangul glyph fell through to Liberation/DejaVu, which
// look thin and washed out at small sizes — the "흐릿한 글자"
// complaint.
//
// Fix: load Noto Sans KR — Google's purpose-built Korean web font,
// hosted on Google Fonts (so next/font handles it for us, no
// self-hosting). Browser font fallback then handles the split
// naturally: Hangul → Noto Sans KR, Latin → Inter, headlines stay
// Playfair Display.
//
// Why Noto over Pretendard: both are excellent, but only Noto is on
// Google Fonts as of this writing, which means next/font can subset
// + preload it without us shipping a 4 MB font file. Pretendard
// would require self-hosting which is a bigger change.

const display = Playfair_Display({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  // We intentionally do not request italic styles.
  style: ['normal'],
  variable: '--font-display',
  display: 'swap',
});

const sans = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

// Korean primary. The browser uses this for Hangul (CJK Unified
// Ideographs / Hangul Syllables / Hangul Jamo) and falls through to
// Inter for Latin via the fontFamily list in tailwind-preset.cjs.
const sansKr = Noto_Sans_KR({
  // 'latin' is requested too so Latin characters that appear in the
  // middle of Korean sentences (e.g. "K-pop", brand names) inherit
  // the same metrics — avoids the choppy mixed-font baseline.
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans-kr',
  display: 'swap',
  // Preload so Hangul shows up crisp on first paint; otherwise the
  // FOUT replaces system serif → Noto, which is visually jarring.
  preload: true,
});

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500', '600'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: '날씨의 아이돌 · Weather Idols',
  description: '오늘의 날씨, 오늘의 대화 — Prism Station × Weather Idols',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFAF3',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="ko"
      className={`${display.variable} ${sans.variable} ${sansKr.variable} ${mono.variable}`}
    >
      {/* min-h-screen + flex column so the SiteFooter sits at the bottom
          of pages whose content is shorter than the viewport, while
          longer pages still scroll naturally. The chat page's
          fullscreen layout escapes this with its own absolute
          positioning, but every other route benefits from a
          predictably-pinned footer. */}
      <body className="flex min-h-screen flex-col">
        <div className="flex-1">{children}</div>
        <SiteFooter />
      </body>
    </html>
  );
}
