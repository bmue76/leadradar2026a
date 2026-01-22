import type { ContactSuggestions, ParseBusinessCardInput, ParseBusinessCardResult } from "./types";

function cleanLine(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

function uniq(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}

function firstMatch(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m && m[0] ? m[0] : null;
}

function stripLabel(s: string): string {
  return s
    .replace(/^(tel|phone|fon|direkt|direct|mobile|handy|mobil|mail|e-mail|email|web|website|www)\s*[:\-]\s*/i, "")
    .trim();
}

function looksLikeCompany(line: string): boolean {
  return /\b(ag|gmbh|sa|sàrl|sarl|ltd|inc|llc|bv|nv|kg|ug|oy|ab|sas|srl|spa)\b/i.test(line);
}

function looksLikeName(line: string): boolean {
  if (/\d/.test(line)) return false;
  if (/@/.test(line)) return false;
  if (/www\.|https?:\/\//i.test(line)) return false;
  if (looksLikeCompany(line)) return false;

  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2 || parts.length > 4) return false;

  // must contain at least 2 "capitalized" tokens
  const caps = parts.filter((p) => /^[A-ZÄÖÜ]/.test(p));
  return caps.length >= 2;
}

function splitName(line: string): { first?: string; last?: string } {
  const parts = line.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return {};
  const first = parts[0];
  const last = parts.slice(1).join(" ");
  return { first, last };
}

function pickTitle(lines: string[], nameIdx: number): string | null {
  const after = lines.slice(nameIdx + 1, nameIdx + 4).map(cleanLine).filter(Boolean);
  for (const l of after) {
    if (/@/.test(l) || /\d/.test(l) || looksLikeCompany(l) || /www\.|https?:\/\//i.test(l)) continue;
    // typical title keywords OR just a short line
    if (/\b(ceo|cto|cfo|head|leiter|manager|director|sales|verkauf|marketing|projekt|engineer|berater|consultant)\b/i.test(l)) {
      return l;
    }
    if (l.length <= 40) return l;
  }
  return null;
}

function normalizeUrl(s: string): string {
  let t = s.trim();
  t = t.replace(/[),.;]+$/g, "");
  if (/^www\./i.test(t)) t = `https://${t}`;
  return t;
}

function normalizePhone(raw: string): string {
  // keep + and digits, but allow spaces
  let t = raw.trim();
  t = stripLabel(t);
  // remove weird trailing punctuation
  t = t.replace(/[),.;]+$/g, "");
  // collapse spaces
  t = t.replace(/\s+/g, " ");
  return t;
}

function parseAddress(lines: string[]): Partial<ContactSuggestions> {
  let street: string | null = null;
  let zip: string | null = null;
  let city: string | null = null;
  let country: string | null = null;

  for (const raw of lines) {
    const l = cleanLine(raw);
    if (!l) continue;

    // Country (simple)
    if (!country && /\b(switzerland|schweiz|suisse|svizzera|ch)\b/i.test(l)) {
      country = l;
      continue;
    }

    // Zip + city (Swiss/DE-like)
    const mZip = l.match(/\b(\d{4,5})\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-\s]+)\b/);
    if (!zip && mZip) {
      zip = mZip[1];
      city = cleanLine(mZip[2]);
      continue;
    }

    // Street + number
    if (!street) {
      const mStreet = l.match(/\b([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-\.\s]+)\s+(\d+[A-Za-z]?)\b/);
      if (mStreet && !/@/.test(l) && !/www\.|https?:\/\//i.test(l) && !looksLikeCompany(l)) {
        street = cleanLine(`${mStreet[1]} ${mStreet[2]}`);
        continue;
      }
    }
  }

  const out: Partial<ContactSuggestions> = {};
  if (street) out.contactStreet = street;
  if (zip) out.contactZip = zip;
  if (city) out.contactCity = city;
  if (country) out.contactCountry = country;
  return out;
}

export function parseBusinessCard(input: ParseBusinessCardInput): ParseBusinessCardResult {
  const rawText = (input.rawText || "").trim();
  const lines = uniq(
    rawText
      .split(/\r?\n/g)
      .map(cleanLine)
      .filter((x) => x.length > 0)
  );

  const joined = lines.join("\n");

  const suggestions: ContactSuggestions = {};

  // Email
  const email = firstMatch(joined, /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (email) suggestions.contactEmail = email;

  // Website
  const url = firstMatch(joined, /(https?:\/\/[^\s]+|www\.[^\s]+)/i);
  if (url) suggestions.contactWebsite = normalizeUrl(url);

  // Phones (per line to detect labels)
  const phoneCandidates: Array<{ kind: "mobile" | "phone"; value: string }> = [];
  for (const l0 of lines) {
    const l = cleanLine(l0);
    // looks like phone
    const m = l.match(/(\+?\d[\d\s().-]{5,}\d)/);
    if (!m) continue;

    const v = normalizePhone(m[1]);
    const lower = l.toLowerCase();

    if (/\b(mobile|handy|mobil|cell)\b/.test(lower)) phoneCandidates.push({ kind: "mobile", value: v });
    else if (/\b(tel|phone|fon|direkt|direct)\b/.test(lower)) phoneCandidates.push({ kind: "phone", value: v });
    else phoneCandidates.push({ kind: "phone", value: v });
  }

  const mobile = phoneCandidates.find((x) => x.kind === "mobile")?.value;
  const phone = phoneCandidates.find((x) => x.kind === "phone")?.value;

  if (mobile) suggestions.contactMobile = mobile;
  if (phone) suggestions.contactPhone = phone;

  // Company
  const companyLine = lines.find((l) => looksLikeCompany(l)) || null;
  if (companyLine) suggestions.contactCompany = companyLine;

  // Name (prefer top lines)
  let nameIdx = -1;
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    if (looksLikeName(lines[i])) {
      nameIdx = i;
      break;
    }
  }
  if (nameIdx >= 0) {
    const { first, last } = splitName(lines[nameIdx]);
    if (first) suggestions.contactFirstName = first;
    if (last) suggestions.contactLastName = last;

    const title = pickTitle(lines, nameIdx);
    if (title) suggestions.contactTitle = title;
  }

  // If company missing, try pick a strong uppercase-ish line (fallback)
  if (!suggestions.contactCompany) {
    const fallback = lines.find((l) => l.length >= 3 && !/@/.test(l) && !/\d/.test(l) && /[A-ZÄÖÜ]{2,}/.test(l));
    if (fallback && !looksLikeName(fallback)) suggestions.contactCompany = fallback;
  }

  // Address
  Object.assign(suggestions, parseAddress(lines));

  // Final cleanup
  for (const k of Object.keys(suggestions) as (keyof ContactSuggestions)[]) {
    const v = suggestions[k];
    if (typeof v === "string") {
      const t = cleanLine(stripLabel(v));
      if (!t) delete suggestions[k];
      else suggestions[k] = t;
    }
  }

  return {
    suggestions,
    debug: {
      lines,
      picked: {
        email: suggestions.contactEmail || "",
        website: suggestions.contactWebsite || "",
      },
    },
  };
}
