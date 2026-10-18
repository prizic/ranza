"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, FormError, Input, Label } from "@ranza/ui";
import type { InvitationRefusal } from "../../../server/invitation";

const LABEL = "text-sm font-semibold text-foreground";
const FIELD =
  "h-13 rounded-md bg-card px-4 text-base shadow-none md:text-[15px]";
const SUBMIT = "h-13 w-full rounded-md text-[15px] font-medium";
const ERROR =
  "rounded-lg border border-danger/15 bg-danger-soft p-3 text-sm font-medium text-danger";

/** A refusal the form can say beside its fields; the rest end the link. */
type Failure =
  | "mismatch"
  | "secondStep"
  | Extract<
      InvitationRefusal,
      "weak_password" | "throttled" | "account_exists" | "unavailable"
    >;

const LINK_ENDED: ReadonlySet<InvitationRefusal> = new Set([
  "unknown",
  "expired",
  "accepted",
  "withdrawn",
  "membership_revoked",
  "other_account",
  "invalid",
]);

async function post(url: string, body: unknown): Promise<Response | null> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.error("invitation request failed", url, error);
    return null;
  }
}

async function reasonOf(response: Response | null): Promise<InvitationRefusal> {
  if (response === null) return "unavailable";
  const body: unknown = await response.json().catch(() => null);
  const reason =
    typeof body === "object" && body !== null && "reason" in body
      ? (body as { reason: unknown }).reason
      : undefined;
  return typeof reason === "string"
    ? (reason as InvitationRefusal)
    : "unavailable";
}

/**
 * Setting a password, signing in with the one already held, or just accepting.
 *
 * The address is shown and never typed: it is the invitation's, and the server
 * takes it from there. A link that stops working while the form is open (it
 * was withdrawn, it was used) is not an error beside a field — the page is
 * re-read and says so in full.
 */
export function AcceptInvitationForm({
  email,
  mode,
  redirectTo,
  signInHref,
  token,
}: {
  email: string;
  mode: "set_password" | "sign_in" | "accept";
  redirectTo: string;
  signInHref: string;
  token: string;
}) {
  const t = useTranslations();
  const a = useTranslations("acceptInvitation");
  const router = useRouter();
  const [failure, setFailure] = useState<Failure | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);

  function enter() {
    router.replace(redirectTo);
    router.refresh();
  }

  async function finish(response: Response | null) {
    if (response?.ok) {
      enter();
      return;
    }
    const reason = await reasonOf(response);
    setPending(false);
    if (LINK_ENDED.has(reason)) {
      router.refresh();
      return;
    }
    setFailure(reason as Failure);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setFailure(null);

    if (mode === "set_password") {
      await finish(
        await post("/api/staff-invitation/accept", {
          token,
          name: String(form.get("name") ?? ""),
          password: String(form.get("password") ?? ""),
        }),
      );
      return;
    }

    if (mode === "sign_in") {
      const signedIn = await post("/api/auth/sign-in/email", {
        email,
        password: String(form.get("password") ?? ""),
      });
      if (!signedIn?.ok) {
        setPending(false);
        setFailure(
          signedIn === null
            ? "unavailable"
            : signedIn.status === 429
              ? "throttled"
              : "mismatch",
        );
        return;
      }
      const body = (await signedIn.json().catch(() => null)) as {
        twoFactorRedirect?: boolean;
      } | null;
      if (body?.twoFactorRedirect) {
        setPending(false);
        setFailure("secondStep");
        return;
      }
    }

    await finish(await post("/api/staff-invitation/accept", { token }));
  }

  return (
    <form className="grid gap-5" onSubmit={submit}>
      {failure ? (
        <FormError className={ERROR}>
          {failure === "mismatch" ? t("signInFailed") : a(`errors.${failure}`)}
          {failure === "secondStep" ? (
            <>
              {" "}
              <Link className="underline" href={signInHref}>
                {a("goToSignIn")}
              </Link>
            </>
          ) : null}
        </FormError>
      ) : null}

      <div className="grid gap-2">
        <Label className={LABEL} htmlFor="invitation-email">
          {t("email")}
        </Label>
        <Input
          className={FIELD}
          id="invitation-email"
          readOnly
          type="email"
          value={email}
        />
      </div>

      {mode === "set_password" ? (
        <div className="grid gap-2">
          <Label className={LABEL} htmlFor="invitation-name">
            {a("name")}
          </Label>
          <Input
            autoComplete="name"
            className={FIELD}
            id="invitation-name"
            maxLength={80}
            name="name"
          />
        </div>
      ) : null}

      {mode === "accept" ? null : (
        <div className="grid gap-2">
          <Label className={LABEL} htmlFor="invitation-password">
            {t("password")}
          </Label>
          <div className="relative">
            <Input
              aria-describedby="invitation-password-hint"
              aria-invalid={
                failure === "weak_password" ||
                failure === "mismatch" ||
                undefined
              }
              autoComplete={
                mode === "set_password" ? "new-password" : "current-password"
              }
              className={`${FIELD} pe-12`}
              id="invitation-password"
              maxLength={128}
              minLength={mode === "set_password" ? 8 : undefined}
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
          <p
            className="text-xs text-muted-foreground"
            id="invitation-password-hint"
          >
            {mode === "set_password" ? a("passwordHint") : a("signInHint")}
          </p>
        </div>
      )}

      <Button className={`mt-2 ${SUBMIT}`} disabled={pending} type="submit">
        {pending ? a("working") : a(`submit.${mode}`)}
      </Button>
    </form>
  );
}
