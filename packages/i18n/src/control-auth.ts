import type { SupportedLocale } from "./index";

interface ControlAuthMessages {
  acceptInvite: { action: string; description: string; title: string };
  acceptRecovery: { action: string; description: string; title: string };
  forgotPassword: {
    action: string;
    backToSignIn: string;
    description: string;
    emailLabel: string;
    sent: string;
    title: string;
  };
  setPassword: {
    action: string;
    confirmationLabel: string;
    description: string;
    errors: {
      generic: string;
      mismatch: string;
      tooLong: string;
      tooShort: string;
      updateFailed: string;
    };
    hint: string;
    passwordLabel: string;
    title: string;
  };
  signIn: { forgotPassword: string; invalidInvite: string };
}

const messages: Record<SupportedLocale, ControlAuthMessages> = {
  ar: {
    acceptInvite: {
      action: "قبول الدعوة",
      description: "تابع لتأكيد هذه الدعوة لمرة واحدة وإنشاء كلمة مرور المنصة.",
      title: "قبول دعوتك الآمنة",
    },
    acceptRecovery: {
      action: "متابعة استعادة الحساب",
      description:
        "تابع لتأكيد رابط الاستعادة هذا وإنشاء كلمة مرور جديدة للمنصة.",
      title: "استعادة حساب المنصة",
    },
    forgotPassword: {
      action: "إرسال رابط الاستعادة",
      backToSignIn: "العودة إلى تسجيل الدخول",
      description:
        "أدخل بريد حساب المنصة. إذا كان الحساب مؤهلاً، سنرسل رابط إعداد آمنًا.",
      emailLabel: "البريد الإلكتروني",
      sent: "إذا كان الحساب مؤهلاً، فقد أرسلنا رابط إعداد آمنًا.",
      title: "استعادة كلمة المرور",
    },
    setPassword: {
      action: "حفظ كلمة المرور والمتابعة",
      confirmationLabel: "تأكيد كلمة المرور",
      description:
        "اختر كلمة مرور لحساب منصة Prizic. ستُعدّ المصادقة الثنائية بعد ذلك.",
      errors: {
        generic: "تعذّر حفظ كلمة المرور.",
        mismatch: "تأكيد كلمة المرور غير مطابق.",
        tooLong:
          "استخدم 72 بايت UTF-8 كحد أقصى. قد تستخدم الرموز التعبيرية والحروف غير اللاتينية عدة بايتات.",
        tooShort: "استخدم 12 حرفًا على الأقل لكلمة المرور.",
        updateFailed:
          "تعذّر حفظ كلمة المرور. تواصل مع دعم المنصة للحصول على رابط إعداد جديد.",
      },
      hint: "استخدم 12 حرفًا على الأقل و72 بايت UTF-8 كحد أقصى.",
      passwordLabel: "كلمة المرور",
      title: "إنشاء كلمة المرور",
    },
    signIn: {
      forgotPassword: "هل نسيت كلمة المرور؟",
      invalidInvite:
        "رابط الدعوة غير صالح أو منتهي الصلاحية. اطلب رابط إعداد جديدًا.",
    },
  },
  en: {
    acceptInvite: {
      action: "Accept invitation",
      description:
        "Continue to confirm this one-time invitation and create your platform password.",
      title: "Accept your secure invitation",
    },
    acceptRecovery: {
      action: "Continue account recovery",
      description:
        "Continue to confirm this recovery link and create a new platform password.",
      title: "Recover your platform account",
    },
    forgotPassword: {
      action: "Send recovery link",
      backToSignIn: "Return to sign in",
      description:
        "Enter your platform account email. If the account is eligible, we will send a secure setup link.",
      emailLabel: "Email",
      sent: "If the account is eligible, a secure setup link has been sent.",
      title: "Recover your password",
    },
    setPassword: {
      action: "Save password and continue",
      confirmationLabel: "Confirm password",
      description:
        "Choose a password for your Prizic platform account. You will set up two-factor authentication next.",
      errors: {
        generic: "The password could not be saved.",
        mismatch: "The password confirmation does not match.",
        tooLong:
          "Use no more than 72 UTF-8 bytes. Emoji and non-Latin characters may use multiple bytes.",
        tooShort: "Use at least 12 characters for your password.",
        updateFailed:
          "The password could not be saved. Contact platform support for a fresh setup link.",
      },
      hint: "Use at least 12 characters and no more than 72 UTF-8 bytes.",
      passwordLabel: "Password",
      title: "Create your password",
    },
    signIn: {
      forgotPassword: "Forgot your password?",
      invalidInvite:
        "This invitation link is invalid or has expired. Request a fresh setup link.",
    },
  },
  tr: {
    acceptInvite: {
      action: "Daveti kabul et",
      description:
        "Bu tek kullanımlık daveti doğrulamak ve platform parolanızı oluşturmak için devam edin.",
      title: "Güvenli davetinizi kabul edin",
    },
    acceptRecovery: {
      action: "Hesap kurtarmaya devam et",
      description:
        "Bu kurtarma bağlantısını doğrulamak ve yeni bir platform parolası oluşturmak için devam edin.",
      title: "Platform hesabınızı kurtarın",
    },
    forgotPassword: {
      action: "Kurtarma bağlantısı gönder",
      backToSignIn: "Girişe dön",
      description:
        "Platform hesabınızın e-posta adresini girin. Hesap uygunsa güvenli bir kurulum bağlantısı göndereceğiz.",
      emailLabel: "E-posta",
      sent: "Hesap uygunsa güvenli bir kurulum bağlantısı gönderildi.",
      title: "Parolanızı kurtarın",
    },
    setPassword: {
      action: "Parolayı kaydet ve devam et",
      confirmationLabel: "Parolayı doğrulayın",
      description:
        "Prizic platform hesabınız için bir parola seçin. Ardından iki aşamalı doğrulamayı kuracaksınız.",
      errors: {
        generic: "Parola kaydedilemedi.",
        mismatch: "Parola doğrulaması eşleşmiyor.",
        tooLong:
          "En fazla 72 UTF-8 bayt kullanın. Emoji ve Latin dışı karakterler birden fazla bayt kullanabilir.",
        tooShort: "Parolanız için en az 12 karakter kullanın.",
        updateFailed:
          "Parola kaydedilemedi. Yeni bir kurulum bağlantısı için platform desteğine başvurun.",
      },
      hint: "En az 12 karakter ve en fazla 72 UTF-8 bayt kullanın.",
      passwordLabel: "Parola",
      title: "Parolanızı oluşturun",
    },
    signIn: {
      forgotPassword: "Parolanızı mı unuttunuz?",
      invalidInvite:
        "Bu davet bağlantısı geçersiz veya süresi dolmuş. Yeni bir kurulum bağlantısı isteyin.",
    },
  },
};

export function controlAuthMessagesFor(
  locale: SupportedLocale,
): ControlAuthMessages {
  return messages[locale];
}
