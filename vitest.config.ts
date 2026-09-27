import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      // Vitest is not a React Server environment; neutralise the guard import.
      "server-only": fileURLToPath(new URL("./tests/server-only-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Integration tests share one server + one database — run serially.
    fileParallelism: false,
  },
});
