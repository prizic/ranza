import assert from "node:assert/strict";

const applications = [
  ["storefront", process.env.RANZA_STAGING_STOREFRONT_URL],
  ["product-web", process.env.RANZA_STAGING_PRODUCT_URL],
  ["control-plane", process.env.RANZA_STAGING_CONTROL_URL],
];
for (const [name, rawOrigin] of applications) {
  assert.ok(rawOrigin, `${name} staging URL is required`);
  const origin = new URL(rawOrigin).origin;
  const started = performance.now();
  const health = await fetch(`${origin}/health`, { redirect: "error" });
  assert.equal(health.status, 200, `${name} health`);
  assert.match(health.headers.get("cache-control") ?? "", /no-store/);
  assert.deepEqual(await health.json(), { application: name, status: "ok" });
  for (const locale of ["tr", "en", "ar"]) {
    const response = await fetch(`${origin}/${locale}`, { redirect: "manual" });
    assert.ok(
      response.status >= 200 && response.status < 400,
      `${name}/${locale} must respond`,
    );
  }
  process.stdout.write(
    `PASS ${name} staging public smoke ${Math.round(performance.now() - started)}ms\n`,
  );
}
