"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Banknote, ReceiptText } from "lucide-react";
import type {
  ChargeableStay,
  MaintenanceRequestCard,
} from "@ranza/maintenance";
import { formatMoney, isolate, type SupportedLocale } from "@ranza/i18n";
import {
  Button,
  Field,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@ranza/ui";
import { toTypedAmount } from "../../../lib/amount";
import {
  chargeGuestForDamage,
  loadChargeableStays,
  recordRepairCost,
} from "../../../server/maintenance";
import { formatDay, Section } from "./look";
import { OutcomeMessage } from "./outcome-message";
import { useCommand } from "./use-command";

/**
 * What a repair cost, and charging a Guest for damage (RANZ-33 slice 5).
 *
 * The cost is offered to whoever works the board; the charge to whoever may
 * post a Folio line where the Property does billing, and only for a request
 * about a room (MT-S5-05, MT-S5-06). The Stays that can be charged are read
 * when the charge form opens, not for every card on the board.
 */
export function RequestMoney({
  request,
  locale,
  mayManage,
  mayCharge,
  vendorMax,
}: {
  request: MaintenanceRequestCard;
  locale: SupportedLocale;
  mayManage: boolean;
  mayCharge: boolean;
  vendorMax: number;
}) {
  const t = useTranslations("maintenance");
  const cost = useCommand(recordRepairCost, locale);
  const charge = useCommand(chargeGuestForDamage, locale);

  const [costTyped, setCostTyped] = useState(
    request.costMinor === null
      ? ""
      : toTypedAmount(request.costMinor, request.currency),
  );
  const [vendor, setVendor] = useState(request.vendor ?? "");
  const [stays, setStays] = useState<
    ChargeableStay[] | "closed" | "loading" | "failed"
  >("closed");
  const [folioId, setFolioId] = useState("");
  const [amount, setAmount] = useState("");

  // A charge posted is a Folio line that only a reversal takes back, so the
  // form does not stay filled for a second press to post it again. Each answer
  // is a new object, so this runs once per charge.
  useEffect(() => {
    if (charge.outcome.status !== "done") return;
    setAmount("");
    setFolioId("");
    setStays("closed");
  }, [charge.outcome]);

  const chosen = Array.isArray(stays)
    ? stays.find((stay) => stay.folioId === folioId)
    : undefined;
  const summary = `${
    request.costMinor === null
      ? t("noCost")
      : formatMoney(request.costMinor, request.currency, locale)
  }${request.vendor ? ` · ${isolate(request.vendor)}` : ""}`;
  const mayChargeHere = mayCharge && request.unit !== null;

  async function openCharge() {
    setStays("loading");
    try {
      setStays(await loadChargeableStays(request.requestId));
    } catch (error: unknown) {
      // The action's own failures are logged by the server; this one may be
      // the network, which nothing else sees. The form says so and offers
      // the same button again.
      console.error(
        "loading the Stays to charge failed",
        {
          requestId: request.requestId,
        },
        error,
      );
      setStays("failed");
    }
  }

  function stayLabel(stay: ChargeableStay): string {
    const when = stay.inHouse
      ? t("inHouseNow")
      : stay.endsOn
        ? t("leftOn", { date: formatDay(stay.endsOn, locale) })
        : null;
    return [
      isolate(stay.guestName ?? t("aGuest")),
      isolate(stay.unitName),
      when,
    ]
      .filter((part) => part !== null)
      .join(" · ");
  }

  if (!mayManage && !mayChargeHere) {
    return request.costMinor === null ? null : (
      <Section title={t("costTitle")}>
        <p className="text-step--1">{summary}</p>
      </Section>
    );
  }

  return (
    <>
      <Section title={t("costTitle")}>
        {mayManage ? (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field
                htmlFor="money-cost"
                label={`${t("cost")} (${request.currency})`}
              >
                <Input
                  id="money-cost"
                  inputMode="decimal"
                  onChange={(event) => setCostTyped(event.target.value)}
                  placeholder="0"
                  value={costTyped}
                />
              </Field>
              <Field htmlFor="money-vendor" label={t("vendor")}>
                <Input
                  id="money-vendor"
                  maxLength={vendorMax}
                  onChange={(event) => setVendor(event.target.value)}
                  placeholder={t("vendorPlaceholder")}
                  value={vendor}
                />
              </Field>
            </div>
            <Button
              className="justify-self-start"
              disabled={cost.pending}
              onClick={() =>
                cost.run({
                  requestId: request.requestId,
                  cost: costTyped,
                  currency: request.currency,
                  vendor,
                })
              }
              size="sm"
              variant="outline"
            >
              <Banknote aria-hidden="true" className="size-4" />
              {cost.pending ? t("saving") : t("save")}
            </Button>
            <OutcomeMessage outcome={cost.outcome} />
          </div>
        ) : (
          <p className="text-step--1">{summary}</p>
        )}
      </Section>

      {mayChargeHere ? (
        <Section title={t("chargeTitle")}>
          {request.charges.length > 0 ? (
            <ul className="grid gap-1 text-step--1">
              {request.charges.map((line) => (
                <li
                  className={
                    line.reversed ? "text-muted-foreground line-through" : ""
                  }
                  key={line.lineId}
                >
                  {formatMoney(line.amountMinor, line.currency, locale)} ·{" "}
                  {isolate(line.guestName ?? t("aGuest"))}
                  {line.reversed ? ` · ${t("reversedCharge")}` : ""}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-step--1 text-muted-foreground">
            {t("chargeHint")}
          </p>
          {stays === "failed" ? (
            <p className="text-step--1 text-destructive" role="alert">
              {t("chargeUnavailable")}
            </p>
          ) : null}
          {stays === "closed" || stays === "loading" || stays === "failed" ? (
            <Button
              className="justify-self-start"
              disabled={stays === "loading"}
              onClick={() => void openCharge()}
              size="sm"
              variant="outline"
            >
              <ReceiptText aria-hidden="true" className="size-4" />
              {stays === "loading" ? t("loading") : t("chargeTitle")}
            </Button>
          ) : stays.length === 0 ? (
            <p className="text-step--1">{t("noChargeable")}</p>
          ) : (
            <div className="grid gap-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field htmlFor="money-stay" label={t("guest")}>
                  <Select onValueChange={setFolioId} value={folioId}>
                    <SelectTrigger id="money-stay">
                      <SelectValue placeholder={t("chooseGuest")} />
                    </SelectTrigger>
                    <SelectContent>
                      {stays.map((stay) => (
                        <SelectItem key={stay.folioId} value={stay.folioId}>
                          {stayLabel(stay)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field
                  htmlFor="money-amount"
                  label={`${t("amount")}${chosen ? ` (${chosen.currency})` : ""}`}
                >
                  <Input
                    id="money-amount"
                    inputMode="decimal"
                    onChange={(event) => setAmount(event.target.value)}
                    value={amount}
                  />
                </Field>
              </div>
              <Button
                className="justify-self-start"
                disabled={charge.pending || !chosen || amount.trim() === ""}
                onClick={() =>
                  chosen &&
                  charge.run({
                    requestId: request.requestId,
                    folioId: chosen.folioId,
                    currency: chosen.currency,
                    amount,
                  })
                }
                size="sm"
              >
                <ReceiptText aria-hidden="true" className="size-4" />
                {charge.pending ? t("saving") : t("charge")}
              </Button>
            </div>
          )}
          <OutcomeMessage outcome={charge.outcome} />
        </Section>
      ) : null}
    </>
  );
}
