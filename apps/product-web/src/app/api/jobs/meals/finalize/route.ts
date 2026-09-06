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
  const correlationRoot =
    request.headers.get("x-correlation-id") ?? randomUUID();
  const { data: dueDays, error: discoveryError } = await client
    .from("meal_days")
    .select("id,operator_id,branch_id")
    .eq("status", "published")
    .lte("deadline_at", new Date().toISOString())
    .limit(100);
  if (discoveryError)
    return NextResponse.json(
      { error: "meal_discovery_failed", correlationId: correlationRoot },
      { status: 503 },
    );
  const results: Array<{ mealDayId: string; status: "failed" | "succeeded" }> =
    [];
  for (const day of dueDays ?? []) {
    const correlationId = `${correlationRoot}:${day.id}`;
    const { data: run, error: runError } = await client
      .from("background_job_runs")
      .insert({
        branch_id: day.branch_id,
        correlation_id: correlationId,
        job_key: "meal.finalize",
        operator_id: day.operator_id,
        status: "running",
        target_id: day.id,
      })
      .select("id")
      .single();
    if (runError) {
      results.push({ mealDayId: day.id, status: "failed" });
      continue;
    }
    const { data: snapshotId, error } = await client.rpc("finalize_meal_day", {
      target_correlation_id: correlationId,
      target_meal_day_id: day.id,
    });
    const status = error ? "failed" : "succeeded";
    await client
      .from("background_job_runs")
      .update({
        error_reference: error ? `MEAL-FINALIZE-${run.id}` : null,
        finished_at: new Date().toISOString(),
        result_summary: error ? {} : { snapshotId },
        status,
      })
      .eq("id", run.id);
    results.push({ mealDayId: day.id, status });
  }
  return NextResponse.json({
    correlationId: correlationRoot,
    discovered: dueDays?.length ?? 0,
    results,
  });
}
