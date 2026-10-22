import { Children, type ReactNode } from "react";
import Link from "next/link";
import { ArrowUpRight, type LucideIcon } from "lucide-react";
import { cn, DialogTitle } from "@ranza/ui";

/**
 * The pieces of the check-out review, which is laid out as a departure pass:
 * who is leaving and from where on a cream ticket, the bill as its own card,
 * and what else the check-out will do as short rows underneath.
 *
 * They hold no state and decide nothing — `check-out-dialog.tsx` owns what the
 * Guest owes, what is asked of the desk and what is sent. These only draw it.
 */

type Art =
  "bill-due" | "bill-settled" | "early-departure" | "housekeeping" | "key";

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

const STUB_LABEL = "text-step--1 text-foreground/70";

/**
 * Who is leaving, from which Unit, and when they were due, on a ticket with a
 * perforated stub. The notches are clipped by the ticket itself, so the shape
 * holds at any width and mirrors in Arabic. What else is true of this
 * check-out is set under the stub as `children`, so the ticket is the whole of
 * the Guest's side of the dialog and the bill has the other.
 */
export function DepartureTicket({
  children,
  departure,
  guest,
  status,
  title,
  unit,
  unitLabel,
  departureLabel,
}: {
  children?: ReactNode;
  departure: ReactNode;
  departureLabel: string;
  guest: string;
  status: ReactNode;
  title: string;
  unit: string;
  unitLabel: string;
}) {
  return (
    <div className="relative flex flex-col overflow-hidden bg-accent-soft">
      <div className="flex flex-1 items-start gap-4 px-6 pt-4 pb-6">
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="flex min-h-8 items-center pe-10">
            <DialogTitle className="text-step--1 font-medium tracking-widest text-primary-text uppercase rtl:tracking-normal">
              {title}
            </DialogTitle>
          </div>
          <p className="text-step-3 leading-tight font-medium text-balance wrap-anywhere">
            <bdi>{guest}</bdi>
          </p>
        </div>
        <Illustration art="key" className="mt-9 size-24" />
      </div>

      <div aria-hidden="true" className="relative">
        <div className="mx-6 border-t-2 border-dashed border-foreground/15" />
        <span className="absolute start-0 top-0 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-popover rtl:translate-x-1/2" />
        <span className="absolute end-0 top-0 size-6 translate-x-1/2 -translate-y-1/2 rounded-full bg-popover rtl:-translate-x-1/2" />
      </div>

      <dl className="m-0 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pt-5 pb-5">
        <div className="grid gap-1">
          <dt className={STUB_LABEL}>{unitLabel}</dt>
          <dd className="m-0 text-step-1 font-medium tabular-nums">
            <bdi>{unit}</bdi>
          </dd>
        </div>
        <div className="grid gap-1">
          <dt className={STUB_LABEL}>{departureLabel}</dt>
          <dd className="m-0 text-step-1 font-medium">{departure}</dd>
        </div>
        <div>{status}</div>
      </dl>

      {Children.toArray(children).length > 0 ? (
        <div className="grid gap-3 px-6 pb-6">{children}</div>
      ) : null}
    </div>
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

const NOTICE_TONE = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
} as const;

/**
 * A fact about this check-out that is not a figure: a short row, then its
 * words. It sits on the ticket, so it is a lighter card than the ticket.
 */
export function Notice({
  art,
  children,
  icon: Icon,
  tone,
}: {
  art?: Art;
  children: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof NOTICE_TONE;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card/70 px-3.5 py-2.5">
      {art ? (
        <Illustration art={art} className="size-9" />
      ) : Icon && tone ? (
        <span
          className={cn(
            "grid size-9 shrink-0 place-content-center rounded-full",
            NOTICE_TONE[tone],
          )}
        >
          <Icon aria-hidden="true" className="size-4.5" />
        </span>
      ) : null}
      <p className="m-0 min-w-0 flex-1 text-step--1 leading-snug">{children}</p>
    </div>
  );
}
