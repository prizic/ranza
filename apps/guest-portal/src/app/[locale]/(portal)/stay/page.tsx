import { Fragment } from "react";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  formatDate,
  formatMoney,
  isSupportedLocale,
  type SupportedLocale,
} from "@ranza/i18n";
import { getTranslations, setRequestLocale } from "next-intl/server";
import {
  defaultBrandVariables,
  EmptyState,
  Fact,
  FactList,
  PageHeader,
  Separator,
} from "@ranza/ui";
import type { OwnStay } from "@ranza/stays";
import { brandStyle } from "../../../../lib/brand-style";
import { ownStays, stayBrands } from "../../../../server/viewer";

/**
 * The viewer's own Stay: where they sleep, for how long, and what they owe.
 *
 * The room leads, in the largest type on the page: on a phone, in a corridor,
 * it is the fact worth reading at arm's length. A bed names its room first and
 * itself after it ("A-101", then "Bed B"), because the room is what is on the
 * door. The dates follow, then the balance as one large figure. Everything is
 * stored and shown plainly; nothing here is derived but the balance, which the
 * database sums (ADR 0015).
 *
 * The next instalment of their payment plan sits under the balance, drawn only
 * when the database returned one (GP-S4-11 to GP-S4-17). Whether it is late is
 * the standing's word and not worked out here; a late one is said plainly and
 * quietly, in the card's edge and a sentence, because a student reading this at
 * a door should be told what to do and not alarmed.
 *
 * The balance is absent when the database returned none — no Folio yet, billing
 * not held, finance off at the Property — and is never drawn as a zero, which
 * would tell a student they owe nothing when the truth is that nothing is
 * known (GP-S4-09).
 *
 * The list is whatever survived the policies and the capability gate. It is not
 * filtered again here, because a second application-side check would be the
 * weaker of the two and would invite trusting it.
 *
 * An empty list renders an empty state rather than an error. Having no current
 * Stay is a normal thing to be — and it is the same answer given to a departed
 * Resident, to a Staff Member who signed in here, to a student invited at
 * registration whose Stay does not exist yet, and to a Property whose
 * Organization is not entitled to this capability. Telling those apart from the
 * interface is exactly what the Portal must not do (ADR 0009).
 */

/**
 * `startsOn` is a calendar date, not an instant, so it is parsed and formatted
 * in UTC. Anything else would shift the date by a day for a viewer west of the
 * meridian and quietly show them the wrong arrival.
 */
function formatStayDate(iso: string, locale: SupportedLocale): string {
  return formatDate(new Date(`${iso}T00:00:00Z`), locale, {
    month: "long",
    timeZone: "UTC",
  });
}

/** Which way a balance points: positive is owed, negative is credit (ADR 0015). */
function balanceDirection(
  balance: NonNullable<OwnStay["balance"]>,
): "owed" | "credit" | "settled" {
  const minor = Number(balance.amountMinor);
  return minor > 0 ? "owed" : minor < 0 ? "credit" : "settled";
}

/**
 * What they owe, as one figure in the Folio's own currency, labelled in words
 * because a bare number cannot say which way it points (ADR 0015: positive is
 * owed). The sign is dropped from the figure and carried by the label, so a
 * credit is "In your favour" and not a minus sign a student has to interpret.
 */
function BalanceFigure({
  direction,
  figure,
  heading,
}: {
  direction: string;
  figure: string;
  heading: string;
}) {
  return (
    <div
      className="mt-8 rounded-2xl border border-border bg-card p-6"
      data-testid="stay-balance"
    >
      <p className="text-step--1 text-muted-foreground">{heading}</p>
      <p
        className="mt-1 text-[clamp(2.25rem,10vw,3.5rem)] leading-tight font-light tabular-nums"
        data-testid="stay-balance-figure"
      >
        {figure}
      </p>
      <p className="mt-1 text-step-0 font-medium">{direction}</p>
    </div>
  );
}

/**
 * The next instalment: what is still owed on it and when it falls due, with the
 * overdue state said in words. The edge is the warning tone and not the danger
 * one, and the figure is smaller than the balance's, which stays the page's
 * largest number.
 */
function InstalmentCard({
  amount,
  heading,
  notes,
  position,
  state,
  when,
  whenIso,
}: {
  amount: string;
  heading: string;
  notes: string[];
  position: string;
  state: "overdue" | "due" | "upcoming";
  when: string;
  whenIso: string;
}) {
  return (
    <div
      className={`mt-4 rounded-2xl border border-border bg-card p-6 ${
        state === "overdue" ? "border-s-4 border-s-warning" : ""
      }`}
      data-state={state}
      data-testid="stay-instalment"
    >
      <div className="flex items-baseline justify-between gap-4">
        <p className="text-step--1 text-muted-foreground">{heading}</p>
        <p className="text-step--1 text-muted-foreground">{position}</p>
      </div>
      <p
        className="mt-1 text-[clamp(1.75rem,8vw,2.5rem)] leading-tight font-light tabular-nums"
        data-testid="stay-instalment-amount"
      >
        {amount}
      </p>
      <p className="mt-1 text-step-0 font-medium">
        <time dateTime={whenIso}>{when}</time>
      </p>
      {notes.map((note) => (
        <p className="mt-3 text-step--1 text-muted-foreground" key={note}>
          {note}
        </p>
      ))}
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) return {};
  const t = await getTranslations({ locale });
  return { title: t("stay") };
}

