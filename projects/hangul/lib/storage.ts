/**
 * 진도를 localStorage에 저장/불러오기 (로그인 없음).
 * Storage 객체를 인자로 받아서 테스트에서 가짜 저장소를 쓸 수 있다.
 */
import { createProgress, type Progress } from "./progress";

export const STORAGE_KEY = "sugo.hangul.progress.v1";

type StorageLike = Pick<Storage, "getItem" | "setItem">;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** 깨졌거나 예전 형식이면 기본값으로 채운다 */
export function parseProgress(raw: string | null): Progress {
  const base = createProgress();
  if (!raw) return base;
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObject(data) || data.version !== 1) return base;
    const session = isObject(data.session) ? data.session : {};
    const daily = isObject(data.daily) ? data.daily : {};
    return {
      version: 1,
      stages: isObject(data.stages) ? (data.stages as Progress["stages"]) : {},
      review: isObject(data.review) ? (data.review as Progress["review"]) : {},
      session: {
        index: typeof session.index === "number" ? session.index : 0,
        lastActive:
          typeof session.lastActive === "number" ? session.lastActive : null,
      },
      daily: {
        date: typeof daily.date === "string" ? daily.date : "",
        seconds: typeof daily.seconds === "number" ? daily.seconds : 0,
        dismissed: daily.dismissed === true,
      },
    };
  } catch {
    return base;
  }
}

export function loadProgress(storage: StorageLike): Progress {
  try {
    return parseProgress(storage.getItem(STORAGE_KEY));
  } catch {
    return createProgress();
  }
}

export function saveProgress(storage: StorageLike, p: Progress): void {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    // 사생활 보호 모드 등에서 저장 실패 → 조용히 무시 (게임은 계속 진행)
  }
}
