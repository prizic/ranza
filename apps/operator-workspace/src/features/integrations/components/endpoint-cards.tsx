"use client";

import { AlertTriangle, CheckCircle2, CircleDashed } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
  type StatusTone,
} from "@ranza/ui";
import type { EndpointHealth, EndpointsView } from "../../../server/viewer";
import { eventKey, isWebhookEventType } from "../types";
import { EndpointActions } from "./endpoint-actions";

const HEALTH: Record<
  EndpointHealth,
  { icon: typeof CheckCircle2; tone: StatusTone }
> = {
  delivering: { icon: CheckCircle2, tone: "success" },
  failing: { icon: AlertTriangle, tone: "danger" },
  unused: { icon: CircleDashed, tone: "neutral" },
};

interface EndpointCardsProps {
  locale: string;
  propertyId: string;
  view: EndpointsView;
}

export function EndpointCards({
  locale,
  propertyId,
  view,
}: EndpointCardsProps) {
  const t = useTranslations("integrations");

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(date));

  if (view.endpoints.length === 0) {
    return (
      <EmptyState
        description={
          view.mayManage
            ? t("noEndpointsDescription")
            : t("noEndpointsReadOnly")
        }
        title={t("noEndpointsTitle")}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {view.endpoints.map((endpoint) => {
        const health = HEALTH[endpoint.health];
        return (
          <Card
            className={
              endpoint.health === "failing" ? "border-destructive/40" : ""
            }
            data-testid="webhook-endpoint"
            key={endpoint.id}
          >
            <CardHeader className="gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <CardTitle className="text-step-0 font-medium">
                  {endpoint.name}
                </CardTitle>
                <StatusBadge
                  icon={health.icon}
                  label={t(`health.${endpoint.health}`)}
                  tone={health.tone}
                />
              </div>
              <div className="grid gap-0.5">
                <code
                  className="block text-step--1 break-all text-muted-foreground"
                  dir="ltr"
                >
                  {endpoint.url}
                  {endpoint.urlMasked ? "?…" : ""}
                </code>
                {endpoint.urlMasked ? (
                  <span className="text-step--1 text-muted-foreground">
                    {t("addressPartHidden")}
                  </span>
                ) : null}
              </div>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-1.5">
                <span className="text-step--1 text-muted-foreground">
                  {t("sends")}
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {endpoint.eventTypes.map((eventType) => (
                    <Badge key={eventType} variant="outline">
                      {isWebhookEventType(eventType)
                        ? t(`events.${eventKey(eventType)}`)
                        : eventType}
                    </Badge>
                  ))}
                </div>
              </div>
              <dl className="m-0 grid grid-cols-3 gap-4 text-step--1">
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">
                    {t("lastDelivered")}
                  </dt>
                  <dd className="m-0">
                    {endpoint.lastDeliveredAt
                      ? formatDate(endpoint.lastDeliveredAt)
                      : t("neverDelivered")}
                  </dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">{t("queued")}</dt>
                  <dd className="m-0 tabular-nums">{endpoint.queued}</dd>
                </div>
                <div className="grid gap-0.5">
                  <dt className="text-muted-foreground">{t("openFailures")}</dt>
                  <dd className="m-0 tabular-nums">{endpoint.openFailures}</dd>
                </div>
              </dl>
              {endpoint.overdue > 0 ? (
                <p
                  className="flex items-start gap-1.5 text-step--1 text-warning"
                  data-testid="endpoint-overdue"
                  role="status"
                >
                  <AlertTriangle
                    aria-hidden="true"
                    className="mt-0.5 size-3.5 shrink-0"
                  />
                  {t("overdue", { count: endpoint.overdue })}
                </p>
              ) : null}
              {view.mayManage ? (
                <EndpointActions
                  endpointId={endpoint.id}
                  endpointName={endpoint.name}
                  locale={locale}
                  propertyId={propertyId}
                />
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
