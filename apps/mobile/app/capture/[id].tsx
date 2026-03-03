import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

import { apiFetch, createLead, patchLeadContact, storeAttachmentOcrResult, uploadLeadAttachment } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { uuidV4 } from "../../src/lib/uuid";
import { getActiveEventId } from "../../src/lib/eventStorage";

import { recognizeTextFromBusinessCard } from "../../src/ocr/recognizeText";
import { parseBusinessCard } from "../../src/ocr/parseBusinessCard";
import type { ContactSuggestions } from "../../src/ocr/types";

import { ScreenScaffold } from "../../src/ui/ScreenScaffold";
import { UI } from "../../src/ui/tokens";

type JsonObject = Record<string, unknown>;

function isObject(v: unknown): v is JsonObject {
  return typeof v === "object" && v !== null;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

function asNumber(v: unknown): number | undefined {
  return typeof v === "number" ? v : undefined;
}

type FieldType = "TEXT" | "TEXTAREA" | "EMAIL" | "PHONE" | "CHECKBOX" | "SINGLE_SELECT" | "MULTI_SELECT";

type FieldOption = { label: string; value: string };

type FormField = {
  id?: string;
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  sortOrder: number;
  options: FieldOption[];
};

type FormDetail = {
  id: string;
  name?: string;
  title?: string;
};

function normalizeFieldType(v: unknown): FieldType {
  const t = (typeof v === "string" ? v : "TEXT").toUpperCase();
  const allowed: FieldType[] = ["TEXT", "TEXTAREA", "EMAIL", "PHONE", "CHECKBOX", "SINGLE_SELECT", "MULTI_SELECT"];
  return allowed.includes(t as FieldType) ? (t as FieldType) : "TEXT";
}

function parseOptions(v: unknown): FieldOption[] {
  const raw = isObject(v) && Array.isArray(v.items) ? v.items : v;

  if (Array.isArray(raw)) {
    const out: FieldOption[] = [];
    for (const it of raw) {
      if (typeof it === "string" && it.trim()) out.push({ label: it.trim(), value: it.trim() });
      else if (isObject(it)) {
        const label = asString(it.label) || asString(it.name) || asString(it.value) || "";
        const value = asString(it.value) || asString(it.id) || label;
        if (label.trim() && value.trim()) out.push({ label: label.trim(), value: value.trim() });
      }
    }
    return out;
  }

  return [];
}

function parseField(v: unknown): FormField | null {
  if (!isObject(v)) return null;
  const key = asString(v.key)?.trim();
  if (!key) return null;

  const label = (asString(v.label) || asString(v.name) || key).trim();
  const type = normalizeFieldType(v.type);
  const required = Boolean(v.required);
  const sortOrder = asNumber(v.sortOrder) ?? 0;

  const options = parseOptions(v.options ?? v.choices ?? v.items);

  return { id: asString(v.id), key, label, type, required, sortOrder, options };
}

function parseFormDetail(payload: unknown): { form: FormDetail; fields: FormField[] } | null {
  if (!isObject(payload)) return null;

  const formObj = isObject(payload.form) ? payload.form : payload;
  const id = asString(formObj.id)?.trim();
  if (!id) return null;

  const form: FormDetail = { id, name: asString(formObj.name), title: asString(formObj.title) };

  const fieldsRaw =
    Array.isArray(payload.fields)
      ? payload.fields
      : isObject(payload.form) && Array.isArray((payload.form as JsonObject).fields)
      ? ((payload.form as JsonObject).fields as unknown[])
      : Array.isArray((payload as JsonObject).fields)
      ? ((payload as JsonObject).fields as unknown[])
      : [];

  const fields = fieldsRaw
    .map(parseField)
    .filter((x): x is FormField => x !== null)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return { form, fields };
}

type ValuesMap = Record<string, string | boolean | string[] | null>;

function isEmptyValue(v: string | boolean | string[] | null | undefined): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "boolean") return v === false;
  if (typeof v === "string") return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return true;
}

