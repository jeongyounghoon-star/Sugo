/**
 * 진도 상태와 잠금 해제 규칙 (순수 함수, localStorage와 분리해 테스트 가능).
 */
import { WORLDS, getStage, getWorld, type WorldDef } from "../data/curriculum";
import type { PetStage } from "../data/pets";
import { emptyReview, type ReviewState } from "./review";

export const PASS_ACCURACY = 0.8;
export const DAILY_LIMIT_SECONDS = 10 * 60;
/** 이만큼 쉬었다 오면 새 세션으로 본다 (복습 출제 기준) */
export const SESSION_GAP_MS = 30 * 60 * 1000;

export interface StageRecord {
  bestStars: number;
  bestAccuracy: number;
  plays: number;
}

export interface Progress {
  version: 1;
  stages: Record<string, StageRecord>;
  review: ReviewState;
  session: { index: number; lastActive: number | null };
  daily: { date: string; seconds: number; dismissed: boolean };
}

export function createProgress(): Progress {
  return {
    version: 1,
    stages: {},
    review: emptyReview(),
    session: { index: 0, lastActive: null },
    daily: { date: "", seconds: 0, dismissed: false },
  };
}

/** 정답률 → 별 (80% 이상이면 3개, 다 해냈으면 최소 1개) */
export function starsFor(accuracy: number): number {
  if (accuracy >= PASS_ACCURACY) return 3;
  if (accuracy >= 0.5) return 2;
  return 1;
}

export function isStagePassed(p: Progress, stageId: string): boolean {
  return (p.stages[stageId]?.bestStars ?? 0) >= 3;
}

export function isWorldCleared(p: Progress, world: WorldDef): boolean {
  return world.stages.every((s) => isStagePassed(p, s.id));
}

export function isWorldUnlocked(p: Progress, worldId: number): boolean {
  const world = getWorld(worldId);
  if (!world || !world.playable) return false;
  const index = WORLDS.indexOf(world);
  if (index === 0) return true;
  return isWorldCleared(p, WORLDS[index - 1]);
}

export function isStageUnlocked(p: Progress, stageId: string): boolean {
  const stage = getStage(stageId);
  if (!stage) return false;
  if (!isWorldUnlocked(p, stage.worldId)) return false;
  if (stage.order === 1) return true;
  const world = getWorld(stage.worldId)!;
  const prev = world.stages[stage.order - 2];
  return isStagePassed(p, prev.id);
}

/** 월드에서 지금 해야 할 스테이지 (안 깬 첫 스테이지). 다 깼으면 undefined */
export function currentStageOf(p: Progress, world: WorldDef): string | undefined {
  return world.stages.find((s) => !isStagePassed(p, s.id))?.id;
}

export interface StageResult {
  progress: Progress;
  stars: number;
  /** 이번에 처음 별 3개를 받아 스티커를 얻었는지 */
  newSticker: boolean;
  /** 이번 결과로 아기 펫이 태어났는지 (월드 첫 통과) */
  petHatched: boolean;
  /** 이번 결과로 월드를 모두 깨서 펫이 진화했는지 */
  worldCleared: boolean;
}

export function recordStageResult(
  p: Progress,
  stageId: string,
  correct: number,
  total: number,
): StageResult {
  const stage = getStage(stageId);
  if (!stage) throw new Error(`없는 스테이지: ${stageId}`);
  const world = getWorld(stage.worldId)!;
  const accuracy = total > 0 ? correct / total : 0;
  const stars = starsFor(accuracy);
  const prev = p.stages[stageId];
  const wasPassed = isStagePassed(p, stageId);
  const petBefore = petStageFor(p, world);
  const next: Progress = {
    ...p,
    stages: {
      ...p.stages,
      [stageId]: {
        bestStars: Math.max(prev?.bestStars ?? 0, stars),
        bestAccuracy: Math.max(prev?.bestAccuracy ?? 0, accuracy),
        plays: (prev?.plays ?? 0) + 1,
      },
    },
  };
  const petAfter = petStageFor(next, world);
  return {
    progress: next,
    stars,
    newSticker: !wasPassed && stars >= 3,
    petHatched: petBefore < 2 && petAfter === 2,
    worldCleared: petBefore < 3 && petAfter === 3,
  };
}

/** 펫 단계: 월드 잠김 0 / 알 1 / 스테이지 1개 이상 통과 2 / 월드 클리어 3 */
export function petStageFor(p: Progress, world: WorldDef): PetStage {
  if (!isWorldUnlocked(p, world.id)) return 0;
  if (isWorldCleared(p, world)) return 3;
  if (world.stages.some((s) => isStagePassed(p, s.id))) return 2;
  return 1;
}

/** 스티커 = 별 3개로 통과한 스테이지 */
export function earnedStickers(p: Progress): string[] {
  return WORLDS.flatMap((w) => w.stages)
    .filter((s) => isStagePassed(p, s.id))
    .map((s) => s.id);
}

// ---------- 세션 / 하루 사용 시간 ----------

export function localDateKey(now: number): string {
  const d = new Date(now);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** 앱을 열거나 활동할 때 호출. 날짜가 바뀌었거나 30분 이상 쉬었으면 새 세션. */
export function touchSession(p: Progress, now: number): Progress {
  const last = p.session.lastActive;
  const isNew =
    last === null ||
    localDateKey(last) !== localDateKey(now) ||
    now - last > SESSION_GAP_MS;
  return {
    ...p,
    session: {
      index: isNew ? p.session.index + 1 : p.session.index,
      lastActive: now,
    },
  };
}

function dailyFor(p: Progress, now: number): Progress["daily"] {
  const today = localDateKey(now);
  return p.daily.date === today
    ? p.daily
    : { date: today, seconds: 0, dismissed: false };
}

export function addPlayTime(p: Progress, seconds: number, now: number): Progress {
  const daily = dailyFor(p, now);
  return { ...p, daily: { ...daily, seconds: daily.seconds + seconds } };
}

/** 오늘 10분을 넘겼고 아직 "더 하기"를 누르지 않았으면 true */
export function isDailyDone(p: Progress, now: number): boolean {
  const daily = dailyFor(p, now);
  return daily.seconds >= DAILY_LIMIT_SECONDS && !daily.dismissed;
}

export function dismissDaily(p: Progress, now: number): Progress {
  return { ...p, daily: { ...dailyFor(p, now), dismissed: true } };
}

/**
 * 화면에서 쓰는 "오늘 끝" 판단. 날짜 초기화는 HangulShell이 들어올 때
 * addPlayTime(p, 0, now)로 해 두므로 여기서는 현재 값만 본다.
 */
export function shouldShowDailyDone(p: Progress): boolean {
  return p.daily.seconds >= DAILY_LIMIT_SECONDS && !p.daily.dismissed;
}
