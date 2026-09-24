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
  href,
  ...props
}: ComponentProps<typeof Link> & { href: string }) {
  const withProperty = useWithProperty();
  return <Link href={withProperty(href)} {...props} />;
}
