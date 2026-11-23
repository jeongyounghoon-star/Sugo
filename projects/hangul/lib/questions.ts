/**
 * 스테이지 정의 → 실제 문제 목록 생성 (시드 난수로 테스트 가능).
 */
import type { StageDef } from "../data/curriculum";
import { CONSONANTS, VOWELS, isConsonant, isVowel } from "../data/jamo";
import { WORDS, matchKeyOf, type WordInfo } from "../data/words";
import { composeSyllable, decomposeSyllable, isSyllable } from "./hangul";

export interface BalloonQuestion {
  kind: "balloon";
  target: string;
  choices: string[];
  review?: boolean;
}

export interface BlockQuestion {
  kind: "block";
  consonant: string;
  vowel: string;
  result: string;
  missing: "consonant" | "vowel";
  choices: string[];
}

export interface MatchPair {
  wordId: string;
  word: string;
  emoji: string;
  answer: string;
}

export interface MatchQuestion {
  kind: "match";
  pairs: MatchPair[];
}

export type Question = BalloonQuestion | BlockQuestion | MatchQuestion;

export type Rng = () => number;

/** 작은 시드 난수 (mulberry32) */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const CHOICE_COUNT = 3;
const MATCH_PAIRS = 3;
/** 월드 1~2에서 다루는 자음 */
const PLAYABLE_CONSONANTS = CONSONANTS.slice(0, 8).map((c) => c.char);
const VOWEL_CHARS = VOWELS.map((v) => v.char);

/** 정답 + 다른 보기 (최대 CHOICE_COUNT개), 섞어서 */
function withChoices(answer: string, pool: readonly string[], rng: Rng): string[] {
  const others = shuffle(
    [...new Set(pool)].filter((c) => c !== answer),
    rng,
  ).slice(0, CHOICE_COUNT - 1);
  return shuffle([answer, ...others], rng);
}

/** 순서대로 골고루 꺼내 주는 큐 (다 쓰면 다시 섞음, 같은 것이 연달아 나오지 않게) */
function cycler<T>(items: readonly T[], rng: Rng): () => T {
  let queue: T[] = [];
  let last: T | undefined;
  return () => {
    if (queue.length === 0) {
      queue = shuffle(items, rng);
      if (queue.length > 1 && queue[0] === last) queue.push(queue.shift()!);
    }
    last = queue.shift()!;
    return last;
  };
}

/** 글자 종류에 맞는 비슷한 보기 후보 (복습 문제용) */
export function similarPool(item: string): string[] {
  if (isVowel(item)) return VOWEL_CHARS;
  if (isConsonant(item)) return PLAYABLE_CONSONANTS;
  const d = decomposeSyllable(item);
  if (d && !d.hasFinal) {
    const byVowel = VOWEL_CHARS.map((v) => composeSyllable(d.initial, v));
    const byConsonant = PLAYABLE_CONSONANTS.map((c) => composeSyllable(c, d.medial));
    return [...byVowel, ...byConsonant];
  }
  return [];
}

export function reviewQuestion(item: string, rng: Rng): BalloonQuestion {
  return {
    kind: "balloon",
    target: item,
    choices: withChoices(item, similarPool(item), rng),
    review: true,
  };
}

function blockCombos(stage: StageDef): Array<[string, string]> {
  const b = stage.blocks;
  if (!b) throw new Error(`${stage.id}: 블록 재료가 없음`);
  const combos = b.consonants.flatMap((c) => b.vowels.map((v) => [c, v] as [string, string]));
  // 이번 스테이지 글자(focus)가 들어간 조합을 우선
  const focused = combos.filter(([c, v]) => stage.focus.includes(c) || stage.focus.includes(v));
  return focused.length >= 2 ? focused : combos;
}

export function matchWords(stage: StageDef): WordInfo[] {
  const by = stage.matchBy ?? "vowel";
  return WORDS.filter((w) => {
    const key = matchKeyOf(w, by);
    return key !== null && stage.focus.includes(key);
  });
}

