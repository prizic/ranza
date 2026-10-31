"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Check, Copy, UserPlus } from "lucide-react";
import { DialogSection, Button, Input } from "@ranza/ui";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { PortalInvitationOverview } from "@ranza/stays";
import {
  inviteToPortal,
  withdrawPortalInvitation,
} from "../../../server/portal-invitation-actions";
import { PortalQrCode } from "./portal-qr-code";

type Read =
  | { kind: "loading" }
  | { kind: "ready"; overview: PortalInvitationOverview | null }
  | { kind: "failed" };

/** The link just made. It exists here and nowhere else (GP-S2-03). */
interface IssuedLink {
  url: string;
  expiresAt: string;
  replacedEarlier: boolean;
}

type Notice =
  | "withdrawn"
  | "failed"
  | "addressMissing"
  | "notAllowed"
  | "alreadyConnected"
  | "nothingToWithdraw";

const WHEN = {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
} as const;

/**
 * Handing a booking's Guest the Portal, on the booking (RANZ-87, GP-S2-*).
 *
 * The common act is one click on the thing itself: "Invite to the portal" makes
 * the link and shows it with a copy button and a QR code, where the desk is
 * already looking, and a Guest at the desk scans it from the screen. No dialog
 * stands in between, because a link carries nothing the gesture cannot: there
 * is no reason to ask, no price to confirm.
 *
 * Read when the booking is opened, like the particulars beside it. Nothing is
 * drawn for a role that may not invite, nor for a booking with no Guest (a
 * walk-in), because neither can do anything with an explanation; a Property
 * with the Portal off says so to a role that could otherwise have invited.
 */
