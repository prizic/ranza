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
      <form className="mt-6 grid gap-4" onSubmit={verify}>
        <p className="text-muted-foreground">{t("challengeSummary")}</p>
        <Field htmlFor="code" label={t("code")}>
          <Input
            aria-invalid={failed || undefined}
            autoComplete="one-time-code"
            autoFocus
            id="code"
            inputMode="text"
            name="code"
            required
          />
        </Field>
        {failed ? <FormError>{t("challengeFailed")}</FormError> : null}
        <Button disabled={pending} type="submit">
          {pending ? t("signingIn") : t("verify")}
        </Button>
      </form>
    );
  }

  return (
    <form className="mt-6 grid gap-4" onSubmit={signIn}>
      <p className="text-muted-foreground">{t("signInSummary")}</p>
      <Field htmlFor="email" label={t("email")}>
        <Input
          aria-invalid={failed || undefined}
          autoComplete="username"
          id="email"
          name="email"
          required
          type="email"
        />
      </Field>
      <Field htmlFor="password" label={t("password")}>
        <Input
          aria-invalid={failed || undefined}
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </Field>
      {failed ? <FormError>{t("signInFailed")}</FormError> : null}
      <Button disabled={pending} type="submit">
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
