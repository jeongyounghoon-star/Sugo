import { getDb } from "@/db/client";
import { profileIdSchema } from "@/lib/profiles/shared";
import { ApiError, KB, guard, handle, json, readJson } from "@/lib/server/http";
import { syncRequestSchema } from "@/projects/hangul/lib/schemas";
import { loadProgress, syncProgress } from "@/projects/hangul/server/progressRepo";

function parseId(id: string): string {
  const parsed = profileIdSchema.safeParse(id);
  if (!parsed.success) throw new ApiError(400, "invalid_id");
  return parsed.data;
}

export async function GET(req: Request, ctx: RouteContext<"/api/hangul/progress/[profileId]">) {
  return handle(async () => {
    guard(req, { write: false });
    const id = parseId((await ctx.params).profileId);
    return json(await loadProgress(getDb(), id));
  });
}

/** 브라우저 캐시 진도 + 새 기록을 보내면 서버 진도와 합쳐서 돌려준다 */
export async function PUT(req: Request, ctx: RouteContext<"/api/hangul/progress/[profileId]">) {
  return handle(async () => {
    guard(req, { write: true });
    const id = parseId((await ctx.params).profileId);
    const body = await readJson(req, syncRequestSchema, 128 * KB);
    return json(await syncProgress(getDb(), id, body));
  });
}
