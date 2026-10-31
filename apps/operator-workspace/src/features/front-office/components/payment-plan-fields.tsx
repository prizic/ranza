"use client";

import { useTranslations } from "next-intl";
import { Plus, X } from "lucide-react";
import { formatMoney, type SupportedLocale } from "@ranza/i18n";
import { Button, DialogSection, Input, fieldClassName } from "@ranza/ui";
import { nightsBetween } from "../payment-plan-split";
import type { PaymentPlanState } from "../use-payment-plan";

/**
 * A Resident's fees as instalments, in the booking dialog (PP-S2-*).
 *
 * Open for a dormitory's Resident and one press away for a hotel's (ADR 0057:
 * the model sets what is shown first, never the rule). Every row is the desk's
 * to change and a total that differs from the price list's does not block
 * saving: a term is often agreed at a figure the price list does not have.
 *
 * The amounts typed here are for the eye; what is sent is whole minor units in
 * hidden fields, one per row, beside the due days. The database decides whether
 * the plan is a good one, and a plan it refuses leaves no booking behind.
 */
export function PaymentPlanFields({
  currency,
  from,
  locale,
  plan,
  tagOptional,
  to,
}: {
  currency: string;
  from: string | undefined;
  locale: SupportedLocale;
  plan: PaymentPlanState;
  tagOptional: string;
  to: string | undefined;
}) {
  const t = useTranslations("paymentPlan");

  if (!plan.available) return null;

  if (!plan.on) {
    return (
      <div className="py-5">
        <Button
          onClick={() => plan.choose(true)}
          size="sm"
          type="button"
          variant="outline"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("show")}
        </Button>
      </div>
    );
  }

  const money = (minor: number) => formatMoney(minor, currency, locale);
  const difference =
    plan.totalMinor === null ? 0 : plan.sumMinor - plan.totalMinor;
  const nights = from && to ? nightsBetween(from, to) : 0;
  const problem =
    plan.problem === "needsDeparture"
      ? t("needsDeparture")
      : plan.problem === "invalidAmount"
        ? t("invalidAmount")
        : plan.problem === "afterTerm"
          ? t("afterTerm")
          : null;

  return (
    <DialogSection
      hint={t("hint")}
      tag={{ label: tagOptional }}
      title={t("title")}
      titleId="booking-payment-plan"
    >
      <div
        aria-labelledby="booking-payment-plan"
        className="grid gap-4"
        role="group"
      >
        <div className="grid gap-1.5">
          <label className="text-sm font-medium" htmlFor="booking-plan-total">
            {t("total")}
          </label>
          <div className="flex items-center gap-2">
            <Input
              autoComplete="off"
              className={`${fieldClassName} max-w-44`}
              id="booking-plan-total"
              inputMode="decimal"
              onChange={(event) => plan.setTotalText(event.target.value)}
              value={plan.totalText}
            />
            <span className="text-sm text-muted-foreground" dir="ltr">
              {currency}
            </span>
          </div>
          <p className="m-0 text-step--1 text-muted-foreground">
            {plan.suggestedTotalMinor === null ? (
              t("totalNoPrice")
            ) : (
              <bdi>
                {t("totalFromPrice", {
                  price: money(plan.suggestedTotalMinor / nights),
                  count: nights,
                })}
              </bdi>
            )}
          </p>
        </div>

        {plan.rows.length > 0 ? (
          <ol className="m-0 grid list-none gap-2 p-0">
            {plan.rows.map((row, index) => {
              const number = index + 1;
              const label = t("instalment", { number });
              return (
                <li
                  className="grid grid-cols-[1.25rem_minmax(0,1fr)_minmax(0,1fr)_2rem] items-center gap-2"
                  // A row has no identity but its place: the desk edits it by
                  // position and every row is rebuilt from the same list.
                  key={number}
                >
                  <span
                    aria-hidden="true"
                    className="text-step--1 tabular-nums text-muted-foreground"
                  >
                    {number}
                  </span>
                  <Input
                    aria-label={`${label} · ${t("dueOn")}`}
                    className={fieldClassName}
                    max={to}
                    name={plan.problem === null ? "planDueOn" : undefined}
                    onChange={(event) =>
                      plan.editRow(index, { dueOn: event.target.value })
                    }
                    required
                    type="date"
                    value={row.dueOn}
                  />
                  <Input
                    aria-label={`${label} · ${t("amount")}`}
                    autoComplete="off"
                    className={`${fieldClassName} tabular-nums`}
                    inputMode="decimal"
                    onChange={(event) =>
                      plan.editRow(index, { amount: event.target.value })
                    }
                    value={row.amount}
                  />
                  {plan.problem === null ? (
                    <input
                      name="planAmountMinor"
                      type="hidden"
                      value={plan.submitted[index] ?? ""}
                    />
                  ) : null}
                  <Button
                    aria-label={t("removeRow", { number })}
                    disabled={plan.rows.length === 1}
                    onClick={() => plan.removeRow(index)}
                    size="icon-sm"
                    type="button"
                    variant="ghost"
                  >
                    <X aria-hidden="true" className="size-4" />
                  </Button>
                </li>
              );
            })}
          </ol>
        ) : problem === null ? (
          <p className="m-0 text-step--1 text-muted-foreground" role="status">
            {t("needsTotal")}
          </p>
        ) : null}

        {problem ? (
          <p className="m-0 text-step--1 text-warning" role="status">
            {problem}
          </p>
        ) : plan.rows.length > 0 ? (
          <p
            aria-live="polite"
            className="m-0 text-sm font-medium"
            role="status"
          >
            <bdi>{t("sum", { sum: money(plan.sumMinor) })}</bdi>
            {difference !== 0 ? (
              <span className="font-normal text-muted-foreground">
                {" · "}
                <bdi>
                  {t("differs", {
                    difference: money(Math.abs(difference)),
                    direction: difference > 0 ? "more" : "less",
                  })}
                </bdi>
              </span>
            ) : null}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {plan.rows.length > 0 ? (
            <Button
              disabled={plan.atMost}
              onClick={plan.addRow}
              size="sm"
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-4" />
              {t("add")}
            </Button>
          ) : null}
          {plan.edited ? (
            <Button
              onClick={plan.resplit}
              size="sm"
              type="button"
              variant="outline"
            >
              {t("resplit")}
            </Button>
          ) : null}
          <Button
            onClick={() => plan.choose(false)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("remove")}
          </Button>
        </div>
      </div>
    </DialogSection>
  );
}
