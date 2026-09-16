import { notFound } from "next/navigation";
import { isSupportedLocale } from "@ranza/i18n";
import { Badge, Card, EmptyState, Table } from "@ranza/ui";
import { messages } from "../../../../messages";
import {
  entitledProperties,
  TODAY_CAPABILITY,
} from "../../../../server/viewer";

/**
 * Today: the Properties this viewer may work in.
 *
 * The list is whatever survived all five gates of blueprint 3.5 — it is not
 * filtered again here, because a second application-side check would be the
 * weaker of the two and would invite trusting it. An empty list renders an
 * empty state rather than an error: having access to nothing is a normal state
 * for a newly created account.
 */
export default async function TodayPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ property?: string }>;
}) {
  const { locale } = await params;
  if (!isSupportedLocale(locale)) notFound();

  const copy = messages[locale];
  const properties = await entitledProperties(TODAY_CAPABILITY);

  // An id the viewer may not reach simply is not in this list, so an unknown or
  // forged ?property= falls back to the first entitled Property.
  const { property: requested } = await searchParams;
  const selected =
    properties.find((property) => property.propertyId === requested) ??
    properties[0];

  // Nothing survived the five gates. That is a normal state for a new account,
  // not an error, and it is the same answer a forged ?property= gets.
  if (!selected) {
    return (
      <EmptyState
        description={copy.noPropertyDescription}
        title={copy.noPropertyTitle}
      />
    );
  }

  return (
    <>
      <header className="page-intro">
        <h1>{copy.today}</h1>
        <p>{copy.todaySummary}</p>
      </header>

      <Card>
        <h2>{selected.propertyName}</h2>
        <p>
          {copy.organization}: {selected.organizationName}
        </p>
        <p>
          {copy.timezone}: <Badge tone="info">{selected.timezone}</Badge>
        </p>
      </Card>

      <Table label={copy.propertySwitcher}>
        <thead>
          <tr>
            <th scope="col">{copy.property}</th>
            <th scope="col">{copy.organization}</th>
            <th scope="col">{copy.timezone}</th>
          </tr>
        </thead>
        <tbody>
          {properties.map((property) => (
            <tr key={property.propertyId}>
              <td>{property.propertyName}</td>
              <td>{property.organizationName}</td>
              <td>{property.timezone}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
