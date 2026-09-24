import { Skeleton } from "@ranza/ui";

/**
 * What the work surface shows between a click and the page's own answer.
 *
 * The shell stays where it is and only this surface is replaced, so a click
 * on the rail answers at once rather than after the server has read the
 * page's data. It is also what lets a rail link prefetch: a page read under
 * the viewer's own context is never prerendered, and Next prefetches such a
 * route only as far as its nearest loading boundary.
 *
 * Shapes, not words — nothing here claims to know what the page will say.
 */
export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <Skeleton className="h-5 w-48 rounded-md" />
      <Skeleton className="h-10 w-full rounded-lg" />
      <div className="grid gap-2">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    </div>
  );
}
