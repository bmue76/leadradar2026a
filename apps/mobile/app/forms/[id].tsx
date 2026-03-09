import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Camera, CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Clipboard from "expo-clipboard";
import * as Contacts from "expo-contacts";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import {
  apiFetch,
  createLead,
  patchLeadContact,
  storeAttachmentOcrResult,
  uploadLeadAttachment,
} from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import {
  chooseBestQrCandidate,
  parseQrContactData,
  prettyQrPreview,
  seemsWeakText,
  type ParsedQrContactData,
} from "../../src/lib/qrContact";
import { getActiveEventId } from "../../src/lib/eventStorage";
import { recognizeTextFromBusinessCard } from "../../src/ocr/recognizeText";
import { parseBusinessCard } from "../../src/ocr/parseBusinessCard";
import type { ContactSuggestions } from "../../src/ocr/types";
import { ScreenScaffold } from "../../src/ui/ScreenScaffold";
import { UI } from "../../src/ui/tokens";

type JsonObject = Record<string, unknown>;
type ScreenSection = "FORM" | "CONTACT";
type ContactPolicy = "NONE" | "EMAIL_OR_PHONE" | "EMAIL" | "PHONE";
type CaptureModeKey = "businessCard" | "qr" | "contacts" | "manual";

type CaptureModes = {
  businessCard: boolean;
  qr: boolean;
  contacts: boolean;
  manual: boolean;
};

type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "CHECKBOX"
  | "SINGLE_SELECT"
  | "MULTI_SELECT";

type FieldOption = { value: string; label: string };

type FormFieldDTO = {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  config?: unknown;
  status?: string | null;
};

type FormDetailDTO = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  config?: unknown;
  fields: FormFieldDTO[];
};

function isRecord(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function pickString(v: unknown): string | null {
  return typeof v === "string" && v.trim().length ? v.trim() : null;
}

function pickBool(v: unknown): boolean | null {
  return typeof v === "boolean" ? v : null;
}

function pickPropString(obj: unknown, key: string): string | null {
  if (!isRecord(obj)) return null;
  return pickString(obj[key]);
}

function sstr(v: string | undefined | null): string {
  return (v ?? "").trim();
}

function normalizeFieldType(v: unknown): FieldType {
  const t = pickString(v)?.toUpperCase() ?? "TEXT";
  const allowed: FieldType[] = [
    "TEXT",
    "TEXTAREA",
    "EMAIL",
    "PHONE",
    "CHECKBOX",
    "SINGLE_SELECT",
    "MULTI_SELECT",
  ];
  return (allowed.includes(t as FieldType) ? (t as FieldType) : "TEXT") as FieldType;
}

function parseOptions(config: unknown): FieldOption[] {
  if (!isRecord(config)) return [];

  const raw =
    (Array.isArray(config.items) ? config.items : null) ??
    (Array.isArray(config.options) ? config.options : null) ??
    (Array.isArray(config.values) ? config.values : null);

  if (!Array.isArray(raw)) return [];

  const out: FieldOption[] = [];
  for (const it of raw) {
    if (typeof it === "string" && it.trim()) {
      out.push({ value: it.trim(), label: it.trim() });
      continue;
    }
    if (!isRecord(it)) continue;

    const v =
      pickString(it.value) ??
      pickString(it.id) ??
      pickString(it.key) ??
      pickString(it.code) ??
      pickString(it.name) ??
      pickString(it.label);

    if (!v) continue;

    const label = pickString(it.label) ?? pickString(it.name) ?? v;
    out.push({ value: v, label });
  }

  const seen = new Set<string>();
  return out.filter((o) => {
    if (seen.has(o.value)) return false;
    seen.add(o.value);
    return true;
  });
}

function parseFormDetail(data: unknown): FormDetailDTO | null {
  if (!isRecord(data)) return null;

  const id = pickString(data.id);
  if (!id) return null;

  const name = pickString(data.name) ?? id;
  const description = typeof data.description === "string" ? data.description : null;
  const status = typeof data.status === "string" ? data.status : null;
  const config = "config" in data ? data.config : undefined;

  const fieldsRaw = Array.isArray(data.fields) ? (data.fields as unknown[]) : [];
  const fields: FormFieldDTO[] = [];

  for (const f of fieldsRaw) {
    if (!isRecord(f)) continue;

    const fStatus = typeof f.status === "string" ? f.status : null;
    if (fStatus && fStatus.toUpperCase() !== "ACTIVE") continue;

    const key = pickString(f.key);
    if (!key) continue;

    const label = pickString(f.label) ?? key;
    const type = normalizeFieldType(f.type);
    const required = pickBool(f.required) ?? false;

    const placeholder = typeof f.placeholder === "string" ? f.placeholder : null;
    const helpText = typeof f.helpText === "string" ? f.helpText : null;
    const fieldConfig = "config" in f ? (f.config as unknown) : undefined;

    fields.push({
      key,
      label,
      type,
      required,
      placeholder,
      helpText,
      config: fieldConfig,
      status: fStatus,
    });
  }

  return { id, name, description, status, config, fields };
}

function initValuesFor(fields: FormFieldDTO[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.type === "CHECKBOX") out[f.key] = false;
    else if (f.type === "MULTI_SELECT") out[f.key] = [];
    else out[f.key] = "";
  }
  return out;
}

function uuidv4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function isNonEmptyString(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

function validateFields(fields: FormFieldDTO[], values: Record<string, unknown>): Record<string, string> {
  const errs: Record<string, string> = {};

  for (const f of fields) {
    const v = values[f.key];

    if (f.required) {
      if (f.type === "CHECKBOX") {
        if (v !== true) errs[f.key] = "Bitte bestätigen.";
      } else if (f.type === "MULTI_SELECT") {
        const arr = isStringArray(v) ? v : [];
        if (arr.length === 0) errs[f.key] = "Bitte mindestens eine Option auswählen.";
      } else {
        if (!isNonEmptyString(v)) errs[f.key] = "Pflichtfeld.";
      }
    }

    if (f.type === "EMAIL" && isNonEmptyString(v)) {
      const s = String(v).trim();
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
      if (!ok) errs[f.key] = "Ungültige E-Mail-Adresse.";
    }

    if (f.type === "PHONE" && isNonEmptyString(v)) {
      const s = String(v).trim();
      const ok = /^[+0-9 ()/-]{6,}$/.test(s);
      if (!ok) errs[f.key] = "Ungültige Telefonnummer.";
    }

    if (f.type === "SINGLE_SELECT" && f.required && !isNonEmptyString(v)) {
      errs[f.key] = errs[f.key] || "Bitte auswählen.";
    }
  }

  return errs;
}

function normalizeContactKey(raw: string): string | null {
  const k = raw.trim();
  if (!k) return null;

  const lower = k.toLowerCase();

  const map: Record<string, string> = {
    firstname: "firstName",
    vorname: "firstName",
    givenname: "firstName",
    lastname: "lastName",
    nachname: "lastName",
    surname: "lastName",
    email: "email",
    "e-mail": "email",
    mail: "email",
    phone: "phone",
    telefon: "phone",
    mobile: "mobile",
    mobil: "mobile",
    company: "company",
    firma: "company",
    organisation: "company",
    organization: "company",
    title: "title",
    funktion: "title",
    position: "title",
    street: "street",
    strasse: "street",
    adresse: "street",
    zip: "zip",
    plz: "zip",
    city: "city",
    ort: "city",
    country: "country",
    land: "country",
    website: "website",
    url: "website",
    notes: "notes",
    notiz: "notes",
    bemerkung: "notes",
  };

  return map[lower] ?? k;
}

function contactPayloadKeyForField(f: FormFieldDTO): string | null {
  const fromConfig =
    pickPropString(f.config, "contactKey") ??
    pickPropString(f.config, "contactField") ??
    pickPropString(f.config, "mapTo");

  if (fromConfig) {
    const parts = fromConfig.split(".");
    const last = parts[parts.length - 1] ?? fromConfig;
    return normalizeContactKey(last);
  }

  return normalizeContactKey(f.key);
}

function fieldSectionOf(field: FormFieldDTO): ScreenSection {
  const section = pickPropString(field.config, "section")?.toUpperCase();

  if (section === "CONTACT") return "CONTACT";
  if (section === "FORM") return "FORM";

  const contactKeys = new Set([
    "firstname",
    "lastname",
    "company",
    "title",
    "email",
    "phone",
    "mobile",
    "street",
    "zip",
    "city",
    "country",
    "website",
    "vorname",
    "nachname",
    "firma",
    "telefon",
    "mobil",
    "strasse",
    "plz",
    "ort",
    "land",
  ]);

  return contactKeys.has(field.key.toLowerCase()) ? "CONTACT" : "FORM";
}

function readStartScreen(config: unknown): ScreenSection {
  const raw = pickPropString(config, "startScreen")?.toUpperCase();
  return raw === "CONTACT" ? "CONTACT" : "FORM";
}

function readStep1To2Label(config: unknown, secondScreen: ScreenSection): string {
  const custom = pickPropString(config, "ctaFormToContactLabel");
  if (custom) return custom;
  return secondScreen === "CONTACT" ? "Kontakt erfassen" : "Formular erfassen";
}

function readSubmitLabel(config: unknown): string {
  return pickPropString(config, "ctaContactSubmitLabel") ?? "Lead speichern";
}

function readContactPolicy(config: unknown): ContactPolicy {
  const raw = pickPropString(config, "contactPolicy")?.toUpperCase();
  if (raw === "EMAIL_OR_PHONE" || raw === "EMAIL" || raw === "PHONE") return raw;
  return "NONE";
}

function readCaptureModes(config: unknown): CaptureModes {
  const raw = isRecord(config) && isRecord(config.captureModes) ? config.captureModes : null;
  const base: CaptureModes = { businessCard: true, qr: true, contacts: true, manual: true };
  if (!raw) return base;

  const get = (k: keyof CaptureModes) => (typeof raw[k] === "boolean" ? (raw[k] as boolean) : base[k]);
  return {
    businessCard: get("businessCard"),
    qr: get("qr"),
    contacts: get("contacts"),
    manual: get("manual"),
  };
}

function valueToString(v: unknown): string | null {
  if (typeof v === "string") {
    const t = v.trim();
    return t ? t : null;
  }
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (Array.isArray(v)) {
    const parts = v.map((x) => (typeof x === "string" ? x.trim() : "")).filter(Boolean);
    return parts.length ? parts.join(", ") : null;
  }
  return null;
}

function normalizeWebsiteValue(raw: string): string {
  const v = raw.trim().replace(/[),.;]+$/g, "");
  if (!v) return "";
  if (/^https?:\/\//i.test(v)) return v;
  if (/^www\./i.test(v)) return `https://${v}`;
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(v)) return `https://${v}`;
  return v;
}

