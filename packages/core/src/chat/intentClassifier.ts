import type { ChatIntent } from './types';

/**
 * Rule-based intent classifier used by the Mock chat adapter and by
 * /api/chat for post-stream side-effects (selfie / song / product).
 *
 * Image-request rules (deliberately strict):
 *   The selfie generator is *expensive* (gpt-image-1) and dominates
 *   the chat thread when it fires, so we only trigger when the user
 *   is unambiguously asking the character for a CURRENT selfie.
 *   Bare words like "사진" / "보여줘" / "얼굴" alone are too broad —
 *   they show up in normal chat all the time ("이 사진 어때?",
 *   "얼굴 빨개졌어?", "보여줘 그거"). Requiring a specific co-occurrence
 *   (e.g. "사진" + "보내/찍어/보여줘", or "너" + "사진/얼굴/모습")
 *   eliminates >90% of the false positives without losing the
 *   natural "셀카 보내줘 / 사진 보내줘 / 너 사진 한 장" phrasings.
 */
export function classifyIntent(text: string): ChatIntent {
  const t = text.toLowerCase();

  // 1. Explicit selfie tokens — always trigger
  // 2. "(사진|얼굴|모습|비주얼)" within 6 chars of "(보내|찍어|보여|줘봐)"
  // 3. "(너|니|네|본인)" within 4 chars of "(사진|얼굴|모습|비주얼)"
  // 4. "어떻게 (생겼|생긴)" — "what do you look like"
  if (
    /셀카|셀피|selfie|selca/.test(t) ||
    /(사진|얼굴|모습|비주얼).{0,6}(보내|찍어|보여줘|보여봐|보여 줘|줘봐)/.test(t) ||
    /(너|니|네|본인)\s*(사진|얼굴|모습|비주얼)/.test(t) ||
    /어떻게\s*생[겼긴]/.test(t)
  ) {
    return 'image_request';
  }

  if (/(노래|음악|들려|song|music)/.test(t)) return 'song_request';
  // 'recommend' intent: deliberately NARROW — we used to match on
  // "어디 갈 / 뭐 먹 / 뭘 입 / 어딜 가", which fired on normal
  // conversational questions ("춘천에서 어디 갈만한 데 있어?") and
  // produced salesy product-card pop-ups for unrelated topics.
  // Keep only the explicit "recommendation" word so this signal is
  // used for analytics / response routing, not aggressive ad
  // injection. The chat route additionally requires a purchase verb
  // before attaching a product card — see shouldAttachProductCard().
  if (/(추천|recommend)/.test(t)) return 'recommend';
  if (/(슬퍼|힘들|우울|짜증|외로워|sad|lonely|stressed)/.test(t)) return 'comfort';
  if (/(날씨|비|눈|더워|추워|기온|weather|rain|snow|temperature)/.test(t))
    return 'weather_question';
  if (/(안녕|반가|hi|hello|hey|ㅎㅇ|ㅎㅏㅇㅣ)/.test(t)) return 'greeting';
  return 'smalltalk';
}
