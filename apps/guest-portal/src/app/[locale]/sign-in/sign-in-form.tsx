"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, FormError, Input, Label } from "@ranza/ui";

/*
 * EduBoard's login fields, in Ranza's colours: a visible label over a tall,
 * softly rounded field, and a full-width emerald call to action. 16px text on
 * a phone, so iOS does not zoom into the field.
 */
const LABEL = "text-sm font-semibold text-foreground";
const FIELD =
  "h-13 rounded-md bg-card px-4 text-base shadow-none md:text-[15px]";
const SUBMIT = "h-13 w-full rounded-md text-[15px] font-medium";
const ERROR =
  "rounded-lg border border-danger/15 bg-danger-soft p-3 text-sm font-medium text-danger";

type Failure = "mismatch" | "throttled" | "expired" | "unavailable";

/**
 * Better Auth's codes for what was typed not matching — the only answers that
 * may say so. An allow-list, not the fallback: a 403 from the origin check
 * would otherwise tell somebody their correct password is wrong.
 */
const MISMATCH = new Set([
  "INVALID_EMAIL_OR_PASSWORD",
  "INVALID_EMAIL",
  "INVALID_CODE",
  "INVALID_BACKUP_CODE",
]);

/**
 * The second-factor challenge is spent: five wrong codes end it, and it is
 * gone once it times out. Only a new sign-in starts another (ADR 0010), so no
 * code typed here can succeed.
 */
const EXPIRED = new Set([
  "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE",
  "INVALID_TWO_FACTOR_COOKIE",
]);

/** What is said when the answer was not a refusal, at either step. */
const FAILURE = {
  throttled: "signInThrottled",
  expired: "challengeExpired",
  unavailable: "signInUnavailable",
} as const;

function codeOf(body: unknown): string | undefined {
  return typeof body === "object" &&
    body !== null &&
    "code" in body &&
    typeof body.code === "string"
    ? body.code
    : undefined;
}

/**
 * What went wrong. Anything this does not recognise is signing in not working,
 * and is logged, because this application has no client error reporter yet
 * and nothing else would record it.
 */
async function failureOf(response: Response | null): Promise<Failure> {
  if (response === null) return "unavailable";
  if (response.status === 429) return "throttled";
  // A body that is not JSON is carried into the log below, not dropped.
  const body: unknown = await response.json().catch((error: unknown) => error);
  const code = codeOf(body);
  if (code && EXPIRED.has(code)) return "expired";
  if (code && MISMATCH.has(code)) return "mismatch";
  console.error("sign-in refused unexpectedly", response.status, code ?? body);
  return "unavailable";
}

/**
 * The request, or null when there was no answer at all. Logged, because this
 * application has no client error reporter yet and the console is the only
 * place a request that never answered can be seen; the form says it is not
 * working.
 */
async function post(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("sign-in request failed", url, error);
    return null;
  }
}

/**
 * Posts to the Better Auth route handler, which is what sets the session
 * cookie. Nothing about the credential is handled here beyond passing it on.
 *
 * Two steps, because a correct password is no longer necessarily a session: an
 * account with a second factor gets `twoFactorRedirect` instead of a token, and
 * the code completes the sign-in. Which endpoint verifies it is decided by the
 * shape of what was typed — a six-digit code is from the authenticator app,
 * anything else is one of the XXXXX-XXXXX backup codes. One field, because
 * asking someone to classify their own code before typing it is a worse
 * question than reading it afterwards.
 *
 * A refusal says only that it did not match, at either step. Distinguishing
 * "no such account" from "wrong password" would confirm which addresses are
 * registered. What is not a refusal says what it is instead: too many attempts
 * (the auth route's rate limit answers 429), a second-factor challenge that is
 * spent and needs a new sign-in, or signing in not working at all (anything
 * else, including no answer). Telling somebody their password is wrong when it
 * is not sends them to reset it, or to try again and be refused for longer.
 *
 * The Portal has no enrolment screen — a second factor is set up in the
 * Workspace — but it must still answer the challenge. Identity is shared
 * across both applications (ADR 0005), so a Staff Member who enrolled there
 * and signs in here would otherwise meet a form that succeeds and hands back
 * no session.
 */
export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [challenging, setChallenging] = useState(false);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);

  function complete() {
    // Left pending through the redirect: the shell reads the session on the
    // server, so the cached tree has to go before anything is shown.
    router.replace(redirectTo);
    router.refresh();
  }

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailure(null);
    setRevealed(false);

    const response = await post("/api/auth/sign-in/email", {
      email: form.get("email"),
      password: form.get("password"),
    });

    if (!response?.ok) {
      const failed = await failureOf(response);
      setPending(false);
      setFailure(failed);
      return;
    }

    const body = (await response.json().catch(() => null)) as {
      twoFactorRedirect?: boolean;
    } | null;

    if (body?.twoFactorRedirect) {
      setPending(false);
      setChallenging(true);
      return;
    }

    complete();
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setPending(true);
    setFailure(null);

    const endpoint = /^\d{6}$/.test(code.trim())
      ? "/api/auth/two-factor/verify-totp"
      : "/api/auth/two-factor/verify-backup-code";

    const response = await post(endpoint, { code: code.trim() });

    if (!response?.ok) {
      const failed = await failureOf(response);
      setPending(false);
      // A spent challenge cannot be answered, so back to the password, which
      // starts a new one.
      if (failed === "expired") setChallenging(false);
      setFailure(failed);
      return;
    }

    complete();
  }

  if (challenging) {
    return (
      <form className="grid gap-5" onSubmit={verify}>
        <p className="text-sm font-medium text-muted-foreground">
          {t("challengeSummary")}
        </p>
        {failure ? (
          <FormError className={ERROR}>
            {failure === "mismatch"
              ? t("challengeFailed")
              : t(FAILURE[failure])}
          </FormError>
        ) : null}
        <div className="grid gap-2">
          <Label className={LABEL} htmlFor="code">
            {t("code")}
          </Label>
          <Input
            aria-invalid={failure === "mismatch" || undefined}
            autoComplete="one-time-code"
            autoFocus
            className={FIELD}
            id="code"
            inputMode="text"
            name="code"
            required
          />
        </div>
        <Button className={SUBMIT} disabled={pending} type="submit">
          {pending ? t("signingIn") : t("verify")}
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={signIn}>
      {failure ? (
        <FormError className={ERROR}>
          {failure === "mismatch" ? t("signInFailed") : t(FAILURE[failure])}
        </FormError>
      ) : null}
      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="email">
          {t("email")}
        </Label>
        <Input
          aria-invalid={failure === "mismatch" || undefined}
          autoComplete="username"
          className={FIELD}
          id="email"
          name="email"
          required
          type="email"
        />
      </div>
      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="password">
          {t("password")}
        </Label>
        <div className="relative">
          <Input
            aria-invalid={failure === "mismatch" || undefined}
            autoComplete="current-password"
            className={`${FIELD} pe-12`}
            id="password"
            name="password"
            required
            type={revealed ? "text" : "password"}
          />
          <Button
            aria-label={revealed ? t("hidePassword") : t("showPassword")}
            className="absolute end-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setRevealed((shown) => !shown)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      </div>
      <Button className={`mt-2 ${SUBMIT}`} disabled={pending} type="submit">
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
