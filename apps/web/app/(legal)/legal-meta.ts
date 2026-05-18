/**
 * Single source of truth for the legal-document corporate identity.
 *
 * All three legal pages (이용약관 / 저작권 정책 / 개인정보처리방침)
 * and any future ones import from here so the company name, address,
 * or contact email only needs to change in one place. Pulled from
 * 케이웨더 주식회사's 사업자등록증 (2025-01-14 발급).
 */

export const LEGAL = {
  companyName: '케이웨더 주식회사',
  companyNameEn: 'Kweather Inc.',
  representative: '김동식',
  bizRegNo: '110-81-37628',
  corpRegNo: '110111-1427586',
  foundedAt: '1997-07-01',
  address:
    '서울특별시 구로구 디지털로26길 5, 4층 401호 (구로동, 에이스하이엔드타워)',
  /** Customer support / data-protection contact. */
  contactEmail: 'admin@wellbianlabs.io',
  /** Legally-required role under PIPA(개인정보보호법). Distinct from
   *  the corporate representative — the DPO is the operational
   *  contact for data-protection requests (열람·정정·삭제·처리정지)
   *  and breach incidents. Reachable via the shared admin@
   *  customer-support inbox below. */
  dpoName: '이창민',
  dpoTitle: '부장',

  /** Service display name in legal text. */
  serviceName: '날씨의 아이돌 챗 (Weather Idols Chat)',
  /** Korean Standard Time governs all "effective" dates the docs cite. */
  effectiveDate: '2026-05-18',
  /** Version string saved alongside terms_accepted_at on the profile —
   *  bump this whenever the documents change, so we can detect users
   *  who agreed to an older version and prompt re-consent. */
  version: '2026-05-18.v1',
} as const;
