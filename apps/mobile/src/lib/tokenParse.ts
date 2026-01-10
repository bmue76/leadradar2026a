export function parseProvisionToken(input: string): string | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  // raw token
  if (raw.startsWith("prov_") && raw.length >= 10) return raw;

  // URL form (QR or copy/paste)
  try {
    const url = new URL(raw);
    const t = (url.searchParams.get("token") || "").trim();
    if (t.startsWith("prov_") && t.length >= 10) return t;
  } catch {
    // not a URL
  }

  return null;
}
