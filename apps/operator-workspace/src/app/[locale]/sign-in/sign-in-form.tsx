"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, FormError, Input, Label } from "@ranza/ui";
import { post, refusalOf, type Refusal } from "../../../lib/auth-client";

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

/** What is said when the answer was not a refusal, at either step. */
const FAILURE = {
  expired: "challengeExpired",
  unavailable: "signInUnavailable",
} as const;

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
 */
export function SignInForm({ redirectTo }: { redirectTo: string }) {
  const t = useTranslations();
  const router = useRouter();
  const [challenging, setChallenging] = useState(false);
  const [failure, setFailure] = useState<Refusal | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const email = useRef<HTMLInputElement>(null);

  // On a screen with room for it. A phone's keyboard would cover the form
  // before anybody had read it, and the language switcher comes first in tab
  // order, so a keyboard user would otherwise start two Tabs away (SIGN-10).
  useEffect(() => {
    if (window.matchMedia("(min-width: 768px)").matches) {
      email.current?.focus();
    }
  }, []);

  /** What a refusal says, for either step. */
  function said(
    refusal: Refusal,
    mismatch: "signInFailed" | "challengeFailed",
  ) {
    switch (refusal.failure) {
      case "mismatch":
        return t(mismatch);
      case "throttled":
        return refusal.retryAfter === null
          ? t("signInThrottled")
          : t("signInThrottledAfter", { seconds: refusal.retryAfter });
      default:
        return t(FAILURE[refusal.failure]);
    }
  }

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

    const response = await post(
      "/api/auth/sign-in/email",
      {
        email: form.get("email"),
        password: form.get("password"),
      },
      "sign-in",
    );

    if (!response?.ok) {
      const refusal = await refusalOf(response, "sign-in");
      setPending(false);
      setFailure(refusal);
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

    const response = await post(endpoint, { code: code.trim() }, "sign-in");

    if (!response?.ok) {
      const refusal = await refusalOf(response, "sign-in");
      setPending(false);
      // A spent challenge cannot be answered, so back to the password, which
      // starts a new one.
      if (refusal.failure === "expired") setChallenging(false);
      setFailure(refusal);
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
            {said(failure, "challengeFailed")}
          </FormError>
        ) : null}
        <div className="grid gap-2">
          <Label className={LABEL} htmlFor="code">
            {t("code")}
          </Label>
          <Input
            aria-invalid={failure?.failure === "mismatch" || undefined}
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
        {/* The way back to the password: a wrong account or a mistyped
            password is otherwise only escaped by five wrong codes or a
            reload (SIGN-12). */}
        <Button
          className="text-muted-foreground"
          onClick={() => {
            setChallenging(false);
            setFailure(null);
          }}
          type="button"
          variant="ghost"
        >
          {t("useAnotherAccount")}
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={signIn}>
      {failure ? (
        <FormError className={ERROR}>{said(failure, "signInFailed")}</FormError>
      ) : null}
      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="email">
          {t("email")}
        </Label>
        <Input
          aria-invalid={failure?.failure === "mismatch" || undefined}
          autoComplete="username"
          className={FIELD}
          id="email"
          name="email"
          ref={email}
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
            aria-invalid={failure?.failure === "mismatch" || undefined}
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