function validateField(field: FormField, value: ValuesMap[string]): string | null {
  if (field.required && isEmptyValue(value)) return `${field.label}: Pflichtfeld.`;

  if (typeof value === "string") {
    if (field.type === "EMAIL" && value.trim() && !value.includes("@")) return `${field.label}: E-Mail ungültig.`;
    if (field.type === "PHONE" && value.trim() && value.trim().length < 6) return `${field.label}: Telefon zu kurz.`;
  }

  return null;
}

function labelForForm(f: FormDetail): string {
  return (f.name || f.title || f.id).toString();
}

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function pickFieldKey(fields: FormField[], aliases: string[]): string | null {
  const aliasNorm = aliases.map(norm);

  for (const f of fields) {
    const k = norm(f.key);
    if (aliasNorm.includes(k)) return f.key;
  }
  for (const f of fields) {
    const k = norm(f.key);
    if (aliasNorm.some((a) => k.includes(a) || a.includes(k))) return f.key;
  }
  for (const f of fields) {
    const l = norm(f.label);
    if (aliasNorm.some((a) => l.includes(a))) return f.key;
  }
  return null;
}

function applyContactToValues(fields: FormField[], current: ValuesMap, s: ContactSuggestions): ValuesMap {
  const next: ValuesMap = { ...current };

  const map: Array<[keyof ContactSuggestions, string[]]> = [
    ["contactFirstName", ["contactfirstname", "firstname", "vorname", "givenname"]],
    ["contactLastName", ["contactlastname", "lastname", "nachname", "surname", "familyname"]],
    ["contactCompany", ["contactcompany", "company", "firma", "unternehmen"]],
    ["contactTitle", ["contacttitle", "title", "funktion", "position", "jobtitle"]],
    ["contactEmail", ["contactemail", "email", "e-mail", "mail"]],
    ["contactPhone", ["contactphone", "phone", "telefon", "tel", "fon", "direct"]],
    ["contactMobile", ["contactmobile", "mobile", "mobil", "handy", "cell"]],
    ["contactWebsite", ["contactwebsite", "website", "web", "homepage", "url"]],
    ["contactStreet", ["contactstreet", "street", "strasse", "straße"]],
    ["contactZip", ["contactzip", "zip", "plz", "postalcode"]],
    ["contactCity", ["contactcity", "city", "ort", "stadt"]],
    ["contactCountry", ["contactcountry", "country", "land"]],
  ];

  for (const [suggestKey, aliases] of map) {
    const val = s[suggestKey];
    if (!val || !val.trim()) continue;

    const fieldKey = pickFieldKey(fields, aliases);
    if (!fieldKey) continue;

    next[fieldKey] = val.trim();
  }

  return next;
}

function smallHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h) ^ input.charCodeAt(i);
  return `h${(h >>> 0).toString(16)}`;
}

