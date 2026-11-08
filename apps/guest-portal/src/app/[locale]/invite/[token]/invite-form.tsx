"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants, FormError, Input, Label } from "@ranza/ui";
import { codeOf, post } from "../../../../lib/auth-request";
import type { InviteRefusal } from "../../../../messages";
import { ERROR, FIELD, LABEL, SUBMIT } from "../../form-classes";

type Mode = "create" | "signin";

type Failure =
  | "missing"
  | "mismatch"
  | "accountExists"
  | "tooShort"
  | "throttled"
  | "twoFactor"
  | "failed"
  | "unavailable";

const ACCOUNT_EXISTS = new Set([
  "USER_ALREADY_EXISTS",
  "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL",
]);
const MISMATCH = new Set(["INVALID_EMAIL_OR_PASSWORD", "INVALID_EMAIL"]);
const TOO_SHORT = new Set(["PASSWORD_TOO_SHORT", "PASSWORD_TOO_LONG"]);

/** The words for each failure that is not the link's own refusal. */
const FAILURE = {
  accountExists: "invite.accountExists",
  failed: "invite.failed",
  mismatch: "signInFailed",
  missing: "invite.missing",
  throttled: "signInThrottled",
  tooShort: "invite.passwordTooShort",
  twoFactor: "invite.twoFactor",
  unavailable: "signInUnavailable",
} as const;

/**
 * What an auth answer that is not a success means. Anything not recognised is
 * the form not working, and is logged, because this application has no client
 * error reporter yet and nothing else would record it (GP-DEF-04).
 */
async function failureOf(response: Response | null): Promise<Failure> {
  if (response === null) return "unavailable";
  if (response.status === 429) return "throttled";
  const body: unknown = await response.json().catch((error: unknown) => error);
  const code = codeOf(body);
  if (code && ACCOUNT_EXISTS.has(code)) return "accountExists";
  if (code && TOO_SHORT.has(code)) return "tooShort";
  if (code && MISMATCH.has(code)) return "mismatch";
  console.error("invite sign-in refused unexpectedly", response.status, code);
  return "unavailable";
}

/**
 * The JSON an answer carried, or null when it carried none. An answer that is
 * not JSON is logged, because this application has no client error reporter yet
 * (GP-DEF-04) and a form that quietly read nothing would look like a success.
 */
async function bodyOf<T>(response: Response): Promise<T | null> {
  try {
    return (await response.json()) as T;
  } catch (error: unknown) {
    console.error(
      "portal invitation answer was not JSON",
      response.status,
      error,
    );
    return null;
  }
}

/**
 * Creating an account, or signing in, and then connecting it to the Guest the
 * link was made for, in one step (GP-S3-12).
 *
 * The token stays in the address from the first view to the last: nothing here
 * stores it, so there is no cookie to outlive the visit and no second place for
 * it to leak from. Sign-up signs in, so the connection that follows is made as
 * the new account; a failure after that point is retried without making the
 * account again.
 *
 * A signed-in visitor is not asked for a password: the page shows whose stay
 * the link opens and whose account is about to be connected, because opening
 * somebody else's link on a shared phone is the mistake to prevent.
 *
 * An account with a second sign-in step cannot be completed from here, so it is
 * sent to the sign-in page and back to the link, which keeps working.
 */
