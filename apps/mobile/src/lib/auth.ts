import * as SecureStore from "expo-secure-store";
import { getStoredAuth, clearStoredAuth } from "./mobileStorage";

const LEGACY_KEY = "leadradar.mobile.apiKey";

/**
 * Compatibility layer:
 * - Some parts used legacy SecureStore key "leadradar.mobile.apiKey"
 * - TP9.x stores auth also under mobileStorage (lr_apiKey)
 *
 * We read legacy first, then fall back to storedAuth.
 */
export async function getApiKey(): Promise<string | null> {
  const legacy = await SecureStore.getItemAsync(LEGACY_KEY);
  if (legacy && legacy.trim()) return legacy.trim();

  const stored = await getStoredAuth();
  if (stored.apiKey && stored.apiKey.trim()) return stored.apiKey.trim();

  return null;
}

export async function setApiKey(apiKey: string): Promise<void> {
  const k = (apiKey || "").trim();
  if (!k) return;
  await SecureStore.setItemAsync(LEGACY_KEY, k);
}

/**
 * Clears apiKey everywhere we know about (legacy + stored auth bundle).
 * This is used for "Neu aktivieren".
 */
export async function clearApiKey(): Promise<void> {
  await SecureStore.deleteItemAsync(LEGACY_KEY);
  await clearStoredAuth();
}
