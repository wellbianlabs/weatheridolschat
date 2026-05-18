import type { ReactNode } from 'react';

import { Eyebrow } from '@wi/ui/web';

import { LEGAL } from './legal-meta';

/**
 * Page heading block used by all three legal documents.
 * Eyebrow ("★ Legal") + Korean title + English subtitle + effective
 * date. Keeps the three documents visually consistent so users know
 * they're in the same "legal" surface family.
 */
export function LegalHeader({
  title,
  titleEn,
}: {
  title: string;
  titleEn: string;
}) {
  return (
    <header className="border-b border-brand-ink/10 pb-8">
      <Eyebrow>★ Legal</Eyebrow>
      <h1 className="mt-3 font-display text-3xl font-medium leading-tight tracking-tight text-brand-ink md:text-4xl">
        {title}
      </h1>
      <p className="mt-2 font-mono text-[11px] uppercase tracking-eyebrow text-brand-ink-soft">
        {titleEn} · 시행일 {LEGAL.effectiveDate}
      </p>
    </header>
  );
}

/**
 * Numbered section ("제 N 조 (제목)"). Keeps each clause visually
 * distinct so a reader can scan-jump.
 */
export function Article({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[19px] font-medium text-brand-ink">
        제 {n} 조 ({title})
      </h2>
      <div className="mt-3 space-y-3 font-sans text-[15px] leading-[1.75] text-brand-ink/85">
        {children}
      </div>
    </section>
  );
}

/**
 * Plain heading (not numbered) for documents like Privacy Policy
 * that use named sections rather than 조 numbering.
 */
export function Section({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-[19px] font-medium text-brand-ink">
        {title}
      </h2>
      <div className="mt-3 space-y-3 font-sans text-[15px] leading-[1.75] text-brand-ink/85">
        {children}
      </div>
    </section>
  );
}

/**
 * Footer block — every legal document repeats the corporate
 * identity at the bottom so a user printing/forwarding a single
 * page still has the company's full info attached.
 */
export function LegalFooter() {
  return (
    <footer className="mt-16 rounded-2xl border border-brand-ink/10 bg-brand-paper-warm/30 p-5 font-sans text-[13px] leading-[1.7] text-brand-ink-soft">
      <p className="font-medium text-brand-ink">{LEGAL.companyName}</p>
      <p className="mt-1">
        대표자 {LEGAL.representative} · 사업자등록번호 {LEGAL.bizRegNo}
      </p>
      <p>{LEGAL.address}</p>
      <p className="mt-2">
        문의:{' '}
        <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
          {LEGAL.contactEmail}
        </a>
      </p>
    </footer>
  );
}
