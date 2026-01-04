// src/lib/emailDomain.ts

const BLOCKED_EXACT = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "yahoo.com",
  "yahoo.de",
  "yahoo.fr",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.ch",
  "gmx.net",
  "gmx.de",
  "mail.com",
  "zoho.com", // optional (kann Business sein, aber oft privat)
]);

const BLOCKED_PREFIX = [
  /^gmx\./i,
  /^yahoo\./i,
];

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function extractEmailDomain(email: string): string | null {
  const e = normalizeEmail(email);
  const at = e.lastIndexOf("@");
  if (at < 0) return null;
  const domain = e.slice(at + 1).trim();
  return domain || null;
}

export function isBusinessEmail(email: string): boolean {
  const domain = extractEmailDomain(email);
  if (!domain) return false;

  if (BLOCKED_EXACT.has(domain)) return false;
  for (const rx of BLOCKED_PREFIX) {
    if (rx.test(domain)) return false;
  }
  return true;
}
