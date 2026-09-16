"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button, Fact, FactList, Field, FormError, Input } from "@ranza/ui";
import type { Messages } from "../../../../messages";

/**
 * Turning a second factor on, and off again.
 *
 * Enrolment is two steps on purpose, and the order is the point: Better Auth
 * writes the secret unverified and leaves the account alone until a code proves
 * the authenticator app really has it. Someone who closes this page halfway can
 * still sign in with their password — which is the difference between a
 * mis-scanned key costing a retry and costing an account.
 *
 * The setup key is shown as text rather than a QR code. A QR needs an encoder,
 * and every authenticator app accepts a typed key; the `otpauth:` link covers
 * the phone case, where tapping it opens the app directly.
 */
export function TwoFactorPanel({
  copy,
  enabled,
}: {
  copy: Messages;
  enabled: boolean;
}) {
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<{
    uri: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setPending(true);
    setFailed(null);

    const response = await fetch("/api/auth/two-factor/enable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);

    if (!response.ok) {
      setFailed(copy.enrolFailed);
      return;
    }

    const body = (await response.json()) as {
      totpURI: string;
      backupCodes: string[];
    };
    setEnrolment({
      uri: body.totpURI,
      // The key an authenticator app asks for when it is typed in by hand.
      secret: new URL(body.totpURI).searchParams.get("secret") ?? "",
      backupCodes: body.backupCodes,
    });
  }

  async function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    setPending(true);
    setFailed(null);

    const response = await fetch("/api/auth/two-factor/verify-totp", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code: code.trim() }),
    });
    setPending(false);

    if (!response.ok) {
      setFailed(copy.challengeFailed);
      return;
    }

    setEnrolment(null);
    router.refresh();
  }

  async function turnOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    setPending(true);
    setFailed(null);

    const response = await fetch("/api/auth/two-factor/disable", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password }),
    });
    setPending(false);

    if (!response.ok) {
      setFailed(copy.enrolFailed);
      return;
    }

    router.refresh();
  }

  const error = failed ? <FormError>{failed}</FormError> : null;

  if (enrolment) {
    return (
      <section className="max-w-prose pt-7">
        <h2 className="text-step-1 font-normal">{copy.twoFactor}</h2>
        <p className="mt-2 text-ink-soft">{copy.scanHint}</p>

        <FactList>
          <Fact label={copy.secretLabel}>
            <code className="rounded-sm bg-brass-soft px-2 py-1 font-mono text-step--1 tracking-[0.08em] text-brass-deep">
              {enrolment.secret}
            </code>
          </Fact>
        </FactList>

        <p className="mt-4">
          <a className="underline underline-offset-4" href={enrolment.uri}>
            {copy.twoFactor}
          </a>
        </p>

        <h3 className="mt-8 text-step-0 font-medium">{copy.backupCodes}</h3>
        <p className="mt-1 text-ink-soft">{copy.backupCodesWarning}</p>
        <ul className="mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 p-0">
          {enrolment.backupCodes.map((code) => (
            <li key={code}>
              <code className="block rounded-sm bg-brass-soft px-2 py-1 text-center font-mono text-step--1 tracking-[0.08em] text-brass-deep">
                {code}
              </code>
            </li>
          ))}
        </ul>

        <form className="mt-6 grid max-w-xs gap-4" onSubmit={confirm}>
          <Field htmlFor="confirm-code" label={copy.code}>
            <Input
              autoComplete="one-time-code"
              id="confirm-code"
              inputMode="numeric"
              name="code"
              required
            />
          </Field>
          {error}
          <Button disabled={pending} type="submit">
            {copy.verify}
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="max-w-prose pt-7">
      <h2 className="text-step-1 font-normal">{copy.twoFactor}</h2>
      <p className="mt-2 text-ink-soft">
        <strong className="text-foreground">
          {enabled ? copy.twoFactorOn : copy.twoFactorOff}
        </strong>{" "}
        — {copy.twoFactorSummary}
      </p>

      <form
        className="mt-6 grid max-w-xs gap-4"
        onSubmit={enabled ? turnOff : begin}
      >
        <Field htmlFor="security-password" label={copy.confirmWithPassword}>
          <Input
            autoComplete="current-password"
            id="security-password"
            name="password"
            required
            type="password"
          />
        </Field>
        {error}
        <Button disabled={pending} type="submit">
          {enabled ? copy.disable : copy.enable}
        </Button>
      </form>
    </section>
  );
}
