import { describe, expect, it } from "vitest";
import { WORLDS } from "../data/curriculum";
import {
  DAILY_LIMIT_SECONDS,
  addPlayTime,
  createProgress,
  currentStageOf,
  dismissDaily,
  earnedStickers,
  isDailyDone,
  isStageUnlocked,
  isWorldUnlocked,
  petStageFor,
  recordStageResult,
  starsFor,
  touchSession,
  type Progress,
} from "../lib/progress";
import { dueItems, recordAnswer } from "../lib/review";
import { STORAGE_KEY, loadProgress, parseProgress, saveProgress } from "../lib/storage";

function passAll(p: Progress, worldIndex: number): Progress {
  let next = p;
  for (const s of WORLDS[worldIndex].stages) {
    next = recordStageResult(next, s.id, 10, 10).progress;
  }
  return next;
}

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
}

describe("별과 통과 기준", () => {
  it("정답률 80% 이상이면 별 3개", () => {
    expect(starsFor(1)).toBe(3);
    expect(starsFor(0.8)).toBe(3);
    expect(starsFor(0.79)).toBe(2);
    expect(starsFor(0.5)).toBe(2);
    expect(starsFor(0.2)).toBe(1);
    expect(starsFor(0)).toBe(1);
  });

  it("80% 미만이면 다음 스테이지는 잠긴 채로, 다시 하면 최고 기록 유지", () => {
    let p = createProgress();
    p = recordStageResult(p, "w1-s1", 4, 6).progress; // 67%
    expect(p.stages["w1-s1"].bestStars).toBe(2);
    expect(isStageUnlocked(p, "w1-s2")).toBe(false);

    const r = recordStageResult(p, "w1-s1", 5, 6); // 83%
    expect(r.stars).toBe(3);
    expect(r.newSticker).toBe(true);
    expect(isStageUnlocked(r.progress, "w1-s2")).toBe(true);

    const again = recordStageResult(r.progress, "w1-s1", 1, 6);
    expect(again.progress.stages["w1-s1"].bestStars).toBe(3);
    expect(again.progress.stages["w1-s1"].plays).toBe(3);
    expect(again.newSticker).toBe(false);
  });
});

describe("잠금 해제", () => {
  it("처음에는 월드 1의 첫 스테이지만 열려 있다", () => {
    const p = createProgress();
    expect(isWorldUnlocked(p, 1)).toBe(true);
    expect(isWorldUnlocked(p, 2)).toBe(false);
    expect(isStageUnlocked(p, "w1-s1")).toBe(true);
    expect(isStageUnlocked(p, "w1-s2")).toBe(false);
    expect(isStageUnlocked(p, "w2-s1")).toBe(false);
    expect(currentStageOf(p, WORLDS[0])).toBe("w1-s1");
  });

  it("월드 1을 다 깨면 월드 2가 열린다", () => {
    const p = passAll(createProgress(), 0);
    expect(isWorldUnlocked(p, 2)).toBe(true);
    expect(isStageUnlocked(p, "w2-s1")).toBe(true);
    expect(isStageUnlocked(p, "w2-s2")).toBe(false);
  });

  it("월드 3~8은 MVP에서 항상 잠김", () => {
    const p = passAll(passAll(createProgress(), 0), 1);
    for (const id of [3, 4, 5, 6, 7, 8]) expect(isWorldUnlocked(p, id)).toBe(false);
    expect(isStageUnlocked(p, "w3-s1")).toBe(false);
  });

  it("없는 스테이지는 잠김", () => {
    expect(isStageUnlocked(createProgress(), "nope")).toBe(false);
  });
});

describe("펫과 스티커", () => {
  it("알 → 아기(첫 통과) → 진화(월드 클리어)", () => {
    let p = createProgress();
    const world = WORLDS[0];
    expect(petStageFor(p, world)).toBe(1);
    expect(petStageFor(p, WORLDS[1])).toBe(0);

    const first = recordStageResult(p, "w1-s1", 6, 6);
    expect(first.petHatched).toBe(true);
    p = first.progress;
    expect(petStageFor(p, world)).toBe(2);

    for (const s of world.stages.slice(1, -1)) p = recordStageResult(p, s.id, 6, 6).progress;
    const last = recordStageResult(p, world.stages.at(-1)!.id, 6, 6);
    expect(last.worldCleared).toBe(true);
    expect(petStageFor(last.progress, world)).toBe(3);
    expect(earnedStickers(last.progress)).toHaveLength(world.stages.length);
  });
});

