/** Server-only adapters. Call with a service key only from the public intake server. */
export function leadRpc(url: string, key: string) {
  return async (
    name: "consume_lead_rate" | "lead_receipt" | "submit_lead",
    args: Record<string, unknown>,
  ): Promise<unknown> => {
    const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
      method: "POST",
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
      headers: {
        apikey: key,
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(args),
    });
    if (!response.ok) throw new Error("Lead storage unavailable");
    return response.json();
  };
}
