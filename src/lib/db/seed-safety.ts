export function assertNotProduction(env: NodeJS.ProcessEnv): void {
  if (env.NODE_ENV === "production") {
    throw new Error("Catalog seed/reset commands are disabled in production.");
  }
}

export function assertLocalResetAllowed(env: NodeJS.ProcessEnv): void {
  assertNotProduction(env);
  if (env.NODE_ENV !== "development") {
    throw new Error("Destructive catalog reset requires NODE_ENV=development.");
  }
  if (env.RESET_LOCAL_CATALOG !== "YES") {
    throw new Error("Set RESET_LOCAL_CATALOG=YES to confirm the local catalog reset.");
  }
  if (env.DATABASE_URL) {
    throw new Error("Reset is restricted to embedded PGlite; unset DATABASE_URL first.");
  }
}
