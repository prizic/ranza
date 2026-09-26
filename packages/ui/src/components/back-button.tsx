"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";

export interface BackButtonProps {
  /** Target URL to navigate back to if history cannot be navigated. */
  fallbackHref?: string | undefined;
  /** Force always navigating to href without inspecting history. */
  forceHref?: boolean | undefined;
  /** Explicit URL to link to. If provided, used as primary destination. */
  href?: string | undefined;
  /** Accessible label. Defaults to "Back". */
  label?: string | undefined;
  /** Custom class name. */
  className?: string | undefined;
  /** Custom children (e.g. icon + text or custom icon). Defaults to ArrowLeft. */
  children?: ReactNode | undefined;
}

/**
 * Standard back button for inner pages and detail views across Ranza.
 *
 * It goes back in history only when the document was loaded from another
 * page of this origin; otherwise it is a plain link to `href`, so a page opened
 * directly never sends somebody out of the application. `document.referrer` is
 * set by the document load and a soft navigation does not change it, so the
 * signal is coarse: it can only err towards the link, which is always safe.
 * Modifier keys keep the link's own behaviour, so a new tab opens the target.
 */
export function BackButton({
  children,
  className,
  fallbackHref,
  forceHref = false,
  href,
  label = "Back",
}: BackButtonProps) {
  const router = useRouter();
  const destination = href || fallbackHref || "/";

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return;
    }

    if (forceHref) {
      return;
    }

    if (typeof window !== "undefined") {
      const referrer = document.referrer;
      const isSameOrigin =
        Boolean(referrer) && referrer.startsWith(window.location.origin);

      let isDifferentPage = false;
      if (isSameOrigin) {
        try {
          const referrerUrl = new URL(referrer);
          isDifferentPage = referrerUrl.pathname !== window.location.pathname;
        } catch {
          isDifferentPage = false;
        }
      }

      if (window.history.length > 1 && isSameOrigin && isDifferentPage) {
        e.preventDefault();
        router.back();
      }
    }
  };

  return (
    <Link
      aria-label={label}
      className={cn(
        "inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-all hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:translate-y-px",
        className,
      )}
      href={destination}
      onClick={handleClick}
      title={label}
    >
      {children ?? (
        <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
      )}
    </Link>
  );
}
