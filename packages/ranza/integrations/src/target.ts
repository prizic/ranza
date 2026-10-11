import {
  lookup as resolveName,
  type LookupAddress,
  type LookupOptions,
} from "node:dns";
import { BlockList, isIP } from "node:net";
import type { EndpointInputRejection } from "./errors";

/**
 * Where a webhook may be sent, and nowhere else (ADR 0045).
 *
 * The URL is typed by a Staff Member and the request is made by the worker,
 * from inside the network the worker lives in. Without a guard, an endpoint
 * whose name resolves to the cloud metadata service, the database or another
 * container makes the worker a way to read them. So the check is made twice:
 * on the text, when the URL is registered, for a fast and specific answer, and
 * on the address, when the connection is made, which is the one that holds
 * because a name resolves to different things at different times.
 */

const MAX_URL_LENGTH = 2048;

/**
 * Not routable on the public internet, or not a unicast destination. IPv4
 * addresses and the IPv4-mapped IPv6 forms of them are matched by the same
 * rules (Node answers a mapped address from its IPv4 subnets).
 */
const NOT_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["100::", 64],
  ["2001::", 32],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["fec0::", 10],
  ["ff00::", 8],
] as const) {
  NOT_PUBLIC.addSubnet(network, prefix, "ipv6");
}

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");

/** Names that are this machine or this network by definition, whatever they resolve to. */
const LOCAL_SUFFIXES = [
  ".localhost",
  ".local",
  ".internal",
  ".localdomain",
  ".home.arpa",
];

export interface TargetPolicy {
  /**
   * Lets `http` to a loopback address through, so a test can run a receiver on
   * this machine. Never set by a production composition root.
   */
  readonly allowLoopbackHttp: boolean;
}

export const STRICT_POLICY: TargetPolicy = { allowLoopbackHttp: false };

function bare(hostname: string): string {
  return hostname
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .toLowerCase();
}

function isLocalName(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    LOCAL_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

/** Whether an address must not be connected to. */
export function isBlockedAddress(
  address: string,
  policy: TargetPolicy = STRICT_POLICY,
): boolean {
  const family = isIP(address);
  if (family === 0) return true;
  const kind = family === 4 ? "ipv4" : "ipv6";
  if (policy.allowLoopbackHttp && LOOPBACK.check(address, kind)) return false;
  return NOT_PUBLIC.check(address, kind);
}

export type TargetCheck =
  | { ok: true; url: URL }
  | { ok: false; rejection: Extract<EndpointInputRejection, { field: "url" }> };

function refuse(
  reason: Extract<EndpointInputRejection, { field: "url" }>["reason"],
): TargetCheck {
  return { ok: false, rejection: { field: "url", reason } };
}

/**
 * Whether the text is a URL a webhook may be sent to: https, no user
 * information, and a host that is not a local name or a non-public address
 * literal. It says nothing of what the name will resolve to; that is
 * `guardedLookup`.
 */
export function checkTargetUrl(
  text: string,
  policy: TargetPolicy = STRICT_POLICY,
): TargetCheck {
  if (text.length > MAX_URL_LENGTH) return refuse("too_long");

  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return refuse("invalid");
  }

  const hostname = bare(url.hostname);
  if (hostname === "") return refuse("invalid");

  const loopbackAllowed =
    policy.allowLoopbackHttp &&
    url.protocol === "http:" &&
    (hostname === "localhost" || !isBlockedAddress(hostname, policy));
  if (url.protocol !== "https:" && !loopbackAllowed) return refuse("not_https");
  if (url.username !== "" || url.password !== "")
    return refuse("has_credentials");

  if (!loopbackAllowed) {
    if (isLocalName(hostname)) return refuse("blocked_host");
    if (isIP(hostname) !== 0 && isBlockedAddress(hostname, policy))
      return refuse("blocked_host");
  }
  return { ok: true, url };
}

/** The connection was refused because of where it would have gone. */
export class BlockedAddressError extends Error {
  readonly code = "BLOCKED_ADDRESS";
  constructor(hostname: string) {
    super(`${hostname} resolves to an address a webhook may not be sent to`);
    this.name = "BlockedAddressError";
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/**
 * The `lookup` the HTTP client connects through. The address it returns is the
 * address connected to, so what is checked is what is used: resolving the name
 * first and connecting by name afterwards would let it answer twice. Every
 * address in the answer must be public, because a name that resolves to one
 * public and one private address is a name somebody is trying to be clever
 * with.
 *
 * An address literal in the URL never reaches a lookup, so the client checks
 * those before it connects (`checkTargetUrl` and `transport.ts`).
 */
export function guardedLookup(policy: TargetPolicy) {
  return (
    hostname: string,
    options: LookupOptions,
    callback: LookupCallback,
  ): void => {
    resolveName(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (error) {
        callback(error, "");
        return;
      }
      const [first] = addresses;
      if (
        first === undefined ||
        addresses.some(({ address }) => isBlockedAddress(address, policy))
      ) {
        callback(new BlockedAddressError(hostname), "");
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}
