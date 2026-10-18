import type { SupportedLocale } from "@ranza/i18n";

/**
 * What a screen says when a page fails to render, in all three languages.
 *
 * Its own module, and not part of `messages.ts`, because the last error
 * boundary (`app/global-error.tsx`) is bundled into every page's first load and
 * cannot take the whole catalogue with it. The catalogue refers to this one, so
 * the words are still written once.
 */
export interface ErrorBoundaryMessages {
  title: string;
  description: string;
  retry: string;
  /** `{digest}` is the reference the server logged for the same failure. */
  reference: string;
}

export const errorBoundary: Record<SupportedLocale, ErrorBoundaryMessages> = {
  tr: {
    title: "Bir şeyler ters gitti",
    description:
      "Bu sayfa gösterilemedi. Yeniden deneyin; sürerse yöneticinize bildirin ve aşağıdaki referansı iletin.",
    retry: "Yeniden dene",
    reference: "Referans: {digest}",
  },
  en: {
    title: "Something went wrong",
    description:
      "This page could not be shown. Try again; if it keeps happening, tell your manager and give them the reference below.",
    retry: "Try again",
    reference: "Reference: {digest}",
  },
  ar: {
    title: "حدث خطأ ما",
    description:
      "تعذّر عرض هذه الصفحة. حاول مجددًا، وإن تكرر ذلك فأبلغ مديرك وأعطه المرجع أدناه.",
    retry: "حاول مجددًا",
    reference: "المرجع: {digest}",
  },
};
