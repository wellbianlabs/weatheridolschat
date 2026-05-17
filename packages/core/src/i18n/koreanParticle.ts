/**
 * Korean particle attachment helpers.
 *
 * Korean attaches a different particle form depending on whether the
 * final syllable of the preceding word ends in a consonant (받침) or
 * a vowel. Getting this wrong is the single most-noticeable Korean
 * grammar bug a foreign-feeling system can produce — e.g. emitting
 * "써니이야" (wrong, the LLM treated the vowel-ending name as
 * consonant-ending) when the natural form is "써니야".
 *
 * We can't fix the LLM's free-form output from code, but we CAN:
 *   1. Use these helpers for every code-generated Korean string
 *      that includes a runtime name (user nickname, character name)
 *      so server-templated copy is always correct.
 *   2. Cite the exact correct forms in each character's system
 *      prompt so the LLM has a reference to anchor to.
 *
 * Hangul syllable math:
 *   Korean precomposed syllables occupy U+AC00 ('가') through
 *   U+D7A3 ('힣'). For any syllable code C:
 *       final (받침) = (C - 0xAC00) % 28
 *   final === 0 means the syllable ends in a vowel (no jongseong);
 *   final !== 0 means it ends in a consonant.
 *
 * For non-Korean inputs (e.g. "Sunny" written in Latin), there is no
 * universally-agreed Korean particle convention. We default to the
 * vowel-ending forms because most Romanised K-pop names end in a
 * vowel sound — "Sunny" → "써니" → vowel-final. If you ship a name
 * that breaks this assumption, romanise it consistently to Hangul
 * first and run that through the helpers.
 */

const HANGUL_START = 0xac00;
const HANGUL_END = 0xd7a3;

/**
 * Does the last syllable of `s` end in a consonant (받침/jongseong)?
 *
 * Returns false for non-Korean input — see file-header note on the
 * default-to-vowel assumption.
 */
export function hasJongseong(s: string): boolean {
  if (!s) return false;
  // Trim trailing whitespace + punctuation so "써니!" still reads as 써니.
  const trimmed = s.replace(/[\s!?.,~…]+$/u, '');
  if (!trimmed) return false;

  // Last UTF-16 code unit. Hangul syllables are in the BMP so we
  // don't need surrogate-pair handling here.
  const code = trimmed.charCodeAt(trimmed.length - 1);
  if (code < HANGUL_START || code > HANGUL_END) return false;
  return (code - HANGUL_START) % 28 !== 0;
}

/**
 * Vocative particle ("when called by name"):
 *   - consonant-final: 아  →  정민아, 수민아
 *   - vowel-final:     야  →  써니야, 클라우디야
 */
export function vocative(name: string): string {
  return `${name}${hasJongseong(name) ? '아' : '야'}`;
}

/**
 * Casual copula ("I am X" / "It's X" in informal speech):
 *   - consonant-final: 이야  →  레인이야
 *   - vowel-final:     야    →  써니야, 클라우디야
 *
 * Use this whenever a character is introducing themselves.
 */
export function copulaCasual(name: string): string {
  return `${name}${hasJongseong(name) ? '이야' : '야'}`;
}

/**
 * Polite copula ("It is X" in polite speech):
 *   - consonant-final: 이에요  →  레인이에요
 *   - vowel-final:     예요    →  써니예요
 */
export function copulaPolite(name: string): string {
  return `${name}${hasJongseong(name) ? '이에요' : '예요'}`;
}

/**
 * Subject marker:
 *   - consonant-final: 이  →  레인이
 *   - vowel-final:     가  →  써니가
 */
export function subject(name: string): string {
  return `${name}${hasJongseong(name) ? '이' : '가'}`;
}

/**
 * Topic marker:
 *   - consonant-final: 은  →  레인은
 *   - vowel-final:     는  →  써니는
 */
export function topic(name: string): string {
  return `${name}${hasJongseong(name) ? '은' : '는'}`;
}

/**
 * Object marker:
 *   - consonant-final: 을  →  레인을
 *   - vowel-final:     를  →  써니를
 */
export function objectMarker(name: string): string {
  return `${name}${hasJongseong(name) ? '을' : '를'}`;
}

/**
 * "and" / "with":
 *   - consonant-final: 과  →  레인과
 *   - vowel-final:     와  →  써니와
 */
export function and(name: string): string {
  return `${name}${hasJongseong(name) ? '과' : '와'}`;
}
