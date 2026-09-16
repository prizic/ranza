-- Rate-limit counters that every server instance can see.
--
-- Blueprint 7.6 lists rate limiting in the security baseline. Better Auth
-- provides it, but counts in process memory by default, which is a per-instance
-- limit: on any deployment with more than one instance an attacker spread
-- across them gets a multiple of the limit, and nothing reports that.
--
-- This matters more here than it would elsewhere. The second factor's real
-- defence is that a challenge is burned after five wrong codes and a new one
-- costs a fresh sign-in — so the cost of guessing is set by how hard it is to
-- sign in repeatedly, which is exactly what this table bounds (ADR 0010,
-- amendment).
--
-- ADR 0001: Prisma generated the table; the grants are hand-written beneath it.

-- CreateTable
CREATE TABLE "auth_rate_limit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "count" INTEGER NOT NULL,
    "lastRequest" BIGINT NOT NULL,

    CONSTRAINT "auth_rate_limit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_rate_limit_key_key" ON "auth_rate_limit"("key");

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

comment on table public.auth_rate_limit is
  'Better Auth rate-limit counters. Not tenant-owned and not a credential, but it lives with the auth_ tables because only the authentication role has any business touching it.';

grant select, insert, update, delete on public.auth_rate_limit to ranza_auth;

-- The tenant query path gets nothing, stated explicitly so a future blanket
-- grant does not silently widen it. A counter is not sensitive on its own, but
-- being able to reset one is: it would turn the limit off.
revoke all on public.auth_rate_limit from ranza_app;
