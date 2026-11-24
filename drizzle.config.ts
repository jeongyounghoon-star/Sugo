import { defineConfig } from "drizzle-kit";

// 마이그레이션 SQL 생성: npm run db:generate (DB 연결 필요 없음)
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./db/migrations",
});
