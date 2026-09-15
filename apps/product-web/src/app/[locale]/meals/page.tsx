import { isSupportedLocale } from "@ranza/i18n";
import { Card, EmptyState, StatusMessage } from "@ranza/ui";
import { notFound, redirect } from "next/navigation";

import { LocalizedShell } from "../../../components/localized-shell";
import { createProductWebClient } from "../../../lib/supabase/server";
import { submitMealResponseAction } from "./actions";
import { MealSubmitButton } from "./submit-button";

const copy = {
  tr: {
    breakfast: "Kahvaltı",
    dinner: "Akşam yemeği",
    empty: "Hiçbir seçenek işaretlemezseniz sıfır öğün yanıtı kaydedilir.",
    failed: "Son tarih geçti veya yanıt kaydedilemedi.",
    lunch: "Öğle yemeği",
    none: "Açık bir yemek günü yok.",
    pending: "Kaydediliyor…",
    save: "Yanıtı kaydet",
    saved: "Yanıtınız kaydedildi.",
    title: "Yarınki yemekler",
  },
  en: {
    breakfast: "Breakfast",
    dinner: "Dinner",
    empty: "Leave every option clear to submit an explicit zero-meal response.",
    failed: "The deadline passed or the response could not be saved.",
    lunch: "Lunch",
    none: "No Meal Day is open.",
    pending: "Saving…",
    save: "Save response",
    saved: "Your response was saved.",
    title: "Next-day meals",
  },
  ar: {
    breakfast: "الإفطار",
    dinner: "العشاء",
    empty: "اترك كل الخيارات فارغة لإرسال رد صريح بدون وجبات.",
    failed: "انتهت المهلة أو تعذر حفظ الرد.",
    lunch: "الغداء",
    none: "لا يوجد يوم وجبات مفتوح.",
    pending: "جارٍ الحفظ…",
    save: "حفظ الرد",
    saved: "تم حفظ ردك.",
    title: "وجبات اليوم التالي",
  },
} as const;

export default async function MealsPage({
  params,
  searchParams,
}: PageProps<"/[locale]/meals">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const client = await createProductWebClient();
  const { data: auth } = await client.auth.getUser();
  if (!auth.user) redirect(`/${locale}/activate`);
  const { data: students, error: studentError } = await client
    .from("students")
    .select("id")
    .eq("auth_user_id", auth.user.id)
    .maybeSingle<{ id: string }>();
  if (studentError || !students) redirect(`/${locale}/activate`);
  const { data: days, error: dayError } = await client
    .from("meal_days")
    .select("id, service_date, deadline_at")
    .eq("status", "published")
    .gte("deadline_at", new Date().toISOString())
    .order("service_date")
    .limit(1);
  if (dayError) throw dayError;
  const day = days?.[0];
  const [
    { data: offerings, error: offeringError },
    { data: responses, error: responseError },
  ] = day
    ? await Promise.all([
        client
          .from("meal_offerings")
          .select("id, meal_type")
          .eq("meal_day_id", day.id)
          .order("meal_type"),
        client
          .from("meal_responses")
          .select("id, version, submitted_at")
          .eq("meal_day_id", day.id)
          .eq("student_id", students.id)
          .maybeSingle(),
      ])
    : [
        { data: [], error: null },
        { data: null, error: null },
      ];
  if (offeringError || responseError) throw offeringError ?? responseError;
  const { data: selections, error: selectionError } = responses
    ? await client
        .from("meal_selections")
        .select("offering_id")
        .eq("response_id", responses.id)
    : { data: [], error: null };
  if (selectionError) throw selectionError;
  const selected = new Set((selections ?? []).map((item) => item.offering_id));
  const labels = copy[locale];
  return (
    <LocalizedShell locale={locale}>
      <header className="page-intro page-intro-compact">
        <h1>{labels.title}</h1>
      </header>
      <Card className="meal-card">
        {query.result === "saved" ? (
          <StatusMessage tone="success">{labels.saved}</StatusMessage>
        ) : null}
        {query.result === "failed" ? (
          <StatusMessage tone="warning">{labels.failed}</StatusMessage>
        ) : null}
        {!day ? (
          <EmptyState title={labels.title} description={labels.none} />
        ) : (
          <form action={submitMealResponseAction} className="control-form">
            <input name="locale" type="hidden" value={locale} />
            <input name="mealDayId" type="hidden" value={day.id} />
            <p>
              {day.service_date} · deadline {day.deadline_at}
            </p>
            {(offerings ?? []).map((offering) => (
              <label key={offering.id}>
                <input
                  defaultChecked={selected.has(offering.id)}
                  name="meal"
                  type="checkbox"
                  value={offering.meal_type}
                />
                {labels[offering.meal_type as "breakfast" | "lunch" | "dinner"]}
              </label>
            ))}
            <p>{labels.empty}</p>
            <MealSubmitButton
              label={labels.save}
              pendingLabel={labels.pending}
            />
          </form>
        )}
      </Card>
    </LocalizedShell>
  );
}
