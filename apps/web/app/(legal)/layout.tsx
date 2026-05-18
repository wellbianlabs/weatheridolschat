import HeaderNav from '@/components/HeaderNav';

/**
 * Shared layout for the three legal pages (terms / copyright / privacy).
 *
 * Reads as a long-form document, so the design constraints are
 * different from the rest of the app:
 *   - Narrow column (~640px) for comfortable reading.
 *   - Generous line-height, larger body text (16px → already the
 *     globals.css default; we just don't shrink it here).
 *   - Plain white background so it prints cleanly. The dreamy
 *     gradient backgrounds we use elsewhere don't belong on a
 *     document the user might save / forward to a lawyer.
 *
 * Per-page components only need to render section headings + prose;
 * this layout provides the chrome + header + footer once.
 */
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-brand-paper">
      <HeaderNav />
      <article className="mx-auto max-w-2xl px-6 py-12 md:px-8 md:py-16">
        {children}
      </article>
    </main>
  );
}
