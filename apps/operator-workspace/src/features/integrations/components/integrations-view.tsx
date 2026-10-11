"use client";

import { AlertTriangle, CheckCircle2, Network, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Stat } from "@ranza/ui";
import type {
  EndpointsView,
  FailedOperationRecord,
} from "../../../server/viewer";
import { AddEndpointDialog } from "./add-endpoint-dialog";
import { EndpointCards } from "./endpoint-cards";
import { FailedOperationsTable } from "./failed-operations-table";

interface IntegrationsViewProps {
  endpoints: EndpointsView;
  failedOperations: readonly FailedOperationRecord[];
  /** Whether the viewer holds integrations.manage at this Property. */
  mayActOnFailures: boolean;
  locale: string;
  propertyId: string;
}

export function IntegrationsView({
  endpoints,
  failedOperations,
  mayActOnFailures,
  locale,
  propertyId,
}: IntegrationsViewProps) {
  const t = useTranslations("integrations");

  const count = (health: "delivering" | "failing") =>
    endpoints.endpoints.filter((endpoint) => endpoint.health === health).length;

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Stat
          icon={Network}
          label={t("endpointsCount")}
          value={endpoints.endpoints.length}
        />
        <Stat
          icon={CheckCircle2}
          label={t("deliveringCount")}
          value={count("delivering")}
        />
        <Stat
          icon={AlertTriangle}
          label={t("failingCount")}
          value={count("failing")}
        />
        <Stat
          icon={XCircle}
          label={t("openFailuresCount")}
          value={failedOperations.length}
        />
      </div>

      <section
        aria-labelledby="failed-operations-heading"
        className="space-y-3"
      >
        <h2 className="sr-only" id="failed-operations-heading">
          {t("failedOperationsTitle")}
        </h2>
        <FailedOperationsTable
          failedOperations={failedOperations}
          locale={locale}
          mayAct={mayActOnFailures}
          propertyId={propertyId}
        />
      </section>

      <section aria-labelledby="endpoints-heading" className="space-y-4">
        {/* One dialog, in one place, whether or not there are endpoints yet: the
            signing secret of a new one lives in its state, and moving it in the
            tree when the first endpoint appears would drop the only copy. */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2
              className="flex items-center gap-2 text-step-0 font-semibold"
              id="endpoints-heading"
            >
              <Network aria-hidden="true" className="size-4 text-primary" />
              {t("endpointsTitle")}
            </h2>
            <p className="mt-0.5 text-step--1 text-muted-foreground">
              {t("endpointsDescription")}
            </p>
          </div>
          {endpoints.mayManage ? (
            <AddEndpointDialog locale={locale} propertyId={propertyId} />
          ) : null}
        </div>
        {!endpoints.mayManage && endpoints.endpoints.length > 0 ? (
          <p className="text-step--1 text-muted-foreground">{t("readOnly")}</p>
        ) : null}
        <EndpointCards
          locale={locale}
          propertyId={propertyId}
          view={endpoints}
        />
      </section>
    </div>
  );
}
