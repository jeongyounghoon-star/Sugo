import { getDb } from "@/db/client";
import { createProfile, listProfiles } from "@/lib/profiles/repo";
import { createProfileSchema } from "@/lib/profiles/shared";
import { KB, guard, handle, json, readJson } from "@/lib/server/http";

export async function GET(req: Request) {
  return handle(async () => {
    guard(req, { write: false });
    return json({ profiles: await listProfiles(getDb()) });
  });
}

/** 프로필 만들기: 아이가 직접 할 수 있다 (최대 10개). 삭제/수정은 부모 PIN 필요 */
export async function POST(req: Request) {
  return handle(async () => {
    guard(req, { write: true });
    const input = await readJson(req, createProfileSchema, 2 * KB);
    return json({ profile: await createProfile(getDb(), input) }, 201);
  });
}
