/**
 * 한글 자모 기본 데이터.
 * - 모음: 소리 = ㅇ + 모음 (예: ㅏ → "아")
 * - 자음: 이름(기역)과 아이용 소리(그 = 자음 + ㅡ) 둘 다 준비
 */

export interface VowelInfo {
  char: string;
  /** 오디오 파일 id에 쓰는 로마자 키 */
  key: string;
  /** 읽는 소리 */
  sound: string;
}

export interface ConsonantInfo {
  char: string;
  key: string;
  /** 자음 이름 (기역, 니은 ...) */
  name: string;
  /** 아이에게 들려주는 소리 (그, 느 ...) */
  sound: string;
}

export const VOWELS: readonly VowelInfo[] = [
  { char: "ㅏ", key: "a", sound: "아" },
  { char: "ㅓ", key: "eo", sound: "어" },
  { char: "ㅗ", key: "o", sound: "오" },
  { char: "ㅜ", key: "u", sound: "우" },
  { char: "ㅡ", key: "eu", sound: "으" },
  { char: "ㅣ", key: "i", sound: "이" },
  { char: "ㅑ", key: "ya", sound: "야" },
  { char: "ㅕ", key: "yeo", sound: "여" },
  { char: "ㅛ", key: "yo", sound: "요" },
  { char: "ㅠ", key: "yu", sound: "유" },
];

export const CONSONANTS: readonly ConsonantInfo[] = [
  { char: "ㄱ", key: "g", name: "기역", sound: "그" },
  { char: "ㄴ", key: "n", name: "니은", sound: "느" },
  { char: "ㄷ", key: "d", name: "디귿", sound: "드" },
  { char: "ㄹ", key: "r", name: "리을", sound: "르" },
  { char: "ㅁ", key: "m", name: "미음", sound: "므" },
  { char: "ㅂ", key: "b", name: "비읍", sound: "브" },
  { char: "ㅅ", key: "s", name: "시옷", sound: "스" },
  { char: "ㅇ", key: "ng", name: "이응", sound: "으" },
  { char: "ㅈ", key: "j", name: "지읒", sound: "즈" },
  { char: "ㅊ", key: "ch", name: "치읓", sound: "츠" },
  { char: "ㅋ", key: "k", name: "키읔", sound: "크" },
  { char: "ㅌ", key: "t", name: "티읕", sound: "트" },
  { char: "ㅍ", key: "p", name: "피읖", sound: "프" },
  { char: "ㅎ", key: "h", name: "히읗", sound: "흐" },
];

const vowelMap = new Map(VOWELS.map((v) => [v.char, v]));
const consonantMap = new Map(CONSONANTS.map((c) => [c.char, c]));

export function getVowel(char: string): VowelInfo | undefined {
  return vowelMap.get(char);
}

export function getConsonant(char: string): ConsonantInfo | undefined {
  return consonantMap.get(char);
}

export function isVowel(char: string): boolean {
  return vowelMap.has(char);
}

export function isConsonant(char: string): boolean {
  return consonantMap.has(char);
}
