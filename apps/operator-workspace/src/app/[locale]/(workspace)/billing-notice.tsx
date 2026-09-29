import { CreditCard } from "lucide-react";
import { isolate } from "@ranza/i18n";
import type { BillingNotice as Notice } from "@ranza/core";

/**
 * The Owner's billing notice while a Subscription is past due (OA-S1-14,
 * ADR 0040). It warns and blocks nothing: past_due is the grace period, and
 * the Workspace keeps working until the Control Plane suspends it.
 *
 * One line per Organization, because an Owner of two may have one paid and
 * one overdue, and the notice must say which.
 */
export function BillingNotice({
  notices,
  title,
  description,
}: {
  notices: readonly Notice[];
  title: (organization: string) => string;
  description: string;
}) {
  if (notices.length === 0) return null;
  return (
    <div
      className="mb-4 grid gap-1 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-step--1"
      role="status"
    >
      {notices.map((notice) => (
        <p
          className="flex items-center gap-2 font-semibold text-warning"
          key={notice.organizationId}
        >
          <CreditCard aria-hidden="true" className="size-4 shrink-0" />
          {title(isolate(notice.organizationName))}
        </p>
      ))}
      <p className="ps-6 text-muted-foreground">{description}</p>
    </div>
  );
}
