/**
 * Where a webhook may be sent and how an attempt is judged (ADR 0045).
 *
 * The integration suite proves the path with a receiver; this proves the
 * decisions that path rests on, one at a time and without a database. The
 * address rules are the part that must not be wrong, so every range the guard
 * names is asserted at both edges, and an address that merely looks close is
 * asserted to pass.
 */
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BlockedAddressError,
  checkTargetUrl,
  guardedLookup,
  isBlockedAddress,
  STRICT_POLICY,
  type NameResolver,
} from "../../packages/ranza/integrations/src/target";
import {
  attempt,
  classifyError,
  classifyStatus,
} from "../../packages/ranza/integrations/src/transport";
import {
  generateSecret,
  signDelivery,
  verifyDelivery,
} from "../../packages/ranza/integrations/src/signing";

const LOOPBACK_POLICY = { allowLoopbackHttp: true };

describe("an address a webhook may not be sent to", () => {
  it.each([
    "0.0.0.1",
    "10.0.0.1",
    "10.255.255.255",
    "100.64.0.1",
    "100.127.255.254",
    "127.0.0.1",
    "127.255.255.255",
    "169.254.169.254",
    "172.16.0.1",
    "172.31.255.255",
    "192.0.0.1",
    "192.0.2.10",
    "192.168.1.1",
    "198.18.0.1",
    "198.19.255.255",
    "198.51.100.7",
    "203.0.113.9",
    "224.0.0.1",
    "240.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::2",
    "::7f00:1",
    "::a00:1",
    "::808:808",
    "::ffff:127.0.0.1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a00:1",
    "fc00::1",
    "fd12:3456::1",
    "fe80::1",
    "fec0::1",
    "ff02::1",
    "2001:db8::1",
    "2002:c0a8:101::1",
  ])("INT-S1-54: %s is refused", (address) => {
    expect(isBlockedAddress(address)).toBe(true);
  });

  it.each([
    "8.8.8.8",
    "1.1.1.1",
    "9.255.255.255",
    "11.0.0.1",
    "100.63.255.255",
    "100.128.0.1",
    "126.255.255.255",
    "128.0.0.1",
    "169.253.255.255",
    "169.255.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "192.169.0.1",
    "198.17.255.255",
    "198.20.0.1",
    "223.255.255.255",
    "2606:4700:4700::1111",
    "2a00:1450:4001:81a::200e",
    "::ffff:8.8.8.8",
  ])("INT-S1-54: %s is a public address and is allowed", (address) => {
    expect(isBlockedAddress(address)).toBe(false);
  });

  it("INT-S1-54: text that is not an address is refused rather than guessed at", () => {
    expect(isBlockedAddress("example.com")).toBe(true);
    expect(isBlockedAddress("")).toBe(true);
    expect(isBlockedAddress("999.1.1.1")).toBe(true);
  });

  it("INT-S1-54: the test allowance opens loopback and nothing else", () => {
    expect(isBlockedAddress("127.0.0.1", LOOPBACK_POLICY)).toBe(false);
    expect(isBlockedAddress("::1", LOOPBACK_POLICY)).toBe(false);
    expect(isBlockedAddress("10.0.0.1", LOOPBACK_POLICY)).toBe(true);
    expect(isBlockedAddress("169.254.169.254", LOOPBACK_POLICY)).toBe(true);
    expect(isBlockedAddress("192.168.0.1", LOOPBACK_POLICY)).toBe(true);
  });
});

