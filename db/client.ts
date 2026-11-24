import "server-only";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/** postgres-js(운영)와 PGlite(테스트) 모두 받을 수 있는 DB 타입 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

let db: Db | null = null;
let override: Db | null = null;

export function getDb(): Db {
  if (override) return override;
  if (!db) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    const client = postgres(url, { max: 5, idle_timeout: 30, connect_timeout: 10, onnotice: () => {} });
    db = drizzle(client, { schema }) as unknown as Db;
  }
  return db;
}

/** 테스트에서 PGlite DB를 끼워 넣는다 */
export function setDbForTests(next: Db | null): void {
  override = next;
}
