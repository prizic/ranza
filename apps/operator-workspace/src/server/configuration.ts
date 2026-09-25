"use server";

import { revalidatePath } from "next/cache";
import {
  ConfigurationCurrencyFixedError,
  ConfigurationInputError,
  ConfigurationRefusedError,
  ConfigurationStaleError,
  type BusinessDatePreview,
  type ConfigurationField,
} from "@ranza/core";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

/**
 * Saving the Configuration screen (ADR 0036).
 *
 * The save goes through the composition root under the acting user's context
 * (ADR 0007); the update policies and grants decide whether it lands, so
 * nothing here checks a permission. What this layer owns is turning each way
 * a save can end into an outcome the form words in the reader's language.
 */

export interface SettingsOutcome {
  status:
    | "idle"
    | "saved"
    | "unchanged"
    | "invalid"
    | "refused"
    | "stale"
    | "currencyFixed";
  /** The field at fault, for a refusal that names one. */
  field?: ConfigurationField | null;
  /** The version the next save names. */
  version?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Matched by class and by name: a class imported through a second copy of the
 * module in the server bundle is a different constructor.
 */
function is<T extends Error>(
  error: unknown,
  type: new (...args: never[]) => T,
): error is T {
  return (
    error instanceof type ||
    (error instanceof Error && error.name === type.name)
  );
}

/**
 * A name, a zone and a currency can appear on every page — the rail, the
 * Property switcher, every date — so a save refreshes the whole workspace.
 */
function revalidateWorkspace(locale: string): void {
  revalidatePath(`/${locale}`, "layout");
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "");
}

function outcomeOf(error: unknown, locale: string): SettingsOutcome {
  if (is(error, ConfigurationInputError)) {
    return { status: "invalid", field: error.field };
  }
  if (is(error, ConfigurationCurrencyFixedError)) {
    // A Folio was opened since the page was read: the next read shows the
    // currency locked, with the reason, instead of a draft that cannot save.
    revalidateWorkspace(locale);
    return { status: "currencyFixed", field: "currency" };
  }
  if (is(error, ConfigurationStaleError)) {
    revalidateWorkspace(locale);
    return { status: "stale" };
  }
  if (is(error, ConfigurationRefusedError)) {
    // A permission taken away, or reach lost, while the page was open: the
    // next read shows them what is true now.
    revalidateWorkspace(locale);
    return { status: "refused" };
  }
  throw error;
}

/** A Property's name, currency, timezone and business-day cutoff (slice 1). */
export async function saveProperty(
  _previous: SettingsOutcome,
  form: FormData,
): Promise<SettingsOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = text(form, "locale");
  const propertyId = text(form, "propertyId");
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "invalid", field: null };
  }

  try {
    const saved = await getComposition().core.configureProperty(
      viewer.userId,
      propertyId,
      {
        name: text(form, "name").trim(),
        timezone: text(form, "timezone"),
        currency: text(form, "currency").trim().toUpperCase(),
        businessDateCutoff: text(form, "businessDateCutoff"),
        version: text(form, "version"),
      },
    );
    if (saved.status === "saved") revalidateWorkspace(locale);
    return { status: saved.status, version: saved.version };
  } catch (error: unknown) {
    return outcomeOf(error, locale);
  }
}

/** The Organization's name, from the Property the screen is opened at (slice 2). */
export async function renameOrganization(
  _previous: SettingsOutcome,
  form: FormData,
): Promise<SettingsOutcome> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "refused" };

  const locale = text(form, "locale");
  const propertyId = text(form, "propertyId");
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) {
    return { status: "invalid", field: null };
  }

  try {
    const saved = await getComposition().core.renameOrganization(
      viewer.userId,
      propertyId,
      { name: text(form, "name").trim(), version: text(form, "version") },
    );
    if (saved.status === "saved") revalidateWorkspace(locale);
    return { status: saved.status, version: saved.version };
  } catch (error: unknown) {
    return outcomeOf(error, locale);
  }
}

/**
 * The business date a changed timezone or cutoff would make, answered by the
 * database's own rule (CF-S1-10). Null when there is nothing to say.
 */
export async function previewBusinessDate(
  propertyId: string,
  timezone: string,
  cutoff: string,
): Promise<BusinessDatePreview | null> {
  const viewer = await currentViewer();
  if (!viewer || !UUID.test(propertyId)) return null;
  return getComposition().core.businessDatePreview(
    viewer.userId,
    propertyId,
    timezone,
    cutoff,
  );
}
