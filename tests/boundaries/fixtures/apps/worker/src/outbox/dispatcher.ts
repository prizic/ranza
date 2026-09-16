// Deliberately forbidden, twice over: a worker file other than composition.ts
// reading the environment and opening its own connection. The startup checks
// that refuse a superuser, a BYPASSRLS role or an owner live in composition.ts
// and cover nothing a second connection does (ADR 0018).
// scripts/dependency-boundaries.mjs asserts both are detected.
import { tenantClient } from "../../../../packages/db/src/index";

export const client = process.env.WORKER_DATABASE_URL ?? tenantClient;
