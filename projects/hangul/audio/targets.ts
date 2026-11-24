/**
 * TTS 생성 대상 목록. `npm run audio`가 이 목록을 scripts/gen-audio/targets.json 으로
 * 내보낸 뒤 edge-tts(ko-KR-SunHiNeural)로 mp3를 만든다.
 */
import { CONSONANTS, VOWELS } from "../data/jamo";
import { WORLDS } from "../data/curriculum";
import { WORDS } from "../data/words";
import { PETS } from "../data/pets";
import { composeSyllable } from "../lib/hangul";
import {
  PROMPTS,
  consonantNameAudio,
  consonantSoundAudio,
  petAudio,
  syllableAudio,
  vowelAudio,
  wordAudio,
  worldAudio,
} from "./ids";

export interface AudioTarget {
  id: string;
  text: string;
  /** edge-tts rate, 예: "-20%" */
  rate: string;
}

/** 낱자/음절은 또박또박 천천히, 안내는 살짝 천천히 */
const LETTER_RATE = "-25%";
const WORD_RATE = "-15%";
const PROMPT_RATE = "-5%";

/** 월드 1~2에서 조립하는 음절: (자음 마을 1 자음 + ㅇ) × 기본 모음 10개 */
export function playableSyllables(): string[] {
  const consonants = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ"];
  return consonants.flatMap((c) => VOWELS.map((v) => composeSyllable(c, v.char)));
}

export function buildAudioTargets(): AudioTarget[] {
  const targets: AudioTarget[] = [];
  for (const v of VOWELS) {
    targets.push({ id: vowelAudio(v.char), text: v.sound, rate: LETTER_RATE });
  }
  for (const c of CONSONANTS) {
    targets.push({ id: consonantNameAudio(c.char), text: c.name, rate: LETTER_RATE });
    targets.push({ id: consonantSoundAudio(c.char), text: c.sound, rate: LETTER_RATE });
  }
  for (const s of playableSyllables()) {
    targets.push({ id: syllableAudio(s), text: s, rate: LETTER_RATE });
  }
  for (const w of WORDS) {
    targets.push({ id: wordAudio(w.id), text: w.word, rate: WORD_RATE });
  }
  for (const world of WORLDS) {
    targets.push({ id: worldAudio(world.id), text: world.name.replace(" 1", " 하나").replace(" 2", " 둘"), rate: PROMPT_RATE });
  }
  for (const pet of PETS) {
    targets.push({ id: petAudio(pet.id), text: `${pet.name}!`, rate: PROMPT_RATE });
  }
  for (const [id, text] of Object.entries(PROMPTS)) {
    targets.push({ id, text, rate: PROMPT_RATE });
  }
  return targets;
}
