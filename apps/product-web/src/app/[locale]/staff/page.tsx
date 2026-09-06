import { selectAuthorizedBranch } from "@ranza/auth";
import { isSupportedLocale } from "@ranza/i18n";
import { BidiText, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";
import {
  archiveBedAction,
  archiveRoomAction,
  createBedAction,
  createRoomAction,
  updateBedAction,
  updateRoomAction,
} from "./actions";

interface StaffAccessRow {
  branch_id: string;
  branch_name: string;
  capability: string;
  default_locale: "tr" | "en" | "ar";
  operator_id: string;
  operator_role: "owner" | "manager" | "branch_staff";
  timezone: string;
}

interface RoomRow {
  id: string;
  label: string;
}

interface BedRow {
  available: boolean;
  id: string;
  label: string;
  room_id: string;
}

interface BranchCapacityRow {
  billable_beds: number;
  branch_id: string;
  branch_name: string;
}

interface OperatorCapacityRow {
  billable_beds: number;
  branch_breakdown: Array<{
    billableBeds: number;
    branchId: string;
    branchName: string;
  }>;
}

interface SubscriptionRow {
  id: string;
  pricing_reference: string;
  starts_on: string;
  status: string;
}

interface BillingPeriodRow {
  billable_beds_snapshot: number;
  external_invoice_reference: string;
  period_end: string;
  period_start: string;
}

export default async function StaffPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/staff/sign-in`);

  const { data, error } = await client
    .from("staff_branch_access")
    .select(
      "operator_id, operator_role, branch_id, branch_name, timezone, default_locale, capability",
    )
    .eq("auth_user_id", auth.user.id)
    .returns<StaffAccessRow[]>();
  if (error) throw error;

  const branches = Array.from(
    new Map((data ?? []).map((row) => [row.branch_id, row])).values(),
  );
  const requestedBranch =
    typeof query.branch === "string" ? query.branch : null;
  const selectedBranchId = selectAuthorizedBranch(
    branches.map((branch) => branch.branch_id),
    requestedBranch,
  );
  if (!selectedBranchId)
    redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const selected = branches.find(
    (branch) => branch.branch_id === selectedBranchId,
  );
  if (!selected) redirect(`/${locale}/staff/sign-in?error=not-authorized`);
  const capabilities = (data ?? [])
    .filter((row) => row.branch_id === selectedBranchId)
    .map((row) => row.capability);
  const canManageCapacity = capabilities.includes("branch.manage");
  const [
    { data: rooms, error: roomError },
    { data: beds, error: bedError },
    { data: branchCapacity, error: branchCapacityError },
    { data: operatorCapacity, error: operatorCapacityError },
    { data: subscriptions, error: subscriptionError },
    { data: billingPeriods, error: billingPeriodError },
  ] = await Promise.all([
    client
      .from("rooms")
      .select("id, label")
      .eq("branch_id", selectedBranchId)
      .eq("status", "active")
      .order("label")
      .returns<RoomRow[]>(),
    client
      .from("beds")
      .select("id, room_id, label, available")
      .eq("branch_id", selectedBranchId)
      .eq("status", "active")
      .order("label")
      .returns<BedRow[]>(),
    client
      .from("branch_capacity_summary")
      .select("branch_id, branch_name, billable_beds")
      .eq("operator_id", selected.operator_id)
      .order("branch_name")
      .returns<BranchCapacityRow[]>(),
    client
      .from("operator_capacity_summary")
      .select("billable_beds, branch_breakdown")
      .eq("operator_id", selected.operator_id)
      .maybeSingle<OperatorCapacityRow>(),
    client
      .from("subscriptions")
      .select("id, status, starts_on, pricing_reference")
      .eq("operator_id", selected.operator_id)
      .eq("is_current", true)
      .maybeSingle<SubscriptionRow>(),
    client
      .from("subscription_billing_periods")
      .select(
        "period_start, period_end, billable_beds_snapshot, external_invoice_reference",
      )
      .eq("operator_id", selected.operator_id)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle<BillingPeriodRow>(),
  ]);
  const capacityError =
    roomError ??
    bedError ??
    branchCapacityError ??
    operatorCapacityError ??
    subscriptionError ??
    billingPeriodError;
  if (capacityError) throw capacityError;

  return (
    <LocalizedShell locale={locale}>
      <section
        className="branch-context"
        aria-labelledby="branch-context-title"
      >
        <div>
          <span id="branch-context-title">Active Branch</span>
          <h2>{selected.branch_name}</h2>
          <BidiText>{selected.timezone}</BidiText>
        </div>
        <nav aria-label="Switch Branch" className="branch-switcher">
          {branches.map((branch) => (
            <a
              aria-current={
                branch.branch_id === selectedBranchId ? "page" : undefined
              }
              href={`/${locale}/staff?branch=${encodeURIComponent(branch.branch_id)}`}
              key={branch.branch_id}
            >
              {branch.branch_name}
            </a>
          ))}
        </nav>
      </section>
      {requestedBranch && requestedBranch !== selectedBranchId ? (
        <StatusMessage tone="warning">
          The requested Branch is unavailable. Your authorized Branch is shown
          instead.
        </StatusMessage>
      ) : null}
      <section className="control-card">
        <h2>Staff access</h2>
        <p>{selected.operator_role.replace("_", " ")}</p>
        <ul>
          {capabilities.map((capability) => (
            <li key={capability}>{capability}</li>
          ))}
        </ul>
      </section>
      {query.result ? (
        <StatusMessage tone="success">
          The capacity change was saved and audited.
        </StatusMessage>
      ) : null}
      <section className="ops-list" aria-label="Capacity summary">
        <article>
          <h2>Billable Beds</h2>
          <strong>{operatorCapacity?.billable_beds ?? 0}</strong>
        </article>
        {(branchCapacity ?? []).map((branch) => (
          <article key={branch.branch_id}>
            <h2>{branch.branch_name}</h2>
            <strong>{branch.billable_beds}</strong>
          </article>
        ))}
      </section>
      {subscriptions ? (
        <section className="control-card" aria-labelledby="subscription-title">
          <h2 id="subscription-title">Subscription</h2>
          <p>
            {subscriptions.status} ·{" "}
            <BidiText>{subscriptions.pricing_reference}</BidiText>
          </p>
          <small>Started {subscriptions.starts_on}</small>
          {billingPeriods ? (
            <p>
              Latest consolidated invoice:{" "}
              {billingPeriods.external_invoice_reference} ·{" "}
              {billingPeriods.billable_beds_snapshot} Billable Beds ·{" "}
              {billingPeriods.period_start}–{billingPeriods.period_end}
            </p>
          ) : (
            <p>No billing period has been recorded yet.</p>
          )}
        </section>
      ) : null}
      <section className="control-card" aria-labelledby="capacity-title">
        <h2 id="capacity-title">Rooms and beds · {selected.branch_name}</h2>
        {canManageCapacity ? (
          <form action={createRoomAction} className="control-form compact-form">
            <input name="locale" type="hidden" value={locale} />
            <input
              name="operatorId"
              type="hidden"
              value={selected.operator_id}
            />
            <input name="branchId" type="hidden" value={selectedBranchId} />
            <label>
              <span>Room label</span>
              <input maxLength={80} name="label" required />
            </label>
            <button className="button" type="submit">
              Add room
            </button>
          </form>
        ) : null}
        <div className="operator-directory">
          {(rooms ?? []).map((room) => {
            const roomBeds = (beds ?? []).filter(
              (bed) => bed.room_id === room.id,
            );
            return (
              <article className="operator-card" key={room.id}>
                <header>
                  <h3>{room.label}</h3>
                  <strong>
                    {roomBeds.filter((bed) => bed.available).length} Billable
                    Beds
                  </strong>
                </header>
                {canManageCapacity ? (
                  <div className="lifecycle-actions">
                    <form action={updateRoomAction} className="compact-form">
                      <input name="locale" type="hidden" value={locale} />
                      <input
                        name="operatorId"
                        type="hidden"
                        value={selected.operator_id}
                      />
                      <input
                        name="branchId"
                        type="hidden"
                        value={selectedBranchId}
                      />
                      <input name="roomId" type="hidden" value={room.id} />
                      <input
                        aria-label="Room label"
                        defaultValue={room.label}
                        maxLength={80}
                        name="label"
                        required
                      />
                      <button className="button button-secondary" type="submit">
                        Rename
                      </button>
                    </form>
                    <form action={archiveRoomAction}>
                      <input name="locale" type="hidden" value={locale} />
                      <input
                        name="operatorId"
                        type="hidden"
                        value={selected.operator_id}
                      />
                      <input
                        name="branchId"
                        type="hidden"
                        value={selectedBranchId}
                      />
                      <input name="roomId" type="hidden" value={room.id} />
                      <button className="button button-secondary" type="submit">
                        Archive room
                      </button>
                    </form>
                  </div>
                ) : null}
                <ul>
                  {roomBeds.map((bed) => (
                    <li key={bed.id}>
                      {canManageCapacity ? (
                        <form action={updateBedAction} className="compact-form">
                          <input name="locale" type="hidden" value={locale} />
                          <input
                            name="operatorId"
                            type="hidden"
                            value={selected.operator_id}
                          />
                          <input
                            name="branchId"
                            type="hidden"
                            value={selectedBranchId}
                          />
                          <input name="bedId" type="hidden" value={bed.id} />
                          <input
                            aria-label="Bed label"
                            defaultValue={bed.label}
                            maxLength={80}
                            name="label"
                            required
                          />
                          <label>
                            <input
                              defaultChecked={bed.available}
                              name="available"
                              type="checkbox"
                            />{" "}
                            Available
                          </label>
                          <button
                            className="button button-secondary"
                            type="submit"
                          >
                            Save
                          </button>
                          <button
                            className="button button-secondary"
                            formAction={archiveBedAction}
                            type="submit"
                          >
                            Archive
                          </button>
                        </form>
                      ) : (
                        <span>
                          {bed.label} ·{" "}
                          {bed.available ? "available" : "unavailable"}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
                {canManageCapacity ? (
                  <form
                    action={createBedAction}
                    className="control-form compact-form"
                  >
                    <input name="locale" type="hidden" value={locale} />
                    <input
                      name="operatorId"
                      type="hidden"
                      value={selected.operator_id}
                    />
                    <input
                      name="branchId"
                      type="hidden"
                      value={selectedBranchId}
                    />
                    <input name="roomId" type="hidden" value={room.id} />
                    <label>
                      <span>Bed label</span>
                      <input maxLength={80} name="label" required />
                    </label>
                    <label>
                      <input defaultChecked name="available" type="checkbox" />{" "}
                      Available
                    </label>
                    <button className="button" type="submit">
                      Add bed
                    </button>
                  </form>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </LocalizedShell>
  );
}
