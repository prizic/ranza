"use client";

import { localeFromPathname, localizeHref, messagesFor } from "@ranza/i18n";
import { FeedbackState } from "@ranza/ui";
import { usePathname } from "next/navigation";

export default function NotFound() {
  const locale = localeFromPathname(usePathname());
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
