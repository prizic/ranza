"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ranza/ui";
import type { Messages } from "../../../messages";

/**
 * Posts to the Better Auth route handler, which is what sets the session
 * cookie. Nothing about the credential is handled here beyond passing it on.
 *
 * A failure says only that the pair did not match. Distinguishing "no such
 * account" from "wrong password" would confirm which addresses are registered.
 */
export function SignInForm({
  copy,
  redirectTo,
}: {
  copy: Messages;
  redirectTo: string;
}) {
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

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

    // Left pending through the redirect: the shell reads the session on the
    // server, so the cached tree has to go before anything is shown.
    router.replace(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={signIn}>
      <p className="field">
        <label htmlFor="email">{copy.email}</label>
        <input
          aria-invalid={failed || undefined}
          autoComplete="username"
          id="email"
          name="email"
          required
          type="email"
        />
      </p>
      <p className="field">
        <label htmlFor="password">{copy.password}</label>
        <input
          aria-invalid={failed || undefined}
          autoComplete="current-password"
          id="password"
          name="password"
          required
          type="password"
        />
      </p>
      {failed ? (
        <p className="gate-error" role="alert">
          {copy.signInFailed}
        </p>
      ) : null}
      <Button disabled={pending} type="submit">
        {pending ? copy.signingIn : copy.signIn}
      </Button>
    </form>
  );
}
