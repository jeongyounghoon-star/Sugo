/**
 * 진도/프로필/PIN API 테스트: 메모리 Postgres(PGlite)에 실제 마이그레이션을 적용하고
 * Next 라우트 핸들러를 그대로 호출한다.
 */
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests, type Db } from "@/db/client";
import * as schema from "@/db/schema";
import { isAllowedHost, resetRateLimitForTests } from "@/lib/server/http";
import { LOCK_STEPS_MS, MAX_ATTEMPTS, nextLockState } from "@/lib/server/pin";
import { addPlayTime, createProgress, recordStageResult } from "@/projects/hangul/lib/progress";
import { MAX_PLAYS_PER_PROFILE } from "@/projects/hangul/server/progressRepo";
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
  await pg.exec("delete from profiles; delete from settings;");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
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

async function setPin(pin = "246813") {
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

  it("Host 형식 검사 (IP 리터럴만 엄격하게)", () => {
    for (const h of ["192.168.0.10:3000", "localhost:3000", "[::1]:3000", "[fe80::1]", "my-pc.local:3000", "10.0.0.2"]) {
      expect(isAllowedHost(h, ""), h).toBe(true);
    }
    for (const h of ["evil.com:1:2", "evil.com", "[evil.com]:3000", "[::1]x", "1.2.3.4:abc", "999.1.1.1", ":3000", ""]) {
      expect(isAllowedHost(h, ""), h).toBe(false);
    }
    expect(isAllowedHost("sugo.home:3000", "sugo.home")).toBe(true);
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
    let res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "123456" }), ctx({ id: kid.id }));
    expect(res.status).toBe(409);
    await setPin("246813");
    res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "111111" }), ctx({ id: kid.id }));
    expect(res.status).toBe(403);
    res = await profileRoute.PATCH(
      req("PATCH", `/api/profiles/${kid.id}`, { nickname: "달이", pin: "246813" }),
      ctx({ id: kid.id }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).profile.nickname).toBe("달이");
    res = await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "246813" }), ctx({ id: kid.id }));
    expect(res.status).toBe(200);
    expect((await (await profilesRoute.GET(req("GET", "/api/profiles"))).json()).profiles).toEqual([]);
  });
});

