import type { CharacterId } from '@wi/core/characters';
import type { ChatIntent } from '@wi/core/chat';

export type MockResponseDict = Record<CharacterId, Partial<Record<ChatIntent, string[]>>>;

/**
 * Variables supported in templates:
 *   {{user.nickname}}
 *   {{weather.condition}}
 *   {{weather.locationLabel}}
 *   {{weather.temperatureC}}
 */
export const MOCK_RESPONSES: MockResponseDict = {
  sunny: {
    greeting: [
      '오늘 {{weather.condition}}이네, {{user.nickname}}! 컨디션 어때? ☀️',
      '안녕! {{weather.locationLabel}} {{weather.temperatureC}}°C래. 좋아!',
      '왔구나! 같이 빛나는 하루 만들자 ✨',
    ],
    weather_question: [
      '지금 {{weather.locationLabel}} {{weather.temperatureC}}°C, {{weather.condition}}이야!',
      '오늘 날씨? {{weather.temperatureC}}°C. 가볍게 입어도 좋을 듯!',
    ],
    recommend: [
      '이 날씨엔 한강 러닝 추천! 같이 갈래? 💪',
      '햇살 좋은 날엔 야외 카페 어때?',
      '걷기 좋은 날씨야, 산책 가자!',
    ],
    comfort: [
      '괜찮아 괜찮아, 햇살이 다 데워줄 거야 ✨',
      '오늘은 무리하지 말고, 조금만 햇볕 쐬자.',
    ],
    smalltalk: [
      '오~ 그래? 더 얘기해줘!',
      '좋아좋아, 그럼 어떻게 할 거야?',
    ],
    image_request: ['카메라 챙겼지! 한 장 가볼게 📸'],
    refuse: ['아앗! 그런 장난은 반칙이지~ 옐로카드! 😠 그것보다 오늘 햇살 진짜 좋은데, 같이 야외 활동 어때?'],
  },
  rain: {
    greeting: [
      '안녕… 오늘 {{weather.condition}}이네. 마음은 어때?',
      '왔구나… 비 소리처럼 천천히 얘기하자.',
    ],
    weather_question: [
      '지금 {{weather.locationLabel}}는 {{weather.condition}}, {{weather.temperatureC}}°C야.',
      '비 오는 날엔 우산 잊지마…',
    ],
    recommend: [
      '따뜻한 라떼 어때? 비 오는 날엔 잘 어울려 ☕',
      '오늘은 집에서 좋아하는 음악 들으며 쉬어볼까?',
      '근처 작은 카페로 도망가자.',
    ],
    comfort: [
      '그랬구나… 많이 힘들었지.',
      '내 옆에 잠깐 앉아있어도 돼. 굳이 말 안 해도 괜찮아.',
    ],
    smalltalk: [
      '응… 그런 거구나.',
      '천천히 얘기해줘. 듣고 있어.',
    ],
    image_request: ['…한 장 정도라면. 잠깐만.'],
    refuse: ['…그런 말은 조금 슬퍼지려 해. 우리 마음을 찌르는 말 대신, 편안한 이야기만 나누면 안 될까?'],
  },
  cloudy: {
    greeting: [
      '어, 왔어? 오늘 하늘이 솜사탕 같아…',
      '안녕~ 오늘 {{weather.condition}}이래. 좋다 ☁️',
    ],
    weather_question: [
      '오늘 {{weather.locationLabel}}는 {{weather.condition}}이래. {{weather.temperatureC}}°C.',
      '구름 모양 봤어? 토끼 같아.',
    ],
    recommend: [
      '근처 작은 전시 갈래? 별로 신경 쓴 거 아닌데… 좋더라.',
      '사진 찍기 좋은 골목 알아. 보여줄까?',
      '필름 카메라 챙겨서 산책 가자.',
    ],
    comfort: [
      '음… 가끔은 구름처럼 흘러가게 두는 것도 괜찮아.',
      '오늘은 그냥 멍 때리는 게 답일지도.',
    ],
    smalltalk: [
      '아 참, 어제 본 구름이 토끼였어.',
      '음~ 그래?',
    ],
    image_request: ['…한 장 정도? 자연광 좋네.'],
    refuse: ['음… 내 스케치북에는 그런 못생긴 상상은 안 담을래. 저기 구름, 고양이 모양 같지 않아?'],
  },
  thunder: {
    greeting: [
      '헤이 {{user.nickname}}! 오늘 {{weather.condition}}이야. Vamos! ⚡',
      'Yo! 컨디션 체크.',
    ],
    weather_question: [
      '{{weather.locationLabel}} {{weather.temperatureC}}°C, {{weather.condition}}. 끝.',
      '비 오면 인도어로 가자.',
    ],
    recommend: [
      '배달각이네. 매운 거 시킬까 🔥',
      '게임이나 한 판 어때?',
      '땀 좀 빼자. 5분 스쿼트 ㄱ',
    ],
    comfort: [
      '울지 말고 일단 5분만 움직여봐. Real talk.',
      '괜찮아. 다음 비트로 가자.',
    ],
    smalltalk: [
      '오? 더 말해봐.',
      'Cool. 그래서?',
    ],
    image_request: ['카메라? 한 컷 박자 📸'],
    refuse: ['헤이! 선 넘지 마. 찌질한 소리 할 시간에 내 새 댄스 영상이나 보면서 정신 차려!'],
  },
};
