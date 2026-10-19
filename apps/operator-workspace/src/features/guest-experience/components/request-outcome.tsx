"use client";

import { useTranslations } from "next-intl";
import { FormError } from "@ranza/ui";
import type { ServiceRequestOutcome } from "../../../server/guest-services";

const MESSAGE_KEY = {
  invalid: "invalidRequest",
  refused: "refusedRequest",
  unavailable: "unavailableRequest",
  resolvedCannotCancel: "resolvedCannotCancel",
  cancelledReopensToNew: "cancelledReopensToNew",
} as const;

/**
 * Why a service request command did not go through, in the reader's language.
 * Each reason the server can tell apart has its own sentence, and a success or
 * an idle form says nothing (GX-03, GX-08).
 */
export function RequestOutcome({
  status,
}: {
  status: ServiceRequestOutcome["status"];
}) {
  const t = useTranslations("guestExperience");
  if (status === "idle" || status === "done") return null;
  return <FormError>{t(MESSAGE_KEY[status])}</FormError>;
}
