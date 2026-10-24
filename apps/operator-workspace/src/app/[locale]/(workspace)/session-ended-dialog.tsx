"use client";

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@ranza/ui";
import type { SupportedLocale } from "@ranza/i18n";
import { signInHref } from "../../../lib/return-path";

/**
 * What a screen left open says when the session behind it has ended (SHELL-07).
 *
 * Today polls every minute and is meant to stay open for a shift, so a desk that
 * comes back after lunch finds an amber "couldn't refresh" and live buttons, and
 * learns it was signed out when an action fails. A request answered 401 opens
 * this instead: it cannot be dismissed, because nothing on the page will save,
 * and its one button signs in again and returns to this address.
 *
 * A link, not a client navigation: a full load drops the cache held for the
 * session that ended (ADR 0019).
 */
export function SessionEndedDialog({
  description,
  locale,
  open,
  signInLabel,
  title,
}: {
  description: string;
  locale: SupportedLocale;
  open: boolean;
  signInLabel: string;
  title: string;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        showCloseButton={false}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <SignInAgain label={signInLabel} locale={locale} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Only drawn once the dialog is open, in the browser, where the address is known. */
function SignInAgain({
  label,
  locale,
}: {
  label: string;
  locale: SupportedLocale;
}) {
  return (
    <Button asChild>
      <a
        href={signInHref(
          locale,
          `${window.location.pathname}${window.location.search}`,
        )}
      >
        {label}
      </a>
    </Button>
  );
}
