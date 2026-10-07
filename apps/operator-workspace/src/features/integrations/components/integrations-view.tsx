"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Network,
  XCircle,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  FailedOperationRecord,
  IntegrationRecord,
} from "../../../server/viewer";
import { Card, CardContent, CardHeader, CardTitle } from "@ranza/ui";
import { FailedOperationsTable } from "./failed-operations-table";
import { IntegrationCards } from "./integration-cards";

interface IntegrationsViewProps {
  integrations: IntegrationRecord[];
  failedOperations: FailedOperationRecord[];
  locale: string;
  propertyId: string;
}

export function IntegrationsView({
  integrations,
  failedOperations,
  locale,
  propertyId,
}: IntegrationsViewProps) {
  const t = useTranslations("integrations");

  const connectedCount = integrations.filter(
    (i) => i.status === "connected",
  ).length;
  const errorCount = integrations.filter((i) => i.status === "error").length;
  const notConnectedCount = integrations.filter(
    (i) => i.status === "not_connected",
  ).length;

  return (
    <div className="space-y-6">
      {/* Metrics Summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-step--1 font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("connectedCount")}</span>
              <CheckCircle2
                aria-hidden="true"
                className="size-4 text-emerald-600 dark:text-emerald-400"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-step-2 font-bold text-foreground">
              {connectedCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-step--1 font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("errorCount")}</span>
              <AlertTriangle
                aria-hidden="true"
                className="size-4 text-destructive"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className={`text-step-2 font-bold ${
                errorCount > 0 ? "text-destructive" : "text-foreground"
              }`}
            >
              {errorCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-step--1 font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("notConnectedCount")}</span>
              <XCircle
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="text-step-2 font-bold text-foreground">
              {notConnectedCount}
            </div>
          </CardContent>
        </Card>

        <Card className="border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-step--1 font-medium text-muted-foreground flex items-center justify-between">
              <span>{t("failedOperationsTitle")}</span>
              <Clock
                aria-hidden="true"
                className="size-4 text-muted-foreground"
              />
            </CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div
              className={`text-step-2 font-bold ${
                failedOperations.length > 0
                  ? "text-destructive"
                  : "text-foreground"
              }`}
            >
              {failedOperations.length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Failed Operations Section */}
      <section
        aria-labelledby="failed-operations-heading"
        className="space-y-3"
      >
        <h2 id="failed-operations-heading" className="sr-only">
          {t("failedOperationsTitle")}
        </h2>
        <FailedOperationsTable
          failedOperations={failedOperations}
          locale={locale}
          propertyId={propertyId}
        />
      </section>

      {/* Configured Integrations Section */}
      <section
        aria-labelledby="active-integrations-heading"
        className="space-y-3"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2
              id="active-integrations-heading"
              className="text-step-0 font-semibold text-foreground flex items-center gap-2"
            >
              <Network aria-hidden="true" className="size-4 text-primary" />
              <span>{t("activeIntegrations")}</span>
            </h2>
            <p className="text-step--1 text-muted-foreground mt-0.5">
              {t("activeIntegrationsDescription")}
            </p>
          </div>
        </div>
        <IntegrationCards integrations={integrations} locale={locale} />
      </section>
    </div>
  );
}
