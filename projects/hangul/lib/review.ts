/**
 * 간단한 간격 반복 (Leitner 방식).
 * - 틀린 글자는 상자 0으로, 다음 세션에 다시 나온다.
 * - 복습에서 맞히면 상자가 올라가고 1 → 2 → 4 세션 뒤에 다시 나온다.
 * - 상자 3을 넘기면 다 익힌 것으로 보고 목록에서 뺀다.
 */

export interface ReviewItem {
  box: number;
  /** 이 세션 번호 이상이 되면 출제 */
  due: number;
}

export type ReviewState = Record<string, ReviewItem>;

export const REVIEW_INTERVALS = [1, 2, 4];
export const MAX_REVIEW_PER_STAGE = 2;

export function emptyReview(): ReviewState {
  return {};
}

export function recordAnswer(
  state: ReviewState,
  item: string,
  correctFirstTry: boolean,
  session: number,
): ReviewState {
  const current = state[item];
  if (!correctFirstTry) {
    return { ...state, [item]: { box: 0, due: session + REVIEW_INTERVALS[0] } };
  }
  if (!current) return state; // 처음부터 맞힌 글자는 추적하지 않는다
  // 아직 복습 날이 아닌데 맞혔으면 (같은 세션 재도전 등) 그대로 둔다
  if (session < current.due) return state;
  const box = current.box + 1;
  if (box >= REVIEW_INTERVALS.length) {
    const rest = { ...state };
    delete rest[item];
    return rest;
  }
  return { ...state, [item]: { box, due: session + REVIEW_INTERVALS[box] } };
}

/** 이번 세션에 복습할 글자 (오래 기다린 것부터) */
export function dueItems(
  state: ReviewState,
  session: number,
  allowed?: (item: string) => boolean,
  max = MAX_REVIEW_PER_STAGE,
): string[] {
  return Object.entries(state)
    .filter(([item, r]) => r.due <= session && (!allowed || allowed(item)))
    .sort((a, b) => a[1].due - b[1].due || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([item]) => item);
}
