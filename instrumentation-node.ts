import { validateProductionSecrets } from "./lib/server/env";

/** Node-only startup checks and initialization. */
export async function registerNode() {
  try {
    validateProductionSecrets();
  } catch (error) {
    // Next.js logs instrumentation errors but can keep its listener alive, so fail the process explicitly.
    console.error(`[startup] ${error instanceof Error ? error.message : "Invalid production secret configuration."}`);
    process.exit(1);
  }

  const url = process.env.DATABASE_URL;
  if (!url || process.env.SKIP_MIGRATIONS === "1") return;
  const { runMigrations } = await import("./db/migrate");
  await runMigrations(url);
}
