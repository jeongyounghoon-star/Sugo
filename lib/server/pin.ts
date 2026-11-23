import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Db } from "@/db/client";
import { settings } from "@/db/schema";
import { ApiError } from "./http";
import { FailureLock } from "./rateLimit";

/**
 * 부모 PIN (4~6자리). scrypt + 랜덤 salt 로 해시해서 settings 테이블에 저장.
 * 5번 틀리면 10분 잠금.
 */

const scrypt = promisify(scryptCb) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const KEY = "parent_pin";
const PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEYLEN = 32;

export const pinSchema = z.string().regex(/^\d{4,6}$/);

const lock = new FailureLock({ maxFailures: 5, windowMs: 10 * 60_000, lockMs: 10 * 60_000 });

export function resetPinLockForTests() {
  lock.reset();
}

interface StoredPin {
  v: 1;
  salt: string;
  hash: string;
}

export async function hashPin(pin: string): Promise<StoredPin> {
  const salt = randomBytes(16);
  const hash = await scrypt(pin, salt, KEYLEN, PARAMS);
  return { v: 1, salt: salt.toString("base64"), hash: hash.toString("base64") };
}

export async function verifyPinHash(pin: string, stored: StoredPin): Promise<boolean> {
  const expected = Buffer.from(stored.hash, "base64");
  const actual = await scrypt(pin, Buffer.from(stored.salt, "base64"), expected.length, PARAMS);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function loadPin(db: Db): Promise<StoredPin | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, KEY)).limit(1);
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

/** PIN이 맞지 않으면 ApiError. PIN이 아직 없으면 먼저 만들라고 알려준다. */
export async function requirePin(db: Db, pin: unknown): Promise<void> {
  if (lock.isLocked()) throw new ApiError(429, "pin_locked");
  const stored = await loadPin(db);
  if (!stored) throw new ApiError(409, "pin_not_set");
  const parsed = pinSchema.safeParse(pin);
  if (!parsed.success || !(await verifyPinHash(parsed.data, stored))) {
    lock.fail();
    throw new ApiError(403, "wrong_pin");
  }
  lock.succeed();
}

export async function setPin(db: Db, newPin: string, currentPin: string | undefined): Promise<void> {
  if (await isPinSet(db)) await requirePin(db, currentPin);
  const value = JSON.stringify(await hashPin(newPin));
  await db
    .insert(settings)
    .values({ key: KEY, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } });
}
