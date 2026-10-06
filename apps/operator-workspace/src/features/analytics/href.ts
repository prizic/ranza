/**
 * The analytics screen's own address with something changed, and everything
 * else kept — above all `property`, which a month or a window must never drop.
 *
 * A day belongs to the month it was opened in, so it is dropped along with the
 * month and the range and kept only when the change names one: no detail from
 * one month is ever carried to another (AN-S3-06).
 */
export function analyticsHref(
  pathname: string,
  current: URLSearchParams,
  change: { month?: string; range?: string; day?: string },
): string {
  const params = new URLSearchParams(current.toString());
  params.delete("month");
  params.delete("range");
  params.delete("day");
  if (change.month) params.set("month", change.month);
  if (change.range) params.set("range", change.range);
  if (change.day) params.set("day", change.day);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}
