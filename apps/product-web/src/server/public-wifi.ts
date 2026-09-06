import "server-only";
import { createClient } from "@supabase/supabase-js";
import { decryptWifiPayload, wifiEncryptionKey } from "./wifi-crypto";
import { hashWifiToken, wifiNetworkHash } from "./public-wifi-token";

export async function resolvePublicWifi(token: string, network: string) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !serviceKey) return null;
    const key = wifiEncryptionKey();
    const admin = createClient(url, serviceKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    // Malformed tokens use a dummy digest and still consume the network budget.
    const { data, error } = await admin.rpc("resolve_public_wifi", {
      token_hash: hashWifiToken(token) ?? "0".repeat(64),
      network_hash: wifiNetworkHash(network, key),
    });
    if (error || !data || data.key_version !== 1 || !hashWifiToken(token))
      return null;
    const details = decryptWifiPayload(
      data.encrypted_payload,
      data.branch_id,
      key,
    );
    return {
      networkName: details.networkName,
      password: details.password,
      instructions: details.instructions,
    };
  } catch {
    return null;
  }
}