export function PortalInvitationSection({
  locale,
  reservationId,
}: {
  locale: SupportedLocale;
  reservationId: string;
}) {
  const t = useTranslations("portalInvite");
  const [read, setRead] = useState<Read>({ kind: "loading" });
  const [issued, setIssued] = useState<IssuedLink | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<"yes" | "failed" | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      try {
        const response = await fetch(
          `/api/front-office/portal-invitation?reservation=${encodeURIComponent(reservationId)}`,
          signal ? { signal } : {},
        );
        if (!response.ok) {
          throw Object.assign(new Error("invitation could not be read"), {
            status: response.status,
          });
        }
        const body = (await response.json()) as {
          overview?: PortalInvitationOverview | null;
        };
        setRead({ kind: "ready", overview: body.overview ?? null });
      } catch (error: unknown) {
        if (signal?.aborted) return;
        // The route has logged its half; this is the browser's.
        console.error("portal_invitation.read_failed", {
          reservationId,
          error,
        });
        setRead({ kind: "failed" });
      }
    },
    [reservationId],
  );

  useEffect(() => {
    const controller = new AbortController();
    setRead({ kind: "loading" });
    setIssued(null);
    setNotice(null);
    setCopied(null);
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function invite(): Promise<void> {
    setBusy(true);
    setNotice(null);
    setCopied(null);
    try {
      const outcome = await inviteToPortal(locale, reservationId);
      if (outcome.status === "issued") {
        setIssued({
          url: outcome.url,
          expiresAt: outcome.expiresAt,
          replacedEarlier: outcome.replacedEarlier,
        });
        setRead((current) =>
          current.kind === "ready" && current.overview
            ? {
                kind: "ready",
                overview: {
                  ...current.overview,
                  standing: "waiting",
                  expiresAt: outcome.expiresAt,
                },
              }
            : current,
        );
        return;
      }
      if (outcome.status === "no_address") setNotice("addressMissing");
      else if (outcome.status === "failed") setNotice("failed");
      else {
        // A page that was out of date: say why, then show how it stands now.
        setNotice(
          outcome.reason === "already_connected"
            ? "alreadyConnected"
            : "notAllowed",
        );
        await load();
      }
    } catch (error: unknown) {
      console.error("portal_invitation.invite_failed", {
        reservationId,
        error,
      });
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  }

  async function withdraw(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const outcome = await withdrawPortalInvitation(locale, reservationId);
      if (outcome === "withdrawn") {
        setIssued(null);
        setNotice("withdrawn");
        setRead((current) =>
          current.kind === "ready" && current.overview
            ? {
                kind: "ready",
                overview: {
                  ...current.overview,
                  standing: "withdrawn",
                  expiresAt: null,
                },
              }
            : current,
        );
      } else if (outcome === "nothing_to_withdraw") {
        setIssued(null);
        setNotice("nothingToWithdraw");
        await load();
      } else {
        setNotice(outcome === "refused" ? "notAllowed" : "failed");
      }
    } catch (error: unknown) {
      console.error("portal_invitation.withdraw_failed", {
        reservationId,
        error,
      });
      setNotice("failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(url);
      setCopied("yes");
    } catch (error: unknown) {
      console.error("portal_invitation.copy_failed", error);
      setCopied("failed");
    }
  }

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
  const { overview } = read;
  if (!overview || overview.availability === "not_permitted") return null;
  if (overview.availability === "portal_off") {
    return (
      <DialogSection title={t("title")}>
        <p className="m-0 text-step--1 text-muted-foreground">
          {t("portalOff")}
        </p>
      </DialogSection>
    );
  }

  const when = (instant: string | null) =>
    instant ? formatDate(new Date(instant), locale, WHEN) : "";
  const standing = overview.standing;

  return (
    <DialogSection title={t("title")}>
      <div className="space-y-3" data-testid="portal-invitation">
        {standing === "none" ? (
          <p className="m-0 text-step--1 text-muted-foreground">{t("hint")}</p>
        ) : null}
        {standing === "waiting" && !issued ? (
          <p className="m-0 text-step--1" data-testid="portal-invitation-state">
            {t("waiting", { date: when(overview.expiresAt) })}
            <span className="block text-muted-foreground">
              {t("waitingNote")}
            </span>
          </p>
        ) : null}
        {standing === "expired" ? (
          <p className="m-0 text-step--1" data-testid="portal-invitation-state">
            {t("expired", { date: when(overview.expiresAt) })}
          </p>
        ) : null}
        {standing === "connected" ? (
          <p className="m-0 text-step--1" data-testid="portal-invitation-state">
            <Check
              aria-hidden="true"
              className="me-1.5 inline size-4 text-primary-text"
            />
            {t("connected", { date: when(overview.connectedAt) })}
          </p>
        ) : null}

        {issued ? (
          <div className="flex flex-wrap items-start gap-4">
            <PortalQrCode label={t("qrLabel")} value={issued.url} />
            <div className="min-w-0 flex-1 basis-60 space-y-2">
              <p className="m-0 text-sm font-medium">{t("linkLabel")}</p>
              <div className="flex gap-2">
                <Input
                  aria-label={t("linkLabel")}
                  data-testid="portal-invitation-link"
                  dir="ltr"
                  onFocus={(event) => event.currentTarget.select()}
                  readOnly
                  value={issued.url}
                />
                <Button
                  data-testid="portal-invitation-copy"
                  onClick={() => void copy(issued.url)}
                  type="button"
                  variant="outline"
                >
                  {copied === "yes" ? (
                    <Check aria-hidden="true" />
                  ) : (
                    <Copy aria-hidden="true" />
                  )}
                  {copied === "yes" ? t("copied") : t("copy")}
                </Button>
              </div>
              {copied === "failed" ? (
                <p className="m-0 text-sm text-destructive" role="alert">
                  {t("copyFailed")}
                </p>
              ) : null}
              <p className="m-0 text-sm text-muted-foreground">
                {t("expiresNote", { date: when(issued.expiresAt) })}
                {issued.replacedEarlier ? ` ${t("replaced")}` : ""}
              </p>
              <p className="m-0 text-sm text-muted-foreground">{t("qrHint")}</p>
            </div>
          </div>
        ) : null}

        {notice ? (
          <p
            className={
              notice === "withdrawn"
                ? "m-0 text-step--1 text-muted-foreground"
                : "m-0 text-step--1 text-destructive"
            }
            role={notice === "withdrawn" ? "status" : "alert"}
          >
            {t(notice)}
          </p>
        ) : null}

        {standing !== "connected" ? (
          <div className="flex flex-wrap gap-2">
            <Button
              aria-busy={busy}
              data-testid="portal-invitation-invite"
              disabled={busy}
              onClick={() => void invite()}
              type="button"
              variant={standing === "waiting" ? "outline" : "default"}
            >
              <UserPlus aria-hidden="true" />
              {standing === "none" || standing === "withdrawn"
                ? t("invite")
                : t("newLink")}
            </Button>
            {standing === "waiting" ? (
              <Button
                data-testid="portal-invitation-withdraw"
                disabled={busy}
                onClick={() => void withdraw()}
                type="button"
                variant="ghost"
              >
                {t("withdraw")}
              </Button>
            ) : null}
          </div>
        ) : null}
        {standing === "waiting" && !issued ? (
          <p className="m-0 text-sm text-muted-foreground">
            {t("newLinkNote")}
          </p>
        ) : null}
      </div>
    </DialogSection>
  );
}
