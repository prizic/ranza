"use client";
import { useActionState } from "react";
import Image from "next/image";
import { mfaAction, type MfaState } from "./actions";
export function MfaForm({
  locale,
  factorId,
}: {
  locale: string;
  factorId?: string | undefined;
}) {
  const [state, action, pending] = useActionState(mfaAction, {
    factorId,
  } as MfaState);
  const t =
    locale === "tr"
      ? {
          start: "Kimlik doğrulayıcıyı ayarla",
          code: "Doğrulama kodu",
          verify: "Doğrula",
          failed: "Doğrulanamadı",
          qr: "Kimlik doğrulayıcı QR kodu",
        }
      : locale === "ar"
        ? {
            start: "إعداد تطبيق المصادقة",
            code: "رمز التحقق",
            verify: "تحقق",
            failed: "تعذر التحقق",
            qr: "رمز إعداد المصادقة",
          }
        : {
            start: "Set up authenticator",
            code: "Authentication code",
            verify: "Verify",
            failed: "Verification failed",
            qr: "Authenticator setup QR code",
          };
  return (
    <form action={action} className="control-form">
      <input type="hidden" name="locale" value={locale} />
      {state.error ? <p role="alert">{t.failed}</p> : null}
      {state.qr ? (
        <Image
          src={
            state.qr.startsWith("data:")
              ? state.qr
              : `data:image/svg+xml;charset=utf-8,${encodeURIComponent(state.qr)}`
          }
          alt={t.qr}
          width={240}
          height={240}
          unoptimized
        />
      ) : null}
      {state.factorId ? (
        <>
          <input type="hidden" name="factorId" value={state.factorId} />
          <label>
            {t.code}
            <input
              name="code"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
            />
          </label>
        </>
      ) : null}
      <button disabled={pending}>{state.factorId ? t.verify : t.start}</button>
    </form>
  );
}
