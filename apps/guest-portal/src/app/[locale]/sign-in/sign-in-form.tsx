"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Field, FormError, Input } from "@ranza/ui";

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
 * A failure says only that it did not match, at either step. Distinguishing
 * "no such account" from "wrong password" would confirm which addresses are
 * registered.
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
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

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
    setFailed(false);

    const response = await fetch("/api/auth/sign-in/email", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        email: form.get("email"),
        password: form.get("password"),
      }),
    });

    if (!response.ok) {
      setPending(false);
      setFailed(true);
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
    setFailed(false);

    const endpoint = /^\d{6}$/.test(code.trim())
      ? "/api/auth/two-factor/verify-totp"
      : "/api/auth/two-factor/verify-backup-code";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });

    if (!response.ok) {
      setPending(false);
      setFailed(true);
      return;
    }

    complete();
  }

  if (challenging) {
    return (
      <form className="mt-4 grid gap-5" onSubmit={verify}>
        <p className="text-sm font-medium text-muted-foreground">
          {t("challengeSummary")}
        </p>
        <Field htmlFor="code" label={t("code")}>
          <Input
            aria-invalid={failed || undefined}
            autoComplete="one-time-code"
            autoFocus
            className="h-13 rounded-[0.875rem] px-4 text-base md:text-[15px]"
            id="code"
            inputMode="text"
            name="code"
            required
          />
        </Field>
        {failed ? <FormError>{t("challengeFailed")}</FormError> : null}
        <Button
          className="h-13 w-full rounded-[0.875rem] text-[15px] font-semibold"
          disabled={pending}
          type="submit"
        >
          {pending ? t("signingIn") : t("verify")}
        </Button>
      </form>
    );
  }

  return (
    <form className="mt-4 grid gap-5" onSubmit={signIn}>
      <Field htmlFor="email" label={t("email")}>
        <Input
          aria-invalid={failed || undefined}
          autoComplete="username"
          className="h-13 rounded-[0.875rem] px-4 text-base md:text-[15px]"
          id="email"
          name="email"
          placeholder="name@example.com"
          required
          type="email"
        />
      </Field>
      <Field htmlFor="password" label={t("password")}>
        <Input
          aria-invalid={failed || undefined}
          autoComplete="current-password"
          className="h-13 rounded-[0.875rem] px-4 text-base md:text-[15px]"
          id="password"
          name="password"
          required
          type="password"
        />
      </Field>
      {failed ? <FormError>{t("signInFailed")}</FormError> : null}
      <Button
        className="h-13 w-full rounded-[0.875rem] text-[15px] font-semibold"
        disabled={pending}
        type="submit"
      >
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
