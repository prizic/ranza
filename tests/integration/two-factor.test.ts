/**
 * Multi-factor authentication, end to end and against a real database.
 *
 * Blueprint section 13 lists MFA under Phase 1 identity and 7.6 makes it part
 * of the security baseline. Better Auth owns the mechanism (ADR 0005); what is
 * worth testing here is the part Ranza decided:
 *
 *   - enrolment does not enable anything until a code proves the secret was
 *     scanned correctly, so a mis-scanned QR costs a retry rather than an
 *     account;
 *   - once enabled, a password alone stops producing a session;
 *   - the TOTP secret is a credential, and the tenant query path is granted
 *     nothing on it — the same boundary that protects password hashes.
 *
 * It drives `auth.handler` with a cookie jar rather than calling the server API
 * directly, because that is the route the sign-in form actually posts to.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { base32 } from "@better-auth/utils/base32";
import { createOTP } from "@better-auth/utils/otp";
import { createAuthModule } from "../../packages/auth/src";
import { createPrismaClient } from "../../packages/db/src";

const EMAIL = `mfa-${Date.now()}@example.test`;
const PASSWORD = "correct-horse-battery-staple";
const SECRET =
  process.env.BETTER_AUTH_SECRET ?? "test-secret-not-used-in-production";

const authDb = createPrismaClient(process.env.AUTH_DATABASE_URL!);
// The tenant query path, exactly as an application composes it: ranza_app.
const tenant = createPrismaClient(process.env.DATABASE_URL!);
const owner = createPrismaClient(process.env.DIRECT_URL!);

const { auth } = createAuthModule({ db: authDb, secret: SECRET });

let jar: Record<string, string> = {};

async function post(path: string, body: unknown) {
  const cookie = Object.entries(jar)
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");

  const response = await auth.handler(
    new Request(`http://localhost/api/auth${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      body: JSON.stringify(body),
    }),
  );

  for (const raw of response.headers.getSetCookie()) {
    const pair = raw.split(";")[0] ?? "";
    const split = pair.indexOf("=");
    if (split < 0) continue;
    const name = pair.slice(0, split);
    const value = pair.slice(split + 1);
    if (value === "") delete jar[name];
    else jar[name] = value;
  }

  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as Record<
      string,
      unknown
    > | null,
  };
}

/** Stands in for the authenticator app on someone's phone. */
async function codeFrom(totpURI: string): Promise<string> {
  const encoded = new URL(totpURI).searchParams.get("secret");
  if (!encoded) throw new Error("the enrolment URI carried no secret");
  const secret = new TextDecoder().decode(base32.decode(encoded));
  return createOTP(secret).totp();
}

const enabledFor = async (email: string) =>
  (
    await owner.$queryRawUnsafe<{ twoFactorEnabled: boolean }[]>(
      'select "twoFactorEnabled" from public.auth_user where email = $1',
      email,
    )
  )[0]?.twoFactorEnabled;

let totpURI = "";
let backupCodes: string[] = [];

beforeAll(async () => {
  const signUp = await post("/sign-up/email", {
    email: EMAIL,
    password: PASSWORD,
    name: "MFA Tester",
  });
  expect(signUp.status).toBe(200);
});

afterAll(async () => {
  await owner.$executeRawUnsafe(
    "delete from public.auth_user where email = $1",
    EMAIL,
  );
  await owner.$disconnect();
  await authDb.$disconnect();
  await tenant.$disconnect();
});

describe("enrolling a second factor", () => {
  it("hands back a secret and backup codes", async () => {
    const enable = await post("/two-factor/enable", { password: PASSWORD });
    expect(enable.status).toBe(200);

    totpURI = String(enable.body?.totpURI ?? "");
    backupCodes = (enable.body?.backupCodes ?? []) as string[];

    expect(totpURI).toMatch(/^otpauth:\/\/totp\/Ranza/);
    expect(backupCodes.length).toBeGreaterThan(0);
  });

  it("does not enable anything until a code proves the secret was scanned", async () => {
    await expect(enabledFor(EMAIL)).resolves.toBe(false);
  });

  it("refuses a wrong code, and stays disabled", async () => {
    const wrong = await post("/two-factor/verify-totp", { code: "000000" });
    expect(wrong.status).not.toBe(200);
    await expect(enabledFor(EMAIL)).resolves.toBe(false);
  });

  it("enables on the first correct code", async () => {
    const verify = await post("/two-factor/verify-totp", {
      code: await codeFrom(totpURI),
    });
    expect(verify.status).toBe(200);
    await expect(enabledFor(EMAIL)).resolves.toBe(true);
  });
});

describe("signing in once a second factor exists", () => {
  it("stops issuing a session for a password alone", async () => {
    jar = {};
    const signIn = await post("/sign-in/email", {
      email: EMAIL,
      password: PASSWORD,
    });
    expect(signIn.status).toBe(200);
    // The whole point: the right password is no longer enough.
    expect(signIn.body?.twoFactorRedirect).toBe(true);
    expect(signIn.body?.token).toBeUndefined();
  });

  it("refuses the challenge with a wrong code", async () => {
    const wrong = await post("/two-factor/verify-totp", { code: "000000" });
    expect(wrong.status).not.toBe(200);
  });

  it("completes the challenge with the right code", async () => {
    const verify = await post("/two-factor/verify-totp", {
      code: await codeFrom(totpURI),
    });
    expect(verify.status).toBe(200);

    const session = await auth.api.getSession({
      headers: new Headers({
        cookie: Object.entries(jar)
          .map(([name, value]) => `${name}=${value}`)
          .join("; "),
      }),
    });
    expect(session?.user.email).toBe(EMAIL);
  });

  it("accepts a backup code, and only once", async () => {
    jar = {};
    await post("/sign-in/email", { email: EMAIL, password: PASSWORD });

    const code = backupCodes[0]!;
    const first = await post("/two-factor/verify-backup-code", { code });
    expect(first.status).toBe(200);

    jar = {};
    await post("/sign-in/email", { email: EMAIL, password: PASSWORD });
    const reuse = await post("/two-factor/verify-backup-code", { code });
    expect(reuse.status).not.toBe(200);
  });
});

describe("the second factor is a credential", () => {
  it("is unreachable from the tenant query path", async () => {
    // Same boundary as password hashes: ranza_app is granted nothing on the
    // auth_ tables, so a defect in the tenant path cannot read a TOTP secret.
    await expect(
      tenant.$queryRawUnsafe("select secret from public.auth_two_factor"),
    ).rejects.toThrow(/permission denied/i);
  });

  it("is never stored in the clear", async () => {
    const rows = await owner.$queryRawUnsafe<{ secret: string }[]>(
      'select t.secret from public.auth_two_factor t join public.auth_user u on u.id = t."userId" where u.email = $1',
      EMAIL,
    );
    const stored = rows[0]?.secret ?? "";
    const enrolled = new URL(totpURI).searchParams.get("secret") ?? "";
    expect(stored).not.toBe("");
    // Better Auth encrypts with BETTER_AUTH_SECRET before writing, so the row
    // must not contain the value the authenticator app was given.
    expect(stored).not.toContain(enrolled);
    expect(new TextDecoder().decode(base32.decode(enrolled))).not.toBe(stored);
  });
});
