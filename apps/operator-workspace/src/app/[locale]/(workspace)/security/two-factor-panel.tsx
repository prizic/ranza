"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@ranza/ui";
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

  const error = failed ? (
    <p className="field-error" role="alert">
      {failed}
    </p>
  ) : null;

  if (enrolment) {
    return (
      <section className="setting">
        <h2>{copy.twoFactor}</h2>
        <p>{copy.scanHint}</p>

        <dl className="facts">
          <div>
            <dt>{copy.secretLabel}</dt>
            <dd>
              <code className="secret">{enrolment.secret}</code>
            </dd>
          </div>
        </dl>

        <p>
          <a href={enrolment.uri}>{copy.twoFactor}</a>
        </p>

        <h3>{copy.backupCodes}</h3>
        <p>{copy.backupCodesWarning}</p>
        <ul className="backup-codes">
          {enrolment.backupCodes.map((code) => (
            <li key={code}>
              <code>{code}</code>
            </li>
          ))}
        </ul>

        <form onSubmit={confirm}>
          <p className="field">
            <label htmlFor="confirm-code">{copy.code}</label>
            <input
              autoComplete="one-time-code"
              id="confirm-code"
              inputMode="numeric"
              name="code"
              required
            />
          </p>
          {error}
          <Button disabled={pending} type="submit">
            {copy.verify}
          </Button>
        </form>
      </section>
    );
  }

  return (
    <section className="setting">
      <h2>{copy.twoFactor}</h2>
      <p>
        <strong>{enabled ? copy.twoFactorOn : copy.twoFactorOff}</strong> —{" "}
        {copy.twoFactorSummary}
      </p>

      <form onSubmit={enabled ? turnOff : begin}>
        <p className="field">
          <label htmlFor="security-password">{copy.confirmWithPassword}</label>
          <input
            autoComplete="current-password"
            id="security-password"
            name="password"
            required
            type="password"
          />
        </p>
        {error}
        <Button disabled={pending} type="submit">
          {enabled ? copy.disable : copy.enable}
        </Button>
      </form>
    </section>
  );
}
