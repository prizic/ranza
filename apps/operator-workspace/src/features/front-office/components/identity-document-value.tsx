"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@ranza/ui";
import {
  isDocumentType,
  maskedDocumentNumber,
} from "../../../lib/identity-document";

type Reveal =
  | { kind: "masked" }
  | { kind: "asking" }
  | { kind: "shown"; number: string }
  | { kind: "failed" };

/**
 * A registration's identity document: its kind and the last four characters
 * of its number, with one press to see the rest (PA-S2-*).
 *
 * The number in full is a second request, because asking is recorded in the
 * audit log and the sheet never carries it otherwise; the database function
 * behind it asks the same permission as the particulars. It is hidden again
 * when the booking changes, so opening the next student never shows the last
 * one's number.
 */
export function IdentityDocumentValue({
  documentType,
  lastFour,
  reservationId,
}: {
  documentType: string;
  lastFour: string;
  reservationId: string;
}) {
  const t = useTranslations("particulars");
  const [reveal, setReveal] = useState<Reveal>({ kind: "masked" });

  useEffect(() => setReveal({ kind: "masked" }), [reservationId]);

  async function show() {
    setReveal({ kind: "asking" });
    try {
      const response = await fetch(
        `/api/front-office/guest-identity-document?reservation=${encodeURIComponent(reservationId)}`,
        { method: "POST" },
      );
      if (!response.ok) {
        throw Object.assign(new Error("document number could not be shown"), {
          status: response.status,
        });
      }
      const body = (await response.json()) as {
        document?: { documentNumber: string } | null;
      };
      if (!body.document) throw new Error("document number not returned");
      setReveal({ kind: "shown", number: body.document.documentNumber });
    } catch (error: unknown) {
      // The route has logged its half; this is the browser's.
      console.error("guest_identity_document.reveal_failed", {
        reservationId,
        error,
      });
      setReveal({ kind: "failed" });
    }
  }

  const kind = isDocumentType(documentType)
    ? t(`documentTypes.${documentType}`)
    : documentType;

  return (
    <span className="flex flex-wrap items-center justify-end gap-x-2 gap-y-1">
      <span>{kind}</span>
      <bdi className="tabular-nums" dir="ltr">
        {reveal.kind === "shown"
          ? reveal.number
          : maskedDocumentNumber(lastFour)}
      </bdi>
      {reveal.kind === "shown" ? (
        <Button
          onClick={() => setReveal({ kind: "masked" })}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("documentHide")}
        </Button>
      ) : (
        <Button
          disabled={reveal.kind === "asking"}
          onClick={show}
          size="sm"
          type="button"
          variant="ghost"
        >
          {t("documentShow")}
        </Button>
      )}
      {reveal.kind === "shown" ? (
        <span className="w-full text-step--1 font-normal text-muted-foreground">
          {t("documentRecorded")}
        </span>
      ) : null}
      {reveal.kind === "failed" ? (
        <span
          className="w-full text-step--1 font-normal text-destructive"
          role="status"
        >
          {t("documentRevealFailed")}
        </span>
      ) : null}
    </span>
  );
}
