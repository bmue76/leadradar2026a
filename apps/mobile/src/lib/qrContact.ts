import type { ContactSuggestions } from "../ocr/types";

export type QrContactFormat =
  | "VCARD"
  | "MECARD"
  | "BIZCARD"
  | "MAILTO"
  | "TEL"
  | "MATMSG"
  | "JSON"
  | "KV"
  | "URI"
  | "TEXT"
  | "UNKNOWN";

export type QrContactConfidence = "HIGH" | "MEDIUM" | "LOW" | "NONE";

export type ParsedQrContactData = {
  rawText: string;
  format: QrContactFormat;
  suggestions: ContactSuggestions;
  hasAnySuggestion: boolean;
  hasOnlyNameSuggestion: boolean;
  isWeakText: boolean;
  summary: string;
  confidence: QrContactConfidence;
  score: number;
};

const EMPTY_SUGGESTIONS: ContactSuggestions = {
  contactFirstName: "",
  contactLastName: "",
  contactCompany: "",
  contactTitle: "",
  contactEmail: "",
  contactPhone: "",
  contactMobile: "",
  contactWebsite: "",
  contactStreet: "",
  contactZip: "",
  contactCity: "",
  contactCountry: "",
};

function emptySuggestions(): ContactSuggestions {
  return { ...EMPTY_SUGGESTIONS };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function sstr(v: string | null | undefined): string {
  return (v ?? "").trim();
}

export function normalizeQrRawText(raw: string): string {
  return raw.replace(/\u0000/g, "").replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

export function prettyQrPreview(raw: string, maxLength = 4000): string {
  const normalized = normalizeQrRawText(raw);
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

export function normalizeWebsiteValue(raw: string): string {
  const v = raw.trim().replace(/[),.;]+$/g, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^www\./i.test(v)) return `https://${v}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return `https://${v}`;
  return v;
}

export function seemsWeakText(rawText: string): boolean {
  const txt = normalizeQrRawText(rawText);
  if (!txt) return true;

  const alnum = txt.replace(/[^a-zA-Z0-9]/g, "");
  const lines = txt
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  if (alnum.length < 28) return true;
  if (lines.length < 2) return true;
  return false;
}

export function hasAnySuggestion(s: ContactSuggestions): boolean {
  return Object.values(s).some((v) => typeof v === "string" && v.trim().length > 0);
}

export function hasOnlyNameSuggestion(s: ContactSuggestions): boolean {
  const first = sstr(s.contactFirstName);
  const last = sstr(s.contactLastName);

  const rest = [
    s.contactCompany,
    s.contactTitle,
    s.contactEmail,
    s.contactPhone,
    s.contactMobile,
    s.contactWebsite,
    s.contactStreet,
    s.contactZip,
    s.contactCity,
    s.contactCountry,
  ].some((v) => sstr(v).length > 0);

  return !rest && (first.length > 0 || last.length > 0);
}

export function summaryFromSuggestions(s: ContactSuggestions): string {
  const labels: string[] = [];
  if (sstr(s.contactFirstName) || sstr(s.contactLastName)) labels.push("Name");
  if (sstr(s.contactCompany)) labels.push("Firma");
  if (sstr(s.contactTitle)) labels.push("Funktion");
  if (sstr(s.contactEmail)) labels.push("E-Mail");
  if (sstr(s.contactPhone)) labels.push("Telefon");
  if (sstr(s.contactMobile)) labels.push("Mobile");
  if (sstr(s.contactWebsite)) labels.push("Website");
  if (sstr(s.contactStreet) || sstr(s.contactZip) || sstr(s.contactCity) || sstr(s.contactCountry)) {
    labels.push("Adresse");
  }
  return labels.join(", ");
}

function splitName(fullName: string): { first?: string; last?: string } {
  const t = fullName.trim();
  if (!t) return {};
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return { first: parts[0] };
  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.slice(-1).join(" "),
  };
}

function normalizeSuggestions(s: ContactSuggestions): ContactSuggestions {
  return {
    ...s,
    contactWebsite: s.contactWebsite ? normalizeWebsiteValue(s.contactWebsite) : s.contactWebsite,
  };
}

function decodeQuotedPrintable(input: string): string {
  const collapsed = input.replace(/=\r?\n/g, "");
  return collapsed.replace(/=([A-Fa-f0-9]{2})/g, (_, hex: string) =>
    String.fromCharCode(parseInt(hex, 16))
  );
}

function unfoldVCardLines(text: string): string[] {
  const normalized = normalizeQrRawText(text);
  const rawLines = normalized.split("\n");
  const out: string[] = [];

  for (const line of rawLines) {
    if (!line) continue;
    if (/^[ \t]/.test(line) && out.length > 0) {
      out[out.length - 1] = `${out[out.length - 1]}${line.slice(1)}`;
    } else {
      out.push(line);
    }
  }

  return out;
}

function normalizeVCardKey(rawKey: string): string {
  const withoutParams = rawKey.split(";")[0]?.trim() ?? "";
  const lastSegment = withoutParams.split(".").pop() ?? withoutParams;
  return lastSegment.trim().toUpperCase();
}

function unescapeVCardValue(rawValue: string, useQuotedPrintable: boolean): string {
  const decoded = useQuotedPrintable ? decodeQuotedPrintable(rawValue) : rawValue;
  return decoded
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

function parseVCard(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const lines = unfoldVCardLines(text);

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx < 0) continue;

    const rawKey = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1);
    const key = normalizeVCardKey(rawKey);
    const rawKeyUpper = rawKey.toUpperCase();
    const useQuotedPrintable = rawKeyUpper.includes("ENCODING=QUOTED-PRINTABLE");
    const value = unescapeVCardValue(rawValue, useQuotedPrintable);

    if (!value) continue;

    if (key === "N") {
      const parts = value.split(";");
      const last = parts[0]?.trim();
      const first = parts[1]?.trim();
      if (first && !out.contactFirstName) out.contactFirstName = first;
      if (last && !out.contactLastName) out.contactLastName = last;
      continue;
    }

    if (key === "FN" || key === "NAME") {
      if (!out.contactFirstName && !out.contactLastName) {
        const split = splitName(value);
        if (split.first) out.contactFirstName = split.first;
        if (split.last) out.contactLastName = split.last;
      }
      continue;
    }

    if (key === "ORG") {
      if (!out.contactCompany) out.contactCompany = value.split(";")[0]?.trim() ?? value;
      continue;
    }

    if (key === "TITLE" || key === "ROLE") {
      if (!out.contactTitle) out.contactTitle = value;
      continue;
    }

    if (key === "EMAIL") {
      if (!out.contactEmail) out.contactEmail = value;
      continue;
    }

    if (key === "URL") {
      if (!out.contactWebsite) out.contactWebsite = normalizeWebsiteValue(value);
      continue;
    }

    if (key === "TEL") {
      const telValue = value.trim();
      if (!telValue) continue;

      const isMobile =
        rawKeyUpper.includes("CELL") ||
        rawKeyUpper.includes("MOBILE") ||
        rawKeyUpper.includes("IPHONE");

      if (isMobile) {
        if (!out.contactMobile) out.contactMobile = telValue;
      } else if (!out.contactPhone) {
        out.contactPhone = telValue;
      } else if (!out.contactMobile) {
        out.contactMobile = telValue;
      }
      continue;
    }

    if (key === "ADR") {
      const parts = value.split(";");
      const street = [parts[2], parts[1]].map((x) => (x ?? "").trim()).filter(Boolean).join(" ");
      const city = parts[3]?.trim() ?? "";
      const zip = parts[5]?.trim() ?? "";
      const country = parts[6]?.trim() ?? "";

      if (street && !out.contactStreet) out.contactStreet = street;
      if (zip && !out.contactZip) out.contactZip = zip;
      if (city && !out.contactCity) out.contactCity = city;
      if (country && !out.contactCountry) out.contactCountry = country;
      continue;
    }
  }

  return normalizeSuggestions(out);
}

