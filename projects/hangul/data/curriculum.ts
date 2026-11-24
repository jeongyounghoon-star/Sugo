/**
 * 한글 모험 커리큘럼: 26주, 월드 8개.
 * MVP에서는 월드 1~2만 플레이 가능 (playable: true).
 */

export type GameKind = "balloon" | "block" | "match";

export interface StageDef {
  /** 전역 고유 id. 예: "w1-s1" */
  id: string;
  worldId: number;
  /** 월드 안에서의 순서 (1부터) */
  order: number;
  /** 이 스테이지에서 배우거나 연습하는 글자 (낱자 또는 음절) */
  focus: string[];
  /** 오답 보기로만 쓰는 이미 배운 글자 */
  distractors?: string[];
  /** 문제 종류 순서. 문제 수 = plan.length */
  plan: GameKind[];
  /** 블록 조립 게임 재료 */
  blocks?: { consonants: string[]; vowels: string[] };
  /** 짝 맞추기 기준: 첫소리 모음 / 첫소리 자음 */
  matchBy?: "vowel" | "consonant";
  /** 풍선 게임에서 낱자 대신 음절(블록 재료로 만든)을 찾게 할지 */
  balloonSyllables?: boolean;
}

export interface WorldDef {
  id: number;
  slug: string;
  name: string;
  /** 지도에 표시하는 그림 */
  emoji: string;
  /** 대표 색 (tailwind 임의값에 쓰는 hex) */
  color: string;
  /** 커리큘럼 주차 [시작, 끝] (포함) */
  weeks: [number, number];
  /** 월드에서 다루는 글자 요약 (부모용 설명) */
  summary: string;
  /** 이 월드를 대표하는 글자들 */
  letters: string[];
  playable: boolean;
  petId: string;
  stages: StageDef[];
}

const VOWELS_1 = ["ㅏ", "ㅓ", "ㅗ", "ㅜ", "ㅡ", "ㅣ"];
const VOWELS_ALL = [...VOWELS_1, "ㅑ", "ㅕ", "ㅛ", "ㅠ"];
const CONS_1 = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ"];
const CONS_2 = ["ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function stage(
  worldId: number,
  order: number,
  def: Omit<StageDef, "id" | "worldId" | "order">,
): StageDef {
  return { id: `w${worldId}-s${order}`, worldId, order, ...def };
}

const B = "balloon" as const;
const K = "block" as const;
const M = "match" as const;

