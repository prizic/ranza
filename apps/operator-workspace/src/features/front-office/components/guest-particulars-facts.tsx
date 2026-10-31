"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { DialogFacts, DialogSection } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";

/** What `/api/front-office/guest-particulars` answers; null for none to show. */
interface Particulars {
  dateOfBirth: string | null;
  institution: string | null;
  studyYear: number | null;
  guardianName: string | null;
  guardianPhone: string | null;
  emergencyName: string | null;
  emergencyPhone: string | null;
}

type Read =
  | { kind: "loading" }
  | { kind: "ready"; particulars: Particulars | null }
  | { kind: "failed" };

const LINK_CLASS =
  "font-medium text-primary-text underline-offset-4 hover:underline";

/**
 * A booking's student particulars, on the booking (GP-S1-05).
 *
 * Read when the booking is opened, not with the list, so the Reservations page
 * never carries every student's date of birth and guardian to the browser.
 * Nothing is drawn while it is read, nor when there is nothing to show — none
 * recorded and not allowed to read them are one answer, which the database
 * gives. A failed read is said, so it is never taken for none.
 */
export function GuestParticularsFacts({
  locale,
  reservationId,
}: {
  locale: SupportedLocale;
  reservationId: string;
}) {
  const t = useTranslations("particulars");
  const [read, setRead] = useState<Read>({ kind: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    setRead({ kind: "loading" });
    fetch(
      `/api/front-office/guest-particulars?reservation=${encodeURIComponent(reservationId)}`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) {
          throw Object.assign(new Error("particulars could not be read"), {
            status: response.status,
          });
        }
        const body = (await response.json()) as {
          particulars?: Particulars | null;
        };
        setRead({ kind: "ready", particulars: body.particulars ?? null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        // The route has logged its half; this is the browser's.
        console.error("guest_particulars.read_failed", {
          reservationId,
          error,
        });
        setRead({ kind: "failed" });
      });
    return () => controller.abort();
  }, [reservationId]);

  if (read.kind === "loading") return null;
  if (read.kind === "failed") {
    return (
      <DialogSection title={t("title")}>
        <p className="m-0 text-step--1 text-muted-foreground" role="status">
          {t("unavailable")}
        </p>
      </DialogSection>
    );
  }
  const { particulars } = read;
  if (!particulars) return null;

  const phone = (value: string | null) =>
    value ? (
      <a className={LINK_CLASS} href={`tel:${value}`}>
        <bdi>{value}</bdi>
      </a>
    ) : null;
  const born = particulars.dateOfBirth
    ? formatDate(new Date(`${particulars.dateOfBirth}T00:00:00Z`), locale, {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;

  const rows = (
    [
      [t("dateOfBirth"), born],
      [t("institution"), particulars.institution],
      [
        t("studyYear"),
        particulars.studyYear === null ? null : String(particulars.studyYear),
      ],
      [t("guardianName"), particulars.guardianName],
      [t("guardianPhone"), phone(particulars.guardianPhone)],
      [t("emergencyName"), particulars.emergencyName],
      [t("emergencyPhone"), phone(particulars.emergencyPhone)],
    ] as const
  ).filter(([, value]) => value !== null);

  return (
    <DialogSection title={t("title")}>
      <DialogFacts rows={rows} />
    </DialogSection>
  );
}
