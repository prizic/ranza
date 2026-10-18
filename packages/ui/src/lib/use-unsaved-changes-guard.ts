"use client";

import { useEffect } from "react";

/**
 * Asks before leaving a form with edits that were not saved (CONFIG-03).
 *
 * Two ways out are covered, because each loses the draft the same way — a
 * form's state lives in the page, so it is gone on return:
 *
 *  - closing the tab or reloading: the browser's own prompt, which cannot be
 *    reworded and does not use `message`;
 *  - following a link on this site, which the router would turn into a client
 *    navigation with nothing to ask: a click handler in the capture phase asks
 *    first and stops the link if the answer is no.
 *
 * The Back and Forward buttons are not covered, and cannot honestly be. By the
 * time a listener hears of one the router's own has already followed it, and
 * the only way ahead of it is to plant history entries of our own, which is
 * exactly what browsers treat as trapping somebody on a page and skip.
 * A navigation the code itself starts — `router.push` after a save — is not
 * asked about either, which is the point of saving first. `message` is the
 * host's, localized: this package has no copy of its own.
 *
 * Armed only while `dirty`. Two forms dirty at once ask once each, which is
 * the right number: either one's draft would be lost.
 */
export function useUnsavedChangesGuard(dirty: boolean, message: string): void {
  useEffect(() => {
    if (!dirty) return;

    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      // Older engines show their prompt only for a returned value.
      event.returnValue = "";
    };

    const onLinkClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }
      const link = (event.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement)) return;
      if (
        (link.target && link.target !== "_self") ||
        link.hasAttribute("download")
      ) {
        return;
      }
      const destination = new URL(link.href, window.location.href);
      const here = window.location;
      // A link to this same page, or to a place on it, loses nothing.
      if (
        destination.origin === here.origin &&
        destination.pathname === here.pathname &&
        destination.search === here.search
      ) {
        return;
      }
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };

    window.addEventListener("beforeunload", beforeUnload);
    document.addEventListener("click", onLinkClick, true);
    return () => {
      window.removeEventListener("beforeunload", beforeUnload);
      document.removeEventListener("click", onLinkClick, true);
    };
  }, [dirty, message]);
}
