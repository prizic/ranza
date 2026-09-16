import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// Resolved from this file rather than the working directory: pnpm runs package
// scripts with cwd set to the package, which would miss the root .env.
config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".env"),
});

// Migrations and introspection use the direct connection. A transaction-mode
// pooler cannot run DDL, so this must never point at the pooled URL (ADR 0001).
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DIRECT_URL"),
  },
});
