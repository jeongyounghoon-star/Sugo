import { getConsonant, getVowel, isConsonant, isVowel } from "../data/jamo";
import { isSyllable } from "../lib/hangul";

/** 미리 생성한 mp3 위치: public/audio/hangul/<id>.mp3 */
export const AUDIO_BASE = "/audio/hangul";

export function audioUrl(id: string): string {
  return `${AUDIO_BASE}/${id}.mp3`;
}

export const vowelAudio = (char: string) => `v_${getVowel(char)!.key}`;
export const consonantNameAudio = (char: string) => `c_${getConsonant(char)!.key}_name`;
export const consonantSoundAudio = (char: string) => `c_${getConsonant(char)!.key}_sound`;
export const syllableAudio = (char: string) =>
  `syl_${char.charCodeAt(0).toString(16)}`;
export const wordAudio = (wordId: string) => `w_${wordId}`;
export const worldAudio = (worldId: number) => `p_world_${worldId}`;
export const petAudio = (petId: string) => `pet_${petId}`;

/** 안내 음성 (id → 문장). 아이는 글을 못 읽으므로 모든 안내는 음성으로. */
export const PROMPTS = {
  p_hangul_title: "한글 모험!",
  p_map_welcome: "한글 모험에 온 걸 환영해! 반짝이는 곳을 눌러 봐.",
  p_locked: "아직 잠겨 있어. 앞의 모험을 먼저 끝내 보자!",
  p_coming_soon: "이곳은 곧 열려. 조금만 기다려 줘!",
  p_stage_pick: "반짝이는 동그라미를 눌러서 놀이를 시작해 봐!",
  p_intro: "새로운 글자를 만나 보자! 글자를 눌러서 소리를 들어 봐.",
  p_balloon: "소리를 잘 듣고, 맞는 글자 풍선을 터뜨려 봐!",
  p_block: "소리를 잘 듣고, 블록을 붙여서 글자를 만들어 봐!",
  p_match: "그림과 맞는 글자를 짝지어 봐!",
  p_review: "지난번에 헷갈렸던 글자야. 다시 해 보자!",
  p_correct_1: "잘했어!",
  p_correct_2: "맞았어!",
  p_correct_3: "최고야!",
  p_correct_4: "멋져!",
  p_wrong_1: "괜찮아, 다시 해 보자!",
  p_wrong_2: "다시 한번 잘 들어 볼까?",
  p_stage_clear_3: "와, 별 세 개! 정말 대단해! 다음 놀이가 열렸어!",
  p_stage_clear_low: "잘했어! 한 번 더 하면 별을 더 모을 수 있어!",
  p_sticker: "새 스티커를 받았어!",
  p_pet_hatch: "알에서 아기 펫이 태어났어!",
  p_world_clear: "모험 완료! 펫이 멋지게 진화했어!",
  p_daily_done: "오늘 끝! 정말 잘했어. 내일 또 만나자!",
  p_pets: "내 펫과 스티커를 구경해 봐!",
} as const;

export type PromptId = keyof typeof PROMPTS;

export const CORRECT_PROMPTS: PromptId[] = [
  "p_correct_1",
  "p_correct_2",
  "p_correct_3",
  "p_correct_4",
];
export const WRONG_PROMPTS: PromptId[] = ["p_wrong_1", "p_wrong_2"];

/**
 * 글자 하나를 들려줄 때 재생할 오디오 목록.
 * - 모음: "아"
 * - 자음: 이름 + 소리 ("기역", "그")
 * - 음절: "가"
 */
export function glyphAudio(char: string): string[] {
  if (isVowel(char)) return [vowelAudio(char)];
  if (isConsonant(char)) return [consonantNameAudio(char), consonantSoundAudio(char)];
  if (isSyllable(char)) return [syllableAudio(char)];
  return [];
}
