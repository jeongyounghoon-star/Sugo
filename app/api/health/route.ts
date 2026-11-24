import { sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { guard, handle, json } from "@/lib/server/http";

/** 컨테이너 healthcheck: DB 연결까지 확인 */
export async function GET(req: Request) {
  return handle(async () => {
    guard(req, { write: false });
    await getDb().execute(sql`select 1`);
    return json({ ok: true });
  });
}