function parseMeCard(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const body = normalizeQrRawText(text).replace(/^MECARD:/i, "").replace(/;;$/, "");
  const parts = body.split(";");

  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;

    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;

    if (key === "N") {
      if (value.includes(",")) {
        const [last, first] = value.split(",");
        if (first?.trim()) out.contactFirstName = first.trim();
        if (last?.trim()) out.contactLastName = last.trim();
      } else {
        const split = splitName(value);
        if (split.first) out.contactFirstName = split.first;
        if (split.last) out.contactLastName = split.last;
      }
      continue;
    }

    if (key === "SOUND") continue;

    if (key === "ORG") {
      out.contactCompany = value;
      continue;
    }

    if (key === "TITLE") {
      out.contactTitle = value;
      continue;
    }

    if (key === "EMAIL") {
      out.contactEmail = value;
      continue;
    }

    if (key === "TEL") {
      if (!out.contactPhone) out.contactPhone = value;
      else if (!out.contactMobile) out.contactMobile = value;
      continue;
    }

    if (key === "URL") {
      out.contactWebsite = normalizeWebsiteValue(value);
      continue;
    }

    if (key === "ADR") {
      out.contactStreet = value;
      continue;
    }
  }

  return normalizeSuggestions(out);
}

function parseBizCard(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const body = normalizeQrRawText(text).replace(/^BIZCARD:/i, "");
  const parts = body.split(";");

  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;

    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;

    if (key === "N") {
      out.contactFirstName = value;
      continue;
    }

    if (key === "X") {
      out.contactLastName = value;
      continue;
    }

    if (key === "C") {
      out.contactCompany = value;
      continue;
    }

    if (key === "T") {
      out.contactTitle = value;
      continue;
    }

    if (key === "E") {
      out.contactEmail = value;
      continue;
    }

    if (key === "B") {
      out.contactPhone = value;
      continue;
    }

    if (key === "M") {
      out.contactMobile = value;
      continue;
    }

    if (key === "W" || key === "URL") {
      out.contactWebsite = normalizeWebsiteValue(value);
      continue;
    }

    if (key === "A") {
      if (!out.contactStreet) out.contactStreet = value;
      continue;
    }
  }

  return normalizeSuggestions(out);
}

