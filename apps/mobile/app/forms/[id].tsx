import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";

import { apiFetch } from "../../src/lib/api";
import { clearApiKey, getApiKey } from "../../src/lib/auth";
import { uuidV4 } from "../../src/lib/uuid";

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

type FieldType =
  | "TEXT"
  | "TEXTAREA"
  | "EMAIL"
  | "PHONE"
  | "CHECKBOX"
  | "SINGLE_SELECT"
  | "MULTI_SELECT";

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
  return (allowed.includes(t as FieldType) ? (t as FieldType) : "TEXT");
}

function parseOptions(v: unknown): FieldOption[] {
  // Accept shapes:
  // - [{label, value}]
  // - ["A","B"]
  // - { items: [...] }
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

  return {
    id: asString(v.id),
    key,
    label,
    type,
    required,
    sortOrder,
    options,
  };
}

function parseFormDetail(payload: unknown): { form: FormDetail; fields: FormField[] } | null {
  // Accept shapes:
  // A) { form: {...}, fields: [...] }
  // B) { id, name/title, fields: [...] }
  // C) { data: ... } already handled by apiFetch, but keep defensive

  if (!isObject(payload)) return null;

  const formObj = isObject(payload.form) ? payload.form : payload;
  const id = asString(formObj.id)?.trim();
  if (!id) return null;

  const form: FormDetail = {
    id,
    name: asString(formObj.name),
    title: asString(formObj.title),
  };

  const fieldsRaw =
    Array.isArray(payload.fields) ? payload.fields :
    isObject(payload.form) && Array.isArray((payload.form as JsonObject).fields) ? ((payload.form as JsonObject).fields as unknown[]) :
    Array.isArray((payload as JsonObject).fields) ? ((payload as JsonObject).fields as unknown[]) :
    [];

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

export default function CaptureScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const formId = (params?.id ?? "").toString().trim();

  const [busy, setBusy] = useState(false);
  const [submitBusy, setSubmitBusy] = useState(false);
  const [errorText, setErrorText] = useState<string>("");
  const [form, setForm] = useState<FormDetail | null>(null);
  const [fields, setFields] = useState<FormField[]>([]);
  const [values, setValues] = useState<ValuesMap>({});

  const title = useMemo(() => (form ? labelForForm(form) : "Lead erfassen"), [form]);

  const resetValues = useCallback(() => {
    const next: ValuesMap = {};
    for (const f of fields) {
      if (f.type === "CHECKBOX") next[f.key] = false;
      else if (f.type === "MULTI_SELECT") next[f.key] = [];
      else next[f.key] = "";
    }
    setValues(next);
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

    setBusy(true);
    try {
      const key = await requireKeyOrRedirect();
      if (!key) return;

      const res = await apiFetch<unknown>({
        method: "GET",
        path: `/api/mobile/v1/forms/${encodeURIComponent(formId)}`,
        apiKey: key,
      });

      if (!res.ok) {
        if (res.status === 401) {
          await handleUnauthorized(res.traceId);
          return;
        }
        setErrorText(`HTTP ${res.status} — ${res.message}${res.traceId ? ` (traceId: ${res.traceId})` : ""}`);
        return;
      }

      const parsed = parseFormDetail(res.data);
      if (!parsed) {
        setErrorText("Form-Response konnte nicht gelesen werden.");
        return;
      }

      setForm(parsed.form);
      setFields(parsed.fields);

      // init values once fields are known
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
  }, [formId, handleUnauthorized, requireKeyOrRedirect]);

  useEffect(() => {
    load();
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

  const onSubmit = useCallback(async () => {
    setErrorText("");

    if (!formId) {
      setErrorText("Ungültige Form-ID.");
      return;
    }

    // Validate
    const problems: string[] = [];
    for (const f of fields) {
      const msg = validateField(f, values[f.key] ?? null);
      if (msg) problems.push(msg);
    }

    if (problems.length) {
      Alert.alert("Bitte prüfen", problems.slice(0, 6).join("\n"));
      return;
    }

    setSubmitBusy(true);
    try {
      const key = await requireKeyOrRedirect();
      if (!key) return;

      const payload = {
        clientLeadId: uuidV4(),
        formId,
        capturedAt: new Date().toISOString(),
        values,
      };

      const res = await apiFetch<unknown>({
        method: "POST",
        path: "/api/mobile/v1/leads",
        apiKey: key,
        body: payload,
      });

      if (!res.ok) {
        if (res.status === 401) {
          await handleUnauthorized(res.traceId);
          return;
        }
        Alert.alert("Fehler", `Lead konnte nicht gesendet werden.\n${res.message}${res.traceId ? `\ntraceId: ${res.traceId}` : ""}`);
        return;
      }

      Alert.alert("OK", "Lead gespeichert.");
    } finally {
      setSubmitBusy(false);
    }
  }, [fields, formId, handleUnauthorized, requireKeyOrRedirect, values]);

  return (
    <View style={{ flex: 1 }}>
      <View style={{ padding: 16, gap: 8 }}>
        <Text style={{ fontSize: 22, fontWeight: "900" }}>{title}</Text>

        {errorText ? (
          <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#FCA5A5", backgroundColor: "#FEF2F2" }}>
            <Text style={{ fontWeight: "900", color: "#991B1B" }}>Hinweis</Text>
            <Text style={{ color: "#991B1B", marginTop: 6 }}>{errorText}</Text>

            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <Pressable
                onPress={load}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" }}
              >
                <Text style={{ color: "white", fontWeight: "900" }}>{busy ? "…" : "Retry"}</Text>
              </Pressable>

              <Pressable
                onPress={() => router.replace("/forms")}
                style={{ flex: 1, paddingVertical: 10, borderRadius: 12, backgroundColor: "#F3F4F6", alignItems: "center" }}
              >
                <Text style={{ fontWeight: "900" }}>Zur Liste</Text>
              </Pressable>
            </View>
          </View>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 12 }}>
        {fields.map((f) => {
          const v = values[f.key] ?? (f.type === "CHECKBOX" ? false : f.type === "MULTI_SELECT" ? [] : "");

          return (
            <View key={f.key} style={{ padding: 12, borderRadius: 14, borderWidth: 1, borderColor: "#E5E7EB", backgroundColor: "white", gap: 8 }}>
              <Text style={{ fontWeight: "900" }}>
                {f.label} {f.required ? <Text style={{ color: "#DC2626" }}>*</Text> : null}
              </Text>

              {(f.type === "TEXT" || f.type === "EMAIL" || f.type === "PHONE") ? (
                <TextInput
                  value={typeof v === "string" ? v : ""}
                  onChangeText={(t) => setValue(f.key, t)}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType={f.type === "EMAIL" ? "email-address" : f.type === "PHONE" ? "phone-pad" : "default"}
                  placeholder={f.type === "EMAIL" ? "name@firma.ch" : f.type === "PHONE" ? "+41 ..." : ""}
                  style={{
                    borderWidth: 1,
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
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
                    borderColor: "#E5E7EB",
                    borderRadius: 12,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    minHeight: 100,
                    textAlignVertical: "top",
                  }}
                />
              ) : null}

              {f.type === "CHECKBOX" ? (
                <Pressable
                  onPress={() => setValue(f.key, !(typeof v === "boolean" ? v : false))}
                  style={{
                    paddingVertical: 10,
                    borderRadius: 12,
                    backgroundColor: (typeof v === "boolean" ? v : false) ? "#111827" : "#F3F4F6",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: (typeof v === "boolean" ? v : false) ? "white" : "#111827", fontWeight: "900" }}>
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
                          borderColor: selected ? "#111827" : "#E5E7EB",
                          backgroundColor: selected ? "#111827" : "white",
                        }}
                      >
                        <Text style={{ color: selected ? "white" : "#111827", fontWeight: "800" }}>{opt.label}</Text>
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
                          borderColor: selected ? "#111827" : "#E5E7EB",
                          backgroundColor: selected ? "#111827" : "white",
                        }}
                      >
                        <Text style={{ color: selected ? "white" : "#111827", fontWeight: "800" }}>{opt.label}</Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
            </View>
          );
        })}

        <View style={{ flexDirection: "row", gap: 10, marginTop: 6, marginBottom: 24 }}>
          <Pressable
            disabled={submitBusy || busy}
            onPress={onSubmit}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: submitBusy || busy ? "#9CA3AF" : "#111827",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "white", fontWeight: "900" }}>{submitBusy ? "Sende…" : "Lead senden"}</Text>
          </Pressable>

          <Pressable
            disabled={submitBusy || busy}
            onPress={resetValues}
            style={{
              flex: 1,
              paddingVertical: 12,
              borderRadius: 12,
              backgroundColor: "#F3F4F6",
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Nächster Lead</Text>
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}
