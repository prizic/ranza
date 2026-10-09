import { Skeleton } from "@ranza/ui";

/**
 * What All Properties shows while the portfolio is read: the three summary
 * figures and a row of Property cards, as shapes — nothing claims to know how
 * many Properties there are.
 */
export default function PortfolioLoading() {
  return (
    <div aria-busy="true" className="grid gap-6">
      <Skeleton className="h-4 w-72 max-w-full rounded-md" />
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-40 rounded-[2rem]" />
        <Skeleton className="h-40 rounded-[2rem]" />
        <Skeleton className="h-40 rounded-[2rem]" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Skeleton className="h-72 rounded-[2rem]" />
        <Skeleton className="h-72 rounded-[2rem]" />
        <Skeleton className="h-72 rounded-[2rem]" />
      </div>
    </div>
  );
}