function parseMailto(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const raw = normalizeQrRawText(text).replace(/^mailto:/i, "").trim();
  if (!raw) return out;

  const address = raw.split("?")[0]?.trim() ?? "";
  if (address) out.contactEmail = address;

  return normalizeSuggestions(out);
}

function parseTel(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const raw = normalizeQrRawText(text).replace(/^tel:/i, "").trim();
  if (!raw) return out;

  out.contactPhone = raw;
  return normalizeSuggestions(out);
}

function parseMatMsg(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const body = normalizeQrRawText(text).replace(/^MATMSG:/i, "");
  const parts = body.split(";");

  for (const part of parts) {
    const idx = part.indexOf(":");
    if (idx < 0) continue;
    const key = part.slice(0, idx).trim().toUpperCase();
    const value = part.slice(idx + 1).trim();
    if (!value) continue;

    if (key === "TO" && !out.contactEmail) out.contactEmail = value;
  }

  return normalizeSuggestions(out);
}

function parseJson(text: string): ContactSuggestions {
  const out = emptySuggestions();

  try {
    const data: unknown = JSON.parse(text);
    if (!isRecord(data)) return out;

    const name = pickString(data.name);
    const firstName = pickString(data.firstName) ?? pickString(data.firstname) ?? pickString(data.givenName);
    const lastName = pickString(data.lastName) ?? pickString(data.lastname) ?? pickString(data.surname);
    const company = pickString(data.company) ?? pickString(data.organization) ?? pickString(data.organisation);
    const title = pickString(data.title) ?? pickString(data.role) ?? pickString(data.position);
    const email = pickString(data.email);
    const phone = pickString(data.phone) ?? pickString(data.telephone);
    const mobile = pickString(data.mobile) ?? pickString(data.cell);
    const website = pickString(data.website) ?? pickString(data.url);
    const street = pickString(data.street) ?? pickString(data.address);
    const zip = pickString(data.zip) ?? pickString(data.postalCode) ?? pickString(data.plz);
    const city = pickString(data.city);
    const country = pickString(data.country);

    if (firstName) out.contactFirstName = firstName;
    if (lastName) out.contactLastName = lastName;
    if (!out.contactFirstName && !out.contactLastName && name) {
      const split = splitName(name);
      if (split.first) out.contactFirstName = split.first;
      if (split.last) out.contactLastName = split.last;
    }

    if (company) out.contactCompany = company;
    if (title) out.contactTitle = title;
    if (email) out.contactEmail = email;
    if (phone) out.contactPhone = phone;
    if (mobile) out.contactMobile = mobile;
    if (website) out.contactWebsite = normalizeWebsiteValue(website);
    if (street) out.contactStreet = street;
    if (zip) out.contactZip = zip;
    if (city) out.contactCity = city;
    if (country) out.contactCountry = country;
  } catch {
    return out;
  }

  return normalizeSuggestions(out);
}

