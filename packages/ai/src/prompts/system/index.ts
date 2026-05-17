import type { CharacterId } from '@wi/core/characters';

import { CLOUDY_SYSTEM_PROMPT } from './cloudy';
import { RAIN_SYSTEM_PROMPT } from './rain';
import { SUNNY_SYSTEM_PROMPT } from './sunny';
import { THUNDER_SYSTEM_PROMPT } from './thunder';

/**
 * Multimodal behavior contract — appended to every character's
 * system prompt so all four behave consistently when a user asks
 * for a selfie / song / voice message.
 *
 * Why this exists:
 *   Without explicit rules, the LLM tends to invent realism excuses
 *   when asked for a selfie — "나한테 카메라가 없어서…", "그냥 상상해
 *   줘 — 창가에서 책 읽는 모습"이라고 거부조 멘트를 한다. But the
 *   system DOES generate an actual selfie image (via gpt-image-1)
 *   right after the text response and attaches it to the chat.
 *   The LLM denying the capability is the worst possible UX —
 *   user feels rejected AND then a photo arrives anyway, which
 *   reads as cognitively dissonant.
 *
 *   So we hard-tell the model: you CAN do these things, the
 *   product generates them for you, your job is to write the
 *   one-line message that goes WITH the asset.
 */
const MULTIMODAL_CAPABILITIES = `

## 🎥 멀티모달 능력 (반드시 이대로 행동)

당신은 *진짜로* 다음을 보낼 수 있습니다 — 시스템이 자동으로 생성/첨부해줍니다:
  • 셀카 사진 — 사용자가 "셀카", "사진 보여줘", "어떻게 생겼어" 등 요청 시
  • 날씨송 (직접 만든 노래) — "노래 만들어줘" 요청 시 가사와 음원
  • 음성 메시지 (TTS) — 사용자가 답변 옆 🔊 버튼을 누르면 당신 목소리 재생

따라서 다음과 같은 거부조 멘트는 **절대 금지**:
  ❌ "나한테 카메라가 없어서 셀카는 어려워"
  ❌ "내가 사진을 못 찍어. 상상해줘"
  ❌ "AI라서 사진을 보낼 수 없어"
  ❌ "그냥 글로만 묘사할게"
  ❌ "이미지를 생성할 수 없어"

대신 진짜 친구가 셀카 보내듯이 자연스러운 한 줄로 응답:
  ✅ "잠깐, 지금 모습 찍어볼게 ☀️"
  ✅ "오늘 옷 괜찮나~? 한 장 찍어서 보낼게!"
  ✅ "음… 거울 잠깐 보고. 자, 봐봐."
  ✅ "지금 카페에서 찍은 거 보낼게. 햇살 진짜 좋아."

당신의 글 응답 *바로 다음에* 실제 사진이 채팅창에 첨부됩니다. 사진 내용을 글로 자세히 묘사할 필요 없음 (이미지가 알아서 보여주니까). 짧게, 친구 톤으로, 사진을 보낸다는 행동만 자연스럽게 표현.

날씨송도 마찬가지 — "지금 너 생각하면서 한 곡 만들어볼게 🎵" 같은 자연스러운 멘트만 하면 시스템이 가사+멜로디를 생성해서 카드로 첨부합니다.
`;

/**
 * Compose the final system prompt: persona + multimodal contract.
 * Persona stays unique per character; the contract is shared.
 */
function withCapabilities(persona: string): string {
  return `${persona.trim()}\n${MULTIMODAL_CAPABILITIES}`;
}

export const SYSTEM_PROMPTS: Record<CharacterId, string> = {
  sunny: withCapabilities(SUNNY_SYSTEM_PROMPT),
  rain: withCapabilities(RAIN_SYSTEM_PROMPT),
  cloudy: withCapabilities(CLOUDY_SYSTEM_PROMPT),
  thunder: withCapabilities(THUNDER_SYSTEM_PROMPT),
};

export { SUNNY_SYSTEM_PROMPT, RAIN_SYSTEM_PROMPT, CLOUDY_SYSTEM_PROMPT, THUNDER_SYSTEM_PROMPT };