export function InviteForm({
  guestEmail,
  guestName,
  signedInAs,
  signInHref,
  stayHref,
  token,
}: {
  guestEmail: string | null;
  guestName: string;
  signedInAs: string | null;
  signInHref: string;
  stayHref: string;
  token: string;
}) {
  const t = useTranslations();
  const router = useRouter();
  const firstField = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("create");
  // Held here and not left in the field, so the address typed survives a move
  // to the sign-in form when the account turns out to exist.
  const [email, setEmail] = useState(guestEmail ?? "");
  const [failure, setFailure] = useState<Failure | null>(null);
  const [refused, setRefused] = useState<InviteRefusal | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  // Set once an account exists and is signed in, so a retry connects it and
  // does not try to make it again.
  const [authenticated, setAuthenticated] = useState(signedInAs !== null);

  useEffect(() => {
    if (failure !== null) firstField.current?.focus();
  }, [failure]);

  async function connect(): Promise<void> {
    const response = await post("/api/portal-invitation/accept", { token });
    if (!response?.ok) {
      if (response) {
        console.error("portal invitation was not accepted", response.status);
      }
      setFailure("failed");
      return;
    }
    const body = await bodyOf<{ outcome?: string }>(response);
    if (body?.outcome === "accepted") {
      router.replace(stayHref);
      router.refresh();
      return;
    }
    if (
      body?.outcome === "unknown" ||
      body?.outcome === "expired" ||
      body?.outcome === "revoked" ||
      body?.outcome === "used" ||
      body?.outcome === "another_guest"
    ) {
      setRefused(body.outcome);
      return;
    }
    console.error("portal invitation answered unexpectedly", body);
    setFailure("failed");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");

    if (!authenticated) {
      if (!email.trim() || !password || (mode === "create" && !name)) {
        setFailure("missing");
        return;
      }
    }
    setPending(true);
    setFailure(null);
    setRevealed(false);

    try {
      if (!authenticated) {
        const response =
          mode === "create"
            ? await post("/api/auth/sign-up/email", {
                name,
                email: email.trim(),
                password,
              })
            : await post("/api/auth/sign-in/email", {
                email: email.trim(),
                password,
              });
        if (!response?.ok) {
          const failed = await failureOf(response);
          // An address that already has an account is a person who should sign
          // in with it, so the form is moved there with the address kept.
          if (failed === "accountExists") setMode("signin");
          setFailure(failed);
          return;
        }
        const body = await bodyOf<{ twoFactorRedirect?: boolean }>(response);
        if (body?.twoFactorRedirect) {
          setFailure("twoFactor");
          return;
        }
        setAuthenticated(true);
      }
      await connect();
    } finally {
      setPending(false);
    }
  }

  async function useAnotherAccount(): Promise<void> {
    setPending(true);
    setFailure(null);
    try {
      const response = await post("/api/auth/sign-out", {});
      if (!response?.ok) {
        setFailure("unavailable");
        return;
      }
      setAuthenticated(false);
      // A refusal said about the account just left is no longer true of
      // whoever signs in next.
      setRefused(null);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  if (refused) {
    return (
      <div className="grid gap-5">
        <div aria-live="polite" role="status">
          <p className="text-lg font-semibold text-foreground">
            {t(`invite.refused.${refused}.title`)}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`invite.refused.${refused}.body`)}
          </p>
        </div>
        <Link className={buttonVariants({ className: SUBMIT })} href={stayHref}>
          {t("goToStay")}
        </Link>
        {refused === "another_guest" ? (
          <Button
            className="h-11 w-full text-sm"
            disabled={pending}
            onClick={() => void useAnotherAccount()}
            type="button"
            variant="ghost"
          >
            {t("invite.useAnother")}
          </Button>
        ) : null}
        {failure ? (
          <FormError className={ERROR}>{t(FAILURE[failure])}</FormError>
        ) : null}
      </div>
    );
  }

  const notice = failure ? (
    <FormError className={ERROR}>
      {failure === "mismatch" ? t("signInFailed") : t(FAILURE[failure])}
    </FormError>
  ) : null;

  if (authenticated && signedInAs !== null) {
    return (
      <form className="grid gap-5" noValidate onSubmit={submit}>
        {notice}
        <Button className={SUBMIT} disabled={pending} type="submit">
          {pending ? t("invite.working") : t("invite.connect")}
        </Button>
        <Button
          className="h-11 w-full text-sm"
          disabled={pending}
          onClick={() => void useAnotherAccount()}
          type="button"
          variant="ghost"
        >
          {t("invite.useAnother")}
        </Button>
      </form>
    );
  }

  if (authenticated) {
    // Signed in a moment ago and the connection failed: nothing to type again.
    return (
      <form className="grid gap-5" noValidate onSubmit={submit}>
        {notice}
        <Button className={SUBMIT} disabled={pending} type="submit">
          {pending ? t("invite.working") : t("invite.connect")}
        </Button>
      </form>
    );
  }

  const creating = mode === "create";
  return (
    <form className="grid gap-5" noValidate onSubmit={submit}>
      {notice}
      {creating ? (
        <div className="grid gap-2">
          <Label className={LABEL} htmlFor="name">
            {t("invite.name")}
          </Label>
          <Input
            autoComplete="name"
            className={FIELD}
            defaultValue={guestName}
            id="name"
            name="name"
            ref={firstField}
            required
          />
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="email">
          {t("email")}
        </Label>
        <Input
          aria-describedby={creating && guestEmail ? "email-hint" : undefined}
          aria-invalid={failure === "mismatch" || undefined}
          autoComplete={creating ? "email" : "username"}
          className={FIELD}
          id="email"
          inputMode="email"
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          ref={creating ? undefined : firstField}
          required
          type="email"
          value={email}
        />
        {creating && guestEmail ? (
          <p className="text-sm text-muted-foreground" id="email-hint">
            {t("invite.emailHint")}
          </p>
        ) : null}
      </div>
      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="password">
          {t("password")}
        </Label>
        <div className="relative">
          <Input
            aria-describedby={creating ? "password-hint" : undefined}
            aria-invalid={failure === "mismatch" || undefined}
            autoComplete={creating ? "new-password" : "current-password"}
            className={`${FIELD} pe-12`}
            id="password"
            name="password"
            required
            type={revealed ? "text" : "password"}
          />
          <Button
            aria-label={revealed ? t("hidePassword") : t("showPassword")}
            className="absolute end-1 top-1/2 size-11 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setRevealed((shown) => !shown)}
            size="icon"
            type="button"
            variant="ghost"
          >
            {revealed ? <EyeOff /> : <Eye />}
          </Button>
        </div>
        {creating ? (
          <p className="text-sm text-muted-foreground" id="password-hint">
            {t("invite.passwordHint")}
          </p>
        ) : null}
      </div>
      <Button className={`mt-2 ${SUBMIT}`} disabled={pending} type="submit">
        {pending
          ? t("invite.working")
          : creating
            ? t("invite.createSubmit")
            : t("invite.signInSubmit")}
      </Button>
      {failure === "twoFactor" ? (
        <Link
          className={buttonVariants({ className: SUBMIT, variant: "outline" })}
          href={signInHref}
        >
          {t("invite.goSignIn")}
        </Link>
      ) : null}
      <Button
        className="h-11 w-full text-sm"
        disabled={pending}
        onClick={() => {
          setMode(creating ? "signin" : "create");
          setFailure(null);
        }}
        type="button"
        variant="ghost"
      >
        {creating ? t("invite.haveAccount") : t("invite.createAccount")}
      </Button>
    </form>
  );
}
