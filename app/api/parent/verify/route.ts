import { getDb } from "@/db/client";
import { pinOnlySchema } from "@/lib/profiles/shared";
import { KB, guard, handle, json, readJson } from "@/lib/server/http";
import { requirePin } from "@/lib/server/pin";

/** 부모 화면 열기 전 PIN 확인 (실제 변경 요청마다 서버가 다시 확인한다) */
export async function POST(req: Request) {
  return handle(async () => {
    guard(req, { write: true });
    const { pin } = await readJson(req, pinOnlySchema, 1 * KB);
    await requirePin(getDb(), pin);
    return json({ ok: true });
  });
}
