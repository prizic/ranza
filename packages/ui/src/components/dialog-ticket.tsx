import { Children, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "../lib/utils";
import { DialogTitle } from "./ui/dialog";

/**
 * The head of a dialog that is about one thing — a Guest, a booking, a day — set
 * as a ticket: what is being done in small capitals, who or what it is done to
 * in large type with a drawing at its end, then a perforation and a stub of the
 * facts that identify it.
 *
 * It is the whole of a dialog's identity, so the dialog's own body can be only
 * what is asked of the person. The `DialogTitle` is the eyebrow: a dialog
 * without one is unnamed to a screen reader, and the action is what names it.
 *
 * The notches are clipped by the ticket itself, so the shape holds at any width
 * and mirrors in Arabic. The drawing is always decorative — the heading beside
 * it says the same thing — so it is hidden from a screen reader.
 */

const EYEBROW =
  "text-step--1 font-medium tracking-widest uppercase rtl:tracking-normal";

/**
 * What the rest of a ticketed dialog is dressed in: the body under the ticket,
 * and a footer that sits flush at the foot instead of reaching over the
 * content's padding, which a dialog with no padding of its own does not have.
 */
export const ticketDialogClassName =
  "gap-0 p-0 sm:max-w-lg [&>[data-slot=dialog-close]]:bg-primary/10";
/** From tablet width the ticket takes the start side and the work the other. */
export const ticketDialogWideClassName = cn(
  ticketDialogClassName,
  "md:max-w-[min(56rem,calc(100%-2rem))]",
);
export const ticketWideFormClassName =
  "grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]";
export const ticketBodyClassName = "grid content-start gap-4 p-6";
export const ticketFooterClassName = "bottom-0 mx-0 mb-0 border-t px-6 py-4";

export interface DialogTicketFact {
  label: string;
  value: ReactNode;
}

export interface DialogTicketProps {
  /** A path to the drawing at the end of the heading. */
  art?: string | undefined;
  /** Set under the stub, as notices: what else is true of this dialog's action. */
  children?: ReactNode;
  className?: string;
  /**
   * The action, as the dialog's accessible name. Alone — with no `heading` — it
   * is the large type itself, for a dialog that makes something new and has no
   * subject yet.
   */
  eyebrow: string;
  /** What the action is done to. A name is data, so it is isolated. */
  heading?: string;
  /** Beside the facts, last: the state this subject is in, as a `StatusBadge`. */
  status?: ReactNode;
  stub?: readonly DialogTicketFact[];
}

export function DialogTicket({
  art,
  children,
  className,
  eyebrow,
  heading,
  status,
  stub = [],
}: DialogTicketProps) {
  const hasStub = stub.length > 0 || Boolean(status);
  const titleLed = heading === undefined;
  return (
    <div
      className={cn(
        "relative flex flex-col overflow-hidden bg-primary/15",
        className,
      )}
    >
      <div className="flex flex-1 items-start gap-4 px-6 pt-4 pb-6">
        <div className="grid min-w-0 flex-1 gap-3">
          <div className="flex min-h-8 items-center pe-10">
            <DialogTitle
              className={
                titleLed
                  ? "text-step-2 leading-tight font-medium text-balance"
                  : cn(EYEBROW, "text-primary-text")
              }
            >
              {eyebrow}
            </DialogTitle>
          </div>
          {titleLed ? null : (
            <p className="text-step-3 leading-tight font-medium text-balance wrap-anywhere">
              <bdi>{heading}</bdi>
            </p>
          )}
        </div>
        {art ? (
          <img
            alt=""
            aria-hidden="true"
            className={cn(
              "size-24 shrink-0 object-contain select-none",
              titleLed ? "self-start" : "mt-9",
            )}
            draggable={false}
            src={art}
          />
        ) : null}
      </div>

      {hasStub ? (
        <>
          <div aria-hidden="true" className="relative">
            <div className="mx-6 border-t-2 border-dashed border-foreground/15" />
            <span className="absolute start-0 top-0 size-6 -translate-x-1/2 -translate-y-1/2 rounded-full bg-popover rtl:translate-x-1/2" />
            <span className="absolute end-0 top-0 size-6 translate-x-1/2 -translate-y-1/2 rounded-full bg-popover rtl:-translate-x-1/2" />
          </div>

          <dl className="m-0 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-6 pt-5 pb-5">
            {stub.map((fact) => (
              <div className="grid gap-1" key={fact.label}>
                <dt className="text-step--1 text-foreground/70">
                  {fact.label}
                </dt>
                <dd className="m-0 text-step-1 font-medium tabular-nums">
                  {fact.value}
                </dd>
              </div>
            ))}
            {status ? <div>{status}</div> : null}
          </dl>
        </>
      ) : null}

      {Children.toArray(children).length > 0 ? (
        <div className="grid gap-3 px-6 pb-6">{children}</div>
      ) : null}
    </div>
  );
}

const NOTICE_TONE = {
  info: "bg-info-soft text-info",
  warning: "bg-warning-soft text-warning",
} as const;

/**
 * A fact about the action that is not a figure: an icon in a toned disc and its
 * words, as a light card on the ticket. `art` is a drawing in place of the disc.
 */
export function TicketNotice({
  art,
  children,
  icon: Icon,
  tone,
}: {
  art?: string;
  children: ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof NOTICE_TONE;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-card/70 px-3.5 py-2.5">
      {art ? (
        <img
          alt=""
          aria-hidden="true"
          className="size-9 shrink-0 object-contain select-none"
          draggable={false}
          src={art}
        />
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
