import { join } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

export const MIGRATIONS_FOLDER = join(process.cwd(), "db", "migrations");

/** 서버 시작 시 마이그레이션 적용 (DB가 늦게 뜨면 몇 번 재시도) */
export async function runMigrations(url: string, attempts = 10): Promise<void> {
  for (let i = 1; ; i++) {
    const client = postgres(url, { max: 1, connect_timeout: 10, onnotice: () => {} });
    try {
      await migrate(drizzle(client), { migrationsFolder: MIGRATIONS_FOLDER });
      console.log("[db] migrations applied");
      return;
    } catch (err) {
      const code = (err as { code?: string }).code ?? "unknown";
      if (i >= attempts) {
        console.error(`[db] migration failed (code=${code})`);
        throw err;
      }
      console.warn(`[db] migration attempt ${i} failed (code=${code}), retrying`);
      await new Promise((r) => setTimeout(r, 2000 * i));
    } finally {
      await client.end({ timeout: 5 });
    }
  }
}
