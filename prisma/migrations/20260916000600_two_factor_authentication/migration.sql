-- Multi-factor authentication (blueprint 7.6, and section 13's Phase 1 identity
-- line).
--
-- Better Auth owns the mechanism, as it owns every other part of authentication
-- (ADR 0005). What this migration decides is where the secret lives and who can
-- reach it, and the answer is the same one password hashes already get: the
-- auth_ tables, owned by ranza_auth, with the tenant query path granted
-- nothing. A TOTP secret is a credential — treating it as anything less would
-- undo the separation the auth_ prefix exists for.
--
-- ADR 0001: Prisma generated the table below; the grants beneath it are
-- hand-written in this same file because Prisma does not model them.

-- AlterTable
ALTER TABLE "auth_user" ADD COLUMN     "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auth_two_factor" (
    "id" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "backupCodes" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "verified" BOOLEAN NOT NULL DEFAULT true,
    "failedVerificationCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(6),

    CONSTRAINT "auth_two_factor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "auth_two_factor_user_idx" ON "auth_two_factor"("userId");

-- AddForeignKey
ALTER TABLE "auth_two_factor" ADD CONSTRAINT "auth_two_factor_userId_fkey" FOREIGN KEY ("userId") REFERENCES "auth_user"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- ---------------------------------------------------------------------------
-- Hand-written from here down
-- ---------------------------------------------------------------------------

comment on table public.auth_two_factor is
  'Second-factor credentials. secret and backupCodes are encrypted by Better Auth with BETTER_AUTH_SECRET before they are written, so the database alone is not enough — but ranza_app is granted nothing here regardless.';

comment on column public.auth_two_factor.verified is
  'False between enrolment and the first correct code. Better Auth only sets auth_user."twoFactorEnabled" once this turns true, so a mis-scanned secret cannot lock anyone out.';

-- Better Auth's schema marks `secret` as indexed. It is not indexed here: every
-- lookup in the plugin is by userId, and an index on a credential buys nothing
-- while making the value easier to reach.

grant select, insert, update, delete on public.auth_two_factor to ranza_auth;

-- The tenant query path gets nothing, stated explicitly so a future blanket
-- grant does not silently widen it — the same reason the Better Auth migration
-- revokes the other credential tables by name.
revoke all on public.auth_two_factor from ranza_app;
