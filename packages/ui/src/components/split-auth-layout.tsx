import type { ReactNode } from "react";
import {
  ServiceIconChecklist,
  ServiceIconDocument,
  ServiceIconHome,
} from "./auth-icons";
import { BrandMark } from "./brand-mark";

export interface SplitAuthLayoutProps {
  children: ReactNode;
  languageSwitcher?: ReactNode;
  /** What the product is for, in a sentence, under the slogan. */
  pitch: string;
  productBadge: string;
  productName: string;
  /** The slogan in two voices: a light lead, then heavy capitals. */
  sloganLead: string;
  sloganStrong: string;
  subtitle: string;
  title: string;
}

/**
 * The sign-in gate, composed as EduBoard composes its own (see
 * docs/design/ui-references.md): one framed sheet,
 * the form on the start half under the wordmark, and a showcase panel inset on
 * the end half that carries the brand — Ranza's emerald crossed by gold lines,
 * and the slogan set large.
 *
 * The panel is the page's one picture and says nothing the form needs, so on a
 * phone it is gone and the sheet is the form alone.
 */
export function SplitAuthLayout({
  children,
  languageSwitcher,
  pitch,
  productBadge,
  productName,
  sloganLead,
  sloganStrong,
  subtitle,
  title,
}: SplitAuthLayoutProps) {
  return (
    <div className="flex min-h-svh bg-background p-0 sm:p-4 lg:h-svh lg:p-6">
      <div className="mx-auto flex w-full max-w-[1440px] bg-card shadow-sm sm:rounded-4xl sm:border lg:overflow-hidden">
        <div className="flex w-full flex-col px-5 py-8 sm:px-12 lg:w-1/2 lg:overflow-y-auto lg:px-16 lg:py-12 xl:px-20">
          <div className="flex items-center justify-between gap-4">
            <Wordmark badge={productBadge} name={productName} />
            {languageSwitcher}
          </div>

          <div className="my-auto w-full max-w-[440px] py-10">
            <h1 className="mb-3 text-[1.75rem] leading-[1.1] font-semibold sm:text-4xl lg:text-[2.75rem]">
              {title}
            </h1>
            <p className="mb-8 text-base text-muted-foreground">{subtitle}</p>
            {children}
          </div>
        </div>

        <div className="hidden h-full w-1/2 p-2 lg:block">
          <div className="relative isolate flex h-full flex-col overflow-hidden rounded-[2rem] bg-primary p-12 text-primary-foreground">
            {/* Gold lines across the emerald, rising toward the end edge —
                EduBoard's silk, drawn in Ranza's colours. Crisp strokes, no
                blur, and kept clear of the slogan's corner. */}
            <svg
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 -z-10 size-full fill-none stroke-gold rtl:-scale-x-100"
              preserveAspectRatio="xMidYMax slice"
              viewBox="0 0 600 800"
            >
              <path
                d="M-60 900C160 760 300 700 450 590S680 380 760 330"
                opacity=".12"
                strokeWidth="14"
              />
              <path
                d="M-40 760C150 650 260 560 410 470S640 300 720 250"
                opacity=".9"
                strokeWidth="2"
              />
              <path
                d="M-40 820C170 700 300 620 460 530S660 380 740 330"
                opacity=".5"
                strokeWidth="1.25"
              />
              <path
                d="M-80 660C110 590 220 500 360 430S580 300 680 250"
                opacity=".3"
                strokeWidth="1"
              />
            </svg>

            <Wordmark badge={productBadge} name={productName} onDark />

            <div className="mt-16 max-w-md">
              <p className="text-4xl leading-[1.05] xl:text-5xl 2xl:text-[3.25rem]">
                <span className="block font-light text-secondary/90">
                  {sloganLead}
                </span>
                <span className="mt-3 block text-[2rem] font-extrabold uppercase xl:text-[2.5rem] 2xl:text-5xl">
                  {sloganStrong}
                </span>
              </p>
              <p className="mt-6 text-lg leading-relaxed text-primary-foreground/80">
                {pitch}
              </p>
            </div>

            <ProductTiles name={productName} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Wordmark({
  badge,
  name,
  onDark = false,
}: {
  badge: string;
  name: string;
  onDark?: boolean;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        className={
          onDark
            ? "flex size-10 items-center justify-center rounded-xl bg-primary-foreground text-primary"
            : "flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-md shadow-primary/20"
        }
      >
        <BrandMark className="size-5" />
      </span>
      <span className="flex flex-col">
        <span className="text-xl leading-none font-bold">{name}</span>
        <span
          className={
            onDark
              ? "mt-1 text-xs leading-none font-semibold tracking-wider text-secondary/80 uppercase"
              : "mt-1 text-xs leading-none font-semibold tracking-wider text-primary uppercase"
          }
        >
          {badge}
        </span>
      </span>
    </div>
  );
}

/**
 * The product's own chrome, drawn small in the panel's corner: the mark, a
 * slice of the rail, and the name. Shapes only — no invented figures.
 */
function ProductTiles({ name }: { name: string }) {
  return (
    <div
      aria-hidden="true"
      className="-mb-2 mt-auto flex origin-bottom-right items-end gap-3 self-end select-none scale-90 text-primary 2xl:scale-100 rtl:origin-bottom-left"
    >
      <span className="flex size-14 items-center justify-center rounded-2xl bg-card shadow-xl">
        <BrandMark className="size-6" />
      </span>
      <span className="flex h-48 w-15 flex-col items-center justify-between rounded-[1.25rem] bg-card py-4 shadow-xl">
        <span className="flex size-10 items-center justify-center rounded-full bg-secondary">
          <ServiceIconHome size={20} />
        </span>
        <ServiceIconChecklist className="text-muted-foreground" size={20} />
        <ServiceIconDocument className="text-muted-foreground" size={20} />
      </span>
      <span className="flex h-40 w-52 flex-col justify-between rounded-3xl bg-card/95 p-6 shadow-2xl">
        <BrandMark className="size-8" />
        <span className="text-xs font-bold tracking-widest uppercase">
          {name}
        </span>
      </span>
    </div>
  );
}
