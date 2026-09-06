import { isSupportedLocale, localizeHref, messagesFor } from "@ranza/i18n";
import { FeedbackState } from "@ranza/ui";
import { notFound } from "next/navigation";

export default async function MissingPage({
  params,
}: PageProps<"/[locale]/[...notFound]">) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();
  const messages = messagesFor(locale);
  return (
    <main className="state-page">
      <FeedbackState
        actionHref={localizeHref(locale, "/")}
        actionLabel={messages.states.notFound.action}
        description={messages.states.notFound.description}
        title={messages.states.notFound.title}
      />
    </main>
  );
}