function normalizeSuggestions(s: ContactSuggestions): ContactSuggestions {
  return {
    ...s,
    contactWebsite: s.contactWebsite ? normalizeWebsiteValue(s.contactWebsite) : s.contactWebsite,
  };
}

function suggestionValueForPayloadKey(s: ContactSuggestions, payloadKey: string): string | undefined {
  switch (payloadKey) {
    case "firstName":
      return s.contactFirstName || undefined;
    case "lastName":
      return s.contactLastName || undefined;
    case "company":
      return s.contactCompany || undefined;
    case "title":
      return s.contactTitle || undefined;
    case "email":
      return s.contactEmail || undefined;
    case "phone":
      return s.contactPhone || undefined;
    case "mobile":
      return s.contactMobile || undefined;
    case "website":
      return s.contactWebsite || undefined;
    case "street":
      return s.contactStreet || undefined;
    case "zip":
      return s.contactZip || undefined;
    case "city":
      return s.contactCity || undefined;
    case "country":
      return s.contactCountry || undefined;
    default:
      return undefined;
  }
}

function hasAnySuggestion(s: ContactSuggestions): boolean {
  return Object.values(s).some((v) => typeof v === "string" && v.trim().length > 0);
}

function applySuggestionsToValues(
  contactFields: FormFieldDTO[],
  values: Record<string, unknown>,
  suggestions: ContactSuggestions
): Record<string, unknown> {
  const next = { ...values };

  for (const f of contactFields) {
    const payloadKey = contactPayloadKeyForField(f);
    if (!payloadKey) continue;
    const v = suggestionValueForPayloadKey(suggestions, payloadKey);
    if (!v || !v.trim()) continue;
    next[f.key] = payloadKey === "website" ? normalizeWebsiteValue(v) : v.trim();
  }

  return next;
}

function buildContactPayload(
  contactFields: FormFieldDTO[],
  values: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const f of contactFields) {
    const payloadKey = contactPayloadKeyForField(f);
    if (!payloadKey) continue;

    const s = valueToString(values[f.key]);
    if (!s) continue;

    const normalized = payloadKey === "website" ? normalizeWebsiteValue(s) : s;

    if (
      payloadKey === "firstName" ||
      payloadKey === "lastName" ||
      payloadKey === "company" ||
      payloadKey === "title" ||
      payloadKey === "email" ||
      payloadKey === "phone" ||
      payloadKey === "mobile" ||
      payloadKey === "website" ||
      payloadKey === "street" ||
      payloadKey === "zip" ||
      payloadKey === "city" ||
      payloadKey === "country"
    ) {
      out[payloadKey] = normalized;
    }
  }

  return out;
}

function validateContactPolicy(policy: ContactPolicy, payload: Record<string, unknown>): string | null {
  const email = typeof payload.email === "string" ? payload.email.trim() : "";
  const phone = typeof payload.phone === "string" ? payload.phone.trim() : "";
  const mobile = typeof payload.mobile === "string" ? payload.mobile.trim() : "";

  if (policy === "EMAIL" && !email) return "Kontakt: E-Mail ist erforderlich.";
  if (policy === "PHONE" && !phone && !mobile) return "Kontakt: Telefon oder Mobile ist erforderlich.";
  if (policy === "EMAIL_OR_PHONE" && !email && !phone && !mobile) {
    return "Kontakt: E-Mail oder Telefon ist erforderlich.";
  }

  return null;
}

function smallHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return `h${(h >>> 0).toString(16)}`;
}

function splitName(fullName: string): { first?: string; last?: string } {
  const t = fullName.trim();
  if (!t) return {};
  const parts = t.split(/\s+/);
  if (parts.length === 1) return { first: parts[0] };
  return { first: parts.slice(0, -1).join(" "), last: parts.slice(-1).join(" ") };
}

function hasRobustContactSuggestion(s: ContactSuggestions): boolean {
  return [
    s.contactEmail,
    s.contactPhone,
    s.contactMobile,
    s.contactWebsite,
    s.contactCompany,
    s.contactTitle,
    s.contactStreet,
    s.contactZip,
    s.contactCity,
    s.contactCountry,
  ].some((v) => sstr(v).length > 0);
}

function shouldApplyQrSuggestions(parsed: ParsedQrContactData): boolean {
  if (!parsed.hasAnySuggestion) return false;
  if (parsed.hasOnlyNameSuggestion) return false;
  if (hasRobustContactSuggestion(parsed.suggestions)) return true;
  return parsed.confidence === "HIGH" || parsed.confidence === "MEDIUM";
}

function labelQrFormat(format: string): string {
  switch (format) {
    case "VCARD":
      return "vCard";
    case "MECARD":
      return "MECARD";
    case "BIZCARD":
      return "BIZCARD";
    case "MAILTO":
      return "mailto";
    case "TEL":
      return "tel";
    case "MATMSG":
      return "MATMSG";
    case "JSON":
      return "JSON";
    case "KV":
      return "Text / Schlüsselwerte";
    case "URI":
      return "Link / URI";
    case "TEXT":
      return "Freitext";
    default:
      return "Unbekannt";
  }
}

function labelQrConfidence(confidence: string): string {
  switch (confidence) {
    case "HIGH":
      return "hoch";
    case "MEDIUM":
      return "mittel";
    case "LOW":
      return "niedrig";
    default:
      return "keine";
  }
}