describe("복습 (간격 반복)", () => {
  it("틀린 글자는 다음 세션에 나온다", () => {
    let r = recordAnswer({}, "ㅓ", false, 1);
    expect(dueItems(r, 1)).toEqual([]);
    expect(dueItems(r, 2)).toEqual(["ㅓ"]);
    // 다음 세션에 맞히면 간격이 늘어난다
    r = recordAnswer(r, "ㅓ", true, 2);
    expect(r["ㅓ"]).toEqual({ box: 1, due: 4 });
    expect(dueItems(r, 3)).toEqual([]);
    r = recordAnswer(r, "ㅓ", true, 4);
    expect(r["ㅓ"]).toEqual({ box: 2, due: 8 });
    r = recordAnswer(r, "ㅓ", true, 8);
    expect(r["ㅓ"]).toBeUndefined();
  });

  it("복습 중에 또 틀리면 처음부터", () => {
    let r = recordAnswer({}, "ㄱ", false, 1);
    r = recordAnswer(r, "ㄱ", true, 2);
    r = recordAnswer(r, "ㄱ", false, 4);
    expect(r["ㄱ"]).toEqual({ box: 0, due: 5 });
  });

  it("처음부터 맞힌 글자는 추적하지 않고, 같은 세션의 재도전은 무시", () => {
    expect(recordAnswer({}, "ㅏ", true, 1)).toEqual({});
    const r = recordAnswer({}, "ㅏ", false, 1);
    expect(recordAnswer(r, "ㅏ", true, 1)).toEqual(r);
  });

  it("한 스테이지에 최대 2개, 오래된 것부터", () => {
    const r = { a: { box: 0, due: 3 }, b: { box: 0, due: 1 }, c: { box: 0, due: 2 } };
    expect(dueItems(r, 5)).toEqual(["b", "c"]);
    expect(dueItems(r, 5, (x) => x !== "b")).toEqual(["c", "a"]);
  });
});

describe("세션과 하루 10분", () => {
  const day1 = new Date(2026, 0, 5, 10, 0).getTime();

  it("30분 이상 쉬거나 날짜가 바뀌면 새 세션", () => {
    let p = touchSession(createProgress(), day1);
    expect(p.session.index).toBe(1);
    p = touchSession(p, day1 + 10 * 60 * 1000);
    expect(p.session.index).toBe(1);
    p = touchSession(p, day1 + 50 * 60 * 1000);
    expect(p.session.index).toBe(2);
    p = touchSession(p, new Date(2026, 0, 6, 9, 0).getTime());
    expect(p.session.index).toBe(3);
  });

  it("10분이 지나면 오늘 끝, 다음 날이면 초기화", () => {
    let p = addPlayTime(createProgress(), DAILY_LIMIT_SECONDS - 5, day1);
    expect(isDailyDone(p, day1)).toBe(false);
    p = addPlayTime(p, 5, day1);
    expect(isDailyDone(p, day1)).toBe(true);
    const tomorrow = new Date(2026, 0, 6, 9, 0).getTime();
    expect(isDailyDone(p, tomorrow)).toBe(false);
    p = dismissDaily(p, day1);
    expect(isDailyDone(p, day1)).toBe(false);
  });
});

describe("저장/불러오기", () => {
  it("저장한 진도를 그대로 불러온다", () => {
    const storage = new MemoryStorage();
    const p = recordStageResult(createProgress(), "w1-s1", 6, 6).progress;
    saveProgress(storage, p);
    expect(storage.data.has(STORAGE_KEY)).toBe(true);
    expect(loadProgress(storage)).toEqual(p);
  });

  it("깨진 데이터나 다른 버전은 새 진도로", () => {
    expect(parseProgress("{not json")).toEqual(createProgress());
    expect(parseProgress(JSON.stringify({ version: 99 }))).toEqual(createProgress());
    expect(parseProgress(null)).toEqual(createProgress());
  });

  it("저장소가 예외를 던져도 게임은 계속된다", () => {
    const broken = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    expect(loadProgress(broken)).toEqual(createProgress());
    expect(() => saveProgress(broken, createProgress())).not.toThrow();
  });
});
