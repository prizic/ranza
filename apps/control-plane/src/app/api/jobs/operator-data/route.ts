import { operatorArchiveSections } from "@ranza/domain";
import { createClient } from "@supabase/supabase-js";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function authorized(request: Request): boolean {
  const expected = process.env.RANZA_SCHEDULER_SECRET;
  const actual = request.headers
    .get("authorization")
    ?.replace(/^Bearer\s+/i, "");
  if (!expected || !actual) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(actual);
  return left.length === right.length && timingSafeEqual(left, right);
}

const sectionTables: Record<
  (typeof operatorArchiveSections)[number],
  readonly string[]
> = {
  announcements: [
    "announcements",
    "announcement_revisions",
    "announcement_recipients",
    "announcement_acknowledgements",
  ],
  attendance: [
    "attendance_sessions",
    "attendance_responses",
    "attendance_snapshots",
    "attendance_snapshot_students",
    "attendance_corrections",
  ],
  audit: ["audit_events"],
  balances: ["student_balance_accounts", "student_balance_entries"],
  billing: ["subscriptions", "subscription_billing_periods"],
  branches: ["branches", "rooms", "beds"],
  maintenance: [],
  meals: [
    "meal_days",
    "meal_offerings",
    "meal_responses",
    "meal_selections",
    "meal_snapshots",
    "meal_snapshot_students",
    "meal_corrections",
  ],
  operator: ["operators"],
  staff: ["operator_memberships", "branch_assignments"],
  students: ["students", "student_branch_history"],
  wifi: ["wifi_access"],
};

export async function POST(request: Request) {
  if (!authorized(request))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    return NextResponse.json(
      { error: "scheduler_not_configured" },
      { status: 503 },
    );
  const client = createClient(url, key, { auth: { persistSession: false } });
  const correlationId = request.headers.get("x-correlation-id") ?? randomUUID();

  const { data: expired } = await client
    .from("operator_data_exports")
    .select("id,object_path")
    .eq("status", "ready")
    .lte("expires_at", new Date().toISOString())
    .limit(100);
  for (const item of expired ?? []) {
    await client.storage.from("operator-exports").remove([item.object_path]);
    await client
      .from("operator_data_exports")
      .update({ status: "expired" })
      .eq("id", item.id)
      .eq("status", "ready");
  }

  const { data: jobs, error: discoveryError } = await client
    .from("operator_data_exports")
    .select("id,operator_id,object_path,attempt_count,expires_at")
    .in("status", ["queued", "failed"])
    .lt("attempt_count", 3)
    .gt("expires_at", new Date().toISOString())
    .order("requested_at")
    .limit(10);
  if (discoveryError)
    return NextResponse.json(
      { correlationId, error: "export_discovery_failed" },
      { status: 503 },
    );
  const results: Array<{ id: string; status: "failed" | "ready" }> = [];
  for (const job of jobs ?? []) {
    const { data: claimed } = await client
      .from("operator_data_exports")
      .update({ attempt_count: job.attempt_count + 1, status: "running" })
      .eq("id", job.id)
      .in("status", ["queued", "failed"])
      .select("id")
      .maybeSingle();
    if (!claimed) continue;
    try {
      const archive: Record<string, unknown> = {
        generatedAt: new Date().toISOString(),
        operatorId: job.operator_id,
        schemaVersion: 1,
      };
      for (const section of operatorArchiveSections) {
        const tables: Record<string, unknown[]> = {};
        for (const table of sectionTables[section]) {
          const query = client.from(table).select("*");
          const { data, error } =
            table === "operators"
              ? await query.eq("id", job.operator_id)
              : await query.eq("operator_id", job.operator_id);
          if (error) throw error;
          tables[table] = data ?? [];
        }
        archive[section] = tables;
      }
      const body = JSON.stringify(archive);
      const { error: uploadError } = await client.storage
        .from("operator-exports")
        .upload(job.object_path, body, {
          cacheControl: "0",
          contentType: "application/json",
          upsert: true,
        });
      if (uploadError) throw uploadError;
      await client
        .from("operator_data_exports")
        .update({
          completed_at: new Date().toISOString(),
          error_reference: null,
          manifest: {
            schema_version: 1,
            sections: operatorArchiveSections,
            byte_length: Buffer.byteLength(body),
          },
          status: "ready",
        })
        .eq("id", job.id)
        .eq("status", "running");
      results.push({ id: job.id, status: "ready" });
    } catch {
      await client
        .from("operator_data_exports")
        .update({
          error_reference: `OPERATOR-EXPORT-${job.id}`,
          status: "failed",
        })
        .eq("id", job.id)
        .eq("status", "running");
      results.push({ id: job.id, status: "failed" });
    }
  }
  return NextResponse.json({
    correlationId,
    expired: expired?.length ?? 0,
    results,
  });
}
