"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Ban,
  CheckCircle2,
  CircleDashed,
  CircleSlash,
  Download,
  TriangleAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { ImportDetail, RowState } from "@ranza/imports/contracts";
import { IMPORT_RETENTION_DAYS } from "../../../server/import-limits";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Progress,
  StatusBadge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  type StatusTone,
} from "@ranza/ui";
import { staffName } from "../../../lib/staff-name";
import {
  continueImport,
  discardImport,
  startImport,
  stopImport,
  type ImportMoveOutcome,
} from "../../../server/imports";
import { inReadingOrder, reasonsOf } from "../wording";
import { ImportCountsLine } from "./import-counts";
import { IMPORT_STATUS } from "./import-list";
import type { ImportColumn } from "./import-upload";

/** More rows than this are in the result file and not on the page. */
const ROWS_SHOWN = 50;

const ROW_STATE: Record<RowState, { icon: LucideIcon; tone: StatusTone }> = {
  ready: { icon: CircleDashed, tone: "info" },
  wrong: { icon: TriangleAlert, tone: "warning" },
  skipped: { icon: CircleSlash, tone: "neutral" },
  imported: { icon: CheckCircle2, tone: "success" },
  refused: { icon: XCircle, tone: "danger" },
  left: { icon: Ban, tone: "neutral" },
};

type Refusal = Exclude<ImportMoveOutcome["status"], ImportDetail["status"]>;

function isRefusal(status: ImportMoveOutcome["status"]): status is Refusal {
  return (
    status === "alreadyRunning" ||
    status === "stale" ||
    status === "notPermitted" ||
    status === "error"
  );
}

/**
 * One import: its preview before anything is written, its progress while the
 * rows go in, and what it came to afterwards (IMP-S1-05..14, 23..25).
 *
 * The rows are imported by this page asking for the next batch until none is
 * left, each batch under the uploader's own session. Closing the page pauses
 * the import; opening it again offers to carry on (ADR 0065).
 */
