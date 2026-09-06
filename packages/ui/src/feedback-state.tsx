"use client";

export interface FeedbackStateProps {
  actionHref?: string;
  actionLabel: string;
  description: string;
  onAction?: () => void;
  reference?: string;
  referenceLabel?: string;
  title: string;
  tone?: "error" | "maintenance" | "neutral";
}

export function FeedbackState({
  actionHref,
  actionLabel,
  description,
  onAction,
  reference,
  referenceLabel,
  title,
  tone = "neutral",
}: FeedbackStateProps) {
  return (
    <section
      aria-labelledby="feedback-title"
      className={`feedback-state feedback-${tone}`}
      role={tone === "error" ? "alert" : "status"}
    >
      <div aria-hidden="true" className="feedback-signal" />
      <h1 id="feedback-title">{title}</h1>
      <p>{description}</p>
      {reference ? (
        <p className="support-reference">
          {referenceLabel ? <span>{referenceLabel}: </span> : null}
          <bdi data-bidi-isolate dir="ltr">
            {reference}
          </bdi>
        </p>
      ) : null}
      {actionHref ? (
        <a className="button" href={actionHref}>
          {actionLabel}
        </a>
      ) : (
        <button className="button" onClick={onAction} type="button">
          {actionLabel}
        </button>
      )}
    </section>
  );
}
