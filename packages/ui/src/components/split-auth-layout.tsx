/// <reference types="next/image-types/global" />
import Image from "next/image";
import type { ReactNode } from "react";
import silk from "../assets/sign-in-silk.webp";
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
 * The sign-in gate, composed as EduBoard composes its login and coloured as
 * Ranza: one framed white card, the wordmark and the form down its start half,
 * and on its end half an emerald-silk showcase carrying the slogan, with the
 * service row on a floating white card.
 *
 * Below `lg` the showcase is dropped and the form fills the card, as EduBoard
 * does: on a phone the slogan is scrolled past on the way to the only thing
 * the page is for.
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
    <div className="flex min-h-svh bg-background sm:p-4 lg:h-svh lg:overflow-hidden lg:p-6">
      <div className="mx-auto flex w-full max-w-[1440px] border-border bg-card shadow-sm sm:rounded-3xl sm:border lg:h-full lg:overflow-hidden">
        <div className="flex w-full flex-col px-4 py-8 sm:px-12 lg:h-full lg:w-1/2 lg:overflow-y-auto lg:px-16 lg:py-12 xl:px-20">
          <div className="mb-auto flex flex-wrap items-center justify-between gap-4">
            <Wordmark badge={productBadge} name={productName} />
            {languageSwitcher}
          </div>

          <div className="my-auto w-full max-w-[440px] py-8 motion-safe:animate-rise">
            <h1 className="mb-2 text-[26px] leading-[1.1] font-semibold text-foreground sm:mb-3 sm:text-4xl lg:text-[40px] xl:text-[44px]">
              {title}
            </h1>
            <p className="mb-6 text-base text-muted-foreground sm:mb-8">
              {subtitle}
            </p>
            {children}
          </div>
        </div>

        <div className="hidden h-full w-1/2 p-2 lg:block">
          <Showcase
            productName={productName}
            services={services}
            slogan={slogan}
            subSlogan={subSlogan}
          />
        </div>
      </div>
    </div>
  );
}

/** The mark in its emerald tile, the name beside it, the badge after. */
function Wordmark({ badge, name }: { badge: string; name: string }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="flex size-7 items-center justify-center rounded-lg bg-primary text-primary-foreground">
        <BrandMark className="size-4" />
      </span>
      <span className="text-xl font-bold text-foreground">{name}</span>
      <span className="rounded-full bg-secondary px-2.5 py-0.5 text-xs font-semibold tracking-wider whitespace-nowrap text-secondary-foreground uppercase">
        {badge}
      </span>
    </span>
  );
}

/**
 * EduBoard's photographic panel, with Ranza's own texture: emerald silk with
 * the brand's gold caught in its folds, generated for this panel with its
 * upper start corner left dark for the slogan. Decorative, so it has no
 * alternative text, and mirrored for right-to-left with the rest of the page.
 * A scrim darkens the corner the slogan sits in, as EduBoard darkens its
 * photograph, so the text never depends on where the gold happens to fall.
 * The slogan is set as EduBoard sets its own — a light serif italic in cream
 * over a heavier sans line. Arabic has no italic and Georgia draws none of it,
 * so right-to-left keeps the sans upright.
 *
 * Where EduBoard floats illustrative app chrome in the bottom corner, this
 * floats the service row: the same composition, carrying screens that exist.
 * One equal column per service rather than a wrapping row, so a laptop-width
 * panel never leaves one service alone on a second line; a long name, such as
 * Turkish "Rezervasyonlar", breaks inside its own column instead.
 */
function Showcase({
  productName,
  services,
  slogan,
  subSlogan,
}: Pick<
  SplitAuthLayoutProps,
  "productName" | "services" | "slogan" | "subSlogan"
>) {
  return (
    <div className="relative isolate flex h-full w-full flex-col overflow-hidden rounded-[32px] bg-surface-strong p-12 shadow-2xl">
      <Image
        alt=""
        className="-z-10 object-cover motion-safe:animate-fade-in rtl:-scale-x-100"
        fill
        placeholder="blur"
        sizes="50vw"
        src={silk}
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 -z-10 from-surface-strong/80 via-surface-strong/20 to-transparent bg-linear-to-br rtl:bg-linear-to-bl"
      />

      <div aria-hidden="true" className="flex items-center gap-2 text-white">
        <BrandMark className="size-6" />
        <span className="text-xl font-bold select-none">{productName}</span>
      </div>

      <div className="mt-16 max-w-md motion-safe:animate-enter-start">
        <p className="font-serif text-4xl leading-[1.05] font-light text-accent-soft italic xl:text-[44px] 2xl:text-[52px] rtl:font-sans rtl:font-semibold rtl:not-italic">
          {slogan}
        </p>
        <p className="mt-5 text-lg leading-relaxed font-semibold text-white/80 xl:text-xl">
          {subSlogan}
        </p>
      </div>

      {services.length > 0 ? (
        <ul className="mt-auto grid w-full max-w-xl auto-cols-fr grid-flow-col gap-x-1 gap-y-4 self-end rounded-3xl bg-card px-3 py-5 shadow-[0_30px_60px_-15px_rgba(0,0,0,0.35)] motion-safe:animate-rise motion-safe:[animation-delay:300ms] xl:gap-x-4 xl:p-6">
          {services.map((service) => (
            <li
              className="flex min-w-0 flex-col items-center gap-2 text-center text-primary [&_svg]:size-7 xl:[&_svg]:size-8"
              key={service.label}
            >
              {service.icon}
              <span className="text-[10px] leading-tight font-semibold break-words hyphens-auto text-foreground xl:text-[11px]">
                {service.label}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
