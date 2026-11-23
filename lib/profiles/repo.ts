import "server-only";
import { asc, count, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { profiles } from "@/db/schema";
import { ApiError } from "@/lib/server/http";
import { MAX_PROFILES, type Profile } from "./shared";

const columns = { id: profiles.id, nickname: profiles.nickname, avatar: profiles.avatar };

export async function listProfiles(db: Db): Promise<Profile[]> {
  return db.select(columns).from(profiles).orderBy(asc(profiles.createdAt));
}

export async function getProfile(db: Db, id: string): Promise<Profile | null> {
  const rows = await db.select(columns).from(profiles).where(eq(profiles.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function createProfile(db: Db, input: { nickname: string; avatar: string }): Promise<Profile> {
  const [{ n }] = await db.select({ n: count() }).from(profiles);
  if (n >= MAX_PROFILES) throw new ApiError(409, "too_many_profiles");
  const [row] = await db.insert(profiles).values(input).returning(columns);
  return row;
}

export async function updateProfile(
  db: Db,
  id: string,
  input: { nickname?: string; avatar?: string },
): Promise<Profile> {
  const [row] = await db
    .update(profiles)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(profiles.id, id))
    .returning(columns);
  if (!row) throw new ApiError(404, "not_found");
  return row;
}

/** 프로필과 모든 학습 기록 삭제 (FK cascade) */
export async function deleteProfile(db: Db, id: string): Promise<void> {
  const rows = await db.delete(profiles).where(eq(profiles.id, id)).returning({ id: profiles.id });
  if (!rows[0]) throw new ApiError(404, "not_found");
}
