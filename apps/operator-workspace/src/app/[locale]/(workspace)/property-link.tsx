"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useWithProperty } from "../../../lib/nav";

/**
 * A link to another workspace page that keeps the Property being worked in.
 *
 * For the server-rendered shell, which cannot call the hook itself: the
 * selection lives in the query string, which a layout cannot read.
 */
export function PropertyLink({
  defaultProperty,
  href,
  knownProperties,
  ...props
}: ComponentProps<typeof Link> & {
  defaultProperty: string | undefined;
  href: string;
  /** The Properties the viewer can switch to; a `?property=` outside them is not carried. */
  knownProperties: readonly string[];
}) {
  const withProperty = useWithProperty(defaultProperty, knownProperties);
  return <Link href={withProperty(href)} {...props} />;
}