function normalizeKvKey(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[._-]+/g, "")
    .replace(/\s+/g, "");
}

function parseKeyValueText(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const lines = normalizeQrRawText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return out;

  for (const line of lines) {
    const match = line.match(/^([A-Za-zÀ-ÿ0-9 _.-]{2,32})\s*[:=]\s*(.+)$/);
    if (!match) continue;

    const key = normalizeKvKey(match[1]);
    const value = match[2].trim();
    if (!value) continue;

    if (key === "name" || key === "fullname") {
      if (!out.contactFirstName && !out.contactLastName) {
        const split = splitName(value);
        if (split.first) out.contactFirstName = split.first;
        if (split.last) out.contactLastName = split.last;
      }
      continue;
    }

    if (key === "firstname" || key === "vorname" || key === "givenname") {
      out.contactFirstName = value;
      continue;
    }

    if (key === "lastname" || key === "nachname" || key === "surname") {
      out.contactLastName = value;
      continue;
    }

    if (key === "company" || key === "firma" || key === "organisation" || key === "organization") {
      out.contactCompany = value;
      continue;
    }

    if (key === "title" || key === "funktion" || key === "position" || key === "role") {
      out.contactTitle = value;
      continue;
    }

    if (key === "email" || key === "mail" || key === "e-mail") {
      out.contactEmail = value;
      continue;
    }

    if (key === "phone" || key === "telefon" || key === "tel") {
      if (!out.contactPhone) out.contactPhone = value;
      continue;
    }

    if (key === "mobile" || key === "mobil" || key === "cell" || key === "handy") {
      if (!out.contactMobile) out.contactMobile = value;
      continue;
    }

    if (key === "website" || key === "web" || key === "url") {
      out.contactWebsite = normalizeWebsiteValue(value);
      continue;
    }

    if (key === "street" || key === "strasse" || key === "adresse" || key === "address") {
      out.contactStreet = value;
      continue;
    }

    if (key === "zip" || key === "postalcode" || key === "postcode" || key === "plz") {
      out.contactZip = value;
      continue;
    }

    if (key === "city" || key === "ort") {
      out.contactCity = value;
      continue;
    }

    if (key === "country" || key === "land") {
      out.contactCountry = value;
      continue;
    }
  }

  return normalizeSuggestions(out);
}

function parseFreeformText(text: string): ContactSuggestions {
  const out = emptySuggestions();
  const raw = normalizeQrRawText(text);

  const email = raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  if (email) out.contactEmail = email;

  const url =
    raw.match(/\b(?:https?:\/\/|www\.)[^\s<>()]+/i)?.[0] ??
    raw.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\b/i)?.[0] ??
    "";
  if (url && !/@/.test(url)) out.contactWebsite = normalizeWebsiteValue(url);

  const phoneMatches = raw.match(/(?:\+?\d[\d ()/-]{5,}\d)/g) ?? [];
  if (phoneMatches[0]) out.contactPhone = phoneMatches[0].trim();
  if (phoneMatches[1]) out.contactMobile = phoneMatches[1].trim();

  const lines = raw
    .split("\n")
    .map((x) => x.trim())
    .filter(Boolean);

  const plainTextLines = lines.filter(
    (line) => !/@/.test(line) && !/^https?:\/\//i.test(line) && !/^www\./i.test(line) && !/\d{3,}/.test(line)
  );

  if (plainTextLines[0] && !out.contactFirstName && !out.contactLastName) {
    const split = splitName(plainTextLines[0]);
    if (split.first) out.contactFirstName = split.first;
    if (split.last) out.contactLastName = split.last;
  }

  if (plainTextLines[1] && !out.contactCompany) {
    out.contactCompany = plainTextLines[1];
  }

  return normalizeSuggestions(out);
}

function parseUriAsWebsite(text: string): ContactSuggestions {
  return normalizeSuggestions({
    ...emptySuggestions(),
    contactWebsite: normalizeWebsiteValue(text),
  });
}