function parsePickedContact(contact: unknown): ContactSuggestions {
  const out: ContactSuggestions = {
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

  if (!isRecord(contact)) return out;

  const firstName = pickString(contact.firstName);
  const lastName = pickString(contact.lastName);
  const fullName = pickString(contact.name);

  if (firstName) out.contactFirstName = firstName;
  if (lastName) out.contactLastName = lastName;

  if (!firstName && !lastName && fullName) {
    const split = splitName(fullName);
    if (split.first) out.contactFirstName = split.first;
    if (split.last) out.contactLastName = split.last;
  }

  const company = pickString(contact.company);
  if (company) out.contactCompany = company;

  const title = pickString(contact.jobTitle);
  if (title) out.contactTitle = title;

  const emails = Array.isArray(contact.emails) ? contact.emails : [];
  for (const e of emails) {
    if (!isRecord(e)) continue;
    const address = pickString(e.email) ?? pickString(e.address);
    if (address) {
      out.contactEmail = address;
      break;
    }
  }

  const phones = Array.isArray(contact.phoneNumbers) ? contact.phoneNumbers : [];
  for (const p of phones) {
    if (!isRecord(p)) continue;
    const number = pickString(p.number) ?? pickString(p.phoneNumber);
    if (!number) continue;

    const label = (pickString(p.label) ?? "").toLowerCase();
    if (label.includes("mobile") || label.includes("mobil") || label.includes("cell")) {
      if (!out.contactMobile) out.contactMobile = number;
    } else if (!out.contactPhone) {
      out.contactPhone = number;
    }
  }

  const urls = Array.isArray(contact.urlAddresses) ? contact.urlAddresses : [];
  for (const u of urls) {
    if (!isRecord(u)) continue;
    const url = pickString(u.url);
    if (url) {
      out.contactWebsite = normalizeWebsiteValue(url);
      break;
    }
  }

  const addresses = Array.isArray(contact.addresses) ? contact.addresses : [];
  for (const a of addresses) {
    if (!isRecord(a)) continue;
    const street = pickString(a.street);
    const city = pickString(a.city);
    const zip = pickString(a.postalCode) ?? pickString(a.zip);
    const country = pickString(a.country);

    if (street && !out.contactStreet) out.contactStreet = street;
    if (zip && !out.contactZip) out.contactZip = zip;
    if (city && !out.contactCity) out.contactCity = city;
    if (country && !out.contactCountry) out.contactCountry = country;
    break;
  }

  return normalizeSuggestions(out);
}

function shortAlertText(raw: string): string {
  if (raw.length <= 1200) return raw;
  return `${raw.slice(0, 1200)}…`;
}

function ScreenTabs(props: {
  current: ScreenSection;
  onChange: (next: ScreenSection) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.segmentWrap}>
      <Pressable
        onPress={() => props.onChange("CONTACT")}
        disabled={props.disabled}
        style={[styles.segmentBtn, props.current === "CONTACT" ? styles.segmentBtnActive : null]}
      >
        <Text style={[styles.segmentText, props.current === "CONTACT" ? styles.segmentTextActive : null]}>
          Kontakt
        </Text>
      </Pressable>

      <Pressable
        onPress={() => props.onChange("FORM")}
        disabled={props.disabled}
        style={[styles.segmentBtn, props.current === "FORM" ? styles.segmentBtnActive : null]}
      >
        <Text style={[styles.segmentText, props.current === "FORM" ? styles.segmentTextActive : null]}>
          Felder
        </Text>
      </Pressable>
    </View>
  );
}

