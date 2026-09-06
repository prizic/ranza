"use client";
import { useActionState } from "react";
import Image from "next/image";
import { publicWifiCopy } from "../lib/public-wifi-copy";
import { managePublicWifi } from "../app/[locale]/staff/wifi/public-actions";

export function PublicWifiManagement({
  branchId,
  locale,
}: {
  branchId: string;
  locale: "tr" | "en" | "ar";
}) {
  const [state, action, pending] = useActionState(managePublicWifi, {});
  const t = publicWifiCopy[locale];
  return (
    <form action={action} className="control-card" autoComplete="off">
      <h2>{t.title}</h2>
      <p id="public-wifi-warning">{t.warning}</p>
      <input type="hidden" name="branch" value={branchId} />
      <input type="hidden" name="locale" value={locale} />
      <label>
        <input
          type="checkbox"
          name="exposure"
          value="accepted"
          aria-describedby="public-wifi-warning"
        />
        {t.accept}
      </label>
      {state.error && <p role="alert">{t.error}</p>}
      {state.done && <p role="status">{t.done}</p>}
      {state.link && state.qr && (
        <div role="status">
          <p>{t.issued}</p>
          <a href={state.link} rel="noreferrer">
            {t.link}
          </a>
          <p>
            <bdi>{state.link}</bdi>
          </p>
          <Image
            src={state.qr}
            alt={t.qr}
            width={320}
            height={320}
            unoptimized
          />
          <button
            type="submit"
            name="operation"
            value="dismiss"
            disabled={pending}
          >
            {t.clear}
          </button>
        </div>
      )}
      <button type="submit" name="operation" value="issue" disabled={pending}>
        {t.issue}
      </button>
      <button type="submit" name="operation" value="revoke" disabled={pending}>
        {t.revoke}
      </button>
      <button type="submit" name="operation" value="protect" disabled={pending}>
        {t.protect}
      </button>
    </form>
  );
}
