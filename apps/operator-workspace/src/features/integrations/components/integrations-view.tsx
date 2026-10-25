"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Network, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { Stat } from "@ranza/ui";
import type {
  EndpointsView,
  FailedOperationPage,
  FailureView,
} from "../../../server/viewer";
import { AddEndpointDialog } from "./add-endpoint-dialog";
import { EndpointCards } from "./endpoint-cards";
import { FailedOperationsTable } from "./failed-operations-table";

interface IntegrationsViewProps {
  endpoints: EndpointsView;
  failures: FailedOperationPage;
  /** The two lists of failures, as the links that open them. */
  hrefs: { open: string; closed: string };
  /** Whether the viewer holds integrations.manage at this Property. */
  mayActOnFailures: boolean;
  locale: string;
  /** How many failures at the Property are open, whichever list is shown. */
  openTotal: number;
  page: number;
  pageSize: number;
  propertyId: string;
  view: FailureView;
  viewerId: string | null;
}

export function IntegrationsView({
  endpoints,
  failures,
  hrefs,
  mayActOnFailures,
  locale,
  openTotal,
  page,
  pageSize,
  propertyId,
  view,
  viewerId,
}: IntegrationsViewProps) {
  const t = useTranslations("integrations");

  const count = (health: "delivering" | "failing") =>
    endpoints.endpoints.filter((endpoint) => endpoint.health === health).length;

  // Nothing connected and nothing failed: four tiles of zero would sit between
  // the person and the one thing this screen is for, so it leads with that
  // (CONFIGURATION-10). The sections keep their places in the tree, and only
  // their order on the page changes, because the dialog that adds an endpoint
  // holds the new secret in its state and cannot be moved or remounted.
  const firstSetup =
    endpoints.endpoints.length === 0 && openTotal === 0 && failures.total === 0;

  return (
    <div className="flex flex-col gap-8">
      {firstSetup ? null : (
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
            value={openTotal}
          />
        </div>
      )}

      <section
        aria-labelledby="failed-operations-heading"
        className="space-y-3"
      >
        <h2 className="sr-only" id="failed-operations-heading">
          {t("failedOperationsTitle")}
        </h2>
        <nav
          aria-label={t("failuresViewLabel")}
          className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-md bg-muted p-1"
        >
          {(["open", "closed"] as const).map((tab) => (
            <Link
              aria-current={view === tab ? "page" : undefined}
              className={`flex min-h-9 shrink-0 items-center rounded-sm px-3 text-sm font-medium whitespace-nowrap transition-all ${
                view === tab
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              data-testid={`failures-tab-${tab}`}
              href={hrefs[tab]}
              key={tab}
            >
              {tab === "open"
                ? t("tabOpen", { count: openTotal })
                : t("tabClosed")}
            </Link>
          ))}
        </nav>
        <FailedOperationsTable
          failures={failures}
          hrefs={hrefs}
          locale={locale}
          mayAct={mayActOnFailures}
          page={page}
          pageSize={pageSize}
          propertyId={propertyId}
          view={view}
          viewerId={viewerId}
        />
      </section>

      <section
        aria-labelledby="endpoints-heading"
        className={`space-y-4 ${firstSetup ? "order-first" : ""}`}
      >
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
            <p
              className="mt-0.5 text-step--1 text-muted-foreground"
              data-testid="integrations-availability"
            >
              {t("othersNotAvailable")}
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
