import { Article, LegalFooter, LegalHeader } from '../_components';
import { LEGAL } from '../legal-meta';

export const metadata = {
  title: '저작권 정책 · 날씨의 아이돌 챗',
  description:
    '날씨의 아이돌 챗의 캐릭터·생성 콘텐츠에 대한 저작권 귀속과 회원의 이용 권리 안내',
};

/**
 * 저작권 정책 (Copyright Policy)
 *
 * 사용자 요구사항(필수 명시):
 *   - 저작권은 원칙적으로 케이웨더의 소유
 *   - 대화에서 생성된 이미지·음악 등 모든 저작물은 케이웨더의 자산
 *   - 단, 고객은 파일의 소유와 비영리 목적의 게시를 허용
 *
 * 추가 명문화:
 *   - 캐릭터 IP(외관·이름·페르소나)는 케이웨더 소유
 *   - 회원이 입력한 텍스트는 회원 소유
 *   - 상업적 이용은 별도 라이선스 필요
 *   - DMCA / 권리침해 신고 절차
 */
export default function CopyrightPage() {
  return (
    <>
      <LegalHeader title="저작권 정책" titleEn="Copyright Policy" />

      <Article n={1} title="원칙">
        <p>
          {LEGAL.serviceName}에서 회사가 창작·제공하거나 회원의 입력에 응답하여
          서비스가 자동 생성하는 일체의 저작물에 대한 저작권은{' '}
          <strong className="font-medium text-brand-ink">
            원칙적으로 {LEGAL.companyName}(이하 &quot;회사&quot;)에게 귀속
          </strong>
          됩니다.
        </p>
      </Article>

      <Article n={2} title="회사 소유 저작물의 범위">
        <p>회사 소유 저작물에는 다음이 포함되되 이에 한정되지 않습니다.</p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            서비스 내 4명 아이돌 캐릭터(써니·레인·클라우디·썬더 및 향후 추가
            캐릭터)의 이름, 외형, 페르소나, 음성, 말투, 세계관, 관련 상징물
            일체
          </li>
          <li>
            서비스 인터페이스의 그래픽, 폰트, 로고, 음향, 영상 일체
          </li>
          <li>
            <strong className="font-medium text-brand-ink">
              회원의 요청에 따라 서비스가 자동 생성한 캐릭터 셀카(이미지),
              날씨송(음악·가사), 음성 합성 결과물, 캐릭터 텍스트 응답 등 일체의
              생성 콘텐츠
            </strong>
          </li>
          <li>
            서비스 운영을 위한 시스템 프롬프트, 데이터셋, 알고리즘, 소프트웨어
          </li>
        </ol>
      </Article>

      <Article n={3} title="회원에게 허용되는 이용 권리 (중요)">
        <p>
          저작권은 회사에 귀속되지만, 회사는 회원에게 다음 권리를 무상으로
          허락(license)합니다.
        </p>
        <ul className="mt-2 space-y-3">
          <li className="rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-4">
            <p className="font-medium text-brand-ink">✅ 파일 소유</p>
            <p className="mt-1 text-[14px]">
              회원은 서비스가 자신에게 제공한 생성 콘텐츠 파일(이미지·음악 등)을
              본인의 기기에 자유롭게 보관할 수 있습니다.
            </p>
          </li>
          <li className="rounded-2xl border border-brand-accent/30 bg-brand-accent/5 p-4">
            <p className="font-medium text-brand-ink">✅ 비영리 목적 게시</p>
            <p className="mt-1 text-[14px]">
              회원은 자신이 받은 생성 콘텐츠를 SNS·블로그·메신저 등에 비영리
              목적으로 게시·공유할 수 있습니다. 게시 시 출처(서비스명)를
              자발적으로 표기하는 것을 권장합니다.
            </p>
          </li>
        </ul>
      </Article>

      <Article n={4} title="허용되지 않는 이용 (상업적 이용 제한)">
        <p>다음 행위는 회사의 사전 서면 허락 없이는 금지됩니다.</p>
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            생성 콘텐츠 또는 캐릭터 IP를 광고·홍보·판매·구독상품·NFT·굿즈·디지털
            자산 등 영리 목적으로 이용하는 행위
          </li>
          <li>
            생성 콘텐츠를 회사의 표시·동의 없이 자신 또는 제3자의 창작물인
            것처럼 등록·판매하는 행위
          </li>
          <li>
            서비스에서 추출한 콘텐츠로 별도의 AI 모델을 학습시키거나 데이터셋을
            구축하는 행위
          </li>
          <li>
            캐릭터의 명예·인격에 반하는 방식(혐오·차별·성적 묘사 등)으로 생성
            콘텐츠를 가공·게시하는 행위
          </li>
        </ol>
        <p>
          영리 목적의 이용을 원하시는 경우{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          로 사전 협의를 요청해주십시오.
        </p>
      </Article>

      <Article n={5} title="회원이 입력한 콘텐츠">
        <ol className="list-decimal space-y-2 pl-6">
          <li>
            회원이 채팅 입력란을 통해 직접 작성한 텍스트의 저작권은 회원에게
            귀속됩니다.
          </li>
          <li>
            다만 회원은 서비스의 운영(대화 응답 생성, 품질 개선 분석, 안전성
            모니터링)을 위해 회사가 해당 입력을 처리·저장·일부 외부 AI
            제공자에게 전달하는 것에 동의합니다. 자세한 사항은
            개인정보처리방침을 참고해주십시오.
          </li>
          <li>
            회원이 업로드한 사진(카메라 입력 등)에 제3자의 초상·저작물이 포함된
            경우, 그에 대한 적법한 권리 확보 책임은 회원에게 있습니다.
          </li>
        </ol>
      </Article>

      <Article n={6} title="제3자 자산의 사용">
        <p>
          서비스는 다음 외부 자산을 이용하며, 각 자산은 해당 제공자의 약관에
          따릅니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>Anthropic Claude · Google Gemini · OpenAI GPT (텍스트·이미지)</li>
          <li>Suno (음악 생성)</li>
          <li>Google Cloud Text-to-Speech (음성 합성)</li>
          <li>KWeather B2B API · OpenWeatherMap · Open-Meteo (날씨 데이터)</li>
          <li>Noto Sans KR · Inter · Playfair Display · JetBrains Mono (폰트)</li>
        </ul>
      </Article>

      <Article n={7} title="권리침해 신고">
        <p>
          본인의 저작권이 서비스 또는 회원의 행위에 의해 침해되었다고 판단되는
          경우, 다음 정보를 포함하여{' '}
          <a className="underline" href={`mailto:${LEGAL.contactEmail}`}>
            {LEGAL.contactEmail}
          </a>
          로 신고해주십시오. 회사는 접수 후 합리적 기간 내에 조사·조치합니다.
        </p>
        <ul className="list-disc space-y-1 pl-6">
          <li>침해받았다고 주장하는 저작물의 명세</li>
          <li>침해 사실이 발생한 위치(URL, 화면 등)</li>
          <li>신고인의 성명 및 연락처</li>
          <li>신고인이 해당 저작물의 권리자임을 입증하는 자료</li>
        </ul>
      </Article>

      <Article n={8} title="부칙">
        <p>본 정책은 {LEGAL.effectiveDate}부터 시행합니다.</p>
      </Article>

      <LegalFooter />
    </>
  );
}
