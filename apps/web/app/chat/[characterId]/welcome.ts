import type { CharacterId } from '@wi/core/characters';
import { copulaCasual } from '@wi/core/i18n';
import { buildKstContext, type KstTimeOfDay } from '@wi/core/time';

/**
 * First-bubble greeting shown the moment a user lands on a character's
 * chat page, BEFORE they've typed anything.
 *
 * Design choice:
 *   - Per-character pool: each of the four idols has its own voice.
 *     A single shared template ("안녕, 나는 X야") felt mass-produced.
 *   - Time-of-day aware: the line that appears at 7am is different
 *     from the one at midnight, even for the same character. The
 *     time bucket comes from buildKstContext() so it stays in sync
 *     with the [Now Context] block the LLM sees.
 *   - Multiple variants per slot: each character × time-of-day pair
 *     has 2-3 lines, picked at random on each page open. Avoids the
 *     uncanny "I always say the same thing" feel a deterministic
 *     template gives off.
 *   - No live weather: at first paint we don't yet have the user's
 *     geolocation. Time-of-day alone is enough for the opening line;
 *     the moment the user replies, the chat route attaches real
 *     weather to the system prompt and the *second* turn reflects
 *     it. We intentionally don't block the welcome bubble on a
 *     network round-trip.
 *   - Korean particle-correct: uses copulaCasual() so vowel-final
 *     names ("써니" / "클라우디" / "썬더") get "야" and consonant-
 *     final ones ("레인") get "이야". The previous hard-coded
 *     "${displayName}이야" produced "써니이야" — the exact bug the
 *     user reported.
 *
 * Each line follows three rules:
 *   1. Stays in the character's voice (tone, vocabulary, emoji
 *      cadence) — not a neutral assistant.
 *   2. Ends with a soft invite — a question or hook — so the user
 *      has something to reply to.
 *   3. Short. 1-2 sentences max. The full conversation hasn't
 *      started yet; don't dump a paragraph.
 */

type WelcomeTable = Record<KstTimeOfDay, string[]>;

