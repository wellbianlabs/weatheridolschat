import type { CharacterId } from '../characters/types';

import type { ProductPayload } from '../chat/types';

/**
 * Mock product catalog. Phase 1 — replace with Nasmedia API integration in Phase 2.
 * Each character only sees products mapped to its recommendation_domains.
 * Image URLs use picsum.photos with stable seeds so each productId always
 * resolves to the same image.
 */
type CharacterRecMap = Record<CharacterId, ProductPayload[]>;

function img(seed: string): string {
  return `https://picsum.photos/seed/wi-${seed}/640/360`;
}

export const MOCK_PRODUCTS: CharacterRecMap = {
  sunny: [
    {
      campaignId: 'mock_sunny_001',
      productId: 'p_coral_lipbalm',
      title: '코랄 글로우 립밤',
      price: 12000,
      currency: 'KRW',
      imageUrl: img('sunny-lipbalm'),
      ctaUrl: '#',
    },
    {
      campaignId: 'mock_sunny_002',
      productId: 'p_running_shoes',
      title: '데일리 러닝화',
      price: 89000,
      currency: 'KRW',
      imageUrl: img('sunny-shoes'),
      ctaUrl: '#',
    },
  ],
  rain: [
    {
      campaignId: 'mock_rain_001',
      productId: 'p_cafe_latte',
      title: '핸드드립 라떼 세트',
      price: 18000,
      currency: 'KRW',
      imageUrl: img('rain-latte'),
      ctaUrl: '#',
    },
    {
      campaignId: 'mock_rain_002',
      productId: 'p_candle',
      title: '비 오는 날 캔들',
      price: 24000,
      currency: 'KRW',
      imageUrl: img('rain-candle'),
      ctaUrl: '#',
    },
  ],
  cloudy: [
    {
      campaignId: 'mock_cloudy_001',
      productId: 'p_film_camera',
      title: '필름 카메라 (반자동)',
      price: 168000,
      currency: 'KRW',
      imageUrl: img('cloudy-camera'),
      ctaUrl: '#',
    },
    {
      campaignId: 'mock_cloudy_002',
      productId: 'p_sketchbook',
      title: '엽서 스케치북',
      price: 9800,
      currency: 'KRW',
      imageUrl: img('cloudy-sketch'),
      ctaUrl: '#',
    },
  ],
  thunder: [
    {
      campaignId: 'mock_thunder_001',
      productId: 'p_spicy_noodle',
      title: '매운맛 야식 콤보',
      price: 14900,
      currency: 'KRW',
      imageUrl: img('thunder-noodle'),
      ctaUrl: '#',
    },
    {
      campaignId: 'mock_thunder_002',
      productId: 'p_sneakers',
      title: '스트릿 스니커즈',
      price: 159000,
      currency: 'KRW',
      imageUrl: img('thunder-sneakers'),
      ctaUrl: '#',
    },
  ],
};

export function pickProductForCharacter(characterId: CharacterId): ProductPayload | null {
  const list = MOCK_PRODUCTS[characterId];
  if (!list || list.length === 0) return null;
  const idx = Math.floor(Math.random() * list.length);
  return list[idx] ?? null;
}