function confirmAsync(title: string, message: string, confirmLabel: string): Promise<boolean> {
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: "Abbrechen", style: "cancel", onPress: () => resolve(false) },
      { text: confirmLabel, style: "default", onPress: () => resolve(true) },
    ]);
  });
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let t: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<T>((_, reject) => {
    t = setTimeout(() => reject(new Error("TIMEOUT")), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    if (t) clearTimeout(t);
  }
}

function seemsWeakText(rawText: string): boolean {
  const txt = (rawText || "").trim();
  if (!txt) return true;
  const alnum = txt.replace(/[^a-zA-Z0-9]/g, "");
  const lines = txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
  if (alnum.length < 28) return true;
  if (lines.length < 2) return true;
  return false;
}

function readError(res: unknown): { status: number; code: string; message: string; traceId: string } {
  const r = isObject(res) ? res : {};
  const status = typeof (r as { status?: unknown }).status === "number" ? (r as { status: number }).status : 0;
  const traceId = typeof (r as { traceId?: unknown }).traceId === "string" ? (r as { traceId: string }).traceId : "";
  const err = isObject((r as { error?: unknown }).error) ? ((r as { error?: unknown }).error as JsonObject) : null;
  const code = err && typeof err.code === "string" ? err.code : "";
  const msgFromErr = err && typeof err.message === "string" ? err.message : "";
  const msgTop = typeof (r as { message?: unknown }).message === "string" ? (r as { message: string }).message : "";
  const message = msgFromErr || msgTop || "Request failed";
  return { status, code, message, traceId };
}

export default function CaptureScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id?: string; eventId?: string }>();

  const formId = (params?.id ?? "").toString().trim();
  const eventIdParam = (params?.eventId ?? "").toString().trim();
  const [eventId, setEventId] = useState<string>(eventIdParam);

  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitStage, setSubmitStage] = useState<string>("");
  const [errorText, setErrorText] = useState<string>("");

  const [form, setForm] = useState<FormDetail | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<ValuesMap>({});

  // OCR / business card state
  const [cardUri, setCardUri] = useState<string>("");
  const [cardMime, setCardMime] = useState<string>("image/jpeg");
  const [cardName, setCardName] = useState<string>("business-card.jpg");

  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string>("");
  const [ocrRawText, setOcrRawText] = useState<string>("");
  const [ocrBlocks, setOcrBlocks] = useState<unknown>(null);
  const [contactDraft, setContactDraft] = useState<ContactSuggestions>({});
  const [contactApplied, setContactApplied] = useState(false);
  const [rawExpanded, setRawExpanded] = useState(false);

  const title = useMemo(() => (form ? labelForForm(form) : "Lead erfassen"), [form]);

  // Ensure eventId: prefer URL param, else read from storage, else go to gate
  useEffect(() => {
    let alive = true;

    (async () => {
      const fromUrl = eventIdParam;
      if (fromUrl) {
        if (alive) setEventId(fromUrl);
        return;
      }

      const stored = await getActiveEventId();
      if (stored && alive) {
        setEventId(stored);
        router.replace(`/forms/${encodeURIComponent(formId)}?eventId=${encodeURIComponent(stored)}`);
        return;
      }

      // No event context => gate
      if (alive) router.replace("/event-gate");
    })();

    return () => {
      alive = false;
    };
  }, [eventIdParam, formId]);

  const resetValues = useCallback(() => {
    const next: ValuesMap = {};
    for (const f of fields) {
      if (f.type === "CHECKBOX") next[f.key] = false;
      else if (f.type === "MULTI_SELECT") next[f.key] = [];
      else next[f.key] = "";
    }
    setValues(next);

    setCardUri("");
    setOcrError("");
    setOcrRawText("");
    setOcrBlocks(null);
    setContactDraft({});
    setContactApplied(false);
    setRawExpanded(false);
  }, [fields]);

  const requireKeyOrRedirect = useCallback(async (): Promise<string | null> => {
    const key = await getApiKey();
    if (!key) {
      router.replace("/provision");
      return null;
    }
    return key;
  }, []);

  const handleUnauthorized = useCallback(async (traceId?: string) => {
    await clearApiKey();
    const suffix = traceId ? ` (traceId: ${traceId})` : "";
    Alert.alert("Gerät nicht autorisiert", `Bitte neu aktivieren.${suffix}`);
    router.replace("/provision");
  }, []);

  const load = useCallback(async () => {
    setErrorText("");

    if (!formId) {
      setErrorText("Ungültige Form-ID.");
      return;
    }

    const eid = (eventId || "").trim();
    if (!eid) {
      router.replace("/event-gate");
      return;
    }

    setBusy(true);
    try {
      const key = await requireKeyOrRedirect();
      if (!key) return;

      const res = await apiFetch({
        method: "GET",
        path: `/api/mobile/v1/forms/${encodeURIComponent(formId)}?eventId=${encodeURIComponent(eid)}`,
        apiKey: key,
      });

      if (!isObject(res) || typeof (res as { ok?: unknown }).ok !== "boolean") {
        setErrorText("Invalid API response shape");
        return;
      }

      if ((res as { ok: boolean }).ok !== true) {
        const { status, code, message, traceId } = readError(res);

        if (status === 401 || code === "INVALID_API_KEY") {
          await handleUnauthorized(traceId || undefined);
          return;
        }

        if (status === 402 || code === "PAYMENT_REQUIRED") {
          router.replace("/license");
          return;
        }

        // If event is no longer active or not found => back to event gate
        if (code === "EVENT_NOT_ACTIVE" || code === "NOT_FOUND") {
          router.replace("/event-gate");
          return;
        }

        setErrorText(`HTTP ${status || "?"} — ${message}${traceId ? ` (traceId: ${traceId})` : ""}`);
        return;
      }

      const parsed = parseFormDetail((res as { data?: unknown }).data);
      if (!parsed) {
        setErrorText("Form-Response konnte nicht gelesen werden.");
        return;
      }

      setForm(parsed.form);
      setFields(parsed.fields);

      const next: ValuesMap = {};
      for (const f of parsed.fields) {
        if (f.type === "CHECKBOX") next[f.key] = false;
        else if (f.type === "MULTI_SELECT") next[f.key] = [];
        else next[f.key] = "";
      }
      setValues(next);
    } finally {
      setBusy(false);
    }
  }, [eventId, formId, handleUnauthorized, requireKeyOrRedirect]);

  useEffect(() => {
    void load();
  }, [load]);

  const setValue = useCallback((key: string, v: ValuesMap[string]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
  }, []);

  const toggleMulti = useCallback((key: string, optionValue: string) => {
    setValues((prev) => {
      const cur = prev[key];
      const arr = Array.isArray(cur) ? cur.slice() : [];
      const idx = arr.indexOf(optionValue);
      if (idx >= 0) arr.splice(idx, 1);
      else arr.push(optionValue);
      return { ...prev, [key]: arr };
    });
  }, []);

  const scanBusinessCard = useCallback(async () => {
    setOcrError("");

    if (Platform.OS === "web") {
      Alert.alert("Nicht verfügbar", "Visitenkarten-Scan ist auf Web nicht verfügbar.");
      return;
    }

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

      const ocr = await withTimeout(recognizeTextFromBusinessCard({ imagePath: fileUri }), 12000);
      const parsed = parseBusinessCard({ rawText: ocr.rawText, blocks: ocr.blocks });

      setCardUri(fileUri);
      setCardMime("image/jpeg");
      setCardName(fileName);

      setOcrRawText(ocr.rawText || "");
      setOcrBlocks(ocr.blocks || null);

      setContactDraft(parsed.suggestions || {});
      setContactApplied(false);
      setRawExpanded(false);

      if (seemsWeakText(ocr.rawText || "")) {
        setOcrError("Wir konnten kaum Text erkennen. Bitte näher ran und ruhig halten.");
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "OCR fehlgeschlagen.";
      if (msg === "TIMEOUT") setOcrError("Das Lesen dauert zu lange. Bitte nochmals versuchen.");
      else setOcrError(msg || "OCR fehlgeschlagen.");
    } finally {
      setOcrBusy(false);
    }
  }, []);

  const applyContact = useCallback(() => {
    const next = applyContactToValues(fields, values, contactDraft);
    setValues(next);
    setContactApplied(true);
  }, [contactDraft, fields, values]);

  const onSubmit = useCallback(async () => {
    setErrorText("");

    if (!formId) {
      setErrorText("Ungültige Form-ID.");
      return;
    }

    const problems: string[] = [];
    for (const f of fields) {
      const msg = validateField(f, values[f.key] ?? null);
      if (msg) problems.push(msg);
    }

    if (problems.length) {
      Alert.alert("Bitte prüfen", problems.slice(0, 6).join("\n"));
      return;
    }

    if (cardUri && !contactApplied) {
      const ok = await confirmAsync(
        "Kontakt noch nicht übernommen",
        "Du hast eine Visitenkarte gescannt, aber die Kontaktfelder noch nicht übernommen. Trotzdem senden?",
        "Trotzdem senden"
      );
      if (!ok) return;
    }

    setSubmitBusy(true);
    setSubmitStage("Lead");
    try {
      const key = await requireKeyOrRedirect();
      if (!key) return;

      const payload = {
        clientLeadId: uuidV4(),
        formId,
        capturedAt: new Date().toISOString(),
        values,
      };

      const leadRes = await createLead({ apiKey: key, payload });
      if (!leadRes.ok) {
        if (leadRes.status === 401) {
          await handleUnauthorized(leadRes.traceId);
          return;
        }
        Alert.alert(
          "Fehler",
          `Konnte nicht gespeichert werden.\n${leadRes.message}${leadRes.traceId ? `\ntraceId: ${leadRes.traceId}` : ""}`
        );
        return;
      }

      const leadId = leadRes.data.leadId;

      if (cardUri) {
        setSubmitStage("Attachment");

        const attRes = await uploadLeadAttachment({
          apiKey: key,
          leadId,
          fileUri: cardUri,
          mimeType: cardMime,
          fileName: cardName,
        });

        if (!attRes.ok) {
          if (attRes.status === 401) {
            await handleUnauthorized(attRes.traceId);
            return;
          }
          Alert.alert(
            "Fehler",
            `Attachment Upload fehlgeschlagen.\n${attRes.message}${attRes.traceId ? `\ntraceId: ${attRes.traceId}` : ""}`
          );
          return;
        }

        const attachmentId = attRes.data.attachmentId;

        setSubmitStage("OCR");

        const resultHash = smallHash((ocrRawText || "") + "|" + JSON.stringify(contactDraft || {}));

        const ocrStoreRes = await storeAttachmentOcrResult({
          apiKey: key,
          attachmentId,
          payload: {
            engine: "MLKIT",
            engineVersion: "@infinitered/react-native-mlkit-text-recognition@5.x",
            mode: "PHOTO",
            resultHash,
            rawText: ocrRawText || "",
            blocksJson: ocrBlocks || null,
            suggestions: contactDraft || {},
          },
        });

        if (!ocrStoreRes.ok) {
          if (ocrStoreRes.status === 401) {
            await handleUnauthorized(ocrStoreRes.traceId);
            return;
          }
          Alert.alert(
            "Fehler",
            `OCR speichern fehlgeschlagen.\n${ocrStoreRes.message}${ocrStoreRes.traceId ? `\ntraceId: ${ocrStoreRes.traceId}` : ""}`
          );
          return;
        }

        const ocrResultId = ocrStoreRes.data.ocrResultId;

        setSubmitStage("Kontakt");

        const contactRes = await patchLeadContact({
          apiKey: key,
          leadId,
          payload: {
            contactSource: "OCR_MOBILE",
            contactOcrResultId: ocrResultId,
            ...contactDraft,
          },
        });

        if (!contactRes.ok) {
          if (contactRes.status === 401) {
            await handleUnauthorized(contactRes.traceId);
            return;
          }
          Alert.alert(
            "Fehler",
            `Kontakt setzen fehlgeschlagen.\n${contactRes.message}${contactRes.traceId ? `\ntraceId: ${contactRes.traceId}` : ""}`
          );
          return;
        }
      }

      Alert.alert("OK", "Gespeichert.");
      resetValues();
    } finally {
      setSubmitBusy(false);
      setSubmitStage("");
    }
  }, [
    cardMime,
    cardName,
    cardUri,
    contactApplied,
    contactDraft,
    fields,
    formId,
    handleUnauthorized,
    ocrBlocks,
    ocrRawText,
    requireKeyOrRedirect,
    resetValues,
    values,
  ]);

  const rawPreview = useMemo(() => {
    const txt = (ocrRawText || "").trim();
    if (!txt) return "";
    const lines = txt.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (rawExpanded) return lines.join("\n");
    return lines.slice(0, 6).join("\n");
  }, [ocrRawText, rawExpanded]);

  const hasOcr = Boolean((ocrRawText || "").trim());

  const contactInputs: Array<{ key: keyof ContactSuggestions; label: string; placeholder?: string }> = [
    { key: "contactFirstName", label: "Vorname" },
    { key: "contactLastName", label: "Nachname" },
    { key: "contactCompany", label: "Firma" },
    { key: "contactTitle", label: "Funktion" },
    { key: "contactEmail", label: "E-Mail", placeholder: "name@firma.ch" },
    { key: "contactPhone", label: "Telefon", placeholder: "+41 ..." },
    { key: "contactMobile", label: "Mobile", placeholder: "+41 ..." },
    { key: "contactWebsite", label: "Website", placeholder: "https://..." },
    { key: "contactStreet", label: "Strasse" },
    { key: "contactZip", label: "PLZ" },
    { key: "contactCity", label: "Ort" },
    { key: "contactCountry", label: "Land" },
  ];

  const padBottom = 24 + UI.tabBarBaseHeight + Math.max(insets.bottom, 0);

  return (
    <ScreenScaffold title={title} scroll={false}>
      {errorText ? (
        <View style={{ paddingHorizontal: UI.padX, paddingTop: 14 }}>
          <View
            style={{
              padding: 12,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: "rgba(220,38,38,0.25)",
              backgroundColor: "rgba(220,38,38,0.06)",
            }}
          >
            <Text style={{ fontWeight: "900", color: "rgba(153,27,27,0.95)" }}>Hinweis</Text>
            <Text style={{ color: "rgba(153,27,27,0.95)", marginTop: 6 }}>{errorText}</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={load}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: UI.text, alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "…" : "Retry"}</Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/forms")}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 12,
                  backgroundColor: "rgba(17,24,39,0.06)",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontWeight: "900", color: UI.text }}>Zur Liste</Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => router.replace("/event-gate")}
              style={{
                marginTop: 10,
                paddingVertical: 10,
                borderRadius: 12,
                backgroundColor: "rgba(17,24,39,0.06)",
                alignItems: "center",
              }}
            >
              <Text style={{ fontWeight: "900", color: UI.text }}>Event wählen</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: UI.padX,
          paddingTop: 14,
          paddingBottom: padBottom,
          gap: 12,
        }}
      >
        {/* Business card scan section */}
        <View style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.bg, gap: 10 }}>
          <Text style={{ fontWeight: "900", color: UI.text }}>Visitenkarte</Text>

          {cardUri ? (
            <View style={{ flexDirection: "row", gap: 12, alignItems: "center" }}>
              <Image
                alt=""
                source={{ uri: cardUri }}
                style={{ width: 70, height: 70, borderRadius: 12, borderWidth: 1, borderColor: UI.border }}
                contentFit="cover"
              />
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={{ fontWeight: "900", color: UI.text }}>Scan vorhanden</Text>

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <Pressable
                    onPress={scanBusinessCard}
                    disabled={ocrBusy || submitBusy}
                    style={{
                      paddingVertical: 9,
                      paddingHorizontal: 12,
                      borderRadius: 12,
                      backgroundColor: ocrBusy || submitBusy ? "rgba(17,24,39,0.35)" : UI.text,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "900" }}>{ocrBusy ? "Einen Moment …" : "Neu aufnehmen"}</Text>
                  </Pressable>

                  <Pressable
                    onPress={() => {
                      setCardUri("");
                      setOcrError("");
                      setOcrRawText("");
                      setOcrBlocks(null);
                      setContactDraft({});
                      setContactApplied(false);
                      setRawExpanded(false);
                    }}
                    disabled={ocrBusy || submitBusy}
                    style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "rgba(17,24,39,0.06)" }}
                  >
                    <Text style={{ fontWeight: "900", color: UI.text }}>Entfernen</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : (
            <Pressable
              onPress={scanBusinessCard}
              disabled={ocrBusy || submitBusy}
              style={{
                paddingVertical: 12,
                borderRadius: 12,
                backgroundColor: ocrBusy || submitBusy ? "rgba(17,24,39,0.35)" : UI.text,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "white", fontWeight: "900" }}>{ocrBusy ? "Einen Moment …" : "Foto aufnehmen"}</Text>
            </Pressable>
          )}

          {!cardUri ? (
            <Text style={{ color: "rgba(17,24,39,0.55)", fontWeight: "700" }}>
              Tipp: Gutes Licht. Karte möglichst gross im Bild und kurz ruhig halten.
            </Text>
          ) : null}

          {ocrBusy ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 4 }}>
              <ActivityIndicator />
              <Text style={{ color: "rgba(17,24,39,0.55)", fontWeight: "700" }}>Wir lesen den Text.</Text>
            </View>
          ) : null}

          {ocrError ? (
            <View style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: "rgba(220,38,38,0.25)", backgroundColor: "rgba(220,38,38,0.06)" }}>
              <Text style={{ fontWeight: "900", color: "rgba(153,27,27,0.95)" }}>Hinweis</Text>
              <Text style={{ color: "rgba(153,27,27,0.95)", marginTop: 6 }}>{ocrError}</Text>
            </View>
          ) : null}

          {hasOcr ? (
            <View style={{ gap: 10 }}>
              <View style={{ padding: 10, borderRadius: 12, borderWidth: 1, borderColor: UI.border, backgroundColor: "rgba(17,24,39,0.03)" }}>
                <Text style={{ fontWeight: "900", marginBottom: 6, color: UI.text }}>Erkannter Text</Text>
                <Text style={{ fontFamily: "monospace", opacity: 0.85, lineHeight: 18, color: UI.text }}>{rawPreview || "—"}</Text>
                <Pressable onPress={() => setRawExpanded((p) => !p)} style={{ marginTop: 8 }}>
                  <Text style={{ fontWeight: "900", color: UI.text }}>{rawExpanded ? "Weniger" : "Mehr"}</Text>
                </Pressable>
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontWeight: "900", color: UI.text }}>Kontaktvorschlag</Text>

                {contactInputs.map((it) => (
                  <View key={it.key} style={{ gap: 6 }}>
                    <Text style={{ fontWeight: "900", opacity: 0.9, color: UI.text }}>{it.label}</Text>
                    <TextInput
                      value={(contactDraft[it.key] || "").toString()}
                      onChangeText={(t) => setContactDraft((prev) => ({ ...prev, [it.key]: t }))}
                      autoCapitalize={it.key === "contactEmail" || it.key === "contactWebsite" ? "none" : "words"}
                      autoCorrect={false}
                      keyboardType={
                        it.key === "contactEmail"
                          ? "email-address"
                          : it.key === "contactPhone" || it.key === "contactMobile"
                          ? "phone-pad"
                          : "default"
                      }
                      placeholder={it.placeholder || ""}
                      style={{
                        borderWidth: 1,
                        borderColor: UI.border,
                        borderRadius: 12,
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: UI.bg,
                        color: UI.text,
                      }}
                    />
                  </View>
                ))}

                <Pressable
                  onPress={applyContact}
                  disabled={submitBusy || ocrBusy}
                  style={{
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: submitBusy || ocrBusy ? "rgba(17,24,39,0.35)" : UI.text,
                    alignItems: "center",
                    marginTop: 4,
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900" }}>{contactApplied ? "Übernommen ✓" : "Kontakt übernehmen"}</Text>
                </Pressable>

                <Pressable
                  onPress={scanBusinessCard}
                  disabled={submitBusy || ocrBusy}
                  style={{
                    paddingVertical: 12,
                    borderRadius: 12,
                    backgroundColor: "rgba(17,24,39,0.06)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontWeight: "900", color: UI.text }}>Neu aufnehmen</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </View>

        {/* Dynamic form fields */}
        {fields.map((f) => {
          const v = values[f.key] ?? (f.type === "CHECKBOX" ? false : f.type === "MULTI_SELECT" ? [] : "");

          return (
            <View key={f.key} style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: UI.border, backgroundColor: UI.bg, gap: 8 }}>
              <Text style={{ fontWeight: "900", color: UI.text }}>
                {f.label} {f.required ? <Text style={{ color: UI.accent }}>*</Text> : null}
              </Text>

              {f.type === "TEXT" || f.type === "EMAIL" || f.type === "PHONE" ? (
                <TextInput
                  value={typeof v === "string" ? v : ""}
                  onChangeText={(t) => setValue(f.key, t)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={f.type === "EMAIL" ? "email-address" : f.type === "PHONE" ? "phone-pad" : "default"}
                  placeholder={f.type === "EMAIL" ? "name@firma.ch" : f.type === "PHONE" ? "+41 ..." : ""}
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    backgroundColor: UI.bg,
                    color: UI.text,
                  }}
                />
              ) : null}

              {f.type === "TEXTAREA" ? (
                <TextInput
                  value={typeof v === "string" ? v : ""}
                  onChangeText={(t) => setValue(f.key, t)}
                  multiline
                  numberOfLines={4}
                  style={{
                    borderWidth: 1,
                    borderColor: UI.border,
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 100,
                    textAlignVertical: "top",
                    backgroundColor: UI.bg,
                    color: UI.text,
                  }}
                />
              ) : null}

              {f.type === "CHECKBOX" ? (
                <Pressable
                  onPress={() => setValue(f.key, !(typeof v === "boolean" ? v : false))}
                  style={{
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: (typeof v === "boolean" ? v : false) ? UI.text : "rgba(17,24,39,0.06)",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: (typeof v === "boolean" ? v : false) ? "white" : UI.text, fontWeight: "900" }}>
                    {(typeof v === "boolean" ? v : false) ? "Ja" : "Nein"}
                  </Text>
                </Pressable>
              ) : null}

              {f.type === "SINGLE_SELECT" ? (
                <View style={{ gap: 8 }}>
                  {f.options.map((opt) => {
                    const selected = typeof v === "string" && v === opt.value;
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => setValue(f.key, opt.value)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: selected ? UI.text : UI.border,
                          backgroundColor: selected ? UI.text : UI.bg,
                        }}
                      >
                        <Text style={{ color: selected ? "white" : UI.text, fontWeight: "900" }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}

              {f.type === "MULTI_SELECT" ? (
                <View style={{ gap: 8 }}>
                  {f.options.map((opt) => {
                    const arr = Array.isArray(v) ? v : [];
                    const selected = arr.includes(opt.value);
                    return (
                      <Pressable
                        key={opt.value}
                        onPress={() => toggleMulti(f.key, opt.value)}
                        style={{
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: selected ? UI.text : UI.border,
                          backgroundColor: selected ? UI.text : UI.bg,
                        }}
                      >
                        <Text style={{ color: selected ? "white" : UI.text, fontWeight: "900" }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
          <Pressable
            disabled={submitBusy || busy}
            onPress={onSubmit}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: submitBusy || busy ? "rgba(17,24,39,0.35)" : UI.text,
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>
              {submitBusy ? (submitStage ? `${submitStage}…` : "Sende…") : "Lead senden"}
            </Text>
          </Pressable>

          <Pressable
            disabled={submitBusy || busy}
            onPress={resetValues}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "rgba(17,24,39,0.06)",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900", color: UI.text }}>Nächster Lead</Text>
          </Pressable>
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}