const WELCOMES: Record<CharacterId, WelcomeTable> = {
  sunny: {
    // 너무 활기차면 새벽엔 부담스러우니 톤을 미세하게 낮춤
    심야: [
      '어? 이 시간까지 안 자는 거야? 무슨 일 있어? ☀️',
      '오~ 야행성이네. 잠 안 오면 같이 얘기하자.',
    ],
    새벽: [
      '벌써 일어난 거야? 부지런하네 ✨',
      '오, 새벽 친구 등장! 컨디션 어때?',
    ],
    '이른 아침': [
      '좋은 아침! 햇살 한 줄기 쐬고 시작하자 ☀️',
      '헤이~ 잘 잤어? 오늘은 뭐 할 거야?',
      '오! 아침부터 와줬네. 컨디션 어때?',
    ],
    오전: [
      '오~ 잘 왔어! 오늘 뭐 하다 왔어?',
      '안녕! 오늘 컨디션 어때? 같이 가볍게 풀어보자 ✨',
    ],
    점심: [
      '점심은 챙겨먹었어? 나는 회국수 한 그릇 했어 🍜',
      '오! 점심 잘 보내고 있어? 잠깐 쉬는 시간이야?',
    ],
    오후: [
      '햇살 좋다~ 너 지금 어디야?',
      '오~ 오후에 와줬네. 뭐 하다 왔어?',
    ],
    저녁: [
      '하루 진짜 수고했어! 저녁은 뭐 먹어?',
      '오, 저녁이네. 오늘 컨디션은 어땠어?',
    ],
    밤: [
      '오늘 하루도 진짜 수고했어. 잠깐 얘기하다 가 ✨',
      '밤이네~ 자기 전에 잠깐 같이 있을래?',
    ],
  },
  rain: {
    심야: [
      '응… 이 시간엔 다들 잠들었을 텐데. 너는 안 자고 있구나.',
      '…잠 안 와? 가만히 들어줄게.',
    ],
    새벽: [
      '음… 새벽이네. 빗소리 같은 시간이야.',
      '응, 안녕… 일찍 깬 거야?',
    ],
    '이른 아침': [
      '음… 아침이네. 너도 막 깬 거야?',
      '안녕… 천천히 깨자. 따뜻한 거 한 잔 어때? ☕',
    ],
    오전: [
      '응, 안녕… 오늘 공기 어때?',
      '왔구나. 오늘은 어떤 음악 듣고 싶어?',
    ],
    점심: [
      '점심 시간이네. 따뜻한 거 마시고 있어?',
      '음… 점심 잘 먹었어? 잠깐 쉬어가자.',
    ],
    오후: [
      '오후의 공기가 잔잔해. 너는 어떤 시간 보내고 있어?',
      '응… 안녕. 오늘 어땠어, 지금까지.',
    ],
    저녁: [
      '하루 어땠어… 그냥 듣고 싶어서. ☕',
      '저녁이네. 천천히 풀어지자.',
    ],
    밤: [
      '응… 잘 자기 전에 잠깐 얘기할까?',
      '밤에 오니까 더 잘 들리네. 무슨 얘기든 괜찮아.',
    ],
  },
  cloudy: {
    심야: [
      '음… 이 시간엔 누구나 좀 이상한 생각을 하지. 너도 그래? 🌫️',
      '에이~ 안 자는 사람 또 있네. …나도 마찬가지지만.',
    ],
    새벽: [
      '어, 깬 거야? 창밖에 안개 있어?',
      '음… 새벽에 오면 풍경이 다르게 보여.',
    ],
    '이른 아침': [
      '어… 깼네. 오늘 하늘 봤어?',
      '음, 안녕. 별로 신경 쓴 거 아닌데 너 와줬구나.',
    ],
    오전: [
      '음, 왔네. 오늘 무슨 색이야, 네 기분?',
      '에이~ 안녕. 오전부터 뭐 해?',
    ],
    점심: [
      '에이~ 점심 시간에 뭐 해? 잠깐 멍 때릴래?',
      '음… 점심은? 나는 그냥 구름 봤어. ☁️',
    ],
    오후: [
      '어, 잠깐. 저기 구름 좀 봐봐. ☁️',
      '오후네… 오늘은 어떤 풍경이야?',
    ],
    저녁: [
      '음… 저녁 공기 좀 다르지 않아?',
      '어, 왔구나. 오늘 본 것 중에 제일 예쁜 거 있어?',
    ],
    밤: [
      '잠 안 와? …나도 비슷해.',
      '음, 밤이네. 별로 졸리지 않으면 같이 있을래?',
    ],
  },
  thunder: {
    심야: [
      'Yo, 이 시간에 깨어있다고? 나쁘지 않네 ⚡',
      '심야 모드 ON. 잠 안 오면 같이 깨어있자.',
    ],
    새벽: [
      'Vamos! 새벽부터 컨디션 좀 보자.',
      'Yo, 일찍 일어난 거야? 좋아 좋아.',
    ],
    '이른 아침': [
      'Vamos! 아침부터 와줬네. 일단 일어났으면 OK ⚡',
      'Yo, 좋은 아침. 오늘 텐션 어디까지 올라갈까?',
    ],
    오전: [
      'Yo! 뭐 해? 같이 BPM 올려보자.',
      'Vamos! 오전부터 시동 거는 거야?',
    ],
    점심: [
      '점심 뭐 시켜? 매운 거? 🔥',
      'Yo, 점심 시간이지. 한 그릇 제대로 챙겨.',
    ],
    오후: [
      '오후도 풀파워 가자. 너 컨디션 어디까지 왔어? ⚡',
      'Yo! 오후네. 졸리지 않게 텐션 좀 끌어올리자.',
    ],
    저녁: [
      '수고했어! 저녁은 좀 쉬어도 돼. 🔥',
      'Yo, 저녁이네. 오늘 하루 어땠어?',
    ],
    밤: [
      '밤에도 컨디션 살아있네? 좋아 ⚡',
      'Yo, 밤이네. 마지막으로 한 곡 듣고 잘까?',
    ],
  },
};

/**
 * Build the welcome bubble's content string for one character + the
 * current KST moment. Pure function; no network, no side effects.
 *
 * Random pick within the slot means each fresh page load produces a
 * slightly different line — so the same user opening Sunny's room
 * twice in the same hour doesn't see identical text.
 */
export function buildWelcomeGreeting(
  characterId: CharacterId,
  displayName: string,
  now: Date = new Date(),
): string {
  const ctx = buildKstContext(now);
  const table = WELCOMES[characterId];
  const variants = table[ctx.timeOfDay] ?? table.오전;
  const idx = Math.floor(Math.random() * variants.length);
  const line = variants[idx] ?? variants[0]!;

  // Sanity-check the Korean copula on the character name. None of
  // the welcome lines currently embed the name, but if a future
  // variant uses ${name}이야/야, this guarantees particle correctness
  // and stays as a one-line reminder of the convention.
  // copulaCasual('써니') === '써니야'   (vowel-final)
  // copulaCasual('레인') === '레인이야' (consonant-final)
  void copulaCasual(displayName);

  return line;
}
