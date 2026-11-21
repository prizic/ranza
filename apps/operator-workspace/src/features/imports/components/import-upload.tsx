"use client";

import {
  startTransition,
  useActionState,
  useState,
  type FormEvent,
} from "react";
import { Download, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import type { SupportedLocale } from "@ranza/i18n";
import type { ImportKind } from "@ranza/imports/contracts";
import { IMPORT_LIMITS } from "../../../server/import-limits";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@ranza/ui";
import { previewImport, type PreviewOutcome } from "../../../server/imports";

const MEGABYTES = IMPORT_LIMITS.bytes / (1024 * 1024);
const NOT_IN_FILE = "none";

type Mapping = Extract<PreviewOutcome, { status: "needsMapping" }>;

/** A column of the kind being imported, headed in the reader's language. */
export interface ImportColumn {
  key: string;
  label: string;
  required: boolean;
}

/**
 * The columns of the kind, each with the file's column that feeds it. Shown
 * only when a required one was not recognised, and prefilled with everything
 * that was, so a person answers only what the headings could not (IMP-S1-17).
 */
function MappingFields({
  columns,
  mapping,
}: {
  columns: readonly ImportColumn[];
  mapping: Mapping;
}) {
  const t = useTranslations("imports");
  const [chosen, setChosen] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      columns.map((spec) => {
        const index = mapping.mapping[spec.key];
        return [spec.key, index == null ? NOT_IN_FILE : String(index)];
      }),
    ),
  );

  return (
    <fieldset className="grid gap-3 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">
        {t("mapping.heading")}
      </legend>
      <p className="text-sm text-muted-foreground">{t("mapping.lead")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {columns.map((spec) => (
          <div className="grid gap-1.5" key={spec.key}>
            <Label htmlFor={`map-${spec.key}`}>
              {spec.label}
              {spec.required ? (
                <span className="ms-1.5 text-xs text-muted-foreground">
                  {t("mapping.required")}
                </span>
              ) : null}
            </Label>
            <input
              name={`map.${spec.key}`}
              type="hidden"
              value={chosen[spec.key] === NOT_IN_FILE ? "" : chosen[spec.key]}
            />
            <Select
              onValueChange={(value) =>
                setChosen((current) => ({ ...current, [spec.key]: value }))
              }
              value={chosen[spec.key] ?? NOT_IN_FILE}
            >
              <SelectTrigger
                aria-invalid={spec.required && chosen[spec.key] === NOT_IN_FILE}
                className="w-full"
                id={`map-${spec.key}`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NOT_IN_FILE}>{t("mapping.none")}</SelectItem>
                {mapping.headers.map((heading, index) =>
                  heading === "" ? null : (
                    <SelectItem key={index} value={String(index)}>
                      {heading}
                    </SelectItem>
                  ),
                )}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Upload one kind's file and see its preview. The file never leaves the
 * browser's form between the two steps: when a heading is not recognised the
 * same form is sent again with the answer, so the server keeps nothing in
 * between.
 */
function UploadForm({
  columns,
  kind,
  locale,
  propertyId,
}: {
  columns: readonly ImportColumn[];
  kind: ImportKind;
  locale: SupportedLocale;
  propertyId: string;
}) {
  const t = useTranslations("imports");
  const [outcome, dispatch, pending] = useActionState<PreviewOutcome, FormData>(
    previewImport,
    { status: "idle" },
  );
  // What the browser can say before the file travels: nothing chosen, or a
  // file the server would refuse in transit with an error nobody can read.
  const [early, setEarly] = useState<"chooseFirst" | "too_large" | null>(null);
  // An answer about a file that has since been swapped is about nothing.
  const [answered, setAnswered] = useState<PreviewOutcome | null>(null);
  const shown = answered === outcome ? null : outcome;
  const fileId = `import-file-${kind}`;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setEarly("chooseFirst");
      return;
    }
    if (file.size > IMPORT_LIMITS.bytes) {
      setEarly("too_large");
      return;
    }
    setEarly(null);
    startTransition(() => dispatch(form));
  }

  const problem =
    early === "chooseFirst"
      ? t("upload.chooseFirst")
      : early === "too_large"
        ? t("refusals.too_large", { megabytes: MEGABYTES })
        : shown?.status === "refusedFile"
          ? t(`refusals.${shown.reason}`, {
              megabytes: MEGABYTES,
              rows: IMPORT_LIMITS.rows,
            })
          : shown?.status === "notPermitted"
            ? t("notPermitted")
            : shown?.status === "error"
              ? t("error")
              : shown?.status === "needsMapping" && !pending
                ? t("mapping.missing")
                : null;

  return (
    <form className="grid gap-4" noValidate onSubmit={submit}>
      <input name="locale" type="hidden" value={locale} />
      <input name="propertyId" type="hidden" value={propertyId} />
      <input name="kind" type="hidden" value={kind} />
      <div className="grid gap-1.5">
        <Label htmlFor={fileId}>{t("upload.file")}</Label>
        <Input
          accept=".xlsx,.csv"
          aria-describedby={`${fileId}-hint`}
          id={fileId}
          name="file"
          onChange={() => {
            setEarly(null);
            setAnswered(outcome);
          }}
          type="file"
        />
        <p className="text-sm text-muted-foreground" id={`${fileId}-hint`}>
          {t("upload.hint", {
            megabytes: MEGABYTES,
            rows: IMPORT_LIMITS.rows,
          })}
        </p>
      </div>

      {shown?.status === "needsMapping" ? (
        <MappingFields
          columns={columns}
          key={shown.headers.join("\u0000")}
          mapping={shown}
        />
      ) : null}

      {problem ? (
        <p
          className="flex items-start gap-2 rounded-lg border border-warning/25 bg-warning-soft p-3 text-sm text-warning"
          role="alert"
        >
          <TriangleAlert
            aria-hidden="true"
            className="mt-0.5 size-4 shrink-0"
          />
          {problem}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={pending} type="submit">
          {pending
            ? t("upload.reading")
            : shown?.status === "needsMapping"
              ? t("mapping.submit")
              : t("upload.submit")}
        </Button>
        <Button asChild variant="outline">
          <a href={`/api/import/template?kind=${kind}&locale=${locale}`}>
            <Download aria-hidden="true" />
            {t("upload.template")}
          </a>
        </Button>
      </div>
    </form>
  );
}

/**
 * Rooms or people, each with its own form, so a column mapping asked about
 * one kind's file never follows a person to the other. People are booked, so
 * a Staff Member who may not book is told why instead of handed a form whose
 * every row would be refused (IMP-S2-07).
 */
export function ImportUpload({
  columns,
  initialKind,
  locale,
  mayImportPeople,
  propertyId,
}: {
  columns: Readonly<Record<ImportKind, readonly ImportColumn[]>>;
  initialKind: ImportKind;
  locale: SupportedLocale;
  mayImportPeople: boolean;
  propertyId: string;
}) {
  const t = useTranslations("imports");
  const [kind, setKind] = useState<ImportKind>(initialKind);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("upload.heading")}</CardTitle>
        <CardDescription>{t("upload.templateHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          onValueChange={(value) =>
            setKind(value === "people" ? "people" : "rooms")
          }
          value={kind}
        >
          <TabsList>
            <TabsTrigger value="rooms">{t("kinds.rooms")}</TabsTrigger>
            <TabsTrigger value="people">{t("kinds.people")}</TabsTrigger>
          </TabsList>
          <TabsContent className="pt-3" value="rooms">
            <UploadForm
              columns={columns.rooms}
              kind="rooms"
              locale={locale}
              propertyId={propertyId}
            />
          </TabsContent>
          <TabsContent className="grid gap-4 pt-3" value="people">
            <p className="max-w-prose text-sm text-muted-foreground">
              {t("upload.peopleLead")}
            </p>
            {mayImportPeople ? (
              <UploadForm
                columns={columns.people}
                kind="people"
                locale={locale}
                propertyId={propertyId}
              />
            ) : (
              <p
                className="rounded-lg border bg-muted/40 p-3 text-sm"
                role="note"
              >
                {t("upload.peopleNotPermitted")}
              </p>
            )}
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
