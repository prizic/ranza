"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  Info,
} from "lucide-react";
import type {
  ServiceRequestItem,
  ServiceRequestStaff,
  ServiceRequestUnit,
} from "@ranza/guest-services";
import type { SupportedLocale } from "@ranza/i18n";
import { PageHeader, Stat } from "@ranza/ui";
import { CreateRequestDialog } from "./create-request-dialog";
import { RequestsTable } from "./requests-table";

export interface GuestExperienceViewProps {
  requests: readonly ServiceRequestItem[];
  locale: SupportedLocale;
  propertyId: string;
  timeZone?: string;
  units?: readonly ServiceRequestUnit[];
  staff: readonly ServiceRequestStaff[];
  viewerId: string;
  mayCreate: boolean;
  mayManage: boolean;
}

export function GuestExperienceView({
  requests,
  locale,
  propertyId,
  timeZone = "UTC",
  units = [],
  staff,
  viewerId,
  mayCreate,
  mayManage,
}: GuestExperienceViewProps) {
  const t = useTranslations("guestExperience");
  const [urgentOnly, setUrgentOnly] = useState(false);

  const counts = useMemo(() => {
    let open = 0;
    let urgent = 0;
    let closed = 0;

    for (const r of requests) {
      if (r.status === "new" || r.status === "in_progress") {
        open++;
        if (r.priority === "urgent") urgent++;
      } else {
        closed++;
      }
    }

    return { all: requests.length, open, urgent, closed };
  }, [requests]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        aside={
          mayCreate ? (
            <CreateRequestDialog
              locale={locale}
              propertyId={propertyId}
              units={units}
            />
          ) : null
        }
      >
        {/* h2: the page bar already sets this route's one h1, and the
            Property is named in the bar above. */}
        <h2 className="max-w-prose text-step-0 text-muted-foreground">
          {t("subheading")}
        </h2>
      </PageHeader>

      {mayManage ? null : (
        <p className="flex items-start gap-2 rounded-lg border bg-muted/40 px-4 py-3 text-step--1 text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          {mayCreate ? t("manageNotice") : t("viewOnlyNotice")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          icon={ClipboardList}
          label={t("allRequests")}
          value={counts.all}
        />
        <Stat icon={Clock} label={t("openRequests")} value={counts.open} />
        <button
          aria-pressed={urgentOnly}
          className="rounded-xl text-start focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          onClick={() => setUrgentOnly((on) => !on)}
          title={urgentOnly ? t("urgentFilterOn") : undefined}
          type="button"
        >
          <Stat
            icon={AlertTriangle}
            label={t("urgentOpen")}
            value={counts.urgent}
          />
        </button>
        <Stat
          icon={CheckCircle2}
          label={t("resolvedRequests")}
          value={counts.closed}
        />
      </div>

      <RequestsTable
        locale={locale}
        mayManage={mayManage}
        propertyId={propertyId}
        requests={requests}
        staff={staff}
        timeZone={timeZone}
        urgentOnly={urgentOnly}
        viewerId={viewerId}
      />
    </div>
  );
}