function computeScore(format: QrContactFormat, rawText: string, suggestions: ContactSuggestions): number {
  let score = 0;

  if (sstr(suggestions.contactFirstName)) score += 1;
  if (sstr(suggestions.contactLastName)) score += 1;
  if (sstr(suggestions.contactCompany)) score += 2;
  if (sstr(suggestions.contactTitle)) score += 1;
  if (sstr(suggestions.contactEmail)) score += 4;
  if (sstr(suggestions.contactPhone)) score += 3;
  if (sstr(suggestions.contactMobile)) score += 3;
  if (sstr(suggestions.contactWebsite)) score += 2;
  if (sstr(suggestions.contactStreet)) score += 1;
  if (sstr(suggestions.contactZip)) score += 1;
  if (sstr(suggestions.contactCity)) score += 1;
  if (sstr(suggestions.contactCountry)) score += 1;

  if (format === "VCARD") score += 3;
  if (format === "MECARD" || format === "BIZCARD") score += 2;
  if (format === "KV" || format === "JSON") score += 1;

  if (hasOnlyNameSuggestion(suggestions)) score -= 4;
  if (seemsWeakText(rawText)) score -= 3;

  return score;
}

function confidenceFromScore(score: number): QrContactConfidence {
  if (score >= 8) return "HIGH";
  if (score >= 4) return "MEDIUM";
  if (score >= 1) return "LOW";
  return "NONE";
}

export function parseQrContactData(text: string): ParsedQrContactData {
  const rawText = normalizeQrRawText(text);
  let format: QrContactFormat = "UNKNOWN";
  let suggestions = emptySuggestions();

  if (!rawText) {
    return {
      rawText: "",
      format,
      suggestions,
      hasAnySuggestion: false,
      hasOnlyNameSuggestion: false,
      isWeakText: true,
      summary: "",
      confidence: "NONE",
      score: 0,
    };
  }

  if (/BEGIN:VCARD/i.test(rawText)) {
    format = "VCARD";
    suggestions = parseVCard(rawText);
  } else if (/^MECARD:/i.test(rawText)) {
    format = "MECARD";
    suggestions = parseMeCard(rawText);
  } else if (/^BIZCARD:/i.test(rawText)) {
    format = "BIZCARD";
    suggestions = parseBizCard(rawText);
  } else if (/^mailto:/i.test(rawText)) {
    format = "MAILTO";
    suggestions = parseMailto(rawText);
  } else if (/^tel:/i.test(rawText)) {
    format = "TEL";
    suggestions = parseTel(rawText);
  } else if (/^MATMSG:/i.test(rawText)) {
    format = "MATMSG";
    suggestions = parseMatMsg(rawText);
  } else if (/^\s*[\[{]/.test(rawText)) {
    format = "JSON";
    suggestions = parseJson(rawText);
  } else if (/^https?:\/\//i.test(rawText) || /^www\./i.test(rawText) || /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(rawText)) {
    format = "URI";
    suggestions = parseUriAsWebsite(rawText);
  } else {
    const kv = parseKeyValueText(rawText);
    if (hasAnySuggestion(kv)) {
      format = "KV";
      suggestions = kv;
    } else {
      format = "TEXT";
      suggestions = parseFreeformText(rawText);
    }
  }

  suggestions = normalizeSuggestions(suggestions);

  const any = hasAnySuggestion(suggestions);
  const onlyName = hasOnlyNameSuggestion(suggestions);
  const weak = seemsWeakText(rawText);
  const summary = summaryFromSuggestions(suggestions);
  const score = computeScore(format, rawText, suggestions);

  return {
    rawText,
    format,
    suggestions,
    hasAnySuggestion: any,
    hasOnlyNameSuggestion: onlyName,
    isWeakText: weak,
    summary,
    confidence: confidenceFromScore(score),
    score,
  };
}

export function chooseBestQrCandidate(
  rawCandidates: Array<string | null | undefined>
): ParsedQrContactData {
  const uniqueCandidates = Array.from(
    new Set(
      rawCandidates
        .map((x) => normalizeQrRawText(x ?? ""))
        .filter(Boolean)
    )
  );

  if (uniqueCandidates.length === 0) {
    return parseQrContactData("");
  }

  let best = parseQrContactData(uniqueCandidates[0]);

  for (let i = 1; i < uniqueCandidates.length; i += 1) {
    const parsed = parseQrContactData(uniqueCandidates[i]);

    if (parsed.score > best.score) {
      best = parsed;
      continue;
    }

    if (parsed.score === best.score && parsed.rawText.length > best.rawText.length) {
      best = parsed;
    }
  }

  return best;
}
