"use client";
import { useEffect, useRef, useState } from "react";
import { publicWifiCopy } from "../lib/public-wifi-copy";
import { wifiCopy } from "../lib/wifi-copy";

interface Details {
  networkName: string;
  password: string;
  instructions: string;
}
export function PublicWifiViewer({ locale }: { locale: "tr" | "en" | "ar" }) {
  const [details, setDetails] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const token = useRef<string | null>(null);
  const t = publicWifiCopy[locale];
  const fields = wifiCopy[locale];
  useEffect(() => {
    // Keep the bearer token out of request URLs, history, storage and referrers.
    token.current ??= window.location.hash.slice(1);
    window.history.replaceState(null, "", window.location.pathname);
    const controller = new AbortController();
    fetch("/api/public-wifi", {
      method: "POST",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: token.current }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("unavailable");
        const value: Details = await response.json();
        if (!controller.signal.aborted) setDetails(value);
      })
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);
  return (
    <section className="control-card">
      <h1>{t.title}</h1>
      <p>{t.note}</p>
      {loading ? (
        <p role="status">{t.loading}</p>
      ) : !details ? (
        <p role="alert">{t.error}</p>
      ) : (
        <dl>
          <dt>{fields.networkName}</dt>
          <dd>
            <bdi>{details.networkName}</bdi>
          </dd>
          <dt>{fields.password}</dt>
          <dd>
            <bdi>{details.password}</bdi>
          </dd>
          <dt>{fields.instructions}</dt>
          <dd>{details.instructions}</dd>
        </dl>
      )}
    </section>
  );
}