export const WORLDS: readonly WorldDef[] = [
  {
    id: 1,
    slug: "vowel-forest",
    name: "모음 숲",
    emoji: "🌳",
    color: "#4caf50",
    weeks: [1, 3],
    summary: "기본 모음 10개",
    letters: VOWELS_ALL,
    playable: true,
    petId: "porong",
    stages: [
      stage(1, 1, { focus: ["ㅏ", "ㅓ"], plan: [B, B, B, B, B, B] }),
      stage(1, 2, {
        focus: ["ㅗ", "ㅜ"],
        distractors: ["ㅏ", "ㅓ"],
        plan: [B, B, B, B, B, B],
      }),
      stage(1, 3, {
        focus: ["ㅡ", "ㅣ"],
        distractors: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"],
        plan: [K, K, B, B, K, B],
        blocks: { consonants: ["ㅇ"], vowels: ["ㅡ", "ㅣ", "ㅏ", "ㅗ"] },
      }),
      stage(1, 4, {
        focus: VOWELS_1,
        plan: [M, B, M, B],
        matchBy: "vowel",
      }),
      stage(1, 5, {
        focus: ["ㅑ", "ㅕ"],
        distractors: ["ㅏ", "ㅓ"],
        plan: [B, B, K, B, B, K],
        blocks: { consonants: ["ㅇ"], vowels: ["ㅑ", "ㅕ", "ㅏ", "ㅓ"] },
      }),
      stage(1, 6, {
        focus: ["ㅛ", "ㅠ"],
        distractors: ["ㅗ", "ㅜ"],
        plan: [B, B, K, B, B, K],
        blocks: { consonants: ["ㅇ"], vowels: ["ㅛ", "ㅠ", "ㅗ", "ㅜ"] },
      }),
      stage(1, 7, {
        focus: VOWELS_ALL,
        plan: [M, B, K, M, B, K],
        matchBy: "vowel",
        blocks: { consonants: ["ㅇ"], vowels: VOWELS_ALL },
      }),
    ],
  },
  {
    id: 2,
    slug: "consonant-village-1",
    name: "자음 마을 1",
    emoji: "🏡",
    color: "#ff9800",
    weeks: [4, 6],
    summary: "자음 ㄱㄴㄷㄹㅁㅂㅅㅇ + 월드 1 모음 조합",
    letters: CONS_1,
    playable: true,
    petId: "dodam",
    stages: [
      stage(2, 1, { focus: ["ㄱ", "ㄴ"], plan: [B, B, B, B, B, B] }),
      stage(2, 2, {
        focus: ["ㄷ", "ㄹ"],
        distractors: ["ㄱ", "ㄴ"],
        plan: [B, B, K, B, B, K],
        blocks: { consonants: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"], vowels: ["ㅏ"] },
      }),
      stage(2, 3, {
        focus: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"],
        plan: [K, K, K, K, K, K],
        blocks: { consonants: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"], vowels: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"] },
      }),
      stage(2, 4, {
        focus: ["ㅁ", "ㅂ"],
        distractors: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"],
        plan: [B, B, K, B, B, K],
        blocks: { consonants: ["ㅁ", "ㅂ"], vowels: ["ㅏ", "ㅗ", "ㅣ"] },
      }),
      stage(2, 5, {
        focus: ["ㅅ", "ㅇ"],
        distractors: ["ㅁ", "ㅂ", "ㄱ"],
        plan: [B, B, K, B, B, K],
        blocks: { consonants: ["ㅅ", "ㅇ"], vowels: ["ㅏ", "ㅜ", "ㅣ"] },
      }),
      stage(2, 6, {
        focus: CONS_1,
        plan: [M, B, M, B],
        matchBy: "consonant",
      }),
      stage(2, 7, {
        focus: CONS_1,
        plan: [K, K, K, K, K, K],
        blocks: { consonants: CONS_1, vowels: VOWELS_ALL },
      }),
      stage(2, 8, {
        focus: CONS_1,
        plan: [M, B, K, B, K, B],
        matchBy: "consonant",
        balloonSyllables: true,
        blocks: { consonants: CONS_1, vowels: VOWELS_ALL },
      }),
    ],
  },
  {
    id: 3,
    slug: "consonant-village-2",
    name: "자음 마을 2",
    emoji: "🏘️",
    color: "#e91e63",
    weeks: [7, 9],
    summary: "자음 ㅈㅊㅋㅌㅍㅎ",
    letters: CONS_2,
    playable: false,
    petId: "mallang",
    stages: [
      stage(3, 1, { focus: ["ㅈ", "ㅊ"], plan: [B, B, B, B, B, B] }),
      stage(3, 2, { focus: ["ㅋ", "ㅌ"], distractors: ["ㄱ", "ㄷ"], plan: [B, B, B, B, B, B] }),
      stage(3, 3, { focus: ["ㅍ", "ㅎ"], distractors: ["ㅂ", "ㅇ"], plan: [B, B, B, B, B, B] }),
      stage(3, 4, {
        focus: CONS_2,
        plan: [K, K, K, K, K, K],
        blocks: { consonants: CONS_2, vowels: VOWELS_1 },
      }),
      stage(3, 5, { focus: CONS_2, plan: [M, B, M, B], matchBy: "consonant" }),
      stage(3, 6, {
        focus: [...CONS_1, ...CONS_2],
        plan: [B, K, B, K, B, K],
        blocks: { consonants: [...CONS_1, ...CONS_2], vowels: VOWELS_ALL },
      }),
    ],
  },
  {
    id: 4,
    slug: "letter-factory",
    name: "글자 공장",
    emoji: "🏭",
    color: "#2196f3",
    weeks: [10, 13],
    summary: "자음 + 모음 조립 (가나다표)",
    letters: ["가", "나", "다", "라", "마", "바", "사"],
    playable: false,
    petId: "ttukttak",
    stages: [
      stage(4, 1, { focus: ["가", "나", "다", "라"], plan: [K, K, K, K, K, K], blocks: { consonants: ["ㄱ", "ㄴ", "ㄷ", "ㄹ"], vowels: ["ㅏ"] } }),
      stage(4, 2, { focus: ["마", "바", "사", "아"], plan: [K, K, K, K, K, K], blocks: { consonants: ["ㅁ", "ㅂ", "ㅅ", "ㅇ"], vowels: ["ㅏ"] } }),
      stage(4, 3, { focus: ["자", "차", "카", "타", "파", "하"], plan: [K, K, K, K, K, K], blocks: { consonants: CONS_2, vowels: ["ㅏ"] } }),
      stage(4, 4, { focus: ["고", "구", "그", "기"], plan: [K, K, K, K, K, K], blocks: { consonants: CONS_1, vowels: ["ㅗ", "ㅜ", "ㅡ", "ㅣ"] } }),
      stage(4, 5, { focus: ["갸", "겨", "교", "규"], plan: [K, K, K, K, K, K], blocks: { consonants: CONS_1, vowels: ["ㅑ", "ㅕ", "ㅛ", "ㅠ"] } }),
      stage(4, 6, { focus: ["가", "너", "도", "루"], plan: [B, K, B, K, B, K], balloonSyllables: true, blocks: { consonants: [...CONS_1, ...CONS_2], vowels: VOWELS_ALL } }),
    ],
  },
  {
    id: 5,
    slug: "word-sea",
    name: "낱말 바다",
    emoji: "🌊",
    color: "#00bcd4",
    weeks: [14, 17],
    summary: "받침 없는 낱말 읽기",
    letters: ["나무", "바다", "우유", "모자"],
    playable: false,
    petId: "challang",
    stages: [
      stage(5, 1, { focus: ["아기", "오이", "우유"], plan: [M, M, M] , matchBy: "vowel" }),
      stage(5, 2, { focus: ["나무", "나비", "모자"], plan: [M, M, M], matchBy: "consonant" }),
      stage(5, 3, { focus: ["바다", "구두", "다리"], plan: [M, M, M], matchBy: "consonant" }),
      stage(5, 4, { focus: ["사자", "소리", "버스"], plan: [M, M, M], matchBy: "consonant" }),
      stage(5, 5, { focus: ["기차", "포도", "하마"], plan: [M, M, M], matchBy: "consonant" }),
      stage(5, 6, { focus: ["바나나", "고구마", "도토리"], plan: [M, M, M], matchBy: "consonant" }),
    ],
  },
  {
    id: 6,
    slug: "batchim-mountain",
    name: "받침 산",
    emoji: "⛰️",
    color: "#795548",
    weeks: [18, 21],
    summary: "받침 ㄱㄴㄹㅁㅂㅇ과 대표 받침",
    letters: ["각", "간", "갈", "감", "갑", "강"],
    playable: false,
    petId: "dandan",
    stages: [
      stage(6, 1, { focus: ["ㄴ받침", "ㅁ받침"], plan: [B, B, B, B, B, B] }),
      stage(6, 2, { focus: ["ㅇ받침", "ㄹ받침"], plan: [B, B, B, B, B, B] }),
      stage(6, 3, { focus: ["ㄱ받침", "ㅂ받침"], plan: [B, B, B, B, B, B] }),
      stage(6, 4, { focus: ["ㅅ받침", "ㄷ받침"], plan: [B, B, B, B, B, B] }),
      stage(6, 5, { focus: ["받침 낱말"], plan: [M, M, M] }),
      stage(6, 6, { focus: ["받침 모두"], plan: [B, M, B, M] }),
    ],
  },
  {
    id: 7,
    slug: "sparkle-island",
    name: "반짝 섬",
    emoji: "🏝️",
    color: "#ffc107",
    weeks: [22, 24],
    summary: "쌍자음과 복모음",
    letters: ["ㄲ", "ㄸ", "ㅃ", "ㅆ", "ㅉ", "ㅐ", "ㅔ", "ㅘ", "ㅝ"],
    playable: false,
    petId: "banjjak",
    stages: [
      stage(7, 1, { focus: ["ㄲ", "ㄸ", "ㅃ"], plan: [B, B, B, B, B, B] }),
      stage(7, 2, { focus: ["ㅆ", "ㅉ"], plan: [B, B, B, B, B, B] }),
      stage(7, 3, { focus: ["ㅐ", "ㅔ", "ㅒ", "ㅖ"], plan: [B, B, B, B, B, B] }),
      stage(7, 4, { focus: ["ㅘ", "ㅝ", "ㅙ", "ㅞ"], plan: [B, B, B, B, B, B] }),
      stage(7, 5, { focus: ["ㅚ", "ㅟ", "ㅢ"], plan: [B, B, B, B, B, B] }),
    ],
  },
  {
    id: 8,
    slug: "story-castle",
    name: "이야기 성",
    emoji: "🏰",
    color: "#9c27b0",
    weeks: [25, 26],
    summary: "짧은 문장 읽기",
    letters: ["나는 사자", "아기가 자요"],
    playable: false,
    petId: "duru",
    stages: [
      stage(8, 1, { focus: ["두 낱말 문장"], plan: [M, M, M] }),
      stage(8, 2, { focus: ["세 낱말 문장"], plan: [M, M, M] }),
      stage(8, 3, { focus: ["그림 문장"], plan: [M, M, M] }),
      stage(8, 4, { focus: ["짧은 이야기 1"], plan: [M, M, M] }),
      stage(8, 5, { focus: ["짧은 이야기 2"], plan: [M, M, M] }),
    ],
  },
];

export const TOTAL_WEEKS = 26;

const stageMap = new Map<string, StageDef>(
  WORLDS.flatMap((w) => w.stages.map((s) => [s.id, s] as const)),
);

export function getWorld(id: number): WorldDef | undefined {
  return WORLDS.find((w) => w.id === id);
}

export function getStage(id: string): StageDef | undefined {
  return stageMap.get(id);
}

export function allStages(): StageDef[] {
  return WORLDS.flatMap((w) => w.stages);
}

export function playableStages(): StageDef[] {
  return WORLDS.filter((w) => w.playable).flatMap((w) => w.stages);
}

/** 같은 월드의 다음 스테이지, 없으면 다음 월드의 첫 스테이지 */
export function nextStage(id: string): StageDef | undefined {
  const all = allStages();
  const i = all.findIndex((s) => s.id === id);
  return i >= 0 ? all[i + 1] : undefined;
}
