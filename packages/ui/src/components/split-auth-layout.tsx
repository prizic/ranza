import type { ReactNode } from "react";

export interface SplitAuthService {
  icon: ReactNode;
  label: string;
}

export interface SplitAuthLayoutProps {
  brand: ReactNode;
  children: ReactNode;
  languageSwitcher?: ReactNode;
  services?: readonly SplitAuthService[];
  slogan: string;
  subSlogan: string;
  welcomeSubtitle: string;
  welcomeTitle: string;
}

/**
 * The sign-in gate, composed as the Leaders portal composes its own.
 *
 * The product speaks first on the start side — the slogan, what it covers, the
 * mark — and the form waits on a floating card at the end.
 *
 * On a phone the story collapses to the card alone, with the mark above it.
 */
export function SplitAuthLayout({
  brand,
  children,
  languageSwitcher,
  services,
  slogan,
  subSlogan,
  welcomeSubtitle,
  welcomeTitle,
}: SplitAuthLayoutProps) {
  return (
    <div className="relative flex min-h-svh w-full items-center justify-center overflow-hidden bg-background">
      {languageSwitcher ? (
        <div className="absolute start-5 top-5 z-30 sm:start-8 sm:top-6">
          {languageSwitcher}
        </div>
      ) : null}

      <div className="relative z-10 flex min-h-svh w-full flex-col items-center justify-center gap-10 px-4 py-20 sm:px-8 lg:flex-row lg:justify-between lg:px-12 lg:py-0 xl:px-20">
        <div className="hidden w-[55%] flex-col justify-center ps-6 pe-6 lg:flex 2xl:ps-20">
          <p className="mb-5 max-w-2xl text-3xl leading-tight font-black tracking-wide text-foreground/75 uppercase xl:text-[2.5rem]">
            {slogan}
          </p>
          <p className="max-w-2xl text-xl leading-relaxed font-medium text-gold-ink xl:text-2xl">
            {subSlogan}
          </p>

          {services && services.length > 0 ? (
            <ul className="mt-12 mb-16 flex flex-wrap gap-6 text-foreground/75 xl:gap-10">
              {services.map((service) => (
                <li
                  className="flex w-20 flex-col items-center gap-2.5 text-center xl:w-24"
                  key={service.label}
                >
                  <span className="glass flex size-14 items-center justify-center rounded-2xl shadow-xs">
                    {service.icon}
                  </span>
                  <span className="text-xs leading-snug font-semibold">
                    {service.label}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {brand}
        </div>

        <div className="flex w-full items-center justify-center lg:w-[45%] lg:pe-4 xl:pe-12">
          <div className="glass-panel w-full max-w-[460px] rounded-4xl p-8 sm:p-10 lg:p-12">
            <div className="mb-6 border-b border-border/60 pb-5 lg:hidden">
              {brand}
            </div>

            <div className="mb-8 sm:mb-10">
              {/* The page's heading on every width: the slogan is hidden on a
                  phone, and what this page is for is signing in. */}
              <h1 className="mb-2 text-2xl font-bold text-foreground/80 sm:text-[2rem]">
                {welcomeTitle}
              </h1>
              <p className="text-sm font-medium text-muted-foreground">
                {welcomeSubtitle}
              </p>
            </div>

            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
