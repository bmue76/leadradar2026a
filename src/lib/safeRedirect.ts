export type SafeRedirectOptions = {
  /**
   * Default-Ziel, wenn `next` fehlt/ungültig ist.
   */
  fallback?: string;
  /**
   * Erlaubte Pfad-Präfixe (z.B. ["/admin"]).
   * Wenn gesetzt, muss der Pfad mit einem dieser Präfixe beginnen.
   */
  allowPrefixes?: string[];
  /**
   * Erlaubte exakte Pfade (z.B. ["/admin"]).
   * Optional zusätzlich zu allowPrefixes.
   */
  allowExact?: string[];
};

function normalizeMaybeEncoded(input: string): string {
  const trimmed = input.trim();

  // defensiv: decodeURIComponent kann werfen
  try {
    // nur decoden, wenn es nach Encoding aussieht – sonst unverändert lassen
    if (/%[0-9A-Fa-f]{2}/.test(trimmed)) return decodeURIComponent(trimmed);
    return trimmed;
  } catch {
    return trimmed;
  }
}

function isSafeInternalPath(path: string): boolean {
  // Muss ein relativer Path sein und NICHT protocol-relative / absolute
  if (!path.startsWith("/")) return false;
  if (path.startsWith("//")) return false;

  // keine Backslashes (können in manchen Kontexten zu seltsamen Resolves führen)
  if (path.includes("\\")) return false;

  // keine Control-Chars
  for (let i = 0; i < path.length; i++) {
    const code = path.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return false;
  }

  return true;
}

function matchesAllowList(path: string, opts?: SafeRedirectOptions): boolean {
  const allowExact = opts?.allowExact ?? [];
  const allowPrefixes = opts?.allowPrefixes ?? [];

  if (allowExact.length === 0 && allowPrefixes.length === 0) return true;

  if (allowExact.includes(path)) return true;
  return allowPrefixes.some((p) => path === p || path.startsWith(p.endsWith("/") ? p : `${p}/`));
}

/**
 * Sanitized `next` Path:
 * - nur interne Pfade ("/..."), kein "http(s)://", kein "//..."
 * - optional allowlist via allowPrefixes/allowExact
 */
export function safeNextPath(input: string | null | undefined, opts?: SafeRedirectOptions): string {
  const fallback = opts?.fallback ?? "/admin";

  if (!input) return fallback;

  const normalized = normalizeMaybeEncoded(input);

  if (!isSafeInternalPath(normalized)) return fallback;
  if (!matchesAllowList(normalized, opts)) return fallback;

  return normalized;
}