function makeMatch(stage: StageDef, nextWord: () => WordInfo): MatchQuestion {
  const by = stage.matchBy ?? "vowel";
  const pairs: MatchPair[] = [];
  const used = new Set<string>();
  // 정답 글자가 서로 다른 낱말 3개
  for (let guard = 0; pairs.length < MATCH_PAIRS && guard < 50; guard++) {
    const w = nextWord();
    const answer = matchKeyOf(w, by)!;
    if (used.has(answer)) continue;
    used.add(answer);
    pairs.push({ wordId: w.id, word: w.word, emoji: w.emoji, answer });
  }
  return { kind: "match", pairs };
}

export interface GenerateOptions {
  rng: Rng;
  /** 이번 세션에 복습할 글자 (앞쪽에 끼워 넣음) */
  reviewItems?: string[];
}

export function generateQuestions(stage: StageDef, opts: GenerateOptions): Question[] {
  const { rng } = opts;
  const questions: Question[] = (opts.reviewItems ?? []).map((item) => reviewQuestion(item, rng));

  const letterPool = [...stage.focus, ...(stage.distractors ?? [])];
  const nextFocus = cycler(stage.focus, rng);
  const combos = stage.blocks ? blockCombos(stage) : [];
  const nextCombo = combos.length ? cycler(combos, rng) : null;
  const words = stage.plan.includes("match") ? matchWords(stage) : [];
  const nextWord = words.length ? cycler(words, rng) : null;
  let blockCount = 0;

  for (const kind of stage.plan) {
    if (kind === "balloon") {
      if (stage.balloonSyllables && nextCombo) {
        const [c, v] = nextCombo();
        const target = composeSyllable(c, v);
        questions.push({ kind, target, choices: withChoices(target, similarPool(target), rng) });
      } else {
        const target = nextFocus();
        questions.push({ kind, target, choices: withChoices(target, letterPool, rng) });
      }
    } else if (kind === "block") {
      if (!nextCombo) throw new Error(`${stage.id}: 블록 재료가 없음`);
      const b = stage.blocks!;
      const [consonant, vowel] = nextCombo();
      const missing: BlockQuestion["missing"] =
        b.consonants.length === 1
          ? "vowel"
          : b.vowels.length === 1
            ? "consonant"
            : blockCount % 2 === 0
              ? "vowel"
              : "consonant";
      blockCount++;
      const answer = missing === "vowel" ? vowel : consonant;
      const pool =
        missing === "vowel"
          ? [...b.vowels, ...letterPool.filter(isVowel)]
          : [...b.consonants, ...letterPool.filter(isConsonant)];
      questions.push({
        kind,
        consonant,
        vowel,
        result: composeSyllable(consonant, vowel),
        missing,
        choices: withChoices(answer, pool, rng),
      });
    } else {
      if (!nextWord) throw new Error(`${stage.id}: 짝 맞추기 낱말이 없음`);
      questions.push(makeMatch(stage, nextWord));
    }
  }
  return questions;
}

/** 정답률 계산 단위: 짝 맞추기는 짝 하나가 1점 */
export function unitsOf(q: Question): number {
  return q.kind === "match" ? q.pairs.length : 1;
}

/** 이 문제에서 틀렸을 때 복습 목록에 넣을 글자 */
export function reviewKeyOf(q: BalloonQuestion | BlockQuestion): string {
  if (q.kind === "balloon") return q.target;
  return q.missing === "vowel" ? q.vowel : q.consonant;
}

/** 복습에 넣어도 되는 글자인지 (월드 1~2에서 들려줄 소리가 있는 것) */
export function isReviewable(item: string): boolean {
  if (isVowel(item)) return true;
  if (isConsonant(item)) return PLAYABLE_CONSONANTS.includes(item);
  if (isSyllable(item)) {
    const d = decomposeSyllable(item);
    return !!d && !d.hasFinal && PLAYABLE_CONSONANTS.includes(d.initial) && VOWEL_CHARS.includes(d.medial);
  }
  return false;
}
