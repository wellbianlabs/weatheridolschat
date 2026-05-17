import type { WeatherSnapshot } from '@wi/core/weather';

/**
 * Slot identifiers used by the scheduled-greeting cron + DB schema.
 * Kept in sync with the CHECK constraint in
 * supabase/migrations/20260517000001_scheduled_messages.sql.
 */
export type ScheduledSlot = 'morning_7' | 'lunch_12' | 'evening_18' | 'night_22';

export const SCHEDULED_SLOTS: ScheduledSlot[] = [
  'morning_7',
  'lunch_12',
  'evening_18',
  'night_22',
];

/**
 * Human-readable label for logs. Don't put this in the LLM prompt —
 * the model already infers tone from the time-of-day brief.
 */
export const SLOT_LABEL: Record<ScheduledSlot, string> = {
  morning_7: '아침 7시',
  lunch_12: '점심 12시',
  evening_18: '저녁 6시',
  night_22: '밤 10시',
};

/**
 * Per-slot tone + intent guidance the LLM uses to shape the greeting.
 *
 * Each slot has its own emotional register — morning is gentle wake-up,
 * lunch is bright check-in, evening is unwind, night is quiet wind-down.
 * The 'intent' line steers what the greeting should *do* (suggest
 * something, ask a question, just acknowledge presence) so the model
 * doesn't always default to the same conversational shape.
 */
interface SlotBrief {
  /** When the user reads this message, in plain Korean. */
  whenKr: string;
  /** Mood word the model can use as the tonal anchor. */
  mood: string;
  /** One-line direction for what kind of message to write. */
  intent: string;
}
const SLOT_BRIEFS: Record<ScheduledSlot, SlotBrief> = {
  morning_7: {
    whenKr: '한국 시간 오전 7시',
    mood: '잔잔하게 깨우는 아침',
    intent:
      '잠에서 막 깨는 친구에게 살며시 인사. 오늘 날씨에 어울리는 옷이나 아침 음료를 한 가지 자연스럽게 제안.',
  },
  lunch_12: {
    whenKr: '한국 시간 점심 12시',
    mood: '낮의 에너지가 가득한 중간 점검',
    intent:
      '점심 시간대에 어떤 메뉴가 좋을지, 또는 오후를 어떻게 보낼지 짧게 한마디 던지기. 너무 길지 않게.',
  },
  evening_18: {
    whenKr: '한국 시간 저녁 6시',
    mood: '하루를 마무리하며 풀어지는 시간',
    intent:
      '하루 어땠는지 가볍게 물어보기 + 저녁 시간을 어떻게 보낼지 살짝 제안. 퇴근/하교 직후의 피로를 받아주는 톤.',
  },
  night_22: {
    whenKr: '한국 시간 밤 10시',
    mood: '하루를 닫는 조용한 밤',
    intent:
      '잠들기 전 잔잔하게 인사. 내일 날씨가 어떨지 한 줄, 또는 오늘 하루 수고했다는 따뜻한 한마디. 깊은 이야기 X, 짧고 부드럽게.',
  },
};

/** Vivid Korean phrase for a weather condition — used inside the brief
 *  so the LLM has concrete sensory material to riff on. */
function weatherDescriptorKr(condition: string): string {
  switch (condition) {
    case 'clear':
      return '맑고 햇살이 가득한 하늘';
    case 'clouds':
      return '구름이 자욱한 하늘';
    case 'rain':
      return '비가 내리는 날';
    case 'drizzle':
      return '보슬보슬 가벼운 비';
    case 'thunder':
      return '천둥과 비가 함께 오는 날';
    case 'snow':
      return '눈이 내리는 날';
    case 'mist':
      return '안개가 자욱한 아침';
    default:
      return '오늘 날씨';
  }
}

/**
 * Build the *user-turn* prompt sent to the chat adapter for a
 * scheduled greeting.
 *
 * The character system prompt is unchanged — we feed it via the same
 * `characterSystemPrompt` field as a normal chat turn so personality
 * stays consistent. What's different is the "user message" we craft:
 * it's a brief from the *system* explaining that this is a proactive
 * ping at a specific time of day, with weather context, and asking
 * the model to write the opening line as the character would.
 *
 * This pattern is much better than appending to the system prompt —
 * the model treats the brief as a directive rather than a permanent
 * personality shift, so the next time the user replies, the character
 * goes right back to its usual conversational mode.
 */
export function buildScheduledGreetingUserPrompt(args: {
  slot: ScheduledSlot;
  weather: WeatherSnapshot;
  nickname: string;
}): string {
  const brief = SLOT_BRIEFS[args.slot];
  const wx = weatherDescriptorKr(args.weather.condition);
  const temp = `${Math.round(args.weather.temperatureC)}°C`;
  const loc = args.weather.location.label ?? '한국';

  return [
    '## 자동 스케줄 인사 (사용자가 보낸 메시지 아님)',
    '',
    `지금은 ${brief.whenKr}. 사용자(${args.nickname})는 지금 너에게 말을 걸지 않았어. 너가 먼저 살며시 말을 거는 상황이야.`,
    '',
    `- 분위기: ${brief.mood}`,
    `- 지금 ${loc} 날씨: ${wx}, 기온 ${temp}`,
    `- 해야 할 것: ${brief.intent}`,
    '',
    '규칙:',
    '- 1~3문장. 짧게.',
    "- 인사 뒤에 자연스럽게 날씨 한 줄 + 짧은 제안/질문 하나.",
    '- 너의 평소 말투/이모지 사용 빈도 그대로.',
    '- 사용자에게 "답장해줘", "어떻게 지내?" 같은 강요는 X. 부드럽게 던지고 끝.',
    '- 셀카 / 노래 / 사진을 보낼 거라고 말하지 마. 이번엔 글로만.',
    '',
    `위 조건에 맞춰 ${args.nickname}에게 보낼 첫 메시지를 한 번만 작성해줘. 다른 설명·메타텍스트 없이 바로 메시지 본문만.`,
  ].join('\n');
}
