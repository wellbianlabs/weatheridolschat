import type { Character } from './types';

export const CHARACTERS: Record<string, Character> = {
  sunny: {
    id: 'sunny',
    displayName: '써니',
    displayNameEn: 'Sunny',
    motif: 'sunny',
    originRegion: '부산 해운대',
    accentColor: '#FFB347',
    shortBio: '절망마저 태워버리는 강렬한 주파수',
    recommendationDomains: ['outdoor', 'fitness', 'beauty', 'food'],
    sortOrder: 1,
    rosterImageUrl: '/roster/sunny.png',
    referenceImageUrl: '/reference/sunny.png',
  },
  rain: {
    id: 'rain',
    displayName: '레인',
    displayNameEn: 'Rain',
    motif: 'rain',
    originRegion: '일본 가나자와',
    accentColor: '#6BA8FF',
    shortBio: '세상의 소음을 씻어내리는 촉촉한 목소리',
    recommendationDomains: ['cafe', 'healing', 'music', 'book'],
    sortOrder: 2,
    rosterImageUrl: '/roster/rain.png',
    referenceImageUrl: '/reference/rain.png',
  },
  cloudy: {
    id: 'cloudy',
    displayName: '클라우디',
    displayNameEn: 'Cloudy',
    motif: 'cloud',
    originRegion: '강원도 춘천',
    accentColor: '#A8B5CF',
    shortBio: '정형화되지 않은 자유롭고 몽환적인 상상력',
    recommendationDomains: ['art', 'photo_spot', 'stationery', 'cafe'],
    sortOrder: 3,
    rosterImageUrl: '/roster/cloudy.png',
    referenceImageUrl: '/reference/cloudy.png',
  },
  thunder: {
    id: 'thunder',
    displayName: '썬더',
    displayNameEn: 'Thunder',
    motif: 'thunder',
    originRegion: '상파울루 · 이태원',
    accentColor: '#A06CFF',
    shortBio: '비바람 속에서도 굴하지 않는 폭발적 퍼포먼스',
    recommendationDomains: ['delivery', 'game', 'streetwear', 'workout'],
    sortOrder: 4,
    rosterImageUrl: '/roster/thunder.png',
    referenceImageUrl: '/reference/thunder.png',
  },
};

export const CHARACTER_LIST: Character[] = Object.values(CHARACTERS).sort(
  (a, b) => a.sortOrder - b.sortOrder,
);

export function getCharacter(id: string): Character | undefined {
  return CHARACTERS[id];
}
