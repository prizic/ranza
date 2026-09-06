"use server";
import { isSupportedLocale } from "@ranza/i18n";
import { headers } from "next/headers";
import QRCode from "qrcode";
import { createProductWebClient } from "../../../../lib/supabase/server";
import {
  generateWifiToken,
  publicWifiLink,
} from "../../../../server/public-wifi-token";

export interface PublicWifiState {
  link?: string;
  qr?: string;
  error?: boolean;
  done?: boolean;
}
export async function managePublicWifi(
  _previous: PublicWifiState,
  form: FormData,
): Promise<PublicWifiState> {
  if (form.get("operation") === "dismiss") return {};
  try {
    const client = await createProductWebClient();
    const { data: auth } = await client.auth.getUser();
    if (!auth.user) return { error: true };
    const branch = String(form.get("branch") ?? "");
    const rawLocale = form.get("locale");
    const locale = isSupportedLocale(rawLocale) ? rawLocale : "tr";
    const operation = form.get("operation");
    if (operation === "revoke" || operation === "protect") {
      const result = await client.rpc("revoke_public_wifi_link", {
        target_branch_id: branch,
        restore_protected: operation === "protect",
      });
      return result.error ? { error: true } : { done: true };
    }
    if (operation !== "issue" || form.get("exposure") !== "accepted")
      return { error: true };
    const issued = generateWifiToken();
    const origin =
      process.env.PRODUCT_WEB_ORIGIN ??
      (process.env.NODE_ENV !== "production"
        ? (await headers()).get("origin")
        : null);
    if (!origin) return { error: true };
    const link = publicWifiLink(origin, locale, issued.token);
    const qr = await QRCode.toDataURL(link, {
      errorCorrectionLevel: "M",
      width: 320,
      margin: 4,
    });
    const result = await client.rpc("issue_public_wifi_link", {
      target_branch_id: branch,
      new_token_hash: issued.hash,
      exposure_accepted: true,
    });
    return result.error ? { error: true } : { link, qr };
  } catch {
    return { error: true };
  }
}
