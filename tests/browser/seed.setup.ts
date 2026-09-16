import { spawnSync } from "node:child_process";
import path from "node:path";

import { expect, test as setup } from "@playwright/test";

import { psql } from "./local-database";

/**
 * Somebody to sign in as.
 *
 * `db:seed:dev` is the only thing that creates an account — Ranza has no
 * self-service sign-up and never will — and it has to run against the
 * application rather than the database, because the provider-subject mapping
 * belongs to the sign-up route (ADR 0005). So it runs here, once the web server
 * this suite starts is answering, rather than as a step beside it.
 *
 * Only when there is nobody. Seeding inserts a fresh Organization every time it
 * runs, so doing it on every suite would leave a developer's database with a
 * dozen identical ones.
 */
const EMAIL = "deniz@example.test";

setup("a seeded Staff Member exists", () => {
  const assigned = psql(
    `select count(*)
     from public.property_assignments as assignment
     join public.users as member on member.id = assignment.user_id
     where lower(member.email) = lower('${EMAIL}')`,
  );
  if (assigned !== "0") return;

  const seeded = spawnSync("node", ["scripts/db-seed-dev.mjs"], {
    // The repository root, not wherever the command was typed: `db:seed:dev`
    // is reached by a relative path.
    cwd: path.resolve(__dirname, "../.."),
    encoding: "utf8",
  });
  expect(
    seeded.status,
    `pnpm db:seed:dev failed:\n${seeded.stdout}${seeded.stderr}`,
  ).toBe(0);
});
