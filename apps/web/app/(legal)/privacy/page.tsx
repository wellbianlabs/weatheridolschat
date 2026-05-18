import { LegalFooter, LegalHeader, Section } from '../_components';
import { LEGAL } from '../legal-meta';

export const metadata = {
  title: '개인정보처리방침 · 날씨의 아이돌 챗',
  description:
    '날씨의 아이돌 챗이 수집·이용·보관하는 개인정보 항목과 회원 권리 안내',
};

/**
 * 개인정보처리방침 (Privacy Policy)
 *
 * 개인정보보호법(PIPA) 제30조에 따라 다음 항목을 모두 포함:
 *   1. 처리하는 개인정보의 항목 및 수집 방법
 *   2. 개인정보의 처리 목적
 *   3. 처리 및 보유 기간
 *   4. 제3자 제공
 *   5. 처리 위탁 (외부 AI 제공자)
 *   6. 정보주체의 권리 및 행사 방법
 *   7. 개인정보의 파기 절차 및 방법
 *   8. 안전성 확보 조치
 *   9. 개인정보 보호책임자
 *  10. 권익침해 구제방법
 *  11. 정책 변경
 */
export default function PrivacyPage() {
  return (
    <>
      <LegalHeader title="개인정보처리방침" titleEn="Privacy Policy" />

      <Section title="1. 처리하는 개인정보의 항목">
        <p>회사는 서비스 제공을 위해 다음 항목을 수집·처리합니다.</p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-brand-ink/15 text-left">
                <th className="py-2 pr-4 font-medium">구분</th>
                <th className="py-2 pr-4 font-medium">항목</th>
                <th className="py-2 font-medium">수집 시점</th>
              </tr>
            </thead>
            <tbody className="text-brand-ink/85">
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">필수</td>
                <td className="py-2 pr-4">이메일 주소</td>
                <td className="py-2">회원가입 시 (OAuth · 매직링크)</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">필수</td>
                <td className="py-2 pr-4">닉네임</td>
                <td className="py-2">온보딩 시</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">선택</td>
                <td className="py-2 pr-4">출생연도</td>
                <td className="py-2">온보딩 시</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">선택</td>
                <td className="py-2 pr-4">성별 (여성/남성/논바이너리/밝히지 않음)</td>
                <td className="py-2">온보딩 시</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">선택</td>
                <td className="py-2 pr-4">시/도·시군구·동 (좌표 포함)</td>
                <td className="py-2">온보딩 시</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">자동수집</td>
                <td className="py-2 pr-4">대화 기록, 생성 콘텐츠, 사용량(메시지·셀카·노래 횟수)</td>
                <td className="py-2">서비스 이용 시</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">자동수집</td>
                <td className="py-2 pr-4">접속 로그, IP 주소, 쿠키, 브라우저 정보</td>
                <td className="py-2">서비스 이용 시</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">유료결제</td>
                <td className="py-2 pr-4">결제 일시·금액·결제수단·결제대행사 결제키</td>
                <td className="py-2">유료 결제 시</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[14px] text-brand-ink-soft">
          * 카드번호·계좌번호 등 결제 정보 원본은 회사가 보관하지 않으며, 결제대행사
          ㈜토스페이먼츠가 관련 법령에 따라 처리합니다.
        </p>
      </Section>

      <Section title="2. 개인정보의 처리 목적">
        <ol className="list-decimal space-y-2 pl-6">
          <li>회원 식별·가입·로그인 유지</li>
          <li>AI 캐릭터와의 맞춤형 대화 제공 (시간·위치·날씨 기반 응답)</li>
          <li>스케줄 인사(일일 정기 메시지) 발송</li>
          <li>이용 한도(메시지 횟수 등) 산정 및 관리</li>
          <li>유료 결제 처리 및 환불</li>
          <li>서비스 품질 개선, 부정 이용 방지, 안전성 모니터링</li>
          <li>고객문의 응대</li>
          <li>법령상 의무 이행</li>
        </ol>
      </Section>

      <Section title="3. 처리 및 보유 기간">
        <p>
          회사는 개인정보의 수집·이용 목적이 달성되면 지체 없이 해당 개인정보를
          파기합니다. 다만 다음 정보는 명시된 기간 동안 보존합니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>회원 정보: 회원 탈퇴 시까지</li>
          <li>대화 기록 / 생성 콘텐츠: 회원 탈퇴 시까지 또는 회원 요청 시 즉시 삭제</li>
          <li>결제 기록: 전자상거래법에 따라 5년</li>
          <li>접속 로그: 통신비밀보호법에 따라 3개월</li>
          <li>부정 이용 기록: 1년</li>
        </ul>
      </Section>

      <Section title="4. 개인정보의 제3자 제공">
        <p>
          회사는 회원의 동의 없이 개인정보를 외부에 제공하지 않습니다. 다만 다음
          경우는 예외로 합니다.
        </p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>회원이 사전에 동의한 경우</li>
          <li>법령에 의하여 요구되는 경우 (수사기관의 적법한 영장 등)</li>
        </ol>
      </Section>

      <Section title="5. 개인정보 처리 위탁">
        <p>
          회사는 서비스 운영을 위해 다음 외부 사업자에게 개인정보 처리를
          위탁합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="mt-2 w-full border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-brand-ink/15 text-left">
                <th className="py-2 pr-4 font-medium">수탁업체</th>
                <th className="py-2 pr-4 font-medium">위탁 범위</th>
                <th className="py-2 font-medium">처리 국가</th>
              </tr>
            </thead>
            <tbody className="text-brand-ink/85">
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">Supabase Inc.</td>
                <td className="py-2 pr-4">회원 데이터 저장·인증</td>
                <td className="py-2">싱가포르 (ap-northeast-2)</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">Vercel Inc.</td>
                <td className="py-2 pr-4">서비스 호스팅</td>
                <td className="py-2">미국</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">Anthropic / Google / OpenAI</td>
                <td className="py-2 pr-4">대화 응답 생성 (텍스트·이미지)</td>
                <td className="py-2">미국</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">Suno Inc.</td>
                <td className="py-2 pr-4">날씨송 생성</td>
                <td className="py-2">미국</td>
              </tr>
              <tr className="border-b border-brand-ink/8">
                <td className="py-2 pr-4">Google Cloud TTS</td>
                <td className="py-2 pr-4">음성 합성</td>
                <td className="py-2">미국</td>
              </tr>
              <tr>
                <td className="py-2 pr-4">㈜토스페이먼츠</td>
                <td className="py-2 pr-4">결제 처리</td>
                <td className="py-2">대한민국</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-[14px]">
          위 외부 사업자에 전달되는 정보는 서비스 제공에 필요한 최소한의
          범위로 한정되며, 각 사업자는 자체 보안 정책 및 처리방침을 적용합니다.
        </p>
      </Section>

      <Section title="6. 정보주체의 권리 및 행사 방법">
        <p>
          회원은 언제든지 다음의 권리를 행사할 수 있으며, 회사는 지체 없이
          조치합니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>개인정보 열람 요청</li>
          <li>오류 정정 요청</li>
          <li>삭제 요청 (회원 탈퇴 포함)</li>
          <li>처리 정지 요청</li>
        </ul>
        <p>
          위 권리는 마이페이지(/account) 또는{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          로 요청하시면 신원 확인 후 처리됩니다.
        </p>
      </Section>

      <Section title="7. 개인정보 파기">
        <p>
          파기 사유 발생 시 회사는 다음 절차에 따라 파기합니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>전자 파일: 복구 불가능한 기술적 방법으로 영구 삭제</li>
          <li>출력물·서면: 분쇄 또는 소각</li>
        </ul>
      </Section>

      <Section title="8. 안전성 확보 조치">
        <ul className="list-disc space-y-1 pl-6">
          <li>전송 구간 암호화 (TLS)</li>
          <li>비밀번호의 일방향 해시 저장 (Supabase Auth)</li>
          <li>관리자 접근 권한 최소화 및 행위 로그 보존</li>
          <li>외부 침입 방지 시스템 및 정기 보안 점검</li>
          <li>개인정보 취급 직원의 접근 권한 제한 및 교육</li>
        </ul>
      </Section>

      <Section title="9. 개인정보 보호책임자">
        <div className="rounded-2xl border border-brand-ink/10 bg-brand-paper-warm/40 p-4">
          <p>
            <span className="font-medium text-brand-ink">{LEGAL.dpoName}</span>{' '}
            <span className="text-[13px] text-brand-ink-soft">({LEGAL.dpoTitle})</span>
          </p>
          <p className="mt-1">
            이메일:{' '}
            <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
              {LEGAL.contactEmail}
            </a>
          </p>
        </div>
      </Section>

      <Section title="10. 권익침해 구제방법">
        <p>
          개인정보 침해로 인한 신고·상담이 필요한 경우 아래 기관에 문의하실 수
          있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>개인정보분쟁조정위원회 (1833-6972 / kopico.go.kr)</li>
          <li>개인정보침해신고센터 (118 / privacy.go.kr)</li>
          <li>대검찰청 사이버수사과 (1301 / spo.go.kr)</li>
          <li>경찰청 사이버범죄신고시스템 (182 / ecrm.police.go.kr)</li>
        </ul>
      </Section>

      <Section title="11. 정책 변경">
        <p>
          본 처리방침이 변경되는 경우 회사는 시행일 7일 전부터 서비스 내
          공지사항을 통해 알립니다. 본 처리방침은 {LEGAL.effectiveDate}부터
          시행합니다.
        </p>
      </Section>

      <LegalFooter />
    </>
  );
}
