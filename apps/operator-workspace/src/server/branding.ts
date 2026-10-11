"use server";

import { revalidatePath } from "next/cache";
import {
  assessBrandColor,
  type BrandingInputError,
  type BrandingInputRejection,
  type ColorAssessment,
} from "@ranza/branding";
import { isSupportedLocale } from "@ranza/i18n";
import { getComposition } from "./composition";
import { currentViewer, permittedProperties } from "./viewer";

/**
 * Saving and resetting an Organization's brand from the Workspace (ADR 0046).
 *
 * Every command goes through the composition root under the acting user's
 * context (ADR 0007), and the policies decide whether it lands (ADR 0012), so
 * nothing here checks a permission. An outcome carries no English: the screen
 * chooses the words from `status` and `rejection`, and the exception behind
 * `error` goes to the log and never to the page.
 */

export type BrandingOutcome =
  | { status: "idle" }
  | { status: "saved" }
  | { status: "reset" }
  /** What the person supplied that cannot be used, and which rule it broke. */
  | { status: "invalid"; rejection: BrandingInputRejection }
  | { status: "refused" }
  /** Something the module did not expect; it has been reported. */
  | { status: "error" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REMOVE_LOGO = "remove";

/** Matched by name as well, because a server bundle may hold two copies. */
function named(error: unknown, name: string): error is Error {
  return error instanceof Error && error.name === name;
}

function outcomeOf(
  command: string,
  context: Record<string, string>,
  error: unknown,
): BrandingOutcome {
  if (named(error, "BrandingInputError")) {
    return {
      status: "invalid",
      rejection: (error as BrandingInputError).rejection,
    };
  }
  if (named(error, "BrandingRefusedError")) return { status: "refused" };
  console.error(`branding.${command}_failed`, context, error);
  return { status: "error" };
}

/**
 * The Organization a Property belongs to, among the Properties where the viewer
 * holds `branding.manage`. Null for any other, which the command reports as a
 * refusal. The Organization is never taken from the request.
 */
async function organizationOf(propertyId: string): Promise<string | null> {
  const permitted = await permittedProperties("branding.manage");
  return (
    permitted.find((property) => property.propertyId === propertyId)
      ?.organizationId ?? null
  );
}

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? "");
}

/** What a posted form asks of the brand, or null for a post that is not one. */
async function requestOf(form: FormData): Promise<{
  locale: string;
  propertyId: string;
  userId: string;
  organizationId: string;
} | null> {
  const locale = text(form, "locale");
  const propertyId = text(form, "propertyId");
  if (!isSupportedLocale(locale) || !UUID.test(propertyId)) return null;
  const viewer = await currentViewer();
  if (!viewer) return null;
  const organizationId = await organizationOf(propertyId);
  if (!organizationId) return null;
  return { locale, propertyId, userId: viewer.userId, organizationId };
}

/**
 * Sets what the form changed: `color` when the field is present (an empty one
 * returns the colour to the default), `logo` when a file was chosen, or
 * `removeLogo` to take it away. What the form leaves out stays as it is.
 */
export async function saveBranding(
  _previous: BrandingOutcome,
  form: FormData,
): Promise<BrandingOutcome> {
  const request = await requestOf(form);
  if (!request) return { status: "refused" };

  const color = form.has("color") ? text(form, "color").trim() : undefined;
  const file = form.get("logo");
  const logo =
    file instanceof File && file.size > 0
      ? new Uint8Array(await file.arrayBuffer())
      : text(form, "logoAction") === REMOVE_LOGO
        ? null
        : undefined;

  try {
    await getComposition().branding.saveBrand(request.userId, {
      organizationId: request.organizationId,
      ...(color === undefined
        ? {}
        : { primaryColor: color === "" ? null : color }),
      ...(logo === undefined ? {} : { logo }),
    });
    revalidatePath(`/${request.locale}/branding`);
    return { status: "saved" };
  } catch (error: unknown) {
    return outcomeOf(
      "save",
      { propertyId: request.propertyId, userId: request.userId },
      error,
    );
  }
}

/** Returns the Organization's brand to Ranza's own theme. */
export async function resetBranding(
  _previous: BrandingOutcome,
  form: FormData,
): Promise<BrandingOutcome> {
  const request = await requestOf(form);
  if (!request) return { status: "refused" };

  try {
    await getComposition().branding.resetBrand(
      request.userId,
      request.organizationId,
    );
    revalidatePath(`/${request.locale}/branding`);
    return { status: "reset" };
  } catch (error: unknown) {
    return outcomeOf(
      "reset",
      { propertyId: request.propertyId, userId: request.userId },
      error,
    );
  }
}

/**
 * Whether a colour being typed can be a brand's, and what to draw on it, for
 * the live preview. The module's own rule, asked rather than restated: a
 * second copy of the contrast arithmetic here would be one that could drift.
 * Pure, so it reads and writes nothing; signed-in viewers only, like every
 * action.
 */
export async function assessBrandingColor(
  color: string,
): Promise<ColorAssessment> {
  const viewer = await currentViewer();
  if (!viewer) return { status: "invalid" };
  return assessBrandColor(color);
}
