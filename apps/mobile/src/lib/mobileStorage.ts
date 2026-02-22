import * as SecureStore from "expo-secure-store";

const K_TENANT = "lr_tenantSlug";
const K_APIKEY = "lr_apiKey";
const K_DEVICE = "lr_deviceId";

export type StoredAuth = {
  tenantSlug: string | null;
  apiKey: string | null;
  deviceId: string | null;
};

export async function getStoredAuth(): Promise<StoredAuth> {
  const [tenantSlug, apiKey, deviceId] = await Promise.all([
    SecureStore.getItemAsync(K_TENANT),
    SecureStore.getItemAsync(K_APIKEY),
    SecureStore.getItemAsync(K_DEVICE),
  ]);

  return {
    tenantSlug: tenantSlug || null,
    apiKey: apiKey || null,
    deviceId: deviceId || null,
  };
}

export async function setStoredAuth(next: { tenantSlug: string; apiKey: string; deviceId: string }) {
  await Promise.all([
    SecureStore.setItemAsync(K_TENANT, next.tenantSlug),
    SecureStore.setItemAsync(K_APIKEY, next.apiKey),
    SecureStore.setItemAsync(K_DEVICE, next.deviceId),
  ]);
}

export async function clearStoredAuth() {
  await Promise.all([
    SecureStore.deleteItemAsync(K_TENANT),
    SecureStore.deleteItemAsync(K_APIKEY),
    SecureStore.deleteItemAsync(K_DEVICE),
  ]);
}
