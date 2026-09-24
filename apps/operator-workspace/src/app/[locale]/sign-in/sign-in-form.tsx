"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, FormError, Input, Label } from "@ranza/ui";

/*
 * Leaders' login fields: tall pills on the ivory card, named by their
 * placeholder, with the label kept for assistive technology. 16px text on a
 * phone, so iOS does not zoom into the field.
 */
const FIELD =
  "h-13 rounded-full border-[1.5px] border-sign-in-field bg-transparent px-6 text-base text-sign-in-ink shadow-none placeholder:text-sign-in-ink-muted md:text-[15px] lg:h-14";
const SUBMIT =
  "h-13 w-full rounded-full bg-sign-in-cta text-base font-bold tracking-wide text-white shadow-md hover:bg-sign-in-cta/90 lg:h-14";
const ERROR =
  "rounded-2xl border border-danger/15 bg-danger-soft p-4 text-center text-sm text-danger";

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
      <form className="grid gap-5" onSubmit={verify}>
        <p className="text-sm font-medium text-sign-in-ink-muted">
          {t("challengeSummary")}
        </p>
        {failed ? (
          <FormError className={ERROR}>{t("challengeFailed")}</FormError>
        ) : null}
        <Label className="sr-only" htmlFor="code">
          {t("code")}
        </Label>
        <Input
          aria-invalid={failed || undefined}
          autoComplete="one-time-code"
          autoFocus
          className={FIELD}
          id="code"
          inputMode="text"
          name="code"
          placeholder={t("code")}
          required
        />
        <Button className={SUBMIT} disabled={pending} type="submit">
          {pending ? t("signingIn") : t("verify")}
        </Button>
      </form>
    );
  }

  return (
    <form className="grid gap-5" onSubmit={signIn}>
      {failed ? (
        <FormError className={ERROR}>{t("signInFailed")}</FormError>
      ) : null}
      <Label className="sr-only" htmlFor="email">
        {t("email")}
      </Label>
      <Input
        aria-invalid={failed || undefined}
        autoComplete="username"
        className={FIELD}
        id="email"
        name="email"
        placeholder={t("email")}
        required
        type="email"
      />
      <Label className="sr-only" htmlFor="password">
        {t("password")}
      </Label>
      <Input
        aria-invalid={failed || undefined}
        autoComplete="current-password"
        className={FIELD}
        id="password"
        name="password"
        placeholder={t("password")}
        required
        type="password"
      />
      <Button className={`mt-2 ${SUBMIT}`} disabled={pending} type="submit">
        {pending ? t("signingIn") : t("signIn")}
      </Button>
    </form>
  );
}
