"use client";

import { useCallback, useMemo, useState } from "react";
import { toMinorUnits, toTypedAmount } from "../../lib/amount";
import {
  addMonths,
  MAX_INSTALMENTS,
  nightsBetween,
  splitTerm,
} from "./payment-plan-split";

/** One instalment as the desk sees and edits it: the amount as typed. */
export interface PlanRow {
  amount: string;
  dueOn: string;
}

/** Why a plan on the form cannot be saved yet; null when it can. */
export type PlanProblem = "needsDeparture" | "invalidAmount" | "afterTerm";

type Choice = "default" | "on" | "off";

/**
 * The payment plan section of the booking dialog (PP-S2-*).
 *
 * The rows are never stored until the desk changes one: until then they are
 * the monthly split of the total, recomputed as the dates, the Unit or the
 * total change, so the suggestion cannot go stale. Changing a row freezes the
 * rows (the desk's edit is not overwritten by choosing another Unit) and
 * `resplit` hands them back to the suggestion.
 *
 * Whether the section opens by itself is the operating model's default and
 * nothing more (ADR 0057): the desk can turn a plan on at a hotel and off at a
 * dormitory, and nothing is sent unless it is on.
 */
export function usePaymentPlan({
  currency,
  from,
  nightlyRateMinor,
  offered,
  openByDefault,
  resident,
  to,
}: {
  currency: string;
  from: string | undefined;
  /** The price list's price of a night in `currency`; null when it has none. */
  nightlyRateMinor: number | null;
  /** The Property keeps Folios and the viewer may make a plan (PP-S2-08). */
  offered: boolean;
  /** A dormitory's default: the section opens without a press (PP-S2-02). */
  openByDefault: boolean;
  /** Only a Resident's booking has a plan (PP-S2-06). */
  resident: boolean;
  to: string | undefined;
}) {
  const [choice, setChoice] = useState<Choice>("default");
  const [typedTotal, setTypedTotal] = useState<string | null>(null);
  const [editedRows, setEditedRows] = useState<PlanRow[] | null>(null);

  const available = offered && resident;
  const on =
    available && (choice === "on" || (choice === "default" && openByDefault));

  const suggestedTotalMinor =
    nightlyRateMinor !== null && from && to
      ? nightlyRateMinor * nightsBetween(from, to)
      : null;
  const totalText =
    typedTotal ??
    (suggestedTotalMinor === null
      ? ""
      : toTypedAmount(suggestedTotalMinor, currency));
  // No locale: a plain `4500.50` or `4500,50`. "4.500" is then refused rather
  // than read as 4.5 or 4500 depending on a guess about the typist.
  const totalMinor = toMinorUnits(totalText, currency);

  const suggestedRows = useMemo<PlanRow[]>(
    () =>
      from && to
        ? splitTerm(totalMinor, from, to).map((instalment) => ({
            amount: toTypedAmount(instalment.amountMinor, currency),
            dueOn: instalment.dueOn,
          }))
        : [],
    [currency, from, to, totalMinor],
  );
  const rows = editedRows ?? suggestedRows;

  const rowMinors = rows.map((row) => {
    const minor = toMinorUnits(row.amount, currency);
    return minor !== null && minor > 0 ? minor : null;
  });
  const sumMinor = rowMinors.reduce<number>((sum, m) => sum + (m ?? 0), 0);

  const problem: PlanProblem | null = !on
    ? null
    : !to
      ? "needsDeparture"
      : rows.some((row, i) => rowMinors[i] === null || row.dueOn === "")
        ? "invalidAmount"
        : rows.some((row) => row.dueOn > to)
          ? "afterTerm"
          : null;

  const reset = useCallback(() => {
    setChoice("default");
    setTypedTotal(null);
    setEditedRows(null);
  }, []);

  function editRow(index: number, patch: Partial<PlanRow>) {
    setEditedRows(
      rows.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  function addRow() {
    if (!to || rows.length >= MAX_INSTALMENTS) return;
    const last = rows.at(-1);
    const dueOn = last?.dueOn ? addMonths(last.dueOn, 1) : (from ?? to);
    setEditedRows([...rows, { amount: "", dueOn: dueOn > to ? to : dueOn }]);
  }

  return {
    available,
    on,
    problem,
    rows,
    sumMinor,
    totalMinor,
    totalText,
    edited: editedRows !== null,
    atMost: rows.length >= MAX_INSTALMENTS,
    suggestedTotalMinor,
    choose: (next: boolean) => setChoice(next ? "on" : "off"),
    setTotalText: (text: string) => {
      setTypedTotal(text);
      setEditedRows(null);
    },
    editRow,
    addRow,
    removeRow: (index: number) =>
      setEditedRows(rows.filter((_, i) => i !== index)),
    resplit: () => setEditedRows(null),
    reset,
    /** What the form sends: whole minor units per row, empty when there is no plan. */
    submitted:
      on && problem === null
        ? rowMinors.filter((minor): minor is number => minor !== null)
        : [],
  };
}

export type PaymentPlanState = ReturnType<typeof usePaymentPlan>;
