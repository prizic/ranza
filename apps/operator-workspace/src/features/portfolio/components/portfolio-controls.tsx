"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, cn } from "@ranza/ui";
import {
  PORTFOLIO_SORTS,
  PORTFOLIO_VIEWS,
  type PortfolioSort,
  type PortfolioView,
} from "../derive";

/** This screen's own address with one setting changed and every other kept — above all `property`. */
function hrefWith(
  pathname: string,
  current: URLSearchParams,
  name: "sort" | "view",
  value: string,
  fallback: string,
): string {
  const params = new URLSearchParams(current.toString());
  if (value === fallback) params.delete(name);
  else params.set(name, value);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

function Pills<T extends string>({
  current,
  fallback,
  items,
  label,
  name,
  render,
}: {
  current: T;
  fallback: T;
  items: readonly T[];
  label: string;
  name: "sort" | "view";
  render: (item: T) => string;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return (
    <nav
      aria-label={label}
      className="inline-flex flex-wrap items-center gap-1 rounded-full bg-muted p-1"
    >
      {items.map((item) => {
        const active = item === current;
        return (
          <Link
            aria-current={active ? "true" : undefined}
            className={cn(
              "rounded-full px-3.5 py-1 text-xs font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none sm:text-sm",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={hrefWith(pathname, searchParams, name, item, fallback)}
            key={item}
            prefetch={false}
            replace
            scroll={false}
          >
            {render(item)}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * How the Properties are put in order and drawn, and a way to read them again.
 *
 * Order and shape are the address (`?sort=`, `?view=`), so a bookmark of "the
 * Property with the fewest rooms in use first" stays that. The figures are one
 * read with no live refresh: a tab left open all day says when it was read,
 * and this reads it again without leaving the page (PORTFOLIO-05).
 */
export function PortfolioControls({
  sort,
  view,
}: {
  sort: PortfolioSort;
  view: PortfolioView;
}) {
  const t = useTranslations("portfolio");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("sort.label")}</span>
        <Pills
          current={sort}
          fallback="name"
          items={PORTFOLIO_SORTS}
          label={t("sort.label")}
          name="sort"
          render={(item) => t(`sort.${item}`)}
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-muted-foreground">{t("view.label")}</span>
        <Pills
          current={view}
          fallback="cards"
          items={PORTFOLIO_VIEWS}
          label={t("view.label")}
          name="view"
          render={(item) => t(`view.${item}`)}
        />
      </div>
      <Button
        className="ms-auto"
        disabled={pending}
        onClick={() => startTransition(() => router.refresh())}
        size="sm"
        type="button"
        variant="outline"
      >
        <RefreshCw
          aria-hidden="true"
          className={cn("size-4", pending && "animate-spin")}
        />
        {pending ? t("refreshing") : t("refresh")}
      </Button>
    </div>
  );
}
