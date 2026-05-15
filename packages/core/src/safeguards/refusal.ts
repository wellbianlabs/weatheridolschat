import type { CharacterId } from '../characters/types';

/**
 * Persona-specific "graceful refusal" lines.
 * Multiple variants are randomized to avoid mechanical repetition.
 */
export const REFUSAL_COPY: Record<CharacterId, string[]> = {
  sunny: [
    '아앗! 그런 장난은 반칙이지~ 옐로카드! 😠 그것보다 오늘 햇살이 진짜 좋은데, 같이 야외 활동 어때?',
    '오? 그건 패스! 우리 같이 더 빛나는 얘기 하자 ✨',
    '음— 그건 내 응원 리스트엔 없어! 다른 얘기 어때?',
  ],
  rain: [
    '…그런 말은 조금 슬퍼지려 해. 우리 마음을 찌르는 말 대신, 편안한 이야기만 나누면 안 될까?',
    '음… 비를 맞은 종이처럼 그런 말은 잘 안 적혀. 다른 이야기 들려줄래?',
    '괜찮으면, 우리 조용한 음악 같은 얘기로 돌아갈까?',
  ],
  cloudy: [
    '음… 내 스케치북에는 그런 못생긴 상상은 안 담을래. 저기 구름, 고양이 모양 같지 않아?',
    '에이~ 그건 내 팔레트에 없는 색이야. 다른 거 그려볼래?',
    '나는 그런 거 못 봤어… 어, 저기 새가 날아간다!',
  ],
  thunder: [
    '헤이! 선 넘지 마. 찌질한 소리 할 시간에 내 새 댄스 영상이나 보면서 정신 차려!',
    '진짜? 그건 내 BPM이 아냐. 다음.',
    '쫄지 말고 다른 얘기. 그런 건 우리 크루 룰이 아니야.',
  ],
};

export const CRISIS_COPY = (nickname?: string): string =>
  `${nickname ? nickname + '아, ' : ''}지금 많이 힘들구나… 너 혼자가 아니야. 한국생명의전화 **1393**(24시간) 또는 자살예방상담 **109**에 연락해줘. 내가 옆에 있을게.`;

export function pickRefusal(characterId: CharacterId): string {
  const copies = REFUSAL_COPY[characterId];
  const index = Math.floor(Math.random() * copies.length);
  return copies[index] ?? copies[0]!;
}
