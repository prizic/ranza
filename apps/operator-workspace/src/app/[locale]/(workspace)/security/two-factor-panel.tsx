"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import {
  Button,
  Checkbox,
  Fact,
  FactList,
  Field,
  FormError,
  Input,
  Label,
  useUnsavedChangesGuard,
} from "@ranza/ui";
import { post, refusalOf, type Refusal } from "../../../../lib/auth-client";

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
 * which is a dependency nobody has decided to add; every authenticator app
 * accepts a typed key, and the `otpauth:` link opens the app on a phone.
 *
 * Every request goes through the same reading of an answer the sign-in form
 * uses, so a dropped connection or a throttled request is said to be that and
 * not a wrong password, and the button is never left disabled (SIGN-05).
 */
export function TwoFactorPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations();
  const router = useRouter();
  const [enrolment, setEnrolment] = useState<{
    uri: string;
    secret: string;
    backupCodes: string[];
  } | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [codesSaved, setCodesSaved] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [notice, setNotice] = useState<"on" | "off" | null>(null);

  // The codes are shown once; leaving before they are saved loses them and
  // leaves a person who did not mean to with a second factor half set up.
  useUnsavedChangesGuard(enrolment !== null, t("backupCodesLeave"));

  /** Runs one request with the pending flag, and always puts it down again. */
  async function request(
    endpoint: string,
    body: unknown,
    on: (response: Response) => Promise<void> | void,
  ) {
    setPending(true);
    setRefusal(null);
    setNotice(null);
    try {
      const response = await post(endpoint, body, "two-factor");
      if (response?.ok) {
        await on(response);
        return;
      }
      setRefusal(await refusalOf(response, "two-factor"));
    } finally {
      setPending(false);
    }
  }

  function begin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    return request(
      "/api/auth/two-factor/enable",
      { password },
      async (response) => {
        const body = (await response.json()) as {
          totpURI: string;
          backupCodes: string[];
        };
        setCodesSaved(false);
        setCopied(false);
        setCopyFailed(false);
        setEnrolment({
          uri: body.totpURI,
          // The key an authenticator app asks for when it is typed in by hand.
          secret: new URL(body.totpURI).searchParams.get("secret") ?? "",
          backupCodes: body.backupCodes,
        });
      },
    );
  }

  function confirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get("code") ?? "");
    return request(
      "/api/auth/two-factor/verify-totp",
      { code: code.trim() },
      () => {
        setEnrolment(null);
        setNotice("on");
        router.refresh();
      },
    );
  }

  function turnOff(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const password = String(
      new FormData(event.currentTarget).get("password") ?? "",
    );
    return request("/api/auth/two-factor/disable", { password }, () => {
      setNotice("off");
      router.refresh();
    });
  }

  async function copyCodes(codes: string[]) {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopyFailed(false);
      setCopied(true);
    } catch (error) {
      console.error("backup codes could not be copied", error);
      setCopied(false);
      setCopyFailed(true);
    }
  }

  function downloadCodes(codes: string[]) {
    const file = new Blob([`${codes.join("\n")}\n`], { type: "text/plain" });
    const url = URL.createObjectURL(file);
    const link = document.createElement("a");
    link.href = url;
    link.download = "ranza-backup-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  /** What a refusal says: a password or a code that did not match, or why not. */
  function said(mismatch: "enrolFailed" | "challengeFailed") {
    if (!refusal) return null;
    switch (refusal.failure) {
      case "mismatch":
        return t(mismatch);
      case "throttled":
        return refusal.retryAfter === null
          ? t("signInThrottled")
          : t("signInThrottledAfter", { seconds: refusal.retryAfter });
      default:
        return t("requestUnavailable");
    }
  }

  const passwordField = (
    <Field htmlFor="security-password" label={t("confirmWithPassword")}>
      <div className="relative">
        <Input
          aria-invalid={refusal?.failure === "mismatch" || undefined}
          autoComplete="current-password"
          className="pe-12"
          id="security-password"
          name="password"
          required
          type={revealed ? "text" : "password"}
        />
        <Button
          aria-label={revealed ? t("hidePassword") : t("showPassword")}
          className="absolute end-1 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={() => setRevealed((shown) => !shown)}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          {revealed ? <EyeOff /> : <Eye />}
        </Button>
      </div>
    </Field>
  );

  if (enrolment) {
    const error = refusal ? (
      <FormError>{said("challengeFailed")}</FormError>
    ) : null;
    return (
      <section className="max-w-prose pt-7">
        <h2 className="text-step-1 font-normal">{t("twoFactor")}</h2>
        <p className="mt-2 text-muted-foreground">{t("scanHint")}</p>

        <FactList>
          <Fact label={t("secretLabel")}>
            <code className="rounded-sm bg-secondary px-2 py-1 font-mono text-step--1 tracking-[0.08em] text-secondary-foreground">
              {enrolment.secret}
            </code>
          </Fact>
        </FactList>

        <p className="mt-4">
          <a className="underline underline-offset-4" href={enrolment.uri}>
            {t("openAuthenticator")}
          </a>
        </p>

        <h3 className="mt-8 text-step-0 font-medium">{t("backupCodes")}</h3>
        <p className="mt-1 text-muted-foreground">{t("backupCodesWarning")}</p>
        <ul className="mt-3 grid list-none grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2 p-0">
          {enrolment.backupCodes.map((code) => (
            <li key={code}>
              <code className="block rounded-sm bg-secondary px-2 py-1 text-center font-mono text-step--1 tracking-[0.08em] text-secondary-foreground">
                {code}
              </code>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            onClick={() => copyCodes(enrolment.backupCodes)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("copyCodes")}
          </Button>
          <Button
            onClick={() => downloadCodes(enrolment.backupCodes)}
            size="sm"
            type="button"
            variant="outline"
          >
            {t("downloadCodes")}
          </Button>
          <span
            aria-live="polite"
            className="text-step--1 text-muted-foreground"
          >
            {copied ? t("copiedCodes") : copyFailed ? t("copyFailed") : null}
          </span>
        </div>

        <form className="mt-6 grid max-w-xs gap-4" onSubmit={confirm}>
          <div className="flex items-start gap-2">
            <Checkbox
              checked={codesSaved}
              id="codes-saved"
              onCheckedChange={(value) => setCodesSaved(value === true)}
            />
            <Label className="font-normal" htmlFor="codes-saved">
              {t("codesSaved")}
            </Label>
          </div>
          <Field htmlFor="confirm-code" label={t("code")}>
            <Input
              aria-invalid={refusal?.failure === "mismatch" || undefined}
              autoComplete="one-time-code"
              id="confirm-code"
              inputMode="numeric"
              name="code"
              required
            />
          </Field>
          {error}
          <Button disabled={pending || !codesSaved} type="submit">
            {t("verify")}
          </Button>
        </form>
      </section>
    );
  }

  const error = refusal ? <FormError>{said("enrolFailed")}</FormError> : null;
  return (
    <section className="max-w-prose pt-7">
      <h2 className="text-step-1 font-normal">{t("twoFactor")}</h2>
      <p className="mt-2 text-muted-foreground">
        <strong className="text-foreground">
          {enabled ? t("twoFactorOn") : t("twoFactorOff")}
        </strong>{" "}
        — {t("twoFactorSummary")}
      </p>

      {notice ? (
        <p
          className="mt-4 rounded-lg border border-border bg-secondary p-3 text-secondary-foreground"
          role="status"
        >
          {notice === "on" ? t("twoFactorTurnedOn") : t("twoFactorTurnedOff")}
        </p>
      ) : null}

      <form
        className="mt-6 grid max-w-xs gap-4"
        onSubmit={enabled ? turnOff : begin}
      >
        {passwordField}
        {enabled ? (
          <p className="text-step--1 text-muted-foreground">
            {t("twoFactorOffConsequence")}
          </p>
        ) : null}
        {error}
        <Button disabled={pending} type="submit">
          {enabled ? t("disable") : t("enable")}
        </Button>
      </form>
    </section>
  );
}
