import { Skeleton } from "@ranza/ui";

/**
 * What the analytics screen shows while its month is read: the month's title,
 * three headline figures and the table, as shapes — nothing claims to know
 * what the page will say.
 */
export default function AnalyticsLoading() {
  return (
    <div aria-busy="true" className="flex flex-col gap-6">
      <div className="grid gap-3">
        <Skeleton className="h-3 w-40 rounded-md" />
        <Skeleton className="h-12 w-72 max-w-full rounded-xl" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-44 rounded-[2rem]" />
        <Skeleton className="h-44 rounded-[2rem]" />
        <Skeleton className="h-44 rounded-[2rem]" />
      </div>
      <Skeleton className="h-72 rounded-[2rem]" />
    </div>
  );
}
