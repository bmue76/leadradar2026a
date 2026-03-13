import React, { useCallback, useEffect, useMemo, useState } from "react";
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
import * as Clipboard from "expo-clipboard";
import * as Contacts from "expo-contacts";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import {
  apiFetch,
  createLead,
  patchLeadContact,
  storeAttachmentOcrResult,
  uploadLeadAttachment,
  type LeadAttachmentUploadType,
} from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import {
  chooseBestQrCandidate,
  prettyQrPreview,
  seemsWeakText,
  type ParsedQrContactData,
} from "../../src/lib/qrContact";
import { getActiveEventId } from "../../src/lib/eventStorage";
import { recognizeTextFromBusinessCard } from "../../src/ocr/recognizeText";
import { parseBusinessCard } from "../../src/ocr/parseBusinessCard";
import type { ContactSuggestions } from "../../src/ocr/types";
import { NativeQrScannerSheet } from "../../src/features/capture/NativeQrScannerSheet";
import { ScreenScaffold } from "../../src/ui/ScreenScaffold";
import { UI } from "../../src/ui/tokens";

type JsonObject = Record<string, unknown>;
type ScreenSection = "FORM" | "CONTACT";
type ContactPolicy = "NONE" | "EMAIL_OR_PHONE" | "EMAIL" | "PHONE";
type CaptureModeKey = "businessCard" | "qr" | "contacts" | "manual";
type VoiceMemoState = "idle" | "recording" | "preview" | "uploading" | "uploaded" | "error";
type LocalAttachmentKind = "VOICE" | "IMAGE" | "PDF" | "AUDIO_FILE";
type LocalAttachmentSource =
  | "VOICE_RECORDING"
  | "AUDIO_PICKER"
  | "PHOTO_CAMERA"
  | "PHOTO_LIBRARY"
  | "PDF_PICKER";
type LocalAttachmentStatus = "idle" | "uploading" | "uploaded" | "error";
type FieldVariant = "audio" | "attachment" | null;

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

type LocalLeadAttachment = {
  localId: string;
  formFieldKey: string;
  kind: LocalAttachmentKind;
  source: LocalAttachmentSource;
  label: string;
  fileName: string;
  fileUri: string;
  mimeType: string;
  uploadType: LeadAttachmentUploadType;
  sizeBytes?: number | null;
  durationSec?: number | null;
  status: LocalAttachmentStatus;
  attachmentId?: string | null;
  error?: string | null;
};

type AudioFieldConfig = {
  allowRecord: boolean;
  allowPick: boolean;
  maxDurationSec: number;
};

