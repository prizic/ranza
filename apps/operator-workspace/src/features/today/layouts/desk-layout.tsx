"use client";

import { HouseLayout } from "./house-layout";
import type { TodayLayout } from "./model";
import { NextUpLayout } from "./next-up-layout";
import { NightLayout } from "./night-layout";
import type { LayoutProps } from "./parts";
import { TimelineLayout } from "./timeline-layout";

/** The desk layout the viewer chose; `overview` is drawn by the page itself. */
export function DeskLayout({
  layout,
  ...props
}: LayoutProps & { layout: Exclude<TodayLayout, "overview"> }) {
  switch (layout) {
    case "timeline":
      return <TimelineLayout {...props} />;
    case "house":
      return <HouseLayout {...props} />;
    case "next-up":
      return <NextUpLayout {...props} />;
    case "night":
      return <NightLayout {...props} />;
  }
}
