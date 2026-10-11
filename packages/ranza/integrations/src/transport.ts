import { request as httpRequest, type ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { DeliveryFailure } from "./contracts";
import {
  BlockedAddressError,
  checkTargetUrl,
  guardedLookup,
  type TargetPolicy,
} from "./target";

/**
 * One attempt to deliver, and what it came to (ADR 0045).
 *
 * The rules a receiver can rely on: a 2xx is delivered; a 408, 429 or any 5xx,
 * a timeout, or a connection that did not complete is worth trying again; every
 * other answer, including a redirect, is not. A redirect is not followed,
 * because the address it names has not been checked and following it would make
 * the check above decorative.
 */

export const REQUEST_TIMEOUT_MS = 10_000;

/** How much of a reply is read, and how much of it is kept. */
const READ_LIMIT_BYTES = 1024;
const EXCERPT_LIMIT_CHARS = 200;

export type AttemptOutcome = "delivered" | "retryable" | "permanent";

export interface AttemptResult {
  readonly outcome: AttemptOutcome;
  readonly statusCode: number | null;
  readonly failure: DeliveryFailure | null;
  /** At most 200 characters of what the receiver said, on one line. */
  readonly excerpt: string | null;
  readonly durationMs: number;
}

export interface AttemptRequest {
  readonly url: string;
  readonly body: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly policy: TargetPolicy;
  readonly timeoutMs?: number;
}

const RETRYABLE_STATUS = new Set([408, 429]);

export function classifyStatus(
  statusCode: number,
): Pick<AttemptResult, "outcome" | "failure"> {
  if (statusCode >= 200 && statusCode < 300) {
    return { outcome: "delivered", failure: null };
  }
  if (statusCode >= 300 && statusCode < 400) {
    return { outcome: "permanent", failure: "redirect_refused" };
  }
  if (statusCode >= 500 || RETRYABLE_STATUS.has(statusCode)) {
    return { outcome: "retryable", failure: "http_error" };
  }
  return { outcome: "permanent", failure: "http_error" };
}

const TLS_CODES =
  /^(ERR_TLS_|ERR_SSL_|CERT_|DEPTH_ZERO_|SELF_SIGNED_|UNABLE_TO_|HOSTNAME_MISMATCH|ERR_OSSL)/;

class AttemptTimeoutError extends Error {
  readonly code = "ATTEMPT_TIMEOUT";
}

/** What a transport error means for the schedule. */
export function classifyError(
  error: unknown,
): Pick<AttemptResult, "outcome" | "failure"> {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  if (error instanceof BlockedAddressError) {
    return { outcome: "permanent", failure: "blocked_address" };
  }
  if (error instanceof AttemptTimeoutError || code === "ETIMEDOUT") {
    return { outcome: "retryable", failure: "timeout" };
  }
  if (TLS_CODES.test(code)) {
    return { outcome: "retryable", failure: "tls_failed" };
  }
  return { outcome: "retryable", failure: "connection_failed" };
}

/** Anything that could break a line, a log or a terminal. */
function isControl(character: string): boolean {
  const code = character.codePointAt(0) ?? 0;
  return (
    code <= 0x1f ||
    (code >= 0x7f && code <= 0x9f) ||
    code === 0x2028 ||
    code === 0x2029
  );
}

function excerptOf(chunk: Buffer): string | null {
  const text = Array.from(chunk.toString("utf8"), (character) =>
    isControl(character) ? " " : character,
  )
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, EXCERPT_LIMIT_CHARS);
  return text === "" ? null : text;
}

function refused(failure: DeliveryFailure, startedAt: number): AttemptResult {
  return {
    outcome: "permanent",
    statusCode: null,
    failure,
    excerpt: null,
    durationMs: Date.now() - startedAt,
  };
}

/** Makes one attempt. Never throws: a failure is a result. */
export function attempt({
  url,
  body,
  headers,
  policy,
  timeoutMs = REQUEST_TIMEOUT_MS,
}: AttemptRequest): Promise<AttemptResult> {
  const startedAt = Date.now();
  const checked = checkTargetUrl(url, policy);
  if (!checked.ok) {
    return Promise.resolve(
      refused(
        checked.rejection.reason === "blocked_host"
          ? "blocked_address"
          : "invalid_target",
        startedAt,
      ),
    );
  }

  const target = checked.url;

  const send = target.protocol === "https:" ? httpsRequest : httpRequest;

  return new Promise<AttemptResult>((resolve) => {
    let settled = false;
    const settle = (result: Omit<AttemptResult, "durationMs">) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      resolve({ ...result, durationMs: Date.now() - startedAt });
    };

    const request: ClientRequest = send(
      target,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/json",
          "Content-Length": String(Buffer.byteLength(body)),
        },
        lookup: guardedLookup(policy),
        agent: false,
      },
      (response) => {
        const statusCode = response.statusCode ?? 0;
        const chunks: Buffer[] = [];
        let read = 0;
        const finish = () => {
          settle({
            ...classifyStatus(statusCode),
            statusCode,
            excerpt: excerptOf(Buffer.concat(chunks)),
          });
        };
        response.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          read += chunk.length;
          if (read >= READ_LIMIT_BYTES) {
            response.destroy();
            finish();
          }
        });
        response.on("end", finish);
        response.on("error", finish);
        response.on("close", finish);
      },
    );

    const deadline = setTimeout(() => {
      request.destroy(new AttemptTimeoutError());
    }, timeoutMs);

    request.on("error", (error) => {
      settle({
        ...classifyError(error),
        statusCode: null,
        excerpt: null,
      });
    });
    request.end(body);
  });
}
