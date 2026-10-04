/**
 * The analytics screen's own address with something changed, and everything
 * else kept — above all `property`, which a month or a window must never drop.
 */
export function analyticsHref(
  pathname: string,
  current: URLSearchParams,
  change: { month?: string; range?: string },
): string {
  const params = new URLSearchParams(current.toString());
  params.delete("month");
  params.delete("range");
  if (change.month) params.set("month", change.month);
  if (change.range) params.set("range", change.range);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
