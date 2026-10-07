"use client";

import {
  AlertTriangle,
  Clock,
  CreditCard,
  KeyRound,
  Landmark,
  MessageSquare,
  Network,
  Receipt,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type {
  IntegrationRecord,
  IntegrationStatus,
} from "../../../server/viewer";
import { Badge, Card, CardContent, CardHeader, CardTitle } from "@ranza/ui";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Distribution: Network,
  Payments: CreditCard,
  Access: KeyRound,
  Government: Landmark,
  Tax: Receipt,
  Messaging: MessageSquare,
  Other: Network,
};

const VALID_CATEGORIES = [
  "Distribution",
  "Payments",
  "Access",
  "Government",
  "Tax",
  "Messaging",
  "Other",
] as const;

type KnownCategory = (typeof VALID_CATEGORIES)[number];

function isKnownCategory(cat: string): cat is KnownCategory {
  return VALID_CATEGORIES.includes(cat as KnownCategory);
}

interface IntegrationCardsProps {
  integrations: IntegrationRecord[];
  locale: string;
}

export function IntegrationCards({
  integrations,
  locale,
}: IntegrationCardsProps) {
  const t = useTranslations("integrations");

  if (integrations.length === 0) {
    return (
      <Card className="border-border">
        <CardContent className="py-8 text-center text-muted-foreground text-step--1">
          {t("noIntegrations")}
        </CardContent>
      </Card>
    );
  }

  const formatLastSync = (date: Date | null) => {
    if (!date) return t("neverSynced");
    try {
      return new Intl.DateTimeFormat(locale, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(date));
    } catch {
      return new Date(date).toLocaleString();
    }
  };

  const getStatusBadge = (status: IntegrationStatus) => {
    switch (status) {
      case "connected":
        return (
          <Badge
            variant="outline"
            className="border-emerald-600/30 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 gap-1.5"
          >
            <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
            {t("statuses.connected")}
          </Badge>
        );
      case "error":
        return (
          <Badge variant="destructive" className="gap-1.5">
            <AlertTriangle aria-hidden="true" className="size-3 shrink-0" />
            {t("statuses.error")}
          </Badge>
        );
      case "not_connected":
      default:
        return (
          <Badge variant="secondary" className="gap-1.5 text-muted-foreground">
            <span className="size-1.5 rounded-full bg-muted-foreground/60" />
            {t("statuses.not_connected")}
          </Badge>
        );
    }
  };

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {integrations.map((item) => {
        const Icon = CATEGORY_ICONS[item.category] ?? Network;
        const categoryLabel = isKnownCategory(item.category)
          ? t(`categories.${item.category}`)
          : item.category;

        return (
          <Card
            className={`border transition-colors ${
              item.status === "error"
                ? "border-destructive/40 bg-destructive/[0.02]"
                : "border-border"
            }`}
            key={item.id}
          >
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="flex size-9 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
                    <Icon aria-hidden="true" className="size-5" />
                  </div>
                  <div>
                    <CardTitle className="text-step-0 font-medium">
                      {item.name}
                    </CardTitle>
                    <span className="text-step--2 text-muted-foreground font-normal">
                      {categoryLabel}
                    </span>
                  </div>
                </div>
                {getStatusBadge(item.status)}
              </div>
            </CardHeader>
            <CardContent className="pt-0 text-step--1">
              {item.detail ? (
                <div className="mb-3 rounded border-s-2 border-destructive bg-destructive/10 px-2 py-1.5 text-step--2 text-destructive font-mono break-words">
                  {item.detail}
                </div>
              ) : null}
              <div className="flex items-center justify-between text-step--2 text-muted-foreground pt-2 border-t border-border/40">
                <span className="flex items-center gap-1">
                  <Clock aria-hidden="true" className="size-3 shrink-0" />
                  {t("lastSync")}:
                </span>
                <span className="font-medium text-foreground">
                  {formatLastSync(item.lastSyncAt)}
                </span>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
