import type { ReactNode } from "react";
import { BrandMark } from "./brand-mark";

export interface AuthService {
  /** An element, not a component: this layout is rendered on the server and
      sizes whatever it is given. */
  icon: ReactNode;
  label: string;
}

export interface SplitAuthLayoutProps {
  children: ReactNode;
  languageSwitcher?: ReactNode;
  productBadge: string;
  productName: string;
  /** What the product covers, each drawn as a line icon over its name. Only
      things that are built — this row is a promise. */
  services: readonly AuthService[];
  slogan: string;
  subSlogan: string;
  subtitle: string;
  title: string;
}

/**
 * The sign-in gate, composed as the Leaders portal composes its own
 * (leaders-portal/src/components/auth/login-desktop-layout.tsx): an ivory
 * ground with the gold swoosh rising on the end half, the slogan, the service
 * row and the wordmark down the start half, and the form in a floating card over
 * the swoosh.
 *
 * One tree for every width, where Leaders renders a desktop and a mobile copy
 * and hides one: the form holds state and field ids, and two of it would be two
 * forms. Below `lg` the same tree stacks — the card first, then the slogan, the
 * services and the wordmark under it.
 *
 * Leaders' padlock, its "protected by security protocols" line and its
 * logo-figure backdrop are left out: the first two claim something the page
 * does not demonstrate, and the third is another company's mark.
 */
export function SplitAuthLayout({
  children,
  languageSwitcher,
  productBadge,
  productName,
  services,
  slogan,
  subSlogan,
  subtitle,
  title,
}: SplitAuthLayoutProps) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-sign-in-canvas text-sign-in-ink lg:flex-row lg:items-center">
      {languageSwitcher ? (
        <div className="absolute start-6 top-4 z-30 lg:start-8 lg:top-6">
          {languageSwitcher}
        </div>
      ) : null}

      <Swoosh />

      <div className="relative z-10 order-1 flex justify-center px-6 pt-24 lg:order-2 lg:w-[45%] lg:items-center lg:ps-0 lg:pe-10 lg:pt-0 xl:pe-32">
        <div className="w-full max-w-[420px] rounded-[32px] border border-black/5 bg-sign-in-canvas p-8 shadow-[0_18px_60px_rgba(0,0,0,0.08)] motion-safe:animate-rise lg:max-w-[460px] lg:rounded-[40px] lg:border-0 lg:p-12 lg:shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
          <div className="mb-8 lg:mb-10">
            <h1 className="mb-2 text-[28px] font-bold tracking-tight lg:text-[32px]">
              {title}
            </h1>
            <p className="text-sm font-medium text-sign-in-ink-muted">
              {subtitle}
            </p>
          </div>
          {children}
        </div>
      </div>

      <div className="relative z-10 order-2 flex flex-col items-center px-8 pt-12 pb-8 text-center lg:order-1 lg:w-[55%] lg:items-start lg:ps-10 lg:pe-4 lg:pt-20 lg:pb-0 lg:text-start 2xl:ps-32">
        <div className="max-w-2xl lg:mb-16">
          <p className="mb-3 text-[22px] leading-tight font-black tracking-wide uppercase motion-safe:animate-enter-start lg:mb-6 lg:text-3xl xl:text-[40px] rtl:font-bold">
            {slogan}
          </p>
          <p className="text-[15px] leading-relaxed font-medium text-gold-ink motion-safe:animate-enter-start motion-safe:[animation-delay:150ms] lg:text-xl xl:text-2xl">
            {subSlogan}
          </p>
        </div>

        <ul className="mt-8 flex flex-wrap justify-center gap-x-4 gap-y-5 lg:mt-0 lg:mb-24 lg:justify-start lg:gap-4 xl:gap-8 2xl:gap-14">
          {services.map((service, index) => (
            <li
              className="flex w-16 flex-col items-center gap-2 text-center motion-safe:animate-rise lg:w-20 lg:gap-3 xl:w-24 [&_svg]:size-8 lg:[&_svg]:size-[42px]"
              key={service.label}
              style={{ animationDelay: `${300 + index * 100}ms` }}
            >
              {service.icon}
              <span className="text-[10px] font-semibold lg:text-xs">
                {service.label}
              </span>
            </li>
          ))}
        </ul>

        <Wordmark badge={productBadge} name={productName} />
      </div>
    </div>
  );
}

/**
 * The gold swoosh, Leaders' path at Leaders' scale: the full ground from `lg`,
 * the top end corner below it. Two drawings rather than one, because
 * `preserveAspectRatio` — which anchors it differently in each — is an
 * attribute and cannot follow a breakpoint.
 *
 * Mirrored in place for right-to-left. Leaders flips it about its own start
 * edge, which carries it off the screen in Arabic.
 */
function Swoosh() {
  const path =
    "M7362.63 1285.08C7233.24 -89.8154 6385.94 -706.033 5243.79 294.779C4900.84 506.979 4486.91 507.301 4103.82 591.168C2952.02 764.461 3000.37 2206.63 3611.98 2890.21C4863.47 4291.18 7711.41 3289.81 7362.63 1285.08Z";
  return (
    <>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute end-0 top-0 z-[1] h-[45%] w-[70%] overflow-hidden motion-safe:animate-fade-in lg:hidden"
      >
        <svg
          className="absolute end-0 top-0 h-full w-[200%] fill-gold rtl:-scale-x-100"
          preserveAspectRatio="xMaxYMin slice"
          viewBox="0 0 6133 3533"
        >
          <path d={path} />
        </svg>
      </div>
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1] hidden motion-safe:animate-fade-in lg:block"
      >
        <svg
          className="absolute inset-0 size-full fill-gold rtl:-scale-x-100"
          preserveAspectRatio="xMidYMid slice"
          viewBox="0 0 6133 3533"
        >
          <path d={path} />
        </svg>
      </div>
    </>
  );
}

/** The mark over the name, where Leaders sets its logo. */
function Wordmark({ badge, name }: { badge: string; name: string }) {
  return (
    <div className="mt-10 flex flex-col items-center gap-3 motion-safe:animate-enter-start motion-safe:[animation-delay:300ms] lg:mt-auto lg:items-start lg:pb-12">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-md shadow-primary/20 lg:size-16">
        <BrandMark className="size-7 lg:size-8" />
      </span>
      <span className="flex flex-col items-center lg:items-start">
        <span className="text-3xl leading-none font-bold tracking-tight text-primary lg:text-4xl">
          {name}
        </span>
        <span className="mt-1.5 text-xs font-semibold tracking-wider text-primary/80 uppercase">
          {badge}
        </span>
      </span>
    </div>
  );
}
