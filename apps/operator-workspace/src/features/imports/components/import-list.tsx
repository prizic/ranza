"use client";

import Link from "next/link";
import { CheckCircle2, CircleSlash, Eye, Loader } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatDate, type SupportedLocale } from "@ranza/i18n";
import type { ImportStatus, ImportSummary } from "@ranza/imports/contracts";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type StatusTone,
} from "@ranza/ui";
import type { LucideIcon } from "lucide-react";
import { staffName } from "../../../lib/staff-name";
import { ImportCountsLine } from "./import-counts";

export const IMPORT_STATUS: Record<
  ImportStatus,
  { icon: LucideIcon; tone: StatusTone }
> = {
  staged: { icon: Eye, tone: "info" },
  importing: { icon: Loader, tone: "warning" },
  finished: { icon: CheckCircle2, tone: "success" },
  discarded: { icon: CircleSlash, tone: "neutral" },
};

/**
 * A Property's imports, newest first: who brought which file, when, and what
 * it came to. Everybody who may import here reads the list; only the uploader
 * reads an import's rows (IMP-S1-09).
 */
export function ImportList({
  hrefBase,
  imports,
  locale,
  timezone,
}: {
  /** This screen's own address with `?property=` on it. */
  hrefBase: string;
  imports: readonly ImportSummary[];
  locale: SupportedLocale;
  timezone: string;
}) {
  const t = useTranslations("imports");

  if (imports.length === 0) {
    return (
      <EmptyState description={t("list.emptyLead")} title={t("list.empty")} />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("list.heading")}</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("list.file")}</TableHead>
              <TableHead>{t("list.uploadedBy")}</TableHead>
              <TableHead>{t("list.status")}</TableHead>
              <TableHead>{t("list.result")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("list.open")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {imports.map((item) => (
              <TableRow key={item.id}>
                <TableCell>
                  <div className="font-medium break-all">{item.fileName}</div>
                  <div className="text-sm text-muted-foreground">
                    {t(`kinds.${item.kind}`)}
                  </div>
                </TableCell>
                <TableCell>
                  <div>
                    {item.mine
                      ? t("list.you")
                      : staffName(item.uploaderEmail, t("list.someone"))}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {formatDate(item.createdAt, locale, {
                      timeZone: timezone,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </TableCell>
                <TableCell>
                  <StatusBadge
                    icon={IMPORT_STATUS[item.status].icon}
                    label={t(`status.${item.status}`)}
                    tone={IMPORT_STATUS[item.status].tone}
                  />
                </TableCell>
                <TableCell>
                  <ImportCountsLine counts={item.counts} />
                </TableCell>
                <TableCell className="text-end">
                  <Button asChild size="sm" variant="outline">
                    <Link href={`${hrefBase}&record=${item.id}`}>
                      {t("list.open")}
                      <span className="sr-only">: {item.fileName}</span>
                    </Link>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
