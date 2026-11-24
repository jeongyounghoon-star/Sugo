import { decomposeSyllable } from "../lib/hangul";

/**
 * 그림-글자 짝 맞추기에 쓰는 낱말.
 * 그림은 이모지로 표시하고, 낱말 소리는 미리 만든 mp3로 들려준다.
 */
export interface WordInfo {
  /** 오디오 id 용 키 (w_<id>.mp3) */
  id: string;
  word: string;
  emoji: string;
}

export const WORDS: readonly WordInfo[] = [
  // 첫소리 모음 (월드 1)
  { id: "agi", word: "아기", emoji: "👶" },
  { id: "eomuk", word: "어묵", emoji: "🍢" },
  { id: "oi", word: "오이", emoji: "🥒" },
  { id: "uyu", word: "우유", emoji: "🥛" },
  { id: "i", word: "이", emoji: "🦷" },
  { id: "yagu", word: "야구", emoji: "⚾" },
  { id: "yeou", word: "여우", emoji: "🦊" },
  { id: "yoyo", word: "요요", emoji: "🪀" },
  { id: "yuryeong", word: "유령", emoji: "👻" },
  // 첫소리 자음 (월드 2)
  { id: "girin", word: "기린", emoji: "🦒" },
  { id: "geomi", word: "거미", emoji: "🕷️" },
  { id: "nabi", word: "나비", emoji: "🦋" },
  { id: "namu", word: "나무", emoji: "🌳" },
  { id: "danggeun", word: "당근", emoji: "🥕" },
  { id: "daramjwi", word: "다람쥐", emoji: "🐿️" },
  { id: "ramyeon", word: "라면", emoji: "🍜" },
  { id: "robot", word: "로봇", emoji: "🤖" },
  { id: "moja", word: "모자", emoji: "🧢" },
  { id: "mal", word: "말", emoji: "🐴" },
  { id: "banana", word: "바나나", emoji: "🍌" },
  { id: "beoseu", word: "버스", emoji: "🚌" },
  { id: "saja", word: "사자", emoji: "🦁" },
  { id: "sagwa", word: "사과", emoji: "🍎" },
  { id: "ori", word: "오리", emoji: "🦆" },
];

/** 낱말 첫 글자의 초성 */
export function firstConsonant(word: WordInfo): string {
  const d = decomposeSyllable(word.word[0]);
  if (!d) throw new Error(`음절이 아님: ${word.word}`);
  return d.initial;
}

/** 낱말 첫 글자의 모음 (첫소리가 ㅇ인 낱말에서 의미가 있음) */
export function firstVowel(word: WordInfo): string {
  const d = decomposeSyllable(word.word[0]);
  if (!d) throw new Error(`음절이 아님: ${word.word}`);
  return d.medial;
}

/**
 * 짝 맞추기 정답 글자.
 * - vowel: 첫소리가 ㅇ인 낱말의 모음 (아기 → ㅏ)
 * - consonant: 첫 글자 초성 (나비 → ㄴ)
 */
export function matchKeyOf(
  word: WordInfo,
  by: "vowel" | "consonant",
): string | null {
  if (by === "consonant") return firstConsonant(word);
  return firstConsonant(word) === "ㅇ" ? firstVowel(word) : null;
}
