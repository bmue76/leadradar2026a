import type {
  ContactSuggestions,
  ParseBusinessCardInput,
  ParseBusinessCardResult,
} from "./types";

function emptySuggestions(): ContactSuggestions {
  return {
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
}

function cleanLine(s: string): string {
  return s
    .replace(/\u00A0/g, " ")
    .replace(/[|]/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function normalizeWebsite(raw: string): string {
  const v = raw.trim().replace(/[),.;]+$/g, "");
  if (!v) return "";

  if (/^https?:\/\//i.test(v)) return v;
  if (/^www\./i.test(v)) return `https://${v}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return `https://${v}`;

  return v;
}

function detectWebsite(rawText: string): string {
  const txt = rawText || "";

  const withProtocol = txt.match(/\bhttps?:\/\/[^\s<>"')]+/i)?.[0];
  if (withProtocol) return normalizeWebsite(withProtocol);

  const withWww = txt.match(/\bwww\.[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s<>"')]*)?/i)?.[0];
  if (withWww) return normalizeWebsite(withWww);

  const bareDomain = txt.match(
    /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:ch|com|net|org|io|co|de|at|fr|it|eu|biz|info|agency|app|tech|solutions|swiss)\b(?:\/[^\s<>"')]*)?/i
  )?.[0];

  if (bareDomain) return normalizeWebsite(bareDomain);

  return "";
}

function detectEmail(rawText: string): string {
  return rawText.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.trim() ?? "";
}

function normalizePhone(raw: string): string {
  const v = raw.trim().replace(/[^\d+()/ -]/g, "");
  return v.replace(/\s{2,}/g, " ").trim();
}

function detectPhones(rawText: string): { phone: string; mobile: string } {
  const matches = rawText.match(/(?:\+?\d[\d ()/-]{5,}\d)/g) ?? [];
  const cleaned = matches.map(normalizePhone).filter(Boolean);

  let phone = "";
  let mobile = "";

  for (const v of cleaned) {
    const compact = v.replace(/[^\d+]/g, "");
    if (!mobile && /^(\+?\d{6,})$/.test(compact) && /(79|78|77|76|75|74)\d{6}$/.test(compact.replace(/^\+41/, "0"))) {
      mobile = v;
      continue;
    }
    if (!phone) phone = v;
  }

  return { phone, mobile };
}

function splitName(fullName: string): { first: string; last: string } {
  const t = fullName.trim();
  if (!t) return { first: "", last: "" };

  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };

  return {
    first: parts.slice(0, -1).join(" "),
    last: parts.slice(-1).join(" "),
  };
}

function detectName(lines: string[], email: string, company: string): { first: string; last: string } {
  for (const line of lines.slice(0, 5)) {
    const t = cleanLine(line);
    if (!t) continue;
    if (email && t.includes(email)) continue;
    if (company && t.toLowerCase() === company.toLowerCase()) continue;
    if (/\d/.test(t)) continue;
    if (/^(tel|phone|mobile|email|mail|web|www|fax|address|adresse|strasse|street|www\.)/i.test(t)) continue;

    const words = t.split(/\s+/);
    if (words.length >= 2 && words.length <= 4) {
      return splitName(t);
    }
  }

  return { first: "", last: "" };
}

function detectCompany(lines: string[]): string {
  for (const line of lines.slice(0, 8)) {
    const t = cleanLine(line);
    if (!t) continue;
    if (/\d/.test(t)) continue;
    if (/^(tel|phone|mobile|email|mail|web|www|fax|address|adresse|strasse|street)/i.test(t)) continue;
    if (/\b(gmbh|ag|sa|sarl|llc|ltd|inc|group|solutions|consulting|systems|studio)\b/i.test(t)) {
      return t;
    }
  }

  for (const line of lines.slice(0, 4)) {
    const t = cleanLine(line);
    if (t && t.split(/\s+/).length <= 4) return t;
  }

  return "";
}

function detectTitle(lines: string[], company: string, firstName: string, lastName: string): string {
  const fullName = `${firstName} ${lastName}`.trim().toLowerCase();

  for (const line of lines.slice(0, 8)) {
    const t = cleanLine(line);
    if (!t) continue;
    if (company && t.toLowerCase() === company.toLowerCase()) continue;
    if (fullName && t.toLowerCase() === fullName) continue;
    if (/\d/.test(t)) continue;
    if (/^(tel|phone|mobile|email|mail|web|www|fax|address|adresse|strasse|street)/i.test(t)) continue;

    if (/\b(sales|ceo|owner|director|manager|consultant|engineer|head|leiter|verkauf|marketing|geschäftsführer|inhaber|projektleiter|berater)\b/i.test(t)) {
      return t;
    }
  }

  return "";
}

function detectAddress(lines: string[]): Pick<ContactSuggestions, "contactStreet" | "contactZip" | "contactCity" | "contactCountry"> {
  let contactStreet = "";
  let contactZip = "";
  let contactCity = "";
  let contactCountry = "";

  for (const line of lines) {
    const t = cleanLine(line);
    if (!t) continue;

    if (!contactStreet && /\b(strasse|straße|street|road|weg|gasse|allee|avenue|platz)\b/i.test(t)) {
      contactStreet = t;
    }

    if (!contactZip || !contactCity) {
      const m = t.match(/\b(\d{4,5})\s+([A-Za-zÄÖÜäöüß .-]{2,})$/);
      if (m) {
        contactZip = contactZip || m[1].trim();
        contactCity = contactCity || m[2].trim();
      }
    }

    if (!contactCountry && /\b(switzerland|schweiz|deutschland|germany|france|austria|österreich|italy|italia)\b/i.test(t)) {
      contactCountry = t.match(/\b(switzerland|schweiz|deutschland|germany|france|austria|österreich|italy|italia)\b/i)?.[0] ?? "";
    }
  }

  return { contactStreet, contactZip, contactCity, contactCountry };
}

export function parseBusinessCard(input: ParseBusinessCardInput): ParseBusinessCardResult {
  const rawText = (input.rawText || "").trim();
  const lines = rawText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const suggestions = emptySuggestions();

  suggestions.contactEmail = detectEmail(rawText);

  const phones = detectPhones(rawText);
  suggestions.contactPhone = phones.phone;
  suggestions.contactMobile = phones.mobile;

  suggestions.contactWebsite = detectWebsite(rawText);

  suggestions.contactCompany = detectCompany(lines);

  const name = detectName(lines, suggestions.contactEmail, suggestions.contactCompany);
  suggestions.contactFirstName = name.first;
  suggestions.contactLastName = name.last;

  suggestions.contactTitle = detectTitle(
    lines,
    suggestions.contactCompany,
    suggestions.contactFirstName,
    suggestions.contactLastName
  );

  const address = detectAddress(lines);
  suggestions.contactStreet = address.contactStreet;
  suggestions.contactZip = address.contactZip;
  suggestions.contactCity = address.contactCity;
  suggestions.contactCountry = address.contactCountry;

  return { suggestions };
}
