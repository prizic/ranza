"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import Script from "next/script";
import type { SupportedLocale } from "@ranza/i18n";
import { leadMessagesFor } from "@ranza/i18n/leads";
import { leadConsentVersion, type LeadErrors } from "@ranza/domain/leads";
import { BidiText } from "@ranza/ui";

declare global {
  interface Window {
    turnstile?: {
      render(element: HTMLElement, options: Record<string, unknown>): string;
      reset(id: string): void;
    };
  }
}
export function LeadForm({
  locale,
  siteKey,
}: {
  locale: SupportedLocale;
  siteKey: string;
}) {
  const m = leadMessagesFor(locale);
  const challenge = useRef<HTMLDivElement>(null),
    widget = useRef<string | null>(null),
    key = useRef<string | null>(null),
    fingerprint = useRef("");
  const summary = useRef<HTMLDivElement>(null);
  const [token, setToken] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{
    ok: boolean;
    correlationId?: string;
    errors?: LeadErrors;
  } | null>(null);
  useEffect(() => {
    if (!result) return;
    requestAnimationFrame(() => summary.current?.focus());
  }, [result]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const form = new FormData(event.currentTarget);
    const fields = Object.fromEntries(form.entries());
    const current = JSON.stringify(fields);
    if (!key.current || fingerprint.current !== current) {
      key.current = crypto.randomUUID();
      fingerprint.current = current;
    }
    setPending(true);
    try {
      const response = await fetch("/api/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...fields,
          consent: form.get("consent") === "on",
          token,
          idempotencyKey: key.current,
        }),
        signal: AbortSignal.timeout(20000),
      });
      const body = await response.json();
      setResult({
        ok: response.ok && body.ok === true,
        ...(typeof body.correlationId === "string"
          ? { correlationId: body.correlationId }
          : {}),
        ...(body.errors ? { errors: body.errors } : {}),
      });
    } catch {
      setResult({ ok: false });
    } finally {
      setPending(false);
      setToken("");
      if (widget.current) window.turnstile?.reset(widget.current);
    }
  }
  return (
    <>
      {siteKey && (
        <Script
          src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
          onReady={() => {
            if (challenge.current && widget.current === null)
              widget.current =
                window.turnstile?.render(challenge.current, {
                  sitekey: siteKey,
                  action: "demo",
                  language: locale,
                  callback: setToken,
                  "expired-callback": () => setToken(""),
                }) ?? null;
          }}
        />
      )}
      <form
        onSubmit={submit}
        noValidate
        className="lead-form"
        aria-busy={pending}
      >
        {(["name", "contact", "operator", "beds", "city"] as const).map(
          (field) => (
            <div className="form-field" key={field}>
              <label htmlFor={`lead-${field}`}>{m[field]}</label>
              <input
                id={`lead-${field}`}
                name={field}
                required
                maxLength={
                  field === "contact"
                    ? 200
                    : field === "operator"
                      ? 160
                      : field === "beds"
                        ? 6
                        : 100
                }
                autoComplete={
                  field === "name"
                    ? "name"
                    : field === "operator"
                      ? "organization"
                      : field === "city"
                        ? "address-level2"
                        : "off"
                }
                inputMode={field === "beds" ? "numeric" : "text"}
                dir={field === "beds" || field === "contact" ? "ltr" : "auto"}
                aria-invalid={!!result?.errors?.[field]}
                aria-describedby={
                  result?.errors?.[field] ? `error-${field}` : undefined
                }
              />
              {result?.errors?.[field] && (
                <span className="field-error" id={`error-${field}`}>
                  {m.errors[result.errors[field]]}
                </span>
              )}
            </div>
          ),
        )}
        <div className="form-field">
          <label htmlFor="lead-language">{m.language}</label>
          <select id="lead-language" name="language" defaultValue={locale}>
            <option value="tr">Türkçe</option>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <div className="form-field lead-wide">
          <label htmlFor="lead-message">{m.message}</label>
          <textarea
            id="lead-message"
            name="message"
            maxLength={2000}
            rows={4}
            dir="auto"
            aria-invalid={!!result?.errors?.message}
            aria-describedby={
              result?.errors?.message ? "error-message" : undefined
            }
          />
          {result?.errors?.message && (
            <span className="field-error" id="error-message">
              {m.errors[result.errors.message]}
            </span>
          )}
        </div>
        <div hidden aria-hidden="true">
          <label htmlFor="lead-website">Website</label>
          <input
            id="lead-website"
            name="website"
            tabIndex={-1}
            autoComplete="off"
          />
        </div>
        <details className="lead-wide">
          <summary>{m.privacy}</summary>
          <p>{m.privacyBody}</p>
          <BidiText>{leadConsentVersion}</BidiText>
        </details>
        <div className="lead-wide">
          <label className="consent-label">
            <input
              type="checkbox"
              name="consent"
              aria-invalid={!!result?.errors?.consent}
              aria-describedby={
                result?.errors?.consent ? "error-consent" : undefined
              }
            />{" "}
            {m.consent}
          </label>
          {result?.errors?.consent && (
            <p className="field-error" id="error-consent">
              {m.errors[result.errors.consent]}
            </p>
          )}
        </div>
        <div className="lead-wide" ref={challenge} />
        <button
          className="button"
          disabled={pending || result?.ok === true}
          type="submit"
        >
          {pending ? m.sending : m.demo}
        </button>
        {result && (
          <div
            className="lead-wide status-message"
            ref={summary}
            tabIndex={-1}
            role={result.ok ? "status" : "alert"}
          >
            <p>
              {result.ok ? m.success : result.errors ? m.invalid : m.failed}
            </p>
            {result.correlationId && (
              <p>
                {m.reference}: <BidiText>{result.correlationId}</BidiText>
              </p>
            )}
          </div>
        )}
      </form>
    </>
  );
}
