import { getDb } from "@/db/client";
import { pinOnlySchema, profileIdSchema } from "@/lib/profiles/shared";
import { ApiError, KB, guard, handle, json, readJson } from "@/lib/server/http";
import { requirePin } from "@/lib/server/pin";
import { resetProgress } from "@/projects/hangul/server/progressRepo";

/** 학습 기록 초기화 (부모 PIN) */
export async function POST(req: Request, ctx: RouteContext<"/api/profiles/[id]/reset">) {
  return handle(async () => {
    guard(req, { write: true });
    const parsed = profileIdSchema.safeParse((await ctx.params).id);
    if (!parsed.success) throw new ApiError(400, "invalid_id");
    const { pin } = await readJson(req, pinOnlySchema, 1 * KB);
    const db = getDb();
    await requirePin(db, pin);
    await resetProgress(db, parsed.data);
    return json({ ok: true });
  });
}