type AttachmentFieldConfig = {
  allowCamera: boolean;
  allowLibrary: boolean;
  allowPdf: boolean;
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

function readFieldVariant(config: unknown): FieldVariant {
  const raw = pickPropString(config, "variant")?.toLowerCase();
  if (raw === "audio") return "audio";
  if (raw === "attachment") return "attachment";
  return null;
}

function readAudioFieldConfig(config: unknown): AudioFieldConfig {
  const audioCfg = isRecord(config) && isRecord(config.audio) ? config.audio : null;

  return {
    allowRecord: typeof audioCfg?.allowRecord === "boolean" ? (audioCfg.allowRecord as boolean) : true,
    allowPick: typeof audioCfg?.allowPick === "boolean" ? (audioCfg.allowPick as boolean) : true,
    maxDurationSec:
      typeof audioCfg?.maxDurationSec === "number" && Number.isFinite(audioCfg.maxDurationSec)
        ? Math.max(1, Math.round(audioCfg.maxDurationSec as number))
        : 60,
  };
}

function readAttachmentFieldConfig(config: unknown): AttachmentFieldConfig {
  const attachmentCfg = isRecord(config) && isRecord(config.attachment) ? config.attachment : null;

  const allowCamera =
    typeof attachmentCfg?.allowCamera === "boolean" ? (attachmentCfg.allowCamera as boolean) : true;

  const allowLibrary =
    typeof attachmentCfg?.allowLibrary === "boolean"
      ? (attachmentCfg.allowLibrary as boolean)
      : typeof attachmentCfg?.allowImageLibrary === "boolean"
        ? (attachmentCfg.allowImageLibrary as boolean)
        : true;

  const allowPdf =
    typeof attachmentCfg?.allowPdf === "boolean"
      ? (attachmentCfg.allowPdf as boolean)
      : typeof attachmentCfg?.allowDocument === "boolean"
        ? (attachmentCfg.allowDocument as boolean)
        : true;

  return { allowCamera, allowLibrary, allowPdf };
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

function stripExtension(name: string): string {
  return name.replace(/\.[^.]+$/g, "");
}

function sanitizeBaseName(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return cleaned || fallback;
}

function guessAudioExtensionFromUri(uri: string): string {
  const ext = uri.split("?")[0].split(".").pop()?.toLowerCase() ?? "";
  if (
    ext === "mp3" ||
    ext === "m4a" ||
    ext === "aac" ||
    ext === "wav" ||
    ext === "webm" ||
    ext === "ogg" ||
    ext === "opus" ||
    ext === "3gp"
  ) {
    return ext;
  }
  return "m4a";
}

function guessAudioMimeTypeFromUri(uri: string): string {
  const ext = guessAudioExtensionFromUri(uri);
  switch (ext) {
    case "mp3":
      return "audio/mpeg";
    case "m4a":
      return "audio/mp4";
    case "aac":
      return "audio/aac";
    case "wav":
      return "audio/wav";
    case "webm":
      return "audio/webm";
    case "ogg":
      return "audio/ogg";
    case "opus":
      return "audio/opus";
    case "3gp":
      return "audio/3gpp";
    default:
      return "audio/mp4";
  }
}

function formatDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(seconds ?? 0));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatBytes(bytes: number | null | undefined): string | null {
  if (typeof bytes !== "number" || !Number.isFinite(bytes) || bytes <= 0) return null;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function attachmentStatusLabel(status: LocalAttachmentStatus): string {
  switch (status) {
    case "uploading":
      return "Upload läuft";
    case "uploaded":
      return "Hochgeladen";
    case "error":
      return "Fehler";
    default:
      return "Bereit";
  }
}

function voiceStateLabel(state: VoiceMemoState): string {
  switch (state) {
    case "recording":
      return "Aufnahme läuft";
    case "preview":
      return "Bereit zur Prüfung";
    case "uploading":
      return "Upload läuft";
    case "uploaded":
      return "Hochgeladen";
    case "error":
      return "Fehler";
    default:
      return "Noch keine Sprachnachricht";
  }
}

function attachmentKindLabel(kind: LocalAttachmentKind): string {
  switch (kind) {
    case "VOICE":
      return "Sprachnotiz";
    case "AUDIO_FILE":
      return "Audio-Datei";
    case "PDF":
      return "PDF";
    default:
      return "Bild";
  }
}

function summarizeAttachmentNames(items: LocalLeadAttachment[]): string {
  return items.map((item) => item.fileName).join(", ");
}

async function normalizeImageAssetToAttachment(args: {
  asset: ImagePicker.ImagePickerAsset;
  source: LocalAttachmentSource;
  formFieldKey: string;
  label: string;
}): Promise<LocalLeadAttachment> {
  const manipulated = await ImageManipulator.manipulateAsync(
    args.asset.uri,
    [{ resize: { width: 2048 } }],
    { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG }
  );

  const base = sanitizeBaseName(stripExtension(args.asset.fileName ?? "bild"), "bild");

  return {
    localId: uuidv4(),
    formFieldKey: args.formFieldKey,
    kind: "IMAGE",
    source: args.source,
    label: args.label,
    fileName: `${base}-${Date.now()}.jpg`,
    fileUri: manipulated.uri,
    mimeType: "image/jpeg",
    uploadType: "IMAGE",
    sizeBytes: typeof args.asset.fileSize === "number" ? args.asset.fileSize : null,
    durationSec: null,
    status: "idle",
    attachmentId: null,
    error: null,
  };
}

function createPdfAttachment(args: {
  asset: DocumentPicker.DocumentPickerAsset;
  formFieldKey: string;
  label: string;
}): LocalLeadAttachment {
  const base = sanitizeBaseName(stripExtension(args.asset.name ?? "dokument"), "dokument");

  return {
    localId: uuidv4(),
    formFieldKey: args.formFieldKey,
    kind: "PDF",
    source: "PDF_PICKER",
    label: args.label,
    fileName: `${base}.pdf`,
    fileUri: args.asset.uri,
    mimeType: args.asset.mimeType || "application/pdf",
    uploadType: "PDF",
    sizeBytes: typeof args.asset.size === "number" ? args.asset.size : null,
    durationSec: null,
    status: "idle",
    attachmentId: null,
    error: null,
  };
}

function createPickedAudioAttachment(args: {
  asset: DocumentPicker.DocumentPickerAsset;
  formFieldKey: string;
  label: string;
}): LocalLeadAttachment {
  const ext = guessAudioExtensionFromUri(args.asset.uri);
  const fallbackBase = sanitizeBaseName(stripExtension(args.asset.name ?? "audio"), "audio");
  const fileName =
    args.asset.name && args.asset.name.trim().length > 0 ? args.asset.name.trim() : `${fallbackBase}.${ext}`;

  return {
    localId: uuidv4(),
    formFieldKey: args.formFieldKey,
    kind: "AUDIO_FILE",
    source: "AUDIO_PICKER",
    label: args.label,
    fileName,
    fileUri: args.asset.uri,
    mimeType: args.asset.mimeType || guessAudioMimeTypeFromUri(args.asset.uri),
    uploadType: "OTHER",
    sizeBytes: typeof args.asset.size === "number" ? args.asset.size : null,
    durationSec: null,
    status: "idle",
    attachmentId: null,
    error: null,
  };
}

function createRecordedAudioAttachment(args: {
  uri: string;
  durationSec: number;
  formFieldKey: string;
  label: string;
}): LocalLeadAttachment {
  const extension = guessAudioExtensionFromUri(args.uri);
  return {
    localId: uuidv4(),
    formFieldKey: args.formFieldKey,
    kind: "VOICE",
    source: "VOICE_RECORDING",
    label: args.label,
    fileName: `voice-memo-${Date.now()}.${extension}`,
    fileUri: args.uri,
    mimeType: guessAudioMimeTypeFromUri(args.uri),
    uploadType: "OTHER",
    sizeBytes: null,
    durationSec: Math.max(1, args.durationSec),
    status: "idle",
    attachmentId: null,
    error: null,
  };
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
  const [submitInfo, setSubmitInfo] = useState<string>("");
  const [submitTraceId, setSubmitTraceId] = useState<string>("");
  const [submitStage, setSubmitStage] = useState<string>("");
  const [completedLeadId, setCompletedLeadId] = useState<string>("");

  const [currentScreen, setCurrentScreen] = useState<ScreenSection>("FORM");

  const [activeCaptureMode, setActiveCaptureMode] = useState<CaptureModeKey>("manual");
  const [lastContactSource, setLastContactSource] = useState<"OCR_MOBILE" | "QR_VCARD" | "MANUAL">("MANUAL");

  const [scannerOpen, setScannerOpen] = useState(false);

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

  const [audioFieldItems, setAudioFieldItems] = useState<Record<string, LocalLeadAttachment | null>>({});
  const [audioFieldStates, setAudioFieldStates] = useState<Record<string, VoiceMemoState>>({});
  const [audioFieldErrors, setAudioFieldErrors] = useState<Record<string, string>>({});
  const [attachmentFieldItems, setAttachmentFieldItems] = useState<Record<string, LocalLeadAttachment[]>>({});
  const [recordingFieldKey, setRecordingFieldKey] = useState<string | null>(null);
  const [activeAudioFieldKey, setActiveAudioFieldKey] = useState<string | null>(null);
  const [playbackRequestFieldKey, setPlaybackRequestFieldKey] = useState<string | null>(null);

  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const audioRecorderState = useAudioRecorderState(audioRecorder);
  const activeAudioUri = activeAudioFieldKey ? audioFieldItems[activeAudioFieldKey]?.fileUri ?? null : null;
  const audioPlayer = useAudioPlayer(activeAudioUri ?? null, { updateInterval: 500 });
  const audioPlayerStatus = useAudioPlayerStatus(audioPlayer);

  const audioPlayerStatusSafe = audioPlayerStatus as {
    playing?: boolean;
    currentTime?: number;
    duration?: number;
  };
  const audioIsPlaying = Boolean(audioPlayerStatusSafe.playing);
  const audioCurrentTimeSec =
    typeof audioPlayerStatusSafe.currentTime === "number" ? audioPlayerStatusSafe.currentTime : 0;
  const audioDurationFromPlayer =
    typeof audioPlayerStatusSafe.duration === "number" ? audioPlayerStatusSafe.duration : 0;
  const recorderDurationMillis =
    typeof (audioRecorderState as { durationMillis?: number }).durationMillis === "number"
      ? ((audioRecorderState as { durationMillis?: number }).durationMillis as number)
      : 0;
  const recorderDurationSec = Math.max(0, Math.round(recorderDurationMillis / 1000));

  const title = useMemo(() => (form ? form.name : "Formular"), [form]);

  const resetQrState = useCallback(() => {
    setQrRawText("");
    setQrDebugHint("");
    setQrDebugExpanded(false);
    setQrParsedSummary("");
    setQrFormatLabel("");
    setQrConfidenceLabel("");
    setQrDecodeMode("");
  }, []);

  useEffect(() => {
    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeAudioFieldKey) return;
    if (audioFieldItems[activeAudioFieldKey]) return;

    try {
      audioPlayer.pause();
      audioPlayer.seekTo(0);
    } catch {
      // ignore
    }

    setActiveAudioFieldKey(null);
  }, [activeAudioFieldKey, audioFieldItems, audioPlayer]);

  useEffect(() => {
    if (!playbackRequestFieldKey) return;
    if (!activeAudioFieldKey) return;
    if (activeAudioFieldKey !== playbackRequestFieldKey) return;
    if (!activeAudioUri) return;

    try {
      audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch {
      // ignore
    } finally {
      setPlaybackRequestFieldKey(null);
    }
  }, [activeAudioFieldKey, activeAudioUri, audioPlayer, playbackRequestFieldKey]);

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

  const resetFieldMediaState = useCallback(() => {
    try {
      audioPlayer.pause();
      audioPlayer.seekTo(0);
    } catch {
      // ignore
    }

    setAudioFieldItems({});
    setAudioFieldStates({});
    setAudioFieldErrors({});
    setAttachmentFieldItems({});
    setRecordingFieldKey(null);
    setActiveAudioFieldKey(null);
    setPlaybackRequestFieldKey(null);
  }, [audioPlayer]);

  const load = useCallback(async () => {
    setLoadErrorTitle("");
    setLoadErrorDetail("");
    setLoadTraceId("");
    setSubmitError("");
    setSubmitInfo("");
    setSubmitTraceId("");
    setSubmitStage("");
    setCompletedLeadId("");
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
      resetFieldMediaState();
      resetQrState();
      setLastContactSource("MANUAL");
    } finally {
      setLoading(false);
    }
  }, [eventIdParam, formId, handleApiErrorRedirects, resetFieldMediaState, resetQrState]);

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
  const actionLocked = submitting || Boolean(completedLeadId);

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

  const setAudioFieldItem = useCallback(
    (fieldKey: string, item: LocalLeadAttachment | null) => {
      setAudioFieldItems((prev) => ({ ...prev, [fieldKey]: item }));
      updateValue(fieldKey, item ? item.fileName : "");
    },
    [updateValue]
  );

  const setAudioFieldState = useCallback((fieldKey: string, state: VoiceMemoState) => {
    setAudioFieldStates((prev) => ({ ...prev, [fieldKey]: state }));
  }, []);

  const setAudioFieldError = useCallback((fieldKey: string, message: string) => {
    setAudioFieldErrors((prev) => ({ ...prev, [fieldKey]: message }));
  }, []);

  const clearAudioFieldError = useCallback((fieldKey: string) => {
    setAudioFieldErrors((prev) => {
      if (!prev[fieldKey]) return prev;
      const copy = { ...prev };
      delete copy[fieldKey];
      return copy;
    });
  }, []);

  const setAttachmentItemsForField = useCallback(
    (fieldKey: string, items: LocalLeadAttachment[]) => {
      setAttachmentFieldItems((prev) => ({ ...prev, [fieldKey]: items }));
      updateValue(fieldKey, summarizeAttachmentNames(items));
    },
    [updateValue]
  );

  const patchAttachmentItem = useCallback((fieldKey: string, localId: string, patch: Partial<LocalLeadAttachment>) => {
    setAttachmentFieldItems((prev) => {
      const current = prev[fieldKey] ?? [];
      return {
        ...prev,
        [fieldKey]: current.map((item) => (item.localId === localId ? { ...item, ...patch } : item)),
      };
    });
  }, []);

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

    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "QR-Scan ist auf Web nicht verfügbar.");
      return;
    }

    setScannerOpen(true);
  }, [resetQrState]);

  const handleNativeQrDetected = useCallback(
    (rawCandidates: string[]) => {
      const best = chooseBestQrCandidate(rawCandidates);

      setQrRawText(best.rawText);
      setQrParsedSummary(best.summary);
      setQrFormatLabel(labelQrFormat(best.format));
      setQrConfidenceLabel(labelQrConfidence(best.confidence));
      setQrDecodeMode("Native");

      setScannerOpen(false);

      if (!shouldApplyQrSuggestions(best)) {
        setQrDebugHint("QR erkannt, aber keine vollständigen Kontaktdaten lesbar.");
        Alert.alert(
          "QR-Code erkannt",
          "Wir konnten daraus keine vollständigen Kontaktdaten übernehmen. Bitte nochmals ruhiger scannen oder alternativ Visitenkarte bzw. Kontakte verwenden."
        );
        return;
      }

      setQrDebugHint(best.summary ? `Kontakt erkannt: ${best.summary}` : "Kontakt aus QR übernommen.");
      applySuggestions(best.suggestions, "QR_VCARD");
    },
    [applySuggestions]
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
    setSubmitInfo("");
    setSubmitTraceId("");
    setSubmitStage("");
    setCompletedLeadId("");
    resetCaptureState();
    resetFieldMediaState();
    setCurrentScreen(startScreen);
  }, [form, resetCaptureState, resetFieldMediaState, startScreen]);

  const goNext = useCallback(() => {
    const errs = validateFields(currentFields, values);
    setErrors((prev) => ({ ...prev, ...errs }));

    if (Object.keys(errs).length > 0) return;
    setCurrentScreen(secondScreen);
  }, [currentFields, secondScreen, values]);

  const startAudioRecordingForField = useCallback(
    async (field: FormFieldDTO) => {
      if (Platform.OS === "web") {
        Alert.alert("Nicht verfügbar", "Audio-Aufnahme ist auf Web nicht verfügbar.");
        return;
      }

      if (actionLocked) return;

      if (recordingFieldKey && recordingFieldKey !== field.key) {
        Alert.alert("Aufnahme läuft", "Bitte zuerst die aktuelle Aufnahme stoppen.");
        return;
      }

      const audioCfg = readAudioFieldConfig(field.config);

      try {
        const perm = await AudioModule.requestRecordingPermissionsAsync();
        if (!perm.granted) {
          setAudioFieldState(field.key, "error");
          setAudioFieldError(field.key, "Mikrofon-Zugriff wurde nicht erlaubt.");
          return;
        }

        try {
          audioPlayer.pause();
          audioPlayer.seekTo(0);
        } catch {
          // ignore
        }

        setActiveAudioFieldKey(null);
        setPlaybackRequestFieldKey(null);
        setAudioFieldItem(field.key, null);
        clearAudioFieldError(field.key);
        setAudioFieldState(field.key, "recording");
        setRecordingFieldKey(field.key);

        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: true,
        });

        await audioRecorder.prepareToRecordAsync();
        audioRecorder.record();

        if (audioCfg.maxDurationSec > 0) {
          // maxDuration currently only informative in UI; hard stop can follow later if needed.
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Aufnahme konnte nicht gestartet werden.";
        setRecordingFieldKey(null);
        setAudioFieldState(field.key, "error");
        setAudioFieldError(field.key, msg || "Aufnahme konnte nicht gestartet werden.");
      }
    },
    [
      actionLocked,
      audioPlayer,
      audioRecorder,
      clearAudioFieldError,
      recordingFieldKey,
      setAudioFieldError,
      setAudioFieldItem,
      setAudioFieldState,
    ]
  );

  const stopAudioRecordingForField = useCallback(
    async (field: FormFieldDTO) => {
      if (recordingFieldKey !== field.key) return;

      try {
        await audioRecorder.stop();
        await setAudioModeAsync({
          playsInSilentMode: true,
          allowsRecording: false,
        });

        const uri =
          typeof (audioRecorder as { uri?: string | null }).uri === "string"
            ? (((audioRecorder as { uri?: string | null }).uri as string) || "")
            : "";

        if (!uri) {
          setRecordingFieldKey(null);
          setAudioFieldState(field.key, "error");
          setAudioFieldError(field.key, "Aufnahme wurde gestoppt, aber die Datei ist nicht verfügbar.");
          return;
        }

        const item = createRecordedAudioAttachment({
          uri,
          durationSec: recorderDurationSec,
          formFieldKey: field.key,
          label: field.label,
        });

        setAudioFieldItem(field.key, item);
        clearAudioFieldError(field.key);
        setAudioFieldState(field.key, "preview");
        setRecordingFieldKey(null);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Aufnahme konnte nicht gestoppt werden.";
        setRecordingFieldKey(null);
        setAudioFieldState(field.key, "error");
        setAudioFieldError(field.key, msg || "Aufnahme konnte nicht gestoppt werden.");
      }
    },
    [
      audioRecorder,
      clearAudioFieldError,
      recorderDurationSec,
      recordingFieldKey,
      setAudioFieldError,
      setAudioFieldItem,
      setAudioFieldState,
    ]
  );

  const pickAudioFileForField = useCallback(
    async (field: FormFieldDTO) => {
      if (actionLocked) return;

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: ["audio/*"],
          multiple: false,
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) return;

        const item = createPickedAudioAttachment({
          asset: result.assets[0],
          formFieldKey: field.key,
          label: field.label,
        });

        setAudioFieldItem(field.key, item);
        clearAudioFieldError(field.key);
        setAudioFieldState(field.key, "preview");
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Audio-Datei konnte nicht gewählt werden.";
        setAudioFieldState(field.key, "error");
        setAudioFieldError(field.key, msg || "Audio-Datei konnte nicht gewählt werden.");
      }
    },
    [actionLocked, clearAudioFieldError, setAudioFieldError, setAudioFieldItem, setAudioFieldState]
  );

  const clearAudioField = useCallback(
    (fieldKey: string) => {
      if (activeAudioFieldKey === fieldKey) {
        try {
          audioPlayer.pause();
          audioPlayer.seekTo(0);
        } catch {
          // ignore
        }
        setActiveAudioFieldKey(null);
        setPlaybackRequestFieldKey(null);
      }

      if (recordingFieldKey === fieldKey) {
        setRecordingFieldKey(null);
      }

      setAudioFieldItem(fieldKey, null);
      setAudioFieldState(fieldKey, "idle");
      clearAudioFieldError(fieldKey);
    },
    [
      activeAudioFieldKey,
      audioPlayer,
      clearAudioFieldError,
      recordingFieldKey,
      setAudioFieldItem,
      setAudioFieldState,
    ]
  );

  const toggleAudioPlaybackForField = useCallback(
    (fieldKey: string) => {
      const item = audioFieldItems[fieldKey];
      if (!item) return;

      if (activeAudioFieldKey === fieldKey) {
        try {
          if (audioIsPlaying) {
            audioPlayer.pause();
          } else {
            const effectiveDuration = audioDurationFromPlayer || item.durationSec || 0;
            if (effectiveDuration > 0 && audioCurrentTimeSec >= Math.max(effectiveDuration - 0.2, 0)) {
              audioPlayer.seekTo(0);
            }
            audioPlayer.play();
          }
        } catch {
          Alert.alert("Wiedergabe nicht möglich", "Die Audio-Datei konnte nicht abgespielt werden.");
        }
        return;
      }

      setActiveAudioFieldKey(fieldKey);
      setPlaybackRequestFieldKey(fieldKey);
    },
    [
      activeAudioFieldKey,
      audioCurrentTimeSec,
      audioDurationFromPlayer,
      audioFieldItems,
      audioIsPlaying,
      audioPlayer,
    ]
  );

  const addImageToAttachmentField = useCallback(
    async (field: FormFieldDTO, source: "camera" | "library") => {
      if (actionLocked) return;

      if (source === "camera" && Platform.OS === "web") {
        Alert.alert("Nicht verfügbar", "Fotoaufnahme ist auf Web nicht verfügbar.");
        return;
      }

      if (source === "camera") {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert("Kamera erforderlich", "Bitte Kamera-Zugriff erlauben.");
          return;
        }

        const result = await ImagePicker.launchCameraAsync({
          quality: 1,
          allowsEditing: false,
          base64: false,
        });

        if (result.canceled || !result.assets?.length) return;

        try {
          const item = await normalizeImageAssetToAttachment({
            asset: result.assets[0],
            source: "PHOTO_CAMERA",
            formFieldKey: field.key,
            label: field.label,
          });
          const next = [...(attachmentFieldItems[field.key] ?? []), item];
          setAttachmentItemsForField(field.key, next);
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : "Foto konnte nicht vorbereitet werden.";
          Alert.alert("Foto fehlgeschlagen", msg || "Foto konnte nicht vorbereitet werden.");
        }
        return;
      }

      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Fotos erforderlich", "Bitte Fotos-Zugriff erlauben.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 1,
        allowsEditing: false,
        base64: false,
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
      });

      if (result.canceled || !result.assets?.length) return;

      try {
        const item = await normalizeImageAssetToAttachment({
          asset: result.assets[0],
          source: "PHOTO_LIBRARY",
          formFieldKey: field.key,
          label: field.label,
        });
        const next = [...(attachmentFieldItems[field.key] ?? []), item];
        setAttachmentItemsForField(field.key, next);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "Bild konnte nicht vorbereitet werden.";
        Alert.alert("Bild fehlgeschlagen", msg || "Bild konnte nicht vorbereitet werden.");
      }
    },
    [actionLocked, attachmentFieldItems, setAttachmentItemsForField]
  );

  const addPdfToAttachmentField = useCallback(
    async (field: FormFieldDTO) => {
      if (actionLocked) return;

      try {
        const result = await DocumentPicker.getDocumentAsync({
          type: "application/pdf",
          multiple: false,
          copyToCacheDirectory: true,
        });

        if (result.canceled || !result.assets?.length) return;

        const item = createPdfAttachment({
          asset: result.assets[0],
          formFieldKey: field.key,
          label: field.label,
        });

        const next = [...(attachmentFieldItems[field.key] ?? []), item];
        setAttachmentItemsForField(field.key, next);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : "PDF konnte nicht gewählt werden.";
        Alert.alert("PDF fehlgeschlagen", msg || "PDF konnte nicht gewählt werden.");
      }
    },
    [actionLocked, attachmentFieldItems, setAttachmentItemsForField]
  );

  const removeAttachmentFromField = useCallback(
    (fieldKey: string, localId: string) => {
      const current = attachmentFieldItems[fieldKey] ?? [];
      const next = current.filter((item) => item.localId !== localId);
      setAttachmentItemsForField(fieldKey, next);
    },
    [attachmentFieldItems, setAttachmentItemsForField]
  );

  const submit = useCallback(async () => {
    if (!form) return;
    if (completedLeadId) {
      Alert.alert("Lead bereits gespeichert", "Bitte zuerst einen neuen Lead starten.");
      return;
    }

    setSubmitError("");
    setSubmitInfo("");
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

      const failAfterLead = async (message: string, traceId?: string) => {
        setCompletedLeadId(leadId);
        setSubmitTraceId(traceId ?? "");
        setSubmitInfo(`${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        Alert.alert("Lead gespeichert, Folgeaktion fehlgeschlagen", message);
      };

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

          await failAfterLead("Visitenkarten-Attachment Upload fehlgeschlagen.", attRes.traceId);
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

          await failAfterLead("OCR-Ergebnis konnte nicht gespeichert werden.", ocrStoreRes.traceId);
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

          await failAfterLead("Kontakt konnte nicht übernommen werden.", pr.traceId);
          return;
        }
      }

      const uploadQueue: LocalLeadAttachment[] = [
        ...Object.values(audioFieldItems).filter((item): item is LocalLeadAttachment => Boolean(item)),
        ...Object.values(attachmentFieldItems).flat(),
      ];

      const uploadFailures: string[] = [];
      let uploadIndex = 0;

      for (const item of uploadQueue) {
        uploadIndex += 1;
        setSubmitStage(uploadQueue.length > 1 ? `Anhang ${uploadIndex}/${uploadQueue.length}` : "Anhang");

        if (item.kind === "VOICE" || item.kind === "AUDIO_FILE") {
          setAudioFieldState(item.formFieldKey, "uploading");
          clearAudioFieldError(item.formFieldKey);
          setAudioFieldItems((prev) => ({
            ...prev,
            [item.formFieldKey]: prev[item.formFieldKey]
              ? { ...(prev[item.formFieldKey] as LocalLeadAttachment), status: "uploading", error: null }
              : prev[item.formFieldKey],
          }));
        } else {
          patchAttachmentItem(item.formFieldKey, item.localId, { status: "uploading", error: null });
        }

        const attRes = await uploadLeadAttachment({
          apiKey: key,
          leadId,
          fileUri: item.fileUri,
          mimeType: item.mimeType,
          fileName: item.fileName,
          type: item.uploadType,
        });

        if (!attRes.ok) {
          const redirected = await handleApiErrorRedirects({ status: attRes.status, code: attRes.code });
          if (redirected) return;

          const message = `${item.label}: ${attRes.message}${attRes.traceId ? ` (traceId: ${attRes.traceId})` : ""}`;
          uploadFailures.push(message);

          if (item.kind === "VOICE" || item.kind === "AUDIO_FILE") {
            setAudioFieldState(item.formFieldKey, "error");
            setAudioFieldError(item.formFieldKey, message);
            setAudioFieldItems((prev) => ({
              ...prev,
              [item.formFieldKey]: prev[item.formFieldKey]
                ? { ...(prev[item.formFieldKey] as LocalLeadAttachment), status: "error", error: message }
                : prev[item.formFieldKey],
            }));
          } else {
            patchAttachmentItem(item.formFieldKey, item.localId, { status: "error", error: message });
          }

          continue;
        }

        if (item.kind === "VOICE" || item.kind === "AUDIO_FILE") {
          setAudioFieldState(item.formFieldKey, "uploaded");
          setAudioFieldItems((prev) => ({
            ...prev,
            [item.formFieldKey]: prev[item.formFieldKey]
              ? {
                  ...(prev[item.formFieldKey] as LocalLeadAttachment),
                  status: "uploaded",
                  attachmentId: attRes.data.attachmentId,
                  error: null,
                }
              : prev[item.formFieldKey],
          }));
        } else {
          patchAttachmentItem(item.formFieldKey, item.localId, {
            status: "uploaded",
            attachmentId: attRes.data.attachmentId,
            error: null,
          });
        }
      }

      if (uploadFailures.length > 0) {
        setCompletedLeadId(leadId);
        const message = `Lead wurde gespeichert, aber ${uploadFailures.length} Upload(s) sind fehlgeschlagen.`;
        setSubmitInfo(`${message} ${uploadFailures.join(" · ")}`);
        Alert.alert("Lead gespeichert, Upload unvollständig", message);
        return;
      }

      Alert.alert("Gespeichert.", deduped ? "Lead war bereits vorhanden (Dedup)." : "Lead wurde erfasst.");
      resetAll();
    } finally {
      setSubmitting(false);
      setSubmitStage("");
    }
  }, [
    attachmentFieldItems,
    audioFieldItems,
    cardMime,
    cardName,
    cardUri,
    clearAudioFieldError,
    completedLeadId,
    contactFields,
    contactPolicy,
    eventId,
    form,
    handleApiErrorRedirects,
    lastContactSource,
    ocrBlocks,
    ocrRawText,
    patchAttachmentItem,
    resetAll,
    setAudioFieldError,
    setAudioFieldState,
    values,
  ]);

  const renderField = useCallback(
    (f: FormFieldDTO) => {
      const err = errors[f.key];
      const requiredMark = f.required ? " *" : "";
      const help = f.helpText && f.helpText.trim() ? f.helpText.trim() : null;
      const variant = readFieldVariant(f.config);

      if (f.type === "TEXT" && variant === "audio") {
        const audioCfg = readAudioFieldConfig(f.config);
        const item = audioFieldItems[f.key] ?? null;
        const state =
          recordingFieldKey === f.key
            ? "recording"
            : audioFieldStates[f.key] ?? (item ? "preview" : "idle");
        const audioErr = audioFieldErrors[f.key] ?? "";
        const isActiveAudio = activeAudioFieldKey === f.key;
        const isPlaying = isActiveAudio && audioIsPlaying;
        const currentTime = isActiveAudio ? audioCurrentTimeSec : 0;
        const duration = Math.max(isActiveAudio ? audioDurationFromPlayer : 0, item?.durationSec ?? 0);

        return (
          <View key={f.key} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {f.label}
              <Text style={styles.req}>{requiredMark}</Text>
            </Text>

            {help ? <Text style={styles.help}>{help}</Text> : null}

            <View style={styles.inlineMediaCard}>
              <View style={styles.inlineMediaHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inlineMediaTitle}>Sprachnotiz</Text>
                  <Text style={styles.inlineMediaMeta}>
                    Status: {voiceStateLabel(state as VoiceMemoState)}
                    {audioCfg.maxDurationSec > 0 ? ` · max. ${audioCfg.maxDurationSec}s` : ""}
                  </Text>
                </View>

                <View
                  style={[
                    styles.statusPill,
                    state === "recording"
                      ? styles.statusPillAccent
                      : state === "uploaded"
                        ? styles.statusPillSuccess
                        : state === "error"
                          ? styles.statusPillError
                          : null,
                  ]}
                >
                  <Text
                    style={[
                      styles.statusPillText,
                      state === "recording" || state === "uploaded" ? styles.statusPillTextInverted : null,
                      state === "error" ? styles.statusPillTextError : null,
                    ]}
                  >
                    {voiceStateLabel(state as VoiceMemoState)}
                  </Text>
                </View>
              </View>

              {state === "recording" ? (
                <View style={styles.voiceRecordingBox}>
                  <View style={styles.voiceRecordingRow}>
                    <View style={styles.recordingDot} />
                    <Text style={styles.voiceTimer}>{formatDuration(recorderDurationSec)}</Text>
                  </View>

                  <View style={styles.inlineActionsRow}>
                    <Pressable
                      onPress={() => void stopAudioRecordingForField(f)}
                      disabled={actionLocked}
                      style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                    >
                      <Text style={styles.smallActionBtnDarkText}>Stoppen</Text>
                    </Pressable>
                  </View>
                </View>
              ) : item ? (
                <View style={styles.voicePreviewBox}>
                  <Text style={styles.attachmentName}>{item.fileName}</Text>
                  <Text style={styles.attachmentMeta}>
                    {attachmentKindLabel(item.kind)}
                    {item.durationSec ? ` · ${formatDuration(item.durationSec)}` : ""}
                  </Text>

                  <View style={styles.voiceProgressWrap}>
                    <Text style={styles.voiceProgressText}>
                      {formatDuration(currentTime)} / {formatDuration(duration)}
                    </Text>
                  </View>

                  <View style={styles.inlineActionsRow}>
                    <Pressable
                      onPress={() => toggleAudioPlaybackForField(f.key)}
                      disabled={state === "uploading"}
                      style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                    >
                      <Text style={styles.smallActionBtnDarkText}>{isPlaying ? "Pause" : "Prüfen"}</Text>
                    </Pressable>

                    {audioCfg.allowRecord ? (
                      <Pressable
                        onPress={() => void startAudioRecordingForField(f)}
                        disabled={actionLocked || (recordingFieldKey !== null && recordingFieldKey !== f.key)}
                        style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                      >
                        <Text style={styles.smallActionBtnGhostText}>Neu aufnehmen</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() => clearAudioField(f.key)}
                      disabled={actionLocked}
                      style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                    >
                      <Text style={styles.smallActionBtnGhostText}>Entfernen</Text>
                    </Pressable>
                  </View>
                </View>
              ) : (
                <View style={styles.inlineMediaEmpty}>
                  <Text style={styles.pMutedCompact}>Noch keine Audiodatei erfasst.</Text>

                  <View style={styles.inlineActionsRow}>
                    {audioCfg.allowRecord ? (
                      <Pressable
                        onPress={() => void startAudioRecordingForField(f)}
                        disabled={actionLocked || (recordingFieldKey !== null && recordingFieldKey !== f.key)}
                        style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                      >
                        <Text style={styles.smallActionBtnDarkText}>Aufnehmen</Text>
                      </Pressable>
                    ) : null}

                    {audioCfg.allowPick ? (
                      <Pressable
                        onPress={() => void pickAudioFileForField(f)}
                        disabled={actionLocked || recordingFieldKey !== null}
                        style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                      >
                        <Text style={styles.smallActionBtnGhostText}>Audio wählen</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
              )}

              {audioErr ? (
                <View style={styles.warnInlineCompact}>
                  <Text style={styles.warnInlineTitle}>Audio</Text>
                  <Text style={styles.warnInlineText}>{audioErr}</Text>
                </View>
              ) : null}
            </View>

            {err ? <Text style={styles.errText}>{err}</Text> : null}
          </View>
        );
      }

      if (f.type === "TEXT" && variant === "attachment") {
        const attachmentCfg = readAttachmentFieldConfig(f.config);
        const items = attachmentFieldItems[f.key] ?? [];

        return (
          <View key={f.key} style={styles.fieldCard}>
            <Text style={styles.fieldLabel}>
              {f.label}
              <Text style={styles.req}>{requiredMark}</Text>
            </Text>

            {help ? <Text style={styles.help}>{help}</Text> : null}

            <View style={styles.inlineMediaCard}>
              <View style={styles.inlineMediaHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inlineMediaTitle}>Anhänge</Text>
                  <Text style={styles.inlineMediaMeta}>Bild/Foto und PDF hinzufügen.</Text>
                </View>
              </View>

              <View style={styles.attachmentActionsWrap}>
                {attachmentCfg.allowCamera ? (
                  <Pressable
                    onPress={() => void addImageToAttachmentField(f, "camera")}
                    disabled={actionLocked}
                    style={[styles.attachmentActionBtn, styles.attachmentActionBtnDark]}
                  >
                    <Text style={styles.attachmentActionBtnDarkText}>Foto aufnehmen</Text>
                  </Pressable>
                ) : null}

                {attachmentCfg.allowLibrary ? (
                  <Pressable
                    onPress={() => void addImageToAttachmentField(f, "library")}
                    disabled={actionLocked}
                    style={[styles.attachmentActionBtn, styles.attachmentActionBtnGhost]}
                  >
                    <Text style={styles.attachmentActionBtnGhostText}>Bild wählen</Text>
                  </Pressable>
                ) : null}

                {attachmentCfg.allowPdf ? (
                  <Pressable
                    onPress={() => void addPdfToAttachmentField(f)}
                    disabled={actionLocked}
                    style={[styles.attachmentActionBtn, styles.attachmentActionBtnGhost]}
                  >
                    <Text style={styles.attachmentActionBtnGhostText}>PDF wählen</Text>
                  </Pressable>
                ) : null}
              </View>

              {items.length === 0 ? (
                <Text style={styles.pMutedCompact}>Noch keine Anhänge gewählt.</Text>
              ) : (
                <View style={styles.attachmentList}>
                  {items.map((item) => {
                    const metaParts = [
                      attachmentKindLabel(item.kind),
                      formatBytes(item.sizeBytes),
                    ].filter(Boolean);

                    return (
                      <View key={item.localId} style={styles.attachmentRow}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <Text style={styles.attachmentName}>{item.fileName}</Text>
                          <Text style={styles.attachmentMeta}>
                            {metaParts.length > 0 ? metaParts.join(" · ") : "Bereit"}
                          </Text>
                          {item.error ? <Text style={styles.errTextCompact}>{item.error}</Text> : null}
                        </View>

                        <View style={styles.attachmentRowActions}>
                          <View
                            style={[
                              styles.statusPill,
                              item.status === "uploading"
                                ? styles.statusPillAccent
                                : item.status === "uploaded"
                                  ? styles.statusPillSuccess
                                  : item.status === "error"
                                    ? styles.statusPillError
                                    : null,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                item.status === "uploading" || item.status === "uploaded"
                                  ? styles.statusPillTextInverted
                                  : null,
                                item.status === "error" ? styles.statusPillTextError : null,
                              ]}
                            >
                              {attachmentStatusLabel(item.status)}
                            </Text>
                          </View>

                          {!completedLeadId && item.status !== "uploading" ? (
                            <Pressable
                              onPress={() => removeAttachmentFromField(f.key, item.localId)}
                              disabled={actionLocked}
                              style={[styles.smallActionBtn, styles.smallActionBtnGhost]}
                            >
                              <Text style={styles.smallActionBtnGhostText}>Entfernen</Text>
                            </Pressable>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {err ? <Text style={styles.errText}>{err}</Text> : null}
          </View>
        );
      }

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
                        if (submitting || completedLeadId) return;
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
            editable={!submitting && !completedLeadId}
          />

          {err ? <Text style={styles.errText}>{err}</Text> : null}
        </View>
      );
    },
    [
      activeAudioFieldKey,
      actionLocked,
      addImageToAttachmentField,
      addPdfToAttachmentField,
      attachmentFieldItems,
      audioCurrentTimeSec,
      audioDurationFromPlayer,
      audioFieldErrors,
      audioFieldItems,
      audioFieldStates,
      audioIsPlaying,
      clearAudioField,
      completedLeadId,
      errors,
      pickAudioFileForField,
      recorderDurationSec,
      recordingFieldKey,
      removeAttachmentFromField,
      startAudioRecordingForField,
      stopAudioRecordingForField,
      submitting,
      toggleAudioPlaybackForField,
      toggleMulti,
      updateValue,
      values,
    ]
  );

  const rawPreview = useMemo(() => {
    const txt = (ocrRawText || "").trim();
    if (!txt) return "";
    const lines = txt
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (rawExpanded) return lines.join("\n");
    return lines.slice(0, 6).join("\n");
  }, [ocrRawText, rawExpanded]);

  const qrVisibleText = useMemo(() => prettyQrPreview(qrRawText || "", 3200), [qrRawText]);

  if (scannerOpen) {
    return (
      <NativeQrScannerSheet
        title="QR-Code scannen"
        subtitle="vCard / MECARD / BIZCARD oder andere Kontaktdaten scannen."
        onClose={() => setScannerOpen(false)}
        onDetected={handleNativeQrDetected}
      />
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
              <ScreenTabs
                current={currentScreen}
                onChange={setCurrentScreen}
                disabled={submitting || Boolean(completedLeadId)}
              />
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
                  if (completedLeadId) return;
                  setActiveCaptureMode(mode);

                  if (mode === "businessCard") void scanBusinessCard();
                  if (mode === "qr") void openQrScanner();
                  if (mode === "contacts") void pickContact();
                  if (mode === "manual") setLastContactSource("MANUAL");
                }}
                disabled={submitting || ocrBusy || scannerOpen || Boolean(completedLeadId)}
              />

              {activeCaptureMode === "businessCard" && (cardUri || ocrBusy || ocrError || ocrRawText) ? (
                <View style={styles.captureReviewBox}>
                  {cardUri ? (
                    <View style={styles.capturePreviewRow}>
                      <Image alt="" source={{ uri: cardUri }} style={styles.cardPreview} contentFit="cover" />

                      <View style={{ flex: 1, gap: 8 }}>
                        <Text style={styles.pStrong}>Scan vorhanden</Text>

                        <View style={{ flexDirection: "row", gap: 10 }}>
                          <Pressable
                            onPress={() => void scanBusinessCard()}
                            disabled={ocrBusy || submitting || Boolean(completedLeadId)}
                            style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                          >
                            <Text style={styles.smallActionBtnDarkText}>{ocrBusy ? "…" : "Neu scannen"}</Text>
                          </Pressable>

                          <Pressable
                            onPress={resetCaptureState}
                            disabled={ocrBusy || submitting || Boolean(completedLeadId)}
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
                      disabled={submitting || scannerOpen || Boolean(completedLeadId)}
                      style={[styles.smallActionBtn, styles.smallActionBtnDark]}
                    >
                      <Text style={styles.smallActionBtnDarkText}>Erneut scannen</Text>
                    </Pressable>

                    <Pressable
                      onPress={() => {
                        resetQrState();
                        setLastContactSource("MANUAL");
                      }}
                      disabled={submitting || scannerOpen || Boolean(completedLeadId)}
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

          {submitInfo ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Hinweis</Text>
              <Text style={styles.infoText}>{submitInfo}</Text>
              {submitTraceId ? <Text style={styles.trace}>traceId: {submitTraceId}</Text> : null}
            </View>
          ) : null}

          {submitError ? (
            <View style={styles.warnInline}>
              <Text style={styles.warnInlineTitle}>Senden fehlgeschlagen</Text>
              <Text style={styles.warnInlineText}>{submitError}</Text>
              {submitTraceId ? <Text style={styles.trace}>traceId: {submitTraceId}</Text> : null}
            </View>
          ) : null}

          <View style={styles.footerCard}>
            {completedLeadId ? (
              <View style={{ flexDirection: "row", gap: 10 }}>
                <Pressable onPress={resetAll} style={styles.submitBtn}>
                  <Text style={styles.submitBtnText}>Neuer Lead</Text>
                </Pressable>

                <Pressable onPress={goList} style={styles.backBtn}>
                  <Text style={styles.backBtnText}>Zur Liste</Text>
                </Pressable>
              </View>
            ) : !isFinalStep ? (
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
                  <Text style={styles.submitBtnText}>
                    {submitting ? `${submitStage || "Sende"}…` : submitLabel}
                  </Text>
                </Pressable>
              </View>
            )}

            <Text style={styles.pMuted}>
              {completedLeadId
                ? "Der aktuelle Lead ist bereits gespeichert. Bitte mit «Neuer Lead» weiterfahren."
                : currentScreen === "CONTACT"
                  ? "Kontaktdaten"
                  : "Individuelle Formularfelder"}
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
    gap: 10,
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

  inlineMediaCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: UI.border,
    backgroundColor: "rgba(0,0,0,0.02)",
    padding: 12,
    gap: 12,
  },
  inlineMediaHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  inlineMediaTitle: { fontWeight: "900", color: UI.text },
  inlineMediaMeta: { marginTop: 2, color: UI.text, opacity: 0.7, lineHeight: 18 },
  inlineMediaEmpty: { gap: 10 },

  voiceRecordingBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  voiceRecordingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  recordingDot: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: UI.accent,
  },
  voiceTimer: { fontWeight: "900", color: UI.text, fontSize: 18 },

  voicePreviewBox: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 10,
  },
  voiceProgressWrap: {
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.04)",
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  voiceProgressText: { fontWeight: "800", color: UI.text, opacity: 0.75 },

  inlineActionsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  attachmentActionsWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  attachmentActionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  attachmentActionBtnDark: { backgroundColor: UI.text },
  attachmentActionBtnDarkText: { color: "white", fontWeight: "900" },
  attachmentActionBtnGhost: {
    backgroundColor: "rgba(17,24,39,0.06)",
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
  },
  attachmentActionBtnGhostText: { color: UI.text, fontWeight: "900" },

  attachmentList: { gap: 10 },
  attachmentRow: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.06)",
    backgroundColor: "#ffffff",
    padding: 12,
    gap: 8,
  },
  attachmentName: { fontWeight: "900", color: UI.text },
  attachmentMeta: { color: UI.text, opacity: 0.7, fontWeight: "700" },
  attachmentRowActions: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexWrap: "wrap",
  },

  statusPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: "rgba(0,0,0,0.08)",
    backgroundColor: "rgba(0,0,0,0.03)",
  },
  statusPillAccent: {
    backgroundColor: UI.accent,
    borderColor: UI.accent,
  },
  statusPillSuccess: {
    backgroundColor: UI.text,
    borderColor: UI.text,
  },
  statusPillError: {
    backgroundColor: "rgba(220,38,38,0.06)",
    borderColor: "rgba(220,38,38,0.18)",
  },
  statusPillText: { fontWeight: "900", color: UI.text, opacity: 0.75, fontSize: 12 },
  statusPillTextInverted: { color: "white", opacity: 1 },
  statusPillTextError: { color: "rgba(153,27,27,0.95)", opacity: 1 },

  errText: { marginTop: 8, fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  errTextCompact: { marginTop: 2, fontWeight: "800", fontSize: 12, color: "rgba(153,27,27,0.95)" },

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
  warnInlineCompact: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "rgba(220,38,38,0.18)",
    backgroundColor: "rgba(220,38,38,0.04)",
  },
  warnInlineTitle: { fontWeight: "900", color: "rgba(153,27,27,0.95)" },
  warnInlineText: { marginTop: 6, color: "rgba(153,27,27,0.95)" },

  infoCard: {
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: "rgba(217,119,6,0.22)",
    backgroundColor: "rgba(217,119,6,0.06)",
  },
  infoTitle: { fontWeight: "900", color: "rgba(146,64,14,0.95)" },
  infoText: { marginTop: 6, color: "rgba(146,64,14,0.95)" },

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
  pMutedCompact: { color: UI.text, opacity: 0.7, lineHeight: 18 },

  footerCard: {
    backgroundColor: UI.bg,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: UI.border,
    gap: 10,
  },

  submitBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: "center", backgroundColor: UI.text },
  backBtn: {
    width: 110,
    paddingVertical: 14,
    borderRadius: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: UI.border,
  },
  backBtnText: { fontWeight: "900", color: UI.text, opacity: 0.75 },

  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "white", fontWeight: "900" },
});
