import "server-only";
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { hangulDailyTime, hangulPlays, hangulProgress } from "@/db/schema";
import { getProfile } from "@/lib/profiles/repo";
import { ApiError } from "@/lib/server/http";
import { createProgress, type Progress } from "../lib/progress";
import { mergeProgress } from "../lib/sync";
import type { SyncRequest } from "../lib/schemas";

async function requireProfile(db: Db, profileId: string) {
  if (!(await getProfile(db, profileId))) throw new ApiError(404, "not_found");
}

export interface ServerProgress {
  progress: Progress;
  epoch: number;
  /** true면 브라우저는 합치지 말고 이 진도로 바꿔야 한다 (부모가 초기화함) */
  replaced: boolean;
}

export async function loadProgress(db: Db, profileId: string): Promise<ServerProgress> {
  await requireProfile(db, profileId);
  const rows = await db.select().from(hangulProgress).where(eq(hangulProgress.profileId, profileId)).limit(1);
  return { progress: rows[0]?.data ?? createProgress(), epoch: rows[0]?.epoch ?? 0, replaced: false };
}

/**
 * 브라우저 진도를 서버 진도와 합쳐 저장하고, 합친 결과를 돌려준다.
 * 같은 요청이 두 번 와도 결과가 같다 (merge는 멱등, 기록은 id로 중복 제거).
 */
export async function syncProgress(db: Db, profileId: string, req: SyncRequest): Promise<ServerProgress> {
  await requireProfile(db, profileId);
  return db.transaction(async (tx) => {
    // 같은 프로필 동시 동기화 직렬화
    const rows = await tx
      .select()
      .from(hangulProgress)
      .where(eq(hangulProgress.profileId, profileId))
      .for("update")
      .limit(1);
    const epoch = rows[0]?.epoch ?? 0;
    // 부모가 초기화한 뒤의 옛 캐시 → 합치지 않고 서버 진도로 바꾸게 한다
    if (req.epoch !== null && req.epoch !== epoch) {
      return { progress: rows[0]?.data ?? createProgress(), epoch, replaced: true };
    }
    const merged = mergeProgress(rows[0]?.data ?? createProgress(), req.progress as Progress);

    await tx
      .insert(hangulProgress)
      .values({ profileId, data: merged, revision: 1 })
      .onConflictDoUpdate({
        target: hangulProgress.profileId,
        set: { data: merged, revision: sql`${hangulProgress.revision} + 1`, updatedAt: new Date() },
      });

    if (req.plays.length) {
      await tx
        .insert(hangulPlays)
        .values(
          req.plays.map((p) => ({
            profileId,
            id: p.id,
            stageId: p.stageId,
            correct: p.correct,
            total: p.total,
            stars: p.stars,
            playedAt: new Date(p.playedAt),
          })),
        )
        .onConflictDoNothing();
    }

    const days = Object.entries(req.progress.history);
    if (days.length) {
      await tx
        .insert(hangulDailyTime)
        .values(days.map(([day, seconds]) => ({ profileId, day, seconds })))
        .onConflictDoUpdate({
          target: [hangulDailyTime.profileId, hangulDailyTime.day],
          set: { seconds: sql`greatest(${hangulDailyTime.seconds}, excluded.seconds)` },
        });
    }
    return { progress: merged, epoch, replaced: false };
  });
}

/** 진도 초기화 (기록 포함) */
export async function resetProgress(db: Db, profileId: string): Promise<void> {
  await requireProfile(db, profileId);
  await db.transaction(async (tx) => {
    await tx
      .insert(hangulProgress)
      .values({ profileId, data: createProgress(), epoch: 1 })
      .onConflictDoUpdate({
        target: hangulProgress.profileId,
        set: { data: createProgress(), epoch: sql`${hangulProgress.epoch} + 1`, updatedAt: new Date() },
      });
    await tx.delete(hangulPlays).where(eq(hangulPlays.profileId, profileId));
    await tx.delete(hangulDailyTime).where(eq(hangulDailyTime.profileId, profileId));
  });
}
