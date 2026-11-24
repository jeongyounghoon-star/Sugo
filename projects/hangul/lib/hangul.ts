/**
 * 한글 음절 조립/분해 (유니코드 공식 이용).
 * 음절 = 0xAC00 + (초성 * 21 + 중성) * 28 + 종성
 */

const SYLLABLE_BASE = 0xac00;
const SYLLABLE_LAST = 0xd7a3;

/** 초성 순서 (호환 자모) */
export const INITIALS = [
  "ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ",
  "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ",
] as const;

/** 중성 순서 (호환 자모) */
export const MEDIALS = [
  "ㅏ", "ㅐ", "ㅑ", "ㅒ", "ㅓ", "ㅔ", "ㅕ", "ㅖ", "ㅗ", "ㅘ",
  "ㅙ", "ㅚ", "ㅛ", "ㅜ", "ㅝ", "ㅞ", "ㅟ", "ㅠ", "ㅡ", "ㅢ", "ㅣ",
] as const;

/** 받침 없는 음절 하나를 조립한다. (ㄱ + ㅏ → 가) */
export function composeSyllable(initial: string, medial: string): string {
  const i = (INITIALS as readonly string[]).indexOf(initial);
  const m = (MEDIALS as readonly string[]).indexOf(medial);
  if (i < 0 || m < 0) {
    throw new Error(`조립할 수 없는 자모: ${initial} + ${medial}`);
  }
  return String.fromCharCode(SYLLABLE_BASE + (i * 21 + m) * 28);
}

export function isSyllable(char: string): boolean {
  if (char.length !== 1) return false;
  const code = char.charCodeAt(0);
  return code >= SYLLABLE_BASE && code <= SYLLABLE_LAST;
}

/** 음절을 초성/중성으로 나눈다. 받침이 있으면 hasFinal=true */
export function decomposeSyllable(
  char: string,
): { initial: string; medial: string; hasFinal: boolean } | null {
  if (!isSyllable(char)) return null;
  const offset = char.charCodeAt(0) - SYLLABLE_BASE;
  const final = offset % 28;
  const medial = Math.floor(offset / 28) % 21;
  const initial = Math.floor(offset / 28 / 21);
  return {
    initial: INITIALS[initial],
    medial: MEDIALS[medial],
    hasFinal: final !== 0,
  };
}