export function ImportDetailView({
  columns,
  detail,
  locale,
  roomsHref,
  sheetsIgnored,
}: {
  columns: readonly ImportColumn[];
  detail: ImportDetail;
  locale: SupportedLocale;
  /** Rooms at this Property, or null where the viewer may not open it. */
  roomsHref: string | null;
  sheetsIgnored: number;
}) {
  const t = useTranslations("imports");
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  // How many rows were waiting when this page began importing, so the bar
  // measures this sitting and not the whole file.
  const [startedWith, setStartedWith] = useState(0);
  // A ref for the loop, which outlives the render that started it, and state
  // for the button, which a ref would not redraw.
  const stopAsked = useRef(false);
  const [stopping, setStopping] = useState(false);
  const leaving = useRef(false);

  // Set on the way in as well as cleared on the way out: in development React
  // runs an effect's cleanup once at mount, and a flag only ever raised would
  // leave a page that never left believing it had.
  useEffect(() => {
    leaving.current = false;
    return () => {
      leaving.current = true;
    };
  }, []);

  const uploader = staffName(detail.uploaderEmail, t("list.someone"));
  const { counts, status } = detail;
  const toFix = counts.wrong + counts.refused;
  const downloadable = detail.mine && detail.rows.length > 0;
  const fileHref = (file: "result" | "fix") =>
    `/api/import/${detail.id}/result?file=${file}&locale=${locale}`;

  /** Asks for batch after batch until the import is no longer importing. */
  async function run(first: () => Promise<ImportMoveOutcome>) {
    stopAsked.current = false;
    setStopping(false);
    setRefusal(null);
    setStartedWith(counts.ready);
    setRunning(true);
    let outcome = await first();
    while (
      outcome.status === "importing" &&
      !stopAsked.current &&
      !leaving.current
    ) {
      outcome = await continueImport(detail.id, locale);
    }
    if (stopAsked.current && outcome.status === "importing") {
      outcome = await stopImport(detail.id, locale);
    }
    if (leaving.current) return;
    setRunning(false);
    setStopping(false);
    if (isRefusal(outcome.status)) setRefusal(outcome.status);
  }

  async function once(move: () => Promise<ImportMoveOutcome>) {
    setBusy(true);
    setRefusal(null);
    const outcome = await move();
    setBusy(false);
    if (isRefusal(outcome.status)) setRefusal(outcome.status);
  }

  // A code a newer writer knew and this page does not is shown as it is,
  // which is ugly and still better than a row with no reason at all.
  const worded = (key: string, code: string) => {
    const known = key as "problems.required";
    return t.has(known) ? t(known) : code;
  };
  const done = Math.max(0, startedWith - counts.ready);
  const heading = (column: string) =>
    columns.find((spec) => spec.key === column)?.label ?? column;
  const rows = inReadingOrder(detail.rows);

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-3">
            <span className="break-all">{detail.fileName}</span>
            <StatusBadge
              icon={IMPORT_STATUS[status].icon}
              label={t(`status.${status}`)}
              tone={IMPORT_STATUS[status].tone}
            />
          </CardTitle>
          <CardDescription>
            {status === "staged" && detail.mine
              ? counts.ready > 0
                ? t("detail.stagedLead")
                : t("detail.nothingReady")
              : status === "finished"
                ? t("detail.finishedLead")
                : status === "discarded"
                  ? t("detail.discardedLead")
                  : status === "importing" && detail.mine && !running
                    ? t("detail.pausedLead", { count: counts.ready })
                    : null}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <ImportCountsLine counts={counts} />

          {sheetsIgnored > 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.sheetsIgnored", { count: sheetsIgnored })}
            </p>
          ) : null}

          {!detail.mine ? (
            <p className="text-sm text-muted-foreground">
              {status === "importing"
                ? t("detail.runningElsewhere", { name: uploader })
                : t("detail.notMine", { name: uploader })}
            </p>
          ) : null}

          {detail.rowsForgotten ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.forgotten", { days: IMPORT_RETENTION_DAYS })}
            </p>
          ) : null}

          {running ? (
            <div aria-live="polite" className="grid gap-2" role="status">
              <p className="text-sm font-medium">
                {t("detail.running", { done, total: startedWith })}
              </p>
              <Progress
                aria-label={t("status.importing")}
                value={startedWith === 0 ? 0 : (done / startedWith) * 100}
              />
              <p className="text-sm text-muted-foreground">
                {t("detail.keepOpen")}
              </p>
            </div>
          ) : null}

          {refusal ? (
            <p
              className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
              role="alert"
            >
              <TriangleAlert
                aria-hidden="true"
                className="mt-0.5 size-4 shrink-0"
              />
              {refusal === "alreadyRunning"
                ? t("detail.alreadyRunning")
                : refusal === "stale"
                  ? t("detail.stale")
                  : refusal === "notPermitted"
                    ? t("notPermitted")
                    : t("detail.failed")}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            {status === "staged" && detail.mine ? (
              <>
                {counts.ready > 0 ? (
                  <Button
                    disabled={running || busy}
                    onClick={() => run(() => startImport(detail.id, locale))}
                    type="button"
                  >
                    {t("detail.importRooms", { count: counts.ready })}
                  </Button>
                ) : null}
                <Button
                  disabled={running || busy}
                  onClick={() => once(() => discardImport(detail.id, locale))}
                  type="button"
                  variant="outline"
                >
                  {t("detail.discard")}
                </Button>
              </>
            ) : null}

            {status === "importing" && detail.mine && !running ? (
              <Button
                disabled={busy}
                onClick={() => run(() => continueImport(detail.id, locale))}
                type="button"
              >
                {t("detail.carryOn")}
              </Button>
            ) : null}

            {status === "importing" ? (
              <Button
                disabled={busy || stopping}
                onClick={() => {
                  if (running) {
                    stopAsked.current = true;
                    setStopping(true);
                    return;
                  }
                  void once(() => stopImport(detail.id, locale));
                }}
                type="button"
                variant="outline"
              >
                {t("detail.stop")}
              </Button>
            ) : null}

            {status === "finished" && roomsHref ? (
              <Button asChild>
                <Link href={roomsHref}>{t("detail.openRooms")}</Link>
              </Button>
            ) : null}

            {downloadable && status !== "staged" && !running ? (
              <Button asChild variant="outline">
                <a href={fileHref("result")}>
                  <Download aria-hidden="true" />
                  {t("detail.downloadResult")}
                </a>
              </Button>
            ) : null}

            {downloadable && toFix > 0 && !running ? (
              <Button asChild variant="outline">
                <a href={fileHref("fix")}>
                  <Download aria-hidden="true" />
                  {t("detail.downloadFix")}
                </a>
              </Button>
            ) : null}
          </div>

          {downloadable && toFix > 0 && !running ? (
            <p className="text-sm text-muted-foreground">
              {t("detail.fixHint")}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {rows.length > 0 ? (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("detail.row")}</TableHead>
                  {columns.map((spec) => (
                    <TableHead key={spec.key}>{spec.label}</TableHead>
                  ))}
                  <TableHead>{t("detail.outcome")}</TableHead>
                  <TableHead>{t("detail.reason")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.slice(0, ROWS_SHOWN).map((row) => (
                  <TableRow key={row.rowNumber}>
                    <TableCell className="tabular-nums">
                      {row.rowNumber}
                    </TableCell>
                    {columns.map((spec) => (
                      <TableCell
                        className={
                          row.problems.some(
                            (problem) => problem.column === spec.key,
                          )
                            ? "font-medium text-warning"
                            : undefined
                        }
                        key={spec.key}
                      >
                        {row.cells[spec.key] ?? ""}
                      </TableCell>
                    ))}
                    <TableCell>
                      <StatusBadge
                        icon={ROW_STATE[row.state].icon}
                        label={t(`rowStates.${row.state}`)}
                        tone={ROW_STATE[row.state].tone}
                      />
                    </TableCell>
                    <TableCell className="min-w-56 whitespace-normal">
                      {reasonsOf(row, {
                        heading,
                        problem: (code) => worded(`problems.${code}`, code),
                        outcome: (code) => worded(`outcomes.${code}`, code),
                      }).map((reason) => (
                        <p key={reason}>{reason}</p>
                      ))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {rows.length > ROWS_SHOWN ? (
              <p className="mt-3 text-sm text-muted-foreground">
                {t("detail.more", { count: rows.length - ROWS_SHOWN })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
