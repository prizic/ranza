import { isSupportedLocale, localizeHref, messagesFor } from "@ranza/i18n";
import { FeedbackState } from "@ranza/ui";
import { notFound } from "next/navigation";

export default async function MaintenancePage({
  params,
}: PageProps<"/[locale]/maintenance">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);
  return (
    <main className="state-page">
      <FeedbackState
        actionHref={localizeHref(locale, "/")}
        actionLabel={messages.states.maintenance.action}
        description={messages.states.maintenance.description}
        title={messages.states.maintenance.title}
        tone="maintenance"
      />
    </main>
  );
}
