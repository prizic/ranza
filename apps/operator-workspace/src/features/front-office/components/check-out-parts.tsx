import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@ranza/ui";

/**
 * The pieces of the check-out review that are its own: the bill as a card with
 * its amount, a line of it, and the link to the Folio. The ticket above it, and
 * the notices on the ticket, are the shared `DialogTicket`.
 *
 * They hold no state and decide nothing — `check-out-dialog.tsx` owns what the
 * Guest owes, what is asked of the desk and what is sent. These only draw it.
 */

type Art = "bill-due" | "bill-settled" | "early-departure";

/**
 * A drawing from `public/illustrations/check-out/`. Always decorative: every
 * one sits beside text that says the same thing, so a screen reader skips it.
 */
export function Illustration({
  art,
  className,
}: {
  art: Art;
  className?: string;
}) {
  return (
    <img
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain select-none", className)}
      draggable={false}
      src={`/illustrations/check-out/${art}.svg`}
    />
  );
}

/**
 * The bill the desk is deciding about, with the amount as the loudest thing in
 * the dialog. The drawing says whether it is open or closed, beside the status
 * that says it in words.
 */
export function BillCard({
  amount,
  art,
  children,
  label,
  status,
}: {
  amount: ReactNode;
  art: "bill-due" | "bill-settled";
  children?: ReactNode;
  label: string;
  status?: ReactNode;
}) {
  return (
    <section className="grid gap-4 rounded-xl border bg-card p-4 shadow-low">
      <div className="flex items-center gap-4">
        <Illustration art={art} className="size-14 sm:size-16" />
        <div className="grid min-w-0 flex-1 gap-1.5">
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <span className="text-step--1 text-muted-foreground">{label}</span>
            {status}
          </div>
          <span className="text-3xl leading-none font-light tracking-tight tabular-nums sm:text-4xl">
            {amount}
          </span>
        </div>
      </div>
      {children}
    </section>
  );
}

/** One line of the bill under its amount: a label and the figure it carries. */
export function BillLine({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-t pt-3 text-step--1">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

export function FolioLink({
  children,
  href,
  newTab,
}: {
  children: ReactNode;
  href: string;
  newTab: boolean;
}) {
  return (
    <div className="border-t pt-3">
      <Link
        className="inline-flex items-center gap-1 text-step--1 font-medium text-primary-text underline-offset-4 hover:underline"
        href={href}
        prefetch={false}
        {...(newTab ? { rel: "noopener", target: "_blank" } : {})}
      >
        {children}
        <ArrowUpRight
          aria-hidden="true"
          className="size-3.5 rtl:-scale-x-100"
        />
      </Link>
    </div>
  );
}
