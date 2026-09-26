import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils";

/**
 * The way up from an inner page: a link to the page one level above it.
 *
 * A link rather than `history.back()`. The workspace is one document across
 * page switches, so nothing in the browser says where somebody came from
 * inside it, and the full loads that do leave a trace — changing the language
 * or the Property — are exactly the ones that must not be undone by "Back".
 * The browser's own Back button still walks history.
 *
 * The arrow mirrors in Arabic by construction; the target is a phone-sized
 * tap target like the bar's other controls.
 */
export function BackButton({
  className,
  href,
  label,
}: {
  className?: string | undefined;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-label={label}
      className={cn(
        "inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:size-9",
        className,
      )}
      href={href}
      title={label}
    >
      <ArrowLeft aria-hidden="true" className="size-4 rtl:rotate-180" />
    </Link>
  );
}