describe("a URL a webhook may be registered with", () => {
  it("INT-S1-18: accepts https to a public name or address, with a port, path and query", () => {
    for (const url of [
      "https://hooks.example.com/ranza",
      "https://hooks.example.com:8443/a/b?c=d",
      "https://8.8.8.8/x",
      "https://[2606:4700:4700::1111]/x",
    ]) {
      expect(checkTargetUrl(url).ok).toBe(true);
    }
  });

  it.each([
    ["http://hooks.example.com/x", "not_https"],
    ["ftp://hooks.example.com/x", "not_https"],
    ["javascript:alert(1)", "invalid"],
    ["https://user@hooks.example.com/x", "has_credentials"],
    ["https://user:pw@hooks.example.com/x", "has_credentials"],
    ["https://localhost/x", "blocked_host"],
    ["https://LOCALHOST./x", "blocked_host"],
    ["https://app.localhost/x", "blocked_host"],
    ["https://printer.local/x", "blocked_host"],
    ["https://db.internal/x", "blocked_host"],
    ["https://127.0.0.1/x", "blocked_host"],
    ["https://127.1/x", "blocked_host"],
    ["https://2130706433/x", "blocked_host"],
    ["https://0x7f000001/x", "blocked_host"],
    ["https://169.254.169.254/latest/meta-data", "blocked_host"],
    ["https://[::1]/x", "blocked_host"],
    ["https://[::ffff:7f00:1]/x", "blocked_host"],
    ["https://", "invalid"],
    ["not a url", "invalid"],
    ["", "invalid"],
  ])("INT-S1-18: %s is refused as %s", (url, reason) => {
    expect(checkTargetUrl(url)).toEqual({
      ok: false,
      rejection: { field: "url", reason },
    });
  });

  it("INT-S1-18: an address over 2048 characters is refused", () => {
    expect(checkTargetUrl(`https://example.com/${"a".repeat(2100)}`)).toEqual({
      ok: false,
      rejection: { field: "url", reason: "too_long" },
    });
  });

  it("INT-S1-54: plain http to this machine passes only under the test allowance", () => {
    expect(checkTargetUrl("http://127.0.0.1:8080/x", STRICT_POLICY).ok).toBe(
      false,
    );
    expect(checkTargetUrl("http://127.0.0.1:8080/x", LOOPBACK_POLICY).ok).toBe(
      true,
    );
    expect(checkTargetUrl("http://localhost:8080/x", LOOPBACK_POLICY).ok).toBe(
      true,
    );
    expect(checkTargetUrl("http://10.0.0.1/x", LOOPBACK_POLICY).ok).toBe(false);
    expect(
      checkTargetUrl("http://hooks.example.com/x", LOOPBACK_POLICY).ok,
    ).toBe(false);
  });
});

describe("the lookup a connection is made through", () => {
  it("INT-S1-54: a name that resolves to loopback is refused, and the refusal is a BlockedAddressError", async () => {
    const error = await new Promise<unknown>((resolve) => {
      guardedLookup(STRICT_POLICY)("localhost", { all: true }, (caught) =>
        resolve(caught),
      );
    });
    expect(error).toBeInstanceOf(BlockedAddressError);
  });

  it("INT-S1-54: under the test allowance the same name resolves", async () => {
    const result = await new Promise<{ error: unknown; address: unknown }>(
      (resolve) => {
        guardedLookup(LOOPBACK_POLICY)(
          "localhost",
          { all: true },
          (error, address) => resolve({ error, address }),
        );
      },
    );
    expect(result.error).toBeNull();
    expect(Array.isArray(result.address)).toBe(true);
  });
});

/** A resolver that answers a fixed list, whatever the name. */
function answering(...addresses: string[]): NameResolver {
  return (_hostname, callback) =>
    callback(
      null,
      addresses.map((address) => ({
        address,
        family: address.includes(":") ? 6 : 4,
      })),
    );
}

function lookupWith(resolveName: NameResolver, all = true) {
  return new Promise<{ error: unknown; address: unknown }>((resolve) => {
    guardedLookup(STRICT_POLICY, resolveName)(
      "hooks.example.test",
      { all },
      (error, address) => resolve({ error, address }),
    );
  });
}

