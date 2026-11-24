import "server-only";
import { createHash, createHmac, randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { PIN_PATTERN } from "@/lib/profiles/shared";
import { ApiError } from "./http";

/**
 * 부모 PIN (숫자 6~10자리).
 * - 저장: scrypt(HMAC-SHA256(PIN_PEPPER, pin)) + 랜덤 salt. PIN_PEPPER 는 .env 에만 있어서
 *   DB/백업 파일만 가져가서는 오프라인으로 PIN을 풀 수 없다.
 * - 잠금: 실패 횟수와 잠금 상태를 DB(settings)에 두고, **검증하기 전에** 트랜잭션 + 행 잠금으로
 *   시도를 먼저 기록한다. 그래서 동시에 수백 개를 보내도 잠금 단계마다 정확히 MAX_ATTEMPTS 번만
 *   검증되고, 서버를 다시 시작해도 잠금이 풀리지 않는다.
 * - 잠금 시간은 10분 → 30분 → 2시간 → 6시간 → 24시간으로 늘어난다 (맞히면 처음으로).
 */

const scrypt = promisify(scryptCb) as (pw: Buffer | string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const PIN_KEY = "parent_pin";
const LOCK_KEY = "parent_pin_lock";
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

export const MAX_ATTEMPTS = 5;
/** 이 시간 동안 시도가 없으면 실패 횟수를 0으로 */
const ATTEMPT_WINDOW_MS = 60 * 60_000;
/** 마지막 잠금이 끝나고 이만큼 조용하면 잠금 단계를 처음으로 */
const LEVEL_DECAY_MS = 24 * 60 * 60_000;
export const LOCK_STEPS_MS = [10 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 6 * 60 * 60_000, 24 * 60 * 60_000];

export const pinSchema = z.string().regex(PIN_PATTERN);

interface StoredPin {
  v: 1 | 2;
  salt: string;
  hash: string;
  /** v2: PIN_PEPPER 를 섞었는지 */
  pep?: boolean;
}

export interface LockState {
  attempts: number;
  lastAttemptAt: number;
  lockedUntil: number;
  level: number;
}

const EMPTY_LOCK: LockState = { attempts: 0, lastAttemptAt: 0, lockedUntil: 0, level: 0 };

function pepper(): Buffer | null {
  const p = process.env.PIN_PEPPER?.trim();
  return p ? Buffer.from(p, "utf8") : null;
}

function material(pin: string, usePepper: boolean): Buffer | string {
  if (!usePepper) return pin;
  const p = pepper();
  // 페퍼로 저장된 PIN인데 .env 에서 PIN_PEPPER 가 사라졌으면 확인할 방법이 없다 (설정 오류)
  if (!p) throw new ApiError(500, "server_error");
  return createHmac("sha256", p).update(pin).digest();
}

export async function hashPin(pin: string): Promise<StoredPin> {
  const salt = randomBytes(16);
  const pep = pepper() !== null;
  const hash = await scrypt(material(pin, pep), salt, KEYLEN, PARAMS);
  return { v: 2, salt: salt.toString("base64"), hash: hash.toString("base64"), pep };
}

export async function verifyPinHash(pin: string, stored: StoredPin): Promise<boolean> {
  const expected = Buffer.from(stored.hash, "base64");
  const actual = await scrypt(material(pin, stored.pep === true), Buffer.from(stored.salt, "base64"), expected.length, PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function loadPin(db: Db): Promise<StoredPin | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, PIN_KEY)).limit(1);
  if (!rows[0]) return null;
  try {
    return JSON.parse(rows[0].value) as StoredPin;
  } catch {
    return null;
  }
}

export async function isPinSet(db: Db): Promise<boolean> {
  return (await loadPin(db)) !== null;
}

function parseLock(value: string | undefined): LockState {
  if (!value) return { ...EMPTY_LOCK };
  try {
    const v = JSON.parse(value) as Partial<LockState>;
    const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
    return { attempts: n(v.attempts), lastAttemptAt: n(v.lastAttemptAt), lockedUntil: n(v.lockedUntil), level: n(v.level) };
  } catch {
    return { ...EMPTY_LOCK };
  }
}

export function lockDurationMs(level: number): number {
  return LOCK_STEPS_MS[Math.min(level, LOCK_STEPS_MS.length - 1)];
}

/** 순수 함수: 시도 하나를 기록한 다음 상태. 잠겨 있으면 null */
export function nextLockState(s: LockState, now: number): LockState | null {
  if (now < s.lockedUntil) return null;
  const next = { ...s };
  if (now - next.lastAttemptAt > ATTEMPT_WINDOW_MS) next.attempts = 0;
  if (next.lockedUntil > 0 && now - next.lockedUntil > LEVEL_DECAY_MS) next.level = 0;
  next.attempts += 1;
  next.lastAttemptAt = now;
  if (next.attempts >= MAX_ATTEMPTS) {
    // 이번 시도가 이 단계의 마지막: 결과를 보기 전에 미리 잠근다 (맞히면 succeed 에서 풀림)
    next.lockedUntil = now + lockDurationMs(next.level);
    next.level += 1;
    next.attempts = 0;
  }
  return next;
}

/**
 * 검증 전에 시도를 기록한다 (원자적: 트랜잭션 + SELECT ... FOR UPDATE).
 * 잠겨 있으면 429. 동시 요청은 행 잠금 때문에 한 줄로 서서 처리된다.
 */
async function reserveAttempt(db: Db): Promise<void> {
  await db
    .insert(settings)
    .values({ key: LOCK_KEY, value: JSON.stringify(EMPTY_LOCK) })
    .onConflictDoNothing();
  await db.transaction(async (tx) => {
    const rows = await tx.select().from(settings).where(eq(settings.key, LOCK_KEY)).for("update").limit(1);
    const next = nextLockState(parseLock(rows[0]?.value), Date.now());
    if (!next) throw new ApiError(429, "pin_locked");
    await tx.update(settings).set({ value: JSON.stringify(next), updatedAt: new Date() }).where(eq(settings.key, LOCK_KEY));
  });
}

async function clearAttempts(db: Db): Promise<void> {
  await db
    .update(settings)
    .set({ value: JSON.stringify(EMPTY_LOCK), updatedAt: new Date() })
    .where(eq(settings.key, LOCK_KEY));
}

/** PIN이 맞지 않으면 ApiError. PIN이 아직 없으면 먼저 만들라고 알려준다. */
export async function requirePin(db: Db, pin: unknown): Promise<void> {
  const stored = await loadPin(db);
  if (!stored) throw new ApiError(409, "pin_not_set");
  const parsed = pinSchema.safeParse(pin);
  // 형식이 틀린 값은 어떤 PIN도 시험하지 않으므로 시도로 세지 않는다
  if (!parsed.success) throw new ApiError(403, "wrong_pin");
  await reserveAttempt(db);
  if (!(await verifyPinHash(parsed.data, stored))) throw new ApiError(403, "wrong_pin");
  await clearAttempts(db);
}

function setupCode(): string | null {
  return process.env.SETUP_CODE?.trim() || null;
}

export function isSetupCodeRequired(): boolean {
  return setupCode() !== null;
}

function sameSecret(a: string, b: string): boolean {
  // 길이 차이도 숨기려고 해시끼리 비교
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

/**
 * 처음이면 PIN 만들기 (SETUP_CODE 가 설정돼 있으면 설치 코드 필요), 이미 있으면 현재 PIN을 확인하고 바꾸기.
 */
export async function setPin(
  db: Db,
  newPin: string,
  opts: { currentPin?: string; setupCode?: string } = {},
): Promise<void> {
  if (await isPinSet(db)) {
    await requirePin(db, opts.currentPin);
    const value = JSON.stringify(await hashPin(newPin));
    await db.update(settings).set({ value, updatedAt: new Date() }).where(eq(settings.key, PIN_KEY));
    return;
  }

  // 처음 만들기: 설치한 사람만 (LAN의 다른 기기가 먼저 PIN을 정하지 못하게)
  const expected = setupCode();
  if (expected) {
    await reserveAttempt(db);
    if (!opts.setupCode || !sameSecret(opts.setupCode.trim(), expected)) throw new ApiError(403, "wrong_setup_code");
    await clearAttempts(db);
  }
  const value = JSON.stringify(await hashPin(newPin));
  // 동시에 두 기기가 처음 PIN을 만들면 먼저 저장된 것만 남는다
  const inserted = await db
    .insert(settings)
    .values({ key: PIN_KEY, value })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  if (inserted.length === 0) throw new ApiError(409, "pin_already_set");
}
