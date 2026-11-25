/**
 * Child-process probe for SEC-04 (log safety of unexpected API failures).
 *
 * `src/lib/http.ts` imports the `server-only` marker, so the real handler can
 * only be exercised the way Next.js runs it. This probe prints exactly what
 * the handler logs and returns, so the parent test can assert that neither the
 * text stream nor the client body contains account data.
 */
import { handleUnexpected } from "@/lib/http";

async function main(): Promise<void> {
  const logged: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => {
    logged.push(args);
  };
  try {
    const err = Object.assign(
      new Error('Failed query: insert into "users" — Key (email)=(victim@example.invalid) already exists'),
      {
        name: "DrizzleQueryError",
        code: "23505",
        query: 'insert into "users" ("email") values ($1)',
        params: ["victim@example.invalid", "scrypt$16384$8$1$c2FsdA$ZGlnZXN0"],
      },
    );
    const response = handleUnexpected("sec-04", err);
    process.stdout.write(
      JSON.stringify({
        status: response.status,
        cacheControl: response.headers.get("cache-control"),
        body: await response.text(),
        logged,
      }),
    );
  } finally {
    console.error = original;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`probe failed: ${String(error)}\n`);
  process.exitCode = 1;
});
