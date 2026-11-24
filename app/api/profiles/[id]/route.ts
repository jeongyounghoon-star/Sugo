import { getDb } from "@/db/client";
import { deleteProfile, updateProfile } from "@/lib/profiles/repo";
import { pinOnlySchema, profileIdSchema, updateProfileSchema } from "@/lib/profiles/shared";
import { ApiError, KB, guard, handle, json, readJson } from "@/lib/server/http";
import { requirePin } from "@/lib/server/pin";

function parseId(id: string): string {
  const parsed = profileIdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError(400, "invalid_id");
  return parsed.data;
}

/** 이름/아바타 바꾸기 (부모 PIN) */
export async function PATCH(req: Request, ctx: RouteContext<"/api/profiles/[id]">) {
  return handle(async () => {
    guard(req, { write: true });
    const id = parseId((await ctx.params).id);
    const { pin, ...input } = await readJson(req, updateProfileSchema, 2 * KB);
    const db = getDb();
    await requirePin(db, pin);
    return json({ profile: await updateProfile(db, id, input) });
  });
}

/** 프로필 삭제 (모든 학습 기록 포함, 부모 PIN) */
export async function DELETE(req: Request, ctx: RouteContext<"/api/profiles/[id]">) {
  return handle(async () => {
    guard(req, { write: true });
    const id = parseId((await ctx.params).id);
    const { pin } = await readJson(req, pinOnlySchema, 1 * KB);
    const db = getDb();
    await requirePin(db, pin);
    await deleteProfile(db, id);
    return json({ ok: true });
  });
}
