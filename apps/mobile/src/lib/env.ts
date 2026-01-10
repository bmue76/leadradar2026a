export function getApiBaseUrl(): string {
  const raw = (process.env.EXPO_PUBLIC_API_BASE_URL || "").trim();
  if (!raw) return "http://localhost:3000";
  return raw.replace(/\/+$/, "");
}
