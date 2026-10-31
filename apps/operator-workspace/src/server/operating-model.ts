import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import type { OperatingModel } from "@ranza/core";
import { LOCATION_HEADER } from "../lib/return-path";
import { getComposition } from "./composition";
import { currentViewer } from "./viewer";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The operating model of the Property this request is about, or null.
 *
 * The Property is the `?property=` the proxy wrote into `LOCATION_HEADER`: a
 * layout and the request config are not handed search parameters, and every
 * page that shows a Property puts it in the URL before it renders. Null — and
 * so the canonical words — for a signed-out request, a page about no Property,
 * an id that is not one, or a Property the viewer does not reach, whose model
 * is then not theirs to learn.
 *
 * Once per request, shared by the request config, the layout and the page.
 */
export const requestOperatingModel = cache(
  async (): Promise<OperatingModel | null> => {
    const here = (await headers()).get(LOCATION_HEADER) ?? "";
    const query = here.split("?")[1] ?? "";
    const propertyId = new URLSearchParams(query).get("property");
    if (!propertyId || !UUID.test(propertyId)) return null;
    return operatingModelOf(propertyId);
  },
);

/** A Property's operating model, as the viewer may read it; null when they cannot. */
export const operatingModelOf = cache(
  async (propertyId: string): Promise<OperatingModel | null> => {
    const viewer = await currentViewer();
    if (!viewer) return null;
    try {
      return await getComposition().core.operatingModel(
        viewer.userId,
        propertyId,
      );
    } catch (error: unknown) {
      // Words are never a rule (ADR 0057), so a failed read costs the reader
      // the dormitory's words and nothing else: the page still renders, and
      // reports the failure rather than taking the error page down with it.
      console.error(
        "words.operating_model_failed",
        { propertyId, userId: viewer.userId },
        error,
      );
      return null;
    }
  },
);