function CaptureModeSelector(props: {
  modes: CaptureModes;
  active: CaptureModeKey;
  onSelect: (mode: CaptureModeKey) => void;
  disabled?: boolean;
}) {
  const items: Array<{ key: CaptureModeKey; title: string; subtitle: string }> = [
    { key: "businessCard", title: "Visitenkarte", subtitle: "Scan / OCR" },
    { key: "qr", title: "QR-Code", subtitle: "Schnellimport" },
    { key: "contacts", title: "Kontakte", subtitle: "Adressbuch" },
    { key: "manual", title: "Manuell", subtitle: "Direkteingabe" },
  ];

  const enabled = items.filter((it) => props.modes[it.key]);

  return (
    <View style={styles.captureGridOnly}>
      {enabled.map((it) => {
        const selected = props.active === it.key;
        return (
          <Pressable
            key={it.key}
            onPress={() => props.onSelect(it.key)}
            disabled={props.disabled}
            style={[styles.captureTile, selected ? styles.captureTileActive : null]}
          >
            <Text style={[styles.captureTileTitle, selected ? styles.captureTileActiveText : null]}>{it.title}</Text>
            <Text style={[styles.captureTileSub, selected ? styles.captureTileActiveText : null]}>{it.subtitle}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function MobileCaptureFormScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; eventId?: string }>();

  const formId = (params?.id ?? "").toString().trim();
  const eventIdParam = (params?.eventId ?? "").toString().trim();

  const formScannerRef = useRef<CameraView | null>(null);

  const [eventId, setEventId] = useState<string>(eventIdParam);

  const [loading, setLoading] = useState(false);
  const [loadErrorTitle, setLoadErrorTitle] = useState("");
  const [loadErrorDetail, setLoadErrorDetail] = useState("");
  const [loadTraceId, setLoadTraceId] = useState<string>("");

  const [form, setForm] = useState<FormDetailDTO | null>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string>("");
  const [submitTraceId, setSubmitTraceId] = useState<string>("");
  const [submitStage, setSubmitStage] = useState<string>("");

  const [currentScreen, setCurrentScreen] = useState<ScreenSection>("FORM");

  const [activeCaptureMode, setActiveCaptureMode] = useState<CaptureModeKey>("manual");
  const [lastContactSource, setLastContactSource] = useState<"OCR_MOBILE" | "QR_VCARD" | "MANUAL">("MANUAL");

  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerReady, setScannerReady] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [qrBusy, setQrBusy] = useState(false);
  const [camPermission, requestCamPermission] = useCameraPermissions();

  const [cardUri, setCardUri] = useState("");
  const [cardMime, setCardMime] = useState("image/jpeg");
  const [cardName, setCardName] = useState("business-card.jpg");
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState("");
  const [ocrRawText, setOcrRawText] = useState("");
  const [ocrBlocks, setOcrBlocks] = useState<unknown>(null);
  const [rawExpanded, setRawExpanded] = useState(false);

  const [qrRawText, setQrRawText] = useState("");
  const [qrDebugHint, setQrDebugHint] = useState("");
  const [qrDebugExpanded, setQrDebugExpanded] = useState(false);
  const [qrParsedSummary, setQrParsedSummary] = useState("");
  const [qrFormatLabel, setQrFormatLabel] = useState("");
  const [qrConfidenceLabel, setQrConfidenceLabel] = useState("");
  const [qrDecodeMode, setQrDecodeMode] = useState("");

  const title = useMemo(() => (form ? form.name : "Formular"), [form]);

  const resetQrState = useCallback(() => {
    setQrRawText("");
    setQrDebugHint("");
    setQrDebugExpanded(false);
    setQrParsedSummary("");
    setQrFormatLabel("");
    setQrConfidenceLabel("");
    setQrDecodeMode("");
    setQrBusy(false);
  }, []);

  const reActivate = useCallback(async () => {
    await clearApiKey();
    router.replace("/provision");
  }, []);

  const goEventGate = useCallback(() => {
    router.replace("/event-gate");
  }, []);

  const goList = useCallback(() => {
    router.replace("/forms");
  }, []);

  const handleApiErrorRedirects = useCallback(
    async (args: { status?: number; code?: string }) => {
      const status = args.status ?? 0;
      const code = args.code ?? "";

      if (status === 402 || code === "PAYMENT_REQUIRED") {
        router.replace("/license");
        return true;
      }

      if (status === 401 || code === "INVALID_API_KEY") {
        await reActivate();
        return true;
      }

      if (code === "EVENT_NOT_ACTIVE") {
        router.replace("/event-gate");
        return true;
      }

      if (code === "NOT_FOUND" || status === 404) {
        router.replace("/forms");
        return true;
      }

      return false;
    },
    [reActivate]
  );

  const load = useCallback(async () => {
    setLoadErrorTitle("");
    setLoadErrorDetail("");
    setLoadTraceId("");
    setSubmitError("");
    setSubmitTraceId("");
    setErrors({});
    setLoading(true);

    try {
      if (!formId) {
        setForm(null);
        setLoadErrorTitle("Formular nicht gefunden.");
        setLoadErrorDetail("Ungültige Form-ID.");
        return;
      }

      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const eid = eventIdParam || (await getActiveEventId()) || "";
      if (!eid) {
        router.replace("/event-gate");
        return;
      }
      setEventId(eid);

      const res = await apiFetch<FormDetailDTO>({
        method: "GET",
        path: `/api/mobile/v1/forms/${encodeURIComponent(formId)}?eventId=${encodeURIComponent(eid)}`,
        apiKey: key,
      });

      if (!res.ok) {
        const redirected = await handleApiErrorRedirects({ status: res.status, code: res.code });
        if (redirected) return;

        setForm(null);
        setLoadErrorTitle("Konnte Formular nicht laden.");
        setLoadTraceId(res.traceId ?? "");
        setLoadErrorDetail(
          `${res.message || `HTTP ${res.status ?? "?"}`}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`
        );
        return;
      }

      const parsed = parseFormDetail(res.data);
      if (!parsed) {
        setForm(null);
        setLoadErrorTitle("Konnte Formular nicht lesen.");
        setLoadErrorDetail("Unerwartete Server-Antwort (DTO).");
        setLoadTraceId(res.traceId ?? "");
        return;
      }

      setForm(parsed);
      setValues(initValuesFor(parsed.fields));
      setErrors({});
      setCardUri("");
      setOcrError("");
      setOcrRawText("");
      setOcrBlocks(null);
      setRawExpanded(false);
      resetQrState();
      setLastContactSource("MANUAL");
    } finally {
      setLoading(false);
    }
  }, [eventIdParam, formId, handleApiErrorRedirects, resetQrState]);

  useEffect(() => {
    void load();
  }, [load]);

  const formFields = useMemo(() => {
    if (!form) return [];
    return form.fields.filter((f) => fieldSectionOf(f) === "FORM");
  }, [form]);

  const contactFields = useMemo(() => {
    if (!form) return [];
    return form.fields.filter((f) => fieldSectionOf(f) === "CONTACT");
  }, [form]);

  const startScreen = useMemo<ScreenSection>(() => readStartScreen(form?.config), [form?.config]);
  const secondScreen = startScreen === "CONTACT" ? "FORM" : "CONTACT";
  const captureModes = useMemo(() => readCaptureModes(form?.config), [form?.config]);
  const contactPolicy = useMemo(() => readContactPolicy(form?.config), [form?.config]);

  useEffect(() => {
    if (!form) return;

    const hasStartFields = startScreen === "CONTACT" ? contactFields.length > 0 : formFields.length > 0;
    const hasSecondFields = secondScreen === "CONTACT" ? contactFields.length > 0 : formFields.length > 0;

    if (hasStartFields) {
      setCurrentScreen(startScreen);
      return;
    }

    if (hasSecondFields) {
      setCurrentScreen(secondScreen);
      return;
    }

    setCurrentScreen(startScreen);
  }, [contactFields.length, form, formFields.length, secondScreen, startScreen]);

  useEffect(() => {
    const order: CaptureModeKey[] = ["manual", "businessCard", "qr", "contacts"];
    const firstEnabled = order.find((m) => captureModes[m]) ?? "manual";
    if (!captureModes[activeCaptureMode]) setActiveCaptureMode(firstEnabled);
  }, [activeCaptureMode, captureModes]);

  const currentFields = currentScreen === "CONTACT" ? contactFields : formFields;
  const currentStepIndex = currentScreen === startScreen ? 1 : 2;
  const isFinalStep = currentScreen === secondScreen || startScreen === secondScreen;
  const nextLabel = useMemo(
    () => readStep1To2Label(form?.config, secondScreen),
    [form?.config, secondScreen]
  );
  const submitLabel = useMemo(() => readSubmitLabel(form?.config), [form?.config]);

  const padBottom = 24 + UI.tabBarBaseHeight + Math.max(insets.bottom, 0);

  const updateValue = useCallback((key: string, next: unknown) => {
    setValues((prev) => ({ ...prev, [key]: next }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  }, []);

  const toggleMulti = useCallback(
    (key: string, value: string) => {
      const cur = values[key];
      const arr = isStringArray(cur) ? [...cur] : [];
      const idx = arr.indexOf(value);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(value);
      updateValue(key, arr);
    },
    [updateValue, values]
  );

  const applySuggestions = useCallback(
    (suggestionsRaw: ContactSuggestions, source: "OCR_MOBILE" | "QR_VCARD" | "MANUAL") => {
      const suggestions = normalizeSuggestions(suggestionsRaw);

      if (!hasAnySuggestion(suggestions)) {
        Alert.alert("Keine Kontaktdaten erkannt", "Wir konnten keine nutzbaren Kontaktdaten übernehmen.");
        return;
      }

      setValues((prev) => applySuggestionsToValues(contactFields, prev, suggestions));
      setLastContactSource(source);
      setCurrentScreen("CONTACT");
      Alert.alert("Kontakt übernommen", "Die Kontaktdaten wurden in die Kontaktfelder eingetragen.");
    },
    [contactFields]
  );

  const scanBusinessCard = useCallback(async () => {
    setOcrError("");

    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "Visitenkarten-Scan ist auf Web nicht verfügbar.");
      return;
    }

    setActiveCaptureMode("businessCard");
    setOcrBusy(true);

    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setOcrError("Kamera-Zugriff ist nötig, um eine Visitenkarte zu scannen.");
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        quality: 1,
        allowsEditing: false,
        base64: false,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const uri = asset.uri;
      if (!uri) return;

      const manipulated = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 2048 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
      );

      const fileUri = manipulated.uri;
      const fileName = `business-card-${Date.now()}.jpg`;

      const ocr = await recognizeTextFromBusinessCard({ imagePath: fileUri });
      const parsed = parseBusinessCard({ rawText: ocr.rawText, blocks: ocr.blocks });

      setCardUri(fileUri);
      setCardMime("image/jpeg");
      setCardName(fileName);
      setOcrRawText(ocr.rawText || "");
      setOcrBlocks(ocr.blocks || null);
      setRawExpanded(false);

      applySuggestions(parsed.suggestions || ({} as ContactSuggestions), "OCR_MOBILE");

      if (seemsWeakText(ocr.rawText || "")) {
        setOcrError("Wir konnten kaum Text erkennen. Bitte näher ran und ruhig halten.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "OCR fehlgeschlagen.";
      setOcrError(msg || "OCR fehlgeschlagen.");
    } finally {
      setOcrBusy(false);
    }
  }, [applySuggestions]);

  const openQrScanner = useCallback(async () => {
    setActiveCaptureMode("qr");
    resetQrState();
    setScannerReady(false);

    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "QR-Scan ist auf Web nicht verfügbar.");
      return;
    }

    if (!camPermission?.granted) {
      const req = await requestCamPermission();
      if (!req.granted) {
        Alert.alert("Kamera erforderlich", "Bitte Kamera-Zugriff erlauben, um QR-Codes zu scannen.");
        return;
      }
    }

    setScanLock(false);
    setScannerOpen(true);
  }, [camPermission?.granted, requestCamPermission, resetQrState]);

  const captureAndDecodeQrFrame = useCallback(async (): Promise<string[]> => {
    const cam = formScannerRef.current;
    if (!cam || !scannerReady) return [];

    try {
      const photo = await cam.takePictureAsync({
        quality: 0.9,
        skipProcessing: false,
      });

      if (!photo?.uri) return [];

      const candidateUris: string[] = [photo.uri];

      if (typeof photo.width === "number" && typeof photo.height === "number" && photo.width > 0 && photo.height > 0) {
        const cropWidth = Math.max(240, Math.floor(photo.width * 0.72));
        const cropHeight = Math.max(240, Math.floor(photo.height * 0.72));
        const originX = Math.max(0, Math.floor((photo.width - cropWidth) / 2));
        const originY = Math.max(0, Math.floor((photo.height - cropHeight) / 2));

        const cropped = await ImageManipulator.manipulateAsync(
          photo.uri,
          [
            { crop: { originX, originY, width: cropWidth, height: cropHeight } },
            { resize: { width: 1600 } },
          ],
          { compress: 0.95, format: ImageManipulator.SaveFormat.JPEG }
        );

        if (cropped?.uri) candidateUris.unshift(cropped.uri);
      }

      const texts: string[] = [];

      for (const uri of candidateUris) {
        const scanResults = await Camera.scanFromURLAsync(uri, ["qr"]);
        for (const item of scanResults) {
          const raw = (item?.data ?? "").toString().trim();
          if (raw) texts.push(raw);
        }
      }

      return Array.from(new Set(texts));
    } catch {
      return [];
    }
  }, [scannerReady]);

  const onQrScanned = useCallback(
    async (res: BarcodeScanningResult) => {
      if (scanLock || qrBusy) return;

      setScanLock(true);
      setQrBusy(true);
      setQrDebugExpanded(false);

      try {
        const liveRaw = (res?.data ?? "").toString().trim();
        const liveParsed = parseQrContactData(liveRaw);

        let best = liveParsed;
        let decodeMode = "Live";
        let usedPhotoFallback = false;

        const shouldTryPhotoFallback =
          Platform.OS !== "web" &&
          (!liveParsed.hasAnySuggestion ||
            liveParsed.hasOnlyNameSuggestion ||
            liveParsed.confidence === "LOW" ||
            liveParsed.confidence === "NONE" ||
            liveParsed.isWeakText);

        if (shouldTryPhotoFallback) {
          const photoCandidates = await captureAndDecodeQrFrame();
          if (photoCandidates.length > 0) {
            best = chooseBestQrCandidate([liveRaw, ...photoCandidates]);
            decodeMode = "Live + Foto";
            usedPhotoFallback = true;
          }
        }

        setQrRawText(best.rawText || liveRaw);
        setQrParsedSummary(best.summary);
        setQrFormatLabel(labelQrFormat(best.format));
        setQrConfidenceLabel(labelQrConfidence(best.confidence));
        setQrDecodeMode(decodeMode);

        if (!shouldApplyQrSuggestions(best)) {
          setQrDebugHint(
            usedPhotoFallback
              ? "QR erkannt, aber keine vollständigen Kontaktdaten lesbar."
              : "QR erkannt, aber noch keine brauchbaren Kontaktdaten lesbar."
          );
          setScannerOpen(false);
          Alert.alert(
            "QR-Code erkannt",
            "Wir konnten daraus keine vollständigen Kontaktdaten übernehmen. Bitte nochmals ruhiger scannen oder alternativ Visitenkarte bzw. Kontakte verwenden."
          );
          return;
        }

        setQrDebugHint(best.summary ? `Kontakt erkannt: ${best.summary}` : "Kontakt aus QR übernommen.");
        setScannerOpen(false);
        applySuggestions(best.suggestions, "QR_VCARD");
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : "QR konnte nicht verarbeitet werden.";
        setQrDebugHint("QR konnte nicht verarbeitet werden.");
        setScannerOpen(false);
        Alert.alert("QR-Scan fehlgeschlagen", message);
      } finally {
        setQrBusy(false);
        setTimeout(() => setScanLock(false), 400);
      }
    },
    [applySuggestions, captureAndDecodeQrFrame, qrBusy, scanLock]
  );

  const pickContact = useCallback(async () => {
    setActiveCaptureMode("contacts");

    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "Kontakte sind auf Web nicht verfügbar.");
      return;
    }

    const perm = await Contacts.requestPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Kontakte erforderlich", "Bitte Kontakte-Zugriff erlauben.");
      return;
    }

    const picked = await Contacts.presentContactPickerAsync();
    if (!picked) return;

    const parsed = parsePickedContact(picked);
    applySuggestions(parsed, "MANUAL");
  }, [applySuggestions]);

  const resetCaptureState = useCallback(() => {
    setCardUri("");
    setOcrError("");
    setOcrRawText("");
    setOcrBlocks(null);
    setRawExpanded(false);
    resetQrState();
    setLastContactSource("MANUAL");
  }, [resetQrState]);

  const resetAll = useCallback(() => {
    if (!form) return;
    setValues(initValuesFor(form.fields));
    setErrors({});
    setSubmitError("");
    setSubmitTraceId("");
    resetCaptureState();
    setCurrentScreen(startScreen);
  }, [form, resetCaptureState, startScreen]);

  const goNext = useCallback(() => {
    const errs = validateFields(currentFields, values);
    setErrors((prev) => ({ ...prev, ...errs }));

    if (Object.keys(errs).length > 0) return;
    setCurrentScreen(secondScreen);
  }, [currentFields, secondScreen, values]);

  const submit = useCallback(async () => {
    if (!form) return;

    setSubmitError("");
    setSubmitTraceId("");

    const allErrs = validateFields(form.fields, values);
    setErrors(allErrs);

    if (Object.keys(allErrs).length > 0) {
      const hasContactErr = contactFields.some((f) => !!allErrs[f.key]);
      setCurrentScreen(hasContactErr ? "CONTACT" : "FORM");
      return;
    }

    const contactPayload = buildContactPayload(contactFields, values);
    const policyError = validateContactPolicy(contactPolicy, contactPayload);
    if (policyError) {
      setCurrentScreen("CONTACT");
      Alert.alert("Kontakt prüfen", policyError);
      return;
    }

    setSubmitting(true);
    try {
      const key = await getApiKey();
      if (!key) {
        router.replace("/provision");
        return;
      }

      const eid = (eventId || "").trim() || (await getActiveEventId()) || "";
      if (!eid) {
        router.replace("/event-gate");
        return;
      }

      const payload = {
        formId: form.id,
        clientLeadId: uuidv4(),
        capturedAt: new Date().toISOString(),
        eventId: eid,
        values,
      };

      setSubmitStage("Lead");
      const res = await createLead({ apiKey: key, payload });

      if (!res.ok) {
        const redirected = await handleApiErrorRedirects({ status: res.status, code: res.code });
        if (redirected) return;

        setSubmitTraceId(res.traceId ?? "");
        setSubmitError(
          `Konnte Lead nicht senden. ${res.message || `HTTP ${res.status ?? "?"}`}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`
        );
        return;
      }

      const leadId = res.data?.leadId;
      const deduped = typeof res.data?.deduped === "boolean" ? res.data.deduped : undefined;

      let ocrResultId: string | undefined;

      if (leadId && cardUri && lastContactSource === "OCR_MOBILE") {
        setSubmitStage("Attachment");
        const attRes = await uploadLeadAttachment({
          apiKey: key,
          leadId,
          fileUri: cardUri,
          mimeType: cardMime,
          fileName: cardName,
          type: "BUSINESS_CARD_IMAGE",
        });

        if (!attRes.ok) {
          const redirected = await handleApiErrorRedirects({ status: attRes.status, code: attRes.code });
          if (redirected) return;

          setSubmitTraceId(attRes.traceId ?? "");
          setSubmitError(
            `Attachment Upload fehlgeschlagen. ${attRes.message}${attRes.traceId ? ` (traceId: ${attRes.traceId})` : ""}`
          );
          return;
        }

        setSubmitStage("OCR");
        const resultHash = smallHash((ocrRawText || "") + "|" + JSON.stringify(contactPayload || {}));

        const ocrStoreRes = await storeAttachmentOcrResult({
          apiKey: key,
          attachmentId: attRes.data.attachmentId,
          payload: {
            engine: "MLKIT",
            engineVersion: "@infinitered/react-native-mlkit-text-recognition@5.x",
            mode: "PHOTO",
            resultHash,
            rawText: ocrRawText || "",
            blocksJson: ocrBlocks || null,
            suggestions: contactPayload,
          },
        });

        if (!ocrStoreRes.ok) {
          const redirected = await handleApiErrorRedirects({ status: ocrStoreRes.status, code: ocrStoreRes.code });
          if (redirected) return;

          setSubmitTraceId(ocrStoreRes.traceId ?? "");
          setSubmitError(
            `OCR speichern fehlgeschlagen. ${ocrStoreRes.message}${ocrStoreRes.traceId ? ` (traceId: ${ocrStoreRes.traceId})` : ""}`
          );
          return;
        }

        ocrResultId = ocrStoreRes.data.ocrResultId;
      }

      if (leadId && Object.keys(contactPayload).length > 0) {
        setSubmitStage("Kontakt");
        const patchPayload: Record<string, unknown> = {
          ...contactPayload,
          contactSource: lastContactSource,
        };

        if (ocrResultId) patchPayload.contactOcrResultId = ocrResultId;

        const pr = await patchLeadContact({
          apiKey: key,
          leadId,
          payload: patchPayload,
        });

        if (!pr.ok) {
          const redirected = await handleApiErrorRedirects({ status: pr.status, code: pr.code });
          if (redirected) return;

          setSubmitTraceId(pr.traceId ?? "");
          setSubmitError(
            `Kontakt konnte nicht übernommen werden. ${pr.message}${pr.traceId ? ` (traceId: ${pr.traceId})` : ""}`
          );
          return;
        }
      }

      Alert.alert("Gespeichert.", deduped ? "Lead war bereits vorhanden (Dedup)." : "Lead wurde erfasst.");
      resetAll();
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  }, [
    cardMime,
    cardName,
    cardUri,
    contactFields,
    contactPolicy,
    eventId,
    form,
    handleApiErrorRedirects,
    lastContactSource,
    ocrBlocks,
    ocrRawText,
    resetAll,
    values,
  ]);

  const renderField = useCallback(
    (f: FormFieldDTO) => {
      const err = errors[f.key];
      const requiredMark = f.required ? " *" : "";
      const help = f.helpText && f.helpText.trim() ? f.helpText.trim() : null;

      if (f.type === "CHECKBOX") {
        const v = values[f.key] === true;
        return (
          <View key={f.key} style={styles.fieldCard}>
            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>
                {f.label}
                <Text style={styles.req}>{requiredMark}</Text>
              </Text>
              <Switch value={v} onValueChange={(next) => updateValue(f.key, next)} />
            </View>

            {help ? <Text style={styles.help}>{help}</Text> : null}
            {err ? <Text style={styles.errText}>{err}</Text> : null}
          </View>
        );
      }

      if (f.type === "SINGLE_SELECT" || f.type === "MULTI_SELECT") {
        const opts = parseOptions(f.config);
        const rawSingle = values[f.key];
        const vSingle = isNonEmptyString(rawSingle) ? String(rawSingle).trim() : "";
        const rawMulti = values[f.key];
        const vMulti: string[] = isStringArray(rawMulti) ? rawMulti : [];

        return (
          <View key={f.key} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {f.label}
              <Text style={styles.req}>{requiredMark}</Text>
            </Text>

            {help ? <Text style={styles.help}>{help}</Text> : null}

            {opts.length === 0 ? (
              <Text style={styles.help}>Keine Auswahloptionen definiert.</Text>
            ) : (
              <View style={styles.optionsWrap}>
                {opts.map((o) => {
                  const selected = f.type === "SINGLE_SELECT" ? vSingle === o.value : vMulti.includes(o.value);
                  return (
                    <Pressable
                      key={o.value}
                      onPress={() => {
                        if (submitting) return;
                        if (f.type === "SINGLE_SELECT") updateValue(f.key, o.value);
                        else toggleMulti(f.key, o.value);
                      }}
                      style={[styles.optionPill, selected ? styles.optionPillSelected : null]}
                    >
                      <Text style={[styles.optionText, selected ? styles.optionTextSelected : null]}>
                        {o.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {err ? <Text style={styles.errText}>{err}</Text> : null}
          </View>
        );
      }

      const v = typeof values[f.key] === "string" ? (values[f.key] as string) : "";
      const placeholder = f.placeholder && f.placeholder.trim() ? f.placeholder.trim() : undefined;

      const keyboardType =
        f.type === "EMAIL" ? "email-address" : f.type === "PHONE" ? "phone-pad" : "default";

      const multiline = f.type === "TEXTAREA";
      const inputHeight = multiline ? 110 : 46;

      return (
        <View key={f.key} style={styles.fieldCard}>
          <Text style={styles.fieldLabel}>
            {f.label}
            <Text style={styles.req}>{requiredMark}</Text>
          </Text>

          {help ? <Text style={styles.help}>{help}</Text> : null}

          <TextInput
            value={v}
            onChangeText={(t) => updateValue(f.key, t)}
            placeholder={placeholder}
            placeholderTextColor={"rgba(0,0,0,0.35)"}
            keyboardType={keyboardType}
            autoCapitalize={f.type === "EMAIL" ? "none" : "sentences"}
            autoCorrect={f.type === "EMAIL" ? false : true}
            multiline={multiline}
            style={[styles.input, { height: inputHeight }, multiline ? styles.inputMultiline : null]}
            editable={!submitting}
          />

          {err ? <Text style={styles.errText}>{err}</Text> : null}
        </View>
      );
    },
    [errors, submitting, toggleMulti, updateValue, values]
  );

  const rawPreview = useMemo(() => {
    const txt = (ocrRawText || "").trim();
    if (!txt) return "";
    const lines = txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (rawExpanded) return lines.join("\n");
    return lines.slice(0, 6).join("\n");
  }, [ocrRawText, rawExpanded]);

  const qrVisibleText = useMemo(() => prettyQrPreview(qrRawText || "", 3200), [qrRawText]);

  if (scannerOpen) {
    return (
      <View style={{ flex: 1, backgroundColor: "black" }}>
        <View style={{ paddingTop: 56, paddingHorizontal: 20, paddingBottom: 14 }}>
          <Text style={{ color: "white", fontSize: 18, fontWeight: "900" }}>QR-Code scannen</Text>
          <Text style={{ color: "rgba(255,255,255,0.75)", marginTop: 6 }}>
            vCard / MECARD / BIZCARD oder andere Kontaktdaten scannen.
          </Text>
        </View>

        <View style={styles.scannerViewport}>
          <CameraView
            ref={formScannerRef}
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onCameraReady={() => setScannerReady(true)}
            onBarcodeScanned={scanLock || qrBusy ? undefined : onQrScanned}
          />
          <View pointerEvents="none" style={styles.scannerOverlay}>
            <View style={styles.scannerFrame} />
            <View style={styles.scannerHintBox}>
              <Text style={styles.scannerHintTitle}>{qrBusy ? "QR wird geprüft …" : "QR in den Rahmen halten"}</Text>
              <Text style={styles.scannerHintText}>
                Bei schwachem Treffer folgt automatisch ein zweiter Decode-Pass.
              </Text>
            </View>
          </View>
        </View>

        <View style={{ paddingHorizontal: 20, paddingBottom: 28 }}>
          <Pressable
            onPress={() => {
              setScannerOpen(false);
              setScanLock(false);
              setQrBusy(false);
              setScannerReady(false);
            }}
            disabled={qrBusy}
            style={{
              paddingVertical: 14,
              borderRadius: 14,
              alignItems: "center",
              backgroundColor: "rgba(255,255,255,0.12)",
              opacity: qrBusy ? 0.55 : 1,
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{qrBusy ? "Bitte warten …" : "Abbrechen"}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <ScreenScaffold title={title} scroll={false}>
      {loading && !form ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Formular wird geladen …</Text>
        </View>
      ) : loadErrorTitle ? (
        <View style={styles.body}>
          <View style={styles.warnCard}>
            <Text style={styles.warnTitle}>{loadErrorTitle}</Text>
            <Text style={styles.warnText}>{loadErrorDetail || "Bitte nochmals versuchen."}</Text>
            {loadTraceId ? <Text style={styles.trace}>traceId: {loadTraceId}</Text> : null}

            <View style={styles.row}>
              <Pressable onPress={load} style={[styles.btn, styles.btnDark]}>
                <Text style={styles.btnDarkText}>Erneut versuchen</Text>
              </Pressable>

              <Pressable onPress={goList} style={[styles.btn, styles.btnGhost]}>
                <Text style={styles.btnGhostText}>Zur Liste</Text>
              </Pressable>
            </View>

            <Pressable onPress={goEventGate} style={[styles.btnWide, styles.btnGhost]}>
              <Text style={styles.btnGhostText}>Event wählen</Text>
            </Pressable>

            <Pressable onPress={reActivate} style={[styles.btnWide, styles.btnDangerGhost]}>
              <Text style={styles.btnDangerGhostText}>Neu aktivieren</Text>
            </Pressable>
          </View>
        </View>
      ) : form ? (
        <ScrollView contentContainerStyle={[styles.body, { paddingBottom: padBottom }]}>
          <View style={styles.headerCard}>
            <View style={styles.headerTopRow}>
              <Text style={styles.h1}>{form.name}</Text>
              <View style={styles.stepBadge}>
                <Text style={styles.stepBadgeText}>{currentStepIndex}/2</Text>
              </View>
            </View>

            {form.description ? <Text style={styles.p}>{form.description}</Text> : null}

            <View style={styles.headerRow}>
              <Pressable onPress={goList} style={[styles.smallBtn, styles.smallBtnGhost]} disabled={submitting}>
                <Text style={styles.smallBtnGhostText}>Zur Liste</Text>
              </Pressable>

              <Pressable onPress={goEventGate} style={[styles.smallBtn, styles.smallBtnGhost]} disabled={submitting}>
                <Text style={styles.smallBtnGhostText}>Event wechseln</Text>
              </Pressable>

              <Pressable onPress={load} style={[styles.smallBtn, styles.smallBtnGhost]} disabled={submitting}>
                <Text style={styles.smallBtnGhostText}>Reload</Text>
              </Pressable>
            </View>

            <View style={{ marginTop: 12 }}>
              <ScreenTabs current={currentScreen} onChange={setCurrentScreen} disabled={submitting} />
              <Text style={styles.subHint}>
                Start:{" "}
                <Text style={styles.subHintStrong}>
                  {startScreen === "CONTACT" ? "Kontakt" : "Felder"}
                </Text>{" "}
                · Kontakt: <Text style={styles.subHintStrong}>{contactFields.length}</Text> · Felder:{" "}
                <Text style={styles.subHintStrong}>{formFields.length}</Text>
              </Text>
            </View>
          </View>

          {currentScreen === "CONTACT" ? (
            <>
              <CaptureModeSelector
                modes={captureModes}
                active={activeCaptureMode}
                onSelect={(mode) => {
                  setActiveCaptureMode(mode);

                  if (mode === "businessCard") void scanBusinessCard();
                  if (mode === "qr") void openQrScanner();
                  if (mode === "contacts") void pickContact();
                  if (mode === "manual") setLastContactSource("MANUAL");
                }}
                disabled={submitting || ocrBusy || qrBusy}
              />

              {activeCaptureMode === "businessCard" && (cardUri || ocrBusy || ocrError || ocrRawText) ? (
                <View style={styles.captureReviewBox}>
                  {cardUri ? (
                    <View style={styles.capturePreviewRow}>
                      <Image
                        alt=""
                        source={{ uri: cardUri }}
                        style={styles.cardPreview}
                        contentFit="cover"
                      />

                      <View style={{ flex: 1, gap: 8 }}>
                        <Text style={styles.pStrong}>Scan vorhanden</Text>

                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <Pressable
                            onPress={() => void scanBusinessCard()}
                            disabled={ocrBusy || submitting}
                            style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                          >
                            <Text style={styles.smallActionBtnDarkText}>{ocrBusy ? "…" : "Neu scannen"}</Text>
                          </Pressable>

                          <Pressable
                            onPress={resetCaptureState}
                            disabled={ocrBusy || submitting}
                            style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                          >
                            <Text style={styles.smallActionBtnGhostText}>Entfernen</Text>
                          </Pressable>
                        </View>
                      </View>
                    </View>
                  ) : null}

                  {ocrBusy ? (
                    <View style={styles.statusRow}>
                      <ActivityIndicator />
                      <Text style={styles.statusText}>Wir lesen den Text.</Text>
                    </View>
                  ) : null}

                  {ocrError ? (
                    <View style={styles.warnInline}>
                      <Text style={styles.warnInlineTitle}>Hinweis</Text>
                      <Text style={styles.warnInlineText}>{ocrError}</Text>
                    </View>
                  ) : null}

                  {ocrRawText ? (
                    <View style={styles.ocrBox}>
                      <Text style={styles.ocrTitle}>Erkannter Text</Text>
                      <Text style={styles.ocrBody}>{rawPreview || "—"}</Text>
                      <Pressable onPress={() => setRawExpanded((p) => !p)} style={{ marginTop: 8 }}>
                        <Text style={styles.linkText}>{rawExpanded ? "Weniger" : "Mehr"}</Text>
                      </Pressable>
                    </View>
                  ) : null}
                </View>
              ) : null}

              {activeCaptureMode === "qr" && (qrRawText || qrDebugHint || qrParsedSummary) ? (
                <View style={styles.captureReviewBox}>
                  <View style={styles.qrHeaderRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pStrong}>QR-Erfassung</Text>
                      {qrParsedSummary ? <Text style={styles.pMuted}>Übernommen: {qrParsedSummary}</Text> : null}
                    </View>

                    <View style={styles.qrBadge}>
                      <Text style={styles.qrBadgeText}>QR</Text>
                    </View>
                  </View>

                  {qrDebugHint ? (
                    <View style={styles.warnInline}>
                      <Text style={styles.warnInlineTitle}>Hinweis</Text>
                      <Text style={styles.warnInlineText}>{qrDebugHint}</Text>
                    </View>
                  ) : null}

                  {(qrFormatLabel || qrConfidenceLabel || qrDecodeMode) ? (
                    <View style={styles.qrMetaRow}>
                      {qrFormatLabel ? <Text style={styles.qrMetaText}>Format: {qrFormatLabel}</Text> : null}
                      {qrConfidenceLabel ? (
                        <Text style={styles.qrMetaText}>Vertrauen: {qrConfidenceLabel}</Text>
                      ) : null}
                      {qrDecodeMode ? <Text style={styles.qrMetaText}>Pfad: {qrDecodeMode}</Text> : null}
                      {qrRawText ? <Text style={styles.qrMetaText}>Länge: {qrRawText.length}</Text> : null}
                    </View>
                  ) : null}

                  {qrRawText ? (
                    <View style={styles.ocrBox}>
                      <View style={styles.qrDebugHeader}>
                        <Text style={styles.ocrTitle}>Debug</Text>
                        <Pressable onPress={() => setQrDebugExpanded((p) => !p)}>
                          <Text style={styles.linkText}>{qrDebugExpanded ? "Ausblenden" : "Anzeigen"}</Text>
                        </Pressable>
                      </View>

                      {qrDebugExpanded ? (
                        <>
                          <Text style={styles.ocrBody}>{qrVisibleText || "—"}</Text>

                          <View style={styles.qrActionsRow}>
                            <Pressable
                              onPress={async () => {
                                await Clipboard.setStringAsync(qrRawText);
                                Alert.alert("Kopiert", "QR-Rohinhalt wurde in die Zwischenablage kopiert.");
                              }}
                              style={styles.qrActionBtn}
                            >
                              <Text style={styles.qrActionBtnText}>Kopieren</Text>
                            </Pressable>

                            <Pressable
                              onPress={() => Alert.alert("QR-Rohinhalt", shortAlertText(qrRawText))}
                              style={styles.qrActionBtn}
                            >
                              <Text style={styles.qrActionBtnText}>Als Alert</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <Text style={styles.pMuted}>Rohinhalt nur für Entwicklung einblenden.</Text>
                      )}
                    </View>
                  ) : null}

                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <Pressable
                      onPress={() => void openQrScanner()}
                      disabled={submitting || qrBusy}
                      style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                    >
                      <Text style={styles.smallActionBtnDarkText}>{qrBusy ? "…" : "Erneut scannen"}</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        resetQrState();
                        setLastContactSource("MANUAL");
                      }}
                      disabled={submitting || qrBusy}
                      style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                    >
                      <Text style={styles.smallActionBtnGhostText}>Zurücksetzen</Text>
                    </Pressable>
                  </View>
                </View>
              ) : null}
            </>
          ) : null}

          {form.fields.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.h2}>Keine Felder vorhanden.</Text>
              <Text style={styles.pMuted}>
                Dieses Formular hat keine aktiven Felder. Bitte im Admin prüfen.
              </Text>
            </View>
          ) : currentFields.length === 0 ? (
            <View style={styles.card}>
              <Text style={styles.h2}>
                Keine Felder in „{currentScreen === "CONTACT" ? "Kontakt" : "Felder"}“.
              </Text>
              <Text style={styles.pMuted}>
                Die Zuordnung kommt aus dem Backend über `field.config.section`.
              </Text>
            </View>
          ) : (
            <View style={styles.fieldsWrap}>{currentFields.map(renderField)}</View>
          )}

          {submitError ? (
            <View style={styles.warnInline}>
              <Text style={styles.warnInlineTitle}>Senden fehlgeschlagen</Text>
              <Text style={styles.warnInlineText}>{submitError}</Text>
              {submitTraceId ? <Text style={styles.trace}>traceId: {submitTraceId}</Text> : null}
            </View>
          ) : null}

          <View style={styles.footerCard}>
            {!isFinalStep ? (
              <Pressable
                onPress={goNext}
                disabled={submitting}
                style={[styles.submitBtn, submitting ? styles.submitBtnDisabled : null]}
              >
                <Text style={styles.submitBtnText}>{nextLabel}</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable
                  onPress={() => setCurrentScreen(startScreen)}
                  disabled={submitting}
                  style={[styles.backBtn, submitting ? styles.submitBtnDisabled : null]}
                >
                  <Text style={styles.backBtnText}>Zurück</Text>
                </Pressable>

                <Pressable
                  onPress={submit}
                  disabled={submitting || !form || form.fields.length === 0}
                  style={[styles.submitBtn, submitting ? styles.submitBtnDisabled : null]}
                >
                  <Text style={styles.submitBtnText}>{submitting ? `${submitStage || "Sende"}…` : submitLabel}</Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.pMuted}>
              {currentScreen === "CONTACT" ? "Kontaktdaten" : "Individuelle Formularfelder"}
            </Text>
          </View>
        </ScrollView>
      ) : (
        <View style={styles.center}>
          <Text style={styles.loadingText}>—</Text>
        </View>
      )}
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: UI.padX },
  loadingText: { opacity: 0.7, fontWeight: "800", color: UI.text },

  body: { paddingHorizontal: UI.padX, paddingTop: 14, gap: 12 },

  headerCard: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },

  headerTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  stepBadge: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  stepBadgeText: { fontWeight: "900", color: UI.text, opacity: 0.75 },

  headerRow: { flexDirection: "row", gap: 10, marginTop: 12, flexWrap: "wrap" },
  smallBtn: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 999, alignItems: "center" },
  smallBtnGhost: { backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  smallBtnGhostText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },

  subHint: { marginTop: 10, color: UI.text, opacity: 0.7, fontWeight: "800" },
  subHintStrong: { opacity: 1, fontWeight: "900" },

  segmentWrap: {
    flexDirection: "row",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    overflow: "hidden",
  },
  segmentBtn: { flex: 1, paddingVertical: 10, alignItems: "center", backgroundColor: "rgba(0,0,0,0.02)" },
  segmentBtnActive: { backgroundColor: UI.text },
  segmentText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },
  segmentTextActive: { color: "white" },

  captureGridOnly: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  captureTile: {
    width: "48%",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    padding: 12,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  captureTileActive: { backgroundColor: UI.text, borderColor: UI.text },
  captureTileTitle: { fontWeight: "900", color: UI.text },
  captureTileSub: { marginTop: 4, color: UI.text, opacity: 0.7, fontWeight: "700" },
  captureTileActiveText: { color: "white", opacity: 1 },

  captureReviewBox: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    gap: 10,
  },

  capturePreviewRow: { flexDirection: "row", gap: 12, alignItems: "center" },
  cardPreview: { width: 70, height: 70, borderRadius: 12, borderWidth: 1, borderColor: UI.border },

  smallActionBtn: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12 },
  smallActionBtnDark: { backgroundColor: UI.text },
  smallActionBtnDarkText: { color: "white", fontWeight: "900" },
  smallActionBtnGhost: { backgroundColor: "rgba(17,24,39,0.06)" },
  smallActionBtnGhostText: { fontWeight: "900", color: UI.text },

  statusRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 },
  statusText: { color: "rgba(17,24,39,0.55)", fontWeight: "700" },

  scannerViewport: {
    flex: 1,
    marginHorizontal: 20,
    marginBottom: 20,
    overflow: "hidden",
    borderRadius: 20,
  },
  scannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  scannerFrame: {
    width: "72%",
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.92)",
    backgroundColor: "transparent",
  },
  scannerHintBox: {
    position: "absolute",
    bottom: 22,
    left: 22,
    right: 22,
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "rgba(0,0,0,0.46)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.12)",
  },
  scannerHintTitle: { color: "white", fontWeight: "900" },
  scannerHintText: { color: "rgba(255,255,255,0.8)", marginTop: 4 },

  ocrBox: {
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "rgba(17,24,39,0.03)",
  },
  ocrTitle: { fontWeight: "900", marginBottom: 6, color: UI.text },
  ocrBody: { fontFamily: "monospace", opacity: 0.85, lineHeight: 18, color: UI.text },
  linkText: { fontWeight: "900", color: UI.text },

  qrHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  qrBadge: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  qrBadgeText: { fontWeight: "900", color: UI.text, opacity: 0.7 },

  qrMetaRow: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  qrMetaText: { fontSize: 12, fontWeight: "800", color: UI.text, opacity: 0.7 },

  qrDebugHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    marginBottom: 4,
  },

  qrActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 10 },
  qrActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.05)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  qrActionBtnText: { fontWeight: "900", color: UI.text, opacity: 0.75 },

  fieldsWrap: { gap: 12 },

  card: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },

  fieldCard: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
  },

  fieldRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },

  fieldLabel: { fontWeight: "900", color: UI.text },
  req: { fontWeight: "900", color: UI.text },

  help: { marginTop: 6, opacity: 0.7, color: UI.text, lineHeight: 18 },

  input: {
    marginTop: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: UI.text,
    backgroundColor: "rgba(0,0,0,0.02)",
    fontWeight: "700",
  },
  inputMultiline: { textAlignVertical: "top" },

  optionsWrap: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 10 },
  optionPill: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "rgba(0,0,0,0.02)",
  },
  optionPillSelected: { borderColor: UI.accent, backgroundColor: UI.accent },
  optionText: { fontWeight: "900", color: UI.text, opacity: 0.8 },
  optionTextSelected: { color: "white", opacity: 1 },

  errText: { marginTop: 8, fontWeight: "900", color: "rgba(153,27,27,0.95)" },

  warnCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.25)",
    backgroundColor: "rgba(220,38,38,0.06)",
  },
  warnTitle: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  warnText: { marginTop: 6, color: "rgba(153,27,27,0.95)" },

  warnInline: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.18)",
    backgroundColor: "rgba(220,38,38,0.04)",
  },
  warnInlineTitle: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  warnInlineText: { marginTop: 6, color: "rgba(153,27,27,0.95)" },

  trace: { marginTop: 8, fontFamily: "monospace", opacity: 0.85, color: UI.text },

  row: { flexDirection: "row", gap: 10, marginTop: 12 },

  btn: { flex: 1, paddingVertical: 12, borderRadius: 14, alignItems: "center" },
  btnWide: { marginTop: 10, paddingVertical: 12, borderRadius: 14, alignItems: "center" },

  btnDark: { backgroundColor: UI.text },
  btnDarkText: { color: "white", fontWeight: "900" },

  btnGhost: { backgroundColor: "rgba(0,0,0,0.04)", borderWidth: 1, borderColor: "rgba(0,0,0,0.06)" },
  btnGhostText: { fontWeight: "900", color: "rgba(0,0,0,0.55)" },

  btnDangerGhost: {
    backgroundColor: "rgba(220,38,38,0.06)",
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.18)",
  },
  btnDangerGhostText: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },

  h1: { fontWeight: "900", color: UI.text, fontSize: 18 },
  h2: { fontWeight: "900", color: UI.text },
  p: { marginTop: 8, color: UI.text, opacity: 0.9, lineHeight: 18 },
  pStrong: { color: UI.text, fontWeight: "900" },
  pMuted: { marginTop: 8, color: UI.text, opacity: 0.7, lineHeight: 18 },

  footerCard: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    gap: 10,
  },

  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: UI.text },
  backBtn: { width: 110, paddingVertical: 14, borderRadius: 14, alignItems: "center", borderWidth: 1, borderColor: UI.border },
  backBtnText: { fontWeight: "900", color: UI.text, opacity: 0.75 },

  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "white", fontWeight: "900" },
});
