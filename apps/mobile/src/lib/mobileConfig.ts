export const API_BASE_URL_RAW = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
export const API_BASE_URL = API_BASE_URL_RAW.replace(/\/+$/, "");

export const ACCENT_HEX = (process.env.EXPO_PUBLIC_ACCENT_HEX || "#007AFF").trim();
export const ADMIN_URL = (process.env.EXPO_PUBLIC_ADMIN_URL || (API_BASE_URL ? `${API_BASE_URL}/admin` : "")).trim();

export function requireBaseUrl() {
  if (!API_BASE_URL) {
    throw new Error("EXPO_PUBLIC_API_BASE_URL fehlt. Bitte in apps/mobile/.env setzen.");
  }
}
