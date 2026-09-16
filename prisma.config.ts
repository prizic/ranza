import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig } from "prisma/config";

// Resolved from this file rather than the working directory: pnpm runs package
// scripts with cwd set to the package, which would miss the root .env.
config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

/**
 * A host that cannot exist, for when DIRECT_URL is not set.
 *
 * `env("DIRECT_URL")` threw at config load, which meant `prisma generate` could
 * not run without a database URL — even though generating reads the schema and
 * never opens a connection. That is why CI could not run `pnpm check` at all:
 * no `.env` on the runner, so the config raised before a single check started.
 *
 * Falling back rather than throwing does not make a misconfiguration silent. A
 * command that actually connects — `migrate deploy`, `migrate dev`, `db pull` —
 * fails on a hostname that cannot resolve, and `unset.invalid` says why in the
 * error itself. `.invalid` is reserved by RFC 2606 precisely so it can never be
 * registered by anyone.
 */
const UNSET = "postgresql://unset:unset@unset.invalid:5432/unset";

// Migrations and introspection use the direct connection. A transaction-mode
// pooler cannot run DDL, so this must never point at the pooled URL (ADR 0001).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env.DIRECT_URL ?? UNSET,
  },
});
