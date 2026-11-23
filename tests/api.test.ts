/**
 * 진도/프로필/PIN API 테스트: 메모리 Postgres(PGlite)에 실제 마이그레이션을 적용하고
 * Next 라우트 핸들러를 그대로 호출한다.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import * as schema from "@/db/schema";
import { resetRateLimitForTests } from "@/lib/server/http";
import { resetPinLockForTests } from "@/lib/server/pin";
import { addPlayTime, createProgress, recordStageResult } from "@/projects/hangul/lib/progress";
import * as healthRoute from "@/app/api/health/route";
import * as profilesRoute from "@/app/api/profiles/route";
import * as profileRoute from "@/app/api/profiles/[id]/route";
import * as resetRoute from "@/app/api/profiles/[id]/reset/route";
import * as pinRoute from "@/app/api/parent/pin/route";
import * as verifyRoute from "@/app/api/parent/verify/route";
import * as progressRoute from "@/app/api/hangul/progress/[profileId]/route";

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = new PGlite();
  const d = drizzle(pg, { schema });
  await migrate(d, { migrationsFolder: "db/migrations" });
  db = d as unknown as Db;
  setDbForTests(db);
});

afterAll(async () => {
  setDbForTests(null);
  await pg.close();
});

beforeEach(async () => {
  resetRateLimitForTests();
  resetPinLockForTests();
  await pg.exec("delete from profiles; delete from settings;");
});

const BASE = "http://192.168.0.10:3000";

function req(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request(BASE + path, {
    method,
    headers: {
      host: "192.168.0.10:3000",
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === "string" ? body : JSON.stringify(body),
  });
}

const ctx = <T extends Record<string, string>>(params: T) => ({ params: Promise.resolve(params) }) as never;

async function createKid(nickname = "별이", avatar = "porong") {
  const res = await profilesRoute.POST(req("POST", "/api/profiles", { nickname, avatar }));
  expect(res.status).toBe(201);
  return (await res.json()).profile as { id: string; nickname: string; avatar: string };
}

async function setPin(pin = "2468") {
  const res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: pin }));
  expect(res.status).toBe(200);
}

function syncBody(progress = createProgress(), plays: unknown[] = [], epoch: number | null = 0) {
  return { progress, plays, epoch };
}

describe("health", () => {
  it("DB까지 확인한다", async () => {
    const res = await healthRoute.GET(req("GET", "/api/health"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe("요청 보호", () => {
  it("LAN 밖 도메인(DNS 리바인딩)과 다른 사이트 Origin은 거부", async () => {
    let res = await profilesRoute.GET(req("GET", "/api/profiles", undefined, { host: "evil.example.com" }));
    expect(res.status).toBe(403);
    res = await profilesRoute.POST(
      req("POST", "/api/profiles", { nickname: "a", avatar: "porong" }, { origin: "http://evil.example.com" }),
    );
    expect(res.status).toBe(403);
  });

  it("JSON이 아닌 쓰기 요청 거부 (CSRF)", async () => {
    const r = new Request(BASE + "/api/profiles", {
      method: "POST",
      headers: { host: "192.168.0.10:3000", "content-type": "text/plain" },
      body: JSON.stringify({ nickname: "a", avatar: "porong" }),
    });
    expect((await profilesRoute.POST(r)).status).toBe(415);
  });

  it("너무 큰 요청은 413", async () => {
    const res = await profilesRoute.POST(req("POST", "/api/profiles", "x".repeat(5000)));
    expect(res.status).toBe(413);
  });

  it("잘못된 입력은 400이고 내부 정보를 노출하지 않는다", async () => {
    for (const body of [
      { nickname: "", avatar: "porong" },
      { nickname: "a", avatar: "pikachu" },
      { nickname: "<script>", avatar: "porong" },
      { nickname: "a", avatar: "porong", extra: 1 },
    ]) {
      const res = await profilesRoute.POST(req("POST", "/api/profiles", body));
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "invalid_input" });
    }
    const bad = await progressRoute.GET(req("GET", "/api/hangul/progress/1;drop"), ctx({ profileId: "1;drop" }));
    expect(bad.status).toBe(400);
  });

  it("rate limit", async () => {
    let last = 200;
    for (let i = 0; i < 150; i++) last = (await profilesRoute.GET(req("GET", "/api/profiles"))).status;
    expect(last).toBe(429);
  });
});

describe("프로필", () => {
  it("만들고 목록에서 본다 (별명은 앞뒤 공백 제거)", async () => {
    await createKid("  별이  ", "dodam");
    const res = await profilesRoute.GET(req("GET", "/api/profiles"));
    const { profiles } = await res.json();
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({ nickname: "별이", avatar: "dodam" });
  });

  it("최대 10개", async () => {
    for (let i = 0; i < 10; i++) await createKid(`아이${i}`);
    const res = await profilesRoute.POST(req("POST", "/api/profiles", { nickname: "하나더", avatar: "porong" }));
    expect(res.status).toBe(409);
  });

  it("삭제/수정은 부모 PIN이 있어야 한다", async () => {
    const kid = await createKid();
    // PIN을 아직 안 만들었으면 409
    let res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "1234" }), ctx({ id: kid.id }));
    expect(res.status).toBe(409);
    await setPin("2468");
    res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "1111" }), ctx({ id: kid.id }));
    expect(res.status).toBe(403);
    res = await profileRoute.PATCH(
      req("PATCH", `/api/profiles/${kid.id}`, { nickname: "달이", pin: "2468" }),
      ctx({ id: kid.id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.nickname).toBe("달이");
    res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "2468" }), ctx({ id: kid.id }));
    expect(res.status).toBe(200);
    expect((await (await profilesRoute.GET(req("GET", "/api/profiles"))).json()).profiles).toEqual([]);
  });
});

describe("부모 PIN", () => {
  it("처음엔 만들고, 바꿀 때는 현재 PIN 필요, 해시로 저장", async () => {
    expect(await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).toEqual({ isSet: false });
    await setPin("2468");
    expect(await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).toEqual({ isSet: true });
    const stored = await pg.query<{ value: string }>("select value from settings where key = 'parent_pin'");
    expect(stored.rows[0].value).not.toContain("2468");

    let res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "1357" }));
    expect(res.status).toBe(403);
    res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "1357", currentPin: "2468" }));
    expect(res.status).toBe(200);
    expect((await verifyRoute.POST(req("POST", "/api/parent/verify", { pin: "1357" }))).status).toBe(200);
  });

  it("4~6자리 숫자만", async () => {
    for (const newPin of ["123", "1234567", "abcd"]) {
      expect((await pinRoute.POST(req("POST", "/api/parent/pin", { newPin }))).status).toBe(400);
    }
  });

  it("5번 틀리면 잠긴다 (맞는 PIN도 거부)", async () => {
    await setPin("2468");
    for (let i = 0; i < 5; i++) {
      expect((await verifyRoute.POST(req("POST", "/api/parent/verify", { pin: "0000" }))).status).toBe(403);
    }
    const res = await verifyRoute.POST(req("POST", "/api/parent/verify", { pin: "2468" }));
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "pin_locked" });
  });
});

describe("진도 동기화 API", () => {
  it("새 프로필은 빈 진도", async () => {
    const kid = await createKid();
    const res = await progressRoute.GET(req("GET", `/api/hangul/progress/${kid.id}`), ctx({ profileId: kid.id }));
    expect(await res.json()).toEqual({ progress: createProgress(), epoch: 0, replaced: false });
  });

  it("없는 프로필은 404", async () => {
    const id = "00000000-0000-4000-8000-000000000000";
    const res = await progressRoute.PUT(req("PUT", `/api/hangul/progress/${id}`, syncBody()), ctx({ profileId: id }));
    expect(res.status).toBe(404);
  });

  it("두 기기의 진도를 합치고, 같은 요청이 다시 와도 결과가 같다", async () => {
    const kid = await createKid();
    const day = new Date(2026, 10, 23, 10).getTime();
    const tablet = addPlayTime(recordStageResult(createProgress(), "w1-s1", 6, 6).progress, 120, day);
    const phone = recordStageResult(createProgress(), "w1-s1", 3, 6).progress;
    const play = { id: "11111111-1111-4111-8111-111111111111", stageId: "w1-s1", correct: 6, total: 6, stars: 3, playedAt: day };

    const put = (body: unknown) =>
      progressRoute.PUT(req("PUT", `/api/hangul/progress/${kid.id}`, body), ctx({ profileId: kid.id }));

    let res = await put(syncBody(tablet, [play]));
    expect(res.status).toBe(200);
    res = await put(syncBody(phone, []));
    const merged = (await res.json()).progress;
    expect(merged.stages["w1-s1"].bestStars).toBe(3);
    expect(merged.history["2026-11-23"]).toBe(120);

    // 같은 요청 반복 → 기록 중복 없음
    await put(syncBody(tablet, [play]));
    const plays = await pg.query("select * from hangul_plays");
    expect(plays.rows).toHaveLength(1);
    const days = await pg.query<{ seconds: number }>("select seconds from hangul_daily_time");
    expect(days.rows).toEqual([{ seconds: 120 }]);
  });

  it("검증: 없는 스테이지, 범위 밖 값, 잘못된 기록은 거부", async () => {
    const kid = await createKid();
    const put = (body: unknown) =>
      progressRoute.PUT(req("PUT", `/api/hangul/progress/${kid.id}`, body), ctx({ profileId: kid.id }));
    const p = createProgress();
    const bad = [
      syncBody({ ...p, stages: { "w9-s1": { bestStars: 3, bestAccuracy: 1, plays: 1 } } }),
      syncBody({ ...p, stages: { "w1-s1": { bestStars: 7, bestAccuracy: 1, plays: 1 } } }),
      syncBody({ ...p, daily: { date: "2026-11-23", seconds: 999999, dismissed: false } }),
      syncBody(p, [{ id: "not-a-uuid", stageId: "w1-s1", correct: 1, total: 1, stars: 3, playedAt: 1 }]),
      syncBody(p, [{ id: "11111111-1111-4111-8111-111111111111", stageId: "w1-s1", correct: 9, total: 1, stars: 3, playedAt: 1 }]),
      { progress: p, plays: [] },
    ];
    for (const body of bad) expect((await put(body)).status).toBe(400);
  });

  it("부모가 초기화하면 옛 캐시가 다시 올라오지 않는다", async () => {
    const kid = await createKid();
    await setPin("2468");
    const put = (body: unknown) =>
      progressRoute.PUT(req("PUT", `/api/hangul/progress/${kid.id}`, body), ctx({ profileId: kid.id }));
    const played = recordStageResult(createProgress(), "w1-s1", 6, 6).progress;
    await put(syncBody(played, [], 0));

    const reset = await resetRoute.POST(req("POST", `/api/profiles/${kid.id}/reset`, { pin: "2468" }), ctx({ id: kid.id }));
    expect(reset.status).toBe(200);

    // 초기화 전 epoch(0)를 가진 기기 → 합치지 않고 서버 진도로 교체하라는 응답
    const stale = await (await put(syncBody(played, [], 0))).json();
    expect(stale).toEqual({ progress: createProgress(), epoch: 1, replaced: true });
    // 새 epoch로 다시 오면 정상 동기화
    const fresh = await (await put(syncBody(createProgress(), [], 1))).json();
    expect(fresh.replaced).toBe(false);
    expect(fresh.progress.stages).toEqual({});
  });

  it("프로필을 지우면 학습 기록도 함께 지워진다", async () => {
    const kid = await createKid();
    await setPin("2468");
    const play = { id: "22222222-2222-4222-8222-222222222222", stageId: "w1-s1", correct: 6, total: 6, stars: 3, playedAt: 1 };
    await progressRoute.PUT(
      req("PUT", `/api/hangul/progress/${kid.id}`, syncBody(createProgress(), [play])),
      ctx({ profileId: kid.id }),
    );
    await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "2468" }), ctx({ id: kid.id }));
    expect((await pg.query("select * from hangul_plays")).rows).toHaveLength(0);
    expect((await pg.query("select * from hangul_progress")).rows).toHaveLength(0);
  });
});