describe("the connect-time guard", () => {
  // The registration check reads the text of a URL; a name that looks public
  // can resolve to anything, and these are the answers that must never be
  // connected to, one by one.
  it.each([
    "127.0.0.1",
    "127.1.2.3",
    "10.0.0.5",
    "172.16.0.9",
    "172.31.255.254",
    "192.168.1.1",
    "169.254.169.254",
    "100.64.0.1",
    "0.0.0.0",
    "192.0.0.8",
    "198.18.0.1",
    "224.0.0.251",
    "255.255.255.255",
    "::",
    "::1",
    "::7f00:1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "::ffff:10.0.0.1",
    "::ffff:169.254.169.254",
    "64:ff9b::a9fe:a9fe",
    "2002:a9fe:a9fe::1",
  ])(
    "INT-S1-54: a name that resolves to %s is refused when the connection is made",
    async (address) => {
      for (const all of [true, false]) {
        const { error } = await lookupWith(answering(address), all);
        expect(error).toBeInstanceOf(BlockedAddressError);
      }
    },
  );

  it("INT-S1-54: one private address among public ones refuses the whole answer", async () => {
    const { error } = await lookupWith(answering("93.184.216.34", "10.0.0.5"));
    expect(error).toBeInstanceOf(BlockedAddressError);
    const reversed = await lookupWith(answering("10.0.0.5", "93.184.216.34"));
    expect(reversed.error).toBeInstanceOf(BlockedAddressError);
  });

  it("INT-S1-54: an answer with no address at all is refused, not connected to", async () => {
    const { error } = await lookupWith(answering());
    expect(error).toBeInstanceOf(BlockedAddressError);
  });

  it("INT-S1-54: a name that resolves only to public addresses is let through, with the addresses it was given", async () => {
    const wide = await lookupWith(
      answering("93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"),
    );
    expect(wide.error).toBeNull();
    expect(wide.address).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
    const single = await lookupWith(answering("93.184.216.34"), false);
    expect(single.error).toBeNull();
    expect(single.address).toBe("93.184.216.34");
  });

  it("INT-S1-54: a resolver that fails is that failure, not a refusal and not an address", async () => {
    const failure = Object.assign(new Error("not found"), {
      code: "ENOTFOUND",
    });
    const { error } = await lookupWith((_hostname, callback) =>
      callback(failure, []),
    );
    expect(error).toBe(failure);
    expect(error).not.toBeInstanceOf(BlockedAddressError);
  });

  describe("through an attempt", () => {
    let server: Server;
    let port: number;
    let connections = 0;

    beforeAll(async () => {
      server = createServer((_request, response) => response.end("ok"));
      server.on("connection", () => {
        connections += 1;
      });
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", () => {
          port = (server.address() as AddressInfo).port;
          resolve();
        }),
      );
    });

    afterAll(async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    });

    it("INT-S1-54: a URL that passes the registration check is refused at connect time when its name resolves to a private address, and nothing is connected to", async () => {
      const url = `https://hooks.example.test:${port}/hook`;
      expect(checkTargetUrl(url).ok).toBe(true);

      const asked: string[] = [];
      const before = connections;
      for (const address of [
        "127.0.0.1",
        "10.0.0.5",
        "169.254.169.254",
        "::1",
      ]) {
        const result = await attempt({
          url,
          body: "{}",
          headers: {},
          policy: STRICT_POLICY,
          resolveName: (hostname, callback) => {
            asked.push(hostname);
            answering(address)(hostname, callback);
          },
        });
        expect(result).toMatchObject({
          outcome: "permanent",
          failure: "blocked_address",
          statusCode: null,
        });
      }
      expect(asked).toEqual(Array(4).fill("hooks.example.test"));
      expect(connections).toBe(before);
    });

    it("INT-S1-54: the guard is the resolver's answer and not the URL's text, so the same URL reaches a receiver once its name resolves to an address the test allowance permits", async () => {
      const before = connections;
      const result = await attempt({
        url: `http://localhost:${port}/hook`,
        body: "{}",
        headers: {},
        policy: LOOPBACK_POLICY,
        resolveName: answering("127.0.0.1"),
      });
      expect(result).toMatchObject({ outcome: "delivered", statusCode: 200 });
      expect(connections).toBe(before + 1);
    });

    it("INT-S1-69: an attempt never throws, even when the client library refuses before it opens a socket", async () => {
      const result = await attempt({
        url: `http://127.0.0.1:${port}/hook`,
        body: "{}",
        headers: { "X-Broken": "one\r\ntwo" },
        policy: LOOPBACK_POLICY,
      });
      expect(result).toMatchObject({
        outcome: "retryable",
        failure: "connection_failed",
        statusCode: null,
        excerpt: null,
      });
    });
  });
});

describe("judging an answer", () => {
  it.each([
    [200, "delivered", null],
    [201, "delivered", null],
    [204, "delivered", null],
    [301, "permanent", "redirect_refused"],
    [302, "permanent", "redirect_refused"],
    [307, "permanent", "redirect_refused"],
    [400, "permanent", "http_error"],
    [401, "permanent", "http_error"],
    [403, "permanent", "http_error"],
    [404, "permanent", "http_error"],
    [410, "permanent", "http_error"],
    [422, "permanent", "http_error"],
    [408, "retryable", "http_error"],
    [429, "retryable", "http_error"],
    [500, "retryable", "http_error"],
    [502, "retryable", "http_error"],
    [503, "retryable", "http_error"],
    [504, "retryable", "http_error"],
  ])("INT-S1-33: HTTP %i is %s", (status, outcome, failure) => {
    expect(classifyStatus(status)).toEqual({ outcome, failure });
  });

  it("INT-S1-33: a transport error is worth retrying, a refused address is not", () => {
    expect(
      classifyError(Object.assign(new Error(), { code: "ECONNREFUSED" })),
    ).toEqual({
      outcome: "retryable",
      failure: "connection_failed",
    });
    expect(
      classifyError(Object.assign(new Error(), { code: "ETIMEDOUT" })),
    ).toEqual({
      outcome: "retryable",
      failure: "timeout",
    });
    expect(
      classifyError(
        Object.assign(new Error(), { code: "DEPTH_ZERO_SELF_SIGNED_CERT" }),
      ),
    ).toEqual({ outcome: "retryable", failure: "tls_failed" });
    expect(classifyError(new BlockedAddressError("x.example"))).toEqual({
      outcome: "permanent",
      failure: "blocked_address",
    });
  });
});

