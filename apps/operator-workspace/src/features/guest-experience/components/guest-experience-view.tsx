"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
} from "lucide-react";
import type { ServiceRequestItem } from "@ranza/guest-services";
import type { SupportedLocale } from "@ranza/i18n";
import { PageHeader, Stat } from "@ranza/ui";
import { CreateRequestDialog } from "./create-request-dialog";
import { RequestsTable } from "./requests-table";

export interface GuestExperienceViewProps {
  requests: readonly ServiceRequestItem[];
  locale: SupportedLocale;
  propertyId: string;
  propertyName: string;
  timeZone?: string;
  units?: readonly { unitId: string; name: string }[];
}

export function GuestExperienceView({
  requests,
  locale,
  propertyId,
  propertyName,
  timeZone = "UTC",
  units = [],
}: GuestExperienceViewProps) {
  const t = useTranslations("guestExperience");

  const counts = useMemo(() => {
    let open = 0;
    let urgent = 0;
    let resolved = 0;

    for (const r of requests) {
      if (r.status === "new" || r.status === "in_progress") {
        open++;
      } else {
        resolved++;
      }
      if (
        r.priority === "urgent" &&
        r.status !== "resolved" &&
        r.status !== "cancelled"
      ) {
        urgent++;
      }
    }

    return {
      all: requests.length,
      open,
      urgent,
      resolved,
    };
  }, [requests]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        aside={
          <CreateRequestDialog
            locale={locale}
            propertyId={propertyId}
            units={units}
          />
        }
      >
        <h2 className="text-step-2 font-semibold tracking-tight">
          {propertyName} · {t("subheading")}
        </h2>
      </PageHeader>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat
          icon={ClipboardList}
          label={t("allRequests")}
          value={counts.all}
        />
        <Stat icon={Clock} label={t("openRequests")} value={counts.open} />
        <Stat
          icon={AlertTriangle}
          label={t("priorities.urgent")}
          value={counts.urgent}
        />
        <Stat
          icon={CheckCircle2}
          label={t("resolvedRequests")}
          value={counts.resolved}
        />
      </div>

      <RequestsTable
        requests={requests}
        locale={locale}
        propertyId={propertyId}
        timeZone={timeZone}
      />
    </div>
  );
}
