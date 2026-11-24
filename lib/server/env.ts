const REQUIRED_PRODUCTION_SECRETS = ["PIN_PEPPER", "SETUP_CODE"] as const;

/** Fail closed before a production server accepts requests. Never include secret values in errors. */
export function validateProductionSecrets(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV !== "production") return;

  const missing = REQUIRED_PRODUCTION_SECRETS.filter((name) => !env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`Missing required production environment variables: ${missing.join(", ")}. Refusing to start.`);
  }
}
