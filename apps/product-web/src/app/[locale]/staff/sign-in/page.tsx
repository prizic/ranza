import { isSupportedLocale } from "@ranza/i18n";
import { FormField, StatusMessage } from "@ranza/ui";
import { notFound } from "next/navigation";

import { LocalizedShell } from "../../../../components/localized-shell";
import { requestStaffSignIn } from "../actions";

const copy = {
  ar: {
    action: "إرسال رابط الدخول",
    email: "البريد الإلكتروني للعمل",
    error: "تعذّر التحقق من البريد الإلكتروني أو عضوية المشغّل.",
    intro: "استخدم البريد الإلكتروني الذي سجله مدير السكن.",
    sent: "تحقق من بريدك الإلكتروني لإكمال تسجيل الدخول.",
    title: "دخول فريق السكن",
  },
  en: {
    action: "Send sign-in link",
    email: "Work email",
    error: "The email or Operator membership could not be verified.",
    intro: "Use the email registered by your dormitory administrator.",
    sent: "Check your email to finish signing in.",
    title: "Dormitory team sign-in",
  },
  tr: {
    action: "Giriş bağlantısı gönder",
    email: "İş e-postası",
    error: "E-posta veya Operatör üyeliği doğrulanamadı.",
    intro: "Yurt yöneticinizin kaydettiği e-posta adresini kullanın.",
    sent: "Girişi tamamlamak için e-postanızı kontrol edin.",
    title: "Yurt ekibi girişi",
  },
} as const;

export default async function StaffSignInPage({
  params,
  searchParams,
}: PageProps<"/[locale]/staff/sign-in">) {
  const [{ locale }, query] = await Promise.all([params, searchParams]);
  if (!isSupportedLocale(locale)) notFound();
  const messages = copy[locale];

  return (
    <LocalizedShell locale={locale}>
      <section className="control-card">
        <h2>{messages.title}</h2>
        <p>{messages.intro}</p>
        {query.sent ? (
          <StatusMessage tone="success">{messages.sent}</StatusMessage>
        ) : null}
        {query.error ? (
          <StatusMessage tone="warning">{messages.error}</StatusMessage>
        ) : null}
        <form action={requestStaffSignIn} className="control-form">
          <input name="locale" type="hidden" value={locale} />
          <FormField
            id="email"
            label={messages.email}
            name="email"
            type="email"
          />
          <button className="button" type="submit">
            {messages.action}
          </button>
        </form>
      </section>
    </LocalizedShell>
  );
}
