import * as SecureStore from "expo-secure-store";

const KEY = "leadradar.mobile.apiKey";

export async function getApiKey(): Promise<string | null> {
  try {
    const v = await SecureStore.getItemAsync(KEY);
    return v ? v.trim() : null;
  } catch {
    return null;
  }
}

export async function setApiKey(apiKey: string): Promise<void> {
  await SecureStore.setItemAsync(KEY, apiKey.trim());
}

export async function clearApiKey(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(KEY);
  } catch {
    // ignore
  }
}