describe("making an attempt", () => {
  let server: Server;
  let origin: string;
  let behaviour: (response: import("node:http").ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((_request, response) => behaviour(response));
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", () => {
        origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
        resolve();
      }),
    );
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const send = (timeoutMs?: number) =>
    attempt({
      url: `${origin}/hook`,
      body: "{}",
      headers: {},
      policy: LOOPBACK_POLICY,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    });

  it("INT-S1-56: a receiver that never answers is a timeout, retryable, after the deadline", async () => {
    behaviour = () => undefined;
    const startedAt = Date.now();
    const result = await send(250);
    expect(result).toMatchObject({
      outcome: "retryable",
      failure: "timeout",
      statusCode: null,
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(240);
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("INT-S1-56: what the receiver says is cut to one line of at most 200 characters, with control characters gone", async () => {
    behaviour = (response) => {
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end(`bad\r\nthing\u0000happened\t${"x".repeat(5000)}`);
    };
    const result = await send();
    expect(result.statusCode).toBe(500);
    expect(result.excerpt).not.toBeNull();
    expect(result.excerpt!.length).toBeLessThanOrEqual(200);
    expect(result.excerpt!.startsWith("bad thing happened xxx")).toBe(true);
    // eslint-disable-next-line no-control-regex
    expect(result.excerpt).not.toMatch(/[\u0000-\u001f]/);
  });

  it("INT-S1-56: an empty answer has no excerpt", async () => {
    behaviour = (response) => {
      response.writeHead(204);
      response.end();
    };
    expect(await send()).toMatchObject({
      outcome: "delivered",
      statusCode: 204,
      excerpt: null,
    });
  });

  it("INT-S1-56: a connection that is refused is retryable and says so without throwing", async () => {
    const closed = createServer();
    await new Promise<void>((resolve) =>
      closed.listen(0, "127.0.0.1", resolve),
    );
    const port = (closed.address() as AddressInfo).port;
    await new Promise<void>((resolve) => closed.close(() => resolve()));
    const result = await attempt({
      url: `http://127.0.0.1:${port}/hook`,
      body: "{}",
      headers: {},
      policy: LOOPBACK_POLICY,
    });
    expect(result).toMatchObject({
      outcome: "retryable",
      failure: "connection_failed",
      statusCode: null,
    });
  });

  it("INT-S1-54: a refused target is never connected to", async () => {
    let connected = false;
    behaviour = (response) => {
      connected = true;
      response.end();
    };
    const result = await attempt({
      url: `${origin}/hook`,
      body: "{}",
      headers: {},
      policy: STRICT_POLICY,
    });
    expect(result).toMatchObject({
      outcome: "permanent",
      failure: "invalid_target",
    });
    expect(connected).toBe(false);
  });
});

describe("signing", () => {
  it("INT-S1-57: a signature covers the timestamp and the body, and no other secret verifies it", () => {
    const signature = signDelivery("secret", "1700000000", '{"a":1}');
    expect(signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifyDelivery("secret", "1700000000", '{"a":1}', signature)).toBe(
      true,
    );
    expect(verifyDelivery("secret", "1700000001", '{"a":1}', signature)).toBe(
      false,
    );
    expect(verifyDelivery("secret", "1700000000", '{"a":2}', signature)).toBe(
      false,
    );
    expect(verifyDelivery("other", "1700000000", '{"a":1}', signature)).toBe(
      false,
    );
    expect(verifyDelivery("secret", "1700000000", '{"a":1}', "sha256=zz")).toBe(
      false,
    );
    expect(verifyDelivery("secret", "1700000000", '{"a":1}', "")).toBe(false);
  });

  it("INT-S1-57: a signature matches a value computed independently of the module", () => {
    // HMAC-SHA256("secret", "1700000000.{}") computed with openssl.
    expect(signDelivery("secret", "1700000000", "{}")).toBe(
      "sha256=b8569b78799ff9e3cbff0fc2d63a33a2b57f3282abd07c37ae5e8e7d79a5f163",
    );
  });

  it("INT-S1-51: a generated secret is long, prefixed and different every time", () => {
    const first = generateSecret();
    const second = generateSecret();
    expect(first).toMatch(/^whsec_[A-Za-z0-9_-]{43}$/);
    expect(first).not.toBe(second);
  });
});
