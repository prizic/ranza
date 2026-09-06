import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  decryptWifiPayload,
  encryptWifiPayload,
  parseWifiDetails,
  wifiEncryptionKey,
  type WifiDetails,
} from "./wifi-crypto";

interface StoredWifiPayload {
  branch_id: string;
  branch_name: string;
  encrypted_payload: string;
  key_version: number;
  mode: "protected";
  revision: number;
  updated_at: string;
}

export interface ProtectedWifiDetails extends WifiDetails {
  branchId: string;
  branchName: string;
  revision: number;
  updatedAt: string;
}

export async function storeProtectedWifi(
  client: SupabaseClient,
  branchId: string,
  input: unknown,
) {
  const details = parseWifiDetails(input);
  const encrypted = encryptWifiPayload(details, branchId, wifiEncryptionKey());
  const { data, error } = await client.rpc("store_protected_wifi", {
    protected_key_version: 1,
    protected_payload: encrypted,
    requested_mode: "protected",
    target_branch_id: branchId,
  });
  if (error) throw new Error("Protected Wi-Fi is unavailable");
  return data;
}

export async function readProtectedWifi(
  client: SupabaseClient,
  branchId: string,
): Promise<ProtectedWifiDetails | null> {
  const { data, error } = await client.rpc("read_protected_wifi", {
    target_branch_id: branchId,
  });
  if (error || !data) return null;
  const stored = data as unknown as StoredWifiPayload;
  if (
    stored.branch_id !== branchId ||
    stored.key_version !== 1 ||
    stored.mode !== "protected"
  ) {
    throw new Error("Protected Wi-Fi is unavailable");
  }
  return {
    ...decryptWifiPayload(
      stored.encrypted_payload,
      branchId,
      wifiEncryptionKey(),
    ),
    branchId,
    branchName: stored.branch_name,
    revision: stored.revision,
    updatedAt: stored.updated_at,
  };
}