describe("부모 PIN", () => {
  const verify = (pin: string) => verifyRoute.POST(req("POST", "/api/parent/verify", { pin }));

  it("처음엔 만들고, 바꿀 때는 현재 PIN 필요, 해시로 저장", async () => {
    expect(await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).toEqual({
      isSet: false,
      setupCodeRequired: false,
    });
    await setPin("246813");
    expect((await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).isSet).toBe(true);
    const stored = await pg.query<{ value: string }>("select value from settings where key = 'parent_pin'");
    expect(stored.rows[0].value).not.toContain("246813");

    let res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "135790" }));
    expect(res.status).toBe(403);
    res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "135790", currentPin: "246813" }));
    expect(res.status).toBe(200);
    expect((await verify("135790")).status).toBe(200);
  });

  it("숫자 6~10자리만 (4자리 PIN은 거부)", async () => {
    for (const newPin of ["1234", "12345", "12345678901", "abcdef", "12 456"]) {
      expect((await pinRoute.POST(req("POST", "/api/parent/pin", { newPin }))).status).toBe(400);
    }
    expect((await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "1234567890" }))).status).toBe(200);
  });

  it("처음 PIN은 하나만 (동시에 만들어도 나중 것은 409)", async () => {
    const results = await Promise.all(
      ["111111", "222222", "333333"].map((newPin) => pinRoute.POST(req("POST", "/api/parent/pin", { newPin }))),
    );
    expect(results.map((r) => r.status).sort()).toEqual([200, 409, 409]);
  });

  it("5번 틀리면 잠긴다 (맞는 PIN도 거부)", async () => {
    await setPin("246813");
    for (let i = 0; i < MAX_ATTEMPTS; i++) expect((await verify("000000")).status).toBe(403);
    const res = await verify("246813");
    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "pin_locked" });
  });

  // 리뷰 B1 재현: 동시에 120개를 보내면 예전에는 잠금 검사를 모두 통과해 119×403 + 1×200 이 나왔다
  it("동시에 120개를 보내도 정확히 5번만 검증되고 나머지는 429 (정답 PIN이 섞여 있어도 200 없음)", async () => {
    await setPin("000119");
    const pins = Array.from({ length: 120 }, (_, i) => String(i).padStart(6, "0"));
    const statuses = (await Promise.all(pins.map((p) => verify(p)))).map((r) => r.status);
    const count = (s: number) => statuses.filter((x) => x === s).length;
    expect(count(403)).toBe(MAX_ATTEMPTS);
    expect(count(429)).toBe(120 - MAX_ATTEMPTS);
    expect(count(200)).toBe(0);
  });

  it("잠금은 DB에 저장되어 서버를 다시 켜도 유지되고, 풀린 뒤 맞히면 처음으로", async () => {
    await setPin("246813");
    for (let i = 0; i < MAX_ATTEMPTS; i++) await verify("000000");
    const row = await pg.query<{ value: string }>("select value from settings where key = 'parent_pin_lock'");
    expect(JSON.parse(row.rows[0].value).lockedUntil).toBeGreaterThan(Date.now());
    // 잠금 시간이 지나면 다시 시도할 수 있다
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + LOCK_STEPS_MS[0] + 1000);
    expect((await verify("246813")).status).toBe(200);
    const cleared = await pg.query<{ value: string }>("select value from settings where key = 'parent_pin_lock'");
    expect(JSON.parse(cleared.rows[0].value)).toMatchObject({ attempts: 0, level: 0, lockedUntil: 0 });
  });

  it("잠금 시간은 점점 길어진다 (10분 → 30분 → 2시간 → 6시간 → 24시간)", () => {
    let s = { attempts: 0, lastAttemptAt: 0, lockedUntil: 0, level: 0 };
    let now = 1_000_000_000_000;
    const durations: number[] = [];
    for (let round = 0; round < 6; round++) {
      for (let i = 0; i < MAX_ATTEMPTS; i++) s = nextLockState(s, now)!;
      durations.push(s.lockedUntil - now);
      expect(nextLockState(s, now + 1)).toBeNull(); // 잠긴 동안은 기록조차 안 됨
      now = s.lockedUntil; // 풀리자마자 다시
    }
    expect(durations).toEqual([...LOCK_STEPS_MS, LOCK_STEPS_MS[4]]);
  });

  it("설치 코드(SETUP_CODE)가 있으면 처음 PIN을 만들 때 필요하다", async () => {
    vi.stubEnv("SETUP_CODE", "73019248");
    expect(await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).toEqual({
      isSet: false,
      setupCodeRequired: true,
    });
    let res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "246813" }));
    expect(res.status).toBe(403);
    res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "246813", setupCode: "00000000" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "wrong_setup_code" });
    res = await pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "246813", setupCode: "73019248" }));
    expect(res.status).toBe(200);
    // 만든 뒤에는 설치 코드가 필요 없다
    expect((await (await pinRoute.GET(req("GET", "/api/parent/pin"))).json()).setupCodeRequired).toBe(false);
  });

  it("설치 코드 무차별 대입도 같은 잠금에 걸린다", async () => {
    vi.stubEnv("SETUP_CODE", "73019248");
    const tries = Array.from({ length: 30 }, (_, i) =>
      pinRoute.POST(req("POST", "/api/parent/pin", { newPin: "246813", setupCode: String(i).padStart(8, "0") })),
    );
    const statuses = (await Promise.all(tries)).map((r) => r.status);
    expect(statuses.filter((s) => s === 403)).toHaveLength(MAX_ATTEMPTS);
    expect(statuses.filter((s) => s === 429)).toHaveLength(30 - MAX_ATTEMPTS);
  });

  it("PIN_PEPPER: DB에 있는 해시만으로는 확인할 수 없다", async () => {
    vi.stubEnv("PIN_PEPPER", "a".repeat(64));
    await setPin("246813");
    expect((await verify("246813")).status).toBe(200);
    const stored = JSON.parse(
      (await pg.query<{ value: string }>("select value from settings where key = 'parent_pin'")).rows[0].value,
    );
    expect(stored).toMatchObject({ v: 2, pep: true });
    // 다른 페퍼(= DB만 훔쳐 간 경우)로는 맞는 PIN도 통과하지 않는다
    vi.stubEnv("PIN_PEPPER", "b".repeat(64));
    expect((await verify("246813")).status).toBe(403);
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
      // 없는 날짜 / 아주 먼 날짜로 행을 무한히 늘리지 못하게 (리뷰 L2)
      syncBody({ ...p, history: { "9999-99-99": 10 } }),
      syncBody({ ...p, history: { "2026-02-30": 10 } }),
      syncBody({ ...p, history: { "1999-01-01": 10 } }),
      syncBody({ ...p, history: { "2999-01-01": 10 } }),
    ];
    for (const body of bad) expect((await put(body)).status).toBe(400);
  });

  it("플레이 기록은 프로필당 최근 MAX_PLAYS_PER_PROFILE 개만 남긴다", async () => {
    const kid = await createKid();
    await pg.query(
      `insert into hangul_plays (profile_id, id, stage_id, correct, total, stars, played_at)
       select $1, gen_random_uuid(), 'w1-s1', 1, 1, 3, now() - (g || ' minutes')::interval
       from generate_series(1, $2::int) g`,
      [kid.id, MAX_PLAYS_PER_PROFILE + 50],
    );
    const play = { id: "22222222-2222-4222-8222-222222222222", stageId: "w1-s1", correct: 6, total: 6, stars: 3, playedAt: Date.now() };
    const res = await progressRoute.PUT(
      req("PUT", `/api/hangul/progress/${kid.id}`, syncBody(createProgress(), [play])),
      ctx({ profileId: kid.id }),
    );
    expect(res.status).toBe(200);
    const rows = await pg.query<{ n: number; newest: number }>(
      `select count(*)::int n, count(*) filter (where id = '22222222-2222-4222-8222-222222222222')::int newest
       from hangul_plays where profile_id = $1`,
      [kid.id],
    );
    expect(rows.rows[0]).toEqual({ n: MAX_PLAYS_PER_PROFILE, newest: 1 });
  });

  it("부모가 초기화하면 옛 캐시가 다시 올라오지 않는다", async () => {
    const kid = await createKid();
    await setPin("246813");
    const put = (body: unknown) =>
      progressRoute.PUT(req("PUT", `/api/hangul/progress/${kid.id}`, body), ctx({ profileId: kid.id }));
    const played = recordStageResult(createProgress(), "w1-s1", 6, 6).progress;
    await put(syncBody(played, [], 0));

    const reset = await resetRoute.POST(req("POST", `/api/profiles/${kid.id}/reset`, { pin: "246813" }), ctx({ id: kid.id }));
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
    await setPin("246813");
    const play = { id: "22222222-2222-4222-8222-222222222222", stageId: "w1-s1", correct: 6, total: 6, stars: 3, playedAt: 1 };
    await progressRoute.PUT(
      req("PUT", `/api/hangul/progress/${kid.id}`, syncBody(createProgress(), [play])),
      ctx({ profileId: kid.id }),
    );
    await profileRoute.DELETE(req("DELETE", `/api/profiles/${kid.id}`, { pin: "246813" }), ctx({ id: kid.id }));
    expect((await pg.query("select * from hangul_plays")).rows).toHaveLength(0);
    expect((await pg.query("select * from hangul_progress")).rows).toHaveLength(0);
  });
});
