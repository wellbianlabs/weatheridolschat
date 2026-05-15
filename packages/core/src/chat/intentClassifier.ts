import type { ChatIntent } from './types';

/**
 * Rule-based intent classifier used by the Mock chat adapter.
 * Real LLM uses function calling — this is a deterministic fallback for offline dev.
 */
export function classifyIntent(text: string): ChatIntent {
  const t = text.toLowerCase();
  if (/(사진|셀카|보여줘|얼굴|selfie|photo)/.test(t)) return 'image_request';
  if (/(노래|음악|들려|song|music)/.test(t)) return 'song_request';
  if (/(추천|뭐 먹|어디 갈|뭘 입|어딜 가|recommend)/.test(t)) return 'recommend';
  if (/(슬퍼|힘들|우울|짜증|외로워|sad|lonely|stressed)/.test(t)) return 'comfort';
  if (/(날씨|비|눈|더워|추워|기온|weather|rain|snow|temperature)/.test(t)) return 'weather_question';
  if (/(안녕|반가|hi|hello|hey|ㅎㅇ|ㅎㅏㅇㅣ)/.test(t)) return 'greeting';
  return 'smalltalk';
}