/**
 * Where the guest is now comes first: a Stay in house, then the ones still to
 * come by their arrival, so a later booking is never drawn above the room they
 * are sleeping in (GP-07).
 */
function nowFirst<T extends { status: string; startsOn: string }>(
  stays: readonly T[],
): T[] {
  return [...stays].sort(
    (a, b) =>
      Number(b.status === "in_house") - Number(a.status === "in_house") ||
      a.startsOn.localeCompare(b.startsOn),
  );
}

export default async function StayPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  setRequestLocale(locale);

  const t = await getTranslations();
  const [ownedStays, brands] = await Promise.all([ownStays(), stayBrands()]);
  const stays = nowFirst(ownedStays);

  if (stays.length === 0) {
    return (
      <EmptyState
        description={t("noStayDescription")}
        title={t("noStayTitle")}
      />
    );
  }

  return (
    <>
      {stays.map((stay, index) => (
        <Fragment key={stay.stayId}>
          {index > 0 ? (
            <Separator className="my-10 h-0.5 bg-foreground/15" />
          ) : null}
          {/* Each Stay is drawn in its own Organization's brand, so a second
            Stay is not coloured by the first's (ADR 0046). */}
          <section
            style={
              brandStyle(
                brands.find((entry) => entry.stayId === stay.stayId),
              ) ?? defaultBrandVariables
            }
          >
            <PageHeader>
              <p className="text-step--1 text-muted-foreground">
                {stay.propertyName} · {t(`stayStatus.${stay.status}`)}
              </p>
              {/* A room name is a few characters and can be set very large; a
                  Property name cannot, which is why it is the small line. */}
              <h2 className="mt-2 text-[clamp(3rem,14vw,5rem)] leading-none font-light">
                {stay.roomName ?? stay.unitName}
              </h2>
              <p className="mt-3 text-step-0 text-muted-foreground">
                {[
                  stay.roomName === null
                    ? `${t(`unitType.${stay.unitType}`)} · ${t("sleeps", { count: stay.unitCapacity })}`
                    : t("myStay.bed", { name: stay.unitName }),
                  stay.building,
                  stay.floor === null
                    ? null
                    : t("myStay.floor", { floor: stay.floor }),
                ]
                  .filter((part) => part !== null && part !== "")
                  .join(" · ")}
              </p>
            </PageHeader>

            {/* Two columns even on a phone, so the dates sit side by side and the
                balance below them is not pushed off the first screen. Each fact
                keeps its own height: stretched to its neighbour's, a date that
                fits on one line sits lower than the one that wrapped. */}
            <FactList className="grid-cols-2 items-start gap-x-4 gap-y-6">
              <Fact label={t("arrival")}>
                <time dateTime={stay.startsOn}>
                  {formatStayDate(stay.startsOn, locale)}
                </time>
              </Fact>
              <Fact label={t("departure")}>
                {stay.endsOn ? (
                  <time dateTime={stay.endsOn}>
                    {formatStayDate(stay.endsOn, locale)}
                  </time>
                ) : (
                  t("openEnded")
                )}
              </Fact>
              <Fact label={t("stayKind")}>
                {t(`stayType.${stay.stayType}`)}
              </Fact>
            </FactList>

            {stay.balance ? (
              <BalanceFigure
                direction={t(`myStay.${balanceDirection(stay.balance)}`)}
                figure={formatMoney(
                  Math.abs(Number(stay.balance.amountMinor)),
                  stay.balance.currency,
                  locale,
                )}
                heading={t("myStay.balance")}
              />
            ) : null}

            {stay.nextInstalment ? (
              <InstalmentCard
                amount={formatMoney(
                  Number(stay.nextInstalment.outstandingMinor),
                  stay.nextInstalment.currency,
                  locale,
                )}
                heading={t("myStay.instalment.heading")}
                notes={
                  stay.nextInstalment.state === "overdue"
                    ? [
                        t("myStay.instalment.overdueNote"),
                        ...(stay.nextInstalment.overdueCount > 1
                          ? [
                              t("myStay.instalment.overdueAll", {
                                count: stay.nextInstalment.overdueCount,
                                amount: formatMoney(
                                  Number(stay.nextInstalment.overdueMinor),
                                  stay.nextInstalment.currency,
                                  locale,
                                ),
                              }),
                            ]
                          : []),
                      ]
                    : []
                }
                position={t("myStay.instalment.position", {
                  number: stay.nextInstalment.number,
                  total: stay.nextInstalment.of,
                })}
                state={stay.nextInstalment.state}
                when={
                  stay.nextInstalment.state === "due"
                    ? t("myStay.instalment.dueToday")
                    : t(
                        stay.nextInstalment.state === "overdue"
                          ? "myStay.instalment.wasDueOn"
                          : "myStay.instalment.dueOn",
                        {
                          date: formatStayDate(
                            stay.nextInstalment.dueOn,
                            locale,
                          ),
                        },
                      )
                }
                whenIso={stay.nextInstalment.dueOn}
              />
            ) : null}
          </section>
        </Fragment>
      ))}
    </>
  );
}
