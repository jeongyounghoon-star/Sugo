import { describe, expect, it } from "vitest";
import { addPlayTime, createProgress, recordStageResult, touchSession, type Progress } from "../lib/progress";
import { STORAGE_KEY as LEGACY_KEY } from "../lib/storage";
import { appendOutbox, MAX_OUTBOX, mergeProgress, removeSent, uuidV4, type PlayEvent } from "../lib/sync";
import {
  applySyncResponse,
  emptyLocal,
  loadLocal,
  localKey,
  migrateLegacy,
  saveLocal,
  syncOnce,
  type FetchLike,
} from "../lib/syncClient";

class MemoryStorage {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const DAY1 = new Date(2026, 10, 23, 10).getTime();
const DAY2 = new Date(2026, 10, 24, 10).getTime();
const PID = "11111111-1111-4111-8111-111111111111";

function played(stage: string, correct: number, total: number, p = createProgress()): Progress {
  return recordStageResult(p, stage, correct, total).progress;
}

function event(n: number): PlayEvent {
  return { id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`, stageId: "w1-s1", correct: 6, total: 6, stars: 3, playedAt: n };
}

describe("mergeProgress", () => {
  it("별과 정답률은 줄지 않는다", () => {
    const a = played("w1-s1", 6, 6);
    const b = played("w1-s2", 6, 6, played("w1-s1", 2, 6));
    const m = mergeProgress(a, b);
    expect(m.stages["w1-s1"].bestStars).toBe(3);
    expect(m.stages["w1-s2"].bestStars).toBe(3);
  });

  it("멱등이고 순서와 무관 (복습 큐 제외)", () => {
    const a = addPlayTime(touchSession(played("w1-s1", 6, 6), DAY1), 300, DAY1);
    const b = addPlayTime(touchSession(played("w1-s2", 4, 6), DAY2), 200, DAY2);
    expect(mergeProgress(a, a)).toEqual(a);
    const ab = mergeProgress(a, b);
    const ba = mergeProgress(b, a);
    expect(ab.stages).toEqual(ba.stages);
    expect(ab.history).toEqual(ba.history);
    expect(ab.daily).toEqual(ba.daily);
    expect(ab.session).toEqual(ba.session);
    expect(mergeProgress(ab, b)).toEqual(ab);
  });

  it("날짜별 시간은 날짜마다 큰 값, 오늘 시간은 최신 날짜", () => {
    const a = addPlayTime(createProgress(), 300, DAY1);
    const b = addPlayTime(addPlayTime(createProgress(), 100, DAY1), 50, DAY2);
    const m = mergeProgress(a, b);
    expect(m.history).toEqual({ "2026-11-23": 300, "2026-11-24": 50 });
    expect(m.daily).toMatchObject({ date: "2026-11-24", seconds: 50 });
  });

  it("복습 큐는 최근에 활동한 쪽", () => {
    const old = { ...touchSession(createProgress(), DAY1), review: { ㅏ: { box: 0, due: 2 } } };
    const recent = { ...touchSession(createProgress(), DAY2), review: { ㅓ: { box: 0, due: 3 } } };
    expect(mergeProgress(old, recent).review).toEqual({ ㅓ: { box: 0, due: 3 } });
    expect(mergeProgress(recent, old).review).toEqual({ ㅓ: { box: 0, due: 3 } });
  });
});

describe("outbox", () => {
  it("보낸 것만 지우고 그 사이 새로 쌓인 건 남긴다", () => {
    const sent = [event(1), event(2)];
    expect(removeSent([event(1), event(2), event(3)], sent)).toEqual([event(3)]);
  });

  it("너무 많이 쌓이면 오래된 것부터 버린다", () => {
    let box: PlayEvent[] = [];
    for (let i = 0; i < MAX_OUTBOX + 5; i++) box = appendOutbox(box, event(i));
    expect(box).toHaveLength(MAX_OUTBOX);
    expect(box[0]).toEqual(event(5));
  });

  it("uuidV4 형식", () => {
    const id = uuidV4((a) => a.fill(0xab));
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });
});

describe("브라우저 캐시", () => {
  it("저장하고 다시 읽는다, 깨진 값은 빈 상태", () => {
    const s = new MemoryStorage();
    const state = { progress: played("w1-s1", 6, 6), epoch: 2, outbox: [event(1)] };
    saveLocal(s, PID, state);
    expect(loadLocal(s, PID)).toEqual(state);
    s.setItem(localKey(PID), "{broken");
    expect(loadLocal(s, PID)).toEqual(emptyLocal());
  });

  it("예전 localStorage 진도를 첫 프로필로 한 번만 옮긴다", () => {
    const s = new MemoryStorage();
    s.setItem(LEGACY_KEY, JSON.stringify(played("w1-s1", 6, 6)));
    expect(migrateLegacy(s, PID)).toBe(true);
    expect(loadLocal(s, PID).progress.stages["w1-s1"].bestStars).toBe(3);
    expect(s.getItem(LEGACY_KEY)).toBeNull();
    expect(migrateLegacy(s, "other")).toBe(false);
  });
});

describe("syncOnce", () => {
  function fakeServer() {
    let server = { progress: createProgress(), epoch: 0 };
    const calls: unknown[] = [];
    const fetchFn: FetchLike = async (_url, init) => {
      const body = JSON.parse(String(init.body));
      calls.push(body);
      if (body.epoch !== null && body.epoch !== server.epoch) {
        return Response.json({ progress: server.progress, epoch: server.epoch, replaced: true });
      }
      server = { ...server, progress: mergeProgress(server.progress, body.progress) };
      return Response.json({ progress: server.progress, epoch: server.epoch, replaced: false });
    };
    return {
      fetchFn,
      calls,
      get state() {
        return server;
      },
      reset() {
        server = { progress: createProgress(), epoch: server.epoch + 1 };
      },
    };
  }

  it("오프라인이면 로컬은 그대로, 연결되면 보내고 outbox 비움", async () => {
    const s = new MemoryStorage();
    saveLocal(s, PID, { progress: played("w1-s1", 6, 6), epoch: null, outbox: [event(1)] });
    const offline: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    expect(await syncOnce(s, offline, PID)).toBe("offline");
    expect(loadLocal(s, PID).outbox).toHaveLength(1);

    const server = fakeServer();
    expect(await syncOnce(s, server.fetchFn, PID)).toBe("ok");
    expect(server.state.progress.stages["w1-s1"].bestStars).toBe(3);
    expect(loadLocal(s, PID)).toMatchObject({ epoch: 0, outbox: [] });
  });

  it("서버 오류(500)도 오프라인처럼 다루고 데이터를 잃지 않는다", async () => {
    const s = new MemoryStorage();
    saveLocal(s, PID, { progress: played("w1-s1", 6, 6), epoch: 0, outbox: [event(1)] });
    const broken: FetchLike = async () => Response.json({ error: "server_error" }, { status: 500 });
    expect(await syncOnce(s, broken, PID)).toBe("offline");
    expect(loadLocal(s, PID).outbox).toHaveLength(1);
  });

  it("요청 중에 새로 쌓인 진도는 지우지 않는다", async () => {
    const s = new MemoryStorage();
    saveLocal(s, PID, { progress: played("w1-s1", 6, 6), epoch: 0, outbox: [event(1)] });
    const slow: FetchLike = async (_u, init) => {
      // 요청이 가는 동안 아이가 한 판 더 함
      const now = loadLocal(s, PID);
      saveLocal(s, PID, { ...now, progress: played("w1-s2", 6, 6, now.progress), outbox: [...now.outbox, event(2)] });
      const body = JSON.parse(String(init.body));
      return Response.json({ progress: body.progress, epoch: 0, replaced: false });
    };
    await syncOnce(s, slow, PID);
    const after = loadLocal(s, PID);
    expect(after.progress.stages["w1-s2"].bestStars).toBe(3);
    expect(after.outbox).toEqual([event(2)]);
  });

  it("부모가 초기화했으면 로컬을 서버 것으로 바꾼다", async () => {
    const s = new MemoryStorage();
    const server = fakeServer();
    saveLocal(s, PID, { progress: played("w1-s1", 6, 6), epoch: null, outbox: [] });
    await syncOnce(s, server.fetchFn, PID);
    server.reset();
    expect(await syncOnce(s, server.fetchFn, PID)).toBe("replaced");
    expect(loadLocal(s, PID)).toEqual({ progress: createProgress(), epoch: 1, outbox: [] });
  });

  it("프로필이 지워졌으면 gone", async () => {
    const s = new MemoryStorage();
    const gone: FetchLike = async () => Response.json({ error: "not_found" }, { status: 404 });
    expect(await syncOnce(s, gone, PID)).toBe("gone");
  });

  it("applySyncResponse: 서버 결과와 현재 로컬을 합친다", () => {
    const now = { progress: played("w1-s2", 6, 6), epoch: 0, outbox: [event(1), event(2)] };
    const res = { progress: played("w1-s1", 6, 6), epoch: 0, replaced: false };
    const next = applySyncResponse(now, [event(1)], res);
    expect(Object.keys(next.progress.stages).sort()).toEqual(["w1-s1", "w1-s2"]);
    expect(next.outbox).toEqual([event(2)]);
  });
});
